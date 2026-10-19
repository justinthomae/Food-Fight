// Pancake Tower rules: cycling, lines in all four directions, chains, trash bags, topping out, bots, snapshots
const E=require('../js/engine.js');const PB=require('../js/modes/pancake.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const {ROWS,COLS,T}=E;
const mk=()=>{const g=new E.Game('duel',1,{},false,{variant:'pancake'});const P=g.player,B=g.boards[1];B.isBot=false;
  P.g.forEach(r=>r.fill(null));B.g.forEach(r=>r.fill(null));return {g,P,B}};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
const waitFall=(g,P)=>{for(let i=0;i<400&&P.state!=='fall';i++)g.step()};
const settle=(g,P)=>{for(let i=0;i<600&&P.state!=='fall'&&!P.dead;i++)g.step()};
{const {g,P}=mk();waitFall(g,P);
 check(P.piece&&P.piece.f.length===3&&P.piece.c===2,'a stack of three spawns in the middle');
 const f=P.piece.f.slice();P.cycle(1);check(P.piece.f[0]===f[2]&&P.piece.f[1]===f[0]&&P.piece.f[2]===f[1],'cycle: the bottom food goes to the top');
 const c0=P.piece.c;P.move(-1);check(P.piece.c===c0-1,'moves left');P.move(1);P.move(1);check(P.piece.c===c0+1,'moves right');
 P.hardDrop();check(P.g[ROWS-3][c0+1]&&P.g[ROWS-2][c0+1]&&P.g[ROWS-1][c0+1]&&!P.piece,'hard drop: the three land in one column');}
// lines in all four directions
const lineTest=(name,cells,dropC,f)=>{const {g,P}=mk();waitFall(g,P);
  cells.forEach(([r,c,t])=>P.g[r][c]=T(t));P.piece.f=f;P.piece.c=dropC;P.hardDrop();
  settle(g,P);return P};
{const P=lineTest('h',[[11,0,0],[11,1,0]],2,[1,2,0]);check(P.cleared>=3,'3 across clear ('+P.cleared+')');}
{const P=lineTest('v',[],0,[3,3,3]);check(P.cleared===3&&!P.g[11][0],'3 up and down clear');}
{const {g,P}=mk();waitFall(g,P);P.g[11][0]=T(4);P.g[10][1]=T(4);P.g[11][1]=T(1);P.g[11][2]=T(2);P.g[10][2]=T(3);
 // column 2 top is r10: dropping lands rows 7..9 -> put 4 at r9
 P.piece.f=[0,1,4];P.piece.c=2;P.hardDrop();settle(g,P);
 check(P.cleared===3&&!P.g[11][0]&&!P.g[10][1],'3 on a diagonal clear ('+P.cleared+')');}
{const {g,P}=mk();waitFall(g,P);P.g[9][0]=T(2);P.g[10][1]=T(2);P.g[11][1]=T(0);P.g[11][2]=T(1);P.g[11][0]=T(3);P.g[10][0]=T(4);
 // other diagonal: (9,0),(10,1),(11,2)? put 2 at r11 c2 via the drop
 P.g[11][2]=null;P.piece.f=[0,1,2];P.piece.c=2;P.hardDrop();settle(g,P);
 check(P.cleared===3&&!P.g[9][0]&&!P.g[10][1],'3 on the other diagonal clear ('+P.cleared+')');}
// chain: a clear drops a food into a second line
{const {g,P,B}=mk();waitFall(g,P);
 P.g[11][0]=T(1);P.g[11][1]=T(1);P.g[11][3]=T(4);P.g[11][4]=T(4);
 P.piece.f=[0,4,1];P.piece.c=2;P.hardDrop();settle(g,P);
 check(P.maxChain===2&&P.cleared===6,'a clear that drops food into a new line is a chain ('+P.maxChain+', '+P.cleared+')');
 run(g,60);check(B.incoming()>0&&P.sent>0,'chains send trash ('+P.sent+')');}
// trash bags break next to a clear
{const {g,P}=mk();waitFall(g,P);P.g[11][0]=T(1);P.g[11][1]=T(1);P.g[10][0]=T(-1);P.g[11][3]=T(-1);
 P.piece.f=[3,4,1];P.piece.c=2;P.hardDrop();settle(g,P);
 const bags=P.g.flat().filter(t=>t&&t.t<0).length;check(bags===0,'trash bags next to a clear break ('+bags+' left)');}
// incoming trash lands as bags after your piece
{const {g,P,B}=mk();waitFall(g,P);P.receive(5,B);check(P.incoming()===5,'trash queues as incoming');
 run(g,240);waitFall(g,P);P.hardDrop();settle(g,P);
 const bags=P.g.flat().filter(t=>t&&t.t<0).length;check(bags===5&&P.incoming()===0,'it lands as 5 trash bags ('+bags+')');}
// topping out
{const {g,P}=mk();waitFall(g,P);for(let r=0;r<ROWS;r++)P.g[r][2]=T(r%2?-1:-1);P.piece=null;P.state='spawn';P.wait=1;run(g,3);check(P.dead,'a full spawn column knocks you out');}
// snapshot round trip
{const {g,P}=mk();waitFall(g,P);run(g,30);const s=P.snap();const R=new E.RemoteBoard(g,'r1','R',2);R.apply(s);
 check(s.g.length===72&&R.g.flat().filter(Boolean).length===P.g.flat().filter(Boolean).length+3-[...Array(3)].filter((_,i)=>Math.floor(P.piece.r)+i<0).length,'snapshot carries the well and the falling stack');}
// bots finish
for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:'pancake',size:4});let f=0;while(!g.over&&f<60*900){g.step();f++}
 const s=f/60|0;check(g.over&&(d!==1||(s>=40&&s<=360)),['Easy','Medium','Hard'][d]+' bots battle to a finish ('+s+'s, best chain '+Math.max(...g.boards.map(b=>b.maxChain))+')');}
// duel: hard beats easy most of the time
{let w=0;for(let k=0;k<6;k++){const g=new E.Game('duel',0,{},true,{variant:'pancake'});g.d=0;const hard=g.boards[1];const P=g.player;
  // P plays as Easy, the other as Hard
  const ai=hard.ai.bind(hard);hard.ai=()=>{g.d=2;ai();g.d=0};let f=0;while(!g.over&&f<60*600){g.step();f++}if(!hard.dead)w++}
 check(w>=4,'Hard beats Easy in most duels ('+w+'/6)');}
