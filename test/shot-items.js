// Splat Shot items: earned from badge foods, thrown or armed, and every effect does something
const E=require('../js/engine.js');require('../js/shot.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
// bots playing: items get earned and used
const used={};let earned=0;
for(let k=0;k<6;k++){
  const g=new E.Game('brawl',1,{},true,{variant:'shot',size:4});
  g.boards.forEach(b=>{const e=b.earn.bind(b),f=b.fire.bind(b);b.earn=(it,...a)=>{earned++;return e(it,...a)};b.fire=i=>{const it=b.rack[i];const r=f(i);if(r&&it)used[it.k]=(used[it.k]||0)+1;return r}});
  let fr=0;while(!g.over&&fr<60*400){g.step();fr++}
}
console.log('earned',earned,'used',JSON.stringify(used));
check(earned>20,'bots earn items from badge foods');
check(Object.keys(used).length>=6,'bots use most item kinds');
// each effect
const g=new E.Game('duel',1,{},false,{variant:'shot'});const P=g.player,B=g.boards[1];
B.steam(P);check(B.steamT>0,'steam fogs the target');
B.grease(P);const a0=B.aimA;for(let i=0;i<30;i++)B.step();check(B.greaseT>0&&B.aimA!==a0,'grease makes the aim wobble');
const rows0=B.lowest(),wasBot=B.isBot;B.isBot=false;B.rush(P);for(let i=0;i<130;i++)B.step();B.isBot=wasBot;check(B.lowest()>rows0,'hot sauce drops the ceiling');
B.freeze(P);check(!B.canAct(),'brain freeze stops throws');
// rainbow: lands as the food that makes the biggest group
P.h.forEach(r=>r.fill(null));for(let c=0;c<7;c++)P.h[0][c]={t:c<4?2:1};
P.armed='rainbow';P.cool=0;P.cur=4;P.setAim(-Math.PI/2+.35);P.shoot();for(let i=0;i<80&&P.ball;i++)P.step();
check(P.h[0].filter(Boolean).length<7,'rainbow throw pops a group it was not the colour of');
// bomb
P.h.forEach(r=>r.fill(null));for(let r=0;r<4;r++)for(let c=0;c<P.width(r);c++)P.h[r][c]={t:-1};
const n0=P.h.flat().filter(Boolean).length;P.armed='bomb';P.cool=0;P.setAim(-Math.PI/2);P.shoot();for(let i=0;i<80&&P.ball;i++)P.step();
check(P.h.flat().filter(Boolean).length<n0-4,'chili bomb blasts junk too');
// swap between two shot boards
const before=P.gridCode(),theirs=B.gridCode();g.swapBoards(B,P,{k:'swap'});
check(JSON.stringify(P.gridCode().h)===JSON.stringify(theirs.h)&&JSON.stringify(B.gridCode().h)===JSON.stringify(before.h),'switcheroo trades Splat Shot boards');
const Z=new E.Game('duel',1,{},false,{variant:'shot'}).player;check(Z.loadGrid(theirs)&&JSON.stringify(Z.gridCode().h)===JSON.stringify(theirs.h),'Splat Shot board code round-trips');
