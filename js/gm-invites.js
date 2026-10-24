// Grudge Match invites: one file shared by every Grudge Match game (Food Fight, BoomTown, Fliptide, ChipWreck...).
//
// A friend invites you into their game session. Whatever Grudge Match game you're in shows a pop-up:
//   "Ann invited you to play Food Fight"  [Join now]  [After this game]  [x]
// "Join now" takes you there straight away (same game: straight into the room; another game: opens it).
// "After this game" waits until your current match ends, then takes you there. The host sees each answer.
//
// Storage: public.gm_invites in the shared Supabase project (RLS: only accepted friends can invite each other,
// links must be on grudgematchgames.com / boomtowngame.com, invites last 20 minutes).
//
// Use (any game, plain JS or a bundler; needs a supabase-js v2 client that holds the player's session):
//   GMInvites.init({
//     supabase,                 // the game's supabase-js client (Grudge Match account)
//     game: 'boomtown',         // this game's id (lowercase letters)
//     gameName: 'BoomTown',     // shown to players
//     isBusy: () => inAMatch,   // true while a match is being played (enables "After this game")
//     joinHere: inv => false,   // optional: an invite to THIS game; join inv.code in-app and return true
//   });
//   GMInvites.send({ to, toName, url, code, mode })   // invite a friend (host side) -> Promise<{id}|{error}>
//   GMInvites.status(friendId)                         // latest invite you sent them: 'pending'|'now'|'later'|'declined'|'joined'|null
//   GMInvites.onChange(fn)                             // called when an invite you sent or got changes
(function(root){
  'use strict';
  if(root.GMInvites)return;
  const LIFE_MS=20*60*1000,LATER_KEY='gmi-later',URL_RE=/^https:\/\/([a-z0-9-]+\.)*(grudgematchgames\.com|boomtowngame\.com)(\/[A-Za-z0-9\/?=&#._~%-]*)?$/;
  let sb=null,opt={},uid=null,chan=null,listeners=new Set(),sent=new Map(),queue=[],shown=null,laterT=null,authSub=null;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const live=r=>r&&new Date(r.expires_at||0).getTime()>Date.now();
  const busy=()=>{try{return !!(opt.isBusy&&opt.isBusy())}catch(e){return false}};
  const emit=r=>listeners.forEach(f=>{try{f(r)}catch(e){}});
  const store={get(){try{return JSON.parse(localStorage.getItem(LATER_KEY)||'null')}catch(e){return null}},
    set(v){try{v?localStorage.setItem(LATER_KEY,JSON.stringify(v)):localStorage.removeItem(LATER_KEY)}catch(e){}}};

  // ---------- look ----------
  function css(){
    if(document.getElementById('gmi-css'))return;
    const s=document.createElement('style');s.id='gmi-css';
    s.textContent=`
.gmi-wrap{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483000;width:min(440px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none;font:500 15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.gmi{pointer-events:auto;background:#1c2036;color:#eef0fa;border:1px solid #3a4066;border-radius:16px;padding:12px 12px 12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.45);animation:gmi-in .22s ease-out}
.gmi p{margin:0 28px 10px 0}.gmi b{color:#fff}.gmi small{display:block;color:#9aa1c4;font-size:13px;margin-top:2px}
.gmi .gmi-row{display:flex;gap:8px;flex-wrap:wrap}
.gmi button{font:inherit;font-weight:700;border:0;border-radius:12px;min-height:44px;padding:0 14px;cursor:pointer;flex:1 1 auto;background:#2c3254;color:#eef0fa}
.gmi button.gmi-go{background:#f7c548;color:#2a1e05}
.gmi button.gmi-x{position:absolute;right:8px;top:8px;flex:none;width:32px;min-height:32px;padding:0;background:transparent;color:#9aa1c4;font-size:18px}
.gmi{position:relative}
.gmi.gmi-note{padding:10px 40px 10px 14px}.gmi.gmi-note p{margin:0}
@keyframes gmi-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.gmi{animation:none}}`;
    document.head.appendChild(s);
  }
  function wrap(){let w=document.querySelector('.gmi-wrap');if(!w){css();w=document.createElement('div');w.className='gmi-wrap';w.setAttribute('role','status');w.setAttribute('aria-live','polite');document.body.appendChild(w)}return w}
  function card(html,cls){const el=document.createElement('div');el.className='gmi'+(cls?' '+cls:'');el.innerHTML=html;wrap().appendChild(el);return el}
  // a short message (host: "Tim is on the way"); goes away by itself
  function note(html,ms){const el=card(`<p>${html}</p><button class="gmi-x" type="button" aria-label="Dismiss">\u00d7</button>`,'gmi-note');
    el.querySelector('.gmi-x').onclick=()=>el.remove();setTimeout(()=>el.remove(),ms||6000);return el}

  // ---------- receiving ----------
  function where(inv){return inv.game===opt.game?'':` <b>${esc(inv.game_name||inv.game)}</b>`}
  function offer(inv){
    if(!live(inv)||inv.status!=='pending')return;
    if(shown&&shown.inv.id===inv.id)return;
    if(queue.some(q=>q.id===inv.id))return;
    queue.push(inv);next();
  }
  function next(){
    if(shown||!queue.length)return;
    const inv=queue.shift();if(!live(inv)){next();return}
    const b=busy(),same=inv.game===opt.game;
    const el=card(`<p><b>${esc(inv.from_name||'A friend')}</b> invited you to play${same?'':where(inv)}${inv.mode?`<small>${esc(inv.mode)}${inv.code?' \u00b7 room '+esc(inv.code):''}</small>`:''}</p>
      <div class="gmi-row"><button class="gmi-go" data-a="now" type="button">${b?'Join now':'Accept invite'}</button>${b?'<button data-a="later" type="button">After this game</button>':''}</div>
      <button class="gmi-x" data-a="no" type="button" aria-label="No thanks">\u00d7</button>`);
    shown={inv,el};
    el.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;answer(inv,a.dataset.a)});
    try{opt.sound&&opt.sound()}catch(e){}
  }
  function close(){if(shown){shown.el.remove();shown=null}next()}
  async function setStatus(id,status){try{const {error}=await sb.from('gm_invites').update({status}).eq('id',id);return !error}catch(e){return false}}
  async function answer(inv,a){
    close();
    if(a==='no'){setStatus(inv.id,'declined');return}
    if(a==='later'){await setStatus(inv.id,'later');store.set(slim(inv));watchLater();
      note(`You'll join <b>${esc(inv.from_name)}</b>${inv.game===opt.game?'':' in'+where(inv)} when this game ends. <button class="gmi-cancel" type="button" style="all:unset;color:#f7c548;cursor:pointer;font-weight:700">Cancel</button>`,9000)
        .querySelector('.gmi-cancel').onclick=e=>{e.target.closest('.gmi').remove();cancelLater()};
      return}
    await setStatus(inv.id,'now');go(inv);
  }
  const slim=inv=>({id:inv.id,game:inv.game,game_name:inv.game_name,from_name:inv.from_name,url:inv.url,code:inv.code,mode:inv.mode,expires_at:inv.expires_at,status:'later'});
  function go(inv){
    store.set(null);
    if(inv.game===opt.game&&opt.joinHere){let ok=false;try{ok=opt.joinHere(inv)}catch(e){}if(ok){setStatus(inv.id,'joined');return}}
    if(!URL_RE.test(inv.url||''))return;
    const u=inv.url+(inv.url.includes('?')?'&':'?')+'gmi='+encodeURIComponent(inv.id);
    location.assign(u);
  }
  function cancelLater(){const l=store.get();store.set(null);clearInterval(laterT);laterT=null;if(l)setStatus(l.id,'declined')}
  // "After this game": wait for the match to end, then a 4-second heads-up and off you go
  function watchLater(){
    clearInterval(laterT);
    laterT=setInterval(()=>{
      const l=store.get();if(!l||!live(l)){store.set(null);clearInterval(laterT);laterT=null;return}
      if(busy())return;
      clearInterval(laterT);laterT=null;
      let n=4;const el=card(`<p>Game over, joining <b>${esc(l.from_name)}</b>${l.game===opt.game?'':' in'+where(l)} in <b class="gmi-n">${n}</b>\u2026</p>
        <div class="gmi-row"><button class="gmi-go" data-a="go" type="button">Go now</button><button data-a="stay" type="button">Stay here</button></div>`);
      const t=setInterval(()=>{n--;const c=el.querySelector('.gmi-n');if(c)c.textContent=n;if(n<=0){clearInterval(t);el.remove();go(l)}},1000);
      el.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;clearInterval(t);el.remove();if(a.dataset.a==='go')go(l);else cancelLater()});
    },1000);
  }

  // ---------- sending (host) ----------
  function hostNote(r){
    const s=sent.get(r.id);if(!s||s.status===r.status)return;s.status=r.status;
    const n=`<b>${esc(r.to_name||s.toName||'Your friend')}</b>`;
    if(r.status==='now')note(`${n} accepted, on the way!`);
    else if(r.status==='later')note(`${n} accepted, joining after their current game.`,9000);
    else if(r.status==='declined')note(`${n} can't make it right now.`);
    else if(r.status==='joined')note(`${n} joined.`);
  }
  async function send({to,toName,url,code,mode}){
    if(!sb||!uid)return {error:'Sign in first'};
    if(!URL_RE.test(url||''))return {error:'That link can\u2019t be shared'};
    const row={to_user:to,from_user:uid,from_name:String(opt.myName?opt.myName():'').slice(0,40),game:opt.game,game_name:opt.gameName||opt.game,url,code:String(code||'').slice(0,24),mode:String(mode||'').slice(0,40)};
    try{
      const {data,error}=await sb.from('gm_invites').insert(row).select().single();
      if(error)return {error:/row-level/.test(error.message||'')?'You can only invite friends':error.message||'Couldn\u2019t send'};
      const r=Array.isArray(data)?data[0]:data;
      sent.set(r.id,{to,toName,status:'pending',at:Date.now(),code:row.code});emit(Object.assign({},r,{to_name:toName}));return {id:r.id};
    }catch(e){return {error:'Couldn\u2019t send'}}
  }
  // the latest invite you sent this friend for this session code (or any, if no code given)
  function latest(to,code){let best=null;sent.forEach((s,id)=>{if(s.to===to&&(code==null||s.code===String(code))&&(!best||s.at>best.at))best=Object.assign({id},s)});return best}

  // ---------- wiring ----------
  async function setUser(u){
    const id=u&&u.id||null;if(id===uid)return;
    uid=id;queue=[];if(shown){shown.el.remove();shown=null}
    if(chan){try{await sb.removeChannel(chan)}catch(e){}chan=null}
    if(!uid)return;
    // arrived here from an invite link: tell the host
    try{const q=new URLSearchParams(location.search),g=q.get('gmi');if(g){setStatus(g,'joined');q.delete('gmi');const s=q.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash)}}catch(e){}
    try{
      chan=sb.channel('gmi-'+uid)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'gm_invites',filter:'to_user=eq.'+uid},p=>{const r=p&&p.new;if(r){offer(r);emit(r)}})
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'gm_invites',filter:'to_user=eq.'+uid},p=>{const r=p&&p.new;if(!r)return;
          if(r.status==='cancelled'){queue=queue.filter(q=>q.id!==r.id);if(shown&&shown.inv.id===r.id)close();const l=store.get();if(l&&l.id===r.id)store.set(null)}emit(r)})
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'gm_invites',filter:'from_user=eq.'+uid},p=>{const r=p&&p.new;if(r){hostNote(r);emit(r)}})
        .subscribe();
    }catch(e){}
    // invites that came in while you were away (still fresh)
    try{
      const {data}=await sb.from('gm_invites').select('*').eq('to_user',uid).eq('status','pending').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(5);
      const seen=new Set();(data||[]).forEach(r=>{if(!seen.has(r.from_user)){seen.add(r.from_user);offer(r)}});
    }catch(e){}
    const l=store.get();if(l&&live(l))watchLater();else store.set(null);
  }
  async function init(o){
    opt=Object.assign({},o||{});sb=opt.supabase;if(!sb||!opt.game)return;
    try{const {data}=await sb.auth.getSession();await setUser(data&&data.session&&data.session.user)}catch(e){}
    try{if(authSub)authSub.unsubscribe();const r=sb.auth.onAuthStateChange((ev,s)=>{setUser(s&&s.user)});authSub=r&&r.data&&r.data.subscription}catch(e){}
  }
  root.GMInvites={init,send,
    status(to,code){const l=latest(to,code);return l?l.status:null},
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    pending(){return store.get()},
    _test:{URL_RE,get uid(){return uid},sent}};
})(typeof window!=='undefined'?window:globalThis);
