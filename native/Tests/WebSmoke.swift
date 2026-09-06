import Foundation
import AppKit
import WebKit

@main
struct WebSmoke {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let coordinator = StudioCoordinator(diagnostic: true)
        let probe = Probe()
        let web = makeStudioWebView(coordinator: coordinator)
        probe.web = web; probe.coordinator = coordinator
        web.navigationDelegate = probe
        let window = NSWindow(contentRect: NSRect(x:0,y:0,width:1360,height:900),styleMask:.borderless,backing:.buffered,defer:false)
        window.contentView = web
        DispatchQueue.main.asyncAfter(deadline: .now()+120) { print("FAIL WebKit timeout"); exit(1) }
        withExtendedLifetime((probe,coordinator,web,window)) { app.run() }
    }
}
final class Probe: NSObject, WKNavigationDelegate {
    var web: WKWebView!
    var coordinator: StudioCoordinator!
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { print("FAIL navigation",error);exit(1) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let js = #"""
        await new Promise(r=>setTimeout(r,500));
        const original = document.querySelector('#coverCanvas');
        if (!original || original.width <= 0 || typeof NBOCoverCore === 'undefined') throw new Error('Editor core did not load');
        const image=document.createElement('canvas');image.width=600;image.height=1000;
        const ctx=image.getContext('2d');ctx.fillStyle='#185f98';ctx.fillRect(0,0,600,1000);ctx.fillStyle='#feba10';ctx.fillRect(0,0,150,250);
        const blob=await new Promise(r=>image.toBlob(r,'image/png'));
        for (const id of ['fileInput','beforeFileInput']) { const dt=new DataTransfer();dt.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.getElementById(id);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true})); }
        await new Promise(r=>setTimeout(r,600));
        document.getElementById('startLive').click();
        for(let i=0;i<100;i++){if(document.querySelector('.live-export') && !document.querySelector('.live-export').disabled)break;await new Promise(r=>setTimeout(r,50));}
        if (!document.querySelector('.live-export') || document.querySelector('.live-export').disabled) throw new Error('Live assets did not load');
        const mod=await import('nbo://studio/live/native.js');
        let frames=0;
        const bridge={postMessage:async message=>{ const r=await window.webkit.messageHandlers.nanboLive.postMessage(message);if(message.action==='frame')frames++;if(r?.diagnostic)return {...r,saved:true};return r; }};
        await mod.exportNativeLive({width:1080,height:1920,bridge,renderFrame(canvas,time){canvas.getContext('2d').drawImage(original,0,0,1080,1920);},onProgress(){}});
        if(frames!==90)throw new Error('Missing frames');
        return {frames,canvasWidth:original.width,canvasHeight:original.height,helperLinks:document.querySelectorAll('.live-helper').length,photosWritten:false};
        """#
        webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): print("PASS WebKit local editor → native encoder",value);exit(0)
            case .failure(let error): print("FAIL WebKit",error);exit(1)
            }
        }
    }
}
