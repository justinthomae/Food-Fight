// Block Battle rules: bag, SRS kicks, hold, DAS, line clears, T-spins, garbage and cancelling
const E=require('../js/engine.js');const BB=require('../js/blocks.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const mk=()=>{const g=new E.Game('duel',1,{},false,{variant:'blocks'});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
{const {g,P}=mk();
 const seen=new Set(P.queue.slice(0,6));check(P.queue.length>=6,'5+ piece preview');
 // the first 7 pieces are one of each
 const first=[...P.queue];while(first.length<7)first.push(P.draw());check(new Set(first.slice(0,7)).size===7,'7-bag: one of each piece per bag');
 run(g,40);check(P.state==='fall'&&P.piece,'a piece spawns');
 const c0=P.piece.c;P.press('L');check(P.piece.c===c0-1,'tap left moves one cell');P.release('L');
 P.press('R');run(g,30);P.release('R');check(P.piece.c>c0+2,'holding right auto-repeats (DAS/ARR)');
 const t=P.piece.p;P.press('HOLD');check(P.hold===t&&P.piece&&P.holdUsed,'hold swaps the piece out');
 const t2=P.piece.p;P.press('HOLD');check(P.piece.p===t2,'only one hold per piece');
 P.press('HD');check(!P.piece,'hard drop locks at once');run(g,10);check(!P.holdUsed,'hold is available again for the next piece');}
// line clear + attack
{const {g,P,B}=mk();run(g,40);
 for(let r=18;r<22;r++)for(let c=0;c<9;c++)P.m[r][c]=8;
 P.piece={p:1,rot:1,r:0,c:7};   // vertical I down the right edge (cells at column c+2 = 9)
 const s0=B.inc.length;P.hardDrop();
 check(P.lines===4,'4 lines clear at once ('+P.lines+')');
 run(g,40);check(B.incoming()===4,'a quad sends 4 garbage lines ('+B.incoming()+')');}
// T-spin double
{const {g,P,B}=mk();run(g,40);
 // classic TSD slot: bottom two rows full except a T-shaped hole at columns 3-5
 const H=22;for(let c=0;c<10;c++){P.m[H-1][c]=8;P.m[H-2][c]=8}
 P.m[H-1][4]=0;P.m[H-2][3]=0;P.m[H-2][4]=0;P.m[H-2][5]=0;P.m[H-3][3]=8;   // overhang left
 // T standing up in the slot's right half, then one clockwise turn tucks it in pointing down
 P.piece={p:3,rot:1,r:H-3,c:3};check(P.fits(P.piece),'T fits upright beside the slot');
 P.rotate(1);const ts=P.tspin();
 P.hardDrop();
 check(ts==='full'&&P.lines===2,'T-spin double detected and clears 2 ('+ts+','+P.lines+')');
 run(g,40);check(B.incoming()===4,'T-spin double sends 4 ('+B.incoming()+')');}
// garbage arrives and you can cancel it
{const {g,P,B}=mk();run(g,40);
 P.receive(3,B);check(P.incoming()===3,'garbage queues as incoming');
 run(g,30);P.hardDrop();run(g,10);
 const garbRows=P.m.filter(r=>r.filter(v=>v===8).length===9).length;check(garbRows===3&&P.incoming()===0,'it rises in after a piece locks without clearing ('+garbRows+')');
 const {g:g2,P:P2,B:B2}=mk();run(g2,40);P2.receive(2,B2);for(let r=18;r<22;r++)for(let c=0;c<9;c++)P2.m[r][c]=8;P2.piece={p:1,rot:1,r:0,c:7};P2.hardDrop();run(g2,40);
 check(P2.incoming()===0&&B2.incoming()===2&&P2.blocked===2,'clearing cancels incoming first, the rest is sent ('+P2.blocked+' blocked, '+B2.incoming()+' sent)');}
// topping out
{const {g,P}=mk();run(g,40);for(let r=2;r<22;r++)for(let c=0;c<10;c++)if(c!==9)P.m[r][c]=8;P.receive(30,g.boards[1]);run(g,30);P.hardDrop();run(g,20);check(P.dead,'garbage past the top knocks you out');}
// SRS: an I piece turning next to the wall gets kicked into place
{const {g,P}=mk();run(g,40);P.piece={p:1,rot:1,r:5,c:-2};const ok=P.rotate(1);check(ok&&P.fits(P.piece),'wall kick lets an I turn against the wall');}
// remote snapshot round-trip
{const {g,P}=mk();run(g,60);const s=P.snap();const R=new E.RemoteBoard(g,'r1','R',2);R.apply(s);check(R.bm===s.g&&R.bm.length===200&&R.height()>=0,'snapshot carries the 10x20 well');}
// bots play and finish a battle
{const g=new E.Game('brawl',1,{},true,{variant:'blocks',size:4});let f=0;while(!g.over&&f<60*900){g.step();f++}
 check(g.over&&g.boards.some(b=>b.lines>20),'bots battle to a finish ('+(f/60|0)+'s)');}
// ---------- items ----------
{const BBI=BB.ITEMS;check(BBI.length===12,'12 items');
 // a ? block in a cleared line racks an item
 const {g,P,B}=mk();run(g,40);
 for(let r=18;r<22;r++)for(let c=0;c<9;c++)P.m[r][c]=8;P.m[21][0]=8|BB.SP;
 P.piece={p:1,rot:1,r:0,c:7};P.hardDrop();
 check(P.rack.length>=1&&BBI.includes(P.rack[0].k),'clearing a ? block racks an item ('+(P.rack[0]&&P.rack[0].k)+')');}
const fx=(k,setup)=>{const {g,P,B}=mk();run(g,40);run(g,1);for(let r=14;r<22;r++)for(let c=0;c<10;c++)B.m[r][c]=(r+c)%3?((c%7)+1):0;run(g,40);setup&&setup(P,B);
  P.rack=[{k,id:999}];P.fire(0);run(g,40);return {g,P,B}};
{const {B}=fx('scramble',(P,B)=>{B.queue=[1,1,1,1,1,1]});check(B.queue.slice(0,5).some(t=>t!==1),'Scramble rewrites the target\'s pieces');}
{let before;const {B}=fx('twist',(P,B)=>{before=B.m.map(r=>r.join(','))});check(B.m[20].join(',')===before[20].split(',').reverse().join(','),'Twist mirrors the target\'s stack');}
{let before;const {B}=fx('quake',(P,B)=>{before=B.m.map(r=>r.join(','))});check(B.m.some((r,i)=>r.join(',')!==before[i]),'Earthquake slides the target\'s rows');}
{const {B}=fx('speed');check(B.speedT>0,'Speed up makes the target fall faster');}
{const {B}=fx('dark');check(B.darkT>0,'Darkness hides the target\'s stack');}
{const {B}=fx('hide');check(B.hideT>0,'Hide covers the target\'s Next and Hold');}
{let n0;const {B}=fx('shotgun',(P,B)=>{n0=B.m.flat().filter(v=>v===8).length});check(B.m.flat().filter(v=>v===8).length>n0,'Shotgun drops junk on the target');}
{let n0;const {B}=fx('blast',(P,B)=>{n0=B.m.filter(r=>r.filter(v=>v===8).length===9).length});check(B.m.filter(r=>r.filter(v=>v===8).length===9).length>=n0+4,'Garbage blast adds 4 lines at once');}
{let a,b;const {P,B}=fx('swap',(P,B)=>{a=P.m.map(r=>r.join('')).join('|');b=B.m.map(r=>r.join('')).join('|')});check(P.m.map(r=>r.join('')).join('|')===b&&B.m.map(r=>r.join('')).join('|')===a,'Switcheroo trades wells');}
{const {g,P,B}=mk();run(g,40);P.rack=[{k:'shield',id:1}];P.fire(0);P.receive(5,B);check(P.incoming()===0&&P.blocked===5,'Shield stops incoming garbage');}
{const {g,P}=mk();run(g,40);for(let c=0;c<10;c++){P.m[21][c]=c===3?0:5;P.m[20][c]=c===3?5:0}P.rack=[{k:'avalanche',id:1}];P.fire(0);check(P.m[21].every(v=>!v)&&P.lines===1,'Avalanche drops blocks into holes and clears');}
{const {g,P}=mk();run(g,40);for(let r=16;r<22;r++)P.m[r].fill(8);for(let r=16;r<22;r++)P.m[r][0]=0;P.rack=[{k:'push',id:1}];P.fire(0);check(P.rows()===2,'Push shoves the bottom 4 rows out ('+P.rows()+')');}
{const g=new E.Game('brawl',2,{},true,{variant:'blocks',size:4});const used={};g.boards.forEach(b=>{const f=b.fire.bind(b);b.fire=i=>{const it=b.rack[i];const r=f(i);if(r&&it)used[it.k]=1;return r}});let f=0;while(!g.over&&f<60*600){g.step();f++}
 check(Object.keys(used).length>=5,'bots earn and use items ('+Object.keys(used).join(',')+')');}
// sounds: Tetris, back-to-back Tetris (announcer) and the climbing harp on back-to-back clears
{const heard=[];const g=new E.Game('duel',1,{sfx:(n,a)=>heard.push(n+(a!=null?':'+a:''))},false,{variant:'blocks'});const P=g.player;g.boards[1].isBot=false;run(g,40);
 const quad=()=>{for(let r=18;r<22;r++)for(let c=0;c<9;c++)P.m[r][c]=8;P.piece={p:1,rot:1,r:0,c:7};P.state='fall';P.hardDrop();run(g,30)};
 quad();check(heard.includes('tetris')&&P.pops.some(p=>p.text==='Hot dog!'),'4 lines is a "Hot dog!" with its own fanfare');
 quad();check(heard.includes('b2btetris')&&P.pops.some(p=>p.text==='Back-to-back hot dog!'),'a second one in a row plays the back-to-back hot dog callout');
 check(heard.filter(h=>h.startsWith('harp:')).length>=1,'back-to-back clears play the harp ('+heard.filter(h=>h.startsWith('harp')).join(',')+')');}
