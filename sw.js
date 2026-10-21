const CACHE='lunjian-v23';
const SHELL=['./','./index.html','./styles.css','./app.js','./updates.js','./core.js','./libero.js','./shortlinks.js','./sharing.js','./storage.js','./manifest.webmanifest','./icons/paizhen-192-v2.png','./icons/paizhen-512-v2.png','./icons/apple-touch-icon-v2.png','./icons/paizhen-mark.svg'];
const BASE=new URL('./',self.location.href);
const URLS=new Set(SHELL.map(p=>new URL(p,BASE).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(new URL(path,BASE),{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('lunjian-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);url.search='';url.hash='';
  if(!URLS.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(url.href);
    return cached||fetch(event.request);
  }));
});
