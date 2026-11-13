import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

test('原蒙版分块调色与整图source-in逐像素一致，跨块及导出裁切无接缝',async t=>{
 if(!available)return t.skip('需Chrome/Playwright');
 const server=await createServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage();
  await page.route('**/tint-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>透明蒙版调色</title>'}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tint-fixture.html`);
  const result=await page.evaluate(async()=>{
   const {drawTintedMask}=await import('/public/makeover/tint-mask.mjs');
   const create=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
   const mask=create(301,97),m=mask.getContext('2d'),g=m.createLinearGradient(0,0,301,97);g.addColorStop(0,'transparent');g.addColorStop(1,'#000');m.fillStyle=g;m.fillRect(0,0,301,97);
   const image=await createImageBitmap(mask),w=4203,h=391,reference=create(w,h),r=reference.getContext('2d');r.imageSmoothingQuality='high';r.drawImage(image,0,0,w,h);r.globalCompositeOperation='source-in';r.fillStyle='#b5178e';r.fillRect(0,0,w,h);
   const output=create(w,h),o=output.getContext('2d');const original=HTMLCanvasElement.prototype.getContext,sizes=[];
   HTMLCanvasElement.prototype.getContext=function(...args){sizes.push([this.width,this.height]);return original.apply(this,args);};
   drawTintedMask(o,image,w,h,'#b5178e');HTMLCanvasElement.prototype.getContext=original;
   const compare=(a,b)=>{let alpha=0,appearance=0;for(let i=0;i<a.length;i+=4){alpha=Math.max(alpha,Math.abs(a[i+3]-b[i+3]));for(let j=0;j<3;j++)appearance=Math.max(appearance,Math.abs(Math.round(a[i+j]*a[i+3]/255+128*(1-a[i+3]/255))-Math.round(b[i+j]*b[i+3]/255+128*(1-b[i+3]/255))));}return{alpha,appearance};};
   const whole=compare(r.getImageData(0,0,w,h).data,o.getImageData(0,0,w,h).data);
   const region={x:2049,y:130,width:2052,height:132},tile=create(region.width,region.height),x=tile.getContext('2d');x.translate(-region.x,-region.y);x.globalAlpha=.37;drawTintedMask(x,image,w,h,'#b5178e',region);
   const expected=create(region.width,region.height),e=expected.getContext('2d');e.globalAlpha=.37;e.drawImage(reference,-region.x,-region.y);
   const crop=compare(x.getImageData(0,0,region.width,region.height).data,e.getImageData(0,0,region.width,region.height).data);
   image.close();return{whole,crop,sizes};
  });
  assert.ok(result.whole.alpha<=1&&result.whole.appearance<=1,`整图与分块颜色/alpha不符 ${JSON.stringify(result)}`);
  assert.ok(result.crop.alpha<=1&&result.crop.appearance<=1,'导出坐标和强度应与整图相同');
  assert.ok(result.sizes.length>3&&result.sizes.every(([w,h])=>w<=2052&&h<=132),'调色画布必须维持手机小块上限');
 }finally{await browser?.close();await server.close();}
});
