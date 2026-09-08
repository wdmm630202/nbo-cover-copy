import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

test('真实导出按钮使用原片平台命名、保留保存手势，取消后连续导出不重名',async t=>{
 if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
 const root=resolve('docs');
 const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
   localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000));window.names=[];
   window.showDirectoryPicker=()=>{throw Error('不应打开文件夹授权');};
   window.showSaveFilePicker=async options=>{window.names.push({name:options.suggestedName,active:navigator.userActivation.isActive});throw new DOMException('cancel','AbortError');};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=160;return c.toDataURL().split(',')[1];});
  for(const id of ['fileInput','beforeFileInput'])await page.locator('#'+id).setInputFiles({name:'T62_8222.PNG',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await page.getByRole('button',{name:'制作 Live',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.live-export')?.disabled===false);
  await page.evaluate(()=>{Date.now=()=>new Date(2026,8,8,12,20,29,123).getTime();});
  for(let i=0;i<2;i++){
   await page.getByRole('button',{name:'导出 Live',exact:true}).click();
   await page.waitForFunction(n=>window.names.length===n&&!document.querySelector('.live-export').disabled,i+1);
   assert.equal(await page.locator('.live-status').textContent(),'已取消导出');
  }
  const names=await page.evaluate(()=>window.names);
  assert.deepEqual(names,[{name:'实况live_T62_8222_设计_抖音_9x16_20260908_122029_123.zip',active:true},{name:'实况live_T62_8222_设计_抖音_9x16_20260908_122029_124.zip',active:true}]);
  await page.evaluate(()=>{
   window.showSaveFilePicker=async options=>({name:window.savedName=options.suggestedName,getFile:async()=>new Blob(),createWritable:async()=>({write:async blob=>{window.savedZip=blob;},close:async()=>{window.savedClosed=true;},abort:async()=>{}})});
  });
  await page.getByRole('button',{name:'导出 Live',exact:true}).click();
  await page.waitForFunction(()=>window.savedClosed&&!document.querySelector('.live-export').disabled,null,{timeout:60000});
  const saved=await page.evaluate(async()=>{
   const bytes=new Uint8Array(await window.savedZip.arrayBuffer()),v=new DataView(bytes.buffer),files=[];
   for(let offset=0;v.getUint32(offset,true)===0x04034b50;){const n=v.getUint16(offset+26,true),e=v.getUint16(offset+28,true);files.push(new TextDecoder().decode(bytes.slice(offset+30,offset+30+n)));offset+=30+n+e+v.getUint32(offset+18,true);}
   return {name:window.savedName,files};
  });
  const stem='实况live_T62_8222_设计_抖音_9x16_20260908_122029_125';
  assert.equal(saved.name,stem+'.zip');assert.deepEqual(saved.files,[stem+'.JPG',stem+'.MOV','保存到苹果照片.txt']);
  assert.match(await page.locator('.live-status').textContent(),/已保存.*JPG＋MOV/);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
