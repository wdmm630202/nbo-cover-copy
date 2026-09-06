import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium,executablePath,available } from './helpers/live-browser-driver.mjs';

test('React 实际工作台 Live 反复切换、编辑、动画切换与卸载不会丢失普通设置', {timeout:30000}, async(t)=>{
  if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
  const vite=await createServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});
  await vite.listen();
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
    page.setDefaultTimeout(6000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('nbo-cover-studio-settings-v1',JSON.stringify({textScale:81,bottomTextScale:62,textScaleLinked:false,subtitleScale:130,titleScaleVersion:3,topText:'原来六字以上的标题',bottomText:'原来文案',subtitle:'原来小字'})));
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/tests/fixtures/cover-live.html`);
    const size=page.getByRole('spinbutton',{name:'上行标题大小准确数值',exact:true});
    await page.waitForFunction(()=>document.querySelector('[aria-label="上行标题大小准确数值"]')?.value==='81');
    const originalTitle=await page.getByRole('textbox',{name:'上行主标题',exact:true}).inputValue();
    for(let i=0;i<2;i++) {
      await page.getByRole('button',{name:'制作 Live',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.live-export')?.disabled===false);
      assert.equal(await size.inputValue(),'45');assert.ok(await size.isDisabled());
      assert.equal(await page.getByRole('textbox',{name:'上行主标题',exact:true}).inputValue(),'男士素人改造');
      assert.equal(await page.getByRole('textbox',{name:'下行主标题',exact:true}).inputValue(),'原来普通男生');
      assert.equal(await page.locator('textarea').inputValue(),'也能拍成这样');
      const brightness=page.getByRole('spinbutton',{name:'亮度准确数值',exact:true});
      await brightness.fill(String(92+i));await brightness.press('Enter');
      assert.equal(await brightness.inputValue(),String(92+i));
      if (!await page.locator('.live-details').evaluate(node=>node.open)) await page.locator('.live-details summary').click();
      await page.getByRole('combobox',{name:'Live 动画样式'}).selectOption(i?'simple':'cute');
      await page.waitForFunction(()=>document.querySelector('.live-export')?.disabled===false);
      assert.equal(await page.getByRole('textbox',{name:'上行主标题',exact:true}).inputValue(),'男士素人改造');
      await page.getByRole('button',{name:'关闭 Live',exact:true}).click();
      assert.equal(await size.inputValue(),'81');assert.equal(await size.isDisabled(),false);
      assert.equal(await page.getByRole('textbox',{name:'上行主标题',exact:true}).inputValue(),originalTitle);
    }
    await page.getByRole('button',{name:'制作 Live',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.live-export')?.disabled===false);
    await page.getByRole('button',{name:'恢复默认',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'上行主标题',exact:true}).inputValue(),'男士素人改造');
    await page.getByRole('textbox',{name:'上行主标题',exact:true}).fill('男士形象升级');
    await page.getByRole('button',{name:'关闭 Live',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'上行主标题',exact:true}).inputValue(),'男士形象升级');
    await page.evaluate(()=>window.unmountLiveFixture());
    await page.waitForTimeout(100);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await vite.close();}
});
