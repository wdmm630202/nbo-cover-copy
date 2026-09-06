import { createLiveSaver, saveLivePair } from './save.js';
import { exportNativeLive, getNativeLiveBridge } from './native.js';
// Shared Live UI. Mounted only on demand by the static and React shells.
export function mountLiveControls({host,onToggle,onRefresh,onAssetsChanged=()=>{},motionAt,captureRender,assetBase=new URL('./',import.meta.url)}) {
  const nativeBridge=getNativeLiveBridge();
  const saver=nativeBridge?null:createLiveSaver();
  let enabled=false,atlas=null,frameTime=3,animationId=0,loadGeneration=0,disposed=false,abort=null,busy=false,selectedStyle="focus",previewsLoaded=false;
  host.innerHTML=`<button type="button" class="live-toggle" aria-pressed="false">制作 Live</button>
    <div class="live-options" hidden>
      <button type="button" class="live-play">播放动效</button>
      <button type="button" class="live-export">${nativeBridge?"保存实况":"导出 Live"}</button>
      <button type="button" class="live-cancel" hidden>取消导出</button>
      <details class="live-details" open><summary>动画贴图</summary><div class="live-settings-panel">
        <header class="live-gallery-heading"><strong>动画贴图</strong><span>轻点应用</span></header>
        <div class="live-gallery" role="group" aria-label="Live 动画样式">
          ${[['focus','帅气合焦'],['cute','Q萌验证'],['simple','简洁验证']].map(([id,name])=>`<button type="button" class="live-style-card" data-style="${id}" aria-pressed="${id==='focus'}" aria-label="${name}"><span class="live-style-art"><canvas width="480" height="160" data-preview="${id}" aria-hidden="true"></canvas></span><span class="live-style-name">${name}<i aria-hidden="true">✓</i></span></button>`).join('')}
        </div>
        <details class="live-help"><summary>使用说明</summary>
        <p>三行文字，每行最多 6 字。字号与对齐已锁定，其余参数可继续调整。</p>
        ${nativeBridge?'<p>点击保存实况，直接保存到苹果「照片」。首次保存时请允许添加照片。</p>':`<p>电脑 Chrome 可直接保存到桌面文件夹，无需解压。首次导出请选择桌面并允许保存；当前页面会复用该位置。其他浏览器下载文件包。</p>
        <p>要在 iPhone 相册长按播放，仍需用保存助手将文件夹导入苹果「照片」。</p>
        <a class="live-helper" href="${new URL('南铂实况保存助手.zip',assetBase).href}" download>下载 Mac 保存助手</a>`}
        </details>
      </div></details>
      <output class="live-status" aria-live="polite"></output>
    </div>`;
  const q=s=>host.querySelector(s), toggle=q('.live-toggle'),options=q('.live-options'),play=q('.live-play'),exportButton=q('.live-export'),cancel=q('.live-cancel'),status=q('output');
  const cards=['focus','cute','simple'].map(id=>q(`[data-style="${id}"]`));
  const crops={focus:[50,57,451,125],cute:[62,72,415,114],simple:[70,73,407,107]};
  function frameFor(image,time,style=selectedStyle){
    const motion=motionAt(time),index=Math.max(0,Math.min(89,Math.round(motion.animationTime*30)));
    const [x,y,width,height]=crops[style];
    return {time,animation:image&&motion.phase==='complete'?{image,source:{x:(index%9)*600+x,y:Math.floor(index/9)*240+y,width,height}}:null};
  }
  function stop(){cancelAnimationFrame(animationId);animationId=0;frameTime=3;play.removeAttribute('data-active');}
  function presentation(time=frameTime){
    if(!enabled)return undefined;
    return frameFor(atlas,time);
  }
  function playAnimation(){
    if(!enabled||!atlas||busy)return;
    stop();play.setAttribute('data-active','true');const start=performance.now();
    function tick(now){
      if(disposed||!enabled)return;
      frameTime=(now-start)/1000;
      if(frameTime>=3){stop();onRefresh();return;}
      onRefresh();animationId=requestAnimationFrame(tick);
    }
    animationId=requestAnimationFrame(tick);
  }
  async function loadAnimation(){
    const generation=++loadGeneration;atlas=null;onAssetsChanged();onRefresh();play.disabled=exportButton.disabled=true;status.textContent='正在加载动效…';
    const next=new Image();next.src=new URL(`${selectedStyle}.png`,assetBase).href;
    try {
      await next.decode();
      if(disposed||!enabled||generation!==loadGeneration)return;
      atlas=next;play.disabled=exportButton.disabled=false;status.textContent='';onAssetsChanged();onRefresh();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)playAnimation();
    }catch{
      if(disposed||!enabled||generation!==loadGeneration)return;
      status.textContent='动效读取失败，请切换样式或重新开启 Live';
    }
  }
  async function loadPreviews(){
    if(previewsLoaded)return;
    previewsLoaded=true;
    await Promise.all(['focus','cute','simple'].map(async style=>{
      const image=new Image();image.src=new URL(`${style}.png`,assetBase).href;
      try{
        await image.decode();if(disposed)return;
        const canvas=q(`[data-preview="${style}"]`),context=canvas?.getContext?.('2d');
        if(!context)return;
        const [x,y,w,h]=crops[style],scale=Math.min(440/w,120/h);
        context.clearRect(0,0,480,160);
        context.drawImage(image,8*600+x,9*240+y,w,h,(480-w*scale)/2,(160-h*scale)/2,w*scale,h*scale);
      }catch{previewsLoaded=false;}
    }));
  }
  function setEnabled(next){
    if(disposed||next===enabled)return;
    enabled=next;stop();abort?.abort();loadGeneration++;
    toggle.textContent=enabled?'关闭 Live':'制作 Live';toggle.setAttribute('aria-pressed',String(enabled));options.hidden=!enabled;
    onToggle(enabled);onRefresh();
    if(enabled){void loadAnimation();void loadPreviews();}else atlas=null;
  }
  async function startExport(){
    if(!enabled||!atlas||busy)return;
    const bridge=getNativeLiveBridge();
    let snapshot;
    try{snapshot=captureRender();}catch(error){status.textContent=error.message;return;}
    busy=true;exportButton.setAttribute('data-active','true');stop();onRefresh();abort=new AbortController();
    exportButton.disabled=play.disabled=true;cards.forEach(card=>{card.disabled=true;});cancel.hidden=false;status.textContent='正在生成实况 0%';
    const image=atlas,style=selectedStyle;
    try {
      if(bridge){
        status.textContent='正在准备保存到照片…';
        await exportNativeLive({width:snapshot.width,height:snapshot.height,bridge,signal:abort.signal,
          onProgress:value=>{status.textContent=value>=95?'正在保存到照片…':`正在生成实况 ${value}%`;},
          onSaving:()=>{cancel.hidden=true;toggle.disabled=true;status.textContent='正在保存到照片…';},
          renderFrame:(canvas,time)=>snapshot.render(canvas,frameFor(image,time,style))});
        if(!disposed&&enabled&&!abort.signal.aborted)status.textContent='实况已保存到苹果「照片」，可长按播放';
        return;
      }
      status.textContent='请选择桌面或其他保存文件夹';
      const directory=await saver.choose();
      if(disposed||!enabled||abort.signal.aborted)return;
      status.textContent='正在生成实况 0%';
      const {exportLivePhoto}=await import('./export.js');
      const result=await exportLivePhoto({width:snapshot.width,height:snapshot.height,assetBase,signal:abort.signal,
        onProgress:value=>{status.textContent=`正在生成实况 ${value}%`;},
        renderFrame:(canvas,time)=>{
          snapshot.render(canvas,frameFor(image,time,style));
        }});
      if(disposed||!enabled||abort.signal.aborted)return;
      if(directory){
        status.textContent='正在保存到文件夹…';
        const folderName=await saveLivePair(directory,result,abort.signal);
        if(disposed||!enabled||abort.signal.aborted)return;
        status.textContent=`已保存到「${directory.name}」中的「${folderName}」，无需解压`;
      }else{
        const url=URL.createObjectURL(result.zip),link=document.createElement('a');link.href=url;link.download=result.name;link.click();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
        status.textContent='文件包已下载；电脑 Chrome 可直接保存到桌面文件夹';
      }
    }catch(error){
      if(!disposed&&enabled)status.textContent=error.name==='AbortError'?'已取消导出':(/[\u3400-\u9fff]/.test(error.message)?error.message:'实况导出失败，请重试');
    }finally{
      busy=false;exportButton.removeAttribute('data-active');abort=null;if(!disposed){toggle.disabled=false;exportButton.disabled=play.disabled=!atlas;cards.forEach(card=>{card.disabled=false;});cancel.hidden=true;}
    }
  }
  toggle.addEventListener('click',()=>setEnabled(!enabled));play.addEventListener('click',playAnimation);
  cards.forEach((card,index)=>card.addEventListener('click',()=>{
    if(busy||!enabled)return;
    selectedStyle=['focus','cute','simple'][index];
    cards.forEach(item=>item.setAttribute('aria-pressed',String(item===card)));
    stop();void loadAnimation();
  }));exportButton.addEventListener('click',()=>void startExport());
  cancel.addEventListener('click',()=>abort?.abort());
  return {setEnabled,presentation,destroy(){disposed=true;stop();abort?.abort();loadGeneration++;atlas=null;host.replaceChildren();}};
}
