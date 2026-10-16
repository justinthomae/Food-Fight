// Junk lands where the thrower made it: same columns, wedged at the same row, tiles above pushed up.
const E=require('../js/engine.js');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const col=(b,c)=>b.g.map(r=>r[c]?(r[c].t<0?'J':String(r[c].t)):'.').join('');
const g=new E.Game('duel',1,{},true,{seed:7});const b=g.player;
const before=[0,1,2,3].map(c=>col(b,c));
b.dropJunk(3,{c:1,r:10.5});
ok([0,1,2].every(c=>col(b,c)[10]==='J'),'3-wide pie wedged into columns 0-2 at row 10');
ok([0,1,2].every(c=>col(b,c).replace(/\./g,'').length===before[c].replace(/\./g,'').length+1),'each column grew by exactly one (pushed up, nothing lost)');
ok(col(b,3)===before[3],'column 3 untouched');
const h5=col(b,5).indexOf(col(b,5).replace(/^\.+/,'')[0]);
b.dropJunk(2,{c:5.5,r:1});
ok(col(b,5)[h5-1]==='J'&&col(b,4)[col(b,4).search(/[^.]/)]==='J','drop aimed above the stack lands on top of columns 4-5');
const g2=new E.Game('duel',1,{},true,{seed:7});const b2=g2.player;
b2.dropJunk(12,{c:3,r:11});
ok(b2.g[11].every(t=>t&&t.t<0)&&b2.g[10].every(t=>t&&t.t<0),'tower of 2 rows wedged at the bottom row');
const g3=new E.Game('duel',1,{},true,{seed:7});const b3=g3.player;
b3.dropJunk(4,null);
ok(b3.g.some(r=>r.some(t=>t&&t.t<0)),'attacks without a position still drop on top');
