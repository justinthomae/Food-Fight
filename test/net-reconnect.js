// Room channel drops after joining: FFNet reports 'lost', then 'back' (supabase-js rejoin or a fresh channel),
// keeps the room and joinedAt, and never reports a drop for our own leave.
// Usage: node test/net-reconnect.js
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','js','net.js'),'utf8');
let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;console.log('PASS '+m)}else{fail++;console.log('FAIL '+m)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// fake supabase-js: channels whose subscribe callback we can drive by hand
const made=[];
function fakeChannel(name){
  const c={name,cb:null,tracked:[],removed:false,
    on(){return c},subscribe(cb){c.cb=cb;setTimeout(()=>{if(!c.removed&&c.autoOk!==false)cb('SUBSCRIBED')},5);return c},
    track(p){c.tracked.push(p);return Promise.resolve()},untrack(){return Promise.resolve()},
    presenceState(){return{}},send(){return Promise.resolve()}};
  made.push(c);return c;
}
let failNext=0;   // make the next N fresh channels fail to subscribe
const client={channel(n){const c=fakeChannel(n);if(failNext>0){failNext--;c.autoOk=false;setTimeout(()=>c.cb&&c.cb('CHANNEL_ERROR'),5)}return c},
  removeChannel(c){c.removed=true;if(c.cb)c.cb('CLOSED');return Promise.resolve()}};
const win={FF_CONFIG:{supabaseUrl:'x',supabaseAnonKey:'y'},supabase:{createClient:()=>client}};
vm.runInNewContext(src,{window:win,setTimeout,clearTimeout,console,Promise,Date,Map,Set,String,Math,JSON});
const NET=win.FFNet,events=[];
NET.on({conn:s=>events.push(s)});

(async()=>{
  await NET.join('605',{id:'u1',name:'Ann'});
  const first=made[made.length-1],joinedAt=first.tracked[0].joinedAt;
  ok(events.length===0&&!NET.lost,'a normal join reports nothing');

  // 1) drop, supabase-js rejoins by itself
  first.cb('CHANNEL_ERROR');
  ok(events.join()==='lost'&&NET.lost,'a drop after joining reports lost');
  first.cb('CHANNEL_ERROR');
  ok(events.length===1,'repeated errors report lost once');
  first.cb('SUBSCRIBED');await sleep(5);
  ok(events.join()==='lost,back'&&!NET.lost,'supabase-js rejoining reports back');
  ok(first.tracked.length===2&&first.tracked[1].joinedAt===joinedAt,'presence is re-tracked with the same joinedAt (host order kept)');

  // 2) drop that doesn't heal: a fresh channel for the same room after ~8 s, retrying if that fails too
  events.length=0;failNext=1;
  first.cb('TIMED_OUT');
  ok(events.join()==='lost','second drop reports lost');
  await sleep(8200);
  ok(first.removed,'the dead channel is removed after the wait');
  await sleep(5300);
  const fresh=made[made.length-1];
  ok(fresh!==first&&fresh.name==='ff:605','a fresh channel opens for the same room');
  ok(events.join()==='lost,back'&&!NET.lost&&NET.code==='605','after a failed retry the next one succeeds and reports back');
  ok(fresh.tracked[0].joinedAt===joinedAt,'the fresh channel keeps the original joinedAt');
  first.cb('SUBSCRIBED');await sleep(5);
  ok(events.length===2,'the replaced channel can no longer report anything');

  // 3) our own leave is not a drop
  events.length=0;
  await NET.leave();await sleep(20);
  ok(events.length===0&&!NET.lost,'leaving the room reports nothing');
  await sleep(8500);
  ok(made.length===made.filter(c=>c.removed||c===made[made.length-1]).length&&events.length===0,'no rejoin happens after leaving');

  console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})();
