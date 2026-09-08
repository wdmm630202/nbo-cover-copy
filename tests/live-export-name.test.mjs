import test from 'node:test';
import assert from 'node:assert/strict';
import {getExportFileName,getLiveExportFileName} from '../app/cover/core/export-core.ts';
import {createLiveNameAllocator} from '../public/live/name.js';

test('Live 复用普通封面命名，增加实况live前缀与毫秒',()=>{
 const date=new Date(2026,8,8,12,20,29,123);
 for(const [label,ratio] of [['抖音','9:16'],['小红书','3:4'],['视频号','3:4']]){
  const ordinary=getExportFileName('T62_8222.JPG','设计',label,ratio,'jpeg',date);
  assert.equal(getLiveExportFileName('T62_8222.JPG',label,ratio,date),`实况live_${ordinary.slice(0,-4)}_123.zip`);
 }
 assert.ok(!getLiveExportFileName('../测试:照片.JPG','抖音','9:16',date).match(/[\\/:]/));
});

test('同毫秒并发、重新打开页面和系统时钟回拨仍分配不同名称',async()=>{
 const data=new Map();let wall=new Date(2026,8,8,12,20,29,123).getTime(),queue=Promise.resolve();
 const environment={Date:{now:()=>wall},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},navigator:{locks:{request(_key,fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}}}};
 const format=date=>getLiveExportFileName('T62_8222.JPG','抖音','9:16',date);
 const first=createLiveNameAllocator(environment),second=createLiveNameAllocator(environment);
 const names=await Promise.all(Array.from({length:40},(_,i)=>(i%2?first:second)(format)));
 wall-=3600000;
 names.push(await createLiveNameAllocator(environment)(format));
 assert.equal(new Set(names).size,41);
 assert.match(names[0],/_123\.zip$/);assert.match(names.at(-1),/_163\.zip$/);
});

test('无法读取偏好存储时，本页面连续导出仍防重',async()=>{
 const environment={Date:{now:()=>1788841229123},get localStorage(){throw new Error('blocked');}};
 const allocate=createLiveNameAllocator(environment);
 const values=await Promise.all([allocate(d=>d.getTime()),allocate(d=>d.getTime())]);
 assert.equal(values[1],values[0]+1);
});
