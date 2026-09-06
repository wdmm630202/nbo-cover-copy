# Shared web updates

User approved upgrading both native apps to follow website updates. Preserve native Live/PhotoKit and the browser entry.

Architecture: existing native custom-origin bridge remains restricted to local nbo://studio/cover.html. Trusted HTTPS release feed from https://wdmm630202.github.io/nbo-cover-copy/app-updates/ supplies immutable versioned assets, SHA256 manifest, bridge-version compatibility. Fully download+validate before atomically activating. App launch gives the check a bounded 3-second window; after that use last validated cache/bundle and stage update for next launch. Never reload an editing session. Network serves app code only, never photos.

- [ ] Implement bounded updater and malformed/hash/offline/atomic tests.
- [ ] Generate immutable native web releases from same docs source; deploy website and update feed together through one CI workflow.
- [ ] Integrate launch selection, enforce bundle/cached integrity and preserve bridge trust.
- [ ] Build both platforms; test local and downloaded WebKit assets and 90-frame native bridge without Photos writes.
- [ ] Publish feed, check deployed integrity, package version1.1 outputs with honest device-signing limitations.
