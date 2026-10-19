// Mold Patrol: starting mould, clearing it, the race win, trash planting mould, snapshots and bots
const E=require('../js/engine.js');require('../js/stack.js');const MB=require('../js/modes/mold.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const run=(g,n)=>{for(let i=0;i<n&&!g.over;i++)g.step()};
const mk=(d)=>{const g=new E.Game('duel',d==null?1:d,{},false,{variant:'mold'});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const molds=b=>b.g.flat().filter(t=>t&&t.mold).length;
// start
{const {g,P,B}=mk(1);
 check(P instanceof MB&&E.RACE.has('mold'),'mold is a race mode on a Mold Patrol board');
 check(molds(P)===10&&P.moldLeft()===10,'Medium starts with 10 mould spots ('+molds(P)+')');
 check(P.groups().length===0,'no group of 4 at the start');
 check(P.g.map(r=>r.map(t=>t?t.t+(t.mold?'m':''):'.').join()).join('|')===B.g.map(r=>r.map(t=>t?t.t+(t.mold?'m':''):'.').join()).join('|'),'every kitchen starts the same');
 let floating=0;for(let c=0;c<6;c++){let seen=false;for(let r=0;r<12;r++){if(P.g[r][c])seen=true;else if(seen)floating++}}check(floating===0,'starting food sits on the floor (no gaps)');
 check([0,1,2].map(d=>mk(d).P.moldLeft()).join()==='8,10,12','Easy 8, Medium 10, Hard 12');}
// popping mould
{const {g,P}=mk(1);run(g,40);
 for(let r=0;r<12;r++)P.g[r].fill(null);
 const t=E.T(2);t.mold=true;P.g[11][0]=t;P.g[11][1]=E.T(2);P.g[11][2]=E.T(2);const m2=E.T(4);m2.mold=true;P.g[11][5]=m2;
 P.piece={a:2,b:3,c:3,r:1,rot:0,sa:null,sb:null};P.state='fall';P.hardDrop();run(g,120);
 check(P.orders===1&&P.moldLeft()===1&&!g.over,'a popped group of 4 cleans the mould in it ('+P.orders+')');
 // last mould: you win
 P.g[11][2]=E.T(4);P.g[11][3]=E.T(4);P.g[11][4]=null;P.piece={a:4,b:0,c:4,r:1,rot:0,sa:null,sb:null};P.state='fall';P.hardDrop();run(g,120);
 check(P.orders===2&&g.over&&g.result.won&&g.result.winner===P,'cleaning the last spot wins the race');}
// trash lands: every 4th unit turns a clean food mouldy, the rest are bags
{const {g,P,B}=mk(1);run(g,40);const before=P.moldLeft();
 P.receive(8,B);P.inc[0].t=0;P.state='settle';P.pending=0;P.resolve();
 const bags=P.g.flat().filter(t=>t&&t.t<0).length;
 check(P.moldLeft()===before+2&&bags===6,'8 trash: 2 new mould spots + 6 bags ('+(P.moldLeft()-before)+','+bags+')');
 check(P.moldTotal()===P.orders+P.moldLeft(),'goal grows with planted mould');}
// junk crosses
{const {g,P,B}=mk(1);run(g,40);P.sendJunk(5);run(g,60);check(B.incoming()===5,'chain junk flies to the opponent exactly ('+B.incoming()+')');}
// snapshot
{const {g,P}=mk(1);run(g,60);const R=new E.RemoteBoard(g,'r1','R',2);R.apply(P.snap());
 const rm=R.g.flat().filter(t=>t&&t.mold).length;check(rm===P.moldLeft()&&R.orders===P.orders,'snapshot carries the mould spots and progress ('+rm+')');}
// bots
for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:'mold',size:4});let f=0;while(!g.over&&f<60*600){g.step();f++}
 const w=g.result&&g.result.winner;
 console.log(`  d${d}: ${(f/60)|0}s, winner ${w?w.name:'-'} cleared ${w?w.orders:0}, KOs ${g.boards.filter(b=>b.dead).length}`);
 check(g.over,`bots finish a 4-cook race on ${['Easy','Medium','Hard'][d]} (${(f/60)|0}s)`);}
