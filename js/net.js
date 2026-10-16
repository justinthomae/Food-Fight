// Food Fight online layer — Supabase Realtime (broadcast + presence). No database tables needed.
// One channel per room ("ff:ABCD"). Presence = who is in the room; broadcast = game messages.
window.FFNet=(function(){
  const cfg=window.FF_CONFIG||{};
  const enabled=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase&&window.supabase.createClient);
  let client=null,ch=null,me=null,code=null,joinedAt=0,state='lobby',members=[];
  const handlers={};
  const ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZ';

  function init(){
    if(!client)client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
      auth:{persistSession:false},realtime:{params:{eventsPerSecond:30}}
    });
  }
  function makeCode(){let s='';for(let i=0;i<4;i++)s+=ALPHA[Math.floor(Math.random()*ALPHA.length)];return s}
  function readMembers(){
    if(!ch)return[];
    const st=ch.presenceState(),list=[];
    for(const k in st){const p=st[k]&&st[k][0];if(p&&p.id)list.push({id:p.id,name:String(p.name||'Cook').slice(0,14),av:String(p.av||''),joinedAt:+p.joinedAt||0,state:p.state||'lobby'})}
    list.sort((a,b)=>a.joinedAt-b.joinedAt||(a.id<b.id?-1:1));
    return list;
  }
  async function join(roomCode,profile){
    if(!enabled)throw new Error('offline');
    init();await leave();
    code=String(roomCode).toUpperCase();me=profile;joinedAt=Date.now();state='lobby';
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
  function track(){if(ch&&me)return ch.track({id:me.id,name:me.name,av:me.av||'',joinedAt,state})}
  function setProfile(p){if(me)Object.assign(me,p);return track()}
  function setState(s){state=s;return track()}
  function send(payload){if(ch)ch.send({type:'broadcast',event:'m',payload}).catch(()=>{})}
  async function leave(){
    const c=ch;ch=null;members=[];code=null;
    if(c){try{await c.untrack()}catch(e){}try{await client.removeChannel(c)}catch(e){}}
  }
  return {
    enabled,makeCode,join,leave,send,setState,setProfile,
    client(){init();return client},
    on(h){Object.assign(handlers,h)},
    get members(){return members},get code(){return code},get me(){return me}
  };
})();
