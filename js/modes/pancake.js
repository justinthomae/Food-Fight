// Pancake Tower: a stack of three foods falls down the 6x12 well. Cycle their order (the bottom one goes to the top),
// slide it and drop it. Three or more of one food in a line (across, up and down, or diagonally) clear all at once,
// the stack falls, and any new lines clear as chains. Chains and big clears dump trash bags on your target; trash bags
// break when a clear happens right next to them. If the spawn column fills to the top, you're out.
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const {COLS,ROWS,NT,T,CLR}=E;
const SPAWN_C=2,LOCK=24,LOCK_SOFT=4;
const CHAIN_BONUS=[0,0,3,6,10,14,18,22,26,30];
const DIRS=[[0,1],[1,0],[1,1],[1,-1]];
// bots: thinking delay (frames), move interval, scoring noise, chance to just drop somewhere random
const BOT={think:[[70,110],[26,44],[10,20]],move:[14,6,3],noise:[14,4,1],miss:[.3,.08,.02],send:[.4,.8,1]};

// every cell that sits in a run of 3+ of the same food (4 directions); g is rows of numbers (null empty, -1 trash)
function findLines(g){
  const hit=new Set();let lines=0;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const v=g[r][c];if(v==null||v<0)continue;
    for(const [dr,dc] of DIRS){
      const pr=r-dr,pc=c-dc;if(pr>=0&&pr<ROWS&&pc>=0&&pc<COLS&&g[pr][pc]===v)continue;   // only start at the run's first cell
      let n=1;while(true){const rr=r+dr*n,cc=c+dc*n;if(rr<0||rr>=ROWS||cc<0||cc>=COLS||g[rr][cc]!==v)break;n++}
      if(n>=3){lines++;for(let k=0;k<n;k++)hit.add((r+dr*k)*COLS+c+dc*k)}
    }}
  return {hit,lines};
}

