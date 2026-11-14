import { readFile, writeFile } from 'node:fs/promises';

// The lossless original-pixel atlas is shared by preview/export. Embedded data
// avoids network dependencies without decoding two 48MP images on a phone.
const names = ['atlas', 'note'];
const sources = Object.fromEntries(await Promise.all(names.map(async name => [name,
  `data:image/png;base64,${(await readFile(`public/makeover/assets/template-${name}.png`)).toString('base64')}`,
])));
sources['atlas-manifest'] = JSON.parse(await readFile('public/makeover/assets/template-atlas.json', 'utf8'));
const path = 'public/makeover/index.html';
const html = await readFile(path, 'utf8');
const block = `<script id="template-assets" type="application/json">${JSON.stringify(sources)}</script>`;
const marker = /<script id="template-assets" type="application\/json">[\s\S]*?<\/script>/;
await writeFile(path, marker.test(html) ? html.replace(marker, () => block) : html.replace('  <script type="module"', `  ${block}\n  <script type="module"`));
console.log('Embedded lossless original PSD pixel atlas and note');
