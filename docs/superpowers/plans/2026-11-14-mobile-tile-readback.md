# Mobile export tile readback repair

User acceptance: the entire PNG/JPG must match the edited composition, including all header/border/note/photo/footer pixels. Retain source-resolution sizing, PNG lossless and JPG quality100/4:4:4, filenames, templates and save behavior. Publish directly as already authorized.

Evidence: the supplied 6000x8000 JPEG has RGB=0 regions exactly at x=2048 for y=0..511 and across y=512..1023, including the normally opaque white border. Those are the export canvas tile/batch boundaries. Current JPEG path accepts zero-alpha readbacks and encodes zero RGB as black. Current implementation resizes an accelerated readback canvas before every tile.

## Task 1: reproduce and protect complete pixel readback
- Add browser tests in tests/makeover-tile-readback-browser.test.mjs. Inject an empty getImageData result at the observed tile positions while using the actual PNG/JPG encoders. Require complete expected pixels throughout the decoded output.
- Add a persistent-empty-readback case: reject with a Chinese error and never return a damaged asset. Cover both formats with opaque=true.
- Run the tests against current code and observe failures.
- In public/makeover/strip-export.mjs, establish a bounded readback canvas with willReadFrequently before rendering. Keep its size stable across tiles. Isolate canvas state for every paint. Validate expected opaque readbacks before copying; a transient invalid read recreates the same-size surface and retries up to three attempts, yielding and checking cancellation between attempts. Persistent failure must reject without resizing/quality fallback.
- Run the new tests plus existing lossless PNG, JPEG bitstream, mobile export and photo-operation checks. Run a WebKit composition test and inspect all tile regions in full-size output.

## Task 2: release and verify
- Bump release/cache keys to 20261114.4, rebuild both public/docs and standalone/offline packages. Run build, typecheck, lint and native publisher checks.
- Request independent read-only review. Retain backup tag at e9eeec0 and publish to main.
- Verify deployed version, full-resolution PNG/JPG and retry/failure behavior; document the exact tested browser and that iPhone hardware is not connected. Preserve unrelated docs/og-workbench.png.
