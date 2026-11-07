// Food Fight online layer — Supabase Realtime (broadcast + presence). No database tables needed.
// One channel per room ("ff:ABCD"). Presence = who is in the room; broadcast = game messages.
window.FFNet=(function(){
  const cfg=window.FF_CONFIG||{};
  const enabled=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase&&window.supabase.createClient);
  let client=null,ch=null,me=null,code=null,joinedAt=0,state='lobby',members=[];
  const handlers={};

  function init(){
    if(!client)client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},   // signed-in Grudge Match accounts stay signed in
      realtime:{params:{eventsPerSecond:30}}
    });
  }
  function makeCode(){return String(100+Math.floor(Math.random()*900))}  // 3 digits, quick to read out and type
  // Presence briefly drops a member while they update their status (lobby -> playing -> lobby), so someone who
  // vanished in the last few seconds still counts as here. Without this a match could start in that gap and
  // give their seat to a bot.
  const GRACE=4500;let seen=new Map(),graceT=null;
  function readMembers(){
    if(!ch)return[];
    const st=ch.presenceState(),list=[],now=Date.now(),here=new Set();
    for(const k in st){const p=st[k]&&st[k][0];if(p&&p.id&&!here.has(p.id)){here.add(p.id);const m={id:p.id,name:String(p.name||'Cook').slice(0,14),av:String(p.av||''),joinedAt:+p.joinedAt||0,state:p.state||'lobby',mode:String(p.mode||'classic')};seen.set(p.id,{m,at:now});list.push(m)}}
    seen.forEach((v,id)=>{if(here.has(id))return;if(now-v.at<GRACE)list.push(Object.assign({},v.m,{stale:true}));else seen.delete(id)});
    list.sort((a,b)=>a.joinedAt-b.joinedAt||(a.id<b.id?-1:1));
    // someone is in their grace period: look again once it runs out
    clearTimeout(graceT);if(list.some(m=>m.stale))graceT=setTimeout(()=>{members=readMembers();if(handlers.members)handlers.members(members)},GRACE+50);
    return list;
  }
  function present(id){if(!ch)return false;const st=ch.presenceState();for(const k in st){const p=st[k]&&st[k][0];if(p&&p.id===id)return true}return false}
  // ---- connection health: a room channel can drop after joining (Wi-Fi to cellular, tunnel, server blip).
  // Report it ('lost' / 'back') so the game can say so, let supabase-js try to rejoin by itself, and if it hasn't
  // come back within REJOIN_MS, open a fresh channel for the same room (same joinedAt, so host order is kept).
  const REJOIN_MS=8000,RETRY_MS=5000;
  let gen=0,lostAt=0,retryT=null;
  function connEvent(s){if(handlers.conn)try{handlers.conn(s)}catch(e){}}
  function open(){
    const my=++gen,c=client.channel('ff:'+code,{config:{broadcast:{self:false,ack:false},presence:{key:me.id}}});
    ch=c;
    c.on('broadcast',{event:'m'},({payload})=>{if(payload&&handlers.message)handlers.message(payload)});
    c.on('presence',{event:'sync'},()=>{members=readMembers();if(handlers.members)handlers.members(members)});
    c.on('presence',{event:'leave'},({leftPresences})=>{(leftPresences||[]).forEach(p=>{if(p&&p.id&&handlers.left)handlers.left(p.id)})});
    return new Promise((resolve,reject)=>{
      let first=true;
      const to=setTimeout(()=>{if(first){first=false;reject(new Error('TIMED_OUT'))}},10000);
      c.subscribe(async status=>{
        if(my!==gen)return;   // an older channel (left, or replaced by a rejoin)
        if(status==='SUBSCRIBED'){
          if(first){first=false;clearTimeout(to);await track();resolve();return}
          if(lostAt){lostAt=0;clearTimeout(retryT);try{await track()}catch(e){}connEvent('back')}   // supabase-js rejoined on its own
        }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          if(first){first=false;clearTimeout(to);reject(new Error(status));return}
          if(!lostAt){lostAt=Date.now();connEvent('lost');clearTimeout(retryT);retryT=setTimeout(rejoin,REJOIN_MS)}
        }
      });
    });
  }
  async function rejoin(){
    if(!code||!lostAt)return;
    const old=ch;gen++;   // ignore anything the old channel says from here on
    if(old)try{await client.removeChannel(old)}catch(e){}
    if(!code||!lostAt)return;   // left the room meanwhile
    try{await open();lostAt=0;connEvent('back')}
    catch(e){if(code&&lostAt){clearTimeout(retryT);retryT=setTimeout(rejoin,RETRY_MS)}}
  }
  async function join(roomCode,profile){
    if(!enabled)throw new Error('offline');
    init();await leave();
    code=String(roomCode).toUpperCase();me=profile;joinedAt=Date.now();state='lobby';seen=new Map();
    await open();
    return code;
  }
  function track(){if(ch&&me)return ch.track({id:me.id,name:me.name,av:me.av||'',mode:me.mode||'classic',joinedAt,state})}
  function setProfile(p){if(me)Object.assign(me,p);return track()}
  function setState(s){state=s;return track()}
  function send(payload){if(ch)ch.send({type:'broadcast',event:'m',payload}).catch(()=>{})}
  // ---- open rooms: every host lists their room on one shared channel; anyone can watch the list ----
  let dir=null,dirReady=false,dirInfo=null,dirCbs=[];
  const dirKey='w'+Math.random().toString(36).slice(2,10);
  function readRooms(){
    if(!dir)return[];
    const st=dir.presenceState(),list=[],seen=new Set();
    for(const k in st){const p=st[k]&&st[k][0];if(!p||!/^\d{3,5}$/.test(String(p.code||''))||seen.has(p.code))continue;seen.add(p.code);
      list.push({code:String(p.code),host:String(p.host||'Cook').slice(0,14),av:String(p.av||''),mode:String(p.mode||'classic'),n:Math.max(1,Math.min(8,p.n|0)),playing:!!p.playing,at:+p.at||0})}
    list.sort((a,b)=>a.playing-b.playing||b.at-a.at);
    return list;
  }
  function emitRooms(){const l=readRooms();dirCbs.forEach(f=>{try{f(l)}catch(e){}})}
  function openDir(){
    if(dir||!enabled)return;init();
    dir=client.channel('ff:rooms',{config:{broadcast:{self:false,ack:false},presence:{key:dirKey}}});
    dir.on('presence',{event:'sync'},emitRooms);
    dir.subscribe(status=>{if(status==='SUBSCRIBED'){dirReady=true;if(dirInfo)dir.track(dirInfo).catch(()=>{});emitRooms()}});
  }
  function watchRooms(cb){if(!enabled)return;if(cb&&!dirCbs.includes(cb))dirCbs.push(cb);openDir();if(dirReady)emitRooms()}
  // host: put this room on the list (or update it). Only sends when something changed
  function listRoom(info){
    const k=JSON.stringify(info);if(dirInfo&&JSON.stringify(dirInfo)===k)return;
    dirInfo=info;openDir();if(dirReady)dir.track(info).catch(()=>{});
  }
  function unlistRoom(){if(!dirInfo)return;dirInfo=null;if(dir&&dirReady)dir.untrack().catch(()=>{})}
  async function leave(){
    const c=ch;ch=null;members=[];code=null;seen=new Map();clearTimeout(graceT);
    gen++;lostAt=0;clearTimeout(retryT);   // our own leave is not a lost connection
    if(c){try{await c.untrack()}catch(e){}try{await client.removeChannel(c)}catch(e){}}
  }
  return {
    enabled,makeCode,join,leave,send,setState,setProfile,present,watchRooms,listRoom,unlistRoom,rooms:readRooms,
    client(){init();return client},
    on(h){Object.assign(handlers,h)},
    get members(){return members},get code(){return code},get me(){return me},get lost(){return lostAt>0}
  };
})();
