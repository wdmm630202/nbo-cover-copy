import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createServer as createViteServer} from 'vite';
import {getExportAttemptSizes} from '../app/cover/core/export-core.ts';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

test('电脑连续缩放保留三栏、画布内容和操作，Live 贴图与导出仍可使用', async t=>{
  if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
  const root=resolve('docs');
  const server=createServer(async(req,res)=>{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
    try{const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const vite=await createViteServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});await vite.listen();
  const browser=await chromium.launch({executablePath,headless:true});
  await mkdir('outputs/desktop-fit',{recursive:true});
  const remote=process.env.NBO_DESKTOP_URL;
  try{
    for(const shell of remote?['static']:['static','react']){
      const page=await browser.newPage({viewport:{width:2596,height:1230},reducedMotion:'reduce'});
      page.setDefaultTimeout(12000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000));window.showSaveFilePicker=undefined;});
      await page.goto(remote||(shell==='static'?`http://127.0.0.1:${server.address().port}/cover.html`:`http://127.0.0.1:${vite.httpServer.address().port}/tests/fixtures/cover-live.html`));
      const photo={name:'resize-check.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#688ca0';x.fillRect(0,0,600,900);x.fillStyle='#d6b389';x.fillRect(150,100,300,650);return c.toDataURL().split(',')[1];}),'base64')};
      await page.locator(shell==='static'?'#fileInput':'.studio-upload input').setInputFiles(photo);
      const compare=page.getByRole('checkbox',{name:'前后对比',exact:true});if(!await compare.isChecked())await compare.locator('xpath=..').click();
      await page.locator(shell==='static'?'#beforeFileInput':'#studioBeforeFileInput').setInputFiles(photo);
      await page.locator(shell==='static'?'#retouchTarget':'.studio-retouch-target').waitFor({state:'visible'});
      const textInput=page.locator(shell==='static'?'#topText':'[aria-label="上行主标题"]').first();await textInput.fill('窗口测试');
      await page.waitForLoadState('networkidle');
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(300);
      const pixels=()=>page.locator('#coverCanvas,.studio-canvas-shell canvas').evaluate(c=>c.toDataURL());
      const original=await pixels();
      const measure=()=>page.evaluate(()=>{
        const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {mode:document.querySelector('[data-cover-layout]').dataset.coverLayout,left:rect('.controls,.studio-controls'),right:rect('.design,.studio-design'),canvas:rect('.canvas-shell,.studio-canvas-shell'),tools:rect('.preview-tools,.studio-preview-tools'),toolbar:rect('.preview-toolbar,.studio-preview-toolbar'),overflow:document.documentElement.scrollWidth-innerWidth};
      });
      for(const [width,height] of [[2596,1230],[1440,900],[1220,950],[1200,900],[1180,850],[980,1000],[980,700],[800,650],[1440,900],[2596,1230]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(120);
        const m=await measure();const label=`${shell} ${width}×${height}`;
        assert.equal(m.mode,'desktop',label+' 不应切换成触屏壳');assert.ok(m.overflow<=1,label+' 横向溢出');
        assert.ok(Math.abs(m.left.width-m.right.width)<1,label+' 侧栏宽度不一致');
        assert.ok(m.left.right<m.canvas.x&&m.canvas.right<m.right.x,label+' 三栏发生重叠');
        for(const k of ['left','right','canvas','tools','toolbar'])assert.ok(m[k].x>=-1&&m[k].right<=width+1&&m[k].y>=-1&&m[k].bottom<=height+1,label+' '+k+' 超出窗口');
        assert.ok(m.toolbar.height>0&&m.toolbar.bottom<=m.canvas.y+1,label+' 顶部按钮丢失或覆盖画布');
        assert.ok(Math.abs(m.canvas.width/m.canvas.height-9/16)<.002,label+' 画布被拉伸');
        assert.ok(Math.abs(m.tools.width-m.canvas.width)<1,label+' 导出区宽度与画布不一致');
        assert.equal(await textInput.inputValue(),'窗口测试',label+' 文案丢失');
        assert.equal(await pixels(),original,label+' 缩放改变了成品内容');
        if(width===980)await page.screenshot({path:`outputs/desktop-fit/${shell}-${width}-${height}.png`});
      }
      await page.setViewportSize({width:980,height:700});
      await page.getByRole('button',{name:'制作 Live',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.live-export')?.disabled===false);
      const details=page.locator('.live-details');if(!await details.evaluate(d=>d.open))await details.locator('summary').first().click();
      const before=await measure();const gallery=await page.locator('.live-settings-panel').boundingBox();
      assert.ok(gallery.x>=before.canvas.right-1,shell+' 贴图盖住画布');
      await details.locator('summary').first().click();const after=await measure();
      assert.deepEqual(after.canvas,before.canvas,shell+' 展开贴图不应移动预览');
      await page.getByRole('button',{name:'关闭 Live',exact:true}).click();
      assert.equal(await textInput.inputValue(),'窗口测试');
      const canvas=page.locator('#coverCanvas,.studio-canvas-shell canvas');const r=await canvas.boundingBox();
      const xInput=page.getByRole('spinbutton',{name:'左右位置准确数值',exact:true});const initial=await xInput.inputValue();
      await page.mouse.move(r.x+r.width*.5,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.5+20,r.y+r.height*.3,{steps:4});await page.mouse.up();
      assert.notEqual(await xInput.inputValue(),initial,shell+' 缩放后拖动应仍可调整照片');
      for(const label of ['导出 PNG','导出高清 JPG']){
        await page.locator('.export-row > button,.studio-export-row > button').nth(label==='导出 PNG'?2:3).click();await page.locator('.save-preview img').waitFor({state:'visible'});
        const output=await page.locator('.save-preview img').evaluate(async img=>{await img.decode();return {w:img.naturalWidth,h:img.naturalHeight};});const expected=getExportAttemptSizes({width:600,height:900},{width:1080,height:1920},label==='导出 PNG'?'png':'jpeg',false)[0];assert.deepEqual(output,{w:expected.width,h:expected.height},shell+' 导出像素不能受窗口缩放影响');
        const close=page.locator('.save-preview-card button').last();await close.click();
      }
      assert.deepEqual(errors,[]);await page.close();
    }
  }finally{await browser.close();await vite.close();await new Promise(r=>server.close(r));}
});
