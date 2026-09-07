import test from 'node:test';
import assert from 'node:assert/strict';
import {exportNativeLive,getNativeLiveBridge} from '../public/live/native.js';

function fixture(overrides={}){
  const calls=[],times=[],progress=[];
  let inFlight=false;
  const canvas={width:0,height:0,toDataURL(type,quality){
    assert.equal(type,'image/jpeg');assert.equal(quality,0.97);
    assert.equal(this.width,1080);assert.ok([1440,1920].includes(this.height));
    return 'data:image/jpeg;base64,ZmFrZQ==';
  }};
  const bridge={async postMessage(command){
    assert.equal(inFlight,false,'bridge frames must be awaited sequentially');inFlight=true;
    calls.push(command);await Promise.resolve();inFlight=false;
    if(overrides.reply)return overrides.reply(command);
    return command.action==='start'?{session:'test-session'}:command.action==='finish'?{saved:true}:{};
  }};
  return {calls,times,progress,canvas,bridge,options:{width:1080,height:1920,bridge,
    createCanvas:()=>canvas,renderFrame:(target,time)=>{assert.equal(target,canvas);times.push(time);},
    onProgress:value=>progress.push(value)}};
}

test('native bridge detection requires callable reply handler',()=>{
  assert.equal(getNativeLiveBridge({}),null);
  assert.equal(getNativeLiveBridge({webkit:{messageHandlers:{nanboLive:{}}}}),null);
  const bridge={postMessage(){}};
  assert.equal(getNativeLiveBridge({webkit:{messageHandlers:{nanboLive:bridge}}}),bridge);
});

for(const height of [1920,1440])test(`native exports 90 sequential JPEG frames at 1080×${height}`,async()=>{
  const f=fixture();let saving=false;
  const result=await exportNativeLive({...f.options,height,onSaving(){
    assert.equal(f.calls.length,91);assert.equal(f.calls.at(-1).index,89);saving=true;
  }});
  assert.deepEqual(result,{saved:true});assert.equal(saving,true);
  assert.deepEqual(f.calls[0],{action:'start',width:1080,height});
  assert.deepEqual(f.calls.at(-1),{action:'finish',session:'test-session'});
  assert.equal(f.calls.length,92);
  for(let i=0;i<90;i++){
    assert.deepEqual(f.calls[i+1],{action:'frame',session:'test-session',index:i,jpeg:'ZmFrZQ=='});
    assert.equal(f.times[i],i/30);
  }
  assert.equal(f.progress[0],0);assert.equal(f.progress.at(-1),100);
  assert.equal(f.canvas.width,0);assert.equal(f.canvas.height,0);
});

test('unsupported dimensions fail before requesting native access',async()=>{
  const f=fixture();
  await assert.rejects(exportNativeLive({...f.options,width:1920,height:1080}),/实况尺寸/);
  assert.equal(f.calls.length,0);
});

test('failed frame cancels native session, releases canvas and never finishes',async()=>{
  const f=fixture({reply(command){
    if(command.action==='start')return {session:'test-session'};
    if(command.index===4)throw new Error('编码失败');
    return {};
  }});
  await assert.rejects(exportNativeLive(f.options),/编码失败/);
  assert.deepEqual(f.calls.at(-1),{action:'cancel',session:'test-session'});
  assert.equal(f.calls.some(c=>c.action==='finish'),false);
  assert.equal(f.progress.includes(100),false);assert.equal(f.canvas.width,0);
});

test('abort during a frame cancels without sending further frames or finish',async()=>{
  const controller=new AbortController();
  const f=fixture({reply(command){
    if(command.action==='start')return {session:'test-session'};
    if(command.index===3)controller.abort();
    return {};
  }});
  await assert.rejects(exportNativeLive({...f.options,signal:controller.signal}),{name:'AbortError'});
  assert.equal(f.calls.filter(c=>c.action==='frame').length,4);
  assert.deepEqual(f.calls.at(-1),{action:'cancel',session:'test-session'});
  assert.equal(f.calls.some(c=>c.action==='finish'),false);
  assert.equal(f.progress.includes(100),false);assert.equal(f.canvas.height,0);
});

