// Clean plate: clears every tile of one food on your own board
const E=require('../js/engine.js');
const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const picks=[];
const g=new E.Game('duel',1,{pickFood:it=>{picks.push(it);return true}},false,{});
const P=g.player,B=g.boards[1];
const count=(b,f)=>b.g.flat().filter(t=>t&&t.t===f&&t.clr===0).length;
P.earn({k:'plate'},3,5);
check(P.rack.length===1&&P.rack[0].k==='plate','plate goes in the rack');
P.fire(0);
check(picks.length===1&&P.rack.length===1,'player tap asks for a food instead of firing');
const f=P.g[11][0].t,before=count(P,f);
P.fire(0,f);
check(P.rack.length===0&&count(P,f)===0&&before>0,`chosen food (${before} tiles) all clearing`);
for(let i=0;i<120;i++)g.step();
check(!P.g.flat().some(t=>t&&t.t===f&&t.clr>0)&&!P.dead,'tiles gone after the pop, board fine');
const idle=(b,f)=>b.g.flat().filter(t=>t&&t.t===f&&t.clr===0&&t.st==='idle').length;const cf=B.commonFood(),cb=idle(B,cf);B.earn({k:'plate'},3,5);B.fire(B.rack.findIndex(x=>x.k==='plate'));
check(idle(B,cf)===0&&cb>0,'bots and overflow auto-pick the most common food');
const thief=g.boards[1];P.earn({k:'plate'},3,5);const it=P.stealFrom(thief);
check(it&&it.k==='plate','plates can be stolen');
check(E.SPECIALS.includes('plate'),'plate is in the special-tile pool');
// spawn rate check
let n=0,tot=0;const rng=E.mulberry32(7);for(let i=0;i<20000;i++){const b=new E.Game('duel',1,{},false,{seed:i}).player;b.previewSp&&b.previewSp.forEach(x=>{if(x){tot++;if(x==='plate')n++}})}
check(tot>0&&n/tot>.1&&n/tot<.25,`plates are ${(100*n/tot).toFixed(0)}% of special tiles`);
