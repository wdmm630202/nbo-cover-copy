import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSaver, saveLivePair, saveLiveArchive } from '../public/live/save.js';

test('优先使用普通封面同款存储为窗口，不请求文件夹权限',async()=>{
 const name='实况live_T62_8222_设计_抖音_9x16_20260908_122029_123.zip';let written='';
 const handle={name,getFile:async()=>new Blob(),createWritable:async()=>({write:async blob=>{written=await blob.text();},close:async()=>{},abort:async()=>{}})};
 const saver=createLiveSaver({showSaveFilePicker:async options=>{assert.equal(options.suggestedName,name);assert.deepEqual(options.types[0].accept,{'application/zip':['.zip']});return handle;},showDirectoryPicker:()=>assert.fail('不应再打开文件夹授权弹窗')});
 const target=await saver.choose(name);assert.equal(target.kind,'file');
 await saveLiveArchive(target.handle,new Blob(['paired resources']));assert.equal(written,'paired resources');
});

test('已存在的文件在选择后和编码完成后均阻止覆盖',async()=>{
 const handle={getFile:async()=>new Blob(['existing']),createWritable:()=>assert.fail('不能覆盖已存在文件')};
 await assert.rejects(createLiveSaver({showSaveFilePicker:async()=>handle}).choose('test.zip'),/避免覆盖/);
 await assert.rejects(saveLiveArchive(handle,new Blob(['new'])),/避免覆盖/);
});

test('文件保存取消或失败时中止写入，不显示保存成功',async()=>{
 let aborted=false;const controller=new AbortController();
 const handle={getFile:async()=>new Blob(),createWritable:async()=>({write:async()=>{controller.abort();},close:()=>assert.fail('取消后不能提交'),abort:async()=>{aborted=true;}})};
 await assert.rejects(saveLiveArchive(handle,new Blob(['new']),controller.signal),{name:'AbortError'});assert.equal(aborted,true);
 await assert.rejects(createLiveSaver({showSaveFilePicker:async()=>{throw new DOMException('cancel','AbortError');}}).choose('test.zip'),{name:'AbortError'});
});

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
