// Shared, deterministic card presentation for preview, still export and Live export.
export const CARD_DURATION = 2;
export const CARD_INTRO = 0;
export const CARD_FPS = 30;
export const CARD_STYLES = Object.freeze([
  {id:'silver',name:'曜石银'}, {id:'champagne',name:'香槟金'},
  {id:'blue',name:'雾海蓝'}, {id:'green',name:'松石绿'}, {id:'clay',name:'赤陶棕'},
]);
export const CARD_DENSITIES = [0,20,35];
export function cardFrame(atlas,time) {
  const t=Math.max(0,Math.min(CARD_DURATION,time));
  const index=Math.min(59,Math.floor(t*CARD_FPS+1e-6)),local=index%30;
  return {image:atlas[Math.floor(index/30)],source:{x:local%5*480,y:Math.floor(local/5)*360,width:480,height:360},
    layout:'card-series',entrance:1-Math.pow(1-Math.min(1,t/.24),3)};
}
export function cardAudioName(voice,sfx){return voice?(sfx?'mix':'voice'):(sfx?'sfx':null);}
export function cardAssetPath(style,density,file){
  if(!CARD_STYLES.some(item=>item.id===style)||!CARD_DENSITIES.includes(density))throw new Error('卡片选项无效');
  return `cards/${style}/${density}/${file}`;
}
