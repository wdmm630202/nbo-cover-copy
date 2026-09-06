import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSaver, saveLivePair } from '../public/live/save.js';

test('首次选择桌面，同一页面复用授权目录；不支持时返回下载模式',async()=>{
  let calls=0;
  const directory={requestPermission:async()=> 'granted'};
  const saver=createLiveSaver({showDirectoryPicker:async options=>{calls++;assert.equal(options.startIn,'desktop');assert.equal(options.mode,'readwrite');return directory;}});
  assert.equal(await saver.choose(),directory);assert.equal(await saver.choose(),directory);assert.equal(calls,1);
  assert.equal(await createLiveSaver({}).choose(),null);
});
test('取消和拒绝权限不会继续保存',async()=>{
  const error=new DOMException('取消','AbortError');
  await assert.rejects(createLiveSaver({showDirectoryPicker:async()=>{throw error;}}).choose(),{name:'AbortError'});
  const saver=createLiveSaver({showDirectoryPicker:async()=>({requestPermission:async()=> 'denied'})});
  await saver.choose();await assert.rejects(saver.choose(),/授权/);
});
test('JPG MOV 原数据完整保存，文件夹名称包含唯一标识',async()=>{
  const writes=[];let folderName;
  const root={getDirectoryHandle:async name=>{folderName=name;return {getFileHandle:async name=>({createWritable:async()=>({write:async blob=>writes.push([name,await blob.text()]),close:async()=>{},abort:async()=>{}})})};}};
  const name=await saveLivePair(root,{identifier:'unique-id',name:'南铂_Live_2026.zip',photo:new Blob(['photo']),movie:new Blob(['movie'])});
  assert.equal(name,folderName);assert.match(name,/unique-id/);assert.deepEqual(writes,[['南铂_Live_2026.JPG','photo'],['南铂_Live_2026.MOV','movie']]);
});
test('写入失败会关闭写入流并报错；取消后不创建文件夹',async()=>{
  let aborted=false;
  const root={getDirectoryHandle:async()=>({getFileHandle:async()=>({createWritable:async()=>({write:async()=>{throw new Error('disk full');},close:async()=>{},abort:async()=>{aborted=true;}})})})};
  const result={identifier:'id',name:'test.zip',photo:new Blob(),movie:new Blob()};
  await assert.rejects(saveLivePair(root,result),/未完整保存/);assert.equal(aborted,true);
  const signal=AbortSignal.abort();await assert.rejects(saveLivePair({getDirectoryHandle(){assert.fail('取消后不写入');}},result,signal),{name:'AbortError'});
});
