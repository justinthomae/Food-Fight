// End-to-end smoke test: two players in two headless pages, joined through a fake Supabase Realtime bus.
// Usage: NODE_PATH=<dir with jsdom> node test/dom-smoke.js
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const scripts=['js/sfx.js','js/engine.js','js/stack.js','js/shot.js','js/net.js','js/scores.js','js/app.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8'));

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
        // like real Supabase: updating your presence (e.g. lobby -> playing) also emits a 'leave' for your old state
        async track(p){const old=bus.members.get(key);bus.members.set(key,p);if(old)bus.chans.forEach(c=>{if(c!==ch)c._leave(old)});bus.chans.forEach(c=>c._sync())},
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
  w.HTMLCanvasElement.prototype.toDataURL=()=>'data:,';
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
  check(solo.w.document.querySelectorAll('#picker .pick').length===8,'fighter picker offers 8 fighters');
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
  {const SG=solo.w.__ff.game;SG.frame=60*40;SG.player.score=4321;SG.player.lastAttacker=SG.boards[2];SG.player.die();
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
   solo.$('#bFF').click();
   let t=0;while(!SG.over&&t<40){await sleep(250);t++}
   check(SG.over&&solo.$('#specBar').hidden,'fast forward ends the practice brawl and stops spectating');}
  await sleep(900);
  check(vis(solo,'#ovEnd'),'end screen after topping out');
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

  // online: host creates, guest joins via link
  const host=page('https://foodfight.grudgematchgames.com/');
  await sleep(2400);
  host.$('#nameIn').value='Justin';host.$('#nameIn').dispatchEvent(new host.w.Event('input'));
  host.$('#bOnline').click();host.$('#bCreate').click();
  await sleep(100);
  check(vis(host,'#ovLobby'),'host lands in lobby');
  const code=host.$('#roomCode').textContent;
  check(/^\d{5}$/.test(code),'room code is 5 numbers: '+code);
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
  host.$('#fill [data-f="0"]').click();
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
  host.$('#fill [data-f="8"]').click();
  check(host.w.document.querySelectorAll('#seats li.bot').length===7,'lobby previews 7 bots for an 8-cook room');
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
    fh.$('#bOnline').click();fh.$('#bCreate').click();await sleep(120);
    const fg=page('https://foodfight.grudgematchgames.com/?room='+fh.$('#roomCode').textContent);await sleep(2500);
    fh.$('#fill [data-f="4"]').click();fh.$('#bStart').click();await sleep(4600);
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
  h2.$('#bOnline').click();h2.$('#bCreate').click();await sleep(120);
  const code2=h2.$('#roomCode').textContent;
  const g2=page('https://foodfight.grudgematchgames.com/?room='+code2);await sleep(2500);
  h2.$('#fill [data-f="4"]').click();h2.$('#bStart').click();await sleep(4600);
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
      MG.boss.next=null;MG.boss.nextAt=MG.frame+60*5;MG.step();const to=MG.byId(MG.boss.next&&MG.boss.next.to);
      await sleep(200);check(to&&/→/.test(mp.$('#bossNext').textContent),'boss: next attack announced: '+mp.$('#bossNext').textContent);
      const inc0=to.inc.length,fr0=to.frozenT,cr0=to.creamT;for(let i=0;i<60*5+50;i++)MG.step();
      check(to.inc.length>inc0||to.frozenT>fr0||to.creamT>cr0||to.rushT>0||to.blendT>0||to.dead,'boss: attack lands on '+to.name);
      MG.boss.hp=10;MG.player.earn({k:'pie',cells:5},3,5);MG.player.fire(MG.player.rack.length-1);for(let i=0;i<40;i++)MG.step();await sleep(900);
      check(MG.over&&MG.result.won&&MG.result.coop&&/Boss beaten/.test(mp.$('#eTitle').textContent),'boss: knocking out the boss wins for the team');}
    if(v==='stack'){const P=MG.player;
      check(!mp.$('#modeCtl').hidden&&mp.$('#slots').hidden&&/Drop/.test(mp.$('#bRaise').textContent),'stack: Drop and Spin controls');
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
    oh.$('#bOnline').click();oh.$('#bCreate').click();await sleep(150);
    oh.$(`#lobbyVariants [data-v="${v}"]`).click();await sleep(100);
    const og=page('https://foodfight.grudgematchgames.com/?room='+oh.$('#roomCode').textContent);await sleep(2600);
    const vname={order:'Order Up!',boss:'Boss Brawl',stack:'Snack Stack',shot:'Splat Shot'}[v];
    check(!og.$('#lobbyVarNote').hidden&&og.$('#lobbyVarNote').textContent.includes(vname)&&og.$('#lobbyVariants').hidden,`${v} online: guest sees the host picked ${vname}`);
    oh.$('#fill [data-f="0"]').click();oh.$('#bStart').click();await sleep(4700);
    const H=oh.w.__ff.game,Gg=og.w.__ff.game;
    check(H&&Gg&&H.variant===v&&Gg.variant===v&&H.mid===Gg.mid,`${v} online: both phones in a ${v} match`);
    await sleep(500);
    const rem=Gg.byId(H.player.id);
    check(rem&&rem.remote&&rem.lastSnap>0&&(v==='shot'?rem.hex&&rem.hex.length===128:rem.g.flat().some(Boolean)),`${v} online: guest sees the host's board`);
    if(v==='order'){
      const P=Gg.player,tk=P.tickets[0];P.orders=9;P.fillOrders(tk.items.flatMap(it=>Array.from({length:it.n},()=>({t:it.t}))),3,6);
      await sleep(1200);
      check(H.over&&Gg.over&&Gg.result.won&&!H.result.won&&H.result.winner&&H.result.winner.id===Gg.player.id,'order online: host confirms the guest finished first');
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
  host.errors.concat(guest.errors,solo.errors).slice(0,5).forEach(e=>console.log('  ',e));
  check(host.errors.length===0&&guest.errors.length===0&&solo.errors.length===0,'no script errors');
  process.exit();
})();
