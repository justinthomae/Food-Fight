// Recipe Merge: a 5x5 kitchen counter of ingredients, 2048 style. Swipe and every ingredient slides that way;
// two of the same that meet cook into the next dish up the recipe ladder (each tile cooks once per swipe).
// After every swipe that changed something a fresh Wheat (sometimes Flour) appears. Cooking Bread or better throws trash;
// a Feast is served straight away and dumps a big load. Trash bags sit still (tiles stop against them) and are cleared
// by cooking right next to them. No swipe left that changes anything = knocked out.
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const N=5,TOP=10,TRASH=-1;
const TIERS=['','Wheat','Flour','Dough','Bread','Sandwich','Burger','Pizza','Pasta','Cake','Feast'];
const DIRS={L:[0,-1],R:[0,1],U:[-1,0],D:[1,0]};
// bots: frames between swipes, chance of a random swipe
const BOT={think:[[60,100],[24,38],[11,17]],rand:[.38,.07,0]};

// slide one line (array of cells, first element = the wall you slide towards). Trash splits the line into segments.
// returns {out, moves:[[from,to,tier]], merges:[[to,newTier]]}
function slideLine(line){
  const out=line.slice(),moves=[],merges=[];let i=0;
  while(i<line.length){
    if(line[i]===TRASH){i++;continue}
    let j=i;while(j<line.length&&line[j]!==TRASH)j++;   // segment [i,j)
    let w=i,last=-1;   // write index; index of last placed tile that may still merge
    for(let k=i;k<j;k++)out[k]=0;
    for(let k=i;k<j;k++){const v=line[k];if(!v)continue;
      if(last>=0&&out[last]===v&&v<TOP){out[last]=v+1;moves.push([k,last,v]);merges.push([last,v+1]);last=-1}
      else{out[w]=v;moves.push([k,w,v]);last=w;w++}}
    i=j;
  }
  return {out,moves,merges};
}
function lineCells(dir,n){   // the cells of line n, starting at the wall the tiles slide towards
  const out=[];for(let k=0;k<N;k++){
    if(dir==='L')out.push([n,k]);else if(dir==='R')out.push([n,N-1-k]);
    else if(dir==='U')out.push([k,n]);else out.push([N-1-k,n])}
  return out;
}
// the whole board: new grid + what moved and what cooked (no spawn)
function simulate(m,dir){
  const g=m.map(r=>r.slice()),moves=[],merges=[];let changed=false;
  for(let n=0;n<N;n++){
    const cells=lineCells(dir,n),line=cells.map(([r,c])=>m[r][c]),res=slideLine(line);
    cells.forEach(([r,c],k)=>{if(g[r][c]!==res.out[k])changed=true;g[r][c]=res.out[k]});
    res.moves.forEach(([a,b,t])=>moves.push({t,fr:cells[a][0],fc:cells[a][1],tr:cells[b][0],tc:cells[b][1]}));
    res.merges.forEach(([b,t])=>merges.push({r:cells[b][0],c:cells[b][1],t}));
  }
  // cooking Bread or better clears trash bags right next to it
  const cleared=[];
  merges.forEach(({r,c,t})=>t>=4&&[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const rr=r+dr,cc=c+dc;if(rr>=0&&rr<N&&cc>=0&&cc<N&&g[rr][cc]===TRASH){g[rr][cc]=0;cleared.push([rr,cc]);changed=true}}));
  return {g,moves,merges,cleared,changed};
}
function canMove(m){for(const d of 'LRUD')if(simulate(m,d).changed)return true;return false}

