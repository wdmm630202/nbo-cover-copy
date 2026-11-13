import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { encodePngRows } from '../public/makeover/strip-export.mjs';
import { encodeJpegRows } from '../public/makeover/vendor/jpeg-encoder.mjs';

function pattern(width, y, rows) {
  const bytes = new Uint8Array(width*rows*4);
  for(let row=0;row<rows;row++)for(let x=0;x<width;x++){
    const p=(row*width+x)*4; bytes[p]=(x*7+y+row)%256;bytes[p+1]=(x+y+row*3)%256;bytes[p+2]=(x*11+(y+row)*13)%256;bytes[p+3]=255;
  }
  return bytes;
}

test('stream PNG is lossless across scanline batches, with valid dimensions and bounded row requests', async()=>{
  const width=2053,height=259,requests=[];
  const blob=await encodePngRows(width,height,async(y,rows)=>{requests.push(rows);return pattern(width,y,rows)},()=>{});
  const data=Buffer.from(await blob.arrayBuffer()); assert.equal(data.subarray(1,4).toString(),'PNG');
  let p=8;const idat=[];
  while(p<data.length){const length=data.readUInt32BE(p),type=data.toString('ascii',p+4,p+8),bytes=data.subarray(p+8,p+8+length);if(type==='IHDR'){assert.equal(bytes.readUInt32BE(0),width);assert.equal(bytes.readUInt32BE(4),height)}if(type==='IDAT')idat.push(bytes);p+=length+12;}
  const raw=inflateSync(Buffer.concat(idat));const decoded=Buffer.alloc(width*height*4),stride=width*4;
  for(let y=0;y<height;y++){const from=y*(stride+1);assert.equal(raw[from],1);for(let x=0;x<stride;x++)decoded[y*stride+x]=(raw[from+1+x]+(x>=4?decoded[y*stride+x-4]:0))&255;}
  assert.deepEqual(decoded,Buffer.from(pattern(width,0,height)));
  assert.ok(requests.every(rows=>rows<=128));assert.equal(requests.length,3);
});

test('stream JPEG requests only small row batches and writes quality100 quantization with 4:4:4 sampling', async()=>{
  const blob=await encodeJpegRows(259,131,async(y,rows)=>{assert.ok(rows<=128);return pattern(259,y,rows)});
  const data=Buffer.from(await blob.arrayBuffer());assert.equal(data.readUInt16BE(0),0xffd8);assert.equal(data.readUInt16BE(data.length-2),0xffd9);
  let p=2,quant=false,frame=false;
  while(p<data.length){const marker=data.readUInt16BE(p);if(marker===0xffda)break;const length=data.readUInt16BE(p+2),bytes=data.subarray(p+4,p+2+length);
    if(marker===0xffdb){for(let i=0;i<bytes.length;i+=65)assert.ok(bytes.subarray(i+1,i+65).every(value=>value===1));quant=true}
    if(marker===0xffc0){assert.equal(bytes.readUInt16BE(1),131);assert.equal(bytes.readUInt16BE(3),259);assert.equal(bytes[5],3);assert.equal(bytes[7],0x11);assert.equal(bytes[10],0x11);assert.equal(bytes[13],0x11);frame=true}
    p+=2+length;
  }
  assert.ok(quant&&frame);
});
