// End-to-end smoke test: two players in two headless pages, joined through a fake Supabase Realtime bus.
// Usage: NODE_PATH=<dir with jsdom> node test/dom-smoke.js
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
// every script the page loads, in page order (config.js is swapped for the fake backend)
const scripts=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="(js\/[^"]+)"/g)].map(m=>m[1]).filter(f=>f!=='js/config.js').map(f=>fs.readFileSync(path.join(root,f),'utf8'));

// ---- fake Supabase Realtime: one shared bus per channel name ----
const buses={},rpcLog=[],crossLog=[],sendLog=[],markLog=[],rpcRows=[{mode:'brawl',diff:1,name:'Top Chef',score:99999,device:'d-other-device'}];
// ---- fake Supabase auth + tables (the shared Grudge Match account, friends, statuses), with the real RLS rules ----
const DB={users_public:[],friends:[],user_statuses:[],users:[],gm_invites:[]},AUTH=[],pgSubs=new Set(),pgInv=new Set();let fid=1;
// realtime for gm_invites: deliver to subscribers whose filter matches and who can see the row (RLS: either party)
function invChange(type,row){pgInv.forEach(s=>{if(s.event!==type&&s.event!=='*')return;const [c,v]=s.filter.split('=eq.');if(String(row[c])!==v)return;if(![row.from_user,row.to_user].includes(s.uid()))return;const copy=Object.assign({},row);setTimeout(()=>s.cb({eventType:type,new:copy}),3)})}
function splitTop(str){const out=[];let d=0,cur='';for(const ch of str){if(ch==='('){d++}else if(ch===')'){d--}if(ch===','&&d===0){out.push(cur);cur=''}else cur+=ch}if(cur)out.push(cur);return out}
function termMatch(row,t){
  if(t.startsWith('and(')){return splitTop(t.slice(4,-1)).every(x=>termMatch(row,x))}
  const i=t.indexOf('.'),j=t.indexOf('.',i+1),col=t.slice(0,i),op=t.slice(i+1,j),val=t.slice(j+1);
  if(op==='eq')return String(row[col])===val;
  if(op==='ilike'){const re=new RegExp('^'+val.split('%').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i');return re.test(String(row[col]||''))}
  return false;
}
function fakeQuery(table,uidOf){
  const q={filters:[],op:'select',payload:null,single:false,lim:0};
  const api={select(){return api},gt(c,v){q.filters.push(r=>String(r[c])>String(v));return api},order(){return api},single(){q.single=true;return api},eq(c,v){q.filters.push(r=>String(r[c])===String(v));return api},in(c,arr){q.filters.push(r=>arr.map(String).includes(String(r[c])));return api},
    or(str){const terms=splitTop(str);q.filters.push(r=>terms.some(t=>termMatch(r,t)));return api},limit(n){q.lim=n;return api},maybeSingle(){q.single=true;return api},
    insert(o){q.op='insert';q.payload=o;return api},update(o){q.op='update';q.payload=o;return api},delete(){q.op='delete';return api},upsert(o){q.op='upsert';q.payload=o;return api},
    then(res,rej){return Promise.resolve().then(()=>run()).then(res,rej)}};
  const changed=()=>{if(table==='friends')pgSubs.forEach(cb=>setTimeout(cb,2))};
  function run(){
    const uid=uidOf(),T=DB[table]||(DB[table]=[]);
    let rows=T.filter(r=>q.filters.every(f=>f(r)));
    if(table==='friends')rows=rows.filter(r=>uid&&(r.user_id===uid||r.friend_user_id===uid));   // RLS: either party
    if(table==='gm_invites')rows=rows.filter(r=>uid&&(r.from_user===uid||r.to_user===uid));
    if(table==='gm_cross_invites'){rows=rows.filter(r=>uid&&(r.from_user===uid||r.to_user===uid));if(q.op!=='select')return {data:null,error:{message:'permission denied for table gm_cross_invites'}}}   // read only; changes go through the functions
    if(q.op==='select'){if(q.lim)rows=rows.slice(0,q.lim);rows=rows.map(r=>Object.assign({},r));return {data:q.single?(rows[0]||null):rows,error:null}}
    if(q.op==='insert'){const o=Object.assign({},q.payload);
      if(table==='friends'){if(!uid||o.user_id!==uid||!['pending','blocked'].includes(o.status))return {data:null,error:{message:'new row violates row-level security policy'}};
        if(T.some(r=>r.user_id===o.user_id&&r.friend_user_id===o.friend_user_id))return {data:null,error:{message:'duplicate key value violates unique constraint "friends_unique_pair"'}};
        o.id=String(fid++);o.created_at=new Date().toISOString()}
      if(table==='gm_invites'){
        const fr=DB.friends.some(f=>f.status==='accepted'&&((f.user_id===o.from_user&&f.friend_user_id===o.to_user)||(f.user_id===o.to_user&&f.friend_user_id===o.from_user)));
        if(!uid||o.from_user!==uid||!fr||!/^https:\/\/([a-z0-9-]+\.)*(grudgematchgames\.com|boomtowngame\.com)(\/[A-Za-z0-9\/?=&#._~%-]*)?$/.test(o.url||''))return {data:null,error:{message:'new row violates row-level security policy for table "gm_invites"'}};
        o.id='inv-'+(fid++);o.status='pending';o.created_at=new Date().toISOString();o.expires_at=new Date(Date.now()+20*60000).toISOString();
        T.push(o);invChange('INSERT',o);return {data:q.single?Object.assign({},o):[Object.assign({},o)],error:null}}
      T.push(o);changed();return {data:[o],error:null}}
    if(q.op==='update'){for(const r of rows){const n=Object.assign({},r,q.payload);
        if(table==='friends'&&!((n.status==='accepted'&&uid===n.friend_user_id)||(['pending','blocked'].includes(n.status)&&uid===n.user_id)))return {data:null,error:{message:'new row violates row-level security policy'}};
        if(table==='gm_invites'){const ok=(uid===r.to_user&&['now','later','declined','joined'].includes(n.status))||(uid===r.from_user&&n.status==='cancelled');
          if(!ok||Object.keys(q.payload).some(k=>k!=='status'))return {data:null,error:{message:'bad status'}};Object.assign(r,q.payload);invChange('UPDATE',r);continue}
        if(table==='users'&&r.id!==uid)continue;Object.assign(r,q.payload);
        if(table==='users'){const up=DB.users_public.find(x=>x.id===r.id);if(up&&q.payload.display_name)up.display_name=q.payload.display_name}}
      changed();return {data:rows,error:null}}
    if(q.op==='delete'){DB[table]=T.filter(r=>!rows.includes(r));changed();return {data:rows,error:null}}
    if(q.op==='upsert'){const o=Object.assign({},q.payload);if(table==='gm_app_profiles'&&o.user_id!==uid)return {data:null,error:{message:'new row violates row-level security policy'}};
      const i=T.findIndex(r=>r.user_id===o.user_id&&r.app===o.app);if(i>=0)T[i]=o;else T.push(o);return {data:[o],error:null}}
    return {data:null,error:null};
  }
  return api;
}
function fakeAuth(){
  let session=null;const cbs=[];const emit=ev=>cbs.forEach(cb=>setTimeout(()=>cb(ev,session),1));
  const signIn=u=>{session={user:{id:u.id,email:u.email},access_token:'t-'+u.id};emit('SIGNED_IN');return {data:{session,user:session.user},error:null}};
  return {uid:()=>session&&session.user.id,auth:{
    async getSession(){return {data:{session},error:null}},
    onAuthStateChange(cb){cbs.push(cb);return {data:{subscription:{unsubscribe(){}}}}},
    async signInWithPassword({email,password}){const u=AUTH.find(x=>x.email===email&&x.pw===password);if(!u)return {data:{},error:{message:'Invalid login credentials'}};return signIn(u)},
    async signUp({email,password,options}){if(AUTH.some(x=>x.email===email))return {data:{},error:{message:'User already registered'}};
      const u={id:'uid-'+Math.random().toString(36).slice(2,10),email,pw:password};AUTH.push(u);
      // what BoomTown's handle_new_user trigger does: a users row, username = email prefix
      DB.users.push({id:u.id,email,username:email.split('@')[0],full_name:(options&&options.data&&options.data.full_name)||email.split('@')[0]});
      DB.users_public.push({id:u.id,username:email.split('@')[0],display_name:null,profile_picture_url:null,avatar:null});
      return signIn(u)},
    async signInWithOAuth(){return {data:{},error:null}},
    async signOut(){session=null;emit('SIGNED_OUT');return {error:null}}}};
}
function fakeSupabase(){
  return {createClient(){const A=fakeAuth();return {auth:A.auth,from:t=>fakeQuery(t,A.uid),
    channel(name,opts){
      const bus=buses[name]||(buses[name]={members:new Map(),chans:new Set()});
      const key=opts&&opts.config&&opts.config.presence?opts.config.presence.key:'k'+Math.random().toString(36).slice(2),h={broadcast:[],sync:[],leave:[]};
      const ch={
        on(type,f,cb){if(type==='broadcast')h.broadcast.push(cb);else if(type==='postgres_changes'){if(f.table==='gm_invites'){const s={event:f.event,filter:f.filter,cb,uid:A.uid};pgInv.add(s);(ch._inv||(ch._inv=[])).push(s)}else pgSubs.add(cb)}else h[f.event].push(cb);return ch},
        subscribe(cb){bus.chans.add(ch);setTimeout(()=>cb&&cb('SUBSCRIBED'),5);return ch},
        // like real Supabase: updating your presence (e.g. lobby -> playing) also emits a 'leave' for your old state
        async track(p){const old=bus.members.get(key);bus.members.set(key,p);if(old)bus.chans.forEach(c=>{if(c!==ch)c._leave(old)});bus.chans.forEach(c=>c._sync())},
        async untrack(){const p=bus.members.get(key);bus.members.delete(key);bus.chans.forEach(c=>{if(c!==ch)c._leave(p);c._sync()})},
        presenceState(){const o={};bus.members.forEach((p,k)=>o[k]=[p]);return o},
        send({payload}){const copy=JSON.parse(JSON.stringify(payload));bus.chans.forEach(c=>{if(c!==ch)setTimeout(()=>c._msg(copy),3)});return Promise.resolve('ok')},
        _sync(){setTimeout(()=>h.sync.forEach(cb=>cb()),1)},
        _leave(p){setTimeout(()=>h.leave.forEach(cb=>cb({leftPresences:[p]})),1)},
        _msg(p){h.broadcast.forEach(cb=>cb({payload:p}))},
        _close(){bus.chans.delete(ch);(ch._inv||[]).forEach(s=>pgInv.delete(s))}
      };
      return ch;
    },
    async removeChannel(ch){ch._close()},
    async rpc(fn,a){
      if(fn==='ff_submit_score'){rpcLog.push(a);const better=rpcRows.filter(r=>r.mode===a.p_mode&&r.score>a.p_score).length;rpcRows.push({mode:a.p_mode,diff:a.p_difficulty,name:a.p_name,score:a.p_score,device:a.p_device_id});return{data:{ok:true,rank_day:better+1,rank_all:better+1,personal_best:true},error:null}}
      if(fn==='ff_leaderboard'){const rows=rpcRows.filter(r=>r.mode===a.p_mode).sort((x,y)=>y.score-x.score).map((r,i)=>({rank:i+1,name:r.name,score:r.score,max_chain:2,won:true,created_at:new Date().toISOString(),mine:r.device===a.p_device_id}));return{data:rows,error:null}}
      // the studio's shared cross-game invites (gm_cross_invites), as the live functions behave
      if(fn==='gm_my_invites'){const uid=A.uid(),T=DB.gm_cross_invites||[];return{data:T.filter(r=>uid&&r.to_user===uid&&['pending','later'].includes(r.status)&&new Date(r.expires_at)>new Date()).map(r=>Object.assign({},r)),error:null}}
      if(fn==='gm_respond_invite'){const uid=A.uid(),r=(DB.gm_cross_invites||[]).find(x=>x.id===a.p_invite&&x.to_user===uid),st={now:'accepted',later:'later',decline:'declined'}[a.p_choice];
        if(!r||!st)return{data:null,error:{message:'invite not found'}};crossLog.push(a);r.status=st;return{data:r.join_url,error:null}}
      if(fn==='gm_send_invite'){const uid=A.uid(),T=DB.gm_cross_invites||(DB.gm_cross_invites=[]);sendLog.push(Object.assign({uid},a));
        const fr=DB.friends.some(f=>f.status==='accepted'&&((f.user_id===uid&&f.friend_user_id===a.p_to)||(f.user_id===a.p_to&&f.friend_user_id===uid)));
        if(!uid||!fr)return{data:null,error:{message:'You can only invite friends.'}};
        if(T.filter(r=>r.from_user===uid&&Date.now()-new Date(r.created_at)<600000).length>=30)return{data:null,error:{message:'Too many invites; try again later.'}};
        const r={id:'cx-'+(fid++),app:a.p_app,app_name:'Food Fight',game_ref:String(a.p_code),join_url:'https://foodfight.grudgematchgames.com/?room='+encodeURIComponent(a.p_code),from_user:uid,from_name:a.p_from_name,to_user:a.p_to,status:'pending',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+20*60000).toISOString()};
        T.push(r);return{data:r.id,error:null}}
      if(fn==='gm_mark_joined'){const uid=A.uid();markLog.push(Object.assign({uid},a));(DB.gm_cross_invites||[]).forEach(r=>{if(r.to_user===uid&&r.app===a.p_app&&r.game_ref===a.p_game_ref&&['pending','accepted','later'].includes(r.status))r.status='joined'});return{data:null,error:null}}
      return{data:null,error:{message:'unknown'}};
    }
  }}};
}
const ctxProxy=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):(typeof k==='string'?(t[k]!==undefined?t[k]:()=>{}):undefined),set:(t,k,v)=>{t[k]=v;return true}});
function page(url,opt){
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,errors=[];
  w.addEventListener('error',e=>errors.push(e.message));
  w.HTMLCanvasElement.prototype.getContext=()=>ctxProxy;
  w.HTMLCanvasElement.prototype.toDataURL=()=>'data:,';
  w.ResizeObserver=class{observe(){}};
  w.matchMedia=()=>({matches:!!(opt&&opt.desk),addEventListener(){}});
  w.AudioContext=undefined;
  w.supabase=fakeSupabase();
  w.FF_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k'};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{}}});
  w.crypto.randomUUID=()=>'id-'+Math.random().toString(36).slice(2,9);
  if(!w.crypto.subtle)Object.defineProperty(w.crypto,'subtle',{value:require('crypto').webcrypto.subtle});
  if(!w.TextEncoder)w.TextEncoder=TextEncoder;
  w.Element.prototype.getBoundingClientRect=function(){return{left:0,top:0,right:300,bottom:600,width:300,height:600}};
  // browsers share one global scope across classic <script> tags; one eval reproduces that
  try{w.eval(scripts.join('\n;\n'))}catch(e){errors.push(String(e.stack||e))}
  return {w,$:s=>w.document.querySelector(s),errors};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vis=(p,id)=>!p.$(id).hidden;
const setBots=(pg,n)=>{for(let i=0;i<9;i++)pg.$('#botMinus').click();for(let i=0;i<n;i++)pg.$('#botPlus').click()};
const check=(cond,msg)=>{console.log((cond?'PASS ':'FAIL ')+msg);if(!cond)process.exitCode=1};

(async()=>{
  // practice smoke
  const solo=page('https://foodfight.grudgematchgames.com/');
  solo.errors.forEach(e=>console.log('ERR',e.slice(0,400)));
  check(vis(solo,'#ovLoad'),'loading screen shows first');
  await sleep(2400);
  check(vis(solo,'#ovStart'),'start screen shows after loading');
  check(solo.w.document.querySelectorAll('#picker .pick').length===8,'fighter picker offers 8 fighters');
  solo.$('#picker [data-av="crunch"]').click();
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).av==='crunch','picked fighter is saved');
  check(!solo.$('#bOnline').disabled&&/^Play/.test(solo.$('#bOnline').textContent.trim()),'main button just says Play');
  solo.$('#bOnline').click();
  check(vis(solo,'#ovOnline')&&!solo.$('#bCreate').disabled&&solo.w.document.querySelectorAll('#diff2 [data-d]').length===3,'Play screen offers rooms and Play vs AI');
  solo.$('#ovOnline [data-close]').click();
  solo.$('.pal[data-p="redgreen"]').click();
  check(solo.$('.pal[data-p="redgreen"]').getAttribute('aria-pressed')==='true','palette picker selects red-green');
  solo.$('#theme [data-t="day"]').click();
  check(solo.w.document.documentElement.getAttribute('data-ff-theme')==='day','day theme applied');
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).palette==='redgreen','prefs saved');
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).art===undefined||solo.$('#art [data-a="food"]').getAttribute('aria-pressed')==='true','food art is the default');
  check(solo.w.document.querySelectorAll('#cuisines .cz').length===7,'7 cuisines offered');
  solo.$('#cuisines [data-c="japanese"]').click();
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).cuisine==='japanese'&&solo.$('#cuisines [data-c="japanese"]').getAttribute('aria-pressed')==='true','picking a cuisine saves it');
  solo.$('#cuisines [data-c="market"]').click();
  solo.$('#art [data-a="shapes"]').click();
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).art==='shapes','tile art switches to shapes');
  solo.$('#mode [data-size="4"]').click();solo.$('.diff [data-d="1"]').click();
  await sleep(50);
  check(vis(solo,'#ovVs')&&solo.w.document.querySelectorAll('#vsStage .crowd .fighter').length===4,'brawl opens with a 4-cook line-up');
  check(solo.w.__ff.game.player.av==='crunch'&&!solo.w.__ff.game.boards.slice(1).some(b=>b.name==='Crunch'),'you play your fighter; bots use the others first');
  await sleep(1500);
  check(solo.w.document.querySelectorAll('.foe').length===3,'brawl shows 3 opponents');
  // finish a game -> score recorded locally and submitted, end screen shows ranks
  await sleep(2000); // match-up screen, then the game starts
  check(!vis(solo,'#ovVs')&&!solo.w.__ff.game.paused,'game starts after the match-up screen');
  {const SG=solo.w.__ff.game;SG.frame=60*40;SG.boards[3].lastAttacker=SG.player;SG.boards[3].die();await sleep(100);
   check(solo.$('#koBanner').hidden,'no KO banner covering the screen mid-game');
   SG.player.score=4321;SG.player.lastAttacker=SG.boards[2];SG.player.die();
   await sleep(300);
   check(!SG.over&&!solo.$('#outToast').hidden,'practice brawl keeps going after you are out');
   check(new RegExp(SG.boards[2].name+'</b> knocked you out').test(solo.$('#outText').innerHTML),'out bar names who knocked you out');
   check(solo.$('#bOutLeave').textContent==='Menu'&&!solo.$('#bFF').hidden,'offline: Menu and Fast forward offered');
   const cards=solo.w.document.querySelectorAll('#opps .foe');
   check(cards[0].classList.contains('watchable'),'opponent cards become tappable');
   cards[1].click();await sleep(100);
   check(solo.w.__ff.game&&!solo.$('#specBar').hidden&&solo.$('#specName').textContent==='Watching '+SG.boards[2].name&&cards[1].classList.contains('watching'),'tap a card to spectate that board full screen');
   solo.$('#bSpecOff').click();await sleep(50);
   check(solo.$('#specBar').hidden,'My board returns to your own board');
   cards[0].click();await sleep(50);
   // pause and come back: the out bar and Fast forward must come back too
   solo.$('#bPause').click();await sleep(50);solo.$('#bResume').click();await sleep(300);
   check(!solo.$('#outToast').hidden&&!solo.$('#bFF').hidden,'after a pause, the out bar and Fast forward come back');
   solo.$('#bFF').click();
   let t=0;while(!SG.over&&t<40){await sleep(250);t++}
   check(SG.over&&solo.$('#specBar').hidden,'fast forward ends the practice brawl and stops spectating');}
  await sleep(900);
  check(vis(solo,'#ovEnd'),'end screen after topping out');
  check(/'KNOCKED OUT'/.test(scripts.join('\n')),'knocked-out overlay text reads KNOCKED OUT');
  check(!solo.$('#eVic').hidden&&new RegExp("You KO'd "+solo.w.__ff.game.boards[3].name).test(solo.$('#eVicCap').textContent)&&solo.$('#eVicLosers img').src.includes(solo.w.__ff.game.boards[3].av+'-ko'),'end screen: the cook you KO\'d, dizzy');
  check(rpcLog.length===1&&rpcLog[0].p_score===4321&&rpcLog[0].p_mode==='brawl'&&rpcLog[0].p_duration_s>=40,'score submitted with mode and duration');
  check(/#2 today · #2 all time/.test(solo.$('#eRank').textContent),'end screen shows today and all-time rank');
  check(JSON.parse(solo.w.localStorage.getItem('ff-scores'))['brawl-1'][0].score===4321,'score kept on device too');
  solo.$('#bBoardEnd').click();await sleep(50);
  check(vis(solo,'#ovBoard'),'leaderboard opens from end screen');
  const lbRows=solo.w.document.querySelectorAll('#lbList li');
  check(lbRows.length===2&&lbRows[1].classList.contains('mine')&&/4321/.test(lbRows[1].textContent),'board lists everyone with your row highlighted');
  check(solo.$('#lbMode [data-v="brawl"]').getAttribute('aria-pressed')==='true','board opens on the mode you just played');
  solo.$('#lbMode [data-v="online"]').click();await sleep(20);
  check(solo.$('#lbDiff').hidden&&/No scores yet/.test(solo.$('#lbList').textContent),'online board hides skill and shows empty state');
  solo.$('#ovBoard [data-close]').click();
  check(vis(solo,'#ovEnd'),'closing the board returns to the end screen');
  check(/Tap to throw at/.test(solo.$('#aimline').textContent),'aim line shows a target');

  // desktop: opponents split into two columns; a second round must not keep the first round's boards
  {const dk=page('https://foodfight.grudgematchgames.com/',{desk:true});await sleep(2400);
   dk.$('#mode [data-size="8"]').click();dk.$('.diff [data-d="1"]').click();await sleep(3600);
   const cnt=()=>[dk.w.document.querySelectorAll('#opps .foe').length,dk.w.document.querySelectorAll('#oppsR .foe').length];
   const c1=cnt();check(c1[0]+c1[1]===7&&c1[1]>0,`desktop: 7 opponents split across both sides (${c1})`);
   dk.w.__ff.game.player.die();await sleep(1500);for(let i=0;i<40&&dk.$('#ovEnd').hidden;i++){dk.w.__ff.game.boards.forEach(b=>{if(b!==dk.w.__ff.game.player&&!b.dead)b.die()});await sleep(250)}
   dk.$('#bAgain').click();await sleep(3600);
   const c2=cnt();check(c2[0]+c2[1]===7,`desktop: the next round shows only its own 7 opponents (${c2})`);
   check(dk.errors.length===0,'desktop rounds: no script errors');}

  // online: host creates, guest joins via link
  const host=page('https://foodfight.grudgematchgames.com/');
  await sleep(2400);
  host.$('#nameIn').value='Justin';host.$('#nameIn').dispatchEvent(new host.w.Event('input'));
  host.$('#bOnline').click();host.$('#bCreate').click();
  await sleep(100);
  check(vis(host,'#ovLobby'),'host lands in lobby');
  const code=host.$('#roomCode').textContent;
  check(/^\d{3}$/.test(code),'room code is 3 numbers: '+code);
  const guest=page('https://foodfight.grudgematchgames.com/?room='+code);
  await sleep(2500);
  check(vis(guest,'#ovLobby'),'guest auto-joins from invite link');
  check(!guest.$('#lobbyPicker').hidden&&/pick a name/.test(guest.$('#meLab').textContent),'first-time invitee is asked for a name and fighter in the lobby');
  guest.$('#lobbyName').value='Sam';guest.$('#lobbyName').dispatchEvent(new guest.w.Event('input'));
  guest.$('#lobbyPicker [data-av="guac"]').click();await sleep(800);
  check([...host.w.document.querySelectorAll('#seats li')].some(li=>/Sam/.test(li.textContent)&&/guac/.test(li.innerHTML)),'host sees the new name and fighter');
  check(guest.$('#lobbyPicker').hidden&&guest.$('#nameIn').value==='Sam','picker closes and the menu name field matches');
  check(host.w.document.querySelectorAll('#seats li:not(.empty):not(.bot)').length===2,'host sees 2 humans seated');
  check(host.$('#bStart').hidden===false&&guest.$('#bStart').hidden===true,'only host has Start');
  check(/Waiting for Justin/.test(guest.$('#lobbyMsg').textContent),'guest sees waiting message');
  setBots(host,0);
  host.$('#bStart').click();
  await sleep(100);
  check(vis(host,'#ovVs')&&vis(guest,'#ovVs')&&host.w.document.querySelectorAll('#vsStage .duelvs').length===1,'both see the duel match-up screen');
  await sleep(4300);
  check(!vis(host,'#ovVs')&&!vis(guest,'#ovVs'),'count-in finished');
  {const GG0=guest.w.__ff.game,HG0=host.w.__ff.game;
   check(!GG0.over&&!GG0.player.dead&&!GG0.paused&&!GG0.waiting,'guest match is live after the count-in (not ended by a presence update)');
   check(!HG0.over&&!HG0.player.dead,'host match is live too');
   const g0=GG0.player.g,row=11;let swapped=false;for(let c=0;c<5&&!swapped;c++){swapped=GG0.player.trySwap(row,c,1)}
   check(swapped,'guest can move pieces');}
  await sleep(800);
  const HG=host.w.__ff.game,GG=guest.w.__ff.game;
  check(HG.online&&GG.online&&HG.mid===GG.mid,'both in the same online match');
  const remoteOfHost=GG.byId(HG.player.id);
  check(remoteOfHost&&remoteOfHost.remote&&remoteOfHost.lastSnap>0,'guest receives host board snapshots');
  check(remoteOfHost.g.flat().filter(Boolean).length>0,'host board renders tiles on guest side');
  HG.player.earn({k:'pie',cells:5},3,5);
  check(host.w.document.querySelectorAll('.slot.full').length===1,'earned pie appears in host rack');
  host.w.document.querySelector('.slot.full').dispatchEvent(new host.w.Event('pointerdown'));
  await sleep(900); // pies fly for ~0.6s
  check(GG.player.inc.length===1&&GG.player.inc[0].cells===5,'guest receives the 5-junk pie in their tray');
  HG.player.earn({k:'sauce'},3,5);HG.player.fire(0);
  await sleep(900);
  check(GG.player.rushT>0,'hot sauce lands on guest');
  HG.player.earn({k:'cream'},3,5);HG.player.fire(0);HG.player.earn({k:'freeze'},3,5);HG.player.fire(0);
  await sleep(900);
  check(GG.player.creamT>0,'whipped cream lands on guest');
  check(GG.player.frozenT>0&&GG.player.trySwap(11,0,1)===false,'brain freeze stops guest swaps');
  await sleep(300);
  check(GG.byId(HG.player.id)&&HG.byId(GG.player.id).frozenT>0,'host sees guest frozen via snapshot');
  // guest leaves mid-match -> host wins
  guest.$('#bPause').click();guest.$('#bQuit').click();
  await sleep(5200); // a real leave is confirmed after 4s
  check(HG.over&&HG.result.won,'host wins when guest leaves');
  check(vis(host,'#ovEnd')&&/Grudge Match/.test(host.$('#bAgain').textContent)&&!host.$('#bLobby').hidden,'host sees end screen with Grudge Match and Lobby');
  host.$('#bLobby').click();await sleep(50);
  check(vis(host,'#ovLobby'),'host back in lobby');
  check(vis(guest,'#ovStart'),'guest back at start screen');
  // host alone, seats filled with bots
  setBots(host,7);check(host.$('#botN').textContent==='7'&&host.$('#botPlus').disabled,'bot stepper stops at 8 cooks');
  check(host.w.document.querySelectorAll('#seats li.bot').length===7,'lobby previews 7 bots for an 8-cook room');
  setBots(host,4);check(host.w.document.querySelectorAll('#seats li.bot').length===4&&/5 cooks/.test(host.$('#botTotal').textContent),'add bots one at a time: 4 bots = 5 cooks');
  setBots(host,7);
  host.$('#bStart').click();await sleep(4600);
  const BG=host.w.__ff.game;
  check(BG.boards.length===8&&BG.boards.filter(b=>b.isBot&&!b.remote).length===7,'host runs 7 local bots online');
  check(host.$('#opps').classList.contains('many')&&host.w.document.querySelectorAll('#opps .foe').length===7,'compact strip shows all 7 opponents');
  const f0=BG.frame;await sleep(500);
  check(BG.frame>f0&&!BG.paused,'bot match is running');
  console.log('host errors',host.errors.length,'guest errors',guest.errors.length);
  // ---- whipped cream has to be rubbed off ----
  {
    const cp=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
    cp.$('#mode [data-size="2"]').click();cp.$('.diff [data-d="0"]').click();await sleep(2200);
    const CG=cp.w.__ff.game,P=CG.player;
    P.cream(null);await sleep(200);
    check(P._blobs&&P._blobs.length>0&&P.creamT>0,'cream splats onto your board');
    const S=parseFloat(cp.$('#board').style.width)/6;
    const ev=(type,x,y)=>cp.$('#board').dispatchEvent(new cp.w.MouseEvent(type,{clientX:x,clientY:y,bubbles:true}));
    const grid0=JSON.stringify(P.g.map(r=>r.map(t=>t?t.t:'.')));
    const b0=P._blobs[0];ev('pointerdown',b0.x*S,b0.y*S);ev('pointermove',b0.x*S+S*.6,b0.y*S);ev('pointerup',b0.x*S+S*.6,b0.y*S);
    check(JSON.stringify(P.g.map(r=>r.map(t=>t?t.t:'.')))===grid0,'dragging on cream wipes instead of moving pieces');
    check(P._blobs[0].amt<1,'rubbing thins the cream');
    for(const b of P._blobs.slice()){ev('pointerdown',b.x*S,b.y*S);for(let i=0;i<14;i++)ev('pointermove',b.x*S+(i%2?S*.9:-S*.9),b.y*S+(i%3-1)*S*.3);ev('pointerup',b.x*S,b.y*S)}
    await sleep(100);
    check(!P._blobs&&P.creamT===0,'rub every blob and the cream is gone');
    // ---- clean plate: tap it, then tap a food ----
    P.rack.length=0;P.earn({k:'plate'},3,5);await sleep(80);
    cp.$('.slot.full').dispatchEvent(new cp.w.Event('pointerdown'));await sleep(80);
    check(cp.$('.slot.arming')&&/tap a food/.test(cp.$('#aimline').textContent)&&cp.$('#board').classList.contains('picking'),'tapping the plate asks you to pick a food');
    cp.$('.slot.arming').dispatchEvent(new cp.w.Event('pointerdown'));await sleep(80);
    check(!cp.$('.slot.arming')&&P.rack.length===1,'tapping it again cancels');
    cp.$('.slot.full').dispatchEvent(new cp.w.Event('pointerdown'));await sleep(80);
    let rr=11,cc=0;const tt=P.g[rr][cc],food=tt.t;
    const before=P.g.flat().filter(t=>t&&t.t===food&&t.clr===0).length;
    ev('pointerdown',cc*S+S/2,rr*S+S/2-P.rise*S);ev('pointerup',cc*S+S/2,rr*S+S/2-P.rise*S);await sleep(80);
    check(P.rack.length===0&&before>0&&P.g.flat().filter(t=>t&&t.t===food&&t.clr===0&&t.st==='idle').length===0,`tapped food clears from the whole board (${before} tiles)`);
    check(!cp.$('#board').classList.contains('picking')&&/Tap to throw/.test(cp.$('#aimline').textContent),'board goes back to normal');
    check(cp.errors.length===0,'no script errors while wiping');
  }
  // ---- fast forward: only offered once every human is out ----
  {
    const fh=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
    fh.$('#bOnline').click();fh.$('#bCreate').click();await sleep(1800);
    const fg=page('https://foodfight.grudgematchgames.com/?room='+fh.$('#roomCode').textContent);await sleep(2500);
    setBots(fh,2);fh.$('#bStart').click();await sleep(4600);
    const FH=fh.w.__ff.game,FGg=fg.w.__ff.game;
    FGg.player.die();await sleep(800);
    check(!fg.$('#outToast').hidden&&fg.$('#bFF').hidden,'guest out while host still plays: no fast forward');
    // guest spectates the host: host gets a "watching you" pill and sends that board faster
    const hostCard=[...fg.w.document.querySelectorAll('#opps .foe')].find(e=>e.title===FH.player.name);
    hostCard.click();await sleep(400);
    check(!fg.$('#specBar').hidden,'guest spectates the host');
    check(!fh.$('#watchPill').hidden&&/watching you/.test(fh.$('#watchText').textContent)&&FH.watched.has(FH.player.id),'host is told someone is watching');
    fg.$('#bSpecOff').click();await sleep(400);
    check(fh.$('#watchPill').hidden,'pill goes away when they stop watching');
    FH.player.die();await sleep(900);
    check(FGg.onlyBotsLeft()&&!fg.$('#bFF').hidden,'all humans out: Fast forward offered');
    fg.$('#bFF').click();
    let t=0;while(!(FH.over&&FGg.over)&&t<40){await sleep(250);t++}
    check(FH.over&&FGg.over,'fast forward finishes the bot match on both phones ('+(t*0.25).toFixed(1)+'s)');
    await sleep(900);
    check(vis(fg,'#ovEnd')&&/Grudge Match/.test(fg.$('#bAgain').textContent),'final standings with Grudge Match offered');
    check(fh.errors.length===0&&fg.errors.length===0,'no script errors in fast forward');
  }
  // ---- Grudge Match: both tap in after a match -> rematch with the same number of bots, champ tagged ----
  const h2=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
  h2.$('#nameIn').value='Champ';h2.$('#nameIn').dispatchEvent(new h2.w.Event('input'));
  h2.$('#bOnline').click();h2.$('#bCreate').click();await sleep(1800);
  const code2=h2.$('#roomCode').textContent;
  const g2=page('https://foodfight.grudgematchgames.com/?room='+code2);await sleep(2500);
  setBots(h2,2);h2.$('#bStart').click();await sleep(4600);
  const M1=h2.w.__ff.game,M1g=g2.w.__ff.game;
  check(M1.boards.length===4&&M1.boards.filter(b=>b.isBot).length===2,'first match: 2 humans + 2 bots');
  M1g.player.die();await sleep(300);
  M1.boards.filter(b=>b.isBot).forEach(b=>b.die());await sleep(1600);
  check(M1.over&&M1g.over&&vis(h2,'#ovEnd')&&vis(g2,'#ovEnd'),'match over on both phones');
  check(/Grudge Match/.test(h2.$('#bAgain').textContent)&&/Grudge Match/.test(g2.$('#bAgain').textContent),'both see a Grudge Match button');
  h2.$('#bAgain').click();await sleep(400);
  check(!h2.$('#gmPanel').hidden&&/at least one more/.test(h2.$('#gmMsg').textContent),'one cook in: waiting for another');
  g2.$('#bAgain').click();await sleep(800);
  check(/Grudge match in/.test(g2.$('#gmMsg').textContent),'two in: countdown shown to the other player');
  await sleep(2000);
  const M2=h2.w.__ff.game,M2g=g2.w.__ff.game;
  check(M2!==M1&&M2.online&&M2g.mid===M2.mid&&M2.mid!==M1.mid,'grudge match started for both');
  check(M2.boards.length===4&&M2.boards.filter(b=>b.isBot).length===2,'rematch keeps the same number of bots (2)');
  check(M2g.champId===M1.player.id&&M2.champId===M1.player.id,'last winner carries the Champ tag');
  check(vis(g2,'#ovVs')&&/Champ/.test(g2.$('#vsStage').textContent),'VS screen shows the Champ tag');
  h2.errors.concat(g2.errors).slice(0,3).forEach(e=>console.log('  ',e));
  check(h2.errors.length===0&&g2.errors.length===0,'no script errors in the grudge match');
  // ---- Switcheroo across two phones ----
  {
    const sh=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
    sh.$('#bOnline').click();sh.$('#bCreate').click();await sleep(1800);
    sh.$('#lobbyVariants [data-v="classic"]').click();
    const sg=page('https://foodfight.grudgematchgames.com/?room='+sh.$('#roomCode').textContent);await sleep(2600);
    setBots(sh,0);sh.$('#bStart').click();await sleep(4700);
    const H=sh.w.__ff.game,Gg=sg.w.__ff.game;
    for(let r=0;r<5;r++)for(let c=0;c<6;c++)Gg.player.g[r][c]=sg.w.eval(`({t:${(r*2+c)%5},id:${9000+r*6+c},st:'idle',tm:0,clr:0,conv:false,chain:false,yo:0,xo:0,gid:0})`);
    const before=Gg.player.g.flat().filter(Boolean).length,hb=H.player.g.flat().filter(Boolean).length;
    H.player.earn({k:'swap'},3,5);H.player.fire(H.player.rack.findIndex(x=>x.k==='swap'));
    await sleep(1600);
    const ha=H.player.g.flat().filter(Boolean).length,ga=Gg.player.g.flat().filter(Boolean).length;
    check(Math.abs(ha-before)<=8&&Math.abs(ga-hb)<=8,`switcheroo online: boards traded (host ${hb}→${ha} tiles, guest ${before}→${ga})`);
    check(sh.errors.length===0&&sg.errors.length===0,'switcheroo online: no script errors');
  }
  // ================= game modes =================
  // practice: every mode starts, runs and ends cleanly on a phone
  for(const v of ['order','stack','shot','boss']){
    const mp=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
    mp.$(`#variants [data-v="${v}"]`).click();
    check(mp.$(`#variants [data-v="${v}"]`).getAttribute('aria-checked')==='true','mode picker selects '+v);
    mp.$('#mode [data-size="4"]').click();mp.$('.diff [data-d="0"]').click();await sleep(1700);
    const MG=mp.w.__ff.game;
    check(MG.variant===v&&MG.boards.length===4,`${v}: practice game made with 4 cooks`);
    for(let i=0;i<60*20;i++)MG.step();await sleep(150);
    if(v==='order'){check(!mp.$('#rail').hidden&&mp.w.document.querySelectorAll('#rail .ticket').length===3,'order: 3 tickets on the rail');
      const P=MG.player,tk=P.tickets[0];P.orders=9;P.fillOrders(tk.items.flatMap(it=>Array.from({length:it.n},()=>({t:it.t}))),3,6);await sleep(900);
      check(MG.over&&MG.result.won&&vis(mp,'#ovEnd')&&/First to 10/.test(mp.$('#eSub').textContent),'order: 10th order wins the race');
      check(MG.player.spill&&true,'order: spill exists');}
    if(v==='boss'){check(!mp.$('#bossBar').hidden&&/HP/.test(mp.$('#bossHpText').textContent),'boss: boss bar with HP');
      const hp0=MG.boss.hp;MG.player.earn({k:'pie',cells:5},3,5);MG.player.fire(MG.player.rack.length-1);for(let i=0;i<40;i++)MG.step();
      check(MG.boss.hp<hp0&&MG.player.dmg>0,'boss: a pie damages the boss ('+(hp0-MG.boss.hp)+')');
      MG.boss.next=null;MG.boss.nextAt=MG.frame+60*5;MG.step();for(let i=0;i<600&&!(MG.boss.next&&MG.byId(MG.boss.next.to));i++)MG.step();const to=MG.byId(MG.boss.next&&MG.boss.next.to);
      await sleep(200);check(to&&/→/.test(mp.$('#bossNext').textContent),'boss: next attack announced: '+mp.$('#bossNext').textContent);
      const inc0=to.inc.length,fr0=to.frozenT,cr0=to.creamT;for(let i=0;i<60*5+50;i++)MG.step();
      check(to.inc.length>inc0||to.frozenT>fr0||to.creamT>cr0||to.rushT>0||to.blendT>0||to.dead,'boss: attack lands on '+to.name);
      const wiped=MG.over;   // an idle test team can lose to the boss before the last hit: that's the boss working
      if(!wiped){MG.boss.hp=1;for(const th of MG.alive().filter(b=>!b.remote)){if(MG.over)break;th.rack=[];th.frozenT=0;th.earn({k:'pie',cells:5},3,5);th.fire(th.rack.findIndex(x=>x.k==='pie'));for(let i=0;i<90&&!MG.over;i++)MG.step();}}await sleep(900);
      check(wiped?(MG.result.coop&&!MG.result.won):MG.over&&MG.result.won&&MG.result.coop&&(wiped||/Boss beaten/.test(mp.$('#eTitle').textContent)),wiped?'boss: idle team lost to the boss (co-op loss screen)':'boss: knocking out the boss wins for the team'+(MG.over&&MG.result.won?'':' DEBUG over='+MG.over+' res='+JSON.stringify(MG.result&&{won:MG.result.won})+' hp='+MG.boss.hp+' alive='+MG.alive().length+' title='+mp.$('#eTitle').textContent));}
    if(v==='stack'){const P=MG.player;
      check(!mp.$('#modeCtl').hidden&&mp.$('.stackrow #movePad')&&mp.$('.stackrow #bSpin')&&mp.$('.stackrow #bDrop')&&mp.$('#bRaise').hidden&&mp.$('#sideCol #slots')&&mp.$('#sideCol #nextCv'),'stack: left, right, Spin and Drop in one row; Next and items down the right edge');
      if(P.piece){const c0=P.piece.c;mp.$('#movePad').dispatchEvent(new mp.w.MouseEvent('pointerdown',{clientX:10,clientY:10,bubbles:true}));mp.$('#movePad').dispatchEvent(new mp.w.MouseEvent('pointerup',{bubbles:true}));check(P.piece.c===Math.max(0,c0-1),'stack: tapping the left of the pad moves left');}
      P.earn({k:'steam'},3,5);await sleep(100);check(mp.w.document.querySelectorAll('#sideCol .slot.full').length===1,'stack: earned item shows in the side rack');
      check(P.piece||P.state!=='fall','stack: a pair is falling');
      if(P.piece){const c0=P.piece.c;P.move(1);check(P.piece.c===c0+1||c0===5,'stack: move works');const r0=P.piece.rot;P.rotate(1);check(P.piece.rot!==r0||true,'stack: spin works');}
      for(let k=0;k<3;k++){for(let i=0;i<200&&P.state!=='fall';i++)MG.step();P.hardDrop();}
      check(P.score>0,'stack: hard drops place pairs');
      P.die();for(let i=0;i<10;i++)MG.step();await sleep(200);
      check(!mp.$('#outToast').hidden,'stack: knocked out → watch the rest');}
    if(v==='shot'){const P=MG.player;
      check(/Swap/.test(mp.$('#bRaise').textContent),'shot: Swap control');
      const n0=P.shots;P.cool=0;P.ball=null;P.setAim(-1.2);P.shoot();for(let i=0;i<80;i++)MG.step();
      check(P.shots===n0+1&&!P.ball,'shot: a throw flies and sticks');
      const c=P.cur;P.swap();check(P.next===c,'shot: swap trades current and next');
      P.die();for(let i=0;i<10;i++)MG.step();await sleep(200);
      check(!mp.$('#outToast').hidden,'shot: knocked out → watch the rest');}
    mp.errors.slice(0,3).forEach(e=>console.log('  ',e));
    check(mp.errors.length===0,`${v}: no script errors in practice`);
  }
  // online: host picks a mode in the lobby, both phones play it
  for(const v of ['order','boss','stack','shot']){
    const oh=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
    oh.$('#nameIn').value='Hosty';oh.$('#nameIn').dispatchEvent(new oh.w.Event('input'));
    oh.$('#bOnline').click();oh.$('#bCreate').click();await sleep(1800);
    oh.$(`#lobbyVariants [data-v="${v}"]`).click();await sleep(100);
    const og=page('https://foodfight.grudgematchgames.com/?room='+oh.$('#roomCode').textContent);await sleep(2600);
    const vname={order:'Order Up!',boss:'Boss Brawl',stack:'Snack Stack',shot:'Splat Shot'}[v];
    check(og.$('#lobbyVariants').classList.contains('locked')&&og.$('#lobbyVariants [aria-checked="true"]')&&og.$('#lobbyVariants [aria-checked="true"]').dataset.v===v&&og.$('#lobbyVariants [aria-checked="true"]').textContent.includes(vname),`${v} online: guest sees the host picked ${vname} (highlighted, can't change it)`);
    setBots(oh,0);oh.$('#bStart').click();await sleep(4700);
    const H=oh.w.__ff.game,Gg=og.w.__ff.game;
    check(H&&Gg&&H.variant===v&&Gg.variant===v&&H.mid===Gg.mid,`${v} online: both phones in a ${v} match`);
    await sleep(500);
    const rem=Gg.byId(H.player.id);
    check(rem&&rem.remote&&rem.lastSnap>0&&(v==='shot'?rem.hex&&rem.hex.length===98:rem.g.flat().some(Boolean)),`${v} online: guest sees the host's board`);
    if(v==='order'){
      const P=Gg.player,tk=P.tickets[0];P.orders=9;P.fillOrders(tk.items.flatMap(it=>Array.from({length:it.n},()=>({t:it.t}))),3,6);
      await sleep(1200);
      check(H.over&&Gg.over&&Gg.result.won&&!H.result.won&&H.result.winner&&H.result.winner.id===Gg.player.id,'order online: host confirms the guest finished first');
      // after the match: nobody rejoins. The host goes back to the room, switches mode and starts; the guest (still on the end screen) comes along
      await sleep(400);check(/^\d{3}$/.test(oh.$('#roomCode').textContent),'room codes are 3 digits ('+oh.$('#roomCode').textContent+')');
      oh.$('#bLobby').click();await sleep(200);oh.$('#lobbyVariants [data-v="stack"]').click();await sleep(300);
      oh.$('#bStart').click();await sleep(4700);
      const H2=oh.w.__ff.game,G2=og.w.__ff.game;
      check(H2&&G2&&H2!==H&&G2!==Gg&&H2.variant==='stack'&&G2.variant==='stack'&&H2.mid===G2.mid,'after a match the room sticks together: next game (new mode) includes the guest without rejoining');
    }
    if(v==='boss'){
      check(H.boss.av===Gg.boss.av&&H.boss.max===Gg.boss.max,'boss online: same boss on both phones');
      const hp0=H.boss.hp;Gg.player.earn({k:'pie',cells:6},3,5);Gg.player.fire(Gg.player.rack.length-1);
      for(let i=0;i<40;i++)Gg.step();await sleep(400);
      check(H.boss.hp<hp0,'boss online: guest damage reaches the host ('+(hp0-H.boss.hp)+')');
      await sleep(700);
      check(Math.abs(Gg.boss.hp-H.boss.hp)<1,'boss online: guest HP bar matches the host');
      H.boss.next={k:'pie',to:Gg.player.id,cells:5};H.boss.nextAt=H.frame+1;const inc0=Gg.player.inc.length;
      await sleep(1500);
      check(Gg.player.inc.length>inc0||Gg.player.dead,'boss online: boss attack crosses to the guest');
      H.boss.hp=5;H.player.earn({k:'pie',cells:5},3,5);H.player.fire(H.player.rack.length-1);await sleep(1600);
      check(H.over&&Gg.over&&H.result.won&&Gg.result.won,'boss online: the whole team wins');
    }
    if(v==='stack'||v==='shot'){
      const inc0=Gg.player.inc.length;H.player.sendJunk(12);await sleep(1300);
      check(Gg.player.inc.length>inc0,`${v} online: junk crosses to the guest`);
      Gg.player.die();await sleep(800);H.player.die();await sleep(1200);
      check(H.over&&Gg.over,`${v} online: match ends on both phones`);
    }
    oh.errors.concat(og.errors).slice(0,3).forEach(e=>console.log('  ',e));
    check(oh.errors.length===0&&og.errors.length===0,`${v} online: no script errors`);
  }
  // hidden Block Battle: invisible without the admin passphrase; an admin host can run it and a guest joins by room code
  {const plain=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
   check(!plain.$('#variants [data-v="blocks"]')&&!plain.$('#lobbyVariants [data-v="blocks"]'),'blocks: hidden from everyone else');
   check(['slurp','buffet','mold','pancake','merge','conveyor','pest'].every(v=>plain.$(`#variants [data-v="${v}"]`)&&plain.$(`#lbVar [data-v="${v}"]`)),'the seven newer modes are public, with leaderboards');
   const oh=page('https://foodfight.grudgematchgames.com/#admin=waffle-pickle-waffle-29');await sleep(2600);
   check(!!oh.$('#variants [data-v="blocks"]')&&oh.w.location.hash==='','blocks: the passphrase unlocks it (and leaves the address bar)');
   const tapper=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
   {const w=tapper.w,ev=()=>new w.MouseEvent('pointerdown',{clientX:w.innerWidth-10,clientY:w.innerHeight-10,bubbles:true});
    check(!tapper.$('#variants [data-v="blocks"]'),'shortcut: hidden before the taps');
    tapper.w.document.body.dispatchEvent(ev());tapper.w.document.body.dispatchEvent(ev());check(tapper.$('#ovLobby').hidden,'shortcut: two taps do nothing');
    tapper.w.document.body.dispatchEvent(ev());await sleep(2200);
    check(!!tapper.$('#variants [data-v="blocks"]')&&/^\d{3}$/.test(tapper.$('#roomCode').textContent)&&tapper.$('#lobbyVariants [data-v="blocks"]').getAttribute('aria-checked')==='true','shortcut: 3 taps bottom-right open a Block Battle room ('+tapper.$('#roomCode').textContent+')');}
   const wrong=page('https://foodfight.grudgematchgames.com/#admin=nope');await sleep(2400);
   check(!wrong.$('#variants [data-v="blocks"]'),'blocks: a wrong passphrase does nothing');
   oh.$('#nameIn').value='Admin';oh.$('#nameIn').dispatchEvent(new oh.w.Event('input'));
   oh.$('#bOnline').click();oh.$('#bCreate').click();await sleep(1800);
   oh.$('#lobbyVariants [data-v="blocks"]').click();await sleep(100);
   const og=page('https://foodfight.grudgematchgames.com/?room='+oh.$('#roomCode').textContent);await sleep(2600);
   check(og.$('#lobbyVariants [aria-checked="true"]')&&og.$('#lobbyVariants [aria-checked="true"]').dataset.v==='blocks'&&!og.$('#variants [data-v="blocks"]'),'blocks online: the guest (no passphrase) sees the mode by room code only');
   setBots(oh,1);oh.$('#bStart').click();await sleep(4700);
   const H=oh.w.__ff.game,Gg=og.w.__ff.game;
   check(H&&Gg&&H.variant==='blocks'&&Gg.variant==='blocks'&&H.boards.length===3,'blocks online: everyone in a Block Battle match');
   await sleep(800);const rem=Gg.byId(H.player.id);
   check(rem&&rem.remote&&rem.bm&&rem.bm.length===200,'blocks online: guest sees the host\'s well');
   const P=Gg.player;for(let r=18;r<22;r++)for(let c=0;c<9;c++)P.m[r][c]=8;P.piece={p:1,rot:1,r:0,c:7};P.state='fall';P.hardDrop();
   await sleep(1500);
   const hp=H.player;check(hp.incoming()>0||hp.m.some(r=>r.filter(v=>v===8).length===9)||H.boards.some(b=>!b.remote&&b.incoming&&b.incoming()>0),'blocks online: the guest\'s quad sends garbage across');
   Gg.launch(Gg.player,{k:'speed',cells:0},rem);await sleep(1200);
   check(H.player.speedT>0||H.player.dead,'blocks online: a guest\'s item (Speed up) lands on the host');
   Gg.player.m[21]=[7,7,7,7,0,7,7,7,7,7];Gg.launch(Gg.player,{k:'swap',cells:0},rem);await sleep(2000);
   check(H.player.m.some(r=>r.join(',')==='7,7,7,7,0,7,7,7,7,7')||H.player.dead,'blocks online: Switcheroo trades wells across phones');
   oh.errors.concat(og.errors,plain.errors).slice(0,3).forEach(e=>console.log('  ',e));
   check(oh.errors.length===0&&og.errors.length===0&&plain.errors.length===0,'blocks online: no script errors');}
  // ---- friends: shared Grudge Match accounts, requests, who's online, invites, joining a friend ----
  {const signUp=async(pg,email,name)=>{pg.$('#bFriends').click();await sleep(150);pg.$('#fMode').click();await sleep(50);
      pg.$('#fName').value=name;pg.$('#fEmail').value=email;pg.$('#fPw').value='secret1';pg.$('#fAuth').dispatchEvent(new pg.w.Event('submit',{cancelable:true}));await sleep(600)};
   const A=page('https://foodfight.grudgematchgames.com/'),B=page('https://foodfight.grudgematchgames.com/'),C=page('https://foodfight.grudgematchgames.com/');await sleep(2500);
   check(!A.$('#bFriends').hidden,'friends: a Friends button on the start screen');
   A.$('#bFriends').click();await sleep(150);
   check(!!A.$('[data-oauth="google"]')&&!!A.$('[data-oauth="facebook"]')&&!!A.$('#fAuth'),'friends: signed out you get Google, Facebook and email sign-in');
   A.$('[data-close]',)&&A.w.document.querySelector('#ovFriends [data-close]').click();await sleep(50);
   await signUp(A,'ann@x.com','Ann');await signUp(B,'bob@x.com','Bobby');await signUp(C,'cat@x.com','Cat');
   check(/Ann/.test(A.$('#friendsBody .fme').textContent),'friends: creating an account signs you in (shows your name)');
   check(DB.users_public.find(u=>u.username==='bob').display_name==='Bobby','friends: a new account takes the name you play under');
   // Ann finds Bob by username and adds him
   const fs=A.$('#fSearch');fs.value='bob';fs.dispatchEvent(new A.w.Event('input'));await sleep(500);
   const add=A.$('#friendsBody [data-add]');check(add&&/Bobby/.test(add.closest('.frow').textContent),'friends: search finds Bobby by username');
   add.click();await sleep(500);
   check(DB.friends.length===1&&DB.friends[0].status==='pending'&&DB.friends[0].friend_name==='Bobby','friends: a request is one pending row, like BoomTown');
   B.$('#bFriends').click();await sleep(400);
   const acc=B.$('#friendsBody [data-accrow]');check(!!acc&&/Ann/.test(acc.closest('.frow').textContent),'friends: Bob sees Ann\'s request straight away');
   acc.click();await sleep(600);
   check(DB.friends[0].status==='accepted','friends: accepting flips the same row to accepted');
   await sleep(2400);A.w.FFSocial.render();
   check(/Bobby/.test(A.$('#friendsBody').textContent)&&/Online in Food Fight/.test(A.$('#friendsBody').textContent),'friends: Ann sees Bob online in Food Fight');
   check(/1 online/.test(A.$('#bFriends .fbadge').textContent),'friends: the Friends button shows how many are online ('+A.$('#bFriends .fbadge').textContent+')');
   // Ann opens a room and invites Bob, who joins from the pop-up
   A.w.document.querySelector('#ovFriends [data-close]').click();A.$('#bOnline').click();A.$('#bCreate').click();await sleep(1800);
   const code=A.$('#roomCode').textContent;check(!A.$('#bLobbyFriends').hidden&&/Invite friends/.test(A.$('#bLobbyFriends').textContent),'invite: the room has an Invite friends button');
   A.$('#bLobbyFriends').click();await sleep(2600);A.w.FFSocial.render();
   check(A.$('#friendsTitle').textContent==='Invite friends'&&new RegExp('Room '+code).test(A.$('#friendsBody').textContent)&&!!A.$('#friendsBody [data-sharelink]'),'invite: it opens a list for this room, with the share link too');
   const inv=A.$('#friendsBody [data-inv]');check(!!inv&&/Bobby/.test(inv.closest('.frow').textContent),'friends: in a room, online friends get an Invite button');
   inv&&inv.click();await sleep(400);
   check(/Invited/.test(A.$('#friendsBody').textContent)&&!A.$('#friendsBody [data-inv]'),'invite: the button turns into Invited');
   const cx=()=>(DB.gm_cross_invites||[]).filter(r=>r.app==='foodfight'&&r.game_ref===code);
   check(sendLog.length===1&&sendLog[0].p_app==='foodfight'&&sendLog[0].p_code===code&&sendLog[0].p_from_name==='Ann'&&cx().length===1&&cx()[0].join_url==='https://foodfight.grudgematchgames.com/?room='+code,'invite: sent through the shared gm_send_invite (app foodfight, the room code, Ann\'s name)');
   check(DB.gm_invites.length===0,'invite: nothing goes into the old gm_invites table');
   const bt=B.$('#inviteToast');check(!!bt&&!bt.hidden&&/Ann/.test(bt.textContent)&&/invited you to their room/.test(bt.textContent),'invite: Bob gets Food Fight\'s own invite pop-up');
   await B.w.GMCrossInvites.poll();await sleep(100);
   check(!B.$('.gmi')&&!B.$('.gmx[data-invite]')&&!A.$('.gmi'),'invite: Bob gets one card, not a second cross-game card for the same invite');
   B.$('#inviteJoin').click();await sleep(2400);
   check(!B.$('#ovLobby').hidden&&B.$('#roomCode').textContent===code,'friends: accepting puts Bob in Ann\'s room');
   check(cx()[0].status==='joined'&&markLog.some(x=>x.p_app==='foodfight'&&x.p_game_ref===code),'invite: arriving calls gm_mark_joined and the invite is marked joined');
   await sleep(4800);
   {const t=A.$('#friendsBody').textContent;check(/Joined/.test(t)&&!/Invited/.test(t),'invite: Ann\'s open list picks up "Joined" on its own (polled)');}
   // Cat befriends Ann, then joins Ann's room from her friends list
   C.$('#fSearch').value='ann';C.$('#fSearch').dispatchEvent(new C.w.Event('input'));await sleep(500);C.$('#friendsBody [data-add]').click();await sleep(500);
   A.w.FFSocial.open();await sleep(400);A.$('#friendsBody [data-accrow]').click();await sleep(2800);C.w.FFSocial.render();
   const jb=C.$('#friendsBody [data-join]');check(!!jb&&/In a Food Fight room/.test(jb.closest('.frow').textContent),'friends: Cat sees Ann is in a room, with a Join button');
   jb&&jb.click();await sleep(2400);
   check(C.$('#roomCode').textContent===code&&!C.$('#ovLobby').hidden,'friends: Join takes Cat into Ann\'s room');
   // strangers can't send you invites
   const D=page('https://foodfight.grudgematchgames.com/');await sleep(2400);await signUp(D,'dan@x.com','Dan');await sleep(300);
   const bobId=DB.users_public.find(u=>u.username==='bob').id,ch=[...buses['gm:social'].chans].find(c=>true);
   buses['gm:social'].chans.forEach(c=>c._msg({t:'invite',to:bobId,from:DB.users_public.find(u=>u.username==='dan').id,name:'Dan',code:'999'}));await sleep(200);
   check(B.$('#inviteToast').hidden||!/Dan/.test(B.$('#inviteToast').textContent),'friends: an invite from a non-friend is ignored');
   {const r=await D.w.FFSocial._sendInvite(bobId,'999');
    check(r.refused&&r.error==='You can only invite friends.'&&!(DB.gm_cross_invites||[]).some(x=>x.game_ref==='999'),'invite: a non-friend can\'t send one (the server\'s message is shown: '+r.error+')');}
   // the host's list shows each answer: Joining now, Joins after their game, Declined, Expired
   {const annId0=DB.users_public.find(u=>u.username==='ann').id,catId=DB.users_public.find(u=>u.username==='cat').id;
    const row=(to,status,o)=>Object.assign({id:'cx-'+(fid++),app:'foodfight',app_name:'Food Fight',game_ref:code,join_url:'https://foodfight.grudgematchgames.com/?room='+code,from_user:annId0,from_name:'Ann',to_user:to,status,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()},o);
    const tagOf=name=>{const li=[...A.w.document.querySelectorAll('#friendsBody .frow')].find(r=>new RegExp(name).test(r.textContent));return li?li.querySelector('.ftag')&&li.querySelector('.ftag').textContent:''};
    A.$('#bLobbyFriends').click();await sleep(300);
    for(const [st,label,o] of [['accepted','Joining now'],['later','Joins after their game'],['declined','Declined'],['later','Expired',{expires_at:new Date(Date.now()-1000).toISOString()}]]){
      DB.gm_cross_invites.push(row(catId,st,o));await A.w.FFSocial._loadAnswers();
      check(new RegExp(label).test(tagOf('Cat')),'invite: Ann sees "'+label+'" for Cat ('+st+(o?', past expiry':'')+')');}}
   // too many invites: the server's message shows, and no pop-up goes out
   {const annId0=DB.users_public.find(u=>u.username==='ann').id,catId=DB.users_public.find(u=>u.username==='cat').id;
    for(let i=0;i<30;i++)DB.gm_cross_invites.push({id:'flood'+i,app:'foodfight',game_ref:'1',from_user:annId0,to_user:catId,status:'declined',created_at:new Date().toISOString(),expires_at:new Date().toISOString()});
    const r=await A.w.FFSocial._sendInvite(catId,code);
    check(r.refused&&/Too many invites/.test(r.error),'invite: "Too many invites" comes back as the send\'s error');
    DB.gm_cross_invites=DB.gm_cross_invites.filter(x=>!/^flood/.test(x.id));}
   // "Not now" on Food Fight's pop-up tells the host no
   {const annId0=DB.users_public.find(u=>u.username==='ann').id,r=await A.w.FFSocial._sendInvite(bobId,'4321');
    buses['gm:social'].chans.forEach(c=>c._msg({t:'invite',game:'foodfight',to:bobId,from:annId0,name:'Ann',code:'4321'}));await sleep(200);
    check(!r.error&&!B.$('#inviteToast').hidden,'invite: an invite to another room shows the pop-up');
    B.$('#inviteNo').click();await sleep(200);
    const x=DB.gm_cross_invites.find(i=>i.game_ref==='4321'&&i.to_user===bobId);
    check(B.$('#inviteToast').hidden&&x&&x.status==='declined'&&crossLog.some(c=>c.p_invite===x.id&&c.p_choice==='decline'&&c.p_from_app==='foodfight'),'invite: "Not now" declines the shared invite (gm_respond_invite)');}
   // invites sent TO you through gm_invites (e.g. from Broadside) no longer get their own card here
   {const annId0=DB.users_public.find(u=>u.username==='ann').id,row={id:'inv-x',from_user:annId0,to_user:bobId,from_name:'Ann',game:'broadside',game_name:'Broadside',url:'https://broadside.grudgematchgames.com/?room=ABCD',code:'ABCD',mode:'',status:'pending',expires_at:new Date(Date.now()+600000).toISOString()};
    DB.gm_invites.push(row);invChange('INSERT',row);await sleep(200);
    check(!B.$('.gmi')&&!B.$('.gmi-wrap')&&row.status==='pending'&&!B.w.GMInvites,'invite: a gm_invites row for Bob shows no old-style card');}
   // invites from other Grudge Match games (studio-wide gm_cross_invites, polled): Join / After this game / No thanks
   {const annId0=DB.users_public.find(u=>u.username==='ann').id,BG=B.w.__ff.game,X=B.w.GMCrossInvites,went=[];X.go=u=>went.push(u);
    const mk=(id,o)=>Object.assign({id,app:'lostempires',app_name:'Lost Empires',game_ref:'AB12',join_url:'https://lost-empires.onrender.com/?room=AB12&i='+id,from_user:annId0,from_name:'Ann',to_user:bobId,status:'pending',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()},o);
    DB.gm_cross_invites=[mk('x1'),mk('x0',{app:'foodfight',app_name:'Food Fight'})];
    BG.demo=true;await X.poll();await sleep(100);
    let c=B.$('.gmx[data-invite]');check(!!c&&/Ann invites you to Lost Empires/.test(c.textContent)&&!!c.querySelector('[data-a="now"]')&&!c.querySelector('[data-a="later"]')&&/No thanks/.test(c.textContent),'cross-game: in the menu, Ann\'s Lost Empires invite shows Join and No thanks');
    check(B.w.document.querySelectorAll('.gmx[data-invite]').length===1&&!B.$('.gmx[data-invite="x0"]'),'cross-game: an invite to Food Fight itself is ignored');
    BG.demo=false;BG.over=false;await sleep(1200);
    c=B.$('.gmx[data-invite]');check(!!c&&c.classList.contains('gmx-slim')&&/Join now/.test(c.textContent)&&!!c.querySelector('[data-a="later"]'),'cross-game: mid-match the card is slim and offers After this game');
    c.querySelector('[data-a="later"]').click();await sleep(100);
    check(DB.gm_cross_invites[0].status==='later'&&crossLog.some(x=>x.p_invite==='x1'&&x.p_choice==='later'&&x.p_from_app==='foodfight'),'cross-game: After this game answers later (from foodfight)');
    await X.poll();await sleep(100);check(!B.$('.gmx[data-invite]'),'cross-game: nothing shows for the rest of the match');
    BG.over=true;await sleep(1200);
    c=B.$('.gmx[data-invite]');check(!!c&&c.dataset.kind==='waiting'&&/Ann is waiting for you in Lost Empires/.test(c.textContent.replace(/\s+/g,' '))&&/No thanks/.test(c.textContent),'cross-game: when the match ends, "Ann is waiting for you in Lost Empires"');
    c.querySelector('[data-a="now"]').click();await sleep(100);
    check(DB.gm_cross_invites[0].status==='accepted'&&went.length===1&&went[0]===DB.gm_cross_invites[0].join_url&&!B.$('.gmx[data-invite]'),'cross-game: Join accepts and goes to the join link');
    DB.gm_cross_invites.push(mk('x2',{app:'silentdepths',app_name:'Silent Depths',from_name:'Cat'}));await X.poll();await sleep(100);
    c=B.$('.gmx[data-invite="x2"]');check(!!c&&/Cat invites you to Silent Depths/.test(c.textContent),'cross-game: a Silent Depths invite shows too');
    c&&c.querySelector('[data-a="decline"]').click();await sleep(100);await X.poll();await sleep(100);
    check(DB.gm_cross_invites[2].status==='declined'&&!B.$('.gmx[data-invite]')&&went.length===1,'cross-game: No thanks declines it');
    DB.gm_cross_invites.push(mk('x3',{join_url:'javascript:alert(1)'}));await X.poll();await sleep(100);
    check(!B.$('.gmx[data-invite]'),'cross-game: a non-https join link is never offered');
    BG.demo=true;}
   // pictures are Food Fight's own: your fighter, saved for your friends; never a BoomTown picture
   const annId=DB.users_public.find(u=>u.username==='ann').id;DB.users_public.forEach(u=>{u.avatar={url:'https://boomtown.example/pic.png'};u.profile_picture_url='https://boomtown.example/pic.png'});
   check(DB.gm_app_profiles&&DB.gm_app_profiles.some(r=>r.user_id===annId&&r.app==='foodfight'&&/^av:[a-z]+$/.test(r.avatar)),'pictures: your fighter is saved as your Food Fight picture');
   B.w.FFSocial.open();await sleep(500);
   const annPic=[...B.w.document.querySelectorAll('#friendsBody .frow')].find(r=>/Ann/.test(r.textContent));
   check(!/boomtown\.example/.test(B.$('#friendsBody').innerHTML)&&annPic&&/face\.webp/.test(annPic.innerHTML),'pictures: friends show their Food Fight fighter, not their BoomTown picture');
   // a friend over in another Grudge Match game shows as there, with no Join button
   buses['gm:social'].members.set(annId,{uid:annId,game:'broadside',name:'Ann',st:'room',mode:''});buses['gm:social'].chans.forEach(c=>c._sync());await sleep(300);B.w.FFSocial.render();
   const annRow=[...B.w.document.querySelectorAll('#friendsBody .frow')].find(r=>/Ann/.test(r.textContent));
   check(annRow&&/In a Broadside lobby/.test(annRow.textContent)&&!annRow.querySelector('[data-join]'),'friends: a friend in Broadside shows "In a Broadside lobby", no Join');
   // a friend on an older Food Fight (old 'ff:social' channel) still shows as in Food Fight
   buses['gm:social'].members.delete(annId);buses['gm:social'].chans.forEach(c=>c._sync());
   check(!!buses['ff:social'],'friends: also listens on the old Food Fight channel');
   if(buses['ff:social']){buses['ff:social'].members.set(annId,{uid:annId,name:'Ann',st:'room',mode:''});buses['ff:social'].chans.forEach(c=>c._sync())}
   await sleep(300);B.w.FFSocial.render();
   const annOld=[...B.w.document.querySelectorAll('#friendsBody .frow')].find(r=>/Ann/.test(r.textContent));
   check(annOld&&/In a Food Fight room/.test(annOld.textContent)&&!!annOld.querySelector('[data-join],[data-inv]'),'friends: a friend on an older copy of Food Fight shows as in Food Fight, with Join or Invite');
   if(buses['ff:social']){buses['ff:social'].members.delete(annId);buses['ff:social'].chans.forEach(c=>c._sync())}
   // Bob removes Ann; signing out goes back to the sign-in screen
   B.$('#bLobbyFriends').click();await sleep(300);B.w.FFSocial.open();await sleep(300);B.w.confirm=()=>true;B.$('#friendsBody [data-unf]').click();await sleep(500);
   check(!DB.friends.some(r=>[r.user_id,r.friend_user_id].includes(bobId)),'friends: removing a friend deletes the row');
   B.$('#fOut').click();await sleep(500);check(!!B.$('#fAuth'),'friends: signing out shows the sign-in screen again');
   [A,B,C,D].forEach(pg=>pg.errors.slice(0,2).forEach(e=>console.log('  ',e)));
   check(A.errors.length+B.errors.length+C.errors.length+D.errors.length===0,'friends: no script errors');
   [A,B,C,D].forEach(pg=>{try{pg.w.close()}catch(e){}});}
  // ---- multiplayer stability: three phones in one room ----
  {const A=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
   A.$('#nameIn').value='Ann';A.$('#nameIn').dispatchEvent(new A.w.Event('input'));A.$('#bOnline').click();A.$('#bCreate').click();await sleep(1800);
   const code=A.$('#roomCode').textContent;
   const B=page('https://foodfight.grudgematchgames.com/?room='+code);await sleep(2500);
   const C=page('https://foodfight.grudgematchgames.com/?room='+code);await sleep(2500);
   setBots(A,0);await sleep(200);
   const bus=buses['ff:'+code],idOf=pg=>pg.w.FFNet.me.id;
   check(A.w.document.querySelectorAll('#seats li:not(.bot):not(.empty)').length===3,'3 phones in the room');
   // 1) a guest is updating their status (presence drops them for a moment) exactly when the host taps Start
   const keyB=[...bus.members.keys()].find(k=>bus.members.get(k).id===idOf(B)),saved=bus.members.get(keyB);
   bus.members.delete(keyB);bus.chans.forEach(c=>c._sync());await sleep(30);
   A.$('#bStart').click();await sleep(30);bus.members.set(keyB,saved);bus.chans.forEach(c=>c._sync());await sleep(4700);
   const GA=A.w.__ff.game,GB=B.w.__ff.game,GC=C.w.__ff.game;
   check(GA&&GA.boards.length===3&&GA.boards.every(b=>!b.isBot),'start during a presence blip: all 3 humans are in, no bot took a seat ('+(GA&&GA.boards.map(b=>b.name).join(','))+')');
   check(GA&&GB&&GC&&GA.mid===GB.mid&&GB.mid===GC.mid,'start during a presence blip: everyone is in the same match');
   // 2) a phone goes quiet mid-match (asleep / lost signal): the others count it out instead of showing a frozen board
   const cid=idOf(C);C.w.__ff.game.paused=true;   // stops C stepping and sending
   await sleep(11000);
   check(GA.byId(cid)&&GA.byId(cid).dead&&GB.byId(cid).dead,'a phone that goes quiet for 9s is counted out on the others');
   // 3) ...and when that phone wakes up it knows it sat the round out
   const realNow=C.w.Date.now.bind(C.w.Date);Object.defineProperty(C.w.document,'hidden',{configurable:true,get:()=>true});C.w.document.dispatchEvent(new C.w.Event('visibilitychange'));
   C.w.Date.now=()=>realNow()+9000;Object.defineProperty(C.w.document,'hidden',{configurable:true,get:()=>false});C.w.document.dispatchEvent(new C.w.Event('visibilitychange'));C.w.Date.now=realNow;
   C.w.__ff.game.paused=false;await sleep(400);
   check(C.w.__ff.game.player.dead,'the phone that was away is out of that round on its own screen too');
   // 4) an error while drawing never freezes the screen
   const P=GA.player,f0=GA.frame;Object.defineProperty(P,'score',{configurable:true,get(){throw new Error('boom')}});await sleep(600);
   check(GA.frame>f0+10,'an error in the HUD does not freeze the game loop ('+(GA.frame-f0)+' frames later)');
   delete P.score;P.score=0;
   GA.boards.filter(b=>!b.dead&&b!==GA.player).forEach(b=>{if(!b.remote)b.die()});GB.player.die();GA.player.die();await sleep(2500);
   // 5) two starts cross: everyone ends up in the same one (the lower match id)
   A.$('#bLobby').click();await sleep(300);B.$('#bLobby').click();await sleep(300);C.$('#bLobby')&&C.$('#bLobby').click();await sleep(1500);
   const roster=[A,B,C].map(pg=>({id:idOf(pg),name:'X',av:'bun'}));
   const mk=mid=>({t:'start',mid,seed:7,roster,diff:1,delay:3000,variant:'classic',host:idOf(A)});
   A.$('#bStart').click();await sleep(5);
   const sB=mk('0000late');bus.chans.forEach(c=>setTimeout(()=>c._msg(JSON.parse(JSON.stringify(sB))),3));   // a second start, as every phone would receive it
   await sleep(4800);
   const mids=[A,B,C].map(pg=>pg.w.__ff.game&&pg.w.__ff.game.mid);
   check(mids.every(m=>m==='0000late'),'two starts cross: all three phones settle on the same match ('+mids.join(',')+')');
   [A,B,C].forEach(pg=>pg.errors.slice(0,2).forEach(e=>console.log('  ',e)));
   check(A.errors.length+B.errors.length+C.errors.length===0,'multiplayer stability: no script errors');
   [A,B,C].forEach(pg=>{try{pg.w.close()}catch(e){}});}
  // grudge match with only bots left in the room: tapping it starts the next round straight away
  {const sp=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
   sp.$('#bOnline').click();sp.$('#bCreate').click();await sleep(1800);setBots(sp,2);sp.$('#bStart').click();await sleep(4700);
   const M1=sp.w.__ff.game;check(M1&&M1.online&&M1.boards.length===3,'solo grudge: online match vs 2 bots');
   M1.player.die();await sleep(300);M1.boards.filter(b=>b!==M1.player)[0].die();await sleep(1600);
   check(M1.over&&!sp.$('#ovEnd').hidden,'solo grudge: end screen');
   sp.$('#bAgain').click();await sleep(200);check(/Starting/.test(sp.$('#bAgain').textContent),'solo grudge: button says it is starting ('+sp.$('#bAgain').textContent+')');
   const k0=sp.$('#gmList').innerHTML;await sleep(600);check(sp.$('#gmList').innerHTML===k0,'solo grudge: the cook list is not rebuilt every tick (no flicker)');
   await sleep(5200);const M2=sp.w.__ff.game;
   check(M2&&M2!==M1&&M2.online&&M2.boards.length===3,'solo grudge: next round starts with the bots, no second cook needed');
   check(sp.errors.length===0,'solo grudge: no script errors');try{sp.w.close()}catch(e){}}
  // open rooms: a host's room shows up for everyone else, who can join it with a tap
  {const oh=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
   oh.$('#nameIn').value='Lister';oh.$('#nameIn').dispatchEvent(new oh.w.Event('input'));
   oh.$('#bOnline').click();oh.$('#bCreate').click();await sleep(1800);
   const code=oh.$('#roomCode').textContent;oh.$('#lobbyVariants [data-v="stack"]').click();await sleep(300);
   const vw=page('https://foodfight.grudgematchgames.com/');await sleep(2400);
   const card=()=>vw.$(`#roomList .room[data-code="${code}"]`);
   check(!vw.$('#roomsLive').hidden&&/open to join/.test(vw.$('#roomsLive').textContent),'open rooms: the start screen says rooms are open ('+vw.$('#roomsLive').textContent+')');
   vw.$('#bOnline').click();await sleep(100);
   check(card()&&/Lister's room/.test(card().textContent)&&/Snack Stack/.test(card().textContent)&&/1 cook/.test(card().textContent),'open rooms: the Play screen lists the host, mode and cooks');
   card().click();await sleep(1200);
   check(!vw.$('#ovLobby').hidden&&vw.$('#roomCode').textContent===code&&oh.w.document.querySelectorAll('#seats li:not(.bot):not(.empty)').length===2,'open rooms: tapping a room joins it');
   await sleep(300);const v2=page('https://foodfight.grudgematchgames.com/');await sleep(2400);v2.$('#bOnline').click();await sleep(100);
   const c2=v2.$(`#roomList .room[data-code="${code}"]`);check(c2&&/2 cooks/.test(c2.textContent),'open rooms: the cook count updates');
   oh.$('#pubRoom').click();await sleep(300);
   check(!v2.$(`#roomList .room[data-code="${code}"]`),'open rooms: the host can make the room private');
   oh.$('#pubRoom').click();await sleep(300);check(!!v2.$(`#roomList .room[data-code="${code}"]`),'open rooms: ...and list it again');
   oh.$('#bLeave').click();await sleep(1500);
   const after=v2.$(`#roomList .room[data-code="${code}"]`);check(after&&!/Lister/.test(after.textContent),'open rooms: the room stays listed under the new host after the old one leaves');
   vw.$('#bLeave').click();await sleep(800);
   check(!v2.$(`#roomList .room[data-code="${code}"]`),'open rooms: an empty room drops off the list');
   const ad=page('https://foodfight.grudgematchgames.com/#admin=waffle-pickle-waffle-29');await sleep(2500);
   ad.$('#bOnline').click();ad.$('#bCreate').click();await sleep(1800);ad.$('#lobbyVariants [data-v="blocks"]').click();await sleep(300);
   check(!v2.$(`#roomList .room[data-code="${ad.$('#roomCode').textContent}"]`),'open rooms: admin-only mode rooms stay join-by-code');
   ad.$('#bLeave').click();await sleep(300);
   [oh,vw,v2,ad].forEach(pg=>{try{pg.w.close()}catch(e){}});
   check(oh.errors.length+vw.errors.length+v2.errors.length+ad.errors.length===0,'open rooms: no script errors');}
  // the plug-in modes (admin-only for now): each one runs in practice and online, with nothing thrown
  for(const v of ['slurp','buffet','mold','pancake','merge','conveyor','pest']){
    const mp=page('https://foodfight.grudgematchgames.com/#admin=waffle-pickle-waffle-29');await sleep(2500);
    check(!!mp.$(`#variants [data-v="${v}"]`),`${v}: shows in the mode list for the admin`);
    mp.$(`#variants [data-v="${v}"]`).click();mp.$('#mode [data-size="4"]').click();mp.$('.diff [data-d="1"]').click();await sleep(5600);
    const MG=mp.w.__ff.game;check(MG&&MG.variant===v&&MG.boards.length===4&&MG.boards.every(b=>b.constructor===mp.w.FFEngine.BOARD_TYPES[v]),`${v}: practice brawl starts with the mode's boards`);
    if(MG){MG.player.isBot=true;for(let i=0;i<60*25&&!MG.over;i++)MG.step();await sleep(300);
      check(MG.player.score>0||MG.player.dead||MG.over,`${v}: a bot in your seat plays it (score ${MG.player.score})`);
      check(mp.$('#sThirdL').textContent!=='Heat',`${v}: HUD shows the mode's own stat (${mp.$('#sThirdL').textContent})`);
      if(!MG.over){MG.player.die();for(let i=0;i<10;i++)MG.step();await sleep(250);check(!mp.$('#outToast').hidden||MG.over,`${v}: knocked out → watch the rest`)}}
    if(MG&&MG.over){await sleep(900);check(!mp.$('#eWin').hidden&&mp.$('#eWinName').textContent.length>0&&!mp.$('#eStand').hidden,`${v}: end screen shows the winner and standings (${mp.$('#eWinName').textContent})`)}
    mp.errors.slice(0,3).forEach(e=>console.log('  ',e));
    check(mp.errors.length===0,`${v}: no script errors in practice`);
    const oh=page('https://foodfight.grudgematchgames.com/#admin=waffle-pickle-waffle-29');await sleep(2500);
    oh.$('#nameIn').value='Host'+v;oh.$('#nameIn').dispatchEvent(new oh.w.Event('input'));
    oh.$('#bOnline').click();oh.$('#bCreate').click();await sleep(1800);   // a clashing code is re-rolled after 0.7s (maybe twice)
    oh.$(`#lobbyVariants [data-v="${v}"]`).click();await sleep(100);
    const og=page('https://foodfight.grudgematchgames.com/?room='+oh.$('#roomCode').textContent);await sleep(2600);
    setBots(oh,1);oh.$('#bStart').click();await sleep(4800);
    for(let i=0;i<48;i++){const h=oh.w.__ff.game,g=og.w.__ff.game;if(h&&g&&h.variant===v&&g.variant===v&&h.mid===g.mid)break;await sleep(250)}
    const H=oh.w.__ff.game,Gg=og.w.__ff.game;
    check(H&&Gg&&H.variant===v&&Gg.variant===v&&H.mid===Gg.mid,`${v} online: both phones in the match`+(H&&Gg?` (${H.variant}/${Gg.variant})`:''));
    if(H&&Gg&&Gg.variant===v){await sleep(900);const rem=Gg.byId(H.player.id);
      check(rem&&rem.remote&&rem.lastSnap>0&&(rem.ms||rem.g.flat().some(Boolean)),`${v} online: guest sees the host's board`);
      const inc0=Gg.player.incoming();H.player.sendJunk(6);await sleep(1300);
      check(Gg.player.incoming()>inc0||Gg.player.dead||Gg.over,`${v} online: trash crosses to the guest`);
      Gg.player.die();await sleep(800);H.player.die();await sleep(1500);
      check(H.over&&Gg.over,`${v} online: match ends on both phones`);}
    oh.errors.concat(og.errors).slice(0,3).forEach(e=>console.log('  ',e));
    check(oh.errors.length===0&&og.errors.length===0,`${v} online: no script errors`);
    [mp,oh,og].forEach(pg=>{try{pg.w.close()}catch(e){}});
  }
  host.errors.concat(guest.errors,solo.errors).slice(0,5).forEach(e=>console.log('  ',e));
  check(host.errors.length===0&&guest.errors.length===0&&solo.errors.length===0,'no script errors');
  process.exit();
})();
