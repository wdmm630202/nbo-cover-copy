// Local companion: validates selected resources, then saves only on the user's explicit click.
import AppKit
import Photos
import PhotosUI

final class LivePhotoHelper: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private let preview = PHLivePhotoView()
    private let message = NSTextField(wrappingLabelWithString: "先解压工作台导出的 Live 文件包，再选择包含 JPG 和 MOV 的文件夹。")
    private let save = NSButton(title: "存入照片", target: nil, action: nil)
    private let choose = NSButton(title: "选择已解压的文件夹", target: nil, action: nil)
    private var resources: [URL] = []
    private var requestID: PHLivePhotoRequestID?
    private var selection = UUID()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "退出南铂实况保存助手", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 450, height: 660), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "南铂实况保存助手"
        window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: "把 Live 存入苹果「照片」")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        let subtitle = NSTextField(wrappingLabelWithString: "照片只在这台 Mac 上处理。保存后可通过 iCloud 照片同步至 iPhone。")
        subtitle.textColor = .secondaryLabelColor
        preview.contentMode = .aspectFit
        preview.translatesAutoresizingMaskIntoConstraints = false
        preview.heightAnchor.constraint(equalToConstant: 360).isActive = true
        preview.widthAnchor.constraint(equalToConstant: 380).isActive = true
        choose.target = self; choose.action = #selector(selectFolder)
        save.target = self; save.action = #selector(saveToPhotos)
        save.isEnabled = false
        choose.bezelStyle = .rounded; save.bezelStyle = .rounded
        message.textColor = .secondaryLabelColor
        let buttons = NSStackView(views: [choose, save]); buttons.spacing = 12
        let stack = NSStackView(views: [title, subtitle, preview, message, buttons])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 30),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -30),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 26),
        ])
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func selectFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "选择此文件夹"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let folder = panel.url else { return }
            if let id = self.requestID { PHLivePhoto.cancelRequest(withRequestID: id) }
            self.selection = UUID(); let current = self.selection
            self.save.isEnabled = false; self.resources = []; self.preview.livePhoto = nil
            do {
                let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
                    .filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }
                let pairs = files.filter { ["jpg", "jpeg"].contains($0.pathExtension.lowercased()) }.compactMap { photo -> [URL]? in
                    guard let movie = files.first(where: { $0.pathExtension.lowercased() == "mov" && $0.deletingPathExtension().lastPathComponent == photo.deletingPathExtension().lastPathComponent }) else { return nil }
                    return [photo, movie]
                }
                guard pairs.count == 1, let pair = pairs.first else {
                    self.message.stringValue = "请选择只包含一组同名 JPG 和 MOV 的文件夹。"; return
                }
                self.message.stringValue = "正在验证实况文件…"
                self.requestID = PHLivePhoto.request(withResourceFileURLs: pair, placeholderImage: nil, targetSize: .zero, contentMode: .aspectFit) { live, info in
                    if (info[PHLivePhotoInfoIsDegradedKey] as? Bool) == true { return }
                    DispatchQueue.main.async {
                        guard current == self.selection else { return }
                        guard let live = live else { self.message.stringValue = "文件未通过苹果实况验证，请从工作台重新导出。"; return }
                        self.preview.livePhoto = live; self.resources = pair; self.save.isEnabled = true
                        self.message.stringValue = "验证通过。可按住预览播放；点击「存入照片」后才会写入相册。"
                        self.preview.startPlayback(with: .full)
                    }
                }
            } catch { self.message.stringValue = "无法读取该文件夹，请重新选择。" }
        }
    }

    @objc private func saveToPhotos() {
        guard resources.count == 2 else { return }
        let pair = resources
        save.isEnabled = false; choose.isEnabled = false
        message.stringValue = "正在请求添加到照片的权限…"
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { authorization in
            guard authorization == .authorized || authorization == .limited else {
                DispatchQueue.main.async {
                    self.message.stringValue = "没有获得添加照片权限。可在系统设置中允许本助手添加照片后重试。"
                    self.save.isEnabled = true; self.choose.isEnabled = true
                }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let creation = PHAssetCreationRequest.forAsset()
                creation.addResource(with: .photo, fileURL: pair[0], options: nil)
                creation.addResource(with: .pairedVideo, fileURL: pair[1], options: nil)
            }) { success, _ in
                DispatchQueue.main.async {
                    self.choose.isEnabled = true; self.save.isEnabled = !success
                    self.message.stringValue = success
                        ? "已作为一张实况照片存入苹果「照片」。在 iPhone 上需等待 iCloud 照片同步完成。"
                        : "保存失败。请确认磁盘空间和照片权限，再重试。"
                }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        if let id = requestID { PHLivePhoto.cancelRequest(withRequestID: id) }
    }
}

let application = NSApplication.shared
let delegate = LivePhotoHelper()
application.delegate = delegate
application.run()
