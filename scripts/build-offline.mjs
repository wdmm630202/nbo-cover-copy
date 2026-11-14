import { readFile, writeFile, readdir, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { execFileSync } from 'node:child_process';

await copyFile('public/studio-offline.js', 'docs/studio-offline.js');
// A real standalone file: no server, JavaScript modules, CDN or initial connection required.
const templateNames = ['fixed', 'gradient', 'fixed-mobile', 'gradient-mobile', 'note'];
const images = await Promise.all(templateNames.map(async name => `data:image/png;base64,${(await readFile(`public/makeover/assets/template-${name}.png`)).toString('base64')}`));
const result = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'standalone-makeover-assets',
  transform(source, id) {
    if (!id.split('?')[0].endsWith('/public/makeover/app.js')) return;
    return templateNames.reduce((text, name, index) => text.replace(`decodeImage('./assets/template-${name}.png' + suffix)`, `decodeImage(${JSON.stringify(images[index])})`).replace(`decodeImage('./assets/template-${name}.png' + '?v=20261114-fast-mobile-export')`, `decodeImage(${JSON.stringify(images[index])})`), source);
  },
}], build: { write: false, minify: false, lib: { entry: 'public/makeover/app.js', name: 'NanboOffline', formats: ['iife'] } } });
const bundle = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code;
let html = await readFile('public/makeover/index.html', 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*>/, `<style>${await readFile('public/makeover/style.css', 'utf8')}</style>`)
  .replace(/<script type="module"[^>]*><\/script>/, () => `<script>${bundle.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/<a class="back"[^>]*>[^<]*<\/a>/, '<span class="back">本地离线版 · 照片仅在本机处理</span>');
const jpegLicense = await readFile('public/makeover/vendor/LICENSE.jpeg-js.txt', 'utf8');
html = html.replace('</head>', `<!-- Third-party encoder notices\n${jpegLicense.replace(/--/g, '—')}\n--></head>`);
await writeFile('docs/南铂素人改造离线版.html', html);
await mkdir('outputs', { recursive: true });
await copyFile('docs/南铂素人改造离线版.html', 'outputs/南铂素人改造离线版.html');

const files = ['cover.html', 'cover.css', 'phone.css', 'creation-modes.css', 'creation-modes.js', 'compare-layout.js', 'drop-upload.js', 'cover-core.js', 'cover.js', 'makeover-host.mjs', 'nanbo-default-watermark.png', 'studio-offline.js', '南铂素人改造离线版.html'];
async function collect(directory) {
  for (const item of await readdir(`docs/${directory}`, { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isDirectory()) await collect(path);
    else if (/\.(?:html|js|mjs|css|png|webp|json|m4a|wav|woff2?)$/.test(path)) files.push(path);
  }
}
await collect('makeover'); await collect('live');
files.push('live/南铂实况保存助手.zip', 'makeover/vendor/LICENSE.jpeg-js.txt');
files.sort();
const integrity = {};
for (const file of files) integrity[file] = createHash('sha256').update(await readFile(`docs/${file}`)).digest('hex');
const hash = createHash('sha256');
// Worker logic changes also require a distinct cache, even if editor assets stay identical.
hash.update(await readFile(new URL(import.meta.url)));
for (const file of files) hash.update(file).update(await readFile(`docs/${file}`));
const version = hash.digest('hex').slice(0, 16);
const worker = `const CACHE = 'nanbo-studio-${version}';
const FILES = ${JSON.stringify(files)};
const INTEGRITY = ${JSON.stringify(integrity)};
const base = new URL('./', self.location.href);
const keyFor = url => { const parsed = new URL(url); return parsed.origin === base.origin && parsed.pathname.startsWith(base.pathname) ? decodeURIComponent(parsed.pathname.slice(base.pathname.length)) : ''; };
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const pending = [...FILES];
  const results = await Promise.allSettled(Array.from({length: 6}, async () => {
    while (pending.length) {
      const name = pending.shift(); const url = new URL(name, base);
      const response = await fetch(url, {cache: 'reload'});
      if (!response.ok || response.type === 'opaque') throw new Error('离线资源读取失败');
      const bytes = await response.clone().arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (digest !== INTEGRITY[name]) throw new Error('离线资源版本不一致');
      await cache.put(url, response);
    }
  }));
  if (results.some(result => result.status === 'rejected')) { await caches.delete(CACHE); throw new Error('离线安装未完成'); }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (!key.startsWith('nanbo-studio-') || key === CACHE) continue;
    const old = await caches.open(key);
    if (await old.match(new URL('cover.html', base))) await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const name = keyFor(event.request.url);
  if (!FILES.includes(name)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(new URL(name, base));
    // Serve one complete verified release. The uncached update page switches releases explicitly.

    if (cached) return cached;
    return fetch(event.request);
  })());
});
`;
await writeFile('docs/studio-sw.js', worker);
await writeFile('docs/studio-release.json', JSON.stringify({ family: 'nanbo-studio', version: '20261114.2', build: version }) + '\n');
// Root hosted apps can also expose the same offline standalone editor.

await copyFile('docs/南铂素人改造离线版.html', 'public/南铂素人改造离线版.html');
execFileSync('python3', ['scripts/package-offline.py', ...files]);
console.log(`Offline release ${version}: ${files.length} editor assets and standalone HTML`);
