import { CARD_STYLES, CARD_DENSITIES, CARD_DEFAULT_DENSITY, compositeCard, CARD_DURATION, cardFrame, cardAudioName, cardAssetPath } from './card-series.js?v=20260908-card-pair';
import { createLiveSaver, saveLivePair, saveLiveArchive } from './save.js?v=20260908-live-name';
import { createLiveNameAllocator } from './name.js?v=20260908-live-name';
import { exportNativeLive, getNativeLiveBridge } from './native.js?v=20260908-card-pair';
// Shared Live UI. Mounted only on demand by the static and React shells.
export function mountLiveControls({host,onToggle,onRefresh,onAssetsChanged=()=>{},captureRender,assetBase=new URL('./',import.meta.url)}) {
  const nativeBridge=getNativeLiveBridge();
  const saver=nativeBridge?null:createLiveSaver();
  const reserveName=createLiveNameAllocator();
  let enabled=false,atlas=null,frameTime=CARD_DURATION,animationId=0,loadGeneration=0,disposed=false,abort=null,busy=false,selectedStyle="silver",density=CARD_DEFAULT_DENSITY,voice=true,sfx=true,dashed=true,previewsLoaded=false;
  const audio=typeof Audio==='function'?new Audio():null;
  const imageCache=new Map();
  try { const saved=JSON.parse(localStorage.getItem('nbo-live-card-v1')||'null');
    if(saved&&CARD_STYLES.some(x=>x.id===saved.style))selectedStyle=saved.style;
    if(saved?.densityVersion===2&&CARD_DENSITIES.includes(saved.density))density=saved.density;
    if(typeof saved?.voice==='boolean')voice=saved.voice;
    if(typeof saved?.sfx==='boolean')sfx=saved.sfx;
    if(typeof saved?.dashed==='boolean')dashed=saved.dashed;
  } catch { /* Preferences must never block the editor. */ }
  function remember(){try{localStorage.setItem('nbo-live-card-v1',JSON.stringify({style:selectedStyle,density,voice,sfx,dashed,densityVersion:2}));}catch{}}
  host.innerHTML=`<button type="button" class="live-toggle" aria-pressed="false">制作 Live</button>
    <div class="live-options" hidden>
      <button type="button" class="live-play">播放动效</button>
      <button type="button" class="live-export">${nativeBridge?"保存实况":"导出 Live"}</button>
      <button type="button" class="live-cancel" hidden>取消导出</button>
      <details class="live-details" open><summary>动画贴图</summary><div class="live-settings-panel">
        <header class="live-gallery-heading"><strong>动画贴图</strong><span>轻点应用</span></header>
        <div class="live-gallery" role="group" aria-label="Live 动画样式">
          ${CARD_STYLES.map(({id,name})=>`<article class="live-card-item" data-card="${id}"><button type="button" class="live-style-card" data-style="${id}" aria-pressed="${id===selectedStyle}" aria-label="${name}"><span class="live-style-art"><canvas width="480" height="360" data-preview="${id}" aria-hidden="true"></canvas></span><span class="live-style-name">${name}<i aria-hidden="true">✓</i></span></button><div class="live-card-options" data-options="${id}" ${id===selectedStyle?'':'hidden'} aria-label="${name}卡片设置"><span class="live-card-label">底色浓度</span><div class="live-card-density">${CARD_DENSITIES.map(value=>`<button type="button" data-owner="${id}" data-density="${value}" aria-label="${name}底色${value}%" aria-pressed="${value===density}">${value}%</button>`).join('')}</div><div class="live-card-audio"><button type="button" data-voice="${id}" aria-pressed="${voice}">人声</button><button type="button" data-sfx="${id}" aria-pressed="${sfx}">音效</button><button type="button" data-dashed="${id}" aria-pressed="${dashed}">虚线</button><button type="button" data-replay="${id}">重播</button></div></div></article>`).join('')}
        </div>
        <details class="live-help"><summary>使用说明</summary>
        <p>全程 3 秒：下卡依次显示三句可编辑文案，随后上卡从下卡上沿滑出，与改造后照片一起揭晓“主角登场”，最后 0.9 秒定格。两卡等大，上下留缝与右侧素颜照留缝一致，整列与素颜框上下对齐。底色浓度、人声、音效和虚线在选中的卡片内调整，虚线开关也应用于导出。视频以 4K 分辨率导出，照片取最后定格并沿用普通封面的原像素规则。</p>
        ${nativeBridge?'<p>点击保存实况，直接保存到苹果「照片」。首次保存时请允许添加照片。</p>':`<p>像普通封面一样选择文件保存位置。文件名沿用原图名称、平台、比例和日期时间，前面加“实况live”，时间精确到毫秒并自动防重。</p>
        <p>文件包内是同名 JPG＋MOV 配对资源。解压后用保存助手导入苹果「照片」，即可在 iPhone 相册长按播放。</p>
        <a class="live-helper" href="${new URL('南铂实况保存助手.zip',assetBase).href}" download>下载 Mac 保存助手</a>`}
        </details>
      </div></details>
      <output class="live-status" aria-live="polite"></output>
    </div>`;
  const q=s=>host.querySelector(s), toggle=q('.live-toggle'),options=q('.live-options'),play=q('.live-play'),exportButton=q('.live-export'),cancel=q('.live-cancel'),status=q('output');
  const cards=CARD_STYLES.map(({id})=>q(`[data-style="${id}"]`));
  const settingButtons=CARD_STYLES.flatMap(({id})=>[...CARD_DENSITIES.map(d=>q(`[data-owner="${id}"][data-density="${d}"]`)),q(`[data-voice="${id}"]`),q(`[data-sfx="${id}"]`),q(`[data-dashed="${id}"]`),q(`[data-replay="${id}"]`)]);
  function frameFor(images,time,border=dashed,appearance={style:selectedStyle,density}){
    const t=Math.max(0,Math.min(CARD_DURATION,Number.isFinite(time)?time:0));
    const reveal=Math.max(0,Math.min(1,(t-1.4)/.7));
    // Reuse the original before/after photo motion on the card's shared clock.
    return {time:t<1.4?t/1.4:t<2.1?1+reveal:3,overlayOpacity:reveal*reveal*(3-2*reveal),animation:images?cardFrame(images,t,border,appearance):null};
  }
  function stop(){cancelAnimationFrame(animationId);animationId=0;audio?.pause();frameTime=CARD_DURATION;play.removeAttribute('data-active');}
  function presentation(time=frameTime){return enabled?frameFor(atlas,time):undefined;}
  function syncOptions(){
    CARD_STYLES.forEach(({id})=>{
      q(`[data-options="${id}"]`).hidden=id!==selectedStyle;
      q(`[data-style="${id}"]`).setAttribute('aria-pressed',String(id===selectedStyle));
      CARD_DENSITIES.forEach(d=>q(`[data-owner="${id}"][data-density="${d}"]`).setAttribute('aria-pressed',String(d===density)));
      q(`[data-voice="${id}"]`).setAttribute('aria-pressed',String(voice));
      q(`[data-sfx="${id}"]`).setAttribute('aria-pressed',String(sfx));
      q(`[data-dashed="${id}"]`).setAttribute('aria-pressed',String(dashed));
    });
  }
  function audioURL(){const name=cardAudioName(voice,sfx);return name?new URL(`cards/${name==='voice'?'voice-intro':name+'-sync'}.m4a`,assetBase).href:null;}
  function playAnimation(){
    if(!enabled||!atlas||busy)return;
    stop();frameTime=0;onRefresh();play.setAttribute('data-active','true');const start=performance.now(),url=audioURL();
    if(audio&&url){audio.src=url;audio.currentTime=0;audio.play().catch(()=>{if(!disposed)status.textContent='点击卡片内“重播”即可有声播放';});}
    function tick(now){
      if(disposed||!enabled)return;
      frameTime=audio&&url&&!audio.paused?audio.currentTime:(now-start)/1000;
      if(frameTime>=CARD_DURATION||audio&&url&&audio.ended){stop();onRefresh();return;}
      onRefresh();animationId=requestAnimationFrame(tick);
    }
    animationId=requestAnimationFrame(tick);
  }
  async function loadImage(path){
    if(imageCache.has(path))return imageCache.get(path);
    const image=new Image();image.src=new URL(path,assetBase).href;await image.decode();
    // Bound retained atlas memory; thumbnails are kept separately in their canvases.
    if(imageCache.size>=4)imageCache.delete(imageCache.keys().next().value);
    imageCache.set(path,image);return image;
  }
  async function loadAnimation(){
    const generation=++loadGeneration;atlas=null;onAssetsChanged();onRefresh();play.disabled=exportButton.disabled=true;status.textContent='正在加载卡片…';
    try {
      const next=[await loadImage('cards/pair/hero.webp')];
      if(disposed||!enabled||generation!==loadGeneration)return;
      atlas=next;play.disabled=exportButton.disabled=false;status.textContent='';onAssetsChanged();onRefresh();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)playAnimation();
    }catch{
      if(disposed||!enabled||generation!==loadGeneration)return;
      status.textContent='卡片读取失败，请切换色系或重新开启 Live';
    }
  }
  async function loadPreviews(){
    if(previewsLoaded)return;previewsLoaded=true;
    await Promise.all(CARD_STYLES.map(async({id})=>{
      try{
        const image=new Image();image.src=new URL(cardAssetPath(id,0,'poster.webp'),assetBase).href;await image.decode();
        const plate=await loadImage('cards/plate/poster.webp');if(disposed)return;
        const context=q(`[data-preview="${id}"]`)?.getContext?.('2d');if(!context)return;
        context.clearRect(0,0,480,360);context.drawImage(compositeCard(image,plate,id,CARD_DEFAULT_DENSITY),0,0,480,360);
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
    exportButton.disabled=play.disabled=true;[...cards,...settingButtons].forEach(card=>{card.disabled=true;});cancel.hidden=false;status.textContent='正在生成实况 0%';
    const image=atlas,exportAudioURL=audioURL(),exportDashed=dashed,exportAppearance={style:selectedStyle,density};
    try {
      if(bridge){
        status.textContent='正在准备保存到照片…';
        await exportNativeLive({width:snapshot.width,height:snapshot.height,bridge,signal:abort.signal,duration:CARD_DURATION,audioURL:exportAudioURL,createPoster:snapshot.createPoster?()=>snapshot.createPoster(frameFor(image,CARD_DURATION,exportDashed,exportAppearance)):undefined,
          onProgress:value=>{status.textContent=value>=95?'正在保存到照片…':`正在生成实况 ${value}%`;},
          onSaving:()=>{cancel.hidden=true;toggle.disabled=true;status.textContent='正在保存到照片…';},
          renderFrame:(canvas,time)=>snapshot.render(canvas,frameFor(image,time,exportDashed,exportAppearance))});
        if(!disposed&&enabled&&!abort.signal.aborted)status.textContent='实况已保存到苹果「照片」，可长按播放';
        return;
      }
      const exportName=await reserveName(snapshot.exportName);
      if(disposed||!enabled||abort.signal.aborted)return;
      status.textContent='请选择实况文件包的保存位置';
      const directory=await saver.choose(exportName);
      if(disposed||!enabled||abort.signal.aborted)return;
      status.textContent='正在生成实况 0%';
      const {exportLivePhoto}=await import('./export.js?v=20260908-live-name');
      const result=await exportLivePhoto({width:snapshot.width,height:snapshot.height,name:directory?.kind==='file'?directory.handle.name:exportName,assetBase,signal:abort.signal,duration:CARD_DURATION,audioURL:exportAudioURL,audioDelay:0,createPoster:snapshot.createPoster?()=>snapshot.createPoster(frameFor(image,CARD_DURATION,exportDashed,exportAppearance)):undefined,
        onProgress:value=>{status.textContent=`正在生成实况 ${value}%`;},
        renderFrame:(canvas,time)=>{
          snapshot.render(canvas,frameFor(image,time,exportDashed,exportAppearance));
        }});
      if(disposed||!enabled||abort.signal.aborted)return;
      if(directory?.kind==='file'){
        status.textContent='正在保存实况文件包…';
        await saveLiveArchive(directory.handle,result.zip,abort.signal);
        if(disposed||!enabled||abort.signal.aborted)return;
        status.textContent=`已保存「${directory.handle.name}」，解压后是同名 JPG＋MOV`;
      }else if(directory){
        status.textContent='正在保存到文件夹…';
        const folderName=await saveLivePair(directory,result,abort.signal);
        if(disposed||!enabled||abort.signal.aborted)return;
        status.textContent=`已保存到「${directory.name}」中的「${folderName}」，无需解压`;
      }else{
        const url=URL.createObjectURL(result.zip),link=document.createElement('a');link.href=url;link.download=result.name;link.click();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
        status.textContent=`已发起下载「${result.name}」，解压后是同名 JPG＋MOV`;
      }
    }catch(error){
      if(!disposed&&enabled)status.textContent=error.name==='AbortError'?'已取消导出':(/[\u3400-\u9fff]/.test(error.message)?error.message:'实况导出失败，请重试');
    }finally{
      busy=false;exportButton.removeAttribute('data-active');abort=null;if(!disposed){toggle.disabled=false;exportButton.disabled=play.disabled=!atlas;[...cards,...settingButtons].forEach(card=>{card.disabled=false;});cancel.hidden=true;}
    }
  }
  toggle.addEventListener('click',()=>setEnabled(!enabled));play.addEventListener('click',playAnimation);
  cards.forEach((card,index)=>card.addEventListener('click',()=>{
    if(busy||!enabled)return;
    selectedStyle=CARD_STYLES[index].id;syncOptions();remember();stop();void loadAnimation();
  }));
  CARD_STYLES.forEach(({id})=>{
    CARD_DENSITIES.forEach(d=>q(`[data-owner="${id}"][data-density="${d}"]`).addEventListener('click',()=>{
      if(busy||!enabled)return;density=d;syncOptions();remember();stop();void loadAnimation();
    }));
    q(`[data-voice="${id}"]`).addEventListener('click',()=>{if(busy)return;voice=!voice;syncOptions();remember();playAnimation();});
    q(`[data-sfx="${id}"]`).addEventListener('click',()=>{if(busy)return;sfx=!sfx;syncOptions();remember();playAnimation();});
    q(`[data-dashed="${id}"]`).addEventListener('click',()=>{if(busy||!enabled)return;dashed=!dashed;syncOptions();remember();onAssetsChanged();onRefresh();});
    q(`[data-replay="${id}"]`).addEventListener('click',playAnimation);
  });
  exportButton.addEventListener('click',()=>void startExport());
  cancel.addEventListener('click',()=>abort?.abort());
  return {setEnabled,presentation,destroy(){disposed=true;stop();abort?.abort();loadGeneration++;atlas=null;imageCache.clear();if(audio){audio.removeAttribute("src");audio.load();}host.replaceChildren();}};
}
