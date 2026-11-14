# Reliable mobile editor startup and template memory

Authorization: finish the repeated iPhone failures and publish directly; retain original source pixels, lossless PNG, quality100/4:4:4 JPG, original PSD appearance, colors, controls and save flow.

## Confirmed failure boundaries

- The user's green UI, visible standalone header and default desktop export labels are the HTML before app.js executes. Holding only vendor/jpeg-encoder.mjs reproduces that exact state. The template-loading sentence is static HTML, not evidence that image loading has started.
- The hosted iframe currently requires11 requests. Its static module graph blocks preview on the JPEG encoder. Existing inline offline document starts with all those module URLs blocked in830ms locally and only1 request.
- Mobile preview additionally decodes49.8MB of template pixels. Every export adds384MB for two6000x8000 original PSD images. The small export canvas does not bound those decoded source surfaces.

## Implementation

1. Build hosted and React iframe entries from the existing self-contained CSS/IIFE/embedded-data artifact. Keep maintainable modular source files. Correct the pre-application status to startup, and expose bounded Chinese decode errors instead of unresolved image promises.
2. Replace runtime full-template decodes with a lossless original-pixel atlas and metadata. Fixed artwork uses sparse cropped cells with sampling halos. Gradient duplicates identical original columns rather than regenerating its shape. One atlas is shared by preview and export. Original PNG files remain unchanged as the reference.
3. Keep encoding and mobile saving logic. Verify exact source-raster reconstruction, scaled artwork seams, note/gradient recolor, complete PNG/JPG and retry checks, continuous picking, iframe/React parity, offline artifacts and old-cache update.
4. First reproduce tests against old code. New browser regression blocks every subordinate JS/CSS request, requires actual startup, imports photos and decodes saved PNG/JPG. Reject oversized template image decodes in the mobile test to prove the384MB path is gone. Test Chromium and actual desktop WebKit with mobile emulation, and distinguish that from physical iPhone testing.
5. Run build/typecheck/lint/native checks and relevant/full regressions; retain prior rollback tag, review independently, publish, verify production version and full flow with blocked dependencies. Document any remaining environmental limitations without claiming unobserved device success.
