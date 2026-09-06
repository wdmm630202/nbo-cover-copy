import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { chromium,executablePath,available } from './helpers/live-browser-driver.mjs';

test('真实工作台 Live 锁定、关闭恢复、照片调整与三行文字编辑', async (t) => {
  if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
  const root=resolve('docs');
  const server=createServer(async(req,res)=>{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
    try{const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000));localStorage.setItem('nbo_cover_settings_v1',JSON.stringify({textScale:81,bottomTextScale:62,textScaleLinked:false,subtitleScale:130,titleScaleVersion:3,topText:'原来超出六字标题',bottomText:'原来文案',subtitle:'原来小字'}));});
    await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
    assert.equal(await page.getByRole('button',{name:'制作 Live',exact:true}).count(),1,'工作台需要独立 Live 开关');
    await page.waitForFunction(()=>document.querySelector('#coverCanvas').width>0);
    const before=await page.evaluate(()=>({image:document.querySelector('#coverCanvas').toDataURL(),size:document.querySelector('#textScale').value,small:document.querySelector('#subtitleScale').value,compare:document.querySelector('#compareToggle').checked}));
    await page.getByRole('button',{name:'制作 Live',exact:true}).click();
    await page.getByRole('button',{name:'关闭 Live',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#textScale').value==='45');
    assert.deepEqual(await page.locator('#topText, #bottomText, #subtitle').evaluateAll(nodes=>nodes.map(node=>node.value)),['男士素人改造','原来普通男生','也能拍成这样']);
    assert.equal(await page.locator('#textScale').isDisabled(),true);
    assert.equal(await page.locator('#textScaleValue').isDisabled(),true);
    assert.equal(await page.locator('#subtitleScale').isDisabled(),true);
    assert.equal(await page.locator('#alignBeforeFrame').isDisabled(),true);
    assert.equal(await page.locator('#zoom').isDisabled(),false);
    assert.equal(await page.locator('#brightness').isDisabled(),false);
    assert.equal(await page.locator('#topText').isDisabled(),false);
    await page.evaluate(()=>{const zoom=document.querySelector('#zoom');zoom.value=117;zoom.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.deepEqual(await page.locator('#topText, #bottomText, #subtitle').evaluateAll(nodes=>nodes.map(node=>node.value)),['男士素人改造','原来普通男生','也能拍成这样']);
    await page.getByRole('button',{name:'恢复默认',exact:true}).click();
    assert.deepEqual(await page.locator('#topText, #bottomText, #subtitle').evaluateAll(nodes=>nodes.map(node=>node.value)),['男士素人改造','原来普通男生','也能拍成这样']);
    await page.getByRole('button',{name:'关闭 Live',exact:true}).click();
    await page.waitForFunction(value=>document.querySelector('#textScale').value===value,before.size);
    assert.equal(await page.locator('#textScale').isDisabled(),false);
    assert.equal(await page.locator('#subtitleScale').inputValue(),before.small);
    assert.equal(await page.locator('#compareToggle').isChecked(),before.compare);
    assert.equal(await page.locator('#topText').inputValue(),'原来超出六字标题');
    await page.waitForFunction(value=>document.querySelector('#coverCanvas').toDataURL()===value,before.image);
    const pixels=await page.evaluate(async()=>{
      const source=document.createElement('canvas');source.width=800;source.height=1200;
      const ctx=source.getContext('2d');ctx.fillStyle='#c89d54';ctx.fillRect(0,0,800,1200);
      const image=new Image();image.src=source.toDataURL();await image.decode();
      const settings={...state,zoom:123,offsetX:8,offsetY:-3,rotation:8,beforeZoom:125,beforeOffsetX:80,beforeRotation:15,beforeShade:80};
      const draw=time=>{const canvas=document.createElement('canvas');NBOCoverCore.drawCover({canvas,image,beforeImage:image,watermark:null,settings,preset:{id:'douyin',width:1080,height:1920},outputSize:{width:270,height:480},includeGuide:false,live:{time}});return canvas.getContext('2d').getImageData(0,0,270,480).data;};
      const first=draw(0),a=draw(28/30),b=draw(29/30),c=draw(59/30),d=draw(2);
      const delta=(x,y)=>x.reduce((sum,value,index)=>sum+Math.abs(value-y[index]),0)/x.length;
      return {firstCorner:Array.from(first.slice(0,4)),beforeLandingDelta:delta(a,b),afterLandingDelta:delta(c,d)};
    });
    assert.deepEqual(pixels.firstCorner,[200,157,84,255],'素颜首帧必须无留白填满画布');
    assert.ok(pixels.beforeLandingDelta<0.25,`素颜落位产生突变：${pixels.beforeLandingDelta}`);
    assert.equal(pixels.afterLandingDelta,0,'精修落位与完成阶段的照片应逐像素衔接');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
});
