import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

const settle = page => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const near = (actual, expected, tolerance, message) => actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<=tolerance,`${message}: ${actual} vs ${expected}`));

// Catch color controls that do not render, altered PSD alpha, recolored lettering,
// and any mobile implementation that allocates a full-resolution tint canvas.
for(const mobile of [false,true])test(`${mobile?'手机':'电脑'}渐变黑白、自定义及吸色保持原PSD透明度，并同步PNG/JPG`,async t=>{
 if(!available)return t.skip('需Chrome/Playwright');
 const server=await createServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,serviceWorkers:'block',...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
  page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mobile=>{
   Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});
   if(!mobile)return;window.tintOversizedCanvases=[];
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(...args){if(this.width*this.height>4000000){window.tintOversizedCanvases.push([this.width,this.height]);return null;}return original.apply(this,args);};
  },mobile);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/public/makeover/index.html`);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('请选择'));
  assert.equal(await page.locator('#gradient-color').count(),1,'模板渐变应有独立颜色控制');
  if(mobile){await page.locator('button[data-tool=tone]').click();await page.locator('#parameter-select').selectOption('gradientColor');}
  assert.equal(await page.locator('#gradient-color').inputValue(),'#000000','默认黑色');
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=180;const x=c.getContext('2d');x.fillStyle='#789abc';x.fillRect(0,0,120,180);return c.toDataURL().split(',')[1]});
  for(const side of [0,1])await page.locator('#photo-'+side).setInputFiles({name:'原片.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await page.waitForFunction(()=>!document.querySelector('#export-png').disabled);await settle(page);
  const sample=()=>page.locator('#preview').evaluate(c=>{const s=document.createElement('canvas');s.width=2;s.height=1;const x=s.getContext('2d',{willReadFrequently:true});x.drawImage(c,c.width*800/6000,c.height*6400/8000,1,1,0,0,1,1);x.drawImage(c,c.width*.25,c.height*100/8000,1,1,1,0,1,1);return[...x.getImageData(0,0,2,1).data]});
  const black=await sample();near(black.slice(0,3),[13,17,21],3,'原PSD在(800,6400)的alpha227，默认黑色');
  await page.locator('[data-gradient-color="#ffffff"]').click();await settle(page);
  const white=await sample();near(white.slice(0,3),[240,244,248],3,'白色沿用同一渐变透明度');assert.deepEqual(white.slice(4),black.slice(4),'顶部固定边框不得随渐变变色');
  assert.equal(await page.locator('#note-color').inputValue(),'#000000','备注颜色独立');
  await page.locator('#gradient-color').fill('#17c461');await page.locator('#gradient-color').dispatchEvent('input');await settle(page);
  near((await sample()).slice(0,3),[34,191,107],3,'自定义颜色实际进入原PSD蒙版');
  await page.locator('#gradient-pick').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#gradient-color').inputValue(),'#17c461');
  await page.locator('#gradient-pick').click();const b=await page.locator('#preview').boundingBox();await page.mouse.click(b.x+b.width*800/6000,b.y+b.height*1000/8000);
  assert.equal(await page.locator('#gradient-color').inputValue(),'#789abc','吸色应从预览实际照片读取');
  if(mobile)await page.locator('#parameter-select').selectOption('templateGradient');
  await page.locator('[data-template-gradient-preset="0"]').click();await settle(page);near((await sample()).slice(0,3),[120,154,188],1,'0强度不改变原片');
  await page.locator('[data-template-gradient-preset="100"]').click();
  if(mobile)await page.locator('#parameter-select').selectOption('gradientColor');
  await page.locator('[data-gradient-color="#000000"]').click();await settle(page);assert.deepEqual(await sample(),black,'黑色100恢复原效果');
  await page.locator('[data-gradient-color="#ffffff"]').click();
  for(const format of ['png','jpg']){
   await page.locator('#export-'+format).click();await page.waitForFunction(()=>document.querySelector('#download-link').getAttribute('href')?.startsWith('blob:'),undefined,{timeout:60000});
   const exported=await page.locator('#download-link').evaluate(async a=>{const image=await createImageBitmap(await(await fetch(a.href)).blob()),c=document.createElement('canvas');c.width=2;c.height=1;const x=c.getContext('2d');x.drawImage(image,800,6400,1,1,0,0,1,1);x.drawImage(image,1500,100,1,1,1,0,1,1);const result={width:image.width,height:image.height,pixels:[...x.getImageData(0,0,2,1).data]};image.close();return result;});
   assert.deepEqual([exported.width,exported.height],[6000,8000]);near(exported.pixels.slice(0,3),[240,244,248],format==='png'?1:5,format+'应保留白色原渐变');near(exported.pixels.slice(4,7),[0,0,0],1,'固定黑框保持原色');
   if(mobile)await page.locator('#mobile-save-close').click();
   await page.locator('[data-gradient-color="#000000"]').click();await page.locator('[data-gradient-color="#ffffff"]').click();
  }
  if(mobile)assert.deepEqual(await page.evaluate(()=>window.tintOversizedCanvases),[],'手机渐变调色与导出不得新增大画布');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
