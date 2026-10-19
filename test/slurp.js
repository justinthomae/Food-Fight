// Noodle Slurp and Buffet Grab: chains / groups clear, trash breaks next to them, combos send, snapshots cross, bots finish
const E=require('../js/engine.js');require('../js/modes/slurp.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const mk=v=>{const g=new E.Game('duel',1,{},false,{variant:v});const P=g.player,B=g.boards[1];B.isBot=false;return {g,P,B}};
const run=(g,n)=>{for(let i=0;i<n;i++)g.step()};
// rows are given for the bottom of the 8x16 board: key 11 = 4 rows from the bottom... keys are offset by 4 so old 6x12 layouts sit at the bottom
const fill=(P,rows)=>{for(let r=0;r<16;r++)for(let c=0;c<8;c++){const R=rows[r-4];P.g[r][c]=R&&R[c]&&R[c]!=='.'?(R[c]==='j'?E.T(-1):E.T(+R[c])):null}P.rise=0;P.preview=P.preview.map(x=>({t:x.t}))};
const at=(r,c)=>[r+4,c];
{const {g,P,B}=mk('slurp');
 fill(P,{9:'012340',10:'010234',11:'0j1234'});
 check(P.start(13,0)&&P.extend(14,0)&&P.extend(15,1)===false,'slurp: trash can\'t join a chain');
 check(P.extend(14,1)===false&&P.path.length===2,'slurp: a different food can\'t join');
 P.cancel();
 // diagonal: (9,0)->(10,0)->(9,?)... build a clean 4-chain of 0s with a diagonal step
 fill(P,{8:'0.....',9:'.0....',10:'.0....',11:'j0....'});
 check(P.start(12,0)&&P.extend(13,1)&&P.extend(14,1)&&P.extend(15,1),'slurp: diagonal steps link a chain');
 check(P.extend(14,1)&&P.path.length===3,'slurp: dragging back undoes the last step');
 P.extend(15,1);check(P.finish()&&P.score>0,'slurp: letting go slurps 3+');
 run(g,40);check(!P.g[15][0],'slurp: trash next to the chain breaks');
 check(P.g[15][1]==null&&P.g[12][0]==null,'slurp: the chain is gone');
 // combo: two quick chains, then the trash goes out
 fill(P,{6:'000...',7:'111...',8:'222...',9:'333...'});P.inc=[];P.combo=0;P.comboT=0;P.comboJunk=0;
 P.start(10,0);P.extend(10,1);P.extend(10,2);P.finish();run(g,20);P.start(13,0);P.extend(13,1);P.extend(13,2);P.finish();
 check(P.combo===2,'slurp: quick chains build a combo');
 run(g,200);run(g,40);check(B.incoming()>0,'slurp: a combo sends trash ('+B.incoming()+')');
 // long chain sends on its own
 const {g:g2,P:P2,B:B2}=mk('slurp');fill(P2,{11:'00000011',10:'1.......'});P2.start(15,0);for(let c=1;c<6;c++)P2.extend(15,c);P2.finish();run(g2,200);
 check(B2.incoming()>=3,'slurp: a 6-chain sends 3+ ('+B2.incoming()+')');
 // landed trash drops on top
 B2.inc.forEach(i=>i.t=0);const n0=B2.g.flat().filter(t=>t&&t.t<0).length;run(g2,30);
 check(B2.g.flat().filter(t=>t&&t.t<0).length>n0,'slurp: incoming trash lands as trash bags');
 // snapshot
 const R=new E.RemoteBoard(g,'r1','R',2);R.apply(P.snap());check(R.ms&&R.ms.g.length===128&&R.ms.g.replace(/\./g,'').length===P.g.flat().filter(Boolean).length&&R.ms.p.length===8,'slurp: snapshot carries the 8x16 stack and next row');
 // rising: an idle board tops out
 const {g:g3,P:P3}=mk('slurp');let f=0;while(!P3.dead&&f<60*200){g3.step();f++}check(P3.dead&&f>60*20,'slurp: the stack rises and an idle player tops out ('+(f/60|0)+'s)');}
{const {g,P,B}=mk('buffet');
 fill(P,{9:'0011..',10:'0j13..',11:'2222..'});
 check(!P.grab(14,3)&&P.score===0,'buffet: a single food won\'t grab');
 check(P.grab(15,0)&&P.score>0,'buffet: tapping a group grabs it');
 run(g,40);check(!P.g.flat().some(t=>t&&t.t<0),'buffet: trash next to the group breaks');
 fill(P,{6:'00000000',7:'00000000'});P.grab(10,0);run(g,200);check(B.incoming()>=4,'buffet: a big plate sends trash ('+B.incoming()+')');}
for(const v of ['slurp','buffet'])for(const d of [0,1,2]){const g=new E.Game('brawl',d,{},true,{variant:v,size:4});let f=0;while(!g.over&&f<60*600){g.step();f++}
  check(g.over&&f>60*30,`${v}: 4 bots finish on ${['Easy','Medium','Hard'][d]} (${f/60|0}s)`)}

// power-ups: a badge food cleared racks an item; attacks hit the target, self items clean your board
{const {g,P,B}=mk('slurp');fill(P,{9:'000.....',11:'12341234'});P.g[13][1].sp='sauce';
 P.start(13,0);P.extend(13,1);P.extend(13,2);P.finish();check(P.rack.length===1&&P.rack[0].k==='sauce','items: clearing a badge food racks its item');
 P.fire(0);run(g,60);check(B.rushT>0,'items: Hot sauce makes the target\'s stack rise fast');
 const r0=B.rise;run(g,30);check(B.rise>r0||B.rushT>0,'items: ...and it climbs');
 P.earn({k:'freeze'});P.fire(0);run(g,60);check(B.frozenT>0&&!B.start(15,0),'items: Brain freeze stops the target playing');
 P.earn({k:'steam'});P.fire(0);run(g,60);check(B.steamT>0,'items: Steam clouds the target');
 const n0=P.g.flat().filter(Boolean).length;P.earn({k:'pin'});P.fire(0);check(P.g.flat().filter(Boolean).length<n0,'items: Rolling pin flattens your top rows');
 fill(P,{10:'22220000',11:'22221111'});P.earn({k:'plate'});P.fire(0);check(!P.g.flat().some(t=>t&&t.t===2),'items: Clean plate clears your most common food');
 fill(P,{11:'44444444'});const before=B.g.map(r=>r.map(t=>t&&t.t).join()).join('|');P.earn({k:'swap'});P.fire(0);run(g,60);
 check(P.g.map(r=>r.map(t=>t&&t.t).join()).join('|')===before||B.g.flat().filter(t=>t&&t.t===4).length>=8,'items: Switcheroo trades stacks');
 const R=new E.RemoteBoard(g,'r2','R2',3);const code=B.gridCode();check(code.g.length===128&&P.loadGrid(code),'items: stacks trade across phones as a code');}
// Raise: holding it pushes the stack up faster
{const {P}=mk('buffet');const v0=P.speed();P.raising=true;const v1=P.speed();check(v1>v0*3,'raise: holding Raise brings the stack up much faster ('+(v1/v0).toFixed(1)+'x)');}
