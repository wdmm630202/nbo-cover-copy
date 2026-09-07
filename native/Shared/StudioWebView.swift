import SwiftUI
import WebKit
import Photos
import ImageIO
#if os(macOS)
import AppKit
#else
import UIKit
#endif

final class BundledSite: NSObject, WKURLSchemeHandler {
    var root: URL
    init(root: URL) { self.root = root.resolvingSymlinksInPath(); super.init() }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == "nbo", url.host == "studio" else { task.didFailWithError(NSError(domain: "本地页面地址无效", code: 1)); return }
        let path = url.path == "/" ? "cover.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/") else { task.didFailWithError(NSError(domain: "页面不可访问", code: 2)); return }
        do {
            let data = try Data(contentsOf: file)
            let mime = ["html":"text/html", "js":"text/javascript", "mjs":"text/javascript", "css":"text/css", "png":"image/png", "jpg":"image/jpeg", "jpeg":"image/jpeg", "webp":"image/webp", "m4a":"audio/mp4", "wav":"audio/wav", "gif":"image/gif", "svg":"image/svg+xml", "woff":"font/woff", "ttf":"font/ttf", "json":"application/json", "woff2":"font/woff2"][file.pathExtension] ?? "application/octet-stream"
            task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": mime + (["html","js","css","json"].contains(file.pathExtension) ? "; charset=utf-8" : ""), "Cache-Control": "no-store"])!)
            task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class StudioCoordinator: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    private let queue = DispatchQueue(label: "com.nanbostudio.encode", qos: .userInitiated)
    private var encoder: LiveEncoder?
    private var session: String?
    private var busy = false
    private var saving = false
    private var stopped = false
    private let diagnostic: Bool
    init(diagnostic: Bool = false) { self.diagnostic = diagnostic; super.init() }
    func shutdown() { queue.async { self.stopped = true; if !self.saving { self.encoder?.cancel(); self.encoder = nil; self.session = nil } } }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url,
              url.scheme == "nbo", url.host == "studio", url.path == "/cover.html",
              let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "此页面没有相册保存权限"); return }
        let reply: (Any?, String?) -> Void = { result, error in DispatchQueue.main.async { replyHandler(result, error) } }
        queue.async { self.handle(action, body: body, reply: reply) }
    }
    private func authorize(_ completion: @escaping (Bool) -> Void) {
        if diagnostic { completion(true); return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in self.queue.async { completion(status == .authorized || status == .limited) } }
    }
    private func handle(_ action: String, body: [String: Any], reply: @escaping (Any?, String?) -> Void) {
        guard !stopped else { reply(nil, "制作页已关闭，请重新打开"); return }
        if action == "start" {
            guard !busy, encoder == nil else { reply(nil, "正在保存，请稍候"); return }
            guard let width = body["width"] as? Int, let height = body["height"] as? Int, ((width == 1080 && [1440,1920].contains(height)) || (width == 2160 && [2880,3840].contains(height))) else { reply(nil, "实况尺寸不受支持"); return }
            let duration = body["duration"] as? Int ?? 3
            guard [2,3,4].contains(duration) else { reply(nil, "实况时长不支持"); return }
            var audioData: Data?
            if let text = body["audioBase64"] as? String {
                guard text.count < 2_700_000, let decoded = Data(base64Encoded: text) else { reply(nil, "配音数据无效"); return }
                audioData = decoded
            }
            busy = true
            authorize { allowed in
                guard !self.stopped, allowed else { self.busy = false; reply(nil, "请在系统设置中允许南铂制作添加照片"); return }
                do { self.encoder = try LiveEncoder(width: width, height: height, duration: duration, audioData: audioData); self.session = UUID().uuidString; reply(["session": self.session!, "version": 3], nil) }
                catch { self.busy = false; reply(nil, "无法开始实况制作，请检查可用空间后重试") }
            }
            return
        }
        if action == "image" {
            guard !busy, encoder == nil, let base64 = body["data"] as? String, base64.count < 90_000_000,
                  let data = Data(base64Encoded: base64), let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1 else { reply(nil, "图片读取失败或正在保存中"); return }
            busy = true
            authorize { allowed in
                guard allowed, !self.stopped else { self.busy = false; reply(nil, "请允许南铂制作添加照片"); return }
                if self.diagnostic { self.busy = false; reply(["saved":false,"diagnostic":true],nil); return }
                PHPhotoLibrary.shared().performChanges({ PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil) }) { success, _ in
                    self.queue.async { self.busy = false; reply(success ? ["saved":true] : nil, success ? nil : "保存失败，请检查照片权限与可用空间") }
                }
            }
            return
        }
        guard let requested = body["session"] as? String, requested == session, let encoder = encoder else { reply(nil, "保存任务已结束，请重新导出"); return }
        if action == "cancel" {
            guard !saving else { reply(nil, "正在写入相册，请等待完成"); return }
            encoder.cancel(); self.encoder = nil; session = nil; busy = false; reply([:], nil); return
        }
        guard !saving else { reply(nil, "正在写入相册，请等待完成"); return }
        if action == "frame" {
            guard let index = body["index"] as? Int, let text = body["jpeg"] as? String, text.count <= 16_000_000, let data = Data(base64Encoded: text) else { reply(nil, "实况画面读取失败"); return }
            do { try encoder.append(jpeg: data, index: index); reply([:], nil) }
            catch { encoder.cancel(); self.encoder = nil; session = nil; busy = false; reply(nil, "实况编码失败，请重试") }
        } else if action == "poster" {
            guard let text = body["jpeg"] as? String, text.count <= 28_000_000, let data = Data(base64Encoded: text) else { reply(nil, "封面照片读取失败"); return }
            do { try encoder.setPoster(jpeg: data); reply([:], nil) }
            catch { reply(nil, "封面照片尺寸或数据无效"); }
        } else if action == "finish" {
            saving = true
            encoder.finish { result in
                self.queue.async {
                    switch result {
                    case .failure:
                        encoder.cleanup(); self.reset(); reply(nil, "实况生成失败，请重试")
                    case .success(let pair):
                        if self.diagnostic {
                            encoder.cleanup(); self.reset(); reply(["saved":false,"diagnostic":true],nil); return
                        }
                        PHPhotoLibrary.shared().performChanges({
                            let request = PHAssetCreationRequest.forAsset()
                            request.addResource(with: .photo, fileURL: pair.photo, options: nil)
                            request.addResource(with: .pairedVideo, fileURL: pair.movie, options: nil)
                        }) { success, _ in self.queue.async { encoder.cleanup(); self.reset(); reply(success ? ["saved":true] : nil, success ? nil : "相册保存失败，请检查照片权限与可用空间") } }
                    }
                }
            }
        } else { reply(nil, "未知操作"); }
    }
    private func reset() { encoder = nil; session = nil; busy = false; saving = false }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, url.scheme == "nbo", url.host == "studio" { decisionHandler(.allow) } else { decisionHandler(.cancel) }
    }
    #if os(macOS)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [.image]; panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }
    #endif
}

