import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

const MATRIX = [[320,480],[320,568],[390,844],[640,480],[768,1024],[844,390],[1024,768],[1280,720],[1920,1080]];
const SETTINGS = ['zoom','offsetX','offsetY','rotation','brightness','shade','bottomShade','templateGradient'];
const TARGETS = ['[data-photo-target="0"]','[data-photo-target="1"]','#reset-photo'];
const GRADIENT_PRESETS = [0,25,50,75,100].map(value => `[data-template-gradient-preset="${value}"]`);
const BRUSH = [
  '#brush-toggle', ...['size','feather','strength'].flatMap(key => [`#brush-${key}`,`#brush-${key}-value`,`[data-reset-brush="${key}"]`]),
  '#brush-before','#brush-after','#brush-undo','#brush-clear','#brush-hint',
];

async function settle(frame) {
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertLayout(page, frame, selectors, label) {
  const parent = await page.evaluate(() => {
    const r = document.querySelector('#makeoverFrame').getBoundingClientRect();
    return { top:r.top, bottom:r.bottom, height:innerHeight, overflowX:document.documentElement.scrollWidth-innerWidth, overflowY:document.documentElement.scrollHeight-innerHeight, scrollX, scrollY };
  });
  assert.ok(parent.top >= -1 && parent.bottom <= parent.height + 1 && parent.overflowX <= 1 && parent.overflowY <= 1 && Math.abs(parent.scrollX) <= 1 && Math.abs(parent.scrollY) <= 1,
    `${label}: 父页及iframe应保持一屏 ${JSON.stringify(parent)}`);
  const child = await frame.evaluate(selectors => {
    const rect = element => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
    const poster = rect(document.querySelector('#preview'));
    const controls = selectors.map(selector => {
      const element=document.querySelector(selector), r=rect(element), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2), style=getComputedStyle(element);
      return { selector, ...r, visible:style.display!=='none'&&style.visibility!=='hidden', hit:hit===element||element.contains(hit) };
    });
    return { width:innerWidth,height:innerHeight,poster,controls,overflowX:document.documentElement.scrollWidth-innerWidth,overflowY:document.documentElement.scrollHeight-innerHeight,scrollX,scrollY };
  }, selectors);
  assert.ok(child.poster.width > 0 && child.poster.height > 0 && child.poster.x >= -1 && child.poster.y >= -1 && child.poster.right <= child.width + 1 && child.poster.bottom <= child.height + 1,
    `${label}: 完整海报不能被工具栏裁切 ${JSON.stringify(child.poster)}`);
  assert.ok(Math.abs(child.poster.width/child.poster.height-.75)<.002, `${label}: 海报必须保持3:4`);
  assert.ok(child.overflowX<=1 && child.overflowY<=1 && Math.abs(child.scrollX)<=1 && Math.abs(child.scrollY)<=1,
    `${label}: 工具切换不能引起iframe外层滚动`);
  for (const control of child.controls) {
    assert.ok(control.visible && control.width>0 && control.height>0 && control.x>=-1 && control.y>=-1 && control.right<=child.width+1 && control.bottom<=child.height+1 && control.hit,
      `${label}: ${control.selector}必须可见且中心未被遮挡 ${JSON.stringify(control)}`);
  }
  return child.poster;
}

