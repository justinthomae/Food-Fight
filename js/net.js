// Food Fight online layer — Supabase Realtime (broadcast + presence). No database tables needed.
// One channel per room ("ff:ABCD"). Presence = who is in the room; broadcast = game messages.
window.FFNet=(function(){
  const cfg=window.FF_CONFIG||{};
  const enabled=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase&&window.supabase.createClient);
  let client=null,ch=null,me=null,code=null,joinedAt=0,state='lobby',members=[];
  const handlers={};

  function init(){
    if(!client)client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}   // signed-in Grudge Match accounts stay signed in,realtime:{params:{eventsPerSecond:30}}
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
  async function join(roomCode,profile){
    if(!enabled)throw new Error('offline');
    init();await leave();
    code=String(roomCode).toUpperCase();me=profile;joinedAt=Date.now();state='lobby';seen=new Map();
    ch=client.channel('ff:'+code,{config:{broadcast:{self:false,ack:false},presence:{key:profile.id}}});
    ch.on('broadcast',{event:'m'},({payload})=>{if(payload&&handlers.message)handlers.message(payload)});
    ch.on('presence',{event:'sync'},()=>{members=readMembers();if(handlers.members)handlers.members(members)});
    ch.on('presence',{event:'leave'},({leftPresences})=>{(leftPresences||[]).forEach(p=>{if(p&&p.id&&handlers.left)handlers.left(p.id)})});
    await new Promise((resolve,reject)=>{
      let done=false;
      const to=setTimeout(()=>{if(!done){done=true;reject(new Error('TIMED_OUT'))}},10000);
      ch.subscribe(async status=>{
        if(done)return;
        if(status==='SUBSCRIBED'){done=true;clearTimeout(to);await track();resolve()}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){done=true;clearTimeout(to);reject(new Error(status))}
      });
    });
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
    if(c){try{await c.untrack()}catch(e){}try{await client.removeChannel(c)}catch(e){}}
  }
  return {
    enabled,makeCode,join,leave,send,setState,setProfile,present,watchRooms,listRoom,unlistRoom,rooms:readRooms,
    client(){init();return client},
    on(h){Object.assign(handlers,h)},
    get members(){return members},get code(){return code},get me(){return me}
  };
})();
