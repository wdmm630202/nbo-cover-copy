import { cp, mkdir } from 'node:fs/promises';
await mkdir('docs/live',{recursive:true});
await cp('public/live','docs/live',{recursive:true});
