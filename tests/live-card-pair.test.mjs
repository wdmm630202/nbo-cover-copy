import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as layout from '../app/cover/core/live-layout.ts';
import {getComparisonEvidenceLayout} from '../app/cover/compare-layout.ts';
import {DEFAULT_COVER_SETTINGS} from '../app/cover/core/editor-settings.ts';
import {cardFrame} from '../public/live/card-series.js';
import {createTraceEnvironment,loadCurrentCore} from './helpers/render-trace-harness.mjs';

test('上下卡片等大且内部间距一致，左右安全线留白对称，整列与素颜框上下对齐',()=>{
 assert.equal(typeof layout.getLiveCardPairLayout,'function','需要从素颜框计算统一的两卡布局');
 for(const width of [540,900,1080,2160])for(const ratio of [16/9,4/3]){
  const size={width,height:Math.round(width*ratio)},guideInset=18*width/1080;
  const s=width/1080;
  const {frame:reference}=getComparisonEvidenceLayout({width:1080,height:size.height/s},114.4);
  const frame={x:reference.x*s,y:reference.y*s,width:reference.width*s,height:reference.height*s};
  const {upper,lower,gap}=layout.getLiveCardPairLayout(frame,width,width/1080);
  for(const a of ['width','height','x'])assert.equal(upper[a],lower[a]);
  assert.equal(upper.y,frame.y);
  assert.ok(Math.abs(lower.y+lower.height-frame.y-frame.height)<1e-6);
  assert.ok(Math.abs(lower.y-upper.y-upper.height-gap)<1e-6);
  assert.ok(Math.abs(frame.x-upper.x-upper.width-gap)<1e-6);
  const leftGuideGap=upper.x-guideInset;
  const rightGuideGap=width-guideInset-frame.x-frame.width;
  assert.ok(leftGuideGap>=0);
  assert.ok(Math.abs(leftGuideGap-rightGuideGap)<1e-6,'左卡片和右素颜框到黄色安全线的距离相同');
 }
});

test('三句依次累加；主角卡在第三句之后入场，最后0.9秒静止',()=>{
 const atlas=[{id:0},{id:1}];
 const first=cardFrame(atlas,.4),second=cardFrame(atlas,.9),third=cardFrame(atlas,1.35);
 assert.deepEqual(first.lines,[1,0,0]);
 assert.deepEqual(second.lines,[1,1,0]);
 assert.deepEqual(third.lines,[1,1,1]);
 assert.equal(third.entrance,0);
 assert.ok(cardFrame(atlas,1.55).entrance>0);
 assert.deepEqual(cardFrame(atlas,2.1),cardFrame(atlas,3));
});

test('两卡文字使用现有可编辑值且随时间显示，导出的虚线仍来自原素颜框',async()=>{
 const source=await readFile(new URL('../docs/cover-core.js',import.meta.url),'utf8');
 for(const time of [.4,.9,1.35,3]){
  const env=createTraceEnvironment(),core=loadCurrentCore(source,env),canvas=env.createCanvas('pair');
  const settings=layout.getLiveSettings({...DEFAULT_COVER_SETTINGS,topText:'商务形象升级',bottomText:'换一种可能',subtitle:'也能拥有气场'});
  const ctx=canvas.getContext('2d'),visible=[],rows=[],dividers=[];
  const fillText=ctx.fillText.bind(ctx);ctx.fillText=(text,...args)=>{if(ctx.globalAlpha>0){visible.push(text);rows.push({text,y:args[1],font:ctx.font});}fillText(text,...args);};
  const fillRect=ctx.fillRect.bind(ctx);ctx.fillRect=(x,y,w,h)=>{if(ctx.globalAlpha>0&&h===4&&w>4)dividers.push({y});fillRect(x,y,w,h);};
  core.drawCover({canvas,image:null,beforeImage:null,watermark:null,settings,preset:{id:'douyin',width:1080,height:1920},includeGuide:false,live:{time:3,animation:cardFrame([{__name:'hero'},{__name:'hero'}],time,true)}});
  assert.ok(visible.includes('商务形象升级'));
  assert.equal(visible.includes('换一种可能'),time>=.9);
  assert.equal(visible.includes('也能拥有气场'),time>=1.35);
  const first=rows.find(r=>r.text==='商务形象升级'),second=rows.find(r=>r.text==='换一种可能'),third=rows.find(r=>r.text==='也能拥有气场');
  if(second)assert.ok(first.y>second.y,'第一句在最下面，第二句在它上面');
  if(third){
   assert.ok(second.y>third.y,'第三句在最上面');
   assert.equal(dividers.length,1);
   assert.ok(third.y<dividers[0].y&&dividers[0].y<second.y,'原渐变装饰线移到第三句下方、第二句上方');
   assert.match(first.font,/^900 /);assert.match(second.font,/^900 /);assert.match(third.font,/^400 /);
  }else assert.equal(dividers.length,0,'装饰线跟随第三句出现');
  assert.equal(env.recorder.log.filter(([name,a,b])=>name==='setLineDash'&&a===14&&b===10).length,time<1.4?2:3,'两卡和素颜框使用相同虚线');
 }
});
