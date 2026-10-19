// Conveyor Belt rules: the line moves, throws join it, 3 in a row pop and pull the line back, chains, trash, KO, bots, snapshots
const E=require('../js/engine.js');const CB=require('../js/modes/conveyor.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const Q=CB.GEO;
const mk=()=>{const g=new E.Game('duel',1,{},false,{variant:'conveyor'});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
const setLine=(P,ts)=>{P.line=ts.map(t=>P.mk(t));P.line.forEach((b,i)=>b.vs=P.sOf(i))};
check(E.VARIANTS.includes('conveyor')&&E.BOARD_TYPES.conveyor===CB,'registered as a mode');
check(Q.L>25&&Q.at(Q.L)[1]>7&&Q.at(0)[0]<0,'belt runs from the top-left entrance down to the trash can ('+Q.L.toFixed(1)+' long)');
{let ok=true;for(let s=0;s<=Q.L;s+=.1){const [x,y]=Q.at(s);if(s>1.2&&(x-Q.BR<-.01||x+Q.BR>6.01||y<0||y>12))ok=false}check(ok,'every food on the belt stays inside the board');}
// the belt moves and food keeps coming
{const {g,P}=mk();const h0=P.head(),n0=P.line.length;run(g,600);check(P.head()>h0&&P.line.length>n0,'the line moves along and new food comes in ('+n0+'→'+P.line.length+')');}
// a throw joins the line and 3 in a row pop; the front of the line is pulled back
{const {g,P}=mk();run(g,200);
 const h=P.trace(-Math.PI/2);check(h&&h.i>=0&&h.i<P.line.length,'the aim guide finds where a throw joins the line');
 P.cur=P.line[0].t;P.aimAt(...Q.at(P.sOf(0)));P.cool=0;const n0=P.line.length;P.shoot();let k=0;while(P.ball&&k++<120)g.step();
 check(P.line.length!==n0,'a throw joins the line (or pops)');
 P.feed=3;setLine(P,[0,1,2,2,3,4,0,1,3,4]);const h0=P.head(),n1=P.line.length;
 P.insert({i:2,front:true},2);
 check(P.line.length===n1-2&&P.head()<h0,'three 2s in a row pop and the line closes up, pulling the front back ('+n1+'→'+P.line.length+')');
 check(P.score>0&&P.maxCombo>=3,'popping scores');}
// a chain: the gap closes on a match
{const {g,P,B}=mk();P.feed=4;setLine(P,[0,3,3,1,1,3,0,2,4]);P.isBot=false;
 const i=3;P.insert({i,front:true},1);   // 1 1 1 pop, then 3 3 + 3 meet
 run(g,40);check(P.maxChain>=2,'when the gap closes on a match it pops too: a chain ('+P.maxChain+')');
 run(g,40);check(B.incoming()>0||B.inc.length>0,'the chain sends trash at the rival ('+B.incoming()+')');}
// trash bags enter the line and pop next to food
{const {g,P}=mk();P.receive(3,g.boards[1]);run(g,E.INC_T+5);
 check(P.line.filter(b=>b.t<0).length===3,'landed trash rides in as trash bags');
 const j=P.line.findIndex(b=>b.t<0);check(P.colours().length>0&&!P.colours().includes(-1),'trash bags are never thrown');
 // put a trash bag right behind a pop
 P.feed=3;setLine(P,[1,1,-1,4,0]);P.insert({i:0,front:true},1);run(g,2);
 check(!P.line.some(b=>b.t<0),'a trash bag next to a pop goes with it');void j;}
// out when the front reaches the can
{const {g,P}=mk();P.feed=Q.L-0.1-(P.line.length-1)*Q.D;run(g,120);check(P.dead&&g.over&&!g.result.won,'the line reaching the trash can knocks you out');}
// remote snapshot
{const {g,P}=mk();run(g,120);const s=P.snap();const R=new E.RemoteBoard(g,'r1','R',2);R.apply(s);
 check(R.ms&&R.ms.l.length===P.line.length&&Math.abs(R.ms.f-P.feed)<.01&&R.height()===P.height()&&JSON.stringify(s).length<300,'snapshot carries the line, belt position and danger ('+JSON.stringify(s).length+' bytes)');}
// bots
for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:'conveyor',size:4});let f=0;while(!g.over&&f<60*720){g.step();f++}
  const s=f/60|0;check(g.over&&(d!==1||(s>40&&s<360)),`${['Easy','Medium','Hard'][d]} bots battle to a finish (${s}s, best chain ${Math.max(...g.boards.map(b=>b.maxChain))})`)}
// Easy is easy: an Easy bot alone loses faster than a Medium one
{const t=d=>{let tot=0;for(let k=0;k<3;k++){const g=new E.Game('duel',d,{},false,{variant:'conveyor'});const P=g.player;P.isBot=false;P.step=()=>{};g.boards[1].isBot=true;let f=0;while(!g.boards[1].dead&&f<60*600){g.step();f++}tot+=f}return tot/3/60};
 const e=t(0),m=t(1);check(e<m,`an Easy bot lasts less than a Medium bot on its own (${e.toFixed(0)}s vs ${m.toFixed(0)}s)`);}
