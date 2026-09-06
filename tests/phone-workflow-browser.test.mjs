import assert from 'node:assert/strict';
import test from 'node:test';
import {getExportAttemptSizes} from '../app/cover/core/export-core.ts';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createServer as createViteServer} from 'vite';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

// Exercise the same phone journey against both owners, including actual exports.
test('手机工作流：模式、五个入口、对象调整、取消、Live 与原画质导出', {timeout:120000}, async t=>{
  if(!available){t.skip('需要本机 Chrome');return;}
  const root=resolve('docs');
  const server=createServer(async(req,res)=>{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const vite=await createViteServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});await vite.listen();
  const browser=await chromium.launch({executablePath,headless:true});await mkdir('outputs/phone-workflow',{recursive:true});
  try{
    for(const shell of process.env.NBO_PHONE_URL?['static']:['static','react']){
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});page.setDefaultTimeout(8000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000));window.showSaveFilePicker=undefined;});
      await page.goto(process.env.NBO_PHONE_URL||(shell==='static'?`http://127.0.0.1:${server.address().port}/cover.html`:`http://127.0.0.1:${vite.httpServer.address().port}/tests/fixtures/cover-live.html`));
      const phone=page.locator('.phone-root'),tap=async(name)=>{await phone.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
      await phone.getByRole('button',{name:'普通封面',exact:true}).waitFor({state:'visible'});
      await page.screenshot({path:`outputs/phone-workflow/${shell}-start.png`});
      await tap('前后对比');await phone.getByRole('button',{name:'添加素颜照',exact:true}).waitFor({state:'visible'});
      const photo={name:'phone-check.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#6f9293';x.fillRect(0,0,600,900);x.fillStyle='#c4ab81';x.fillRect(150,100,300,650);return c.toDataURL().split(',')[1];}),'base64')};
      // Trigger the visible choices, then fulfill the native picker (no hidden-control shortcuts).
      let picker=page.waitForEvent('filechooser');await tap('添加精修照');await (await picker).setFiles(photo);
      picker=page.waitForEvent('filechooser');await tap('添加素颜照');await (await picker).setFiles(photo);
      await tap('开始编辑');
      const canvas=page.locator('#coverCanvas,.studio-canvas-shell canvas');
      for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(100);
        assert.deepEqual(await phone.locator('.phone-main-actions button').allTextContents(),['换图','文案','排版','调整','更多']);
        const m=await page.evaluate(()=>{
          const c=document.querySelector('#coverCanvas,.studio-canvas-shell canvas');const r=c.getBoundingClientRect();
          return {ratio:r.width/r.height,intrinsic:c.width/c.height,overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('.phone-main-actions button')].map(b=>b.getBoundingClientRect().toJSON()),canvas:r.toJSON()};
        });
        assert.ok(Math.abs(m.ratio-m.intrinsic)<.001,`${shell} ${width} 预览不能拉伸`);
        assert.ok(m.overflow<=1,`${shell} ${width} 横向不能溢出`);
        for(const b of m.buttons)assert.ok(b.x>=0&&b.right<=width&&b.bottom<=height&&b.height>=44,`${shell} ${width} 五个入口一屏可点`);
        assert.ok(m.canvas.height>150&&m.canvas.bottom<m.buttons[0].y,`${shell} 完整预览与按钮不重叠`);
        await page.screenshot({path:`outputs/phone-workflow/${shell}-home-${width}.png`});
      }
      await page.setViewportSize({width:390,height:844});
      // Canvas hit testing exposes the same editors as the five explicit actions.
      let rect=await canvas.boundingBox();await page.touchscreen.tap(rect.x+rect.width*.2,rect.y+rect.height*.53);
      await phone.getByRole('textbox',{name:'上行主标题',exact:true}).waitFor();
      const first=phone.getByRole('textbox',{name:'上行主标题',exact:true});const original=await first.inputValue();
      assert.equal(await phone.getByRole('textbox').count(),3,'三行文字一起呈现');
      await first.fill('手机测试');await tap('取消');await tap('文案');assert.equal(await first.inputValue(),original,'取消还原当前文案');
      await first.fill('手机文案');await tap('完成');await tap('文案');assert.equal(await first.inputValue(),'手机文案','完成保留编辑');
      await page.screenshot({path:`outputs/phone-workflow/${shell}-text.png`});
      await first.focus();
      await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:430});visualViewport.dispatchEvent(new Event('resize'));});
      await page.waitForTimeout(100);
      const kb=await phone.getByRole('textbox').evaluateAll(inputs=>inputs.map(i=>i.getBoundingClientRect().toJSON()));
      assert.ok(kb.every(r=>r.y>=52&&r.bottom<=430),'键盘打开后三行输入均在可视范围内');
      await page.screenshot({path:`outputs/phone-workflow/${shell}-keyboard.png`});
      await first.blur();await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});await tap('完成');
      rect=await canvas.boundingBox();await page.touchscreen.tap(rect.x+rect.width*.8,rect.y+rect.height*.7);
      await phone.locator('[aria-label="正在调整的照片"]').waitFor();assert.equal(await phone.getByRole('button',{name:'素颜照',exact:true}).getAttribute('aria-pressed'),'true');await tap('取消');
      const clean=await canvas.evaluate(c=>c.toDataURL());
      const cdp=await page.context().newCDPSession(page);
      const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2}))});await page.waitForTimeout(40);};
      rect=await canvas.boundingBox();const x=rect.x+rect.width*.4,y=rect.y+rect.height*.2;
      await touch('touchStart',[[0,x,y]]);await touch('touchMove',[[0,x+25,y+15]]);await touch('touchEnd',[]);
      assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),clean,'单指直接移动照片');await tap('取消');assert.equal(await canvas.evaluate(c=>c.toDataURL()),clean,'取消还原手势调整');
      await touch('touchStart',[[0,x-30,y],[1,x+30,y]]);await touch('touchMove',[[0,x-50,y],[1,x+50,y]]);await touch('touchEnd',[]);
      assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),clean,'双指直接缩放');await tap('取消');assert.equal(await canvas.evaluate(c=>c.toDataURL()),clean);

      await tap('调整');await tap('素颜照');await tap('亮度与压暗');await tap('亮度');
      const value=phone.getByRole('spinbutton',{name:'亮度数值',exact:true});const before=await value.inputValue();
      assert.equal(await phone.getByRole('slider').count(),1);assert.equal(await phone.getByRole('spinbutton').count(),1,'只有一个数值输入');
      await value.fill('72');await tap('完成');
      await tap('调整');await tap('精修照');await tap('亮度与压暗');await tap('亮度');assert.notEqual(await value.inputValue(),'72','素颜照调整不影响精修照');
      const after=await value.inputValue();await value.fill('46');await tap('取消');
      await tap('调整');await tap('精修照');await tap('亮度与压暗');await tap('亮度');assert.equal(await value.inputValue(),after,'取消还原精修照亮度');await tap('完成');
      await tap('调整');await tap('素颜照');await tap('亮度与压暗');await tap('亮度');assert.equal(await value.inputValue(),'72');await value.fill(before);await tap('完成');
      // Switching orientation retains the same canvas and current work.
      const content=await canvas.evaluate(c=>c.toDataURL());await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);
      assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('nbo-phone')),false);
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await canvas.evaluate(c=>c.toDataURL()),content);
      await tap('照片');await tap('Live');await tap('开始编辑');await tap('文案');
      assert.deepEqual(await phone.getByRole('textbox').evaluateAll(inputs=>inputs.map(i=>i.value)),['男士素人改造','原来普通男生','也能拍成这样']);
      await tap('文字样式');assert.ok(await phone.getByRole('button',{name:'上行标题大小',exact:true}).isDisabled());await tap('完成');
      await tap('动画贴图');await phone.getByRole('button',{name:'Q萌验证',exact:true}).waitFor();await tap('Q萌验证');await tap('取消');await tap('动画贴图');assert.equal(await phone.getByRole('button',{name:'帅气合焦',exact:true}).getAttribute('aria-pressed'),'true','取消还原贴图');
      await tap('简洁验证');await tap('完成');await page.waitForFunction(()=>document.querySelector('.live-play')?.disabled===false);await tap('播放 Live');await page.waitForTimeout(3100);
      await page.screenshot({path:`outputs/phone-workflow/${shell}-live.png`});
      // Exit Live through the mode selector; the ordinary draft is retained.
      await tap('照片');await tap('前后对比');await tap('开始编辑');await tap('文案');assert.equal(await first.inputValue(),'手机文案');await tap('完成');
      for(const [label,ratio] of [['抖音 9:16',1920],['小红书 3:4',1440]]){
        await tap('排版');await tap(label);await tap('完成');await tap('导出');
        for(const name of ['保存高清 JPG','保存 PNG']){
          await tap(name);const save=page.locator('.save-preview');await save.waitFor({state:'visible'});
          const dimensions=await save.locator('img').evaluate(async img=>{await img.decode();return [img.naturalWidth,img.naturalHeight];});const expected=getExportAttemptSizes({width:600,height:900},{width:1080,height:ratio},name.includes('PNG')?'png':'jpeg',true)[0];assert.deepEqual(dimensions,[expected.width,expected.height],`${shell} ${name} 保留原图裁切像素`);
          await save.getByRole('button',{name:/关闭|继续编辑|返回/}).first().click();
        }
        await tap('返回');
      }
      await tap('照片');await tap('普通封面');await tap('开始编辑');
      rect=await canvas.boundingBox();await page.touchscreen.tap(rect.x+rect.width*.4,rect.y+rect.height*.2);await phone.getByRole('button',{name:'局部提亮',exact:true}).waitFor();await tap('局部提亮');
      rect=await canvas.boundingBox();await touch('touchStart',[[0,rect.x+rect.width*.3,rect.y+rect.height*.3]]);await touch('touchMove',[[0,rect.x+rect.width*.4,rect.y+rect.height*.35]]);await touch('touchEnd',[]);
      assert.ok(await phone.getByRole('button',{name:'撤销一步',exact:true}).isEnabled(),'原涂抹工具仍可使用');await tap('取消');
      await cdp.detach();
      assert.deepEqual(errors,[],`${shell} 页面无运行错误`);await page.close();
    }
  } finally {await browser.close();await vite.close();await new Promise(r=>server.close(r));}
});
