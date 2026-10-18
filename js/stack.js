// Snack Stack: falling pairs (Puyo-style). Connect 4+ of one food in any shape to pop them;
// pops that make the stack fall into more pops are chains, and chains send junk at your target.
// Plugs into the engine as BOARD_TYPES.stack and speaks the same board interface as the swap board.
(function(){
const E=typeof module!=='undefined'?require('./engine.js'):window.FFEngine;
const {COLS,ROWS,NT,CLR,INC_T,DIFFS,T,mulberry32}=E;
const rnd=n=>Math.floor(Math.random()*n);
const SPAWN_C=2;
const CHAIN_BONUS=[0,0,4,8,14,20,28,36,44,52,60];   // junk added per chain step
const ROT=[[-1,0],[0,1],[1,0],[0,-1]];              // satellite offset (dr,dc) for rot 0..3: up, right, down, left
// Snack Stack items ride on gold-badge foods in some pairs; pop the badge food to rack the item.
// attacks: steam (fog), grease (no ghost or next preview), sauce (faster fall), freeze (no controls), blender, swap.
// self: pin (flatten your top 3 rows), plate (clear your most common food)
const STACK_ITEMS=['steam','grease','sauce','freeze','blender','swap','pin','plate'],STACK_W=[3,2,2,2,2,1,2,2],STACK_SELF=['pin','plate'];
const STACK_WT=STACK_W.reduce((a,b)=>a+b,0),RACK_N=3;

class StackBoard{
  constructor(game,name,isBot,idx,id,seed){
    Object.assign(this,{game,name,isBot,idx,id:id||('b'+idx),rng:mulberry32(seed>>>0),
      rise:0,chain:0,maxChain:1,maxCombo:0,score:0,inc:[],dead:false,sent:0,blocked:0,kos:0,pops:[],parts:[],shake:0,
      lastAttacker:null,killedBy:null,place:0,hitFlash:0,diedAt:0,rack:[],rushT:0,creamT:0,frozenT:0,blendT:0,dmg:0,
      state:'spawn',wait:20,piece:null,queue:[],pending:0,lock:0,soft:false,think:40,plan:null,moveT:0,stack:true,preview:null,steamT:0,greaseT:0,fireT:120});
    this.g=[];for(let r=0;r<ROWS;r++)this.g.push(new Array(COLS).fill(null));
    // a few starter scraps on the floor so the first chains come sooner
    for(let c=0;c<COLS;c++){const h=Math.floor(this.rng()*2);for(let k=0;k<h;k++)this.g[ROWS-1-k][c]=T(Math.floor(this.rng()*NT))}
    this.breakGroups();
    for(let i=0;i<3;i++)this.queue.push(this.pair());
  }
  pair(){
    const a=Math.floor(this.rng()*NT),b=Math.floor(this.rng()*NT);let sa=null,sb=null;
    if(this.rng()<.13){let x=this.rng()*STACK_WT,k=STACK_ITEMS[0];for(let i=0;i<STACK_ITEMS.length;i++){x-=STACK_W[i];if(x<0){k=STACK_ITEMS[i];break}}if(this.rng()<.5)sa=k;else sb=k}
    return [a,b,sa,sb];
  }
  sfx(n,a){if(this===this.game.player&&this.game.hooks.sfx)this.game.hooks.sfx(n,a)}
  pop(text,x,y,col,size){if(this===this.game.player)this.pops.push({text,x,y,col,size,life:60})}
  burst(r,c,kind,n){if(this!==this.game.player)return;for(let i=0;i<n;i++)this.parts.push({x:c+.5,y:r+.5,vx:(Math.random()-.5)*.14,vy:-Math.random()*.12-.02,kind,life:24+rnd(14)})}
  each(fn){for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t)fn(t,r,c)}}
  height(){for(let r=0;r<ROWS;r++)if(this.g[r].some(Boolean))return ROWS-r;return 0}
  // starting scraps must not already contain a group of 4
  breakGroups(){for(let k=0;k<20;k++){const gs=this.groups();if(!gs.length)return;gs.forEach(gr=>{const [r,c]=gr[0];this.g[r][c].t=(this.g[r][c].t+1)%NT})}}
  free(r,c){return c>=0&&c<COLS&&r<ROWS&&(r<0||!this.g[r][c])}
  cells(p){const [dr,dc]=ROT[p.rot];return [[Math.floor(p.r),p.c,p.a,p.sa],[Math.floor(p.r)+dr,p.c+dc,p.b,p.sb]]}
  fits(p){return this.cells(p).every(([r,c])=>this.free(r,c))}
  // ---------- player controls ----------
  canAct(){return !this.dead&&this.state==='fall'&&this.piece&&this.frozenT<=0}
  move(d){if(!this.canAct())return false;const p=Object.assign({},this.piece,{c:this.piece.c+d});if(!this.fits(p))return false;this.piece=p;this.lock=Math.min(this.lock,8);this.sfx('tap');return true}
  moveTo(col){if(!this.canAct())return;let guard=6;while(this.piece.c!==col&&guard--){if(!this.move(Math.sign(col-this.piece.c)))break}}
  rotate(dir){
    if(!this.canAct())return false;
    const rot=(this.piece.rot+(dir<0?3:1))%4;
    for(const [dc,dr] of [[0,0],[-1,0],[1,0],[0,-1]]){const p=Object.assign({},this.piece,{rot,c:this.piece.c+dc,r:this.piece.r+dr});if(this.fits(p)){this.piece=p;this.lock=Math.min(this.lock,8);this.sfx('swap');return true}}
    // tight spot: flip the pair instead
    const p=Object.assign({},this.piece,{a:this.piece.b,b:this.piece.a,sa:this.piece.sb,sb:this.piece.sa});this.piece=p;this.sfx('swap');return true;
  }
  hardDrop(){if(!this.canAct())return;let p=this.piece;while(this.fits(Object.assign({},p,{r:Math.floor(p.r)+1})))p=Object.assign({},p,{r:Math.floor(p.r)+1});this.piece=p;this.score+=2;this.place_();this.shake=4}
  // ---------- simulation ----------
  step(){
    if(this.hitFlash>0)this.hitFlash--;
    if(this.creamT>0)this.creamT--;if(this.frozenT>0)this.frozenT--;if(this.rushT>0)this.rushT--;if(this.blendT>0)this.blendT--;
    if(this.steamT>0)this.steamT--;if(this.greaseT>0)this.greaseT--;
    if(this.shake>0)this.shake--;
    this.inc.forEach(it=>{if(it.t>0)it.t--});
    // tile fall animation
    let moving=false;
    this.each(t=>{if(t.yo<0){t.yo=Math.min(0,t.yo+.34);moving=true}});
    if(this.state==='spawn'){if(--this.wait<=0)this.spawn()}
    else if(this.state==='fall')this.fall();
    else if(this.state==='settle'){if(!moving)this.resolve()}
    else if(this.state==='pop'){
      let busy=false;
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.clr>0){busy=true;if(--t.clr===0){this.g[r][c]=null;this.burst(r,c,t.t,6)}}}
      if(!busy){this.gravity();this.state='settle'}
    }
    if(this.isBot)this.ai();
    if(this.pops.length)this.pops=this.pops.filter(p=>--p.life>0);
    if(this.parts.length)this.parts=this.parts.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.012;return --p.life>0});
  }
  speed(){return this.soft?.45:this.rushT>0?.09:(.024+this.game.level()*.006)}
  spawn(){
    const [a,b,sa,sb]=this.queue.shift();this.queue.push(this.pair());
    this.piece={a,b,sa,sb,c:SPAWN_C,r:1,rot:0};this.lock=0;this.plan=null;if(this.isBot)this.soft=false;
    if(!this.fits(this.piece)){this.piece=null;return this.die()}
    this.state='fall';
  }
  fall(){
    const p=this.piece,below=Object.assign({},p,{r:Math.floor(p.r)+1});
    if(this.fits(below)){p.r+=this.speed();if(p.r>below.r)p.r=below.r;this.lock=0}
    else{p.r=Math.floor(p.r);if(++this.lock>=(this.soft?4:24))this.place_()}
  }
  place_(){
    const p=this.piece;if(!p)return;
    this.cells(p).sort((x,y)=>y[0]-x[0]).forEach(([r,c,t,sp])=>{if(r>=0&&r<ROWS&&!this.g[r][c]){const u=T(t);if(sp)u.sp=sp;this.g[r][c]=u}});
    this.piece=null;this.sfx('swap');
    this.chain=0;this.pending=0;
    this.gravity();this.state='settle';
  }
  gravity(){
    for(let c=0;c<COLS;c++){
      let w=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){const t=this.g[r][c];if(!t)continue;if(r!==w){this.g[w][c]=t;this.g[r][c]=null;t.yo=(t.yo||0)-(w-r)}w--}
    }
  }
  groups(){
    const g=this.g,seen=new Set(),out=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const t=g[r][c];if(!t||t.t<0||seen.has(t))continue;
      const grp=[],q=[[r,c]];seen.add(t);
      while(q.length){const [rr,cc]=q.pop();grp.push([rr,cc]);for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const u=g[rr+dr]&&g[rr+dr][cc+dc];if(u&&u.t===t.t&&!seen.has(u)){seen.add(u);q.push([rr+dr,cc+dc])}}}
      if(grp.length>=4)out.push(grp);
    }
    return out;
  }
  resolve(){
    const gs=this.groups();
    if(gs.length){
      this.chain++;this.maxChain=Math.max(this.maxChain,this.chain);
      let n=0,junk=0,cx=0,cy=0,k=0;
      const hit=new Set();
      gs.forEach(gr=>{n+=gr.length;junk+=gr.length-3;gr.forEach(([r,c])=>{hit.add(r*COLS+c);cx+=c+.5;cy+=r+.5;k++})});
      // junk touching a pop breaks too
      [...hit].forEach(i=>{const r=Math.floor(i/COLS),c=i%COLS;[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const u=this.g[r+dr]&&this.g[r+dr][c+dc];if(u&&u.t<0&&!u.clr){u.clr=CLR+6}})});
      let i=0;const got=[];hit.forEach(id=>{const t=this.g[Math.floor(id/COLS)][id%COLS];t.clr=CLR+i*2;if(t.sp){got.push(t.sp);t.sp=null}i++});
      this.maxCombo=Math.max(this.maxCombo,n);
      junk+=CHAIN_BONUS[Math.min(this.chain,CHAIN_BONUS.length-1)]+(gs.length>1?2*(gs.length-1):0);
      this.pending+=junk;
      this.score+=n*10*this.chain*this.chain+(gs.length-1)*40;
      cx/=k;cy/=k;
      if(this.chain>1){this.pop(`${this.chain} chain!`,cx,cy,'#F7C548',1.2);this.sfx('chain',this.chain)}
      else{this.pop(n>4?`${n} combo`:'Pop!',cx,cy,'#EEF0FA',.9);this.sfx('match',n)}
      got.forEach((k,j)=>this.earn({k},cx,cy-1-j*.7));
      this.state='pop';
      return;
    }
    // chain over: cancel incoming junk first, throw the rest
    if(this.pending>0)this.sendJunk(this.pending);
    this.pending=0;this.chain=0;
    if(this.dropIncoming())return;
    if(this.g[0][SPAWN_C]||this.g[1][SPAWN_C])return this.die();
    this.state='spawn';this.wait=6;
  }
  sendJunk(cells){
    let a=cells,blocked=0;
    while(a>0&&this.inc.length){const it=this.inc[0],m=Math.min(a,it.cells);it.cells-=m;a-=m;blocked+=m;if(it.cells<=0)this.inc.shift()}
    if(blocked){this.blocked+=blocked;this.pop(`Blocked ${blocked}`,3,6,'#56B4E9',.9);this.sfx('block')}
    if(a<=0)return;
    const tgt=this.pickTarget();if(!tgt)return;
    if(this.isBot)a=Math.max(1,Math.round(a*.6));   // bots chain hard; keep their throws human-sized
    this.game.launch(this,{k:'pie',cells:a,at:null},tgt);
  }
  pickTarget(){
    const g=this.game;
    if(g.boss)return g.boss.hp>0?g.bossObj:null;
    const others=g.alive().filter(b=>b!==this);if(!others.length)return null;
    if(this===g.player)return g.aim();
    const la=this.lastAttacker;if(la&&!la.dead&&la!==this&&Math.random()<.5)return la;
    return others[rnd(others.length)];
  }
  // junk falls in after your pair lands, up to 5 rows at a time
  dropIncoming(){
    let cells=0;
    while(this.inc.length&&this.inc[0].t<=0&&cells<30){const it=this.inc[0],m=Math.min(30-cells,it.cells);cells+=m;it.cells-=m;if(it.cells<=0)this.inc.shift()}
    if(!cells)return false;
    const order=[0,1,2,3,4,5];
    for(let i=0;i<cells;i++){
      if(i%COLS===0)for(let k=5;k>0;k--){const j=Math.floor(Math.random()*(k+1));[order[k],order[j]]=[order[j],order[k]]}
      const c=order[i%COLS];let top=0;while(top<ROWS&&!this.g[top][c])top++;
      if(top===0)continue;
      const t=T(-1);t.yo=-(top+1);this.g[top-1][c]=t;
    }
    this.shake=8;this.sfx('junk');
    this.state='settle';
    return true;
  }
  receive(cells,from){if(this.dead)return;this.inc.push({cells,t:INC_T,T:INC_T,from});this.lastAttacker=from;this.hitFlash=24;this.sfx('incoming')}
  rush(from){this.rushT=180;this.lastAttacker=from;this.hitFlash=24;this.pop('Hot sauce!',3,9,'#F7C548',1.1);this.sfx('sauce')}
  cream(from){this.steam(from)}
  steam(from){if(this.dead)return;this.steamT=360;this.lastAttacker=from;this.hitFlash=24;this.pop('Steamed up!',3,6,'#EEF0FA',1.05);this.sfx('cream')}
  grease(from){if(this.dead)return;this.greaseT=420;this.lastAttacker=from;this.hitFlash=24;this.pop('Greasy fingers! No preview',3,6,'#F7C548',.9);this.sfx('sauce')}
  freeze(from){this.frozenT=150;this.lastAttacker=from;this.hitFlash=24;this.pop('Brain freeze!',3,9,'#56B4E9',1.1);this.sfx('freeze')}
  blend(from){this.lastAttacker=from;this.hitFlash=24;this.each(t=>{if(t.t>=0&&!t.clr&&Math.random()<.4)t.t=Math.floor(Math.random()*NT)});this.sfx('blender')}
  stealFrom(){return null}
  takeItem(){}
  earn(item,cx,cy){
    if(this.dead||!STACK_ITEMS.includes(item.k))return;
    item.id=E.nextId();this.rack.push(item);
    this.pop({steam:'Steam cloud!',grease:'Greasy fingers!',sauce:'Hot sauce!',freeze:'Brain freeze!',blender:'Blender!',swap:'Switcheroo!',pin:'Rolling pin!',plate:'Clean plate!'}[item.k],cx==null?3:cx,cy==null?6:cy,'#F7C548',.85);
    this.sfx('earn',true);
    if(this.rack.length>RACK_N){const i=this.rack.findIndex(x=>!STACK_SELF.includes(x.k));this.fire(i<0?0:i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
  }
  fire(i){
    if(this.dead||i<0||i>=this.rack.length)return false;
    const it=this.rack[i];
    if(STACK_SELF.includes(it.k)){this.rack.splice(i,1);if(it.k==='pin')this.flatten();else this.clearFood()}
    else{const tgt=this.pickTarget();if(!tgt)return false;this.rack.splice(i,1);this.game.launch(this,{k:it.k,cells:0,at:null},tgt,i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
    return true;
  }
  // remove some tiles straight away (works mid-fall: the stack just drops under the pair)
  zap(test,label){
    let n=0;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&!t.clr&&test(t,r,c)){this.burst(r,c,t.t,5);this.g[r][c]=null;n++}}
    this.gravity();this.score+=n*12;this.shake=6;
    this.pop(label.replace('#',n),3,5,'#F7C548',1.05);this.sfx('feast');
    if(this.state==='spawn'||this.state==='fall')return n;
    this.state='settle';return n;
  }
  flatten(){let top=0;while(top<ROWS&&!this.g[top].some(Boolean))top++;this.zap((t,r)=>r<top+3,'Flattened! # gone')}
  clearFood(){
    const n=new Array(NT).fill(0);this.g.forEach(row=>row.forEach(t=>{if(t&&t.t>=0)n[t.t]++}));
    let f=0;for(let k=1;k<NT;k++)if(n[k]>n[f])f=k;
    this.zap(t=>t.t===f,'Clean plate! # cleared');
  }
  // Switcheroo between two Snack Stack boards (same code format as the swap board)
  gridCode(){
    let g='';const ids=new Map(),sp=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];
      if(!t||t.clr>0){g+='.';continue}
      if(t.t<0){if(!ids.has(t.gid))ids.set(t.gid,String.fromCharCode(65+Math.min(25,ids.size)));g+=ids.get(t.gid)}
      else{g+=String(t.t);if(t.sp)sp.push([r*COLS+c,t.sp])}}
    return {g,sp};
  }
  loadGrid(code){
    if(!code||typeof code.g!=='string'||code.g.length!==ROWS*COLS)return false;
    const sps=new Map((code.sp||[]).filter(x=>Array.isArray(x)&&STACK_ITEMS.includes(x[1])).map(x=>[x[0]|0,x[1]]));
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const ch=code.g[r*COLS+c];let t=null;
      if(ch>='0'&&ch<='4'){t=T(+ch);if(sps.has(r*COLS+c))t.sp=sps.get(r*COLS+c)}else if(ch>='A'&&ch<='Z')t=T(-1);
      this.g[r][c]=t}
    return true;
  }
  swapped(other){
    this.hitFlash=24;this.shake=10;this.pop(`Switcheroo! You got ${other&&other.name?other.name:'their'}'s stack`,3,6,'#56B4E9',.85);this.sfx('blender');
    this.gravity();
    if(this.piece&&!this.fits(this.piece)){this.piece=null;this.state='settle'}
    else if(this.state!=='fall'&&this.state!=='spawn')this.state='settle';
  }
  die(){if(this.dead)return;this.dead=true;this.diedAt=this.game.frame;this.piece=null;this.game.onDeath(this)}
  snap(){
    const grid=this.g.map(row=>row.slice());
    if(this.piece)this.cells(this.piece).forEach(([r,c,t])=>{if(r>=0&&r<ROWS&&c>=0&&c<COLS)grid[r][c]={t,clr:0}});
    let g='';for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=grid[r][c];g+=!t?'.':t.t<0?(t.clr>0?'J':'j'):t.clr>0?'abcde'[t.t]:String(t.t)}
    return {id:this.id,g,p:'',r:0,k:this.rack.length,h:this.rushT>0?1:0,c:this.steamT>0?1:0,z:this.frozenT>0?1:0,o:this.kos,d:this.dead?1:0,x:Math.round(this.dmg||0)};
  }
  // ---------- bot brain: try every column and spin, keep the one that scores best ----------
  evaluate(c,rot,a,b){
    const p={a,b,c,r:1,rot};if(!this.fits(p))return null;
    while(this.fits(Object.assign({},p,{r:p.r+1})))p.r++;
    const g=this.g.map(row=>row.map(t=>t?t.t:null));
    this.cells(p).sort((x,y)=>y[0]-x[0]).forEach(([r,cc,t])=>{if(r>=0)g[r][cc]=t});
    const fallG=()=>{for(let cc=0;cc<COLS;cc++){let w=ROWS-1;for(let r=ROWS-1;r>=0;r--){if(g[r][cc]==null)continue;const v=g[r][cc];g[r][cc]=null;g[w--][cc]=v}}};
    fallG();
    let chains=0,popped=0;
    for(;;){
      const seen=new Set(),kill=[];
      for(let r=0;r<ROWS;r++)for(let cc=0;cc<COLS;cc++){const v=g[r][cc];if(v==null||v<0||seen.has(r*COLS+cc))continue;
        const grp=[],q=[[r,cc]];seen.add(r*COLS+cc);
        while(q.length){const [rr,c2]=q.pop();grp.push([rr,c2]);for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const r2=rr+dr,c3=c2+dc;if(r2<0||r2>=ROWS||c3<0||c3>=COLS||seen.has(r2*COLS+c3)||g[r2][c3]!==v)continue;seen.add(r2*COLS+c3);q.push([r2,c3])}}
        if(grp.length>=4)kill.push(...grp)}
      if(!kill.length)break;
      chains++;popped+=kill.length;kill.forEach(([r,cc])=>{g[r][cc]=null});fallG();
    }
    // shape: like-next-to-like is good, tall stacks and a blocked spawn column are bad
    let adj=0,h=0;
    for(let r=0;r<ROWS;r++)for(let cc=0;cc<COLS;cc++){const v=g[r][cc];if(v==null)continue;h=Math.max(h,ROWS-r);if(v>=0){if(cc<COLS-1&&g[r][cc+1]===v)adj++;if(r<ROWS-1&&g[r+1][cc]===v)adj++}}
    const spawnH=(()=>{let k=0;while(k<ROWS&&g[k][SPAWN_C]==null)k++;return ROWS-k})();
    return chains*chains*30+popped*3+adj*2-h*h*.25-spawnH*spawnH*.4-(spawnH>=8?150:0)-(g[0][SPAWN_C]!=null||g[1][SPAWN_C]!=null?500:0);
  }
  ai(){
    if(this.state!=='fall'||!this.piece||this.frozenT>0)return;
    const D=DIFFS[this.game.d];
    if(this.rack.length&&--this.fireT<=0){
      this.fireT=D.fire[0]+rnd(D.fire[1]-D.fire[0]);const h=this.height();
      const self=this.rack.findIndex(x=>STACK_SELF.includes(x.k)),swp=this.rack.findIndex(x=>x.k==='swap'),atk=this.rack.findIndex(x=>!STACK_SELF.includes(x.k)&&x.k!=='swap');
      if(self>=0&&h>=8)this.fire(self);else if(swp>=0&&h>=9)this.fire(swp);else if(atk>=0)this.fire(atk);
    }
    if(!this.plan){
      if(--this.think>0)return;
      this.think=Math.round((D.think[0]+rnd(D.think[1]-D.think[0]+1))*1.1);
      let best=null,bs=-1e9;
      for(let c=0;c<COLS;c++)for(let rot=0;rot<4;rot++){
        const v=this.evaluate(c,rot,this.piece.a,this.piece.b);if(v==null)continue;
        const s=v+Math.random()*(D.noise||1)*4;
        if(s>bs){bs=s;best={c,rot}}
      }
      if(!best||Math.random()<D.miss*.35)best={c:rnd(COLS),rot:rnd(4)};
      this.plan=best;this.moveT=0;
    }
    if(--this.moveT>0)return;
    this.moveT=Math.max(3,Math.round(D.think[0]/7));
    const p=this.piece,pl=this.plan;
    if(p.rot!==pl.rot){this.rotate(1);return}
    if(p.c!==pl.c){if(!this.move(Math.sign(pl.c-p.c)))this.plan.c=p.c;return}
    if(this.game.d>=1)this.hardDrop();else this.soft=true;
  }
}
E.BOARD_TYPES.stack=StackBoard;
if(typeof module!=='undefined')module.exports=StackBoard;
})();
