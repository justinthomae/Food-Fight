// Food streaks: same food in back-to-back matches -> x2 double points, x3 snack attack (steal + clean junk), x4 feast.
const E=require('../js/engine.js');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const tile=t=>({t,id:Math.random(),st:'idle',tm:0,clr:0,conv:false,chain:false,yo:0,xo:0,gid:0});
const g=new E.Game('duel',1,{},false,{av:'bun'});const P=g.player,bot=g.boards[1];
bot.think=1e9;bot.fireT=1e9;           // keep the bot still
const clear=()=>{for(let r=0;r<E.ROWS;r++)for(let c=0;c<E.COLS;c++)P.g[r][c]=null};
const settle=(n=90)=>{for(let i=0;i<n;i++){P.stop=999;P.rise=0;g.step()}};
const row=(r,str)=>{[...str].forEach((ch,c)=>{P.g[r][c]=ch==='.'?null:ch==='J'?Object.assign(tile(-1),{gid:99}):tile(+ch)})};
clear();row(11,'000123');row(10,'...412');settle();
ok(P.streak===1&&P.streakType===0,'first tomato clear starts a streak');
let before=P.score;row(11,'000'+row11tail());settle();
function row11tail(){return [3,4,5].map(c=>P.g[11][c]?String(P.g[11][c].t):'.').join('')}
const gain2=P.score-before;
ok(P.streak===2&&gain2>=60,'second tomato clear: x2 and double points (+'+gain2+')');
bot.rack.push({k:'freeze',cells:0,id:1});
row(9,'J.....');row(8,'J.....');      // two junk blocks to clean up
const rackBefore=P.rack.length;
row(11,'000'+row11tail());settle(140);
ok(P.streak===3,'third tomato clear: x3');
ok(P.rack.length===rackBefore+1&&P.rack[P.rack.length-1].k==='freeze'&&bot.rack.length===0,'snack attack steals the bot\'s freeze');
ok(!P.g.flat().some(t=>t&&t.t<0),'snack attack turned the junk back into food');
clear();row(11,'000123');row(10,'0.01..');row(9,'..10..');settle();
const tomatoesLeft=P.g.flat().filter(t=>t&&t.t===0).length;
ok(P.streak===0&&P.streakType===null&&tomatoesLeft===0&&P.feasts===1,'fourth: FEAST clears every tomato, streak resets');
clear();row(11,'111023');settle();
ok(P.streak===1&&P.streakType===1,'a different food starts a new streak');
