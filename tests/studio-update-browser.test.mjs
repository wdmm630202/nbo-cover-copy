import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

test('保留旧标签时也能从旧离线缓存更新到新手机导出，且不清除其他项目数据', {timeout:90000}, async t=>{
  if(!available)return t.skip('需Chrome/Playwright');
  const root=resolve('docs');
  const server=createServer(async(req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/nbo-cover-copy\//,'');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.m4a':'audio/mp4'})[extname(name)]||'application/octet-stream');
    if(name==='bootstrap.html')return res.end('<!doctype html><title>缓存回归准备</title>');
    if(name==='stale-worker.js')return res.end(`const old='nanbo-studio-old-fixture';self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(old);await c.put(new URL('./cover.html',self.location),new Response('<h1 id="stale">原片像素导出失败，旧版</h1>',{headers:{'content-type':'text/html'}}));await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname.endsWith('/cover.html'))e.respondWith(caches.open(old).then(c=>c.match(new URL('./cover.html',self.location))))});`);
    const path=resolve(root,name);if(!path.startsWith(root+'/'))return res.writeHead(403).end();
    try{res.end(await readFile(path))}catch{res.writeHead(404).end()}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath,headless:true});
  try{
    const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:430,height:932},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'});
    await context.addInitScript(()=>localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000)));
    const base=`http://127.0.0.1:${server.address().port}/nbo-cover-copy/`,old=await context.newPage();
    await old.goto(base+'bootstrap.html');
    await old.evaluate(async()=>{
      localStorage.setItem('keep-my-settings','unchanged');
      const other=await caches.open('nanbo-studio-other-fixture');await other.put('/another-project/cover.html',new Response('other project'));
      await navigator.serviceWorker.register('./stale-worker.js',{scope:'./'});await navigator.serviceWorker.ready;
    });
    await old.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    await old.goto(base+'cover.html?random-version-does-not-help=1');await old.locator('#stale').waitFor();
    const page=await context.newPage();await page.goto(base+'update.html?mode=makeover');
    await page.waitForURL(/cover\.html.*updated=/,{timeout:20000});
    const frame=await(await page.locator('#makeoverFrame').elementHandle()).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('请选择'));
    assert.match(await frame.locator('#export-version').textContent(),/20261114\.3/);
    const state=await page.evaluate(async()=>({settings:localStorage.getItem('keep-my-settings'),other:await(await caches.open('nanbo-studio-other-fixture')).match('/another-project/cover.html').then(Boolean),stale:await caches.has('nanbo-studio-old-fixture')}));
    assert.deepEqual(state,{settings:'unchanged',other:true,stale:false});
    assert.equal(await old.locator('#stale').count(),1,'无须关闭旧标签');
    const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=160;c.getContext('2d').fillRect(0,0,100,160);return c.toDataURL().split(',')[1]});
    for(let side=0;side<2;side++)await frame.locator('#photo-'+side).setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await frame.waitForFunction(()=>!document.querySelector('#export-png').disabled);
    for(const format of ['png','jpg']){
      await frame.locator('#export-'+format).click();await frame.locator('#mobile-save-preview').waitFor({state:'visible',timeout:30000});
      const dimensions=await frame.locator('#mobile-save-image').evaluate(async image=>{await image.decode();return[image.naturalWidth,image.naturalHeight]});assert.deepEqual(dimensions,[6000,8000]);
      await frame.locator('#mobile-save-close').click();
    }
    await page.evaluate(()=>history.replaceState(null,'','cover.html?mode=makeover&nested-check=1'));
    await Promise.all([page.waitForURL(url=>url.pathname.endsWith('/cover.html')&&url.searchParams.has('updated')),frame.locator('#update-export').click()]);
    await page.locator('#makeoverFrame').waitFor();
    assert.equal(page.frames().length,2,'编辑器内更新必须替换整个工作台，不嵌套第二层工作台');
  }finally{await browser.close();await new Promise(r=>server.close(r))}
});
