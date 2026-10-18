// Snack Stack items: badge foods in pairs, earned on pop, every effect does something
const E=require('../js/engine.js');require('../js/stack.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const used={};let earned=0;
for(let k=0;k<6;k++){
  const g=new E.Game('brawl',1,{},true,{variant:'stack',size:4});
  g.boards.forEach(b=>{const e=b.earn.bind(b),f=b.fire.bind(b);b.earn=(it,...a)=>{earned++;return e(it,...a)};b.fire=i=>{const it=b.rack[i];const r=f(i);if(r&&it)used[it.k]=(used[it.k]||0)+1;return r}});
  let fr=0;while(!g.over&&fr<60*400){g.step();fr++}
}
console.log('earned',earned,'used',JSON.stringify(used));
check(earned>10,'bots earn items from badge foods');
check(Object.keys(used).length>=5,'bots use several item kinds');
const g=new E.Game('duel',1,{},false,{variant:'stack'});const P=g.player,B=g.boards[1];
B.steam(P);check(B.steamT>0,'steam fogs the target');
B.grease(P);check(B.greaseT>0,'grease hides their preview');
for(let r=6;r<ROWS();r++);
function ROWS(){return E.ROWS}
for(let r=4;r<E.ROWS;r++)for(let c=0;c<E.COLS;c++)P.g[r][c]=E.T((r*2+c)%5);
const h0=P.height();P.flatten();for(let i=0;i<40;i++)P.step();check(P.height()<h0,'rolling pin flattens your stack ('+h0+'→'+P.height()+')');
const cnt=()=>{const n=[0,0,0,0,0];P.g.forEach(r=>r.forEach(t=>{if(t&&t.t>=0)n[t.t]++}));return n};
const n0=cnt(),f=n0.indexOf(Math.max(...n0));P.clearFood();check(cnt()[f]===0,'clean plate clears your most common food');
const code=B.gridCode(),mine=P.gridCode();g.swapBoards(B,P,{k:'swap'});
check(P.gridCode().g===code.g&&B.gridCode().g===mine.g,'switcheroo trades Snack Stack boards');
const Z=new E.Game('duel',1,{},false,{variant:'stack'}).player;check(Z.loadGrid(code)&&Z.gridCode().g===code.g,'Snack Stack board code round-trips');
// badge foods land on the board with the pair
let found=false;for(let k=0;k<200&&!found;k++){const q=P.pair();if(q[2]||q[3])found=true}
check(found,'some pairs carry a badge');
