import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
await mkdir('docs/makeover', { recursive: true });
await cp('public/makeover', 'docs/makeover', { recursive: true, force: true, filter: source => !source.endsWith('/editor.html') });
await rm('docs/makeover/editor.html', { force: true });
await copyFile('public/makeover-host.mjs', 'docs/makeover-host.mjs');