private enum AppWebUpdates {
    static let store = WebUpdateStore(
        bundleRoot: Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true),
        cacheRoot: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("NanboStudio/WebUpdates", isDirectory: true))
}

@MainActor
private final class StartupSelection {
    weak var web: WKWebView?
    let site: BundledSite
    private var selected = false
    init(web: WKWebView, site: BundledSite) { self.web = web; self.site = site }
    func select(_ root: URL) {
        guard !selected, let web = web else { return }
        selected = true
        site.root = root.resolvingSymlinksInPath()
        web.load(URLRequest(url: URL(string: "nbo://studio/cover.html")!, cachePolicy: .reloadIgnoringLocalCacheData))
    }
}

@MainActor
func makeStudioWebView(coordinator: StudioCoordinator, rootOverride: URL? = nil, updates: Bool = true) -> WKWebView {
    let config = WKWebViewConfiguration()
    let root = rootOverride ?? Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true)
    let site = BundledSite(root: root)
    config.setURLSchemeHandler(site, forURLScheme: "nbo")
    config.userContentController.addScriptMessageHandler(coordinator, contentWorld: .page, name: "nanboLive")
    config.userContentController.addUserScript(WKUserScript(source: "try { localStorage.setItem('nbo_cover_access_until',String(Date.now()+86400000)); } catch(e) {}", injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = coordinator; web.uiDelegate = coordinator
    let selection = StartupSelection(web: web, site: site)
    if !updates || rootOverride != nil { selection.select(root); return web }
    web.loadHTMLString("<html lang='zh-CN'><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#242321;color:#eee;font:16px -apple-system;display:grid;place-items:center;height:90vh'><div>南铂制作 · 正在检查更新</div></body></html>", baseURL: URL(string: "nbo://studio/startup"))
    Task { @MainActor in
        let previous = await AppWebUpdates.store.currentRoot()
        // The timer picks an existing version; a late download is for the next launch.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            selection.select(previous)
        }
        do { selection.select(try await AppWebUpdates.store.refresh()) }
        catch { selection.select(previous) }
    }
    return web
}

#if os(macOS)
struct StudioWebView: NSViewRepresentable {
    func makeCoordinator() -> StudioCoordinator { StudioCoordinator() }
    func makeNSView(context: Context) -> WKWebView { makeStudioWebView(coordinator: context.coordinator) }
    func updateNSView(_ view: WKWebView, context: Context) {}
    static func dismantleNSView(_ view: WKWebView, coordinator: StudioCoordinator) { view.stopLoading(); view.configuration.userContentController.removeScriptMessageHandler(forName: "nanboLive", contentWorld: .page); coordinator.shutdown() }
}
#else
struct StudioWebView: UIViewRepresentable {
    func makeCoordinator() -> StudioCoordinator { StudioCoordinator() }
    func makeUIView(context: Context) -> WKWebView { makeStudioWebView(coordinator: context.coordinator) }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: StudioCoordinator) { view.stopLoading(); view.configuration.userContentController.removeScriptMessageHandler(forName: "nanboLive", contentWorld: .page); coordinator.shutdown() }
}
#endif
