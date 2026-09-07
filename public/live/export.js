import { addLivePhotoMetadata, createLiveMovie, createZip } from './container.js';

const abortError = () => new DOMException('已取消实况导出', 'AbortError');
const assertActive = signal => { if(signal?.aborted)throw abortError(); };
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('视频编码等待过久，请重试')),30000);})]); }
  finally { clearTimeout(timer); }
}

export async function exportLivePhoto({width,height,renderFrame,onProgress=()=>{},signal,assetBase=new URL('./',import.meta.url),duration=3,audioURL=null,audioDelay=0}) {
  assertActive(signal);
  if(![2,3,4].includes(duration))throw new Error('实况视频时长无效');
  const frameCount=duration*30;
  let audio=null;
  if(audioURL){const response=await fetch(audioURL,{signal});if(!response.ok)throw new Error('配音加载失败，请重试');audio=new Uint8Array(await response.arrayBuffer());}
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw new Error('此浏览器暂不支持实况编码，请在最新版 Chrome 或 Safari 中打开工作台');
  const config={codec:'avc1.420028',width,height,bitrate:6_000_000,framerate:30,latencyMode:'realtime',avc:{format:'avc'}};
  const support=await VideoEncoder.isConfigSupported(config);
  if(!support.supported)throw new Error('当前设备不支持此尺寸的实况编码，请用电脑端 Chrome 导出');
  const response=await fetch(new URL('templates.json',assetBase),{signal});
  if(!response.ok)throw new Error('实况导出组件加载失败，请刷新重试');
  const templates=await response.json();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const samples=[];let avcConfig=null,failure=null,jpeg=null,previousTimestamp=-1;
  const codec=new VideoEncoder({
    output(chunk,metadata){
      if(chunk.timestamp<=previousTimestamp){failure=new Error('视频帧顺序异常，请重新导出');return;}
      previousTimestamp=chunk.timestamp;
      const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);samples.push({data,key:chunk.type==='key'});
      if(metadata?.decoderConfig?.description)avcConfig=new Uint8Array(metadata.decoderConfig.description).slice();
    },
    error(){failure=new Error('实况视频编码失败，请关闭其他占用较高的页面后重试');},
  });
  try {
    codec.configure(config);
    for(let index=0;index<frameCount;index++) {
      assertActive(signal);if(failure)throw failure;
      await renderFrame(canvas,index/30);
      assertActive(signal);
      if(index===frameCount-1) {
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.97));
        if(!blob)throw new Error('实况照片定格生成失败');
        jpeg=new Uint8Array(await blob.arrayBuffer());
      }
      const frame=new VideoFrame(canvas,{timestamp:Math.round(index*1_000_000/30),duration:Math.round(1_000_000/30)});
      try{codec.encode(frame,{keyFrame:index%30===0||index===frameCount-1});}finally{frame.close();}
      if(codec.encodeQueueSize>4)await bounded(codec.flush());
      onProgress(Math.round((index+1)/frameCount*94));
      if(index%6===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    await bounded(codec.flush());assertActive(signal);if(failure)throw failure;
    const identifier=crypto.randomUUID();
    const photo=addLivePhotoMetadata(jpeg,identifier,width,height,templates);
    const movie=createLiveMovie({samples,avcConfig,width,height,assetIdentifier:identifier,templates,duration,audio,audioDelay});
    const timestamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15).replace('T','_');
    const stem=`南铂_Live_${timestamp}`;
    const instructions=new TextEncoder().encode(`南铂 Live Photo\n\n此文件夹中的 JPG 和 MOV 是同一张实况照片的配对资源，请保留两者。\n在 Mac 上：解压后使用「南铂实况保存助手」选择这个文件夹，再点「存入照片」。从苹果「照片」同步或分享至 iPhone。\n仅把 JPG、MOV 分别存入手机相册不会自动成为实况照片。网页文件下载不等于相册保存。\n\n${duration} 秒，30 帧/秒，静态封面和关键帧均取最后一帧。${audio?'已包含所选人声和音效。':'当前为无声导出。'}照片、视频均在浏览器本地生成。\n`);
    const zip=createZip([{name:`${stem}.JPG`,data:photo},{name:`${stem}.MOV`,data:movie},{name:'保存到苹果照片.txt',data:instructions}]);
    onProgress(100);
    return {identifier,photo:new Blob([photo],{type:'image/jpeg'}),movie:new Blob([movie],{type:'video/quicktime'}),zip:new Blob([zip],{type:'application/zip'}),name:`${stem}.zip`};
  } finally {
    if(codec.state!=='closed')codec.close();
    canvas.width=canvas.height=1;
  }
}
