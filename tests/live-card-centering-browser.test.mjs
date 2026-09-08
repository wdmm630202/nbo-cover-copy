import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,executablePath,available} from './helpers/live-browser-driver.mjs';

test('实测文字墨迹在两张虚线卡片内居中，换主题和导出尺寸后仍稳定',async t=>{
 if(!available){t.skip('需本机 Chrome 和 Playwright');return;}
 const root=resolve('docs');
 const server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root+'/'))throw Error('path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000)));
  await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
  await page.getByRole('button',{name:'制作 Live',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.live-play')?.disabled===false);
  await page.evaluate(()=>document.fonts.ready);
  const results=await page.evaluate(()=>{
   const results=[];
   const atlas=liveController.presentation(3).animation.image;
   const sample=document.createElement('canvas');sample.width=480;sample.height=360;
   sample.getContext('2d').drawImage(atlas,1920,1800,480,360,0,0,480,360);
   const pixels=sample.getContext('2d').getImageData(0,0,480,360).data,hero=[];
   for(let y=65;y<294;y++)for(let x=0;x<480;x++)if(pixels[(y*480+x)*4+3]>128)hero.push([x,y]);
   const heroBounds={left:Math.min(...hero.map(p=>p[0])),right:Math.max(...hero.map(p=>p[0]))+1,top:Math.min(...hero.map(p=>p[1])),bottom:Math.max(...hero.map(p=>p[1]))+1};
   for(const width of [540,900,1080,2160])for(const ratio of [16/9,4/3])for(const theme of [
    {topText:'男士素人改造',bottomText:'原来普通男士',subtitle:'也能拍成这样',showDivider:true},
    {topText:'形象',bottomText:'换一种可能',subtitle:'你也可以',showDivider:false},
    {topText:'MEN形象',bottomText:'普通男士',subtitle:'也能这样',showDivider:true},
   ]){
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),strokes=[],ink=[],rows=[];let path=[];let heroDraw;
    const point=(x,y)=>new DOMPoint(x,y).matrixTransform(ctx.getTransform());
    const rect=(x,y,w,h)=>{const a=point(x,y),b=point(x+w,y+h);return {left:a.x,right:b.x,top:a.y,bottom:b.y};};
    const begin=ctx.beginPath.bind(ctx);ctx.beginPath=()=>{path=[];begin();};
    for(const name of ['moveTo','lineTo','quadraticCurveTo']){const f=ctx[name].bind(ctx);ctx[name]=(...args)=>{for(let i=0;i<args.length;i+=2)path.push(point(args[i],args[i+1]));f(...args);};}
    const stroke=ctx.stroke.bind(ctx);ctx.stroke=(...args)=>{if(ctx.globalAlpha>0&&ctx.getLineDash().join(',')==='14,10'&&path.length)strokes.push({left:Math.min(...path.map(p=>p.x)),right:Math.max(...path.map(p=>p.x)),top:Math.min(...path.map(p=>p.y)),bottom:Math.max(...path.map(p=>p.y))});stroke(...args);};
    const fill=ctx.fillText.bind(ctx);ctx.fillText=(text,x,y,max)=>{
     if(ctx.globalAlpha>0&&[theme.topText,theme.bottomText,theme.subtitle].includes(text)){const m=ctx.measureText(text),q=Math.min(1,(max??Infinity)/m.width);ink.push(rect(x-m.actualBoundingBoxLeft*q,y-m.actualBoundingBoxAscent,(m.actualBoundingBoxLeft+m.actualBoundingBoxRight)*q,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent));rows.push({text,x:point(x,y).x,y:point(x,y).y});}
     fill(text,x,y,...(max===undefined?[]:[max]));
    };
    const fillRect=ctx.fillRect.bind(ctx);ctx.fillRect=(x,y,w,h)=>{if(ctx.globalAlpha>0&&h===4&&w>4)ink.push(rect(x,y,w,h));fillRect(x,y,w,h);};
    const drawImage=ctx.drawImage.bind(ctx);ctx.drawImage=(image,...args)=>{if(image===atlas){heroDraw=args;}drawImage(image,...args);};
    const settings={...state,...theme,textStroke:0};
    const draw=time=>NBOCoverCore.drawCover({canvas,image:sample,beforeImage:sample,watermark:null,settings,preset:{id:'douyin',width:1080,height:Math.round(1080*ratio)},outputSize:{width,height:Math.round(width*ratio)},includeGuide:false,live:liveController.presentation(time)});
    draw(3);
    const ordered=strokes.sort((a,b)=>a.left-b.left||a.top-b.top),upper=ordered[0],lower=ordered[1];
    const content={left:Math.min(...ink.map(p=>p.left)),right:Math.max(...ink.map(p=>p.right)),top:Math.min(...ink.map(p=>p.top)),bottom:Math.max(...ink.map(p=>p.bottom))};
    const [sx,sy,sw,sh,dx,dy,dw,dh]=heroDraw;
    const hx=dx+((heroBounds.left+heroBounds.right)/2-(sx%480))*dw/sw;
    const hy=dy+((heroBounds.top+heroBounds.bottom)/2-(sy%360))*dh/sh;
    const first=rows.find(r=>r.text===theme.topText);rows.length=0;draw(.4);
    const firstEarly=rows.find(r=>r.text===theme.topText);
    results.push({width,ratio,theme:theme.topText,dx:(content.left+content.right-upper.left-upper.right)/2,dy:(content.top+content.bottom-lower.top-lower.bottom)/2,heroDx:hx-(upper.left+upper.right)/2,heroDy:hy-(upper.top+upper.bottom)/2,drift:Math.hypot(first.x-firstEarly.x,first.y-firstEarly.y),inside:content.left>lower.left&&content.right<lower.right&&content.top>lower.top&&content.bottom<lower.bottom});
   }return results;
  });
  for(const r of results){
   assert.ok(Math.abs(r.dx)<.1&&Math.abs(r.dy)<.1,`主题卡居中: ${JSON.stringify(r)}`);
   assert.ok(Math.abs(r.heroDx)<r.width/1080&&Math.abs(r.heroDy)<r.width/1080,`主角文字居中: ${JSON.stringify(r)}`);
   assert.ok(r.drift<.1,`已出现文字不能随后续句子跳位: ${JSON.stringify(r)}`);
   assert.ok(r.inside,`文字必须完整处于框内: ${JSON.stringify(r)}`);
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
