import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLiveMovie,readBoxes } from '../public/live/container.js';
const child=(box,type)=>readBoxes(box.slice(8)).find(b=>b.type===type).data;
const v=data=>new DataView(data.buffer,data.byteOffset,data.byteLength);

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