class MergeBoard extends E.BaseBoard{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{merge:true,best:1,served:0,moves:0,think:50,anim:null,cool:0,queued:null});
    this.m=[];for(let r=0;r<N;r++)this.m.push(new Array(N).fill(0));
    this.spawn();this.spawn();
  }
  secs(){return (this.game.frame-this.startF)/60}
  empties(){const e=[];for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(!this.m[r][c])e.push([r,c]);return e}
  spawn(){const e=this.empties();if(!e.length)return null;const [r,c]=e[Math.floor(this.rng()*e.length)];
    // after a minute and a half the deliveries get mixed: some Flour and Dough turn up too
    const x=this.rng(),late=this.secs()>90;this.m[r][c]=late?(x<.06?3:x<.3?2:1):(x<.1?2:1);return [r,c]}
  filled(){let n=0;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(this.m[r][c])n++;return n}
  height(){return Math.round(this.filled()/(N*N)*12)}
  canAct(){return !this.dead&&!this.game.over}
  // one swipe
  swipe(dir){
    if(!this.canAct()||!DIRS[dir])return false;
    const res=simulate(this.m,dir);
    if(!res.changed){if(this.mine)this.shake=4;return false}
    this.m=res.g;this.moves++;
    let atk=0,pts=0,top=0;
    const served=[];
    res.merges.forEach(({r,c,t})=>{pts+=Math.pow(2,t);top=Math.max(top,t);if(t>=4)atk+=t-3;
      if(t>=TOP){served.push([r,c]);this.m[r][c]=0;this.served++;atk+=8-(t-3)}});   // a Feast is served at once: the plate leaves the counter
    if(res.merges.length>=3)atk+=Math.floor(res.merges.length/3);   // lots of cooking in one swipe
    if(top>this.best)this.best=Math.min(TOP,top);
    this.maxCombo=Math.max(this.maxCombo,res.merges.length);this.maxChain=Math.max(this.maxChain,res.merges.length);
    this.score+=pts;
    const sp=[];const a=this.spawn();if(a)sp.push(a);
    // later on, ingredients start arriving two at a time
    const s=this.secs(),extra=s<45?0:Math.min(2,(s-45)/75);   // 45s+: sometimes two, 2m+: always two, 3m+: up to three
    for(let k=0;k<2;k++)if(this.rng()<extra-k){const b=this.spawn();if(b)sp.push(b)}
    this.anim={f:this.game.frame,moves:res.moves,merges:res.merges,spawned:sp,cleared:res.cleared,served};
    // feedback
    if(served.length){this.pop('FEAST!',3,4.6,'#F7C548',1.4,90);this.sfx('feast');this.shake=10}
    else if(top>=4){this.pop(TIERS[top]+'!',3,4.6,top>=7?'#F7C548':'#EEF0FA',top>=7?1.15:.9);this.sfx(top>=7?'helping':'snack')}
    else if(res.merges.length)this.sfx('match',Math.min(5,res.merges.length+1));
    else this.sfx('tap');
    if(res.merges.length>=3)this.pop(`${res.merges.length} at once!`,3,5.6,'#CC79A7',.8);
    res.cleared.forEach(([r,c])=>this.burst(...this.cellXY(r,c),-1,7));
    if(res.cleared.length)this.sfx('wipe');
    if(atk>0)this.sendJunk(atk);
    if(!canMove(this.m))this.die();
    return true;
  }
  // board units of a cell centre (for pops/particles): the counter sits at the bottom of the 6x12 board
  cellXY(r,c){const cs=5.7/N,x0=.15,y0=12-5.7-.25;return [x0+(c+.5)*cs,y0+(r+.5)*cs]}
  landTrash(){
    if(!this.inc.some(i=>i.t<=0))return;
    const n=this.takeIncoming(6);if(!n)return;
    let put=0;for(let i=0;i<n;i++){const e=this.empties();if(!e.length)break;const [r,c]=e[Math.floor(this.rng()*e.length)];this.m[r][c]=TRASH;put++;
      if(this.anim)this.anim.trash=(this.anim.trash||[]).concat([[r,c]]);else this.anim={f:this.game.frame-6,moves:[],merges:[],spawned:[],cleared:[],served:[],trash:[[r,c]]}}
    this.trashAt=this.game.frame;this.trashCells=put;
    this.shake=8;this.sfx('junk');
    if(!canMove(this.m))this.die();
  }
  step(){
    if(this.dead)return;this.tickBase();
    this.landTrash();
    // closing time: after 2.5 minutes a bag of trash drops on the counter every few seconds, faster and faster
    const s=this.secs();
    if(s>150&&!this.dead){const every=Math.max(2.5,10-(s-150)/12)*60;if(!this.closeAt)this.closeAt=this.game.frame+every;
      if(this.game.frame>=this.closeAt){this.closeAt=this.game.frame+every;
        if(!this.closingSaid){this.closingSaid=1;this.pop("Kitchen's closing!",3,3.2,'#E5682A',1.05,90)}
        this.inc.push({cells:1,t:0,T:1,from:null});this.landTrash()}}
    if(this.dead)return;
    if(this.isBot)this.ai();
  }
  // ---------- bot ----------
  evalGrid(g,res){
    let empty=0,mono=0,smooth=0,max=0,mr=0,mc=0,trash=0;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){const v=g[r][c];if(!v)empty++;else if(v===TRASH)trash++;else if(v>max){max=v;mr=r;mc=c}}
    // tiles getting bigger towards one edge, in rows and in columns
    for(let r=0;r<N;r++){let a=0,b=0;for(let c=0;c<N-1;c++){const x=Math.max(0,g[r][c]),y=Math.max(0,g[r][c+1]);if(x>y)a+=x-y;else b+=y-x}mono-=Math.min(a,b)}
    for(let c=0;c<N;c++){let a=0,b=0;for(let r=0;r<N-1;r++){const x=Math.max(0,g[r][c]),y=Math.max(0,g[r+1][c]);if(x>y)a+=x-y;else b+=y-x}mono-=Math.min(a,b)}
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){const v=g[r][c];if(v<=0)continue;if(c<N-1&&g[r][c+1]>0)smooth-=Math.abs(v-g[r][c+1]);if(r<N-1&&g[r+1][c]>0)smooth-=Math.abs(v-g[r+1][c])}
    const corner=(mr===0||mr===N-1)&&(mc===0||mc===N-1)?max*2:0;
    const cook=res?res.merges.reduce((a,x)=>a+x.t,0)+res.cleared.length*4:0;
    return empty*12+mono*2.2+smooth*1.1+corner+cook*2-trash*3;
  }
  ai(){
    if(--this.think>0)return;
    const d=this.game.d|0,[a,b]=BOT.think[d];this.think=a+Math.floor(Math.random()*(b-a+1));
    if(this.inc.length&&d===0)this.think+=10;
    const opts=[];for(const dir of 'LRUD'){const res=simulate(this.m,dir);if(!res.changed)continue;
      // look one swipe further on Medium / Hard
      let v=this.evalGrid(res.g,res);
      if(d>=1){let bb=-1e9;for(const d2 of 'LRUD'){const r2=simulate(res.g,d2);if(r2.changed)bb=Math.max(bb,this.evalGrid(r2.g,r2))}if(bb>-1e9)v=v*.5+bb*.5;else v-=200}
      opts.push({dir,v:v+(Math.random()-.5)*[18,4,0][d]})}
    if(!opts.length)return;
    let pick=opts.sort((x,y)=>y.v-x.v)[0];
    if(Math.random()<BOT.rand[d])pick=opts[Math.floor(Math.random()*opts.length)];
    this.swipe(pick.dir);
  }
  // ---------- online ----------
  code(){let s='';for(let r=0;r<N;r++)for(let c=0;c<N;c++){const v=this.m[r][c];s+=v===TRASH?'#':v?String.fromCharCode(96+v):'.'}return s}
  snap(){return {id:this.id,cv:1,ht:this.height(),i:this.incoming(),q:0,o:this.kos,d:this.dead?1:0,k:0,b:this.code(),bt:this.best,sv:this.served}}
}
// read a snapshot's grid back into numbers
MergeBoard.decode=s=>{const m=[];for(let r=0;r<N;r++){const row=[];for(let c=0;c<N;c++){const ch=(s||'')[r*N+c];row.push(ch==='#'?TRASH:ch&&ch!=='.'?Math.max(0,Math.min(TOP,ch.charCodeAt(0)-96)):0)}m.push(row)}return m};
MergeBoard.N=N;MergeBoard.TOP=TOP;MergeBoard.TIERS=TIERS;MergeBoard.simulate=simulate;MergeBoard.canMove=canMove;MergeBoard.slideLine=slideLine;
E.BOARD_TYPES.merge=MergeBoard;if(!E.VARIANTS.includes('merge'))E.VARIANTS.push('merge');
if(typeof module!=='undefined')module.exports=MergeBoard;
})();
