// Cook levels, unlocks and the daily challenge schedule (js/progress.js). Usage: node test/progress.js
const store={};
globalThis.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
require('../js/progress.js');
const P=globalThis.FFProgress;
let fails=0;const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};

check(P.levelOf(0)===1&&P.levelOf(99)===1&&P.levelOf(100)===2&&P.levelOf(299)===2&&P.levelOf(300)===3&&P.levelOf(1000)===5,'level thresholds 0/100/300/1000');
for(let n=1;n<40;n++)if(P.levelOf(P.xpFor(n))!==n||P.levelOf(P.xpFor(n)-1)!==Math.max(1,n-1)){check(false,'levelOf matches xpFor at '+n);break}
check(true,'levelOf and xpFor agree up to level 40');

P._reset({xp:0,veteran:false});
check(P.unlocked('mode','classic')&&!P.unlocked('mode','boss')&&P.lockLevel('mode','boss')===3,'new cook: starter modes open, Boss at level 3');
check(!P.unlocked('fighter','glaze')&&P.unlocked('fighter','bun'),'new cook: starter fighters open');
check(P.unlocked('kitchen','market')&&!P.unlocked('kitchen','american'),'new cook: Farmers Market only');
check(P.unlocked('emote',0)&&!P.unlocked('emote',4),'emotes go by level');

let ev=P.apply({xp:120,xp_total:320});
check(ev.levelUp===3&&P.level()===3,'server total of 320 XP is level 3');
check(ev.rewards.some(r=>r.key==='boss')&&ev.rewards.some(r=>r.key==='fudge')&&ev.rewards.some(r=>r.text==='New title: Prep Cook'),'level-up lists everything unlocked on the way');
check(P.unlocked('mode','boss')&&P.title()==='Prep Cook','unlocks and title follow the level');
ev=P.apply({xp:0,xp_total:320});
check(ev.levelUp===0&&ev.rewards.length===0,'same total again: no level-up');
check(P.apply({xp:5})===null,'an answer without a total changes nothing');

P._reset({xp:0,veteran:true});
check(P.unlocked('mode','pest')&&P.unlocked('fighter','glaze')&&P.unlocked('kitchen','asian'),'veterans keep every mode, fighter and kitchen');
check(!P.unlocked('emote',9),'veterans still earn the top emotes');
check(P.rewardsAt(2).every(r=>r.kind!=='mode'),'veterans are not told about modes they already have');

// migration: a player with old scores becomes a veteran on first run
for(const k in store)delete store[k];
store['ff-scores']=JSON.stringify({'brawl-1':[{score:5}]});
delete require.cache[require.resolve('../js/progress.js')];require('../js/progress.js');
check(globalThis.FFProgress.veteran,'existing players are veterans on first run');
for(const k in store)delete store[k];
delete require.cache[require.resolve('../js/progress.js')];require('../js/progress.js');
const Q=globalThis.FFProgress;
check(!Q.veteran,'a brand-new device is not a veteran');

// daily
const d1=Q.daily(new Date(Date.UTC(2026,10,23,1))),d2=Q.daily(new Date(Date.UTC(2026,10,23,23)));
check(d1.key==='20261123'&&JSON.stringify(d1)===JSON.stringify(d2),'same UTC day, same daily match');
const variants=new Set();for(let i=0;i<30;i++)variants.add(Q.daily(new Date(Date.UTC(2026,0,1+i))).variant);
check(variants.size>=5,'daily mode changes from day to day ('+variants.size+' modes in 30 days)');
check(Q.daily(null,['classic']).variant==='classic','daily only picks modes this build has');
let s=Q.recordDaily(Q.dayKey(),900);
check(s.played&&s.best===900&&s.streak===1,'first daily: streak 1');
s=Q.recordDaily(Q.dayKey(),400);
check(s.best===900&&s.streak===1,'replaying keeps the best and the streak');
const y=Q.dayKey(new Date(Date.now()-864e5));store['ff-daily']=JSON.stringify({last:y,streak:4,best:{}});
s=Q.recordDaily(Q.dayKey(),10);check(s.streak===5,'playing the day after keeps the streak going');
store['ff-daily']=JSON.stringify({last:'20200101',streak:9,best:{}});
check(Q.dailyState().streak===0,'a missed day breaks the streak');
check(Q.recordDaily('20200101',5).played===false,'an old day cannot be recorded');
check(Q.msToNextDay()>0&&Q.msToNextDay()<=864e5,'time to the next daily is within a day');

console.log(fails?fails+' failed':'all progress checks passed');process.exitCode=fails?1:0;
