// Developer utility: produces metadata-only templates using Apple's public frameworks.
// No Photos library access, user media, network access or system configuration changes.
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let identifier = "11111111-1111-1111-1111-111111111111"
let size = 64
let pixels = [UInt8](repeating: 0, count: size * size * 4)
let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(gray: 0, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: size, height: size))
let destination = CGImageDestinationCreateWithURL(output.appendingPathComponent("template.jpg") as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, [kCGImagePropertyMakerAppleDictionary: ["17": identifier]] as CFDictionary)
precondition(CGImageDestinationFinalize(destination))

let movieURL = output.appendingPathComponent("template.mov")
if FileManager.default.fileExists(atPath: movieURL.path) { try FileManager.default.removeItem(at: movieURL) }
let writer = try AVAssetWriter(outputURL: movieURL, fileType: .mov)
let video = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: size, AVVideoHeightKey: size,
  AVVideoCompressionPropertiesKey: [AVVideoAllowFrameReorderingKey: false, AVVideoMaxKeyFrameIntervalKey: 30]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: size, kCVPixelBufferHeightKey as String: size])
writer.add(video)
let idItem = AVMutableMetadataItem()
idItem.keySpace = .quickTimeMetadata; idItem.key = "com.apple.quicktime.content.identifier" as NSString
idItem.value = identifier as NSString; idItem.dataType = "com.apple.metadata.datatype.UTF-8"
writer.metadata = [idItem]
var description: CMFormatDescription?
let spec: [String: Any] = [
  kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier as String: "mdta/com.apple.quicktime.still-image-time",
  kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType as String: "com.apple.metadata.datatype.int8"]
precondition(CMMetadataFormatDescriptionCreateWithMetadataSpecifications(allocator: kCFAllocatorDefault,
  metadataType: kCMMetadataFormatType_Boxed, metadataSpecifications: [spec] as CFArray, formatDescriptionOut: &description) == noErr)
let metadata = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: description)
let metadataAdaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: metadata)
writer.add(metadata)
precondition(writer.startWriting(), "无法开始写入视频")
writer.startSession(atSourceTime: .zero)
let timeItem = AVMutableMetadataItem()
timeItem.keySpace = .quickTimeMetadata; timeItem.key = "com.apple.quicktime.still-image-time" as NSString
timeItem.value = 0 as NSNumber; timeItem.dataType = "com.apple.metadata.datatype.int8"
precondition(metadataAdaptor.append(AVTimedMetadataGroup(items: [timeItem], timeRange: CMTimeRange(start: CMTime(value: 45, timescale: 30), duration: CMTime(value: 1, timescale: 30)))))
metadata.markAsFinished()
for index in 0..<90 {
  while !video.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.001) }
  var buffer: CVPixelBuffer?
  precondition(CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer) == kCVReturnSuccess)
  CVPixelBufferLockBaseAddress(buffer!, [])
  memset(CVPixelBufferGetBaseAddress(buffer!), 0, CVPixelBufferGetDataSize(buffer!))
  CVPixelBufferUnlockBaseAddress(buffer!, [])
  precondition(adaptor.append(buffer!, withPresentationTime: CMTime(value: Int64(index), timescale: 30)))
}
video.markAsFinished(); writer.endSession(atSourceTime: CMTime(value: 3, timescale: 1))
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
precondition(writer.status == .completed, "视频模板写入失败")
print("Apple metadata templates created")
