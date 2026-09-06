// WKWebView's reply bridge owns encoding, Live Photo pairing and Photos access.
export function getNativeLiveBridge(environment=globalThis){
  const bridge=environment.webkit?.messageHandlers?.nanboLive;
  return typeof bridge?.postMessage==='function'?bridge:null;
}

const assertActive=signal=>{if(signal?.aborted)throw new DOMException('已取消导出','AbortError');};

export async function exportNativeLive({width,height,renderFrame,onProgress=()=>{},onSaving=()=>{},signal,bridge=getNativeLiveBridge(),createCanvas=()=>document.createElement('canvas')}){
  if(width!==1080||![1440,1920].includes(height))throw new Error('实况尺寸须为 1080×1920 或 1080×1440');
  if(!bridge)throw new Error('无法连接实况保存服务，请重新打开应用');
  assertActive(signal);
  let session=null,canvas=null;
  try{
    // Start immediately from the explicit Save gesture so Photos can ask for access.
    const started=await bridge.postMessage({action:'start',width,height});
    if(typeof started?.session!=='string'||!started.session)throw new Error('实况保存服务未能启动，请重试');
    session=started.session;
    assertActive(signal);
    canvas=createCanvas();canvas.width=width;canvas.height=height;
    onProgress(0);
    for(let index=0;index<90;index++){
      assertActive(signal);
      await renderFrame(canvas,index/30);
      assertActive(signal);
      const encoded=canvas.toDataURL('image/jpeg',0.97);
      const prefix='data:image/jpeg;base64,';
      if(!encoded.startsWith(prefix)||encoded.length===prefix.length)throw new Error('实况画面生成失败，请重试');
      await bridge.postMessage({action:'frame',session,index,jpeg:encoded.slice(prefix.length)});
      assertActive(signal);
      onProgress(Math.floor((index+1)/90*95));
    }
    assertActive(signal);
    onSaving();
    assertActive(signal);
    const result=await bridge.postMessage({action:'finish',session});
    assertActive(signal);
    if(result?.saved!==true)throw new Error('实况未保存到照片，请重试');
    onProgress(100);
    return result;
  }catch(error){
    if(session){try{await bridge.postMessage({action:'cancel',session});}catch{/* Preserve the original failure. */}}
    throw error;
  }finally{
    if(canvas){canvas.width=0;canvas.height=0;}
  }
}
