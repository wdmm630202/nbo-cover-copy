import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { chromium,executablePath,available } from './helpers/live-browser-driver.mjs';
test('真实浏览器：自动排版边界、九种组合、保存恢复、双格式导出及超长阻止',async t=>{
 if(!available){t.skip('需要 Chrome');return;}
 const root=resolve('docs');const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('nbo_cover_access_until',String(Date.now()+100000));if(!localStorage.getItem('nbo_cover_settings_v1'))localStorage.setItem('nbo_cover_settings_v1',JSON.stringify({compareEnabled:false,templateId:'bottom-left',textScale:80,titleScaleVersion:3,watermarkEnabled:false}));});
 await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);await page.waitForFunction(()=>typeof NBOCoverCore!=='undefined');
 assert.equal(await page.locator('#fixedTextLayout').isChecked(),true);assert.equal(await page.locator('#textScale').isDisabled(),true);
 const result=await page.evaluate(async()=>{
 const core=NBOCoverCore,c=document.createElement('canvas'),ctx=c.getContext('2d');c.width=1080;c.height=1920;ctx.fillStyle='#67645e';ctx.fillRect(0,0,1080,1920);
 const image=new Image();image.src=c.toDataURL();await image.decode();
 const rows=[];
 for(const width of [540,1080,2160])for(const ratio of [16/9,4/3])for(const a of [3,4,5])for(const b of [3,4,5]){
 const settings={...core.DEFAULT_COVER_SETTINGS,compareEnabled:false,topText:'男'.repeat(a),bottomText:'好'.repeat(b)};
 const p=core.getFixedCoverTextPlan(ctx,settings,width,width*ratio);rows.push(p);
 }
 const dividers=[];
 for(const width of [540,1080,2160])for(const text of ['高级感就','给自己拍照']){
 const settings={...core.DEFAULT_COVER_SETTINGS,compareEnabled:false,topText:'男人的',bottomText:text,textScale:95,bottomTextScale:95};
 const original=ctx.fillRect.bind(ctx),rects=[];ctx.fillRect=(...args)=>{rects.push(args);original(...args);};
 core.drawCoverText(ctx,{...settings,fixedTextLayout:false},width,width*16/9,null);
 core.drawCoverText(ctx,{...settings,fixedTextLayout:true},width,width*16/9,null);
 ctx.fillRect=original;dividers.push(rects.map(r=>[r[2],r[3]]));
 }
 const subtitles=[];
 for(const width of [540,1080,2160])for(const subtitle of ['笑意','不被定义的自己','把笑意留在灯火里']){
 const settings={...core.DEFAULT_COVER_SETTINGS,compareEnabled:false,topText:'男人的',bottomText:'高级感',subtitle};
 const original=ctx.fillText.bind(ctx),draws=[];
 ctx.fillText=(...args)=>{if(args[0]===subtitle)draws.push({font:ctx.font,width:ctx.measureText(subtitle).width});original(...args);};
 core.drawCoverText(ctx,{...settings,fixedTextLayout:false,subtitleScale:100},width,width*16/9,null);
 for(const subtitleScale of [60,100,160])core.drawCoverText(ctx,{...settings,fixedTextLayout:true,subtitleScale},width,width*16/9,null);
 ctx.fillText=original;subtitles.push(draws);
 }
 const exports=[];
 for(const platformId of ['douyin','xiaohongshu'])for(const format of ['png','jpeg']){
 const settings={...core.DEFAULT_COVER_SETTINGS,platformId,compareEnabled:false,topText:'第一次',bottomText:'给自己拍照'};
 const asset=await core.createCoverExportAsset({render:{image,beforeImage:null,watermark:null,settings,preset:{id:platformId,width:1080,height:platformId==='douyin'?1920:1440,label:platformId,ratio:platformId==='douyin'?'9:16':'3:4'}},format,photoOnly:false,mobile:false,fileStem:'test'});
 const bitmap=await createImageBitmap(asset.blob);exports.push({width:bitmap.width,height:bitmap.height,type:asset.blob.type});bitmap.close();
 }
 let invalid='';try{await core.createCoverExportAsset({render:{image,beforeImage:null,watermark:null,settings:{...core.DEFAULT_COVER_SETTINGS,compareEnabled:false,topText:'超过五字的标题'},preset:{width:1080,height:1920}},format:'png',photoOnly:false,mobile:false,fileStem:'invalid'});}catch(e){invalid=e.message;}
 return {rows,exports,invalid,dividers,subtitles};
 });
 for(const p of result.rows){assert.equal(p.error,null);const gaps=[p.bottomBaseline-p.bottomInk.ascent-p.topBaseline-p.topInk.descent,p.dividerY-p.bottomBaseline-p.bottomInk.descent,p.subtitleBaseline-p.subtitleInk.ascent-p.dividerY-p.dividerThickness];assert.ok(Math.max(...gaps)-Math.min(...gaps)<.01);assert.ok(p.topInk.width<=p.maxWidth+.01&&p.bottomInk.width<=p.maxWidth+.01);}
 for(const pair of result.dividers)assert.deepEqual(pair[0],pair[1],"自动开关不能改变分割线长宽");
 for(const draws of result.subtitles){assert.equal(draws.length,4);for(const draw of draws.slice(1))assert.deepEqual(draw,draws[0],"自动小标题应保持原版100%字号，不受字数或旧缩放设置影响");}
 assert.equal(result.exports.length,4);assert.match(result.invalid,/最多5/);
 await page.locator('label:has(#fixedTextLayout)').click();assert.equal(await page.locator('#textScale').isDisabled(),false);
 await page.locator('label:has(#fixedTextLayout)').click();await page.locator('#topText').fill('第一次');await page.locator('#bottomText').fill('给自己拍照');
 await page.reload();assert.equal(await page.locator('#topText').inputValue(),'第一次');assert.equal(await page.locator('#bottomText').inputValue(),'给自己拍照');assert.equal(await page.locator('#fixedTextLayout').isChecked(),true);
 await mkdir('work',{recursive:true});await page.screenshot({path:'work/fixed-layout-screen.png'});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
