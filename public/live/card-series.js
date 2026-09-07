// Shared, deterministic card presentation for preview, still export and Live export.
export const CARD_DURATION = 2;
export const CARD_INTRO = 1;
export const CARD_FPS = 30;
export const CARD_STYLES = Object.freeze([
  {id:'silver',name:'曜石银',base:'#171b20'}, {id:'champagne',name:'香槟金',base:'#241f19'},
  {id:'blue',name:'雾海蓝',base:'#15222d'}, {id:'green',name:'松石绿',base:'#192822'}, {id:'clay',name:'赤陶棕',base:'#2b1f1d'},
]);
export const CARD_DENSITIES = Object.freeze([0,25,50,75,100]);
export const CARD_DEFAULT_DENSITY = 50;
export function cardFrame(atlas,time,dashed=false) {
  const t=Math.max(0,Math.min(CARD_DURATION,time));
  const index=Math.min(59,Math.floor(t*CARD_FPS+1e-6)),local=index%30;
  return {image:atlas[Math.floor(index/30)],source:{x:local%5*480,y:Math.floor(local/5)*360,width:480,height:360},
    layout:'card-series',dashed,entrance:1-Math.pow(1-Math.min(1,t/.36),3)};
}
export function cardAudioName(voice,sfx){return voice?(sfx?'mix':'voice'):(sfx?'sfx':null);}
export function cardAssetPath(style,density,file){
  if(!CARD_STYLES.some(item=>item.id===style)||!CARD_DENSITIES.includes(density))throw new Error('卡片选项无效');
  return `cards/${style}/${density}/${file}`;
}

// The moving plate sits behind the approved text and laser frames.
// Changing density never fades the lettering, and uses the same image for preview/export.
export function compositeCard(foreground,plate,style,density,createCanvas=()=>document.createElement('canvas')) {
  const color=CARD_STYLES.find(item=>item.id===style)?.base;
  if(!color||!CARD_DENSITIES.includes(density))throw new Error('卡片选项无效');
  if(density===0)return foreground;
  const canvas=createCanvas();canvas.width=foreground.naturalWidth||foreground.width;canvas.height=foreground.naturalHeight||foreground.height;
  const context=canvas.getContext('2d');
  context.drawImage(plate,0,0);
  context.globalCompositeOperation='source-in';context.globalAlpha=density/100;
  context.fillStyle=color;context.fillRect(0,0,canvas.width,canvas.height);
  context.globalCompositeOperation='source-over';context.globalAlpha=1;
  context.drawImage(foreground,0,0);
  return canvas;
}
