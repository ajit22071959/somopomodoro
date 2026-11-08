self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{
  const action=e.action||'open';
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const scope=self.registration.scope;
    const client=list.find(c=>c.url.startsWith(scope))||list[0];
    if(client){
      client.postMessage({stillAction:action});
      if(action==='open'&&'focus' in client)return client.focus();
      return;
    }
    return self.clients.openWindow(scope);
  }));
});
