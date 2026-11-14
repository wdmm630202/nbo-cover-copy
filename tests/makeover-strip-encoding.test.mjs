import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';
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

test('opaque poster PNG skips only redundant alpha bytes and keeps every RGB value losslessly', async () => {
  const width = 259, height = 131;
  const blob = await encodePngRows(width, height, async (y, rows) => pattern(width, y, rows), () => {}, { opaque: true });
  const data = Buffer.from(await blob.arrayBuffer()), idat = [];
  for (let p = 8; p < data.length;) {
    const length = data.readUInt32BE(p), type = data.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') assert.equal(data[p + 17], 2, '纯不透明成图可省去恒为255的alpha通道');
    if (type === 'IDAT') idat.push(data.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 3, decoded = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    assert.equal(raw[y * (stride + 1)], 1);
    decoded[y * stride + x] = (raw[y * (stride + 1) + x + 1] + (x >= 3 ? decoded[y * stride + x - 3] : 0)) & 255;
  }
  const rgba = pattern(width, 0, height);
  for (let p = 0; p < width * height; p++) for (let channel = 0; channel < 3; channel++) assert.equal(decoded[p * 3 + channel], rgba[p * 4 + channel]);
});

test('opaque PNG refuses transparency instead of silently discarding image data', async () => {
  await assert.rejects(encodePngRows(1, 1, async () => new Uint8Array([10, 20, 30, 254]), () => {}, { opaque: true }), /透明/);
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

test('faster JPEG packing preserves the existing quality100 bitstream, including padding and byte stuffing', async () => {
  // Captured from the shipped encoder, with high-frequency RGB patterns.
  for (const [width, height, expected] of [
    [259, 131, '03f38e74b7b690f2833e85cfe15bffce6b5740ed1ff8bf16204193bab38e49b5'],
    [9, 1, '6eb9b3af1e1e379f1f44a0ebb587be41690de5241bb0532c39737a6a25b7be2f'],
    [2049, 257, '81a921e2f81631c8bf87c3812cb3147d09a883dd6ca77df6c7dcf4b790cf659a'],
  ]) {
    const blob = await encodeJpegRows(width, height, async (y, rows) => pattern(width, y, rows));
    assert.equal(createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'), expected);
  }
});

test('mobile strips avoid repeated scene draws while preserving every PNG pixel across tile boundaries', async t => {
  if (!available) return t.skip('需Chrome/Playwright');
  const server = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen(); browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/public/makeover/index.html`);
    const result = await page.evaluate(async () => {
      const { createStripExport } = await import('./strip-export.mjs');
      const width = 2301, height = 1103;
      const source = document.createElement('canvas'); source.width = width; source.height = height;
      const sx = source.getContext('2d'), pixels = sx.createImageData(width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = (i * 17) % 256; pixels.data[i + 1] = (i * 31) % 256;
        pixels.data[i + 2] = (i * 47) % 256; pixels.data[i + 3] = 255;
      }
      sx.putImageData(pixels, 0, 0);
      const draw = (canvas, region) => {
        const ctx = canvas.getContext('2d'); ctx.save();
        if (region) ctx.translate(-region.x, -region.y);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0); ctx.restore();
      };
      const native = document.createElement('canvas'); native.width = width; native.height = height; draw(native);
      let draws = 0, largest = 0;
      const asset = await createStripExport({ format: 'png', width, height, checkCurrent() {}, render(canvas, region) {
        draws++; largest = Math.max(largest, canvas.width * canvas.height); draw(canvas, region);
      } });
      const image = await createImageBitmap(asset.blob);
      const actual = document.createElement('canvas'); actual.width = width; actual.height = height;
      actual.getContext('2d').drawImage(image, 0, 0); image.close();
      const a = actual.getContext('2d').getImageData(0, 0, width, height).data;
      const b = native.getContext('2d').getImageData(0, 0, width, height).data;
      let changed = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
      return { draws, largest, changed, width: asset.width, height: asset.height };
    });
    assert.deepEqual([result.width, result.height], [2301, 1103]);
    assert.equal(result.changed, 0, '合批绘图不能改变照片采样或产生接缝');
    assert.ok(result.largest <= 1_100_000, '手机不得为提速创建大画布');
    assert.ok(result.draws <= 8, `不应为每次128行编码重复绘制整套场景：${result.draws}`);
  } finally { await browser?.close(); await server.close(); }
});
