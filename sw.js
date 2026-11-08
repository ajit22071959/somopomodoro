// v5 — click behavior is captured with each notification, not read from stale settings.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{
  const data=e.notification.data||{};
  // Never reinterpret an explicit Stop as Start. Some browsers report only a
  // body click; in that case use the policy saved when this note was shown.
  const action=e.action==='stop'?'stop':e.action==='start'?'start':data.bodyAction==='start'?'start':'stop';
  const msg={...data,stillAction:action,id:Date.now()+'-'+Math.random()};
  e.notification.close();
  e.waitUntil((async()=>{
    try{const bc=new BroadcastChannel('still-timer');bc.postMessage(msg);bc.close();}catch(_){}
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const scope=self.registration.scope;
    const mine=list.filter(c=>c.url.startsWith(scope));
    for(const c of mine)c.postMessage(msg);
    if(!e.action&&mine[0]&&'focus' in mine[0])return mine[0].focus();
    if(!mine.length)return self.clients.openWindow(scope);
  })());
});
