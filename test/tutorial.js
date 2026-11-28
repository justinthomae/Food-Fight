// First-time tutorial lessons: each prepared board has no match until the player makes the hinted move,
// the hinted move meets the lesson's goal, and a wrong move doesn't. Usage: node test/tutorial.js
const E=require('../js/engine.js');require('../js/tutorial.js');
const {LESSONS,hasTrash}=globalThis.FFTutorial;
let fails=0;const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
function setup(L){
  const g=new E.Game('duel',0,{},false,{variant:'classic'});g.tutorial=true;g.holdBots=true;
  const B=g.player;B.loadGrid({g:L.grid,sp:[]});B.previewSp=null;B.score=0;B.maxChain=1;B.raised=0;B.side=false;
  return {g,B};
}
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
const swap=(B,[r1,c1],[r2,c2])=>r1===r2?B.trySwap(r1,c1,c2-c1):B.trySwapV(r1,c1,r2-r1);
for(const L of LESSONS){
  if(L.info){check(!!L.text&&!!L.info,`${L.key}: an info step with a button`);if(L.grid){const {g,B}=setup(L);run(g,300);check(B.score===0&&B.height()===9&&!B.dead,`${L.key}: the tall example board sits still with no match`)}continue}
  if(L.tray){const {g,B}=setup(LESSONS.find(x=>x.key==='chain'));swap(B,[11,2],[11,3]);run(g,600);
    check(B.rack.length>0&&!L.goal(B),`${L.key}: the chain left trash in the tray`);B.fire(0);run(g,60);check(L.goal(B),`${L.key}: throwing it completes the lesson`);continue}
  check(L.grid.length===72,`${L.key}: grid is 12 x 6`);
  // left alone, nothing happens (no match waiting, no rise, nobody dies)
  {const {g,B}=setup(L);if(L.junk)B.dropJunk(L.junk,null);run(g,600);
   check(B.score===0&&!B.dead&&!L.goal(B),`${L.key}: nothing happens until you move`);
   if(L.junk)check(hasTrash(B),`${L.key}: the trash lands on the board`);}
  if(L.hint){
    const {g,B}=setup(L);if(L.junk){B.dropJunk(L.junk,null);run(g,90)}
    check(swap(B,L.hint.from,L.hint.to),`${L.key}: the hinted swap is allowed`);
    run(g,600);check(L.goal(B),`${L.key}: the hinted swap completes the lesson`);
    // a different swap (somewhere else on the bottom row) doesn't
    const w=setup(L);if(L.junk){w.B.dropJunk(L.junk,null);run(w.g,90)}
    const [hr,hc]=L.hint.from;const alt=[[11,4,5],[11,0,1],[10,4,5],[11,3,4]].find(([r,a])=>!(r===hr&&(a===hc||a+1===hc||a===hc+1)));
    if(alt){swap(w.B,[alt[0],alt[1]],[alt[0],alt[2]]);run(w.g,600);check(!L.goal(w.B),`${L.key}: a wrong swap doesn't complete it`)}
  }
  if(L.raise){const {g,B}=setup(L);B.raising=true;run(g,60*4);B.raising=false;check(L.goal(B)&&!B.dead,`${L.key}: holding Raise brings up ${L.raise} rows`);}
}
// the tutorial board never knocks you out
{const g=new E.Game('duel',0,{},false,{variant:'classic'});g.tutorial=true;g.holdBots=true;const B=g.player;
 B.loadGrid({g:'1'.repeat(72),sp:[]});run(g,60*8);check(!B.dead,'tutorial: a full board never ends the game');
 check(g.margin()===1,'tutorial: no overtime');}
console.log(fails?fails+' failed':'all tutorial checks passed');process.exitCode=fails?1:0;
