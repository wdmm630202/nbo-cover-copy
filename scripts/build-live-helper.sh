#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
build_dir="outputs/live-helper"
app_dir="$build_dir/南铂实况保存助手.app"
mkdir -p "$app_dir/Contents/MacOS" public/live
for arch in arm64 x86_64; do
  xcrun swiftc scripts/live-photo-helper.swift -O -target "$arch-apple-macos13.0" -o "$build_dir/LivePhotoHelper-$arch"
done
xcrun lipo -create "$build_dir/LivePhotoHelper-arm64" "$build_dir/LivePhotoHelper-x86_64" -output "$app_dir/Contents/MacOS/LivePhotoHelper"
cat > "$app_dir/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.nanbostudio.livephoto-helper</string>
<key>CFBundleName</key><string>南铂实况保存助手</string>
<key>CFBundleDisplayName</key><string>南铂实况保存助手</string>
<key>CFBundleExecutable</key><string>LivePhotoHelper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPhotoLibraryAddUsageDescription</key><string>仅在你点击“存入照片”时，将选中的照片和视频配对保存为一张实况照片。</string>
</dict></plist>
PLIST
codesign --force --sign - "$app_dir"
codesign --verify --deep --strict "$app_dir"
ditto -c -k --keepParent "$app_dir" "public/live/南铂实况保存助手.zip"
printf '保存助手已生成：%s\n' "$app_dir"
