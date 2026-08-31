import { build } from "vite";

await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: "docs",
    lib: {
      entry: "app/cover/core/static-entry.ts",
      name: "NBOCoverCore",
      formats: ["iife"],
      fileName: () => "cover-core.js",
    },
  },
});
