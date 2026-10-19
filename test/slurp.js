// Noodle Slurp and Buffet Grab: chains / groups clear, trash breaks next to them, combos send, snapshots cross, bots finish
const E=require('../js/engine.js');require('../js/modes/slurp.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const mk=v=>{const g=new E.Game('duel',1,{},false,{variant:v});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
const fill=(P,rows)=>{for(let r=0;r<12;r++)for(let c=0;c<6;c++)P.g[r][c]=rows[r]&&rows[r][c]!=='.'?(rows[r][c]==='j'?E.T(-1):E.T(+rows[r][c])):null;P.rise=0};
{const {g,P,B}=mk('slurp');
 fill(P,{9:'012340',10:'010234',11:'0j1234'});
 check(P.start(9,0)&&P.extend(10,0)&&P.extend(11,1)===false,'slurp: trash can\'t join a chain');
 check(P.extend(10,1)===false&&P.path.length===2,'slurp: a different food can\'t join');
 P.cancel();
 // diagonal: (9,0)->(10,0)->(9,?)... build a clean 4-chain of 0s with a diagonal step
 fill(P,{8:'0.....',9:'.0....',10:'.0....',11:'j0....'});
 check(P.start(8,0)&&P.extend(9,1)&&P.extend(10,1)&&P.extend(11,1),'slurp: diagonal steps link a chain');
 check(P.extend(10,1)&&P.path.length===3,'slurp: dragging back undoes the last step');
 P.extend(11,1);check(P.finish()&&P.score>0,'slurp: letting go slurps 3+');
 run(g,40);check(!P.g[11][0],'slurp: trash next to the chain breaks');
 check(P.g[11][1]==null&&P.g[8][0]==null,'slurp: the chain is gone');
 // combo: two quick chains, then the trash goes out
 fill(P,{6:'000...',7:'111...',8:'222...',9:'333...'});P.inc=[];P.combo=0;P.comboT=0;P.comboJunk=0;
 P.start(6,0);P.extend(6,1);P.extend(6,2);P.finish();run(g,20);P.start(9,0);P.extend(9,1);P.extend(9,2);P.finish();
 check(P.combo===2,'slurp: quick chains build a combo');
 run(g,200);run(g,40);check(B.incoming()>0,'slurp: a combo sends trash ('+B.incoming()+')');
 // long chain sends on its own
 const {g:g2,P:P2,B:B2}=mk('slurp');fill(P2,{11:'000000',10:'1.....'});P2.start(11,0);for(let c=1;c<6;c++)P2.extend(11,c);P2.finish();run(g2,200);
 check(B2.incoming()>=3,'slurp: a 6-chain sends 3+ ('+B2.incoming()+')');
 // landed trash drops on top
 B2.inc.forEach(i=>i.t=0);const n0=B2.g.flat().filter(t=>t&&t.t<0).length;run(g2,30);
 check(B2.g.flat().filter(t=>t&&t.t<0).length>n0,'slurp: incoming trash lands as trash bags');
 // snapshot
 const R=new E.RemoteBoard(g,'r1','R',2);R.apply(P.snap());check(R.g.flat().filter(Boolean).length===P.g.flat().filter(Boolean).length&&R.preview.length===6,'slurp: snapshot carries the stack and next row');
 // rising: an idle board tops out
 const {g:g3,P:P3}=mk('slurp');let f=0;while(!P3.dead&&f<60*200){g3.step();f++}check(P3.dead&&f>60*30,'slurp: the stack rises and an idle player tops out ('+(f/60|0)+'s)');}
{const {g,P,B}=mk('buffet');
 fill(P,{9:'0011..',10:'0j13..',11:'2222..'});
 check(!P.grab(10,3)&&P.score===0,'buffet: a single food won\'t grab');
 check(P.grab(11,0)&&P.score>0,'buffet: tapping a group grabs it');
 run(g,40);check(!P.g.flat().some(t=>t&&t.t<0),'buffet: trash next to the group breaks');
 fill(P,{6:'000000',7:'000000'});P.grab(6,0);run(g,200);check(B.incoming()>=4,'buffet: a big plate sends trash ('+B.incoming()+')');}
for(const v of ['slurp','buffet'])for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:v,size:4});let f=0;while(!g.over&&f<60*600){g.step();f++}
  check(g.over&&f>60*30,`${v}: 4 bots finish on ${['Easy','Medium','Hard'][d]} (${f/60|0}s)`)}
