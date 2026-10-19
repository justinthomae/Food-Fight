// Pest Control rules: plates and bites, swatting (and not swatting the cat), streaks send pests, bots finish, online snapshots
const E=require('../js/engine.js');const PB=require('../js/modes/pest.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const {ANT,FLY,MOUSE,CAT}=PB.KIND;
const mk=()=>{const g=new E.Game('duel',1,{},false,{variant:'pest'});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
const put=(P,k,x,y)=>{P.spawn(k);const p=P.pests[P.pests.length-1];p.x=p.px=x;p.y=p.py=y;return p};
{const {g,P}=mk();
 check(P.bites.length===6&&P.bites.every(b=>b===3)&&P.totalBites()===18,'six plates, three bites each');
 run(g,60*6);check(P.pests.length>0,'pests start arriving ('+P.pests.length+')');
 P.pests=[];const a=put(P,ANT,2,5);check(P.swat(2.3,5.2)&&!P.pests.includes(a)&&P.swats===1,'a tap near an ant swats it');
 check(!P.swat(5,1)&&P.misses===1,'a tap on nothing is a miss');
 const m=put(P,MOUSE,1,4);P.swat(1,4);check(P.pests.includes(m)&&m.hp===1,'a mouse takes two swats (first one dazes it)');
 P.swat(m.x,m.y);check(!P.pests.includes(m),'second swat gets the mouse');}
// a pest that reaches a plate takes a bite; losing every plate is a knock-out
{const {g,P}=mk();P.pests=[];P.nextSpawn=1e9;P.nextCat=1e9;
 const a=put(P,ANT,2.5,10.2);a.tc=2;run(g,80);
 check(P.bites[2]===2&&!P.pests.includes(a),'a pest that reaches a plate takes a bite ('+P.bites.join('')+')');
 P.bites=[0,0,0,0,0,1];const b=put(P,FLY,5.5,10.5);b.tc=5;run(g,120);
 check(P.dead,'no food left on any plate: knocked out');}
// the cat: swat it and it hisses, you're stunned and lose a bite
{const {g,P}=mk();P.pests=[];P.nextSpawn=1e9;P.nextCat=1e9;
 const c=put(P,CAT,3,9);const before=P.totalBites();P.swat(3,9);
 check(P.pests.includes(c)&&P.stunT>0&&P.totalBites()===before-1,'swatting the cat: it stays, you\'re stunned and lose a bite');
 const a=put(P,ANT,1,3);check(!P.swat(1,3)&&P.pests.includes(a),'no swatting while stunned');
 run(g,61);const c2=put(P,CAT,4,8),a2=put(P,ANT,4.3,8.2);P.swat(4.1,8.1);
 check(!P.pests.includes(a2)&&P.pests.includes(c2),'with a pest next to the cat, the pest gets swatted, not the cat');}
// streaks send pests at your target, and trash that lands becomes extra pests
{const {g,P,B}=mk();P.pests=[];P.nextSpawn=1e9;B.nextSpawn=1e9;B.nextCat=1e9;
 for(let i=0;i<5;i++){const a=put(P,ANT,1+i*.9,4);P.swat(a.x,a.y)}
 check(P.combo===5,'five quick swats is a streak of 5');
 run(g,110);check(P.combo===0&&B.incoming()===3,'when the streak ends, 3 pests fly at the target ('+B.incoming()+')');
 B.pests=[];run(g,E.INC_T+40);check(B.incoming()===0&&B.pests.filter(p=>p.trash).length===3,'they land as extra pests ('+B.pests.length+')');
 // you can block incoming with your own streak
 const {g:g2,P:P2,B:B2}=mk();P2.receive(4,B2);P2.pests=[];P2.nextSpawn=1e9;for(let i=0;i<4;i++){const a=put(P2,ANT,1+i,4);P2.swat(a.x,a.y)}run(g2,110);
 check(P2.incoming()===2&&P2.blocked===2,'your own streak cancels incoming pests first');}
// remote snapshot
{const {g,P}=mk();run(g,60*20);P.bites[1]=1;const s=P.snap();const R=new E.RemoteBoard(g,'r1','R',2);R.apply(s);
 check(R.ms&&R.ms.b===P.bites.join('')&&Array.isArray(R.ms.p)&&R.ms.p.length===P.pests.length&&R.height()===P.height(),'snapshot carries plates, pests and danger');
 check(JSON.stringify(s).length<700,'snapshot stays small ('+JSON.stringify(s).length+' bytes)');}
// bots play and finish a brawl on every difficulty, in a sensible time
for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:'pest',size:4});let f=0;while(!g.over&&f<60*600){g.step();f++}
 const s=f/60|0;check(g.over&&(d!==1||(s>40&&s<360)),`${['Easy','Medium','Hard'][d]} bots finish a 4-way brawl (${s}s, swats ${g.boards.map(b=>b.swats).join('/')})`);}
// Easy bots are sloppy: they miss far more than Hard ones
{const rate=d=>{const g=new E.Game('brawl',d,{},true,{variant:'pest',size:4});for(let i=0;i<60*60&&!g.over;i++)g.step();const b=g.boards;return b.reduce((a,x)=>a+x.misses,0)/Math.max(1,b.reduce((a,x)=>a+x.swats+x.misses,0))};
 const e=rate(0),h=rate(2);check(e>h,'Easy bots miss more than Hard ones ('+e.toFixed(2)+' vs '+h.toFixed(2)+')');}
