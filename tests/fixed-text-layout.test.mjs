import assert from 'node:assert/strict';
import test from 'node:test';
let layout;
try { layout = await import('../app/cover/core/fixed-text-layout.ts'); } catch (error) { if(error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const measure=(text,size)=>({width:Array.from(text).reduce((w,c)=>w+(/[0-9]/.test(c)?0.56:1)*size,0),ascent:size*.8,descent:size*.1});
test('自动封面在所有3到5字组合下固定边界、两段等距且装饰线居中且不压缩字形',()=>{
 assert.ok(layout,'需要统一排版求解器');
 for(const a of [3,4,5]) for(const b of [3,4,5]) for(const width of [540,1080,2160]) for(const height of [width*16/9,width*4/3]) {
 const p=layout.solveFixedTextLayout({topText:'男'.repeat(a),bottomText:'好'.repeat(b),subtitle:'不被定义的自己',width,height,measure});
 const s=width/1080;
 assert.equal(p.error,null);
 assert.ok(Math.abs(p.topBaseline-p.topInk.ascent-(1008-(height/width<1.5?240:0))*s)<.01);
 assert.ok(Math.abs(p.subtitleBaseline+p.subtitleInk.descent-(1482-(height/width<1.5?240:0))*s)<.01);
 const gaps=[p.bottomBaseline-p.bottomInk.ascent-p.topBaseline-p.topInk.descent,p.subtitleBaseline-p.subtitleInk.ascent-p.bottomBaseline-p.bottomInk.descent];assert.ok(Math.abs(p.dividerY+p.dividerThickness/2-(p.bottomBaseline+p.bottomInk.descent+gaps[1]/2))<.01);
 assert.ok(Math.max(...gaps)-Math.min(...gaps)<.01);
 assert.ok(p.topInk.width<=p.maxWidth+.01&&p.bottomInk.width<=p.maxWidth+.01);
 assert.ok(p.fontSize<=168*s);
 }
});
test('过长主标题和副标题明确报错，不截断不缩成无法阅读的小字',()=>{
 assert.ok(layout);
 const args={topText:'第一次',bottomText:'给自己拍照',subtitle:'不被定义的自己',width:1080,height:1920,measure};
 assert.match(layout.solveFixedTextLayout({...args,topText:'六个字的标题'}).error,/最多5/);
 assert.match(layout.solveFixedTextLayout({...args,subtitle:'这是太长太长太长太长的副标题'}).error,/副标题/);
 const p=layout.solveFixedTextLayout({...args,topText:'268元'});
 assert.equal(p.error,null); assert.ok(p.topInk.width<p.bottomInk.width);
});

test('装饰线开关不改变文字字号、位置或两段间距',()=>{
 const args={topText:'男人的',bottomText:'高级感客家',subtitle:'不被定义的自己',width:1080,height:1920,measure};
 const a=layout.solveFixedTextLayout(args), b=layout.solveFixedTextLayout({...args,showDivider:false});
 for(const key of ['fontSize','topBaseline','bottomBaseline','subtitleBaseline','gap'])assert.equal(a[key],b[key]);
});
