import { build } from 'vite';

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: 'public/makeover',
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: 'app/cover/core/makeover-brush-entry.ts',
      formats: ['es'],
      fileName: () => 'brush-core.mjs',
    },
  },
});
