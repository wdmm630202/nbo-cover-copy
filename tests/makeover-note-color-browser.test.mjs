import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

// Recoloring the whole fixed template or only changing the UI must fail this test.
for (const mobile of [false, true]) test(`${mobile ? '手机' : '电脑'}备注黑白、自定义及预览吸色同步到成品，其他像素不变`, async t => {
  if (!available) return t.skip('需本机 Chrome 和 Playwright');
  const vite = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: mobile ? {width:390,height:844} : {width:1440,height:1000},
      hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block',
      ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : {}) });
    page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/public/makeover/index.html`);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('请选择'));
    if (mobile) { await page.locator('button[data-tool=tone]').click(); await page.locator('#parameter-select').selectOption('noteColor'); }
    assert.equal(await page.locator('#note-color').count(),1,'应有备注独立选色控件');
    for (const side of [0,1]) {
      const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=180;const x=c.getContext('2d');x.fillStyle='#789abc';x.fillRect(0,0,120,180);return c.toDataURL().split(',')[1]});
      await page.locator(`#photo-${side}`).setInputFiles({name:`note-${side}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')});
    }
    if (mobile) await page.locator('#parameter-select').selectOption('noteColor');
    await page.waitForFunction(()=>!document.querySelector('#export-png').disabled);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.evaluate(()=>{window.readNotePreview=()=>{const c=document.querySelector('#preview'),copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const x=copy.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0);return x.getImageData(0,0,c.width,c.height).data;};window.noteBaseline=window.readNotePreview();});
    await page.locator('[data-note-color="#ffffff"]').click();
    await page.waitForTimeout(60);
    assert.equal(await page.locator('#note-color').inputValue(),'#ffffff');
    const comparison=await page.locator('#preview').evaluate(c=>{
      const before=window.noteBaseline,after=window.readNotePreview();
      let changed=0,outside=0;
      for(let i=0;i<before.length;i+=4){
        if(before[i]===after[i]&&before[i+1]===after[i+1]&&before[i+2]===after[i+2]&&before[i+3]===after[i+3])continue;
        changed++;
        const x=(i/4)%c.width,y=Math.floor(i/4/c.width);
        if(x<104/6000*c.width-2||x>1180/6000*c.width+2||y<299/8000*c.height-2||y>527/8000*c.height+2)outside++;
      }
      return{changed,outside};
    });
    assert.equal(comparison.outside,0,'备注以外像素不应改变');
    assert.ok(comparison.changed>50,'黑白按钮必须实际改变文字像素');
    await page.locator('[data-note-color="#000000"]').click();
    await page.waitForTimeout(60);
    const restored=await page.locator('#preview').evaluate(c=>{
      const current=window.readNotePreview();
      let changed=0,max=0;const examples=[];
      for(let i=0;i<current.length;i++)if(current[i]!==window.noteBaseline[i]){
        changed++;max=Math.max(max,Math.abs(current[i]-window.noteBaseline[i]));
        if(examples.length<5)examples.push({x:Math.floor(i/4)%c.width,y:Math.floor(i/4/c.width),old:window.noteBaseline[i],now:current[i]});
      }
      return{changed,max,examples};
    });
    assert.equal(restored.changed,0,'黑色应恢复原备注显示，其他像素仍相同 '+JSON.stringify(restored));
    await page.locator('#note-color').fill('#17c461');
    await page.locator('#note-color').dispatchEvent('input');
    await page.waitForTimeout(60);
    assert.ok(await page.locator('#preview').evaluate(()=>{
      const values=window.readNotePreview();let difference=0;
      for(let i=0;i<values.length;i+=4)difference=Math.max(difference,values[i+1]-values[i]);
      return difference;
    })>85,'自定义绿色必须实际绘制到文字');
    assert.equal(await page.locator('[data-note-color="#ffffff"]').getAttribute('aria-pressed'),'false');
    await page.locator('#note-pick').click();
    assert.equal(await page.locator('#note-pick').getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#note-color').inputValue(),'#17c461','取消吸色应保留颜色');
    await page.locator('#note-pick').click();
    const bounds=await page.locator('#preview').boundingBox();
    const beforePosition=await page.locator('#adjust-offsetX-value').inputValue();
    await page.mouse.click(bounds.x+bounds.width*.25,bounds.y+bounds.height*.25);
    assert.equal(await page.locator('#note-color').inputValue(),'#789abc','预览吸色应读取实际照片颜色');
    assert.equal(await page.locator('#adjust-offsetX-value').inputValue(),beforePosition,'吸色不得拖动照片');
    for(let i=0;i<4;i++){
      await page.mouse.click(bounds.x+bounds.width*.25,bounds.y+bounds.height*.25);
      assert.equal(await page.locator('#note-pick').getAttribute('aria-pressed'),'true','反复吸色期间保持开启');
    }
    await page.locator('[data-note-color="#000000"]').click();
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(()=>{
      return window.readNotePreview().every((value,i)=>value===window.noteBaseline[i]);
    }),true,'反复吸色后恢复黑色，整张预览仍逐像素相同');
    await page.locator('[data-note-color="#ffffff"]').click();
    for(const format of ['png','jpg']){
      await page.locator(`#export-${format}`).click();
      await page.waitForFunction(()=>document.querySelector('#download-link').getAttribute('href')?.startsWith('blob:'),undefined,{timeout:60000});
      const output=await page.locator('#download-link').evaluate(async a=>{
        const blob=await(await fetch(a.href)).blob(),bitmap=await createImageBitmap(blob);
        const c=document.createElement('canvas');c.width=1076;c.height=228;
        const x=c.getContext('2d');x.drawImage(bitmap,104,299,1076,228,0,0,1076,228);
        const values=x.getImageData(0,0,1076,228).data;let light=0;
        for(let i=0;i<values.length;i+=4)if(values[i]>210&&values[i+1]>215&&values[i+2]>225)light++;
        const result={width:bitmap.width,height:bitmap.height,light,type:blob.type};bitmap.close();return result;
      });
      assert.deepEqual([output.width,output.height],[6000,8000]);
      assert.ok(output.light>1000,`${format}必须含有白色备注，${JSON.stringify(output)}`);
      if(mobile)await page.locator('#mobile-save-close').click();
      else await page.locator('[data-note-color="#000000"]').click();
      if(format==='png')await page.locator('[data-note-color="#ffffff"]').click();
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await vite.close();}
});
