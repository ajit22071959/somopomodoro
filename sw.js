// v4
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{
  const action=e.action||'open';
  const msg={stillAction:action,id:Date.now()+'-'+Math.random()};
  e.notification.close();
  e.waitUntil((async()=>{
    try{const bc=new BroadcastChannel('still-timer');bc.postMessage(msg);bc.close();}catch(_){}
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const scope=self.registration.scope;
    const mine=list.filter(c=>c.url.startsWith(scope));
    for(const c of mine)c.postMessage(msg);
    if(action==='open'&&mine[0]&&'focus' in mine[0])return mine[0].focus();
    if(!mine.length)return self.clients.openWindow(scope);
  })());
});
