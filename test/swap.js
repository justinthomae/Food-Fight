// Switcheroo: two boards trade stacks, locally and across the network
const E=require('../js/engine.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const g=new E.Game('duel',1,{},false,{});
const P=g.player,B=g.boards[1];
for(let r=0;r<4;r++)for(let c=0;c<6;c++)B.g[r][c]=E.T(r%5);   // make the bot's stack tall
const ids=b=>new Set(b.g.flat().filter(Boolean).map(t=>t.id));const pid=ids(P),bid=ids(B);
P.earn({k:'swap'},3,5);check(P.rack.some(x=>x.k==='swap'),'switcheroo goes in the rack');
P.fire(P.rack.findIndex(x=>x.k==='swap'));for(let i=0;i<E.FLY+2;i++)g.step();
const same=(a,b)=>a.replace(/[A-Z]/g,'J')===b.replace(/[A-Z]/g,'J');
const moved=(now,was)=>[...now].filter(i=>was.has(i)).length>=Math.min(now.size,was.size)*.8;
check(moved(ids(P),bid)&&moved(ids(B),pid),'local swap: the two stacks trade places');
check(P.score>=0&&!P.dead&&!B.dead,'nobody is knocked out by the swap itself');
// code round trip keeps junk blocks and badges
const q=new E.Game('duel',1,{},false,{}).player;q.g[11][0]=E.T(-1);q.g[11][0].gid=77;q.g[11][1]=E.T(-1);q.g[11][1].gid=77;q.g[10][0]=E.T(2);q.g[10][0].sp='cream';
const code=q.gridCode();const z=new E.Game('duel',1,{},false,{}).player;z.loadGrid(code);
check(z.g[11][0].t<0&&z.g[11][0].gid===z.g[11][1].gid&&z.g[10][0].sp==='cream','junk blocks and special badges survive the trip');
// network: attacker sends its grid in the throw, target sends its old grid back
const sent=[];
const A=new E.Game('online',1,{send:m=>sent.push(m)},false,{roster:[{id:'a',name:'Ann'},{id:'b',name:'Bo'}],myId:'a',seed:5});
const Bg=new E.Game('online',1,{send:m=>sent.push(m)},false,{roster:[{id:'a',name:'Ann'},{id:'b',name:'Bo'}],myId:'b',seed:5});
const aCode=A.player.gridCode().g;for(let r=0;r<5;r++)for(let c=0;c<6;c++)Bg.player.g[r][c]=E.T((r*2+c)%5);const bCode=Bg.player.gridCode().g;
A.launch(A.player,{k:'swap'},A.byId('b'));
const atk=sent.find(m=>m.t==='atk');check(atk&&atk.k==='swap'&&atk.g&&atk.g.g===aCode,'online: the throw carries the thrower\'s board');
Bg.netAttack(atk);for(let i=0;i<E.FLY+2;i++)Bg.step();
check(same(Bg.player.gridCode().g,aCode),'online: target now has the thrower\'s board');
const back=sent.find(m=>m.t==='swapg');const tiles=c=>(c.match(/[^.]/g)||[]).length;
check(back&&back.to==='a'&&tiles(back.g.g)>=tiles(bCode)-3,'online: target sends its old board back');
A.netSwapGrid(back);check(same(A.player.gridCode().g,back.g.g),'online: thrower now has the target\'s board');
// bots hold it until they're in trouble
const h=new E.Game('duel',1,{},true,{});const bot=h.boards[1];bot.rack=[{k:'swap',id:999}];bot.fireT=0;bot.ai();
check(bot.rack.length===1,'bot keeps the switcheroo while its stack is low');
