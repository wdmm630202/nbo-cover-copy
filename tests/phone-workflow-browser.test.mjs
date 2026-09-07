import assert from 'node:assert/strict';
import test from 'node:test';
import {getExportAttemptSizes} from '../app/cover/core/export-core.ts';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createServer as createViteServer} from 'vite';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

// Exercise the same phone journey against both owners, including actual exports.
test('手机单屏工作台：固定入口、原地调整、手势、Live 与原画质导出', {timeout:180000}, async t=>{
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
      await phone.locator('.phone-main-actions').waitFor({state:'visible'});
      const canvas=page.locator('#coverCanvas,.studio-canvas-shell canvas');
      const tool=async(id)=>{await phone.locator(`.phone-tool-strip [data-tool="${id}"]`).click();await page.waitForTimeout(60);};
      async function persistent(){
        assert.deepEqual(await phone.locator('.phone-main-actions button').allTextContents(),['构图','文字','画面','涂抹','水印']);
        for(const selector of ['.phone-header','.phone-photo-rail','.phone-shortcut-rail','.phone-main-actions','.phone-dock'])assert.ok(await phone.locator(selector).isVisible(),`${shell} ${selector} 始终可见`);
        assert.equal(await phone.getByRole('button',{name:'开始编辑',exact:true}).count(),0,'无需进入额外页面');
      }
      await persistent();
      assert.ok(await phone.getByRole('button',{name:'主照片',exact:true}).isVisible(),'上传前已有画布与工具');
      await page.screenshot({path:`outputs/phone-workflow/${shell}-start.png`});
      const photo={name:'phone-check.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#6f9293';x.fillRect(0,0,600,900);x.fillStyle='#c4ab81';x.fillRect(150,100,300,650);return c.toDataURL().split(',')[1];}),'base64')};
      let picker=page.waitForEvent('filechooser');await tap('主照片');await (await picker).setFiles(photo);
      // A before-photo entry enables comparison and opens the original upload picker.
      picker=page.waitForEvent('filechooser');await tap('素颜照');await (await picker).setFiles(photo);
      await phone.locator('.phone-photo canvas').nth(1).waitFor();
      await tap('主照片');
      for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(100);await persistent();
        const m=await page.evaluate(()=>{
          const c=document.querySelector('#coverCanvas,.studio-canvas-shell canvas'),r=c.getBoundingClientRect();
          return {ratio:r.width/r.height,intrinsic:c.width/c.height,overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('.phone-main-actions button,.phone-header button,.phone-photo-rail button,.phone-shortcut-rail button')].map(b=>b.getBoundingClientRect().toJSON()),canvas:r.toJSON(),selection:document.querySelector('.phone-selection').getBoundingClientRect().toJSON(),dock:document.querySelector('.phone-dock').getBoundingClientRect().toJSON()};
        });
        assert.ok(Math.abs(m.ratio-m.intrinsic)<.001,`${shell} ${width} 预览不能拉伸`);assert.ok(m.overflow<=1,`${shell} ${width} 横向不能溢出`);
        for(const b of m.buttons)assert.ok(b.x>=0&&b.right<=width&&b.y>=0&&b.bottom<=height&&b.height>=44,`${shell} ${width} 固定入口一屏可点`);
        assert.ok(m.canvas.height>150,`${shell} ${width} 预览可见`);
        for(const key of ['x','y','width','height'])assert.ok(Math.abs(m.canvas[key]-m.selection[key])<1,`${shell} ${width} 选中框跟随实际画布尺寸`);
        assert.ok(m.canvas.bottom<=m.dock.y+1||m.canvas.right<=m.dock.x+1,'预览与参数区不重叠');
        await page.screenshot({path:`outputs/phone-workflow/${shell}-workspace-${width}.png`});
      }
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(80);
      const stationary=await canvas.boundingBox();
      // Every category changes its own dock, preserving the canvas and permanent rails.
      for(const label of ['文字','画面','涂抹','水印','更多','构图']){await tap(label);await persistent();assert.deepEqual(await canvas.boundingBox(),stationary,`${shell} 切换${label}不挪动画布`);}
      // Exercise every tool entry through its public registry IDs (actions are selected, not fired).
      for(const label of ['构图','文字','画面','涂抹','水印','更多']){
        await tap(label);const ids=await phone.locator('.phone-tool-strip [data-tool]').evaluateAll(bs=>bs.map(b=>b.dataset.tool));
        for(const id of ids){const b=phone.locator(`.phone-tool-strip [data-tool="${id}"]`);if(await b.isEnabled()){await tool(id);assert.equal(await b.getAttribute('aria-pressed'),'true');await persistent();assert.deepEqual(await canvas.boundingBox(),stationary);}}
      }
      await tap('构图');
      let rect=await canvas.boundingBox();await page.touchscreen.tap(rect.x+rect.width*.2,rect.y+rect.height*.53);
      const first=phone.getByRole('textbox',{name:'上行主标题',exact:true});await first.waitFor();const original=await first.inputValue();
      await first.fill('手机测试');await tap('撤销');assert.equal(await first.inputValue(),original,'撤销还原当前工具调整');
      await first.fill('手机文案');await tap('画面');await tap('文字');assert.equal(await first.inputValue(),'手机文案','切换工具自动保留修改');
      await tool('bottomText');await phone.getByRole('textbox',{name:'下行主标题',exact:true}).fill('普通男生');await tool('subtitle');assert.ok(await phone.getByRole('textbox',{name:'补充小字',exact:true}).isVisible());await tool('topText');
      await page.screenshot({path:`outputs/phone-workflow/${shell}-text.png`});
      await first.focus();await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:430});visualViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
      const kb=await first.boundingBox();assert.ok(kb.y>=48&&kb.y+kb.height<=430,'键盘打开后输入在可视范围');
      const bottom=await phone.locator('.phone-main-actions').boundingBox();assert.ok(bottom.y+bottom.height<=430,'键盘弹出后功能入口仍可见');
      await page.screenshot({path:`outputs/phone-workflow/${shell}-keyboard.png`});
      await first.blur();await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});await tap('构图');
      rect=await canvas.boundingBox();await page.touchscreen.tap(rect.x+rect.width*.8,rect.y+rect.height*.7);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.equal(await phone.getByRole('button',{name:'素颜照',exact:true}).getAttribute('aria-pressed'),'true');
      await tap('主照片');const clean=await canvas.evaluate(c=>c.toDataURL());
      const cdp=await page.context().newCDPSession(page);
      const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2}))});await page.waitForTimeout(40);};
      rect=await canvas.boundingBox();const x=rect.x+rect.width*.4,y=rect.y+rect.height*.2;
      await touch('touchStart',[[0,x,y]]);await touch('touchMove',[[0,x+25,y+15]]);await touch('touchEnd',[]);
      assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),clean,'单指移动原照片');await tap('撤销');assert.equal(await canvas.evaluate(c=>c.toDataURL()),clean,'撤销还原手势');
      await touch('touchStart',[[0,x-30,y],[1,x+30,y]]);await touch('touchMove',[[0,x-50,y],[1,x+50,y]]);await touch('touchEnd',[]);
      assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),clean,'双指缩放');await tap('撤销');assert.equal(await canvas.evaluate(c=>c.toDataURL()),clean);
      await tap('画面');await tap('素颜照');
      const value=phone.getByRole('spinbutton',{name:'亮度数值',exact:true});const before=await value.inputValue();
      assert.equal(await phone.getByRole('slider').count(),1);assert.equal(await phone.getByRole('spinbutton').count(),1,'同一参数无重复数值');
      await value.fill('72');await tap('主照片');assert.notEqual(await value.inputValue(),'72','素颜照亮度不影响主照片');
      const after=await value.inputValue();await value.fill('46');await tap('撤销');assert.equal(await value.inputValue(),after);
      await tap('素颜照');assert.equal(await value.inputValue(),'72');await value.fill(before);await tap('构图');
      const content=await canvas.evaluate(c=>c.toDataURL());await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('nbo-phone')),false);
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await canvas.evaluate(c=>c.toDataURL()),content);
      await tap('Live');await page.waitForFunction(()=>document.querySelector('.phone-shortcut-rail button[aria-pressed=true]')&&document.querySelector('.live-play'));await tap('文字');
      const values=[];for(const id of ['topText','bottomText','subtitle']){await tool(id);values.push(await phone.getByRole('textbox').inputValue());}
      assert.deepEqual(values,['男士素人改造','原来普通男生','也能拍成这样']);assert.ok(await phone.locator('[data-tool="textScale"]').isDisabled(),'Live 锁定字号');
      await tap('贴图');await phone.getByRole('button',{name:'香槟金',exact:true}).waitFor();await tap('香槟金');await tap('撤销');assert.equal(await phone.getByRole('button',{name:'曜石银',exact:true}).getAttribute('aria-pressed'),'true');
      assert.deepEqual(await phone.locator('.phone-card-audio button').allTextContents(),['人声','音效','虚线','重播']);
      await tap('曜石银底色100%');await tap('人声');await tap('音效');await tap('虚线');await tap('撤销');
      assert.equal(await phone.getByRole('button',{name:'曜石银底色50%',exact:true}).getAttribute('aria-pressed'),'true','撤销恢复卡片底色');
      for(const name of ['人声','音效','虚线'])assert.equal(await phone.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true','撤销恢复声音');
      await tap('雾海蓝');await page.waitForFunction(()=>document.querySelector('.live-play')?.disabled===false);await tap('播放');await page.waitForTimeout(3100);await persistent();await page.screenshot({path:`outputs/phone-workflow/${shell}-live.png`});
      await tap('Live');await page.waitForFunction(()=>!document.querySelector('body').classList.contains('live-mode'));await tap('文字');assert.equal(await first.inputValue(),'手机文案','退出 Live 保留普通文案');
      for(const [label,ratio] of [['抖音 9:16',1920],['小红书 3:4',1440]]){
        await tap('更多');await tool('platform');await tap(label);await tap('导出');await persistent();
        for(const name of ['高清 JPG','PNG']){
          await tap(name);const save=page.locator('.save-preview');await save.waitFor({state:'visible'});
          const dimensions=await save.locator('img').evaluate(async img=>{await img.decode();return [img.naturalWidth,img.naturalHeight];});const expected=getExportAttemptSizes({width:600,height:900},{width:1080,height:ratio},name==='PNG'?'png':'jpeg',true)[0];assert.deepEqual(dimensions,[expected.width,expected.height],`${shell} ${name} 原图裁切像素`);
          await save.getByRole('button',{name:/关闭|继续编辑|返回/}).first().click();
        }
      }
      await tap('前后对比');await tap('Live');await page.waitForFunction(()=>document.querySelector('.live-play')?.disabled===false);await tap('Live');await phone.getByRole('button',{name:'贴图',exact:true}).waitFor({state:'hidden'});assert.equal(await phone.getByRole('button',{name:'前后对比',exact:true}).getAttribute('aria-pressed'),'false','关闭 Live 恢复之前的普通封面模式');await tap('主照片');await tap('涂抹');await tap('开启涂抹');
      rect=await canvas.boundingBox();await touch('touchStart',[[0,rect.x+rect.width*.3,rect.y+rect.height*.3]]);await touch('touchMove',[[0,rect.x+rect.width*.4,rect.y+rect.height*.35]]);await touch('touchEnd',[]);
      assert.ok(await phone.locator('[data-tool="undoRetouch"]').isEnabled(),'原涂抹仍可使用');await tool('undoRetouch');await phone.locator('.phone-adjustment').getByRole('button',{name:'撤销一步',exact:true}).click();
      await tap('文字');await tap('涂抹');assert.ok(await phone.getByRole('button',{name:'开启涂抹',exact:true}).isVisible(),'离开涂抹自动退出画笔');
      await cdp.detach();assert.deepEqual(errors,[],`${shell} 无运行错误`);await page.close();

    }
  } finally {await browser.close();await vite.close();await new Promise(r=>server.close(r));}
});
