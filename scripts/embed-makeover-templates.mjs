import { readFile, writeFile } from 'node:fs/promises';

// Copy the original PSD PNG bytes into the editor document. A separate image
// request must never block startup or a later export on a slow mobile network.
const names = ['fixed', 'gradient', 'fixed-mobile', 'gradient-mobile', 'note'];
const sources = Object.fromEntries(await Promise.all(names.map(async name => [name,
  `data:image/png;base64,${(await readFile(`public/makeover/assets/template-${name}.png`)).toString('base64')}`,
])));
const path = 'public/makeover/index.html';
const html = await readFile(path, 'utf8');
const block = `<script id="template-assets" type="application/json">${JSON.stringify(sources)}</script>`;
const marker = /<script id="template-assets" type="application\/json">[\s\S]*?<\/script>/;
await writeFile(path, marker.test(html) ? html.replace(marker, () => block) : html.replace('  <script type="module"', `  ${block}\n  <script type="module"`));
console.log('Embedded original PSD templates: five byte-identical PNG resources');
