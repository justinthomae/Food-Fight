// End-to-end smoke test: two players in two headless pages, joined through a fake Supabase Realtime bus.
// Usage: NODE_PATH=<dir with jsdom> node test/dom-smoke.js
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const scripts=['js/engine.js','js/net.js','js/scores.js','js/app.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8'));

// ---- fake Supabase Realtime: one shared bus per channel name ----
const buses={},rpcLog=[],rpcRows=[{mode:'brawl',diff:1,name:'Top Chef',score:99999,device:'d-other-device'}];
function fakeSupabase(){
  return {createClient(){return {
    channel(name,opts){
      const bus=buses[name]||(buses[name]={members:new Map(),chans:new Set()});
      const key=opts.config.presence.key,h={broadcast:[],sync:[],leave:[]};
      const ch={
        on(type,f,cb){if(type==='broadcast')h.broadcast.push(cb);else h[f.event].push(cb);return ch},
        subscribe(cb){bus.chans.add(ch);setTimeout(()=>cb('SUBSCRIBED'),5);return ch},
        async track(p){bus.members.set(key,p);bus.chans.forEach(c=>c._sync())},
        async untrack(){const p=bus.members.get(key);bus.members.delete(key);bus.chans.forEach(c=>{if(c!==ch)c._leave(p);c._sync()})},
        presenceState(){const o={};bus.members.forEach((p,k)=>o[k]=[p]);return o},
        send({payload}){const copy=JSON.parse(JSON.stringify(payload));bus.chans.forEach(c=>{if(c!==ch)setTimeout(()=>c._msg(copy),3)});return Promise.resolve('ok')},
        _sync(){setTimeout(()=>h.sync.forEach(cb=>cb()),1)},
        _leave(p){setTimeout(()=>h.leave.forEach(cb=>cb({leftPresences:[p]})),1)},
        _msg(p){h.broadcast.forEach(cb=>cb({payload:p}))},
        _close(){bus.chans.delete(ch)}
      };
      return ch;
    },
    async removeChannel(ch){ch._close()},
    async rpc(fn,a){
      if(fn==='ff_submit_score'){rpcLog.push(a);const better=rpcRows.filter(r=>r.mode===a.p_mode&&r.score>a.p_score).length;rpcRows.push({mode:a.p_mode,diff:a.p_difficulty,name:a.p_name,score:a.p_score,device:a.p_device_id});return{data:{ok:true,rank_day:better+1,rank_all:better+1,personal_best:true},error:null}}
      if(fn==='ff_leaderboard'){const rows=rpcRows.filter(r=>r.mode===a.p_mode).sort((x,y)=>y.score-x.score).map((r,i)=>({rank:i+1,name:r.name,score:r.score,max_chain:2,won:true,created_at:new Date().toISOString(),mine:r.device===a.p_device_id}));return{data:rows,error:null}}
      return{data:null,error:{message:'unknown'}};
    }
  }}};
}
const ctxProxy=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):(typeof k==='string'?(t[k]!==undefined?t[k]:()=>{}):undefined),set:(t,k,v)=>{t[k]=v;return true}});
function page(url){
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,errors=[];
  w.addEventListener('error',e=>errors.push(e.message));
  w.HTMLCanvasElement.prototype.getContext=()=>ctxProxy;
  w.ResizeObserver=class{observe(){}};
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.AudioContext=undefined;
  w.supabase=fakeSupabase();
  w.FF_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k'};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{}}});
  w.crypto.randomUUID=()=>'id-'+Math.random().toString(36).slice(2,9);
  w.Element.prototype.getBoundingClientRect=function(){return{left:0,top:0,right:300,bottom:600,width:300,height:600}};
  // browsers share one global scope across classic <script> tags; one eval reproduces that
  try{w.eval(scripts.join('\n;\n'))}catch(e){errors.push(String(e.stack||e))}
  return {w,$:s=>w.document.querySelector(s),errors};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vis=(p,id)=>!p.$(id).hidden;
const check=(cond,msg)=>{console.log((cond?'PASS ':'FAIL ')+msg);if(!cond)process.exitCode=1};

(async()=>{
  // practice smoke
  const solo=page('https://foodfight.grudgematchgames.com/');
  solo.errors.forEach(e=>console.log('ERR',e.slice(0,400)));
  check(vis(solo,'#ovLoad'),'loading screen shows first');
  await sleep(2400);
  check(vis(solo,'#ovStart'),'start screen shows after loading');
  check(solo.w.document.querySelectorAll('#picker .pick').length===4,'fighter picker offers 4 fighters');
  solo.$('#picker [data-av="crunch"]').click();
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).av==='crunch','picked fighter is saved');
  check(!solo.$('#bOnline').disabled,'online button enabled when configured');
  solo.$('.pal[data-p="redgreen"]').click();
  check(solo.$('.pal[data-p="redgreen"]').getAttribute('aria-pressed')==='true','palette picker selects red-green');
  solo.$('#theme [data-t="day"]').click();
  check(solo.w.document.documentElement.getAttribute('data-ff-theme')==='day','day theme applied');
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).palette==='redgreen','prefs saved');
  check(JSON.parse(solo.w.localStorage.getItem('ff-prefs')).art===undefined||solo.$('#art [data-a="food"]').getAttribute('aria-pressed')==='true','food art is the default');
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
  {const SG=solo.w.__ff.game;SG.frame=60*40;SG.player.score=4321;SG.player.die();}
  await sleep(900);
  check(vis(solo,'#ovEnd'),'end screen after topping out');
  check(rpcLog.length===1&&rpcLog[0].p_score===4321&&rpcLog[0].p_mode==='brawl'&&rpcLog[0].p_duration_s===40,'score submitted with mode and duration');
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

  // online: host creates, guest joins via link
  const host=page('https://foodfight.grudgematchgames.com/');
  await sleep(2400);
  host.$('#nameIn').value='Justin';host.$('#nameIn').dispatchEvent(new host.w.Event('input'));
  host.$('#bOnline').click();host.$('#bCreate').click();
  await sleep(100);
  check(vis(host,'#ovLobby'),'host lands in lobby');
  const code=host.$('#roomCode').textContent;
  check(/^[A-Z]{4}$/.test(code),'room code '+code);
  const guest=page('https://foodfight.grudgematchgames.com/?room='+code);
  await sleep(2500);
  check(vis(guest,'#ovLobby'),'guest auto-joins from invite link');
  check(host.w.document.querySelectorAll('#seats li:not(.empty):not(.bot)').length===2,'host sees 2 humans seated');
  check(host.$('#bStart').hidden===false&&guest.$('#bStart').hidden===true,'only host has Start');
  check(/Waiting for Justin/.test(guest.$('#lobbyMsg').textContent),'guest sees waiting message');
  host.$('#fill [data-f="0"]').click();
  host.$('#bStart').click();
  await sleep(100);
  check(vis(host,'#ovVs')&&vis(guest,'#ovVs')&&host.w.document.querySelectorAll('#vsStage .duelvs').length===1,'both see the duel match-up screen');
  await sleep(4300);
  check(!vis(host,'#ovVs')&&!vis(guest,'#ovVs'),'count-in finished');
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
  await sleep(1200);
  check(HG.over&&HG.result.won,'host wins when guest leaves');
  check(vis(host,'#ovEnd')&&host.$('#bAgain').textContent==='Back to lobby','host sees end screen with Back to lobby');
  host.$('#bAgain').click();await sleep(50);
  check(vis(host,'#ovLobby'),'host back in lobby');
  check(vis(guest,'#ovStart'),'guest back at start screen');
  // host alone, seats filled with bots
  host.$('#fill [data-f="8"]').click();
  check(host.w.document.querySelectorAll('#seats li.bot').length===7,'lobby previews 7 bots for an 8-cook room');
  host.$('#bStart').click();await sleep(4600);
  const BG=host.w.__ff.game;
  check(BG.boards.length===8&&BG.boards.filter(b=>b.isBot&&!b.remote).length===7,'host runs 7 local bots online');
  check(host.$('#opps').classList.contains('many')&&host.w.document.querySelectorAll('#opps .foe').length===7,'compact strip shows all 7 opponents');
  const f0=BG.frame;await sleep(500);
  check(BG.frame>f0&&!BG.paused,'bot match is running');
  console.log('host errors',host.errors.length,'guest errors',guest.errors.length);
  host.errors.concat(guest.errors,solo.errors).slice(0,5).forEach(e=>console.log('  ',e));
  check(host.errors.length===0&&guest.errors.length===0&&solo.errors.length===0,'no script errors');
  process.exit();
})();
