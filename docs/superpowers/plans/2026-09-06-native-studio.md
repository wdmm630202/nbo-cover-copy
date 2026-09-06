# Native Studio Implementation Plan

Goal: provide Mac and iPhone app builds reusing the existing local cover editor, with one Save Live action writing a paired asset to Photos after system authorization.
Architecture: bundled editor served by a WKURLSchemeHandler (no remote privileged content); canvas renders the existing 90-frame timeline; a bounded, sequential WKScriptMessageHandlerWithReply bridge passes JPEG frames to AVAssetWriter. Native code creates matching Apple identifiers and the 89/30 still frame, then saves via PhotoKit add-only authorization. Browser-only routes stay compatible. Photos writes only follow the user's Save action. Diagnostic tests never write to Photos.
Tech stack: SwiftUI, WebKit, AVFoundation, PhotoKit, existing vanilla JS renderer; Xcode 15.2; macOS 13+, iOS 16+.

- [x] Native encoder: compile on macOS/iOS; generate synthetic 90-frame pair; verify with Apple Photos read-only API and metadata checks.
- [x] Local app shell: bundled resource handler, trusted main-frame-only bridge, native save authorization/cancel/errors, file chooser support and bounded frame protocol.
- [x] JS export integration: native route before WebCodecs, no ZIP/directory handling in native app, sequential frames, snapshots and cancellation; browser fallback unchanged. Test bridge sequencing/cancel.
- [x] Build/distribution: reproducible dual-target Xcode project, Mac universal app and iOS unsigned build; package source and instructions. Read signing/device availability without changing accounts. Do not claim iPhone installation without signed device verification.
- [x] Review implementation, run builds and focused existing regression tests; verify Mac WebKit offline bootstrap/render path without accessing user photos. Preserve original web release.

Acceptance: executable Mac app and buildable iOS target; original drawing preserved; native encoding verified at both preset sizes; no network photo transmission; truthful distinction between build verification and actual Photos save / iPhone device acceptance.

Verification: macOS universal and unsigned iphoneos Release builds succeeded; native encoder tests both sizes accepted by PHLivePhoto read-only. WK local full-editor/90-frame bridge diagnostic succeeded without Photos writes. 38 targeted JS/core tests passed; typecheck, lint (existing/generated unused-var warnings only), web build succeeded. Independent review found64MB PNG preflight gap, corrected and rechecked.

Pending outside implementation: user clarified phone unavailable. No signing identities available. iPhone device install and both real Photos writes remain unverified; do not call mobile delivery installed or production-ready. Local branch retained for continuation.
