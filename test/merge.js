// Recipe Merge rules: sliding, cooking once per swipe, trash bags, serving a Feast, bots, snapshots
const E=require('../js/engine.js');const MB=require('../js/modes/merge.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
const mk=()=>{const g=new E.Game('duel',1,{},false,{variant:'merge'});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const set=(P,rows)=>{P.m=rows.map(r=>r.slice())};
// line rules
{const s=MB.slideLine;
 check(s([1,1,0,0,0]).out.join()==='2,0,0,0,0','two of the same cook into the next dish');
 check(s([1,1,1,1,0]).out.join()==='2,2,0,0,0','each tile cooks once per swipe (4 Wheat make 2 Flour, not Dough)');
 check(s([2,1,1,0,0]).out.join()==='2,2,0,0,0','cooked tile does not cook again in the same swipe');
 check(s([0,1,-1,1,0]).out.join()==='1,0,-1,1,0','trash bags stay put and tiles stop against them');
 check(s([1,-1,0,0,1]).out.join()==='1,-1,1,0,0','tiles slide up to a trash bag');}
{const {g,P}=mk();
 set(P,[[1,1,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]);
 check(P.swipe('L')&&P.m[0][0]===2&&P.filled()===2,'a swipe cooks and a new ingredient appears');
 set(P,[[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1]]);
 check(!P.swipe('L'),'a swipe that changes nothing does nothing');
 check(!MB.canMove(P.m),'a stuck counter has no moves');}
// trash cleared by cooking next to it, attacks
{const {g,P,B}=mk();
 set(P,[[0,3,3,-1,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]);
 P.swipe('R');check(P.m[0][2]===4&&P.m.flat().filter(v=>v===-1).length===0,'cooking right next to a trash bag clears it');
 run(g,60);check(B.incoming()===1,'cooking Bread throws 1 trash ('+B.incoming()+')');
 run(g,300);check(B.m.flat().filter(v=>v===-1).length===1,'the trash lands as a bag on their counter');
 set(P,[[9,9,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]);const s0=P.served;P.swipe('L');
 check(P.served===s0+1&&P.best===10&&!P.m.flat().includes(10),'two Cakes make a Feast, served straight away');
 run(g,60);check(B.incoming()>=8,'a Feast dumps 8 trash ('+B.incoming()+')');}
// no moves left = out
{const {g,P}=mk();set(P,[[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,0]]);P.rng=()=>0.99;P.swipe('R');
 check(P.dead||MB.canMove(P.m),'a move that leaves the counter stuck knocks you out');}
// snapshot round trip
{const {g,P}=mk();run(g,10);P.swipe('L');P.swipe('U');const s=P.snap();const R=new E.RemoteBoard(g,'r1','R',2);R.apply(s);
 check(R.ms&&R.ms.b===P.code()&&MB.decode(R.ms.b).flat().join()===P.m.flat().join()&&R.height()===P.height(),'snapshot carries the counter ('+JSON.stringify(s).length+' bytes)');}
// bots
for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:'merge',size:4});let f=0;while(!g.over&&f<60*900){g.step();f++}
 const best=Math.max(...g.boards.map(b=>b.best));
 check(g.over&&(d!==1||(f>40*60&&f<6*3600)),`${['Easy','Medium','Hard'][d]} bots finish a 4-way brawl (${(f/60|0)}s, best dish ${MB.TIERS[best]}, sent ${g.boards.map(b=>b.sent).join('/')})`);}
