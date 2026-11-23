const CACHE='mx-spend-v26-cloud-reconnect';
const APP=['./','./index.html','./manifest.webmanifest','./mxpeso-icon-192.png','./mxpeso-icon-192.png?v=20261019'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mx-spend-')&&key!==CACHE)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    let response;
    try{
      response=await fetch(req);
      if(response.ok){try{await cache.put(req,response.clone())}catch{/* A full cache must not block the response. */}}
      if(response.status<500)return response;
    }catch{/* A network error uses the same fallback as a server outage. */}
    return await cache.match(req)||(req.mode==='navigate'?await cache.match('./index.html'):null)||response||Response.error();
  })());
});

