// Cross-game invites: a friend in another Grudge Match game (Lost Empires, Silent Depths...) invites you there.
//
// A slim card shows up here, never a modal over the board:
//   "Ann invites you to Lost Empires"   [Join now] [After this game] [x]      (mid-match)
//   "Ann invites you to Lost Empires"   [Join] [No thanks]                    (anywhere else)
// "After this game" waits for the match to end, then: "Ann is waiting for you in Lost Empires" [Join] [No thanks].
//
// Backend (studio-wide, shared Supabase project; nothing here creates or changes tables):
//   rpc('gm_my_invites')  -> rows of public.gm_cross_invites for the signed-in player, status 'pending' | 'later', not expired
//   rpc('gm_respond_invite', {p_invite, p_choice:'now'|'later'|'decline', p_from_app}) -> the invite's join_url
// The table isn't on Realtime, so it's polled every 9 s while signed in and the page is visible.
//
// Use: GMCrossInvites.init({ supabase, app:'foodfight', isBusy:()=>inAMatch, sound:()=>{} })
(function(root){
  'use strict';
  const POLL_MS=9000,WATCH_MS=1000;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // join links come from the server, but only ever open https ones
  const httpsUrl=u=>{try{const x=new URL(String(u||''));return x.protocol==='https:'?x.href:''}catch(e){return''}};
  const live=(r,now)=>!!(r&&r.id&&new Date(r.expires_at||0).getTime()>now);

  // ---------- decisions (pure, unit tested in test/gm-cross-invites.js) ----------
  // the card for one invite, or null when it shouldn't show right now
  function card(inv,inMatch){
    if(!inv)return null;
    const from=inv.from_name||'A friend',app=inv.app_name||inv.app||'another game';
    if(inv.status==='later'){
      if(inMatch)return null;   // accepted for later: wait until this match is over
      return {kind:'waiting',text:`${from} is waiting for you in ${app}`,from,app,
        buttons:[{a:'now',label:'Join'},{a:'decline',label:'No thanks'}]};
    }
    if(inv.status!=='pending')return null;
    return {kind:'invite',text:`${from} invites you to ${app}`,from,app,
      buttons:inMatch?[{a:'now',label:'Join now'},{a:'later',label:'After this game'},{a:'decline',label:'×',x:true}]
                     :[{a:'now',label:'Join'},{a:'decline',label:'No thanks'}]};
  }
  // which invite to show (one at a time): new invites first, oldest first
  function pick(rows,o){
    o=o||{};const now=o.now||Date.now(),skip=o.skip||new Set();
    const ok=(rows||[]).filter(r=>live(r,now)&&r.app!==o.app&&!skip.has(r.id)&&httpsUrl(r.join_url)&&card(r,o.inMatch));
    ok.sort((a,b)=>((a.status==='pending'?0:1)-(b.status==='pending'?0:1))||(new Date(a.created_at||0)-new Date(b.created_at||0)));
    return ok.length?{inv:ok[0],card:card(ok[0],o.inMatch)}:null;
  }

  // ---------- look ----------
  function css(){
    if(document.getElementById('gmx-css'))return;
    const s=document.createElement('style');s.id='gmx-css';
    s.textContent=`
.gmx-wrap{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483000;width:min(440px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none;font:500 15px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.gmx{position:relative;pointer-events:auto;background:#1c2036;color:#eef0fa;border:1px solid #3a4066;border-radius:14px;padding:10px 12px;box-shadow:0 10px 28px rgba(0,0,0,.45);animation:gmx-in .2s ease-out}
.gmx p{margin:0 0 8px}.gmx b{color:#fff}
.gmx .gmx-row{display:flex;gap:8px;flex-wrap:wrap}
.gmx button{font:inherit;font-weight:700;border:0;border-radius:11px;min-height:40px;padding:0 14px;cursor:pointer;flex:1 1 auto;background:#2c3254;color:#eef0fa}
.gmx button.gmx-go{background:#f7c548;color:#2a1e05}
.gmx button.gmx-x{flex:0 0 40px;padding:0;background:transparent;color:#9aa1c4;font-size:20px}
.gmx.gmx-slim{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;font-size:14px}
.gmx.gmx-slim p{flex:1 1 auto;margin:0;min-width:0}
.gmx.gmx-slim .gmx-row{flex:0 0 auto;flex-wrap:nowrap;gap:6px}
.gmx.gmx-slim button{min-height:36px;padding:0 10px;font-size:13px}
.gmx.gmx-slim button.gmx-x{flex-basis:32px;padding:0}
.gmx.gmx-note{padding:9px 12px}.gmx.gmx-note p{margin:0}
@media (max-width:420px){.gmx.gmx-slim{flex-wrap:wrap}.gmx.gmx-slim p{flex-basis:100%}.gmx.gmx-slim .gmx-row{flex:1 1 auto}}
@keyframes gmx-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.gmx{animation:none}}`;
    document.head.appendChild(s);
  }
  function wrap(){let w=document.querySelector('.gmx-wrap');if(!w){css();w=document.createElement('div');w.className='gmx-wrap';w.setAttribute('role','status');w.setAttribute('aria-live','polite');document.body.appendChild(w)}return w}
  function note(text,ms){const el=document.createElement('div');el.className='gmx gmx-note';el.innerHTML=`<p>${esc(text)}</p>`;wrap().appendChild(el);setTimeout(()=>el.remove(),ms||4000);return el}

  // ---------- state ----------
  let sb=null,opt={},uid=null,rows=[],skip=new Set(),over=new Map(),shown=null,shownKey='',lastSound='',inflight=false,started=false;
  const busy=()=>{try{return !!(opt.isBusy&&opt.isBusy())}catch(e){return false}};
  const hidden=()=>typeof document!=='undefined'&&document.hidden;

  function hide(){if(shown){shown.remove();shown=null}shownKey=''}
  function render(){
    if(typeof document==='undefined'||!document.body)return;
    const p=uid?pick(rows,{app:opt.app,inMatch:busy(),skip}):null;
    const key=p?p.inv.id+'|'+p.card.kind+'|'+p.card.buttons.map(b=>b.a).join(','):'';
    if(key===shownKey)return;
    hide();if(!p)return;
    const {inv,card:c}=p,slim=c.buttons.some(b=>b.a==='later'),el=document.createElement('div');
    el.className='gmx'+(slim?' gmx-slim':'');el.dataset.invite=inv.id;el.dataset.kind=c.kind;
    const msg=c.kind==='waiting'?`<b>${esc(c.from)}</b> is waiting for you in <b>${esc(c.app)}</b>`:`<b>${esc(c.from)}</b> invites you to <b>${esc(c.app)}</b>`;
    el.innerHTML=`<p>${msg}</p><div class="gmx-row">${c.buttons.map(b=>`<button type="button" data-a="${b.a}"${b.x?' class="gmx-x" aria-label="No thanks"':b.a==='now'?' class="gmx-go"':''}>${esc(b.label)}</button>`).join('')}</div>`;
    el.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b)answer(inv,b.dataset.a)});
    wrap().appendChild(el);shown=el;shownKey=key;
    const sk=inv.id+'|'+c.kind;if(sk!==lastSound){lastSound=sk;try{opt.sound&&opt.sound()}catch(e){}}
  }

  async function poll(){
    if(!sb||!uid||inflight||hidden())return;
    inflight=true;const me=uid;
    try{
      const {data,error}=await sb.rpc('gm_my_invites');
      if(!error&&me===uid){
        rows=(Array.isArray(data)?data:[]).map(r=>{const s=over.get(r.id);if(s&&r.status===s)over.delete(r.id);return s?Object.assign({},r,{status:s}):r});
        const ids=new Set(rows.map(r=>r.id));skip.forEach(id=>{if(!ids.has(id))skip.delete(id)});over.forEach((s,id)=>{if(!ids.has(id))over.delete(id)});
        render();
      }
    }catch(e){}
    inflight=false;
  }

  async function answer(inv,a){
    if(!['now','later','decline'].includes(a)||skip.has(inv.id))return;
    skip.add(inv.id);render();
    let url='',failed=false;
    try{const {data,error}=await sb.rpc('gm_respond_invite',{p_invite:inv.id,p_choice:a,p_from_app:opt.app});
      if(error)failed=true;else url=Array.isArray(data)?data[0]:data}catch(e){failed=true}
    if(failed){if(a!=='decline')skip.delete(inv.id);note('Couldn’t reach Grudge Match. Try again in a moment.');render();return}
    if(a==='later'){
      over.set(inv.id,'later');rows=rows.map(r=>r.id===inv.id?Object.assign({},r,{status:'later'}):r);skip.delete(inv.id);
      note(`We'll remind you about ${inv.app_name||'it'} when this game ends.`);render();return;
    }
    if(a==='now'){const u=httpsUrl(typeof url==='string'&&url?url:inv.join_url);if(u)api.go(u)}
  }

  function setUser(u){
    const id=u&&u.id||null;if(id===uid)return;
    uid=id;rows=[];skip.clear();over.clear();lastSound='';hide();
    if(uid)poll();
  }
  async function init(o){
    opt=Object.assign({},o||{});sb=opt.supabase;if(!sb||!opt.app||started)return;started=true;
    try{const {data}=await sb.auth.getSession();setUser(data&&data.session&&data.session.user)}catch(e){}
    try{sb.auth.onAuthStateChange((ev,s)=>setUser(s&&s.user))}catch(e){}
    setInterval(poll,POLL_MS);
    setInterval(()=>{if(uid)render()},WATCH_MS);   // the match ending brings back "waiting for you" cards; no network
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
  }

  const api={init,poll,card,pick,httpsUrl,go:u=>location.assign(u),_test:{get rows(){return rows},render}};
  root.GMCrossInvites=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
