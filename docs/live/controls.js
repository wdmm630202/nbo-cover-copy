// Shared Live UI. Mounted only on demand by the static and React shells.
export function mountLiveControls({host,onToggle,onRefresh,onAssetsChanged=()=>{},motionAt,captureRender,assetBase=new URL('./',import.meta.url)}) {
  let enabled=false,atlas=null,frameTime=3,animationId=0,loadGeneration=0,disposed=false,abort=null,busy=false;
  host.innerHTML=`<button type="button" class="live-toggle" aria-pressed="false">制作 Live</button>
    <div class="live-options" hidden>
      <button type="button" class="live-play">播放动效</button>
      <button type="button" class="live-export">导出 Live</button>
      <button type="button" class="live-cancel" hidden>取消导出</button>
      <details class="live-details"><summary>动画与保存</summary>
        <label>动画样式<select aria-label="Live 动画样式"><option value="focus">帅气合焦</option><option value="cute">Q萌验证成功</option><option value="simple">简洁验证成功</option></select></label>
        <p>三行文字，每行最多 6 字。字号与对齐已锁定，其余参数可继续调整。</p>
        <p>导出为 3 秒实况文件包。解压后，用 Mac「南铂实况保存助手」将配对文件存入苹果「照片」，再同步或分享至 iPhone。</p>
        <a class="live-helper" href="${new URL('南铂实况保存助手.zip',assetBase).href}" download>下载 Mac 保存助手</a>
      </details>
      <output class="live-status" aria-live="polite"></output>
    </div>`;
  const q=s=>host.querySelector(s), toggle=q('.live-toggle'),options=q('.live-options'),play=q('.live-play'),exportButton=q('.live-export'),cancel=q('.live-cancel'),select=q('select'),status=q('output');
  const crops={focus:[50,57,451,125],cute:[62,72,415,114],simple:[70,73,407,107]};
  function frameFor(image,time,style=select.value){
    const motion=motionAt(time),index=Math.max(0,Math.min(89,Math.round(motion.animationTime*30)));
    const [x,y,width,height]=crops[style];
    return {time,animation:image&&motion.phase==='complete'?{image,source:{x:(index%9)*600+x,y:Math.floor(index/9)*240+y,width,height}}:null};
  }
  function stop(){cancelAnimationFrame(animationId);animationId=0;frameTime=3;}
  function presentation(time=frameTime){
    if(!enabled)return undefined;
    return frameFor(atlas,time);
  }
  function playAnimation(){
    if(!enabled||!atlas||busy)return;
    stop();const start=performance.now();
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
    const next=new Image();next.src=new URL(`${select.value}.png`,assetBase).href;
    try {
      await next.decode();
      if(disposed||!enabled||generation!==loadGeneration)return;
      atlas=next;play.disabled=exportButton.disabled=false;status.textContent='字号与对齐已锁定';onAssetsChanged();onRefresh();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)playAnimation();
    }catch{
      if(disposed||!enabled||generation!==loadGeneration)return;
      status.textContent='动效读取失败，请切换样式或重新开启 Live';
    }
  }
  function setEnabled(next){
    if(disposed||next===enabled)return;
    enabled=next;stop();abort?.abort();loadGeneration++;
    toggle.textContent=enabled?'关闭 Live':'制作 Live';toggle.setAttribute('aria-pressed',String(enabled));options.hidden=!enabled;
    onToggle(enabled);onRefresh();
    if(enabled)void loadAnimation();else atlas=null;
  }
  async function startExport(){
    if(!enabled||!atlas||busy)return;
    let snapshot;
    try{snapshot=captureRender();}catch(error){status.textContent=error.message;return;}
    busy=true;stop();onRefresh();abort=new AbortController();
    exportButton.disabled=play.disabled=select.disabled=true;cancel.hidden=false;status.textContent='正在生成实况 0%';
    const image=atlas,style=select.value;
    try {
      const {exportLivePhoto}=await import('./export.js');
      const result=await exportLivePhoto({width:snapshot.width,height:snapshot.height,assetBase,signal:abort.signal,
        onProgress:value=>{status.textContent=`正在生成实况 ${value}%`;},
        renderFrame:(canvas,time)=>{
          snapshot.render(canvas,frameFor(image,time,style));
        }});
      if(disposed||!enabled||abort.signal.aborted)return;
      const url=URL.createObjectURL(result.zip),link=document.createElement('a');link.href=url;link.download=result.name;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      status.textContent='文件包已生成；存入苹果照片后可按住播放';
      q('details').open=true;
    }catch(error){
      if(!disposed&&enabled)status.textContent=error.name==='AbortError'?'已取消导出':(/[\u3400-\u9fff]/.test(error.message)?error.message:'实况导出失败，请重试');
    }finally{
      busy=false;abort=null;if(!disposed){exportButton.disabled=play.disabled=!atlas;select.disabled=false;cancel.hidden=true;}
    }
  }
  toggle.addEventListener('click',()=>setEnabled(!enabled));play.addEventListener('click',playAnimation);
  select.addEventListener('change',()=>{stop();void loadAnimation();});exportButton.addEventListener('click',()=>void startExport());
  cancel.addEventListener('click',()=>abort?.abort());
  return {setEnabled,presentation,destroy(){disposed=true;stop();abort?.abort();loadGeneration++;atlas=null;host.replaceChildren();}};
}
