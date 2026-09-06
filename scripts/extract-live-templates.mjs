// Run after: swift scripts/generate-live-templates.swift work/live-template
import { readFile, writeFile } from 'node:fs/promises';
import { readBoxes } from '../public/live/container.js';
const child=(box,type)=>readBoxes(box.subarray(8)).find(b=>b.type===type).data;
const movie=new Uint8Array(await readFile('work/live-template/template.mov'));
const parts=readBoxes(movie),moov=parts.find(b=>b.type==='moov').data;
const metadata=readBoxes(moov.subarray(8)).filter(b=>b.type==='trak')[1].data;
const table=child(child(child(metadata,'mdia'),'minf'),'stbl');
const read32=(bytes,offset)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset);
const offset=read32(child(table,'stco'),16),size=read32(child(table,'stsz'),12);
const jpeg=await readFile('work/live-template/template.jpg');
let app1;
for(let i=2;i<jpeg.length&&jpeg[i]===255;) {
  const marker=jpeg[i+1];if(marker===218||marker===217)break;
  const length=jpeg.readUInt16BE(i+2)+2;
  if(marker===225&&jpeg.toString('ascii',i+4,i+8)==='Exif'){app1=jpeg.subarray(i,i+length);break;}
  i+=length;
}
if(!app1||app1.length!==148||app1.toString('ascii',110,146)!=='11111111-1111-1111-1111-111111111111')throw new Error('Apple EXIF 模板布局发生变化，请更新封装器并重新运行原生验证');
const templates={ftyp:parts.find(b=>b.type==='ftyp').data,moov,metadataSample:movie.subarray(offset,offset+size),jpegAPP1:app1};
await writeFile('public/live/templates.json',JSON.stringify(Object.fromEntries(Object.entries(templates).map(([k,v])=>[k,Buffer.from(v).toString('base64')]))));
