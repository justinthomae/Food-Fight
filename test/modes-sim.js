// Headless all-bot matches for each mode: they must finish, in a sensible time, with a sensible result.
const E=require('../js/engine.js');
try{require('../js/stack.js')}catch(e){}
try{require('../js/shot.js')}catch(e){}
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const only=process.argv[2];
function run(variant,mode,size,d){
  const g=new E.Game(mode,d,{},true,{variant,size});
  let f=0;while(!g.over&&f<60*900){g.step();f++}
  return {g,secs:f/60};
}
for(const v of (only?[only]:['order','boss','stack','shot'])){
  if(!E.BOARD_TYPES[v]&&(v==='stack'||v==='shot'))continue;
  for(const [mode,size] of [['duel',2],['brawl',4]])for(const d of [0,1,2]){
    const R=[];for(let i=0;i<4;i++)R.push(run(v,mode,size,d));
    const avg=R.reduce((a,r)=>a+r.secs,0)/R.length,done=R.every(r=>r.g.over);
    let extra='';
    if(v==='order')extra=' orders:'+R.map(r=>r.g.boards.map(b=>b.orders).join('/')).join(' ');
    if(v==='boss')extra=' wins:'+R.filter(r=>r.g.result&&r.g.result.won).length+'/4 hp left:'+R.map(r=>r.g.boss.hp).join(',');
    if(v==='stack'||v==='shot')extra=' sent:'+R.map(r=>r.g.boards.map(b=>b.sent).join('/')).join(' ');
    check(done&&avg>40&&avg<600,`${v} ${mode}${size} ${E.DIFFS[d].name}: ${avg.toFixed(0)}s avg${extra}`);
  }
}
