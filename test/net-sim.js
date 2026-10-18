// Simulates an online match: several clients, each with its own Game, joined by a fake broadcast bus with latency.
const E=require('../js/engine.js');
const stats={};
function match(nHumans,nBots,seed){
  const ids=Array.from({length:nHumans},(_,i)=>'p'+i);
  const roster=ids.map(id=>({id,name:id.toUpperCase()}));
  for(let i=0;i<nBots;i++)roster.push({id:'bot:p0:'+i,name:'Bot'+i,bot:true,owner:'p0'});
  const queue=[],clients={};let tick=0;
  ids.forEach(id=>{
    const hooks={send:m=>queue.push({at:tick+2+Math.floor(Math.random()*6),from:id,m:JSON.parse(JSON.stringify(m))})};
    clients[id]=new E.Game('online',1,hooks,true,{roster,myId:id,seed});
  });
  const deliver=(c,m)=>{stats[m.t]=(stats[m.t]||0)+1;if(m.t==='snaps')c.netSnaps(m.list);else if(m.t==='atk')c.netAttack(m);else if(m.t==='ko')c.netKO(m.id,m.by);else if(m.t==='steal')c.netSteal(m);else if(m.t==='give')c.netGive(m);else if(m.t==='swapg')c.netSwapGrid(m)};
  while(tick<60*900&&!Object.values(clients).every(c=>c.over)){
    tick++;
    for(let i=queue.length-1;i>=0;i--){const q=queue[i];if(q.at<=tick){queue.splice(i,1);for(const id in clients)if(id!==q.from)deliver(clients[id],q.m)}}
    for(const id in clients)clients[id].step();
  }
  const out={sec:Math.round(tick/60)};
  out.views=Object.entries(clients).map(([id,c])=>id+': over='+c.over+' winner='+(c.result&&c.result.winner?c.result.winner.id:'-')+' dead=['+c.boards.map(b=>b.dead?1:0).join('')+']');
  out.sameStart=JSON.stringify(clients.p0.byId('p0').snap().g!==undefined);
  return out;
}
// identical seeds -> identical starting boards
{const r=[{id:'a',name:'A'},{id:'b',name:'B'}];const g1=new E.Game('online',1,{},true,{roster:r,myId:'a',seed:42}),g2=new E.Game('online',1,{},true,{roster:r,myId:'b',seed:42});
 console.log('same start grid:',g1.player.snap().g===g2.player.snap().g);}
for(let i=0;i<3;i++)console.log(JSON.stringify(match(2,0,100+i)));
for(let i=0;i<3;i++)console.log(JSON.stringify(match(3,1,200+i)));
console.log(JSON.stringify(match(4,0,300)));
console.log(JSON.stringify(match(8,0,400)));
console.log(JSON.stringify(match(3,5,500)));

console.log('messages delivered by type:',JSON.stringify(stats));
