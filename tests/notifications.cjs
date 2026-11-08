const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source); // syntax check the actual inline script
const chrome='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36';
const cases=[
 ['Chrome',chrome,{},2,true],
 ['Edge',chrome+' Edg/142.0.0.0',{},2,true],
 ['Opera',chrome+' OPR/124.0.0.0',{},2,false],
 ['Opera client hints',chrome,{brands:[{brand:'Opera'},{brand:'Google Chrome'}]},2,false],
 ['Chrome client hints','reduced UA',{brands:[{brand:'Chromium'},{brand:'Google Chrome'}]},2,true],
 ['Firefox','Mozilla/5.0 Firefox/145.0',{},0,false],
 ['Unknown','UnknownBrowser/1.0',{},2,false],
 ['Chromium only','Chromium/142.0',{brands:[{brand:'Chromium'}]},2,false],
 ['No action capacity',chrome,{},0,false],
 ['One action capacity',chrome,{},1,false],
 ['Missing action capacity',chrome,{},undefined,false],
 ['Mobile Chrome',chrome+' Android',{mobile:true},2,false]
];
function setup(ua,hints,maxActions,stored={},withoutSW=false){
 const dom=new JSDOM(html,{url:'https://example.test/somopomodoro/',runScripts:'outside-only'});
 const w=dom.window,notes=[],channels=[],listeners={};
 Object.defineProperty(w.navigator,'userAgent',{value:ua});
 Object.defineProperty(w.navigator,'userAgentData',{value:hints});
 w.isSecureContext=true;
 w.localStorage.setItem('still.settings.v1',JSON.stringify(stored));
 w.setInterval=()=>0;w.setTimeout=()=>0;
 class Notification{static permission='granted';static maxActions=maxActions;
  constructor(title,opts){notes.push({title,opts,note:this});}close(){} }
 w.Notification=Notification;
 const reg={update(){},async showNotification(title,opts){notes.push({title,opts});}};
 if(!withoutSW)Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>reg,ready:Promise.resolve(reg),addEventListener(type,fn){listeners[type]=fn;}}});
 w.BroadcastChannel=class{constructor(){channels.push(this);}};
 const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}};
 w.AudioContext=class{state='running';currentTime=0;destination={};createGain(){return {gain:param,connect(){},disconnect(){}};}createDynamicsCompressor(){return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){}};}createOscillator(){return {frequency:param,connect(){},disconnect(){},start(){},stop(){}};}};
 w.focus=()=>{};
 w.eval(source.replace('setInterval(tick,200);render();','setInterval(tick,200);render(); window.__test={complete,setMode,handleNotifAction,notificationPolicy,state:()=>({mode,running,alarmActive,deadline}),setPreference:value=>{settings.clickStarts=value;}};'));
 return {w,notes,channels,listeners,close:()=>w.close()};
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
async function deliver(app,note,action){
 const handlers={},direct=[],broadcast=[];let work,closed=false;
 const client={url:app.w.location.href,postMessage(msg){direct.push(msg);app.listeners.message({data:msg});},focus(){}};
 const context={self:{registration:{scope:'https://example.test/somopomodoro/'},addEventListener(type,fn){handlers[type]=fn;},clients:{matchAll:async()=>[client],openWindow(){throw Error('must use existing client');}}},BroadcastChannel:class{postMessage(msg){broadcast.push(msg);app.channels[0].onmessage({data:msg});}close(){}},Date,Math};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
 handlers.notificationclick({action,notification:{data:note.opts.data,close(){closed=true;}},waitUntil(p){work=p;}});
 await work;
 assert.equal(closed,true);assert.equal(direct.length,1);assert.equal(broadcast.length,1);
 assert.equal(direct[0].id,broadcast[0].id);
 return direct[0];
}
for(const [name,ua,hints,capacity,dual] of cases){
 for(const clickStarts of [false,true])for(const notifications of [false,true]){
  test(`${name}: saved clickStarts=${clickStarts}, notifications=${notifications}`,async()=>{
   const app=setup(ua,hints,capacity,{clickStarts,notifications});
   try{
    const {w}=app,$=id=>w.document.getElementById(id);
    assert.equal($('clickStartsOption').hidden,dual||!notifications);
    assert.equal($('clickStarts').checked,clickStarts);
    assert.equal($('stopAlarm').hidden,!dual&&notifications&&clickStarts);
    $('notifications').checked=!notifications;$('notifications').dispatchEvent(new w.Event('change'));
    assert.equal($('clickStartsOption').hidden,dual||notifications);
    $('notifications').checked=notifications;$('notifications').dispatchEvent(new w.Event('change'));
    const api=w.__test;
    for(const ended of ['focus','short','long']){
     api.setMode(ended);api.complete();await flush();
     assert.equal(api.state().running,false);
     if(!notifications){assert.equal(app.notes.length,0);continue;}
     const note=app.notes.at(-1),next=ended==='focus'?'short':'focus';
     assert.equal(note.opts.data.nextMode,next);
     const actionNames=Array.from(note.opts.actions,a=>a.action);
     assert.deepEqual(actionNames,dual?['stop','start']:[clickStarts?'start':'stop']);
     const startAction=note.opts.actions.find(a=>a.action==='start');
     if(startAction)assert.equal(startAction.title,next==='focus'?'Start Focus':'Start Break');
     // Body click follows the snapshot, even if settings changed in the meantime.
     api.setPreference(!clickStarts);
     const msg=await deliver(app,note,'');
     assert.equal(api.state().running,!dual&&clickStarts);
     assert.equal(api.state().mode,next);assert.equal(api.state().alarmActive,false);
     // Duplicate delivery must not restart a timer after it has been stopped/reset.
     api.setMode(next);api.handleNotifAction(msg);assert.equal(api.state().running,false);
     // Explicit Stop must never start, even with fallback set to Start.
     await deliver(app,note,'stop');assert.equal(api.state().running,false);
     // Explicit Start actually starts the next timer, and repeated channels do not pause it.
     await deliver(app,note,'start');assert.equal(api.state().running,true);
     assert.equal(api.state().mode,next);assert.ok(api.state().deadline>Date.now());
     api.setPreference(clickStarts);
    }
    assert.equal(JSON.parse(w.localStorage.getItem('still.settings.v1')).clickStarts,clickStarts);
   }finally{app.close();}
  });
 }
}
test('fallback on-page Stop visibility updates during ringing; page clicks still silence',async()=>{
 const app=setup(chrome+' OPR/124',{},2,{notifications:true,clickStarts:true});
 try{app.w.__test.complete();await flush();
  assert.equal(app.w.__test.state().alarmActive,true);
  assert.equal(app.w.document.getElementById('alarmPanel').hidden,false);
  const w=app.w,$=id=>w.document.getElementById(id);
  assert.equal($('stopAlarm').hidden,true);
  $('clickStarts').checked=false;$('clickStarts').dispatchEvent(new w.Event('change'));
  assert.equal($('stopAlarm').hidden,false);
  $('clickStarts').checked=true;$('clickStarts').dispatchEvent(new w.Event('change'));
  assert.equal($('stopAlarm').hidden,true);
  $('notifications').checked=false;$('notifications').dispatchEvent(new w.Event('change'));
  assert.equal($('stopAlarm').hidden,false);
  $('notifications').checked=true;$('notifications').dispatchEvent(new w.Event('change'));
  assert.equal($('stopAlarm').hidden,true);
  w.document.body.click();
  assert.equal(app.w.__test.state().alarmActive,false);
  assert.equal(app.w.__test.state().running,false);
 }finally{app.close();}
});
test('unsupported Notification API hides fallback option and completes safely',()=>{
 const app=setup('Unknown',{},0,{notifications:true,clickStarts:true});
 try{delete app.w.Notification; // New page with API absent, not a mid-session browser change.
  const bare=new JSDOM(html,{url:'https://example.test/',runScripts:'outside-only'});
  bare.window.setInterval=()=>0;bare.window.eval(source);
  assert.equal(bare.window.document.getElementById('clickStartsOption').hidden,true);
  assert.match(bare.window.document.getElementById('notifStatus').textContent,/does not support/);
  bare.window.close();
 }finally{app.close();}
});

for(const clickStarts of [false,true])test(`non-service-worker notification body fallback: ${clickStarts}`,async()=>{
 const app=setup(chrome+' OPR/124',{},2,{notifications:true,clickStarts},true);
 try{app.w.__test.complete();await flush();
  const note=app.notes.at(-1);assert.ok(note.note);
  assert.equal(note.opts.actions,undefined);
  note.note.onclick();assert.equal(app.w.__test.state().running,clickStarts);
  assert.equal(app.w.__test.state().alarmActive,false);
 }finally{app.close();}
});
test('another timer tab does not react to this page notification',async()=>{
 const a=setup(chrome,{},2),b=setup(chrome,{},2);
 try{a.w.__test.complete();b.w.__test.complete();await flush();
  b.w.__test.handleNotifAction({...a.notes.at(-1).opts.data,stillAction:'start'});
  assert.equal(b.w.__test.state().running,false);
 }finally{a.close();b.close();}
});
