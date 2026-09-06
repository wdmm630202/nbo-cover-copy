import Foundation
import CryptoKit

private final class UpdateNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// All cache operations are isolated to this actor. Previously returned roots remain immutable.
actor WebUpdateStore {
    typealias Transport = (URL, Int) async throws -> Data
    static let trustedBase = URL(string: "https://wdmm630202.github.io/nbo-cover-copy/app-updates/")!
    struct Manifest: Codable, Equatable {
        struct File: Codable, Equatable { let path: String; let size: Int; let sha256: String }
        let schema: Int
        let bridgeVersion: Int
        let version: String
        let files: [File]
    }
    enum Failure: LocalizedError {
        case invalid(String)
        var errorDescription: String? { if case .invalid(let reason) = self { return "工作台更新失败：" + reason }; return nil }
    }
    private let bundleRoot: URL
    private let cacheRoot: URL
    private let baseURL: URL
    private let transport: Transport
    private var busy = false
    private static let required: Set<String> = ["cover.html", "cover.css", "cover.js", "cover-core.js", "compare-layout.js", "drop-upload.js", "nanbo-default-watermark.png", "live/controls.js", "live/native.js", "live/save.js", "live/live.css", "live/container.js", "live/export.js", "live/templates.json", "live/cute.png", "live/simple.png", "live/focus.png"]

    init(bundleRoot: URL, cacheRoot: URL, baseURL: URL = WebUpdateStore.trustedBase, transport: Transport? = nil) {
        self.bundleRoot = bundleRoot; self.cacheRoot = cacheRoot.resolvingSymlinksInPath(); self.baseURL = baseURL
        self.transport = transport ?? WebUpdateStore.download
    }

    func currentRoot() -> URL {
        do {
            let pointer = cacheRoot.appendingPathComponent("current")
            let data = try Self.readBounded(pointer, limit: 128)
            guard let generation = String(data: data, encoding: .utf8) else { return bundleRoot }
            let pieces = generation.split(separator: "-", omittingEmptySubsequences: false)
            guard pieces.count == 1 || pieces.count == 2, let first = pieces.first, Self.isHash(String(first)) else { return bundleRoot }
            if pieces.count == 2 {
                let suffix = String(pieces[1])
                guard suffix.utf8.count == 32, Self.isHash(suffix + suffix) else { return bundleRoot }
            }
            let version = String(first)
            let root = cacheRoot.appendingPathComponent("versions", isDirectory: true).appendingPathComponent(generation, isDirectory: true)
            let manifest = try Self.decode(try Self.readBounded(root.appendingPathComponent("manifest.json"), limit: 128 * 1024))
            guard manifest.version == version else { return bundleRoot }
            try Self.verify(root: root, manifest: manifest)
            return root
        } catch { return bundleRoot }
    }

    func refresh() async throws -> URL {
        guard !busy else { throw Failure.invalid("已有更新正在下载。") }
        guard baseURL.absoluteString == Self.trustedBase.absoluteString else { throw Failure.invalid("更新地址不受信任。") }
        busy = true
        defer { busy = false }
        var manifestURL = URLComponents(url: baseURL.appendingPathComponent("manifest.json"), resolvingAgainstBaseURL: false)!
        manifestURL.queryItems = [URLQueryItem(name: "check", value: UUID().uuidString)]
        let manifestData = try await transport(manifestURL.url!, 128 * 1024)
        guard manifestData.count <= 128 * 1024 else { throw Failure.invalid("更新清单过大。") }
        let manifest = try Self.decode(manifestData)
        let versions = cacheRoot.appendingPathComponent("versions", isDirectory: true)
        try FileManager.default.createDirectory(at: versions, withIntermediateDirectories: true)
        var excluded = cacheRoot
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? excluded.setResourceValues(values)
        var destination = versions.appendingPathComponent(manifest.version, isDirectory: true)
        let active = currentRoot()
        if active != bundleRoot, active.deletingLastPathComponent() == versions,
           active.lastPathComponent == manifest.version || active.lastPathComponent.hasPrefix(manifest.version + "-") {
            destination = active
        }
        var reusable = false
        if FileManager.default.fileExists(atPath: destination.path) {
            do {
            let savedManifest = try Self.decode(try Self.readBounded(destination.appendingPathComponent("manifest.json"), limit: 128 * 1024))
            guard savedManifest.version == manifest.version,
                  savedManifest == manifest else { throw Failure.invalid("同一版本的更新内容不一致。") }
            try Self.verify(root: destination, manifest: manifest)
            reusable = true
            } catch {
                // A window may still hold the damaged root. Repair into a fresh generation.
                let generation = manifest.version + "-" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
                destination = versions.appendingPathComponent(generation, isDirectory: true)
            }
        }
        if !reusable {
            let staging = cacheRoot.appendingPathComponent("staging-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: false)
            defer { try? FileManager.default.removeItem(at: staging) }
            for file in manifest.files {
                try Task.checkCancellation()
                let url = baseURL.appendingPathComponent("versions", isDirectory: true).appendingPathComponent(manifest.version, isDirectory: true).appendingPathComponent(file.path)
                let data = try await transport(url, file.size)
                guard data.count == file.size, Self.hash(data) == file.sha256 else { throw Failure.invalid("下载文件校验不通过。") }
                let target = staging.appendingPathComponent(file.path)
                try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: target, options: .withoutOverwriting)
            }
            try manifestData.write(to: staging.appendingPathComponent("manifest.json"), options: .withoutOverwriting)
            try Self.verify(root: staging, manifest: manifest)
            try Task.checkCancellation()
            try FileManager.default.moveItem(at: staging, to: destination)
        }
        try Task.checkCancellation()
        try Data(destination.lastPathComponent.utf8).write(to: cacheRoot.appendingPathComponent("current"), options: .atomic)
        return destination
    }

    private static func isHash(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    private static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private static func decode(_ data: Data) throws -> Manifest {
        let manifest = try JSONDecoder().decode(Manifest.self, from: data)
        guard manifest.schema == 1, manifest.bridgeVersion == 1, isHash(manifest.version), !manifest.files.isEmpty, manifest.files.count <= 128 else { throw Failure.invalid("不支持此更新清单。") }
        var paths = Set<String>(), total = 0
        for file in manifest.files {
            let parts = file.path.split(separator: "/", omittingEmptySubsequences: false)
            guard !file.path.isEmpty, file.path.utf8.count <= 240,
                  file.path.utf8.allSatisfy({ (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || [45,46,47,95].contains($0) }),
                  parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }),
                  file.path != "manifest.json", paths.insert(file.path).inserted,
                  file.size >= 0, file.size <= 8 * 1024 * 1024, isHash(file.sha256) else { throw Failure.invalid("文件路径、大小或校验值无效。") }
            total += file.size
        }
        guard total <= 20 * 1024 * 1024, required.isSubset(of: paths) else { throw Failure.invalid("更新文件不完整或总大小超限。") }
        for path in paths {
            let parts = path.split(separator: "/")
            for index in 1..<parts.count where paths.contains(parts.prefix(index).joined(separator: "/")) { throw Failure.invalid("文件路径相互冲突。") }
        }
        return manifest
    }
    private static func readBounded(_ url: URL, limit: Int) throws -> Data {
        let attributes = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard attributes.isRegularFile == true, attributes.isSymbolicLink != true,
              let size = attributes.fileSize, size <= limit else { throw Failure.invalid("缓存文件无效。") }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: limit + 1) ?? Data()
        guard data.count <= limit else { throw Failure.invalid("缓存文件过大。") }
        return data
    }
    private static func verify(root: URL, manifest: Manifest) throws {
        guard root.resolvingSymlinksInPath().standardizedFileURL == root.standardizedFileURL else { throw Failure.invalid("缓存目录无效。") }
        for file in manifest.files {
            let target = root.appendingPathComponent(file.path)
            guard target.resolvingSymlinksInPath().standardizedFileURL == target.standardizedFileURL else { throw Failure.invalid("缓存路径无效。") }
            let data = try readBounded(target, limit: file.size)
            guard data.count == file.size, hash(data) == file.sha256 else { throw Failure.invalid("缓存文件校验失败。") }
        }
    }
    private static func download(_ url: URL, limit: Int) async throws -> Data {
        guard url.scheme == "https", url.host == trustedBase.host,
              url.absoluteString.hasPrefix(trustedBase.absoluteString) else { throw Failure.invalid("更新地址不受信任。") }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8; configuration.timeoutIntervalForResource = 20
        configuration.urlCache = nil; configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil
        let delegate = UpdateNoRedirect()
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, http.url == url,
              response.expectedContentLength <= Int64(limit) else { throw Failure.invalid("更新服务器响应无效。") }
        var data = Data()
        data.reserveCapacity(min(limit, 128 * 1024))
        for try await byte in bytes {
            guard data.count < limit else { throw Failure.invalid("下载文件超出大小限制。") }
            data.append(byte)
        }
        return data
    }
}