test('九种窗口中照片、构图、画面和涂抹工具均保留完整预览及可操作控件', {timeout:120000}, async t => {
  if(!available){t.skip('需本机Chrome和Playwright');return;}
  const vite=await createServer({root:resolve('.'),configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});
  let browser;
  try {
    await vite.listen();
    browser=await chromium.launch({executablePath,headless:true});
    for(const [width,height] of MATRIX){
      const page=await browser.newPage({viewport:{width,height},hasTouch:width<1100,isMobile:width<1100,reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      try {
        await page.addInitScript(()=>localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000)));
        await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/docs/cover.html?mode=makeover`);
        const iframe=page.locator('#makeoverFrame');await iframe.waitFor({state:'visible'});
        const frame=await(await iframe.elementHandle()).contentFrame();assert.ok(frame);
        const buffer=Buffer.from(await page.evaluate(()=>{
          const canvas=document.createElement('canvas');canvas.width=120;canvas.height=180;
          const context=canvas.getContext('2d');context.fillStyle='#6b8eaa';context.fillRect(0,0,120,180);
          return canvas.toDataURL('image/png').split(',')[1];
        }),'base64');
        await frame.locator('#photo-0').setInputFiles({name:'before-layout-check.png',mimeType:'image/png',buffer});
        await frame.locator('#photo-1').setInputFiles({name:'after-layout-check.png',mimeType:'image/png',buffer});
        await frame.waitForFunction(()=>!document.querySelector('#export-png').disabled);
        await settle(frame);
        const label=`${width}×${height}`;
        const exports=['#export-png','#export-jpg'];
        if(width<1100){
          const nav=['photos','compose','tone','brush'].map(tool=>`button[data-tool="${tool}"]`);
          for(const tool of ['photos','compose','tone','brush']){
            await frame.locator(`button[data-tool="${tool}"]`).click();
            if(tool==='compose')await frame.locator('#parameter-select').selectOption('rotation');
            if(tool==='tone')await frame.locator('#parameter-select').selectOption('bottomShade');
            await settle(frame);
            const controls=tool==='photos'
              ? ['label[for="photo-0"]','label[for="photo-1"]','[data-edit-photo="0"]','[data-edit-photo="1"]','#split','#equal-split']
              : [...TARGETS,...(tool==='brush'?BRUSH:['#parameter-select',`#adjust-${tool==='compose'?'rotation':'bottomShade'}`,`#adjust-${tool==='compose'?'rotation':'bottomShade'}-value`,`[data-reset-setting="${tool==='compose'?'rotation':'bottomShade'}"]`,...(tool==='compose'?['#rotation-mode','#interaction-help']:[])])];
            await assertLayout(page,frame,[...nav,...exports,...controls],`${label} ${tool}`);
            assert.equal(await frame.locator('.workspace').getAttribute('data-tool'),tool);
            if(tool==='compose'||tool==='tone'){
              assert.equal(await frame.locator('.setting-row:visible').count(),1,`${label}: 手机一次只显示一个参数`);
            }
            if(tool==='tone'){
              await frame.locator('#parameter-select').selectOption('templateGradient');
              await settle(frame);
              await assertLayout(page,frame,[...nav,...exports,...TARGETS,...GRADIENT_PRESETS,'#adjust-templateGradient','#adjust-templateGradient-value','[data-reset-template-gradient]'],`${label} 渐变快捷数值`);
            }
            if(tool==='brush'){
              assert.equal(await frame.locator('.brush-settings').evaluate(details=>details.open),true);
              assert.match(await frame.locator('#brush-hint').textContent(),/涂抹不影响模板渐变/);
            }
          }
        }else{
          assert.equal(await frame.locator('.setting-row:visible').count(),8,`${label}: 桌面同时显示照片参数和独立模板渐变`);
          const controls=SETTINGS.flatMap(key=>[`#adjust-${key}`,`#adjust-${key}-value`,key==='templateGradient'?'[data-reset-template-gradient]':`[data-reset-setting="${key}"]`]);
          const poster=await assertLayout(page,frame,[...exports,...TARGETS,...controls,...GRADIENT_PRESETS,'#rotation-mode','.brush-settings summary'],`${label} 默认调整区`);
          await frame.locator('.brush-settings summary').click();
          for(const selector of BRUSH){
            await frame.locator(selector).scrollIntoViewIfNeeded();
            const current=await assertLayout(page,frame,[selector],`${label} 展开涂抹`);
            for(const key of ['x','y','width','height'])assert.ok(Math.abs(current[key]-poster[key])<=1,`${label}: 右栏内部滚动不能移动海报`);
          }
        }
        assert.deepEqual(errors,[],`${label}: 页面不应出现未处理异常`);
      }finally{await page.close();}
    }
  }finally{await browser?.close();await vite.close();}
});
