import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { chromium,executablePath,available } from './helpers/live-browser-driver.mjs';

test('真实工作台 Live 锁定、关闭恢复、照片调整与三行文字编辑', async (t) => {
  if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
  const root=resolve('docs');
  const server=createServer(async(req,res)=>{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
    try{const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('nbo-live-card-v1',JSON.stringify({style:'silver',density:35,voice:true,sfx:true}));localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000));localStorage.setItem('nbo_cover_settings_v1',JSON.stringify({textScale:81,bottomTextScale:62,textScaleLinked:false,subtitleScale:130,titleScaleVersion:3,topText:'原来超出六字标题',bottomText:'原来文案',subtitle:'原来小字'}));});
    await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
    assert.equal(await page.getByRole('button',{name:'制作 Live',exact:true}).count(),1,'工作台需要独立 Live 开关');
    await page.waitForFunction(()=>document.querySelector('#coverCanvas').width>0);
    const before=await page.evaluate(()=>({image:document.querySelector('#coverCanvas').toDataURL(),size:document.querySelector('#textScale').value,small:document.querySelector('#subtitleScale').value,compare:document.querySelector('#compareToggle').checked}));
    await page.getByRole('button',{name:'制作 Live',exact:true}).click();
    await page.getByRole('button',{name:'关闭 Live',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#textScale').value==='45');
    assert.deepEqual(await page.locator('#topText, #bottomText, #subtitle').evaluateAll(nodes=>nodes.map(node=>node.value)),['男士素人改造','原来普通男生','也能拍成这样']);
    assert.equal(await page.locator('#textScale').isDisabled(),true);
    assert.equal(await page.locator('#textScaleValue').isDisabled(),true);
    assert.equal(await page.locator('#subtitleScale').isDisabled(),true);
    assert.equal(await page.locator('#alignBeforeFrame').isDisabled(),true);
    assert.equal(await page.locator('#zoom').isDisabled(),false);
    assert.equal(await page.locator('#brightness').isDisabled(),false);
    assert.equal(await page.locator('#topText').isDisabled(),false);
    // Every shipped color/density must decode, with all settings inside its own card.
    const names=['曜石银','香槟金','雾海蓝','松石绿','赤陶棕'];
    await page.waitForFunction(()=>!document.querySelector('.live-play').disabled);
    const timeline=await page.evaluate(()=>[0,.25,.5,.75,.999,1,1.4,2.5,3].map(t=>{
      const p=liveController.presentation(t);return {phase:NBOCoverCore.getLiveMotionState(p.time).phase,card:!!p.animation,entrance:p.animation?.entrance};
    }));
    assert.deepEqual(timeline.map(f=>f.phase),['before','before','after','after','after','complete','complete','complete','complete'],'前一秒必须播放两段原照片进场');
    assert.deepEqual(timeline.map(f=>f.card),[false,false,false,false,false,true,true,true,true],'卡片只在第1秒结束后出现');
    assert.equal(timeline[5].entrance,0);assert.equal(timeline[6].entrance,1);
    const playback=await page.evaluate(async()=>{
      const start=performance.now();document.querySelector('.live-play').click();
      const initialCard=!!liveController.presentation().animation,phases=new Set();let firstCard=null;
      return await new Promise(resolve=>{const sample=()=>{const elapsed=performance.now()-start,p=liveController.presentation();phases.add(NBOCoverCore.getLiveMotionState(p.time).phase);
        if(p.animation&&firstCard===null)firstCard=elapsed;
        if(elapsed>=3100){resolve({initialCard,phases:[...phases],firstCard});return;}requestAnimationFrame(sample);};sample();});
    });
    assert.equal(playback.initialCard,false,'重播时立即回到照片首帧，不能先闪出卡片');
    assert.deepEqual(playback.phases,['before','after','complete']);
    assert.ok(playback.firstCard>=900&&playback.firstCard<1500,'有声预览也须在1秒后开始卡片');
    await page.evaluate(()=>document.querySelector('.live-status').textContent='文件包已下载；电脑 Chrome 可直接保存到桌面文件夹');
    await page.locator('[data-platform="xiaohongshu"]').click();
    await page.getByRole('button',{name:'导出 Live',exact:true}).click({trial:true,timeout:3000});
    await page.locator('[data-platform="douyin"]').click();
    await page.evaluate(()=>document.querySelector('.live-status').textContent='');



    assert.equal(await page.getByRole('button',{name:'曜石银底色50%',exact:true}).getAttribute('aria-pressed'),'true','旧档位迁移到默认50%');
    const densityButtons=page.locator('.live-card-options:visible .live-card-density button');
    assert.deepEqual(await densityButtons.allTextContents(),['0%','25%','50%','75%','100%']);
    const positions=await densityButtons.evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y,overflow:b.scrollWidth>b.clientWidth};}));
    assert.ok(positions.every(p=>p.y===positions[0].y&&!p.overflow),'五档同排且没有裁字');
    assert.ok(Math.abs(positions[2].x-(positions[0].x+positions[4].x)/2)<1,'50%位于中间');
    const alphaSamples=await page.evaluate(async()=>{
      const {compositeCard}=await import('./live/card-series.js?v=20260908-motion-4k');
      const foreground=document.createElement('canvas'),mask=document.createElement('canvas');foreground.width=mask.width=2;foreground.height=mask.height=1;
      const fg=foreground.getContext('2d');fg.fillStyle='#fff';fg.fillRect(0,0,1,1);
      const m=mask.getContext('2d');m.fillStyle='#fff';m.fillRect(0,0,2,1);
      return [0,25,50,75,100].map(d=>Array.from(compositeCard(foreground,mask,'silver',d).getContext('2d').getImageData(0,0,2,1).data));
    });
    alphaSamples.forEach((pixels,i)=>{assert.deepEqual(pixels.slice(0,4),[255,255,255,255],'文字不跟随底色淡化');assert.ok(Math.abs(pixels[7]-[0,64,128,191,255][i])<=1,'实际底色透明度符合档位');});

    assert.deepEqual(await page.locator('.live-style-card').evaluateAll(cards=>cards.map(c=>c.getAttribute('aria-label'))),names);
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const name of names){
      await page.getByRole('button',{name,exact:true}).click();
      for(const density of [0,25,50,75,100]){
        await page.getByRole('button',{name:`${name}底色${density}%`,exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector('.live-play').disabled);
        assert.equal(await page.locator('.live-card-options:visible').count(),1);
        assert.equal(await page.getByRole('button',{name:`${name}底色${density}%`,exact:true}).getAttribute('aria-pressed'),'true');
      }
    }
    const selected=page.locator('.live-card-options:visible');
    assert.deepEqual(await selected.locator('.live-card-audio button').allTextContents(),['人声','音效','虚线','重播']);
    const dashed=selected.getByRole('button',{name:'虚线',exact:true});
    assert.equal(await dashed.getAttribute('aria-pressed'),'true','虚线默认开启');
    const withBorder=await page.locator('#coverCanvas').evaluate(c=>c.toDataURL());
    await dashed.click();
    assert.equal(await page.evaluate(()=>liveController.presentation(2).animation.dashed),false);
    await page.waitForFunction(before=>document.querySelector('#coverCanvas').toDataURL()!==before,withBorder);
    await dashed.click();
    await page.waitForFunction(before=>document.querySelector('#coverCanvas').toDataURL()===before,withBorder);
    await dashed.click();

    for(const name of ['人声','音效']){
      const button=selected.getByRole('button',{name,exact:true});await button.click();
      assert.equal(await button.getAttribute('aria-pressed'),'false');
    }
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('nbo-live-card-v1'))),{style:'clay',density:100,voice:false,sfx:false,dashed:false,densityVersion:2});
    await page.evaluate(()=>{const zoom=document.querySelector('#zoom');zoom.value=117;zoom.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.deepEqual(await page.locator('#topText, #bottomText, #subtitle').evaluateAll(nodes=>nodes.map(node=>node.value)),['男士素人改造','原来普通男生','也能拍成这样']);
    await page.getByRole('button',{name:'恢复默认',exact:true}).click();
    assert.deepEqual(await page.locator('#topText, #bottomText, #subtitle').evaluateAll(nodes=>nodes.map(node=>node.value)),['男士素人改造','原来普通男生','也能拍成这样']);
    await page.getByRole('button',{name:'关闭 Live',exact:true}).click();
    await page.waitForFunction(value=>document.querySelector('#textScale').value===value,before.size);
    assert.equal(await page.locator('#textScale').isDisabled(),false);
    assert.equal(await page.locator('#subtitleScale').inputValue(),before.small);
    assert.equal(await page.locator('#compareToggle').isChecked(),before.compare);
    assert.equal(await page.locator('#topText').inputValue(),'原来超出六字标题');
    await page.waitForFunction(value=>document.querySelector('#coverCanvas').toDataURL()===value,before.image);
    const pixels=await page.evaluate(async()=>{
      const source=document.createElement('canvas');source.width=800;source.height=1200;
      const ctx=source.getContext('2d');ctx.fillStyle='#c89d54';ctx.fillRect(0,0,800,1200);
      const image=new Image();image.src=source.toDataURL();await image.decode();
      const settings={...state,zoom:123,offsetX:8,offsetY:-3,rotation:8,beforeZoom:125,beforeOffsetX:80,beforeRotation:15,beforeShade:80};
      const draw=time=>{const canvas=document.createElement('canvas');NBOCoverCore.drawCover({canvas,image,beforeImage:image,watermark:null,settings,preset:{id:'douyin',width:1080,height:1920},outputSize:{width:270,height:480},includeGuide:false,live:{time}});return canvas.getContext('2d').getImageData(0,0,270,480).data;};
      const first=draw(0),a=draw(28/30),b=draw(29/30),c=draw(59/30),d=draw(2);
      const delta=(x,y)=>x.reduce((sum,value,index)=>sum+Math.abs(value-y[index]),0)/x.length;
      return {firstCorner:Array.from(first.slice(0,4)),beforeLandingDelta:delta(a,b),afterLandingDelta:delta(c,d)};
    });
    assert.deepEqual(pixels.firstCorner,[200,157,84,255],'素颜首帧必须无留白填满画布');
    assert.ok(pixels.beforeLandingDelta<0.25,`素颜落位产生突变：${pixels.beforeLandingDelta}`);
    assert.equal(pixels.afterLandingDelta,0,'精修落位与完成阶段的照片应逐像素衔接');
    const parity=await page.evaluate(async()=>{
      const source=document.createElement('canvas');source.width=80;source.height=120;
      const ctx=source.getContext('2d');ctx.fillStyle='#688ea0';ctx.fillRect(0,0,80,120);
      ctx.fillStyle='#e0c89e';ctx.fillRect(20,30,40,70);
      const image=new Image();image.src=source.toDataURL();await image.decode();
      const results=[];
      for(const height of [1920,1440]) for(const showDivider of [true,false]) {
        const settings=NBOCoverCore.getLiveSettings({...state,topText:'男士素人改造',bottomText:'原来普通男生',subtitle:'也能拍成这样',showDivider,textStroke:18,textShadow:64,dividerColor:'#c49e67',zoom:116,offsetX:-7,beforeBrightness:92});
        const draw=live=>{const canvas=document.createElement('canvas');NBOCoverCore.drawCover({canvas,image,beforeImage:image,watermark:image,settings,preset:{id:height===1920?'douyin':'xiaohongshu',width:1080,height},includeGuide:false,live});return canvas.getContext('2d').getImageData(0,0,1080,height).data;};
        const normal=draw(undefined),final=draw({time:3});
        results.push({height,showDivider,differentChannels:final.reduce((sum,value,index)=>sum+Number(value!==normal[index]),0)});
      }
      return results;
    });
    for(const result of parity) assert.equal(result.differentChannels,0,`Live 成品的文字、渐变横线、虚线和前后按钮必须复用原显示效果：${JSON.stringify(result)}`);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
});
