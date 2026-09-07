import Foundation
import CryptoKit

@main struct WebUpdateSmoke {
    static func main() {
        Task.detached {
            do { try await run(); exit(0) }
            catch { print("FAIL", error); exit(1) }
        }
        dispatchMain()
    }
    static func check(_ flag: Bool, _ reason: String) throws { if !flag { throw WebUpdateStore.Failure.invalid(reason) } }
    static let paths = ["cover.html", "cover.css", "cover.js", "cover-core.js", "compare-layout.js", "drop-upload.js", "nanbo-default-watermark.png", "live/controls.js", "live/native.js", "live/save.js", "live/live.css", "live/container.js", "live/export.js", "live/templates.json", "live/cute.png", "live/simple.png", "live/focus.png"]
    static func manifest(version: String, payload: Data) throws -> Data {
        let digest = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        return try JSONEncoder().encode(WebUpdateStore.Manifest(schema: 1, bridgeVersion: 1, version: version, files: paths.map { .init(path: $0, size: payload.count, sha256: digest) }))
    }
    static func expectFailure(_ action: () async throws -> URL) async throws {
        do { _ = try await action() } catch { return }
        throw WebUpdateStore.Failure.invalid("应拒绝此更新")
    }
    static func run() async throws {
        if CommandLine.arguments.count == 4, CommandLine.arguments[1] == "--online" {
            let bundle = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
            let cache = URL(fileURLWithPath: CommandLine.arguments[3], isDirectory: true)
            let store = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache)
            let downloaded = try await store.refresh()
            try check(await store.currentRoot() == downloaded, "在线缓存验证失败")
            print("ONLINE PASS", downloaded.path)
            return
        }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("NBO-update-smoke-" + UUID().uuidString).resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: root) }
        let bundle = root.appendingPathComponent("bundle"), cache = root.appendingPathComponent("cache")
        try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
        let payload = Data("trusted asset".utf8), a = String(repeating: "a", count: 64), b = String(repeating: "b", count: 64)
        let manifestA = try manifest(version: a, payload: payload), manifestB = try manifest(version: b, payload: payload)
        let good = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { url, _ in url.lastPathComponent == "manifest.json" ? manifestA : payload })
        try check(await good.currentRoot() == bundle, "初次应使用内置版本")
        let saved = try await good.refresh()
        try check(await good.currentRoot() == saved, "更新必须激活")
        try check(try await good.refresh() == saved, "已有版本复用失败")
        let bad = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { url, _ in url.lastPathComponent == "manifest.json" ? manifestB : Data("wrong".utf8) })
        try await expectFailure { try await bad.refresh() }
        try check(await good.currentRoot() == saved, "校验失败改变了当前版本")
        try check(!(try FileManager.default.contentsOfDirectory(atPath: cache.path)).contains(where: { $0.hasPrefix("staging-") }), "失败暂存目录未清理")
        let offline = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { _, _ in throw URLError(.notConnectedToInternet) })
        try await expectFailure { try await offline.refresh() }
        try check(await offline.currentRoot() == saved, "离线丢失缓存")
        for mutate in ["../evil.js", "%2e%2e/evil.js", "https://evil/x", "/absolute", "live//x"] {
            var object = try JSONSerialization.jsonObject(with: manifestB) as! [String: Any]
            var files = object["files"] as! [[String: Any]]; files[0]["path"] = mutate; object["files"] = files
            let malformed = try JSONSerialization.data(withJSONObject: object)
            let store = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { _, _ in malformed })
            try await expectFailure { try await store.refresh() }
        }
        for key in ["bridgeVersion", "schema"] {
            var object = try JSONSerialization.jsonObject(with: manifestB) as! [String: Any]; object[key] = key == "bridgeVersion" ? 4 : 2
            let malformed = try JSONSerialization.data(withJSONObject: object)
            let store = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { _, _ in malformed })
            try await expectFailure { try await store.refresh() }
        }
        for kind in ["duplicate", "missing", "oversize", "total"] {
            var object = try JSONSerialization.jsonObject(with: manifestB) as! [String: Any]
            var files = object["files"] as! [[String: Any]]
            switch kind {
            case "duplicate": files.append(files[0])
            case "missing": files.removeFirst()
            case "oversize": files[0]["size"] = 8 * 1024 * 1024 + 1
            case "total": for i in files.indices { files[i]["size"] = 2 * 1024 * 1024 }
            default: break
            }
            object["files"] = files
            let malformed = try JSONSerialization.data(withJSONObject: object)
            let store = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { _, _ in malformed })
            try await expectFailure { try await store.refresh() }
        }
        let next = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { url, _ in url.lastPathComponent == "manifest.json" ? manifestB : payload })
        let nextRoot = try await next.refresh()
        try check(nextRoot != saved && FileManager.default.fileExists(atPath: saved.path), "更新修改或删除旧版本")
        try Data("corrupt".utf8).write(to: nextRoot.appendingPathComponent("cover.js"))
        try check(await next.currentRoot() == bundle, "损坏缓存未回退")
        let repaired = try await next.refresh()
        let repairedCurrent = await next.currentRoot()
        try check(repaired != nextRoot && repairedCurrent == repaired, "同版本缓存修复未激活新目录")
        try check(try Data(contentsOf: nextRoot.appendingPathComponent("cover.js")) == Data("corrupt".utf8), "修复改变了已返回的目录")
        try check(try Data(contentsOf: saved.appendingPathComponent("cover.js")) == payload, "旧版本发生变化")
        var object = try JSONSerialization.jsonObject(with: manifestB) as! [String: Any]
        object["bridgeVersion"] = 2
        object["version"] = String(repeating: "c", count: 64)
        var cardPaths = paths.filter { !["live/cute.png", "live/simple.png", "live/focus.png"].contains($0) }
        cardPaths += ["live/card-series.js", "live/cards/mix.m4a", "live/cards/voice.m4a", "live/cards/sfx.m4a"]
        for color in ["silver", "champagne", "blue", "green", "clay"] { for density in [0,20,35] { for file in ["0.webp", "1.webp", "poster.webp"] { cardPaths.append("live/cards/\(color)/\(density)/\(file)") } } }
        let digest = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        object["files"] = cardPaths.map { ["path": $0, "size": payload.count, "sha256": digest] as [String: Any] }
        let cardManifest = try JSONSerialization.data(withJSONObject: object)
        let cards = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { url, _ in url.lastPathComponent == "manifest.json" ? cardManifest : payload })
        let cardRoot = try await cards.refresh()
        try check(await cards.currentRoot() == cardRoot, "两秒五色有声资源必须完整激活")
        object["bridgeVersion"] = 3
        object["version"] = String(repeating: "d", count: 64)
        for file in ["mix-intro.m4a", "voice-intro.m4a", "sfx-intro.m4a"] { cardPaths.append("live/cards/\(file)") }
        object["files"] = cardPaths.map { ["path": $0, "size": payload.count, "sha256": digest] as [String: Any] }
        let fourKManifest = try JSONSerialization.data(withJSONObject: object)
        let fourK = WebUpdateStore(bundleRoot: bundle, cacheRoot: cache, transport: { url, _ in url.lastPathComponent == "manifest.json" ? fourKManifest : payload })
        let fourKRoot = try await fourK.refresh()
        try check(await fourK.currentRoot() == fourKRoot, "4K更新必须包含带进场留白的配音")
        print("PASS: bundled fallback, complete activation, reuse, bad hash atomicity, offline cache, staging cleanup, unsafe paths, unsupported schema/bridge, size bounds, immutable generations, corruption fallback, immutable same-version repair")
    }
}
