// Food Fight social: the shared Grudge Match account (same login and friends as BoomTown), who's online,
// friend requests, inviting friends to your room and hopping into theirs. Guests can still play without it.
//
// Data (Supabase project shared with BoomTown):
//  - auth.users + public.users (created by BoomTown's handle_new_user trigger on first sign-in)
//  - public.friends: one row per pair. Sender inserts {user_id: me, friend_user_id: them, status:'pending'};
//    the recipient flips it to 'accepted'; decline / cancel / remove delete the row(s); 'blocked' rows are respected.
//  - public.users_public: other players' usernames for search (no emails; other games' pictures are not used here)
//  - public.gm_app_profiles, app 'foodfight': this game's own picture (your fighter), name and stats, so a picture never carries over between games
//  - public.user_statuses: BoomTown's "online" heartbeat (read only here, so BoomTown activity shows too)
//  - Realtime channel 'gm:social' (shared by the Grudge Match games): presence {uid, game, name, st, mode} +
//    invite / room-code messages; Food Fight acts only on messages for game 'foodfight' from accepted friends
window.FFSocial=(function(){
  const NET=window.FFNet;
  if(!NET||!NET.enabled)return {enabled:false,init(){},open(){}};
  const $=s=>document.querySelector(s);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ONLINE_MS=3*60*1000;   // BoomTown counts a heartbeat this fresh as online
  const APP='foodfight',GAMES={foodfight:'Food Fight',broadside:'Broadside',onbelay:'On Belay',riotrace:'Riot Race',lostempires:'Lost Empires',boomtown:'BoomTown',fliptide:'Fliptide'},
    gameName=g=>GAMES[g]||String(g||'').replace(/^./,c=>c.toUpperCase()),PIC_RE=/^https:\/\/zhfkcjzajazsrpqeyaea\.supabase\.co\/storage\/v1\/object\/public\/uploads\/[0-9a-f-]{36}\/[A-Za-z0-9_./-]{1,120}$/;
  let sb=null,bridge=null,user=null,me=null,prof=null,fprofs=new Map(),rows=[],people=new Map(),bt=new Map(),pres=new Map(),ch=null,fch=null,lastTrack='',
    searchRes=null,searchQ='',busy=false,msg='',view='list',pendingInvite=null,toastT=null,authMode='in',ready=false,tick=null;
  const nameOf=p=>{if(!p)return'Player';const f=p.id&&(user&&p.id===user.id?prof:fprofs.get(p.id));return(f&&f.display_name)||p.display_name||p.username||'Player'};
  // each player's Food Fight picture: the fighter on their Food Fight profile (never their BoomTown or other games' picture)
  const picOf=p=>{if(!p||!p.id)return'';const f=user&&p.id===user.id?prof:fprofs.get(p.id),a=f&&f.avatar||'';
    if(a.startsWith('av:'))return bridge&&bridge.face?bridge.face(a.slice(3)):'';return PIC_RE.test(a)?a:''};
  async function loadProfs(ids){ids=ids.filter(id=>id&&!fprofs.has(id));if(!ids.length)return;
    try{const {data}=await sb.from('gm_app_profiles').select('user_id,display_name,avatar').eq('app',APP).in('user_id',ids);(data||[]).forEach(p=>fprofs.set(p.user_id,p))}catch(e){}}
  async function saveProfile(patch){
    if(!user)return;prof=Object.assign(prof||{user_id:user.id,stats:{}},patch);
    try{const {error}=await sb.from('gm_app_profiles').upsert({user_id:user.id,app:APP,display_name:prof.display_name||null,avatar:prof.avatar||null,stats:prof.stats||{}},{onConflict:'user_id,app'});if(error)throw error}catch(e){console.warn('profile save',e)}
    render();
  }
  // the fighter you pick is your Food Fight picture
  function fighterChanged(av){if(user&&prof&&(bridge.fighters||[]).includes(av)&&prof.avatar!=='av:'+av)saveProfile({avatar:'av:'+av})}
  const other=r=>r.user_id===user.id?r.friend_user_id:r.user_id;

  // ---------- sign-in ----------
  async function init(br){
    bridge=br;sb=NET.client();
    try{const {data}=await sb.auth.getSession();await setUser(data&&data.session&&data.session.user)}catch(e){}
    sb.auth.onAuthStateChange((ev,s)=>{setUser(s&&s.user)});
    ready=true;render();
    clearInterval(tick);tick=setInterval(()=>{if(user){track();badge();stateChanged()}},2000);
  }
  async function setUser(u){
    if((u&&u.id)===(user&&user.id))return;
    user=u||null;me=null;prof=null;fprofs.clear();rows=[];people.clear();bt.clear();pres.clear();searchRes=null;
    if(ch){try{await sb.removeChannel(ch)}catch(e){}ch=null}
    if(fch){try{await sb.removeChannel(fch)}catch(e){}fch=null}
    if(user){
      try{const {data}=await sb.from('users_public').select('id,username,display_name').eq('id',user.id).maybeSingle();me=data||{id:user.id,username:(user.email||'').split('@')[0]}}catch(e){me={id:user.id}}
      // your Food Fight profile: its fighter follows you to every device; the first time, it starts from the fighter picked here
      try{const {data}=await sb.from('gm_app_profiles').select('user_id,display_name,avatar,stats').eq('user_id',user.id).eq('app',APP).maybeSingle();prof=data||null}catch(e){}
      const st=bridge&&bridge.state?bridge.state():{};
      if(prof&&prof.avatar&&prof.avatar.startsWith('av:')&&bridge&&bridge.setFighter)bridge.setFighter(prof.avatar.slice(3));
      else if(!prof||!prof.avatar)await saveProfile({display_name:(prof&&prof.display_name)||((bridge&&bridge.myName&&bridge.myName())||me.display_name||me.username||'').slice(0,14)||null,avatar:(bridge.fighters||[]).includes(st.av)?'av:'+st.av:null});
      await loadFriends();joinSocial();
      // friend requests and accepts show up straight away
      try{fch=sb.channel('ff-friends-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'friends'},()=>loadFriends()).subscribe()}catch(e){}
      if(bridge&&bridge.signedIn)bridge.signedIn(nameOf(me));
    }
    render();badge();
  }
  async function signIn(email,pw){return guard(async()=>{const {error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error;msg=''})}
  async function signUp(email,pw,name){return guard(async()=>{
    const {data,error}=await sb.auth.signUp({email,password:pw,options:{data:{full_name:name||undefined},emailRedirectTo:location.origin+location.pathname}});
    if(error)throw error;
    // a new account picks up the name you play under (it's your Grudge Match name in BoomTown too)
    if(data&&data.user&&data.session&&name){try{await sb.from('users').update({display_name:name}).eq('id',data.user.id)}catch(e){}}
    msg=data&&data.session?'':'Check your email to confirm your account, then sign in here.';
  })}
  async function oauth(provider){return guard(async()=>{const {error}=await sb.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+location.pathname}});if(error)throw error})}
  async function signOut(){return guard(async()=>{await sb.auth.signOut();await setUser(null)})}
  async function guard(fn){if(busy)return;busy=true;msg='';render();try{await fn()}catch(e){msg=friendlyError(e)}busy=false;render()}
  function friendlyError(e){const m=String(e&&e.message||e||'');
    if(/invalid login/i.test(m))return'That email and password don’t match an account.';
    if(/already registered|already exists/i.test(m))return'That email already has an account. Sign in instead.';
    if(/password/i.test(m)&&/6|characters|short/i.test(m))return'Passwords need at least 6 characters.';
    if(/not confirmed/i.test(m))return'Confirm your email first (check your inbox), then sign in.';
    if(/rate|too many/i.test(m))return'Too many tries. Wait a minute and try again.';
    if(/fetch|network/i.test(m))return'Can’t reach the server. Check your connection.';
    return m||'Something went wrong. Try again.'}

  // ---------- friends ----------
  async function loadFriends(){
    if(!user)return;
    try{
      const {data,error}=await sb.from('friends').select('id,user_id,friend_user_id,status,friend_name,created_at').or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);
      if(error)throw error;
      const seen=new Set();rows=(data||[]).filter(r=>r&&!seen.has(r.id)&&seen.add(r.id));
      const ids=[...new Set(rows.map(other))].filter(id=>!people.has(id));
      if(ids.length){const {data:ps}=await sb.from('users_public').select('id,username,display_name').in('id',ids);(ps||[]).forEach(p=>people.set(p.id,p))}
      await loadProfs([...new Set(rows.map(other))]);
      const acc=rows.filter(r=>r.status==='accepted').map(other);
      if(acc.length){const {data:st}=await sb.from('user_statuses').select('user_id,status,last_activity_at').in('user_id',acc);bt.clear();(st||[]).forEach(s=>bt.set(s.user_id,s))}
    }catch(e){}
    render();badge();
  }
  // sorted lists, each person once
  function lists(){
    const by=f=>{const m=new Map();rows.filter(f).forEach(r=>{const id=other(r);if(!m.has(id))m.set(id,r)});return [...m.entries()].map(([id,r])=>({id,r,p:people.get(id)||{id,display_name:r.user_id===user.id?r.friend_name:''}}))};
    const blockedIds=new Set(rows.filter(r=>r.status==='blocked').map(other));
    const friends=by(r=>r.status==='accepted').filter(x=>!blockedIds.has(x.id));
    friends.forEach(x=>x.s=statusOf(x.id));
    friends.sort((a,b)=>b.s.rank-a.s.rank||nameOf(a.p).localeCompare(nameOf(b.p)));
    return {friends,incoming:by(r=>r.status==='pending'&&r.friend_user_id===user.id).filter(x=>!blockedIds.has(x.id)),
      outgoing:by(r=>r.status==='pending'&&r.user_id===user.id),blockedIds};
  }
  const relation=id=>{const rs=rows.filter(r=>other(r)===id);if(rs.some(r=>r.status==='blocked'))return'blocked';if(rs.some(r=>r.status==='accepted'))return'friend';
    if(rs.some(r=>r.status==='pending'&&r.friend_user_id===user.id))return'incoming';if(rs.some(r=>r.status==='pending'))return'outgoing';return''};
  async function request(id){return guard(async()=>{
    const rel=relation(id);if(rel==='friend'||rel==='outgoing'||rel==='blocked')return;
    if(rel==='incoming'){const r=rows.find(x=>x.user_id===id&&x.friend_user_id===user.id&&x.status==='pending');if(r){await accept(r.id,true);return}}
    const p=people.get(id)||(searchRes||[]).find(x=>x.id===id);if(p)people.set(id,p);
    const {error}=await sb.from('friends').insert({user_id:user.id,friend_user_id:id,status:'pending',friend_name:nameOf(p),friend_email:''});
    if(error&&!/duplicate|unique/i.test(error.message||''))throw error;
    msg=`Friend request sent to ${nameOf(p)}.`;await loadFriends();
  })}
  async function accept(rowId,inner){const run=async()=>{const {error}=await sb.from('friends').update({status:'accepted'}).eq('id',rowId);if(error)throw error;await loadFriends()};return inner?run():guard(run)}
  // decline, cancel and unfriend all remove every row between the two of you (same as BoomTown)
  async function drop(id){return guard(async()=>{
    const {error}=await sb.from('friends').delete().or(`and(user_id.eq.${user.id},friend_user_id.eq.${id}),and(user_id.eq.${id},friend_user_id.eq.${user.id})`);
    if(error)throw error;await loadFriends();
  })}
  async function search(q){
    searchQ=q;q=String(q||'').replace(/[^\p{L}\p{N} _.\-]/gu,'').trim().slice(0,24);
    if(q.length<2){searchRes=null;render();return}
    try{
      const {data}=await sb.from('users_public').select('id,username,display_name').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(12);
      if(searchQ.replace(/[^\p{L}\p{N} _.\-]/gu,'').trim().slice(0,24)!==q)return;   // a newer search is on its way
      searchRes=(data||[]).filter(p=>p.id!==user.id);await loadProfs(searchRes.map(p=>p.id));
    }catch(e){searchRes=[]}
    render();
  }

  // ---------- who's online (Realtime presence) ----------
  function joinSocial(){
    if(!user||ch)return;
    ch=sb.channel('gm:social',{config:{broadcast:{self:false,ack:false},presence:{key:user.id}}});
    ch.on('presence',{event:'sync'},()=>{readPres();render();badge()});
    ch.on('broadcast',{event:'m'},({payload})=>onMsg(payload||{}));
    ch.subscribe(st=>{if(st==='SUBSCRIBED'){lastTrack='';track()}});
  }
  function readPres(){pres.clear();if(!ch)return;const st=ch.presenceState();for(const k in st){const p=st[k]&&st[k][0];if(p&&p.uid)pres.set(p.uid,p)}}
  function track(){
    if(!ch||!user||!bridge)return;
    const s=bridge.state()||{},info={uid:user.id,game:APP,name:nameOf(me),av:s.av||'',st:s.st||'menu',mode:s.mode||''};
    const k=JSON.stringify(info);if(k===lastTrack)return;lastTrack=k;
    ch.track(info).catch(()=>{});
  }
  function statusOf(id){
    const p=pres.get(id);
    // online in another Grudge Match game: status only (no Join / Invite across games)
    if(p&&p.game&&p.game!==APP){const g=gameName(p.game);
      return p.st==='playing'?{rank:2.6,dot:'play',text:`Playing ${g}`}:p.st==='room'?{rank:2.7,dot:'on',text:`In a ${g} lobby`}:{rank:2.5,dot:'on',text:`Online in ${g}`}}
    if(p){const mode=bridge&&bridge.modeName?bridge.modeName(p.mode):p.mode;
      if(p.st==='playing')return{rank:4,dot:'play',text:`Playing ${mode||'Food Fight'}`,join:true,ff:true};
      if(p.st==='room')return{rank:5,dot:'on',text:`In a Food Fight room${mode?' · '+mode:''}`,join:true,ff:true};
      return{rank:3,dot:'on',text:'Online in Food Fight',ff:true}}
    const s=bt.get(id),age=s&&s.last_activity_at?Date.now()-new Date(s.last_activity_at).getTime():Infinity;
    if(age<ONLINE_MS&&s.status!=='Offline')return{rank:2,dot:'bt',text:s.status==='In Game'?'Playing BoomTown':'Online in BoomTown'};
    return{rank:0,dot:'off',text:age<Infinity?`Last seen ${ago(age)}`:'Offline'};
  }
  const ago=ms=>{const m=Math.round(ms/60000);if(m<60)return`${Math.max(1,m)}m ago`;const h=Math.round(m/60);if(h<48)return`${h}h ago`;return`${Math.round(h/24)}d ago`};
  const isFriend=id=>rows.some(r=>r.status==='accepted'&&other(r)===id)&&!rows.some(r=>r.status==='blocked'&&other(r)===id);
  function send(m){if(ch)ch.send({type:'broadcast',event:'m',payload:Object.assign({from:user.id,name:nameOf(me),game:APP},m)}).catch(()=>{})}
  function onMsg(m){
    if(!user||m.to!==user.id||!isFriend(m.from))return;   // only friends can reach you
    if((m.game||APP)!==APP)return;                        // another game's invite isn't for this page
    if(m.t==='invite'&&/^\d{3,5}$/.test(String(m.code||'')))showInvite(m);
    else if(m.t==='ask'){const s=bridge.state();if(s.code)send({t:'code',to:m.from,code:s.code})}
    else if(m.t==='code'&&/^\d{3,5}$/.test(String(m.code||''))&&wantCode===m.from){wantCode=null;clearTimeout(askT);bridge.join(String(m.code))}
  }
  let wantCode=null,askT=null;
  function joinFriend(id){
    const s=bridge.state();if(s.st==='playing'){msg='Finish your match first.';render();return}
    wantCode=id;send({t:'ask',to:id});msg='Asking for their room…';render();
    clearTimeout(askT);askT=setTimeout(()=>{if(wantCode===id){wantCode=null;msg='They didn’t answer. They may have just left their room.';render()}},5000);
  }
  function invite(id){const s=bridge.state();if(!s.code)return;send({t:'invite',to:id,code:s.code,mode:s.mode});sent.add(id);msg=`Invite sent to ${nameOf(people.get(id))}.`;render()}
  const sent=new Set();

  // ---------- invite pop-up ----------
  function showInvite(m){
    const s=bridge.state();
    if(s.code===String(m.code))return;                         // already in that room
    pendingInvite=m;if(s.st==='playing')return;               // shown when your match ends
    const t=$('#inviteToast');if(!t)return;
    const mode=bridge.modeName?bridge.modeName(m.mode):'';
    t.querySelector('p').innerHTML=`<b>${esc(m.name)}</b> invited you to their room${mode?` <small>${esc(mode)}</small>`:''}`;
    t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},25000);
    if(bridge.sfx)bridge.sfx('earn');
  }
  function stateChanged(){const s=bridge&&bridge.state();if(pendingInvite&&s&&s.st!=='playing'){const m=pendingInvite;pendingInvite=null;showInvite(m)}}

  // ---------- the Friends sheet ----------
  const avatar=(p,s)=>{const u=picOf(p),n=nameOf(p);return u?`<img class="fav" src="${esc(u)}" alt="" loading="lazy">`:`<span class="fav">${esc(n.slice(0,1).toUpperCase())}</span>`};
  function render(){
    const box=$('#friendsBody');if(!box)return;
    if(!ready){box.innerHTML='<p class="fmsg">Loading…</p>';return}
    const s=bridge?bridge.state():{};
    if(!user){
      box.innerHTML=`
        <p class="fsub">Sign in with your <b>Grudge Match Games</b> account to add friends, see who's online and invite them to your room.</p>
        <button class="btn oauth" data-oauth="google" type="button"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z"/><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 23.5z"/><path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4z"/><path fill="#EA4335" d="M12 5.1c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3C6.5 7.1 9 5.1 12 5.1z"/></svg>Continue with Google</button>
        <button class="btn oauth" data-oauth="facebook" type="button"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>Continue with Facebook</button>
        <div class="for"><span>or with email</span></div>
        <form class="fform" id="fAuth" autocomplete="on">
          ${authMode==='up'?'<input id="fName" maxlength="14" placeholder="Name players see" autocomplete="nickname">':''}
          <input id="fEmail" type="email" placeholder="Email" autocomplete="email" required>
          <input id="fPw" type="password" placeholder="Password" autocomplete="${authMode==='up'?'new-password':'current-password'}" minlength="6" required>
          <button class="btn primary" type="submit"${busy?' disabled':''}>${authMode==='up'?'Create account':'Sign in'}</button>
        </form>
        <button class="linkbtn" id="fMode" type="button">${authMode==='up'?'Already have an account? Sign in':'New here? Create an account'}</button>
        ${msg?`<p class="fmsg">${esc(msg)}</p>`:''}`;
      box.querySelectorAll('[data-oauth]').forEach(b=>b.addEventListener('click',()=>oauth(b.dataset.oauth)));
      $('#fMode').addEventListener('click',()=>{authMode=authMode==='up'?'in':'up';msg='';render()});
      $('#fAuth').addEventListener('submit',e=>{e.preventDefault();const em=$('#fEmail').value.trim(),pw=$('#fPw').value;if(authMode==='up')signUp(em,pw,($('#fName')&&$('#fName').value.trim())||(bridge.myName&&bridge.myName()));else signIn(em,pw)});
      return;
    }
    const L=lists(),inRoom=!!s.code;
    const row=(x,actions,line)=>`<li class="frow">${avatar(x.p)}<span class="fwho"><b>${esc(nameOf(x.p))}</b>${line||''}</span><span class="fact">${actions}</span></li>`;
    const stLine=st=>`<small><i class="fdot ${st.dot}"></i>${esc(st.text)}</small>`;
    const keep=document.activeElement&&document.activeElement.id==='fSearch',caret=keep?document.activeElement.selectionStart:0;
    box.innerHTML=`
      <div class="fme">${avatar(me)}<span class="fwho"><b>${esc(nameOf(me))}</b><small>Signed in · Grudge Match Games account</small></span><button class="btn small" id="fOut" type="button">Sign out</button></div>
      <input id="fSearch" class="fsearch" placeholder="Add a friend by username" value="${esc(searchQ)}" autocomplete="off" spellcheck="false" enterkeyhint="search">
      ${searchRes?`<ul class="flist">${searchRes.length?searchRes.map(p=>{const rel=relation(p.id),x={id:p.id,p};
        const a=rel==='friend'?'<span class="ftag">Friends</span>':rel==='outgoing'?'<span class="ftag">Sent</span>':rel==='incoming'?`<button class="btn small go" data-acc="${esc(p.id)}">Accept</button>`:rel==='blocked'?'':`<button class="btn small go" data-add="${esc(p.id)}">Add</button>`;
        return row(x,a,p.username&&p.display_name&&p.display_name!==p.username?`<small>@${esc(p.username)}</small>`:'')}).join(''):'<li class="fnone">Nobody by that name yet.</li>'}</ul>`:''}
      ${msg?`<p class="fmsg">${esc(msg)}</p>`:''}
      ${L.incoming.length?`<div class="lab">Friend requests</div><ul class="flist">${L.incoming.map(x=>row(x,`<button class="btn small go" data-accrow="${esc(x.r.id)}">Accept</button><button class="btn small" data-drop="${esc(x.id)}">Decline</button>`,'<small>wants to be friends</small>')).join('')}</ul>`:''}
      <div class="lab">Friends${L.friends.length?` · ${L.friends.filter(x=>x.s.rank>=2).length} online`:''}</div>
      <ul class="flist">${L.friends.length?L.friends.map(x=>{
        const st=x.s;let a='';
        if(inRoom&&st.ff)a=sent.has(x.id)?'<span class="ftag">Invited</span>':`<button class="btn small go" data-inv="${esc(x.id)}">Invite</button>`;
        else if(st.join)a=`<button class="btn small go" data-join="${esc(x.id)}">Join</button>`;
        a+=`<button class="btn small ghost" data-unf="${esc(x.id)}" aria-label="Remove ${esc(nameOf(x.p))}">✕</button>`;
        return row(x,a,stLine(st))}).join(''):'<li class="fnone">No friends yet. Search for someone above, or share your username: <b>'+esc((me&&me.username)||'')+'</b></li>'}</ul>
      ${L.outgoing.length?`<div class="lab">Sent requests</div><ul class="flist">${L.outgoing.map(x=>row(x,`<button class="btn small" data-drop="${esc(x.id)}">Cancel</button>`,'<small>waiting for them</small>')).join('')}</ul>`:''}`;
    const fs=$('#fSearch');let st=null;
    fs.addEventListener('input',()=>{clearTimeout(st);st=setTimeout(()=>search(fs.value),250)});
    if(keep){fs.focus();try{fs.setSelectionRange(caret,caret)}catch(e){}}
    $('#fOut').addEventListener('click',signOut);
    const on=(attr,fn)=>box.querySelectorAll(`[${attr}]`).forEach(b=>b.addEventListener('click',()=>fn(b.getAttribute(attr))));
    on('data-add',request);on('data-acc',request);on('data-accrow',id=>accept(id));on('data-drop',drop);on('data-inv',invite);on('data-join',joinFriend);
    on('data-unf',id=>{const p=people.get(id);if(confirm(`Remove ${nameOf(p)} from your friends?`))drop(id)});
  }
  // the little "2 online" on the Friends buttons
  function badge(){
    const n=user?lists().friends.filter(x=>x.s.rank>=2).length:0,inc=user?lists().incoming.length:0;
    document.querySelectorAll('.fbadge').forEach(el=>{el.hidden=!n&&!inc;el.textContent=inc?`${inc} request${inc>1?'s':''}`:`${n} online`;el.classList.toggle('req',!!inc)});
  }
  function open(){msg='';searchRes=null;searchQ='';loadFriends();render()}
  // the invite pop-up's buttons
  document.addEventListener('click',e=>{
    if(e.target.closest('#inviteJoin')){const m=pendingInvite;$('#inviteToast').hidden=true;pendingInvite=null;if(m)bridge.join(String(m.code))}
    else if(e.target.closest('#inviteNo')){$('#inviteToast').hidden=true;pendingInvite=null}
  });
  return {enabled:true,init,open,render,stateChanged,fighterChanged,get user(){return user},get me(){return me},_lists:lists,_pres:pres};
})();
