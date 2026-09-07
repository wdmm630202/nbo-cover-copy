// WKWebView's reply bridge owns encoding, Live Photo pairing and Photos access.
export function getNativeLiveBridge(environment=globalThis){
  const bridge=environment.webkit?.messageHandlers?.nanboLive;
  return typeof bridge?.postMessage==='function'?bridge:null;
}

const assertActive=signal=>{if(signal?.aborted)throw new DOMException('已取消导出','AbortError');};

export async function exportNativeLive({width,height,renderFrame,onProgress=()=>{},onSaving=()=>{},signal,duration=3,audioURL=null,bridge=getNativeLiveBridge(),createCanvas=()=>document.createElement('canvas')}){
  if(width!==1080||![1440,1920].includes(height))throw new Error('实况尺寸须为 1080×1920 或 1080×1440');
  if(!bridge)throw new Error('无法连接实况保存服务，请重新打开应用');
  assertActive(signal);
  if(![2,3,4].includes(duration))throw new Error('实况视频时长无效');
  const frameCount=duration*30;
  let audioBase64=null;
  if(audioURL){const response=await fetch(audioURL,{signal});if(!response.ok)throw new Error('配音读取失败');const bytes=new Uint8Array(await response.arrayBuffer());audioBase64=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}
  let session=null,canvas=null;
  try{
    // Start immediately from the explicit Save gesture so Photos can ask for access.
    const started=await bridge.postMessage({action:'start',width,height,...(duration!==3||audioBase64?{duration,audioBase64}: {})});
    if(typeof started?.session!=='string'||!started.session)throw new Error('实况保存服务未能启动，请重试');
    session=started.session;
    if((duration!==3||audioBase64)&&started.version!==2)throw new Error('此版本应用尚不支持两秒有声卡片，请更新应用或在浏览器中导出');
    assertActive(signal);
    canvas=createCanvas();canvas.width=width;canvas.height=height;
    onProgress(0);
    for(let index=0;index<frameCount;index++){
      assertActive(signal);
      await renderFrame(canvas,index/30);
      assertActive(signal);
      const encoded=canvas.toDataURL('image/jpeg',0.97);
      const prefix='data:image/jpeg;base64,';
      if(!encoded.startsWith(prefix)||encoded.length===prefix.length)throw new Error('实况画面生成失败，请重试');
      await bridge.postMessage({action:'frame',session,index,jpeg:encoded.slice(prefix.length)});
      assertActive(signal);
      onProgress(Math.floor((index+1)/frameCount*95));
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
