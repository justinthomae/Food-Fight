// Food Fight offline support. The whole game is saved on the device the first time it's opened,
// so practice vs bots works with no connection. Online, every request still goes to the network first
// (so updates show up straight away) and the saved copy is only the fallback.
const CACHE='ff-cache-v15';
const CORE=['./','index.html','manifest.webmanifest',
  'js/config.js','js/sfx.js','js/cuisines.js','js/engine.js','js/stack.js','js/shot.js','js/blocks.js','js/modes/slurp.js','js/modes/mold.js','js/modes/pancake.js','js/modes/merge.js','js/modes/conveyor.js','js/modes/pest.js','js/ui/slurp.js','js/ui/mold.js','js/ui/pancake.js','js/ui/merge.js','js/ui/conveyor.js','js/ui/pest.js','js/net.js','js/scores.js','js/social.js','js/app.js',
  'assets/logo.webp',...['bun','sprinkles','crunch','slice','fudge','splat','guac','glaze'].flatMap(f=>[`assets/${f}.webp`,`assets/${f}-face.webp`,`assets/${f}-win.webp`,`assets/${f}-ko.webp`]),
  'icons/favicon-32.png','icons/favicon-64.png','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png'];
const EXTRA=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://fonts.googleapis.com/css2?family=Lilita+One&family=Figtree:wght@400;600;800&display=swap'];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await c.addAll(CORE);
    // third-party files are nice to have offline but must never hold up the install: fetched in the background
    EXTRA.forEach(u=>withTimeout(fetch(new Request(u,{mode:'no-cors'})),8000).then(r=>c.put(u,r)).catch(()=>{}));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('slow')),ms))]);
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(/supabase\.co$/.test(url.hostname))return;               // live game server + leaderboards: never cached
  const same=url.origin===self.location.origin;
  if(same){
    // network first; fall back to the saved copy (pages ignore ?room=... so invite links open offline too)
    e.respondWith((async()=>{
      const c=await caches.open(CACHE);
      try{
        // always check with the server (no stale 10-minute browser copies), so a new version shows up on the next open
        const res=await withTimeout(fetch(req,{cache:'no-cache'}),4000);
        if(res&&res.ok)c.put(req,res.clone()).catch(()=>{});
        return res;
      }catch(err){
        const hit=await c.match(req,{ignoreSearch:req.mode==='navigate'})||(req.mode==='navigate'?await c.match('index.html'):null);
        if(hit)return hit;
        throw err;
      }
    })());
    return;
  }
  // fonts and the realtime library: saved copy first, refreshed in the background
  if(/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(url.hostname)){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE),hit=await c.match(req);
      const net=withTimeout(fetch(req),hit?8000:5000).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(req,res.clone()).catch(()=>{});return res}).catch(()=>null);
      return hit||await net||Response.error();
    })());
  }
});
