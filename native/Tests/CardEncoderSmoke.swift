import Foundation
import AppKit
import AVFoundation
import Photos
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

@main struct CardEncoderSmoke {
    static func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw LiveEncoder.Failure.message(message) }
    }
    static func makeJPEG(_ width: Int, _ height: Int) -> Data {
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width / 2, height: height))
        context.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
        context.fill(CGRect(x: width / 2, y: 0, width: width / 2, height: height))
        context.setFillColor(CGColor(red: 0, green: 1, blue: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: height / 2, width: width, height: height / 2))
        let data = NSMutableData()
        let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, context.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
        precondition(CGImageDestinationFinalize(destination)); return data as Data
    }
    static func rgb(_ image: CGImage, _ x: Int, _ y: Int) -> [Int] {
        let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        let bytes = context.data!.assumingMemoryBound(to: UInt8.self)
        return (0..<3).map { Int(bytes[(y * image.width + x) * 4 + $0]) }
    }
    static func validate(_ pair: (photo: URL, movie: URL), width: Int, height: Int, duration: Int) throws {
        let source = CGImageSourceCreateWithURL(pair.photo as CFURL, nil)!
        let still = CGImageSourceCreateImageAtIndex(source, 0, nil)!
        try check(still.width == (width == 2160 ? 900 : width), "Poster must preserve independently supplied resolution")
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
        let identifier = (properties[kCGImagePropertyMakerAppleDictionary] as! NSDictionary)["17"] as! String
        let asset = AVURLAsset(url: pair.movie)
        try check(asset.metadata(forFormat: .quickTimeMetadata).first { $0.key as? String == "com.apple.quicktime.content.identifier" }?.stringValue == identifier, "Pair identifier mismatch")
        try check(abs(CMTimeGetSeconds(asset.duration) - Double(duration)) < 0.001, "Duration mismatch")
        let track = asset.tracks(withMediaType: .video).first!
        try check(track.naturalSize == CGSize(width: width, height: height), "Dimensions mismatch")
        try check(asset.tracks(withMediaType: .audio).count == 1, "Missing voice/SFX track")
        let generator = AVAssetImageGenerator(asset: asset)
        generator.requestedTimeToleranceBefore = .zero; generator.requestedTimeToleranceAfter = .zero
        let frame = try generator.copyCGImage(at: CMTime(value: Int64(duration * 30 - 1), timescale: 30), actualTime: nil)
        for (x, y) in [(width / 4, height / 4), (width * 3 / 4, height / 4), (width / 4, height * 3 / 4), (width * 3 / 4, height * 3 / 4)] {
            let a = rgb(still, x * still.width / width, y * still.height / height), b = rgb(frame, x, y)
            try check(zip(a,b).allSatisfy { abs($0 - $1) < 35 }, "Frame orientation/color mismatch: \(a) vs \(b)")
        }
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: asset.tracks(withMediaType: .metadata).first!, outputSettings: nil)
        reader.add(output); try check(reader.startReading(), "Reader failed")
        var marker = -1.0
        while let sample = output.copyNextSampleBuffer() {
            if let group = AVTimedMetadataGroup(sampleBuffer: sample), group.items.contains(where: { $0.key as? String == "com.apple.quicktime.still-image-time" }) { marker = CMTimeGetSeconds(group.timeRange.start) }
        }
        try check(abs(marker - Double(duration * 30 - 1) / 30) < 0.001, "Still time mismatch")
        let videoReader = try AVAssetReader(asset: asset)
        let videoOutput = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        videoReader.add(videoOutput); try check(videoReader.startReading(), "Video reader failed")
        var frames = 0
        while let sample = videoOutput.copyNextSampleBuffer() {
            try check(abs(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) - Double(frames) / 30) < 0.001, "Frame timestamp mismatch frame \(frames): \(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)))")
            frames += 1
        }
        try check(frames == duration * 30, "Frame count mismatch")
    }
    static func main() throws {
        for (width, height, duration) in [(1080,1920,2),(1080,1440,2),(2160,3840,3),(2160,2880,3)] {
            let queue = DispatchQueue(label: "encoder.smoke")
            let done = DispatchSemaphore(value: 0)
            var result: Result<(photo: URL, movie: URL), Error>?
            var encoder: LiveEncoder?
            queue.async {
                do {
                    let item = try LiveEncoder(width: width, height: height, duration: duration, audioData: try Data(contentsOf: URL(fileURLWithPath: duration == 3 ? "public/live/cards/mix-intro.m4a" : "public/live/cards/mix.m4a"))); encoder = item
                    let jpeg = makeJPEG(width, height)
                    do { try item.append(jpeg: jpeg, index: 1); throw LiveEncoder.Failure.message("Accepted out of sequence frame") } catch { if (error as NSError).localizedDescription == "Accepted out of sequence frame" { throw error } }
                    for index in 0..<(duration * 30) { try autoreleasepool { try item.append(jpeg: jpeg, index: index) } }
                    if width == 2160 { try item.setPoster(jpeg: makeJPEG(900, height == 3840 ? 1600 : 1200)) }
                    item.finish { result = $0; done.signal() }
                } catch { result = .failure(error); done.signal() }
            }
            try check(done.wait(timeout: .now() + 120) == .success, "Encoding timed out")
            let pair = try result!.get()
            defer { queue.sync { encoder?.cleanup() } }
            try validate(pair, width: width, height: height, duration: duration)
            var finished = false, valid = false
            PHLivePhoto.request(withResourceFileURLs: [pair.photo, pair.movie], placeholderImage: nil, targetSize: .zero, contentMode: .aspectFit) { live, info in
                if (info[PHLivePhotoInfoIsDegradedKey] as? Bool) == true { return }
                valid = live != nil; finished = true
                print("Photos", height, info)
            }
            let deadline = Date().addingTimeInterval(30)
            while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
            try check(finished && valid, "Photos framework rejected Live Photo")
            print("PASS \(width)×\(height): \(duration * 30) frames, \(duration)s, separate poster, paired ID, final-frame marker, PHLivePhoto")
        }
    }
}