test('abort during permission request cancels the returned session before rendering',async()=>{
  const controller=new AbortController();
  const f=fixture({reply(command){
    if(command.action==='start'){controller.abort();return {session:'test-session'};}
    return {};
  }});
  await assert.rejects(exportNativeLive({...f.options,signal:controller.signal}),{name:'AbortError'});
  assert.deepEqual(f.calls.map(c=>c.action),['start','cancel']);assert.equal(f.times.length,0);
});

test('already aborted request does not start a session',async()=>{
  const controller=new AbortController();controller.abort();const f=fixture();
  await assert.rejects(exportNativeLive({...f.options,signal:controller.signal}),{name:'AbortError'});
  assert.equal(f.calls.length,0);
});

test('Photos save failure is not reported as success and cleans up session',async()=>{
  const f=fixture({reply(command){return command.action==='start'?{session:'test-session'}:{};}});
  await assert.rejects(exportNativeLive(f.options),/实况未保存/);
  assert.equal(f.calls.at(-1).action,'cancel');assert.equal(f.progress.includes(100),false);
  assert.equal(f.canvas.width,0);
});

test('native controls start on Save gesture without browser exporter or directory picker',async()=>{
  const {mountLiveControls}=await import('../public/live/controls.js');
  const keys=['webkit','document','Image','matchMedia','cancelAnimationFrame','showDirectoryPicker','fetch'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const elements=new Map();
  const host={innerHTML:'',querySelector(selector){
    if(!elements.has(selector))elements.set(selector,{value:'focus',textContent:'',hidden:false,disabled:false,
      listeners:{},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}});
    return elements.get(selector);
  }};
  const f=fixture({reply:c=>c.action==='start'?{session:'test-session',version:2}:c.action==='finish'?{saved:true}:{}});let rendered=0,controls;
  try{
    globalThis.webkit={messageHandlers:{nanboLive:f.bridge}};
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});
    f.canvas.getContext=()=>({drawImage(){},fillRect(){}});
    globalThis.document={createElement(type){assert.equal(type,'canvas');return f.canvas;}};
    globalThis.Image=class {async decode(){}};
    globalThis.matchMedia=()=>({matches:true});globalThis.cancelAnimationFrame=()=>{};
    globalThis.showDirectoryPicker=()=>{assert.fail('native path must never request a directory');};
    controls=mountLiveControls({host,onToggle(){},onRefresh(){},motionAt:()=>({animationTime:0,phase:'complete'}),
      captureRender:()=>({width:1080,height:1920,render(){rendered++;}})});
    assert.equal(f.calls.length,0,'mounting must not request Photos permission');
    assert.equal(host.innerHTML.includes('下载 Mac 保存助手'),false);
    assert.ok(host.innerHTML.includes('直接保存到苹果'));
    controls.setEnabled(true);await new Promise(resolve=>setImmediate(resolve));
    elements.get('.live-export').listeners.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls[0].action,'start','Photos access begins after explicit Save, with selected sound');
    assert.equal(f.calls[0].duration,2);assert.equal(f.calls[0].audioBase64,'AQID');
    for(let attempt=0;attempt<20&&elements.get('.live-export').disabled;attempt++){
      await new Promise(resolve=>setImmediate(resolve));
    }
    assert.equal(rendered,60);assert.equal(f.calls.at(-1).action,'finish');
    assert.match(elements.get('output').textContent,/实况已保存到苹果/);
    assert.equal(elements.get('.live-toggle').disabled,false);
    assert.equal(elements.get('.live-cancel').hidden,true);
  }finally{
    controls?.setEnabled(false);
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
