// Bot-only matches: confirm special tiles appear, items get earned/used, and matches still end in reasonable time.
const E=require('../js/engine.js');
const tally={};let ends=[];
for(let i=0;i<6;i++){
  const g=new E.Game(i%2?'brawl':'duel',1,{},true);
  const orig={cream:E.Board.prototype.cream,freeze:E.Board.prototype.freeze,blend:E.Board.prototype.blend,flatten:E.Board.prototype.flatten};
  for(const k in orig)E.Board.prototype[k]=function(...a){tally[k]=(tally[k]||0)+1;return orig[k].apply(this,a)};
  let f=0;while(!g.over&&f<60*600){g.step();f++}
  for(const k in orig)E.Board.prototype[k]=orig[k];
  ends.push((i%2?'brawl ':'duel ')+Math.round(f/60)+'s');
}
console.log('effects used:',JSON.stringify(tally));
console.log('match lengths:',ends.join(', '));
