import { CARD_STYLES, CARD_DENSITIES, CARD_DURATION, CARD_INTRO, cardFrame, cardAudioName, cardAssetPath } from './card-series.js?v=20260908-five-cards';
import { createLiveSaver, saveLivePair } from './save.js';
import { exportNativeLive, getNativeLiveBridge } from './native.js?v=20260908-five-cards';
// Shared Live UI. Mounted only on demand by the static and React shells.
export function mountLiveControls({host,onToggle,onRefresh,onAssetsChanged=()=>{},captureRender,assetBase=new URL('./',import.meta.url)}) {
  const nativeBridge=getNativeLiveBridge();
  const saver=nativeBridge?null:createLiveSaver();
  let enabled=false,atlas=null,frameTime=CARD_INTRO+CARD_DURATION,animationId=0,loadGeneration=0,disposed=false,abort=null,busy=false,selectedStyle="silver",density=20,voice=true,sfx=true,previewsLoaded=false;
  const audio=typeof Audio==='function'?new Audio():null;
  const imageCache=new Map();
  try { const saved=JSON.parse(localStorage.getItem('nbo-live-card-v1')||'null');
    if(saved&&CARD_STYLES.some(x=>x.id===saved.style))selectedStyle=saved.style;
    if(saved&&CARD_DENSITIES.includes(saved.density))density=saved.density;
    if(typeof saved?.voice==='boolean')voice=saved.voice;
    if(typeof saved?.sfx==='boolean')sfx=saved.sfx;
  } catch { /* Preferences must never block the editor. */ }
  function remember(){try{localStorage.setItem('nbo-live-card-v1',JSON.stringify({style:selectedStyle,density,voice,sfx}));}catch{}}
  host.innerHTML=`<button type="button" class="live-toggle" aria-pressed="false">制作 Live</button>
    <div class="live-options" hidden>
      <button type="button" class="live-play">播放动效</button>
      <button type="button" class="live-export">${nativeBridge?"保存实况":"导出 Live"}</button>
      <button type="button" class="live-cancel" hidden>取消导出</button>
      <details class="live-details" open><summary>动画贴图</summary><div class="live-settings-panel">
        <header class="live-gallery-heading"><strong>动画贴图</strong><span>轻点应用</span></header>
        <div class="live-gallery" role="group" aria-label="Live 动画样式">
          ${CARD_STYLES.map(({id,name})=>`<article class="live-card-item" data-card="${id}"><button type="button" class="live-style-card" data-style="${id}" aria-pressed="${id===selectedStyle}" aria-label="${name}"><span class="live-style-art"><canvas width="480" height="360" data-preview="${id}" aria-hidden="true"></canvas></span><span class="live-style-name">${name}<i aria-hidden="true">✓</i></span></button><div class="live-card-options" data-options="${id}" ${id===selectedStyle?'':'hidden'} aria-label="${name}卡片设置"><span class="live-card-label">底色浓度</span><div class="live-card-density">${CARD_DENSITIES.map(value=>`<button type="button" data-owner="${id}" data-density="${value}" aria-label="${name}底色${value}%" aria-pressed="${value===density}">${value}%</button>`).join('')}</div><div class="live-card-audio"><button type="button" data-voice="${id}" aria-pressed="${voice}">人声</button><button type="button" data-sfx="${id}" aria-pressed="${sfx}">音效</button><button type="button" data-replay="${id}">重播</button></div></div></article>`).join('')}
        </div>
        <details class="live-help"><summary>使用说明</summary>
        <p>卡片固定在文案下方，左边与文案对齐、底边与素颜照对齐，向上进入。底色浓度、人声和音效在选中的卡片内调整。</p>
        ${nativeBridge?'<p>点击保存实况，直接保存到苹果「照片」。首次保存时请允许添加照片。</p>':`<p>电脑 Chrome 可直接保存到桌面文件夹，无需解压。首次导出请选择桌面并允许保存；当前页面会复用该位置。其他浏览器下载文件包。</p>
        <p>要在 iPhone 相册长按播放，仍需用保存助手将文件夹导入苹果「照片」。</p>
        <a class="live-helper" href="${new URL('南铂实况保存助手.zip',assetBase).href}" download>下载 Mac 保存助手</a>`}
        </details>
      </div></details>
      <output class="live-status" aria-live="polite"></output>
    </div>`;
  const q=s=>host.querySelector(s), toggle=q('.live-toggle'),options=q('.live-options'),play=q('.live-play'),exportButton=q('.live-export'),cancel=q('.live-cancel'),status=q('output');
  const cards=CARD_STYLES.map(({id})=>q(`[data-style="${id}"]`));
  const settingButtons=CARD_STYLES.flatMap(({id})=>[...CARD_DENSITIES.map(d=>q(`[data-owner="${id}"][data-density="${d}"]`)),q(`[data-voice="${id}"]`),q(`[data-sfx="${id}"]`),q(`[data-replay="${id}"]`)]);
  function frameFor(images,time){
    const local=time-CARD_INTRO;
    return {time:local<0?time:3,animation:images&&local>=0?cardFrame(images,local):null};
  }
  function stop(){cancelAnimationFrame(animationId);animationId=0;audio?.pause();frameTime=CARD_INTRO+CARD_DURATION;play.removeAttribute('data-active');}
  function presentation(time=frameTime){return enabled?frameFor(atlas,time):undefined;}
  function syncOptions(){
    CARD_STYLES.forEach(({id})=>{
      q(`[data-options="${id}"]`).hidden=id!==selectedStyle;
      q(`[data-style="${id}"]`).setAttribute('aria-pressed',String(id===selectedStyle));
      CARD_DENSITIES.forEach(d=>q(`[data-owner="${id}"][data-density="${d}"]`).setAttribute('aria-pressed',String(d===density)));
      q(`[data-voice="${id}"]`).setAttribute('aria-pressed',String(voice));
      q(`[data-sfx="${id}"]`).setAttribute('aria-pressed',String(sfx));
    });
  }
  function audioURL(){const name=cardAudioName(voice,sfx);return name?new URL(`cards/${name}.m4a`,assetBase).href:null;}
  function playAnimation(){
    if(!enabled||!atlas||busy)return;
    stop();play.setAttribute('data-active','true');const start=performance.now(),url=audioURL();
    if(audio&&url){audio.src=url;audio.currentTime=0;audio.play().catch(()=>{if(!disposed)status.textContent='点击卡片内“重播”即可有声播放';});}
    function tick(now){
      if(disposed||!enabled)return;
      frameTime=audio&&url&&!audio.paused?CARD_INTRO+audio.currentTime:(now-start)/1000;
      if(frameTime>=CARD_INTRO+CARD_DURATION||audio&&url&&audio.ended){stop();onRefresh();return;}
      onRefresh();animationId=requestAnimationFrame(tick);
    }
    animationId=requestAnimationFrame(tick);
  }
  async function loadImage(path){
    if(imageCache.has(path))return imageCache.get(path);
    const image=new Image();image.src=new URL(path,assetBase).href;await image.decode();
    // Bound retained atlas memory; thumbnails are kept separately in their canvases.
    if(imageCache.size>=6)imageCache.delete(imageCache.keys().next().value);
    imageCache.set(path,image);return image;
  }
  async function loadAnimation(){
    const generation=++loadGeneration;atlas=null;onAssetsChanged();onRefresh();play.disabled=exportButton.disabled=true;status.textContent='正在加载卡片…';
    try {
      const next=await Promise.all([0,1].map(part=>loadImage(cardAssetPath(selectedStyle,density,`${part}.webp`))));
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
        const image=new Image();image.src=new URL(cardAssetPath(id,20,'poster.webp'),assetBase).href;await image.decode();if(disposed)return;
        const context=q(`[data-preview="${id}"]`)?.getContext?.('2d');if(!context)return;
        context.clearRect(0,0,480,360);context.drawImage(image,0,0,480,360);
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
    const image=atlas,exportAudioURL=audioURL();
    try {
      if(bridge){
        status.textContent='正在准备保存到照片…';
        await exportNativeLive({width:snapshot.width,height:snapshot.height,bridge,signal:abort.signal,duration:CARD_INTRO+CARD_DURATION,audioURL:exportAudioURL,
          onProgress:value=>{status.textContent=value>=95?'正在保存到照片…':`正在生成实况 ${value}%`;},
          onSaving:()=>{cancel.hidden=true;toggle.disabled=true;status.textContent='正在保存到照片…';},
          renderFrame:(canvas,time)=>snapshot.render(canvas,frameFor(image,time))});
        if(!disposed&&enabled&&!abort.signal.aborted)status.textContent='实况已保存到苹果「照片」，可长按播放';
        return;
      }
      status.textContent='请选择桌面或其他保存文件夹';
      const directory=await saver.choose();
      if(disposed||!enabled||abort.signal.aborted)return;
      status.textContent='正在生成实况 0%';
      const {exportLivePhoto}=await import('./export.js?v=20260908-five-cards');
      const result=await exportLivePhoto({width:snapshot.width,height:snapshot.height,assetBase,signal:abort.signal,duration:CARD_INTRO+CARD_DURATION,audioURL:exportAudioURL,audioDelay:CARD_INTRO,
        onProgress:value=>{status.textContent=`正在生成实况 ${value}%`;},
        renderFrame:(canvas,time)=>{
          snapshot.render(canvas,frameFor(image,time));
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
    q(`[data-replay="${id}"]`).addEventListener('click',playAnimation);
  });
  exportButton.addEventListener('click',()=>void startExport());
  cancel.addEventListener('click',()=>abort?.abort());
  return {setEnabled,presentation,destroy(){disposed=true;stop();abort?.abort();loadGeneration++;atlas=null;imageCache.clear();if(audio){audio.removeAttribute("src");audio.load();}host.replaceChildren();}};
}
