import SwiftUI

@main
struct NanboStudioApp: App {
    var body: some Scene {
        WindowGroup {
            StudioWebView()
            #if os(macOS)
                .frame(minWidth: 1000, minHeight: 680)
            #endif
        }
        #if os(macOS)
        .defaultSize(width: 1360, height: 900)
        #endif
    }
}
