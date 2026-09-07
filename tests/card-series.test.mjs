import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CARD_STYLES,cardFrame,cardAudioName } from '../public/live/card-series.js';
import { createLiveMovie,readBoxes } from '../public/live/container.js';
import { createTraceEnvironment,loadCurrentCore } from './helpers/render-trace-harness.mjs';
import { DEFAULT_COVER_SETTINGS } from '../app/cover/core/editor-settings.ts';
import { getLiveSettings,LIVE_DEFAULT_TEXT } from '../app/cover/core/live-layout.ts';
import { getComparisonEvidenceLayout } from '../app/cover/compare-layout.ts';
const child=(box,type)=>readBoxes(box.slice(8)).find(b=>b.type===type).data;
const v=data=>new DataView(data.buffer,data.byteOffset,data.byteLength);

test('五色使用完整两秒帧，边界切帧不越界，向上进入后稳定',()=>{
 assert.equal(CARD_STYLES.length,5);
 const images=[{id:0},{id:1}];
 assert.equal(cardFrame(images,0).entrance,0);
 assert.equal(cardFrame(images,.24).entrance,1);
 assert.equal(cardFrame(images,1).image.id,1);
 assert.deepEqual(cardFrame(images,2).source,{x:1920,y:1800,width:480,height:360});
 assert.deepEqual(cardFrame(images,99),cardFrame(images,2));
 assert.equal(cardAudioName(true,true),'mix');assert.equal(cardAudioName(true,false),'voice');assert.equal(cardAudioName(false,true),'sfx');assert.equal(cardAudioName(false,false),null);
});

test('卡片可见左边与文案对齐，底边与素颜框对齐，9:16和3:4都不侵占相邻区域',async()=>{
 for(const height of [1920,1440]){
  const env=createTraceEnvironment(),core=loadCurrentCore(await readFile(new URL('../docs/cover-core.js',import.meta.url),'utf8'),env);
  const settings=getLiveSettings(DEFAULT_COVER_SETTINGS,LIVE_DEFAULT_TEXT),canvas=env.createCanvas('card');
  const text=core.drawCoverText(canvas.getContext('2d'),settings,1080,height,null);
  core.drawCover({canvas,image:null,beforeImage:null,watermark:null,settings,preset:{id:'douyin',width:1080,height},includeGuide:false,live:{time:3,animation:cardFrame([{__name:'card'},{__name:'card'}],2)}});
  const draw=env.recorder.log.find(([name,img])=>name==='drawImage'&&img==='card'),[x,y,w,h]=draw.slice(6),scale=w/480;
  const {frame}=getComparisonEvidenceLayout({width:1080,height},settings.beforeFrameScale);
  assert.ok(Math.abs(x+9*scale-text.left)<.001);
  assert.ok(Math.abs(y+351*scale-frame.y-frame.height)<.001);
  assert.ok(y+9*scale>=text.bottom+24-.001);
  assert.ok(x+w<frame.x);
  assert.ok(Math.abs(h/w-.75)<.001);
 }
});

test('两秒实况封装三条轨道：视频、最后一帧标记、可解码AAC配音',async()=>{
 const templates=JSON.parse(await readFile(new URL('../public/live/templates.json',import.meta.url),'utf8'));
 const audio=new Uint8Array(await readFile(new URL('../public/live/cards/mix.m4a',import.meta.url)));
 const samples=Array.from({length:60},(_,i)=>({key:i%30===0,data:new Uint8Array([0,0,0,1,i])}));
 for(const withAudio of [false,true]){
  const bytes=createLiveMovie({samples,avcConfig:new Uint8Array([1,66,0,40,255]),width:1080,height:1920,assetIdentifier:'01234567-89ab-4cde-8012-3456789abcde',templates,duration:2,audio:withAudio?audio:null});
  const top=readBoxes(bytes),moov=top.find(b=>b.type==='moov').data,tracks=readBoxes(moov.slice(8)).filter(b=>b.type==='trak');
  assert.equal(v(child(moov,'mvhd')).getUint32(24),1200);
  assert.equal(tracks.length,withAudio?3:2);
  assert.equal(v(child(child(tracks[1].data,'edts'),'elst')).getUint32(16),1180);
  if(withAudio){
   const track=tracks[2].data,mdia=child(track,'mdia');assert.equal(Buffer.from(child(mdia,'hdlr').slice(16,20)).toString(),'soun');
   assert.equal(v(child(track,'tkhd')).getUint32(28),1200);
   assert.equal(v(child(track,'tkhd')).getUint32(20),3);
   const offset=v(child(child(child(mdia,'minf'),'stbl'),'stco')).getUint32(16);
   const sourceTrack=readBoxes(readBoxes(audio).find(b=>b.type==='moov').data.slice(8)).find(b=>b.type==='trak').data;
   const originalOffset=v(child(child(child(child(sourceTrack,'mdia'),'minf'),'stbl'),'stco')).getUint32(16);
   assert.deepEqual(bytes.slice(offset,offset+128),audio.slice(originalOffset,originalOffset+128));
  }
 }
});
