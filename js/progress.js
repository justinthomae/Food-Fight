// Food Fight progress: cook level, unlocks, titles, emotes, and the daily challenge schedule.
// XP is granted only by the server (ff_submit_score in Supabase); this file just shows it and works out
// what a level unlocks. Players who had already played before levels existed keep every mode, fighter
// and kitchen they had ("veteran"); titles and emotes are new and go by level for everyone.
(function(root){
  'use strict';
  // level n starts at 100 * n * (n - 1) / 2 XP: 1: 0, 2: 100, 3: 300, 4: 600, 5: 1000, 6: 1500 ...
  const xpFor=n=>100*n*(n-1)/2;
  const levelOf=xp=>Math.max(1,Math.floor((1+Math.sqrt(1+8*Math.max(0,+xp||0)/100))/2));

  const STARTER_MODES=['classic','stack','shot','slurp'];
  const MODE_LV={buffet:2,order:2,conveyor:3,boss:3,pancake:4,merge:4,mold:5,pest:5};
  const STARTER_FIGHTERS=['bun','sprinkles','crunch','slice'];
  const FIGHTER_LV={fudge:2,splat:4,guac:6,glaze:8};
  const KITCHEN_LV={american:3,mexican:5,italian:7,japanese:9,indian:11,asian:13};   // Farmers Market is the starter
  const TITLES=[[1,'Line Cook'],[3,'Prep Cook'],[5,'Sous Chef'],[8,'Grill Master'],[10,'Head Chef'],[15,'Top Dog'],
    [20,'Footlong Legend'],[30,'Chili-Cheese Champion']];
  // quick lines you can send in an online match (index is what goes over the wire)
  const EMOTES=[{t:'GG!',lv:1},{t:'Ketchup!',lv:1},{t:'Sizzlin’!',lv:1},{t:'Top dog!',lv:1},{t:'You got relished.',lv:2},
    {t:'Mild sauce energy.',lv:4},{t:'Bun voyage!',lv:6},{t:'Hot diggity dog!',lv:9},{t:'Frank-ly, embarrassing.',lv:12},
    {t:'Chili-cheese champion!',lv:20}];

  const KEY='ff-progress',DKEY='ff-daily';
  const load=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
  const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
  let st=load(KEY);
  if(!st){
    // first run of this version: anyone who already has scores or saved settings keeps all current content
    let played=false;try{const sc=JSON.parse(localStorage.getItem('ff-scores')||'{}');played=Object.keys(sc).some(k=>(sc[k]||[]).length)||!!localStorage.getItem('ff-prefs')}catch(e){}
    st={xp:0,veteran:played,at:0};save(KEY,st);
  }
  const listeners=new Set();
  const emit=ev=>listeners.forEach(f=>{try{f(ev)}catch(e){}});

  const level=()=>levelOf(st.xp);
  function title(lv){lv=lv||level();let t=TITLES[0][1];TITLES.forEach(([n,name])=>{if(lv>=n)t=name});return t}
  function bar(){const lv=level(),a=xpFor(lv),b=xpFor(lv+1);return {level:lv,xp:st.xp,into:st.xp-a,need:b-a,pct:Math.max(0,Math.min(1,(st.xp-a)/(b-a)))}}
  // the level that unlocks something (0 = always open)
  function lockLevel(kind,key){
    if(kind==='mode'){if(st.veteran||STARTER_MODES.includes(key))return 0;return MODE_LV[key]||0}
    if(kind==='fighter'){if(st.veteran||STARTER_FIGHTERS.includes(key))return 0;return FIGHTER_LV[key]||0}
    if(kind==='kitchen'){if(st.veteran||key==='market')return 0;return KITCHEN_LV[key]||0}
    if(kind==='emote'){const e=EMOTES[key];return e?e.lv:99}
    return 0;
  }
  const unlocked=(kind,key)=>level()>=lockLevel(kind,key);
  function rewardsAt(lv,names){
    names=names||{};const out=[];const nm=(k,m)=>(names[k]&&names[k][m])||m;
    const vet=st.veteran;
    if(!vet)Object.keys(MODE_LV).forEach(m=>{if(MODE_LV[m]===lv)out.push({kind:'mode',key:m,text:`New mode: ${nm('mode',m)}`})});
    if(!vet)Object.keys(FIGHTER_LV).forEach(f=>{if(FIGHTER_LV[f]===lv)out.push({kind:'fighter',key:f,text:`New fighter: ${nm('fighter',f)}`})});
    if(!vet)Object.keys(KITCHEN_LV).forEach(k=>{if(KITCHEN_LV[k]===lv)out.push({kind:'kitchen',key:k,text:`New kitchen: ${nm('kitchen',k)}`})});
    TITLES.forEach(([n,t])=>{if(n===lv&&n>1)out.push({kind:'title',key:t,text:`New title: ${t}`})});
    EMOTES.forEach((e,i)=>{if(e.lv===lv&&lv>1)out.push({kind:'emote',key:i,text:`New emote: “${e.t}”`})});
    return out;
  }
  function nextReward(names){for(let lv=level()+1;lv<=40;lv++){const r=rewardsAt(lv,names);if(r.length)return {level:lv,rewards:r}}return null}

  // the server's answer after a game ({xp, xp_total}) or a progress fetch ({xp_total})
  function apply(r,names){
    if(!r||r.xp_total==null)return null;
    const before=level(),total=Math.max(0,+r.xp_total|0);
    st.xp=total;st.at=Date.now();save(KEY,st);
    const after=level(),ups=[];
    for(let lv=before+1;lv<=after;lv++)ups.push(...rewardsAt(lv,names));
    const ev={gained:Math.max(0,+r.xp|0),level:after,levelUp:after>before?after:0,rewards:ups};
    emit(ev);return ev;
  }
  async function refresh(sb,deviceId,names){
    if(!sb||!deviceId)return null;
    try{const {data,error}=await sb.rpc('ff_my_progress',{p_device_id:deviceId});if(error||!data||!data.ok)return null;return apply({xp_total:data.xp_total,xp:0},names)}catch(e){return null}
  }
  // signed in: this device's progress joins the account (and the account's other devices count here)
  async function link(sb,deviceId,names){
    if(!sb||!deviceId)return null;
    try{const {data,error}=await sb.rpc('ff_link_device',{p_device_id:deviceId});if(error||!data||!data.ok)return null;return apply({xp_total:data.xp_total,xp:0},names)}catch(e){return null}
  }

  // ---- daily challenge: the same match for everyone on a UTC day ----
  const DAILY_POOL=['classic','stack','shot','slurp','buffet','order','conveyor','pancake','merge','mold','pest'];
  const dayKey=(d)=>{d=d||new Date();return d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,'0')+String(d.getUTCDate()).padStart(2,'0')};
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  function daily(d,available){
    const key=dayKey(d),pool=DAILY_POOL.filter(v=>!available||available.includes(v));
    const h=hash('ff-daily-'+key);
    return {key,variant:pool[h%pool.length],mode:'brawl',size:4,d:1,seed:hash('seed-'+key)&0x7fffffff};
  }
  function dailyState(){
    const s=load(DKEY)||{last:'',streak:0,best:{}};const today=dayKey();
    const y=new Date(Date.now()-864e5),yesterday=dayKey(y);
    const streak=s.last===today||s.last===yesterday?s.streak:0;
    return {today,played:s.last===today,best:s.best[today]==null?null:s.best[today],streak};
  }
  function recordDaily(key,score){
    const s=load(DKEY)||{last:'',streak:0,best:{}};
    if(key!==dayKey())return dailyState();
    if(s.last!==key){const y=dayKey(new Date(Date.now()-864e5));s.streak=s.last===y?(s.streak|0)+1:1;s.last=key}
    s.best[key]=Math.max(s.best[key]||0,score|0);
    const keep={};Object.keys(s.best).sort().slice(-14).forEach(k=>{keep[k]=s.best[k]});s.best=keep;   // two weeks is plenty
    save(DKEY,s);return dailyState();
  }
  function msToNextDay(){const n=new Date();return Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1)-n.getTime()}

  root.FFProgress={levelOf,xpFor,level,title,bar,lockLevel,unlocked,rewardsAt,nextReward,apply,refresh,link,
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    get veteran(){return !!st.veteran},EMOTES,TITLES,STARTER_MODES,MODE_LV,
    daily,dailyState,recordDaily,dayKey,msToNextDay,
    _reset(v){st=Object.assign({xp:0,veteran:false,at:0},v||{});save(KEY,st)}};
})(typeof window!=='undefined'?window:globalThis);
