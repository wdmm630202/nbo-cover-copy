#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 native/prepare.py
platform="${1:-macosx}"
xcodebuild -project native/NanboStudio.xcodeproj -scheme NanboStudio -configuration Release -sdk "$platform" -derivedDataPath "work/native-build-$platform" CODE_SIGNING_ALLOWED=NO build
