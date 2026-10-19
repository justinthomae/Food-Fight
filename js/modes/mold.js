// Mold Patrol: Snack Stack's falling pairs, but your kitchen starts with mouldy food scattered in the lower half.
// A mouldy food is a normal food that clears when it's part of a popped group of 4+. Clean every spot of mould first and you win
// (knock-outs still count). Chains throw trash; when trash lands on you, every 4th unit turns one of your clean foods mouldy.
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const Stack=E.BOARD_TYPES.stack||(typeof module!=='undefined'?require('../stack.js'):null);
const {COLS,ROWS,NT,T}=E;
const SPAWN_C=2;
const START=[8,10,12];          // mould spots at the start, by difficulty (online games play Medium)
const MOLD_W=[10,26,40];
const SPREAD=60*20;             // mould creeps onto a neighbour every 20 seconds        // how much bots care about cleaning mould

class MoldBoard extends Stack{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{exact:true,orders:0,startF:game.frame,moldMode:true,held:null,heldUsed:false});
    // a fresh kitchen: short columns of food in the lower half, some of it mouldy (same layout for everyone: same seed)
    this.g=[];for(let r=0;r<ROWS;r++)this.g.push(new Array(COLS).fill(null));
    const n=START[game.d|0]||10,hs=[];
    for(let c=0;c<COLS;c++)hs.push(3+Math.floor(this.rng()*4));   // 3..6 high
    hs[SPAWN_C]=Math.min(hs[SPAWN_C],4);hs[SPAWN_C+1]=Math.min(hs[SPAWN_C+1],5);
    const cells=[];
    for(let c=0;c<COLS;c++)for(let k=0;k<hs[c];k++){const r=ROWS-1-k;this.g[r][c]=T(Math.floor(this.rng()*NT));cells.push([r,c])}
    // mould sits mostly deep down, under other food (like germs at the bottom of a jar)
    cells.forEach(x=>{x[2]=(ROWS-1-x[0])+this.rng()*6});cells.sort((a,b)=>a[2]-b[2]);
    cells.slice(0,n).forEach(([r,c])=>{this.g[r][c].mold=true});
    this.breakGroups();
    this.queue=[];for(let i=0;i<3;i++)this.queue.push(this.pair());
  }
  // no power-ups in this mode: plain pairs
  pair(){return [Math.floor(this.rng()*NT),Math.floor(this.rng()*NT),null,null]}
  // mould grows: every so often a clean food touching mould turns mouldy too
  step(){
    super.step();
    if(this.dead||this.game.over)return;
    const t=this.game.frame-this.startF;
    if(t>0&&t%SPREAD===0&&(this.state==='fall'||this.state==='spawn'))this.spread();
  }
  spread(){
    const cand=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(!t||t.t<0||t.mold||t.clr>0)continue;
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>{const u=this.g[r+dr]&&this.g[r+dr][c+dc];return u&&u.mold&&!(u.clr>0)}))cand.push(t)}
    if(!cand.length)return false;
    cand[Math.floor(Math.random()*cand.length)].mold=true;
    this.pop('The mould is spreading!',3,4.5,'#9BE07A',.85);this.sfx('uhoh');return true;
  }
  incoming(){return this.inc.reduce((a,i)=>a+i.cells,0)}
  moldLeft(){let n=0;this.each(t=>{if(t.mold&&!(t.clr>0))n++});return n}
  moldTotal(){return this.orders+this.moldLeft()}
  win(){if(this.dead||this.game.over)return;this.wonRace=true;this.game.orderDone(this)}
  resolve(){
    super.resolve();
    if(this.state!=='pop')return;
    let n=0;this.each(t=>{if(t.mold&&t.clr>0&&!t.counted){t.counted=1;n++}});
    if(!n)return;
    this.orders+=n;this.score+=n*60;
    const left=this.moldLeft();
    this.pop(left?(n>1?`${n} mould cleaned!`:'Mould cleaned!'):'Spotless!',3,3.6,'#9BE07A',left?1:1.3);
    this.sfx(left?'snack':'feast');
    if(!left)this.win();
  }
  // trash landing: every 4th unit plants mould on one of your clean foods, the rest fall in as trash bags
  dropIncoming(){
    let cells=0;
    while(this.inc.length&&this.inc[0].t<=0&&cells<30){const it=this.inc[0],m=Math.min(30-cells,it.cells);cells+=m;it.cells-=m;if(it.cells<=0)this.inc.shift()}
    if(!cells)return false;
    const molds=Math.floor(cells/4);let bags=cells-molds,planted=0;
    const clean=[];this.each(t=>{if(t.t>=0&&!t.mold&&!(t.clr>0))clean.push(t)});
    for(let i=0;i<molds;i++){if(clean.length){clean.splice(Math.floor(Math.random()*clean.length),1)[0].mold=true;planted++}else bags++}
    const order=[0,1,2,3,4,5];
    for(let i=0;i<bags;i++){
      if(i%COLS===0)for(let k=5;k>0;k--){const j=Math.floor(Math.random()*(k+1));[order[k],order[j]]=[order[j],order[k]]}
      const c=order[i%COLS];let top=0;while(top<ROWS&&!this.g[top][c])top++;
      if(top===0)continue;
      const t=T(-1);t.yo=-(top+1);this.g[top-1][c]=t;
    }
    if(planted){this.pop(`+${planted} mould!`,3,5,'#9BE07A',1.05);this.hitFlash=24}
    this.shake=8;this.sfx('junk');
    this.state='settle';
    return true;
  }
  snap(){
    const grid=this.g.map(row=>row.slice());
    if(this.piece)this.cells(this.piece).forEach(([r,c,t])=>{if(r>=0&&r<ROWS&&c>=0&&c<COLS)grid[r][c]={t,clr:0}});
    return {id:this.id,g:E.BaseBoard.prototype.gridString.call(this,grid),p:'',r:0,k:0,q:this.orders,h:0,c:this.steamT>0?1:0,z:this.frozenT>0?1:0,o:this.kos,d:this.dead?1:0,x:0};
  }
  // ---------- bot: Snack Stack's brain, plus a strong pull towards popping mould ----------
  evaluate(c,rot,a,b){
    const p={a,b,c,r:1,rot};if(!this.fits(p))return null;
    while(this.fits(Object.assign({},p,{r:p.r+1})))p.r++;
    const g=this.g.map(row=>row.map(t=>t?t.t:null)),m=this.g.map(row=>row.map(t=>!!(t&&t.mold)));
    this.cells(p).sort((x,y)=>y[0]-x[0]).forEach(([r,cc,t])=>{if(r>=0){g[r][cc]=t;m[r][cc]=false}});
    const fallG=()=>{for(let cc=0;cc<COLS;cc++){let w=ROWS-1;for(let r=ROWS-1;r>=0;r--){if(g[r][cc]==null)continue;const v=g[r][cc],mm=m[r][cc];g[r][cc]=null;m[r][cc]=false;g[w][cc]=v;m[w][cc]=mm;w--}}};
    fallG();
    let chains=0,popped=0,molds=0;
    for(;;){
      const seen=new Set(),kill=[];
      for(let r=0;r<ROWS;r++)for(let cc=0;cc<COLS;cc++){const v=g[r][cc];if(v==null||v<0||seen.has(r*COLS+cc))continue;
        const grp=[],q=[[r,cc]];seen.add(r*COLS+cc);
        while(q.length){const [rr,c2]=q.pop();grp.push([rr,c2]);for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const r2=rr+dr,c3=c2+dc;if(r2<0||r2>=ROWS||c3<0||c3>=COLS||seen.has(r2*COLS+c3)||g[r2][c3]!==v)continue;seen.add(r2*COLS+c3);q.push([r2,c3])}}
        if(grp.length>=4)kill.push(...grp)}
      if(!kill.length)break;
      chains++;popped+=kill.length;kill.forEach(([r,cc])=>{if(m[r][cc])molds++;g[r][cc]=null;m[r][cc]=false});fallG();
    }
    let adj=0,adjM=0,h=0;
    for(let r=0;r<ROWS;r++)for(let cc=0;cc<COLS;cc++){const v=g[r][cc];if(v==null)continue;h=Math.max(h,ROWS-r);if(v>=0){
      if(cc<COLS-1&&g[r][cc+1]===v){adj++;if(m[r][cc]||m[r][cc+1])adjM++}
      if(r<ROWS-1&&g[r+1][cc]===v){adj++;if(m[r][cc]||m[r+1][cc])adjM++}}}
    const spawnH=(()=>{let k=0;while(k<ROWS&&g[k][SPAWN_C]==null)k++;return ROWS-k})();
    const d=this.game.d|0,care=[2.6,1.3,1][d];   // Easy is sloppy but at least tries not to choke
    return chains*chains*30+popped*3+molds*MOLD_W[d]+adjM*MOLD_W[d]*.12+adj*2-(h*h*.25+spawnH*spawnH*.4)*care-(spawnH>=8?150:0)-(g[0][SPAWN_C]!=null||g[1][SPAWN_C]!=null?500:0);
  }
  ai(){
    // the starting kitchen is already half full, so a slow thinker must still decide before the pair lands in the middle
    if(!this.plan&&this.state==='fall'&&this.piece&&this.think>0){
      let k=Math.floor(this.piece.r)+1;while(k<ROWS&&!this.g[k][this.piece.c])k++;
      const frames=Math.max(10,(k-this.piece.r-1)/this.speed())*.45;if(this.think>frames)this.think=Math.floor(frames);
    }
    super.ai();
  }
}
E.RACE.add('mold');
E.BOARD_TYPES.mold=MoldBoard;if(!E.VARIANTS.includes('mold'))E.VARIANTS.push('mold');
if(typeof module!=='undefined')module.exports=MoldBoard;
})();
