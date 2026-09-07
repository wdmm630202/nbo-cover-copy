// Read-only validation: never requests access to or changes the user's Photos library.
import Foundation
import AppKit
import Photos
import AVFoundation
import ImageIO

let photoURL = URL(fileURLWithPath: CommandLine.arguments[1])
let movieURL = URL(fileURLWithPath: CommandLine.arguments[2])
let image = CGImageSourceCreateWithURL(photoURL as CFURL, nil)!
let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil)! as NSDictionary
let apple = properties[kCGImagePropertyMakerAppleDictionary] as! NSDictionary
let identifier = apple["17"] as! String
let asset = AVURLAsset(url: movieURL)
let idMetadata = asset.metadata(forFormat: .quickTimeMetadata).first { $0.key as? String == "com.apple.quicktime.content.identifier" }
precondition(idMetadata?.stringValue == identifier, "照片与视频关联标识不一致")
let metadataTrack = asset.tracks(withMediaType: .metadata).first!
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: metadataTrack, outputSettings: nil)
reader.add(output); precondition(reader.startReading())
var stillTime: Double = -1
while let buffer = output.copyNextSampleBuffer() {
  if let group = AVTimedMetadataGroup(sampleBuffer: buffer), group.items.contains(where: { $0.key as? String == "com.apple.quicktime.still-image-time" }) {
    stillTime = CMTimeGetSeconds(group.timeRange.start)
  }
}
let expectedDuration = CommandLine.arguments.count > 3 ? Double(CommandLine.arguments[3])! : 3
precondition(abs(CMTimeGetSeconds(asset.duration) - expectedDuration) < 0.001, "视频时长不正确")
precondition(abs(stillTime - (expectedDuration - 1.0 / 30)) < 0.001, "封面标记没有指向最后一帧")
var finished = false
var valid = false
PHLivePhoto.request(withResourceFileURLs: [photoURL, movieURL], placeholderImage: nil, targetSize: .zero, contentMode: .aspectFit) { live, info in
  if (info[PHLivePhotoInfoIsDegradedKey] as? Bool) == true { return }
  valid = live != nil
  print("Photos framework:", valid ? "LIVE_PHOTO_VALID" : "INVALID", info)
  if let live = live { print("Live size:", live.size) }
  finished = true
}
let deadline = Date().addingTimeInterval(30)
while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
precondition(finished && valid, "苹果框架未确认此文件为实况照片")
print("Asset identifier:", identifier, "Still time:", stillTime, "Duration:", CMTimeGetSeconds(asset.duration))
