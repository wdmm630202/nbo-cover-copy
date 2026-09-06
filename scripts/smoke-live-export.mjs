import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { chromium,executablePath,available } from '../tests/helpers/live-browser-driver.mjs';
if(!available)throw new Error('请安装 Playwright 与 Chrome，或指定 NBO_TEST_CHROME');
const root=resolve('docs'),out=resolve('outputs/live-verification');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath,headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>process.stderr.write(e.message+'\n'));
 await page.addInitScript(()=>{localStorage.setItem('nbo_cover_access_until',String(Date.now()+1000000));});
 await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
 for(const [id,color,title] of [['fileInput','#5b402c','精修画面'],['beforeFileInput','#3a5866','素颜画面']]){
  const data=await page.evaluate(({color,title})=>{const c=document.createElement('canvas');c.width=1200;c.height=1600;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);x.fillStyle='#ffffff15';for(let i=0;i<12;i++)x.fillRect(i*110,0,50,1600);x.fillStyle='#e8d8bf';x.font='bold 90px sans-serif';x.fillText(title,220,450);x.beginPath();x.arc(600,730,210,0,7);x.fill();x.fillRect(330,980,540,620);return c.toDataURL('image/png').split(',')[1];},{color,title});
  await page.locator('#'+id).setInputFiles({name:title+'.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 }
 await page.locator('#topText').fill('男士素人改造');await page.locator('#bottomText').fill('原来普通男生');await page.locator('#subtitle').fill('也能拍成这样');
 await page.evaluate(()=>{for(const [id,value]of [['zoom',110],['offsetX',-10],['offsetY',4]]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}});
 await page.getByRole('button',{name:'制作 Live',exact:true}).click();
 await page.waitForFunction(()=>{const e=document.querySelector('.live-export');return e&&!e.disabled;});
 await page.waitForTimeout(3200);
 await page.screenshot({path:resolve(out,'desktop-live.png')});
 for(const time of [0,0.5,29/30,1,1.5,59/30,2,2.5,89/30]){
  const data=await page.evaluate(time=>{const c=document.createElement('canvas');NBOCoverCore.drawCover({canvas:c,image:state.image,beforeImage:state.beforeImage,watermark:null,settings:{...state},preset:{id:state.platformId,...preset()},includeGuide:false,live:liveController.presentation(time)});return c.toDataURL('image/png').split(',')[1];},time);
  await writeFile(resolve(out,`frame-${time.toFixed(3)}.png`),Buffer.from(data,'base64'));
 }
 const download=page.waitForEvent('download',{timeout:90000});
 await page.getByRole('button',{name:'导出 Live',exact:true}).click();
 const file=await download;await file.saveAs(resolve(out,'live-export.zip'));
 console.log('EXPORTED',file.suggestedFilename(),await page.locator('.live-status').textContent());
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'mobile-live.png')});
}finally{await browser.close();await new Promise(r=>server.close(r));}
