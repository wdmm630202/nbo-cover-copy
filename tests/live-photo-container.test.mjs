import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
let container;
try { container = await import('../public/live/container.js'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const templates = JSON.parse(await readFile(new URL('../public/live/templates.json', import.meta.url), 'utf8'));
const id = '01234567-89ab-4cde-8012-3456789abcde';

test('Live 照片写入 Apple 关联标识，JPEG 像素数据原样保留', () => {
  assert.ok(container, '尚未实现 Apple Live Photo 封装');
  const jpeg = new Uint8Array([255,216,255,224,0,2,255,218,0,2,42,255,217]);
  const paired = container.addLivePhotoMetadata(jpeg, id, 1080, 1920, templates);
  assert.equal(Buffer.from(paired).includes(Buffer.from(id)), true);
  assert.deepEqual(paired.slice(-jpeg.length + 2), jpeg.slice(2));
  assert.equal(new DataView(paired.buffer).getUint32(2 + 58), 1080);
  assert.equal(new DataView(paired.buffer).getUint32(2 + 70), 1920);
});

test('MOV 视频和定格时间元数据分成两条有效轨道，标识与 JPG 一致', () => {
  assert.ok(container, '尚未实现 Apple Live Photo 封装');
  const samples = Array.from({length:90}, (_,i) => ({data:new Uint8Array([0,0,0,1,i]), key:i % 30 === 0}));
  const mov = container.createLiveMovie({ samples, avcConfig:new Uint8Array([1,66,0,40,255]), width:1080, height:1920, assetIdentifier:id, templates });
  const boxes = container.readBoxes(mov);
  assert.deepEqual(boxes.map(b => b.type), ['ftyp','mdat','moov']);
  const moov = boxes.find(b=>b.type==='moov').data;
  const tracks = container.readBoxes(moov.slice(8)).filter(b=>b.type==='trak');
  assert.equal(tracks.length, 2);
  const child=(box,type)=>container.readBoxes(box.slice(8)).find(b=>b.type===type).data;
  const edits=child(child(tracks[1].data,'edts'),'elst');
  assert.equal(new DataView(edits.buffer,edits.byteOffset).getUint32(16),1780,'定格必须在 600 Hz 时间轴的最后一帧，不能退回中间帧');
  const all = Buffer.from(mov);
  assert.ok(all.includes(Buffer.from(id)));
  assert.ok(all.includes(Buffer.from('com.apple.quicktime.still-image-time')));
  assert.ok(!all.includes(Buffer.from('11111111-1111-1111-1111-111111111111')));
  assert.throws(()=>container.createLiveMovie({samples:samples.slice(0,89),avcConfig:new Uint8Array([1]),width:1080,height:1920,assetIdentifier:id,templates}), /90/);
});

test('Live 文件包同时包含同名照片和 MOV，UTF-8 中文文件名可无损解压', () => {
  assert.ok(container, '尚未实现 Apple Live Photo 封装');
  const zip = container.createZip([{ name:'南铂.JPG', data:new Uint8Array([1,2,3]) },{name:'南铂.MOV',data:new Uint8Array([4,5])}]);
  assert.equal(new DataView(zip.buffer).getUint32(0,true), 0x04034b50);
  assert.ok(Buffer.from(zip).includes(Buffer.from('南铂.JPG')));
  assert.ok(Buffer.from(zip).includes(Buffer.from('南铂.MOV')));
  assert.equal(new DataView(zip.buffer).getUint16(zip.length-12,true),2);
});