class PancakeBoard extends E.BaseBoard{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{pancake:true,state:'spawn',wait:30,piece:null,queue:[],soft:false,lock:0,pending:0,think:40,plan:null,moveT:0,lines:0,cleared:0});
    // a few starter scraps on the floor, without any ready-made lines
    for(let c=0;c<COLS;c++){const h=Math.floor(this.rng()*2);for(let k=0;k<h;k++)this.g[ROWS-1-k][c]=T(Math.floor(this.rng()*NT))}
    for(let k=0;k<30;k++){const L=findLines(this.nums());if(!L.hit.size)break;L.hit.forEach(i=>{const t=this.g[Math.floor(i/COLS)][i%COLS];t.t=(t.t+1)%NT})}
    for(let i=0;i<3;i++)this.queue.push(this.trio());
  }
  trio(){return [0,1,2].map(()=>Math.floor(this.rng()*NT))}
  nums(){return this.g.map(row=>row.map(t=>t?t.t:null))}
  free(r,c){return c>=0&&c<COLS&&r<ROWS&&(r<0||!this.g[r][c])}
  fits(p){const r=Math.floor(p.r);for(let i=0;i<3;i++)if(!this.free(r+i,p.c))return false;return true}
  landRow(p){let r=Math.floor(p.r);while(this.fits({c:p.c,r:r+1}))r++;return r}
  canAct(){return !this.dead&&this.state==='fall'&&!!this.piece}
  // ---------- controls ----------
  move(d){if(!this.canAct())return false;const p=this.piece;if(!this.fits({c:p.c+d,r:p.r}))return false;p.c+=d;this.lock=Math.min(this.lock,8);this.sfx('tap');return true}
  moveTo(col){if(!this.canAct())return;let n=6;while(this.piece&&this.piece.c!==col&&n--){if(!this.move(Math.sign(col-this.piece.c)))break}}
  cycle(dir){
    if(!this.canAct())return false;const f=this.piece.f;
    this.piece.f=dir<0?[f[1],f[2],f[0]]:[f[2],f[0],f[1]];   // default: the bottom food goes to the top
    this.piece.spin=(this.piece.spin||0)+(dir<0?-1:1);this.sfx('swap');return true;
  }
  hardDrop(){if(!this.canAct())return;const p=this.piece,r=this.landRow(p);this.score+=Math.max(0,r-Math.floor(p.r))*2;p.r=r;this.place_();this.shake=4}
  // ---------- simulation ----------
  speed(){const s=(this.game.frame-this.startF)/60;return this.soft?.45:Math.min(.2,.022+s*.0009)}
  step(){
    if(this.dead)return;this.tickBase();
    let moving=false;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.yo<0){t.yo=Math.min(0,t.yo+.34);moving=true}}
    if(this.state==='spawn'){if(--this.wait<=0)this.spawn()}
    else if(this.state==='fall')this.fall();
    else if(this.state==='settle'){if(!moving)this.resolve()}
    else if(this.state==='pop'){
      let busy=false;
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.clr>0){busy=true;if(--t.clr===0){this.g[r][c]=null;this.burst(c+.5,r+.5,t.t,6)}}}
      if(!busy){this.gravity();this.state='settle'}
    }
    if(this.isBot)this.ai();
  }
  spawn(){
    if(this.g[0][SPAWN_C]){this.piece=null;return this.die()}
    const f=this.queue.shift();this.queue.push(this.trio());
    this.piece={f,c:SPAWN_C,r:-2,spin:0};this.pid=(this.pid||0)+1;this.lock=0;this.plan=null;if(this.isBot)this.soft=false;
    this.state='fall';
  }
  fall(){
    const p=this.piece,below={c:p.c,r:Math.floor(p.r)+1};
    if(this.fits(below)){p.r+=this.speed();if(p.r>below.r)p.r=below.r;this.lock=0}
    else{p.r=Math.floor(p.r);if(++this.lock>=(this.soft?LOCK_SOFT:LOCK))this.place_()}
  }
  place_(){
    const p=this.piece;if(!p)return;const r=Math.floor(p.r);
    this.piece=null;this.sfx('swap');
    let over=false;
    for(let i=0;i<3;i++){const rr=r+i;if(rr<0){over=true;continue}if(!this.g[rr][p.c])this.g[rr][p.c]=T(p.f[i])}
    if(over)return this.die();   // part of the stack never made it into the well
    this.chain=0;this.pending=0;this.state='settle';
  }
  gravity(){
    for(let c=0;c<COLS;c++){let w=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){const t=this.g[r][c];if(!t)continue;if(r!==w){this.g[w][c]=t;this.g[r][c]=null;t.yo=(t.yo||0)-(w-r)}w--}}
  }
  resolve(){
    const L=findLines(this.nums());
    if(L.hit.size){
      this.chain++;this.maxChain=Math.max(this.maxChain,this.chain);
      const n=L.hit.size;this.cleared+=n;this.lines+=L.lines;this.maxCombo=Math.max(this.maxCombo,n);
      let cx=0,cy=0,i=0;
      L.hit.forEach(id=>{const r=Math.floor(id/COLS),c=id%COLS,t=this.g[r][c];t.clr=CLR+i*2;cx+=c+.5;cy+=r+.5;i++});
      // trash bags right next to a clear break too
      L.hit.forEach(id=>{const r=Math.floor(id/COLS),c=id%COLS;[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const u=this.g[r+dr]&&this.g[r+dr][c+dc];if(u&&u.t<0&&!u.clr)u.clr=CLR+6})});
      cx/=n;cy/=n;
      this.pending+=Math.max(0,n-3)+CHAIN_BONUS[Math.min(this.chain,CHAIN_BONUS.length-1)]+(L.lines>1?L.lines-1:0);
      this.score+=n*10*this.chain*this.chain+(L.lines-1)*30;
      if(this.chain>1){this.pop(`${this.chain} chain!`,cx,cy,'#F7C548',1.2);this.sfx('chain',this.chain)}
      else{this.pop(n>3?`${n} in a row!`:'Stacked!',cx,cy,'#EEF0FA',.9);this.sfx('match',n)}
      this.state='pop';return;
    }
    if(this.pending>0){
      // overtime: after a minute every throw gets heavier so the match ends
      const sec=(this.game.frame-this.startF)/60,ot=1+Math.max(0,sec-60)/50;
      const send=Math.max(1,Math.round(this.pending*ot*(this.isBot?BOT.send[this.game.d|0]:1)));
      this.sendJunk(send);
    }
    this.pending=0;this.chain=0;
    if(this.dropTrash())return;
    this.state='spawn';this.wait=6;
  }
  // landed trash falls in as trash bags on random columns (at most 18 at once)
  dropTrash(){
    const n=this.takeIncoming(18);if(!n)return false;
    const order=[0,1,2,3,4,5];
    for(let i=0;i<n;i++){
      if(i%COLS===0)for(let k=5;k>0;k--){const j=Math.floor(this.rng()*(k+1));[order[k],order[j]]=[order[j],order[k]]}
      const c=order[i%COLS];let top=0;while(top<ROWS&&!this.g[top][c])top++;
      if(top===0)continue;
      const t=T(-1);t.yo=-(top+1);this.g[top-1][c]=t;
    }
    this.shake=8;this.sfx('junk');this.state='settle';return true;
  }
  snap(){
    const g=this.g.map(row=>row.slice());const p=this.piece;
    if(p){const r=Math.floor(p.r);for(let i=0;i<3;i++){const rr=r+i;if(rr>=0&&rr<ROWS)g[rr][p.c]={t:p.f[i],clr:0}}}
    return {id:this.id,g:this.gridString(g),p:'',r:0,k:0,q:0,o:this.kos,d:this.dead?1:0};
  }
  // ---------- bot: every column x every order, cascades played out ----------
  evaluate(c,f){
    if(!this.fits({c,r:-2}))return null;
    // the stack must be able to slide over to c from the spawn column
    for(let x=Math.min(c,SPAWN_C);x<=Math.max(c,SPAWN_C);x++)if(this.g[0][x])return null;
    const g=this.nums();let top=0;while(top<ROWS&&g[top][c]==null)top++;
    const r=top-3;if(r<0)return null;
    for(let i=0;i<3;i++)g[r+i][c]=f[i];
    let chains=0,popped=0;
    for(;;){
      const L=findLines(g);if(!L.hit.size)break;
      chains++;popped+=L.hit.size;
      const kill=new Set(L.hit);L.hit.forEach(id=>{const rr=Math.floor(id/COLS),cc=id%COLS;[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const r2=rr+dr,c2=cc+dc;if(r2>=0&&r2<ROWS&&c2>=0&&c2<COLS&&g[r2][c2]===-1)kill.add(r2*COLS+c2)})});
      kill.forEach(id=>{g[Math.floor(id/COLS)][id%COLS]=null});
      for(let cc=0;cc<COLS;cc++){let w=ROWS-1;for(let rr=ROWS-1;rr>=0;rr--){if(g[rr][cc]==null)continue;const v=g[rr][cc];g[rr][cc]=null;g[w--][cc]=v}}
    }
    let adj=0,h=0,hs=0;
    for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++){const v=g[rr][cc];if(v==null)continue;h=Math.max(h,ROWS-rr);if(v<0)continue;
      for(const [dr,dc] of DIRS){const r2=rr+dr,c2=cc+dc;if(r2<ROWS&&c2>=0&&c2<COLS&&g[r2][c2]===v)adj++}}
    for(let cc=0;cc<COLS;cc++){let k=0;while(k<ROWS&&g[k][cc]==null)k++;hs+=(ROWS-k)*(ROWS-k)}
    let sp=0;while(sp<ROWS&&g[sp][SPAWN_C]==null)sp++;const spawnH=ROWS-sp;
    return chains*chains*40+popped*4+adj*3-hs*.08-spawnH*spawnH*.5-(spawnH>=9?200:0);
  }
  ai(){
    if(this.state!=='fall'||!this.piece)return;
    const d=this.game.d|0;
    if(!this.plan){
      if(--this.think>0)return;
      const [a,b]=BOT.think[d];this.think=a+Math.floor(Math.random()*(b-a+1));
      let best=null,bs=-1e9;const f=this.piece.f;
      const orders=[f,[f[2],f[0],f[1]],[f[1],f[2],f[0]]];
      for(let c=0;c<COLS;c++)for(let k=0;k<3;k++){const v=this.evaluate(c,orders[k]);if(v==null)continue;const s=v+Math.random()*BOT.noise[d]*4;if(s>bs){bs=s;best={c,k}}}
      if(!best||Math.random()<BOT.miss[d])best={c:Math.floor(Math.random()*COLS),k:Math.floor(Math.random()*3)};
      this.plan=best;this.moveT=0;
    }
    if(--this.moveT>0)return;
    this.moveT=BOT.move[d];
    const p=this.piece,pl=this.plan;
    if(pl.k>0){this.cycle(1);pl.k--;return}
    if(p.c!==pl.c){if(!this.move(Math.sign(pl.c-p.c)))pl.c=p.c;return}
    if(d>=1)this.hardDrop();else this.soft=true;
  }
}
PancakeBoard.findLines=findLines;
E.BOARD_TYPES.pancake=PancakeBoard;if(!E.VARIANTS.includes('pancake'))E.VARIANTS.push('pancake');
if(typeof module!=='undefined')module.exports=PancakeBoard;
})();
