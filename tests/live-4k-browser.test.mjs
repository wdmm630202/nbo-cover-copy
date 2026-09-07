import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

test('真实4K编码保留90帧和最后定格，配对照片独立使用原像素导出',async t=>{
 if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
 const root=resolve('docs');
 const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',extname(p)==='.js'?'text/javascript':extname(p)==='.html'?'text/html':'application/json');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  const page=await browser.newPage();await page.addInitScript(()=>localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000)));
  await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
  for(const height of [3840,2880]){
   const result=await page.evaluate(async height=>{
    const {exportLivePhoto}=await import('./live/export.js');
    const {readBoxes}=await import('./live/container.js');
    const times=[];let posterCalls=0;
    const output=await exportLivePhoto({width:2160,height,duration:3,
     renderFrame(c,t){times.push(t);const x=c.getContext('2d');x.fillStyle=t<1?'#a23a21':'#285e97';x.fillRect(0,0,c.width,c.height);},
     async createPoster(){posterCalls++;const c=document.createElement('canvas');c.width=900;c.height=height===3840?1600:1200;const x=c.getContext('2d');x.fillStyle='#285e97';x.fillRect(0,0,c.width,c.height);return {blob:await new Promise(r=>c.toBlob(r,'image/jpeg',.98)),outputSize:{width:c.width,height:c.height}};}});
    const still=await createImageBitmap(output.photo);
    const child=(b,type)=>readBoxes(b.slice(8)).find(x=>x.type===type).data;
    const boxes=readBoxes(new Uint8Array(await output.movie.arrayBuffer()));const moov=boxes.find(x=>x.type==='moov').data;
    const track=readBoxes(moov.slice(8)).find(x=>x.type==='trak').data,tkhd=child(track,'tkhd'),view=new DataView(tkhd.buffer,tkhd.byteOffset,tkhd.byteLength);
    const stsz=child(child(child(child(track,'mdia'),'minf'),'stbl'),'stsz');
    return {posterCalls,photo:[still.width,still.height],video:[view.getUint32(tkhd.length-8)/65536,view.getUint32(tkhd.length-4)/65536],frames:new DataView(stsz.buffer,stsz.byteOffset,stsz.byteLength).getUint32(16),times};
   },height);
   assert.equal(result.posterCalls,1);assert.deepEqual(result.photo,[900,height===3840?1600:1200]);assert.deepEqual(result.video,[2160,height]);
   assert.equal(result.frames,90);assert.equal(result.times.length,90);assert.equal(result.times[0],0);assert.equal(result.times[89],89/30);
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
