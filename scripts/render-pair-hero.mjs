// Extract only the approved after-face typography, without rebuilding its glyph animation.
import {chromium,executablePath} from '../tests/helpers/live-browser-driver.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out='outputs/pair-hero';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:.5});
 await page.goto(pathToFileURL(resolve('scripts/live-hero-source/index.html')).href);
 console.log("Hero source loaded");
 await page.evaluate(()=>document.fonts.ready);
 console.log("Hero fonts ready");
 await page.addStyleTag({content:'.card{transform:none!important;border-color:transparent!important;box-shadow:none!important}.card::before,.card::after,.front,.grain,.frame-brackets,.transition-effects,.rim-hairline,.laser-light{display:none!important}.back{clip-path:none!important}'});
 console.log('Hero style ready');
 for(let i=0;i<30;i++){
  await page.evaluate(t=>{window.__timelines['card-series'].seek(t);},.57+i/29*1.4);
  await page.screenshot({path:resolve(out,`${i}.png`),omitBackground:true,timeout:10000});
 }
 await writeFile(resolve(out,'source.txt'),'Approved v10 hero glyphs; front face and panel chrome omitted.\n');
}finally{await browser.close();}
