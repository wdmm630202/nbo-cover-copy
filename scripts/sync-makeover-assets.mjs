import { cp, copyFile, mkdir } from 'node:fs/promises';
await mkdir('docs/makeover', { recursive: true });
await cp('public/makeover', 'docs/makeover', { recursive: true, force: true });
await copyFile('public/makeover-host.mjs', 'docs/makeover-host.mjs');
