import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/// Call init/append/finish/cancel/cleanup on one serial background queue.
/// Completion may run on an AVFoundation queue; dispatch back before cleanup.
final class LiveEncoder {
    enum Failure: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
    }
    private let width: Int
    private let height: Int
    private let directory: URL
    private let photo: URL
    private let movie: URL
    private let identifier = UUID().uuidString
    private let writer: AVAssetWriter
    private let video: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private let duration: Int
    private let frameCount: Int
    private var audioReader: AVAssetReader?
    private var audioOutput: AVAssetReaderTrackOutput?
    private var audioInput: AVAssetWriterInput?
    private var nextIndex = 0
    private var finalJPEG: Data?
    private var ended = false

    init(width: Int, height: Int, duration: Int = 3, audioData: Data? = nil) throws {
        guard width == 1080, height == 1920 || height == 1440 else { throw Failure.message("仅支持 1080×1920 或 1080×1440。") }
        guard [2,3,4].contains(duration) else { throw Failure.message("实况时长不支持。") }
        self.duration = duration; self.frameCount = duration * 30
        self.width = width; self.height = height
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("NBO-Live-" + UUID().uuidString, isDirectory: true)
        photo = directory.appendingPathComponent("photo.jpg")
        movie = directory.appendingPathComponent("movie.mov")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        do { writer = try AVAssetWriter(outputURL: movie, fileType: .mov) }
        catch { try? FileManager.default.removeItem(at: directory); throw error }
        video = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 10_000_000,
                AVVideoExpectedSourceFrameRateKey: 30, AVVideoMaxKeyFrameIntervalKey: 30, AVVideoAllowFrameReorderingKey: false]])
        video.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true])
        do {
            guard writer.canAdd(video) else { throw Failure.message("设备无法编码此尺寸的视频。") }
            writer.add(video)
            if let data = audioData {
                guard data.count < 2_000_000 else { throw Failure.message("配音文件过大。") }
                let url = directory.appendingPathComponent("audio.m4a"); try data.write(to: url)
                let asset = AVURLAsset(url: url)
                guard let track = asset.tracks(withMediaType: .audio).first,
                      let rawFormat = track.formatDescriptions.first else { throw Failure.message("配音文件读取失败。") }
                let reader = try AVAssetReader(asset: asset)
                let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
                reader.add(output)
                let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: (rawFormat as! CMFormatDescription))
                input.expectsMediaDataInRealTime = false
                guard writer.canAdd(input) else { throw Failure.message("无法写入配音。") }
                writer.add(input)
                audioReader = reader; audioOutput = output; audioInput = input
            }
            let item = AVMutableMetadataItem()
            item.keySpace = .quickTimeMetadata; item.key = "com.apple.quicktime.content.identifier" as NSString
            item.value = identifier as NSString; item.dataType = "com.apple.metadata.datatype.UTF-8"
            writer.metadata = [item]
            var description: CMFormatDescription?
            let spec: [String: Any] = [
                kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier as String: "mdta/com.apple.quicktime.still-image-time",
                kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType as String: "com.apple.metadata.datatype.int8"]
            guard CMMetadataFormatDescriptionCreateWithMetadataSpecifications(allocator: kCFAllocatorDefault, metadataType: kCMMetadataFormatType_Boxed, metadataSpecifications: [spec] as CFArray, formatDescriptionOut: &description) == noErr else { throw Failure.message("无法创建实况照片标记。") }
            let metadata = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: description)
            guard writer.canAdd(metadata) else { throw Failure.message("无法添加实况照片标记。") }
            let metadataAdaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: metadata)
            writer.add(metadata)
            guard writer.startWriting() else { throw Failure.message("视频编码启动失败。") }
            writer.startSession(atSourceTime: .zero)
            if let reader = audioReader {
                guard reader.startReading() else { throw Failure.message("无法读取配音数据。") }
                if let input = audioInput, let output = audioOutput {
                    input.requestMediaDataWhenReady(on: DispatchQueue(label: "com.nanbostudio.audio")) {
                        while input.isReadyForMoreMediaData {
                            guard reader.status == .reading, let sample = output.copyNextSampleBuffer() else { input.markAsFinished(); return }
                            if !input.append(sample) { reader.cancelReading(); input.markAsFinished(); return }
                        }
                    }
                }
            }
            let time = AVMutableMetadataItem()
            time.keySpace = .quickTimeMetadata; time.key = "com.apple.quicktime.still-image-time" as NSString
            time.value = NSNumber(value: Int8(0)); time.dataType = "com.apple.metadata.datatype.int8"
            guard metadataAdaptor.append(AVTimedMetadataGroup(items: [time], timeRange: CMTimeRange(start: CMTime(value: Int64(frameCount - 1), timescale: 30), duration: CMTime(value: 1, timescale: 30)))) else { throw Failure.message("实况照片标记写入失败。") }
            metadata.markAsFinished()
        } catch {
            writer.cancelWriting(); try? FileManager.default.removeItem(at: directory); throw error
        }
    }

    func append(jpeg: Data, index: Int) throws {
        guard !Thread.isMainThread else { throw Failure.message("请在后台队列生成实况照片。") }
        guard !ended, index == nextIndex, index < frameCount else { throw Failure.message("动画帧顺序错误或任务已经结束。") }
        guard !jpeg.isEmpty, jpeg.count <= 16 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(jpeg as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetType(source) as String? == UTType.jpeg.identifier,
              CGImageSourceGetCount(source) == 1,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let sourceWidth = properties[kCGImagePropertyPixelWidth] as? Int,
              let sourceHeight = properties[kCGImagePropertyPixelHeight] as? Int else { throw Failure.message("帧图片不是有效的 JPEG，或超过 16 MB。") }
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        // Browser canvas exports upright pixels. Reject rotated EXIF to avoid mismatched photo/movie orientation.
        guard sourceWidth == width, sourceHeight == height, orientation == 1 else { throw Failure.message("帧图片尺寸或方向错误，请重新生成。") }
        guard let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { throw Failure.message("无法解码帧图片。") }
        let deadline = Date().addingTimeInterval(10)
        while !video.isReadyForMoreMediaData {
            guard writer.status == .writing else { throw Failure.message("视频编码已经停止。") }
            guard Date() < deadline else { throw Failure.message("视频编码等待超时，请重试。") }
            Thread.sleep(forTimeInterval: 0.002)
        }
        guard let pool = adaptor.pixelBufferPool else { throw Failure.message("无法分配视频帧。") }
        var buffer: CVPixelBuffer?
        let attributes = [kCVPixelBufferPoolAllocationThresholdKey as String: 8] as CFDictionary
        guard CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(nil, pool, attributes, &buffer) == kCVReturnSuccess, let pixel = buffer else { throw Failure.message("视频帧内存不足，请重试。") }
        CVPixelBufferLockBaseAddress(pixel, [])
        defer { CVPixelBufferUnlockBaseAddress(pixel, []) }
        guard let context = CGContext(data: CVPixelBufferGetBaseAddress(pixel), width: width, height: height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixel), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue) else { throw Failure.message("无法绘制视频帧。") }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard adaptor.append(pixel, withPresentationTime: CMTime(value: Int64(index), timescale: 30)) else { throw Failure.message("视频帧写入失败。") }
        if index == frameCount - 1 { finalJPEG = jpeg }
        nextIndex += 1
    }

    func finish(completion: @escaping (Result<(photo: URL, movie: URL), Error>) -> Void) {
        guard !ended, nextIndex == frameCount, let jpeg = finalJPEG else { completion(.failure(Failure.message("需要完整的动画帧才能保存。"))); return }
        ended = true
        guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
              let destination = CGImageDestinationCreateWithURL(photo as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
            cancel(); completion(.failure(Failure.message("无法生成封面照片。"))); return
        }
        CGImageDestinationAddImageFromSource(destination, source, 0, [kCGImagePropertyMakerAppleDictionary: ["17": identifier]] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { cancel(); completion(.failure(Failure.message("封面照片写入失败。"))); return }
        finalJPEG = nil
        video.markAsFinished(); writer.endSession(atSourceTime: CMTime(value: Int64(duration), timescale: 1))
        let writer = self.writer, photo = self.photo, movie = self.movie
        let lock = NSLock()
        var delivered = false
        func deliver(_ result: Result<(photo: URL, movie: URL), Error>) {
            lock.lock()
            guard !delivered else { lock.unlock(); return }
            delivered = true
            lock.unlock()
            completion(result)
        }
        let timeout = DispatchWorkItem {
            lock.lock()
            guard !delivered else { lock.unlock(); return }
            delivered = true
            lock.unlock()
            if writer.status == .writing { writer.cancelWriting() }
            completion(.failure(Failure.message("实况照片编码超时，请重试。")))
        }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 30, execute: timeout)
        writer.finishWriting {
            timeout.cancel()
            if writer.status == .completed { deliver(.success((photo, movie))) }
            else { deliver(.failure(Failure.message("实况照片编码失败，请重试。"))) }
        }
    }

    func cancel() { audioReader?.cancelReading(); ended = true; finalJPEG = nil; if writer.status == .writing { writer.cancelWriting() }; cleanup() }
    func cleanup() { try? FileManager.default.removeItem(at: directory) }
}
