import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';
import { clickInFrame } from './helpers/makeover-browser-geometry.mjs';

async function uploadAndExport(page, frame, localFile = false) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 160;
    const context = canvas.getContext('2d'); context.fillStyle = '#a85462'; context.fillRect(0, 0, 100, 160);
    return canvas.toDataURL().split(',')[1];
  });
  if (!localFile) await frame.evaluate(() => { window.showSaveFilePicker = undefined; });
  for (let side = 0; side < 2; side++) await frame.locator(`#photo-${side}`).setInputFiles({name:'本机原片.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await frame.waitForFunction(() => !document.querySelector('#export-png').disabled);
  for (const format of ['png', 'jpg']) {
    if (localFile) await frame.locator(`#export-${format}`).click();
    else await clickInFrame(page, frame, `#export-${format}`);
    await frame.locator('#download-result').waitFor({state:'visible'});
    const result = await frame.locator('#download-link').evaluate(async link => {
      const blob = await (await fetch(link.href)).blob(); const image = await createImageBitmap(blob);
      const result = {name:link.download,bytes:blob.size,width:image.width,height:image.height}; image.close(); return result;
    });
    assert.match(result.name, /^南铂素人改造_\d{8}_\d{6}_\d{3}\.(?:png|jpg)$/);
    assert.ok(result.bytes > 0); assert.deepEqual([result.width,result.height],[6000,8000]);
  }
}

test('首次完整缓存后断网重新打开，模式切换、模板、原片导入及PNG/JPG导出仍可用', {timeout:90000}, async t => {
  if(!available) return t.skip('需 Chrome/Playwright');
  const root = resolve('docs');
  const server = createServer(async (request,response) => {
    const name = decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/nbo-cover-copy\//,'');
    const path = resolve(root,name);
    if(!path.startsWith(root+'/')) return response.writeHead(403).end();
    try { response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json','.m4a':'audio/mp4'})[extname(path)]||'application/octet-stream');response.end(await readFile(path)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath,headless:true});
  try {
    const context = await browser.newContext();
    await context.addInitScript(()=>localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000)));
    let page = await context.newPage();
    const url=`http://127.0.0.1:${server.address().port}/nbo-cover-copy/cover.html`;
    await page.goto(url);
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent.includes('已可离线'),{timeout:45000});
    await page.waitForFunction(()=>navigator.serviceWorker.controller !== null);
    await page.close();
    await context.setOffline(true);
    page=await context.newPage();
    await page.goto(url+'?mode=makeover&different-query=offline');
    const frame=await(await page.locator('#makeoverFrame').elementHandle()).contentFrame();
    await frame.locator('#preview').waitFor();
    await uploadAndExport(page,frame);
    await page.locator('#creation-tab-cover').click();
    await page.locator('#fileInput').setInputFiles({name:'原片.png',mimeType:'image/png',buffer:Buffer.from(await frame.evaluate(()=>document.querySelector('#preview').toDataURL().split(',')[1]),'base64')});
    await page.waitForFunction(()=>!document.querySelector('#exportJpg').disabled);
    const cached=await page.evaluate(async()=>{const keys=await caches.keys(); const cache=await caches.open(keys.find(key=>key.startsWith('nanbo-studio-')));return(await cache.keys()).map(request=>request.url)});
    assert.ok(cached.length>=89); assert.ok(cached.every(url=>!url.startsWith('blob:')&&!url.includes('本机原片')));
    await context.close();
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('本地单HTML从未联网也可加载原PSD模板并导出PNG/JPG', {timeout:60000}, async t=>{
  if(!available)return t.skip('需 Chrome/Playwright');
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const context=await browser.newContext({offline:true}); const page=await context.newPage();
    const external=[];page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
    await page.goto(pathToFileURL(resolve('docs/南铂素人改造离线版.html')).href);
    await uploadAndExport(page,page,true);
    assert.deepEqual(external,[]);
  } finally {await browser.close();}
});
