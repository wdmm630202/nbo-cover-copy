import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

// Clearing picker state after any sample must fail: later clicks should still
// recolor the same target, without moving or selecting either photo.
for(const mobile of [false,true])test(`${mobile?'触屏':'鼠标'}备注和渐变可连续吸色，主动完成或Esc后保留最后颜色`,async t=>{
 if(!available)return t.skip('需Chrome/Playwright');
 const server=await createServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/public/makeover/index.html`);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('请选择'));
  for(const [side,color] of [[0,'#df2b43'],[1,'#2483c7']]){
   const data=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=120;c.height=180;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,120,180);return c.toDataURL().split(',')[1]},color);
   await page.locator('#photo-'+side).setInputFiles({name:'吸色测试.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  }
  await page.waitForFunction(()=>!document.querySelector('#export-png').disabled);
  const state=()=>page.evaluate(()=>({values:['zoom','offsetX','offsetY','rotation'].map(k=>document.querySelector('#adjust-'+k+'-value').value),side:[...document.querySelectorAll('[data-photo-target]')].map(b=>b.getAttribute('aria-pressed'))}));
  const position=await state();
  const sample=async(x)=>{const preview=page.locator('#preview');await preview.scrollIntoViewIfNeeded();const b=await preview.boundingBox();const point={x:b.x+b.width*x,y:b.y+b.height*.2};if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  for(const target of ['note','gradient']){
   if(mobile){await page.locator('button[data-tool=tone]').click();await page.locator('#parameter-select').selectOption(target+'Color');}
   const picker=page.locator('#'+target+'-pick'),color=page.locator('#'+target+'-color');
   await picker.click();
   for(const [x,expected] of [[.25,'#df2b43'],[.75,'#2483c7'],[.25,'#df2b43']]){
    await sample(x);
    assert.equal(await color.inputValue(),expected,'每次点击都应采样新的位置');
    assert.equal(await picker.getAttribute('aria-pressed'),'true','吸一次色后不能自动退出');
    assert.equal(await picker.textContent(),'完成吸色','应有明确的完成入口');
    assert.deepEqual(await state(),position,'连续吸色不能移动或切换照片');
   }
   await picker.click();
   assert.equal(await picker.getAttribute('aria-pressed'),'false');assert.equal(await color.inputValue(),'#df2b43','完成后保留最后选色');
   await sample(.75);assert.equal(await color.inputValue(),'#df2b43','退出后照片点击不能继续改色');
   await picker.click();await sample(.75);assert.equal(await color.inputValue(),'#2483c7');
   await page.keyboard.press('Escape');assert.equal(await picker.getAttribute('aria-pressed'),'false');assert.equal(await color.inputValue(),'#2483c7','Esc完成后保留最后选色');
  }
  if(!mobile)for(const target of ['note','gradient']){
   const picker=page.locator('#'+target+'-pick');
   await picker.click();await page.locator('#rotation-mode').click();
   assert.equal(await picker.getAttribute('aria-pressed'),'false','主动进入旋转应结束吸色');
   assert.equal(await page.locator('#rotation-mode').getAttribute('aria-pressed'),'true');
   await page.keyboard.press('Escape');
   if(!await page.locator('.brush-settings').evaluate(d=>d.open))await page.locator('.brush-settings summary').click();
   await picker.click();await page.locator('#brush-toggle').click();
   assert.equal(await picker.getAttribute('aria-pressed'),'false','主动开启涂抹应结束吸色');
   assert.equal(await page.locator('#brush-toggle').getAttribute('aria-pressed'),'true');
   await page.locator('#brush-toggle').click();
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
