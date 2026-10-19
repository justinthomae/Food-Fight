// Noodle Slurp and Buffet Grab: the stack rises from the bottom like Classic, on a bigger 8 x 16 board
// (drawn in the usual board space, so twice the food to work with).
//  - Noodle Slurp: drag through 3 or more of the same food that touch (sideways, up/down or diagonally).
//  - Buffet Grab: tap a group of 2 or more of the same food touching side by side or up and down.
// Long chains / big plates, and clears in quick succession (a combo), dump trash bags on your target; trash breaks
// when food next to it goes. Hold Raise to push the stack up faster (more food, more points).
// Some foods carry a power-up badge: clear it to rack the item (3 max), tap it to throw.
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const {NT,T,CLR,INC_T}=E;
const W=8,H=16,K=6/W;               // board units: one cell is K of a normal tile
const START_ROWS=9,COMBO_T=95,RACK_N=3;
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
// power-ups: thrown at your target, or used on yourself (last two)
const ITEMS=['sauce','steam','freeze','blender','swap','pin','plate'],ITEM_W=[2.5,2.5,2,2,1,2,2],SELF=['pin','plate'];
const ITEM_WT=ITEM_W.reduce((a,b)=>a+b,0);
const ITEM_NAME={sauce:'Hot sauce!',steam:'Steam cloud!',freeze:'Brain freeze!',blender:'Blender!',swap:'Switcheroo!',pin:'Rolling pin!',plate:'Clean plate!'};

class RiseBoard extends E.BaseBoard{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{W,H,K,combo:0,comboT:0,busy:0,think:90,plan:null,stepT:0,clears:0,grace:0,raising:false,fireT:240,steamT:0});
    this.g=[];for(let r=0;r<H;r++)this.g.push(new Array(W).fill(null));
    for(let r=H-START_ROWS;r<H;r++)for(let c=0;c<W;c++)this.g[r][c]=T(this.food());
    this.preview=this.newRow();
  }
  food(){return Math.floor(this.rng()*NT)}
  pickItem(){let x=this.rng()*ITEM_WT;for(let i=0;i<ITEMS.length;i++){x-=ITEM_W[i];if(x<0)return ITEMS[i]}return ITEMS[0]}
  // the row coming up from below: every so often one food carries a power-up
  newRow(){return Array.from({length:W},()=>{const t=this.food();return this.rng()<.055?{t,sp:this.pickItem()}:{t}})}
  inGrid(r,c){return r>=0&&r<H&&c>=0&&c<W}
  tile(r,c){return this.inGrid(r,c)?this.g[r][c]:null}
  live(r,c){const t=this.tile(r,c);return t&&t.t>=0&&!t.clr?t:null}
  canAct(){return !this.dead&&this.frozenT<=0}
  secs(){return (this.game.frame-this.startF)/60}
  rows(){for(let r=0;r<H;r++)if(this.g[r].some(Boolean))return H-r;return 0}
  height(){return Math.round(this.rows()/H*12)}
  // rows per frame: a row every ~4.5s at the start, every ~1.5s by two minutes, ~1.1s by four; Raise pushes it up fast
  speed(){const s=this.secs();let v=(1/(60*4.5))*(1+Math.min(3,s/75));if(this.rushT>0)v*=3.5;if(this.raising)v=Math.max(v,1/14);return v}
  at(r,c){return {x:(c+.5)*K,y:(r+.5-this.rise)*K}}
  step(){
    if(this.dead)return;
    this.tickBase();if(this.steamT>0)this.steamT--;
    if(this.comboT>0&&--this.comboT===0)this.endCombo();
    let clearing=false;
    for(let r=0;r<H;r++)for(let c=0;c<W;c++){const t=this.g[r][c];if(!t)continue;
      if(t.yo<0)t.yo=Math.min(0,t.yo+.42);
      if(t.clr>0){clearing=true;if(--t.clr===0){this.g[r][c]=null;const p=this.at(r,c);this.burst(p.x,p.y,t.t,4)}}}
    if(!clearing&&this.needFall){this.needFall=false;this.gravity()}
    if(!clearing&&!this.busy&&this.inc.length&&this.inc[0].t<=0)this.dropTrash(this.takeIncoming(W*3));
    // the stack keeps rising; touching the top gives a short grace, then you're out
    if(this.g[0].some(Boolean)){if(++this.grace>150)return this.die()}
    else{this.grace=0;
      if(!clearing){const v=this.speed();this.rise+=v;if(this.raising&&this.game.frame%6===0)this.score+=1;if(this.rise>=1){this.rise-=1;this.shiftUp()}}}
    if(this.busy>0)this.busy--;
    if(this.isBot)this.ai();
  }
  shiftUp(){
    if(this.g[0].some(Boolean))return this.die();
    this.g.shift();this.g.push(this.preview.map(x=>{const t=T(x.t);if(x.sp)t.sp=x.sp;return t}));this.preview=this.newRow();
    this.onShift&&this.onShift();
  }
  gravity(){
    for(let c=0;c<W;c++){let w=H-1;
      for(let r=H-1;r>=0;r--){const t=this.g[r][c];if(!t)continue;if(r!==w){this.g[w][c]=t;this.g[r][c]=null;t.yo=(t.yo||0)-(w-r)}w--}}
  }
  // clear these cells (a chain or a group): trash next to them breaks too, badges become items
  clearCells(cells,n){
    const hit=new Set(cells.map(([r,c])=>r*W+c)),got=[];
    cells.forEach(([r,c],i)=>{const t=this.g[r][c];if(t){t.clr=Math.round(CLR*.3)+i;if(t.sp){got.push(t.sp);t.sp=null}}});
    cells.forEach(([r,c])=>N4.forEach(([dr,dc])=>{const u=this.tile(r+dr,c+dc);if(u&&u.t<0&&!u.clr&&!hit.has((r+dr)*W+c+dc)){u.clr=Math.round(CLR*.4);this.score+=15}}));
    this.needFall=true;this.busy=5;this.clears++;
    this.combo++;this.comboT=COMBO_T;this.maxChain=Math.max(this.maxChain,this.combo);this.maxCombo=Math.max(this.maxCombo,n);
    const [r0,c0]=cells[Math.floor(cells.length/2)],p=this.at(r0,c0);
    const pts=Math.round(this.points(n)*(1+Math.min(4,this.combo-1)*.5));this.score+=pts;   // combo bonus caps at x3
    this.comboJunk=(this.comboJunk||0)+this.attackFor(n);
    got.forEach((k,j)=>this.earn({k},p.x,p.y-1-j*.7));
    return {x:p.x,y:p.y,pts};
  }
  endCombo(){
    const n=this.comboJunk||0,k=this.combo;
    if(k>=3&&n)this.pop(`${k}x combo!`,3,4,'#CC79A7',1);
    const extra=k>=2?k-1:0;
    if(n+extra>0)this.sendJunk(n+extra);
    this.comboJunk=0;this.combo=0;
  }
  dropTrash(n){
    if(!n)return;
    const order=[...Array(W).keys()];
    for(let i=0;i<n;i++){
      if(i%W===0)for(let k=W-1;k>0;k--){const j=Math.floor(Math.random()*(k+1));[order[k],order[j]]=[order[j],order[k]]}
      const c=order[i%W];let top=0;while(top<H&&!this.g[top][c])top++;
      if(top===0)continue;
      const t=T(-1);t.yo=-(top+1);this.g[top-1][c]=t;
    }
    this.shake=8;this.sfx('junk');this.pop(`+${n} trash!`,3,3,'#E5682A',.9);
  }
  // ---------- power-ups ----------
  earn(item,cx,cy){
    if(this.dead||!ITEMS.includes(item.k))return;
    item.id=E.nextId();this.rack.push(item);
    this.pop(ITEM_NAME[item.k],cx==null?3:cx,cy==null?5:cy,'#F7C548',.85);this.sfx('earn',true);
    if(this.rack.length>RACK_N){const i=this.rack.findIndex(x=>!SELF.includes(x.k));this.fire(i<0?0:i)}
    if(this.mine&&this.game.hooks.rack)this.game.hooks.rack();
  }
  fire(i){
    if(this.dead||i<0||i>=this.rack.length)return false;
    const it=this.rack[i];
    if(SELF.includes(it.k)){this.rack.splice(i,1);if(it.k==='pin')this.flatten();else this.clearFood()}
    else{const tgt=this.pickTarget();if(!tgt)return false;this.rack.splice(i,1);this.game.launch(this,{k:it.k,cells:0,at:null},tgt,i)}
    if(this.mine&&this.game.hooks.rack)this.game.hooks.rack();
    return true;
  }
  hit(from,t){if(this.dead)return false;this.lastAttacker=from;this.hitFlash=24;return true}
  rush(from){if(!this.hit(from))return;this.rushT=200;this.pop('Hot sauce! Rising fast',3,5,'#F7C548',1);this.sfx('sauce')}
  cream(from){this.steam(from)}
  steam(from){if(!this.hit(from))return;this.steamT=360;this.pop('Steamed up!',3,5,'#EEF0FA',1);this.sfx('cream')}
  freeze(from){if(!this.hit(from))return;this.frozenT=150;this.path&&(this.path=[]);this.pop('Brain freeze!',3,5,'#56B4E9',1.1);this.sfx('freeze')}
  blend(from){if(!this.hit(from))return;this.g.forEach(row=>row.forEach(t=>{if(t&&t.t>=0&&!t.clr&&Math.random()<.4)t.t=Math.floor(Math.random()*NT)}));this.path&&(this.path=[]);this.pop('Blended!',3,5,'#CC79A7',1);this.sfx('blender')}
  grease(f){this.steam(f)}lights(f){this.steam(f)}reverse(f){this.blend(f)}
  // take some food away right now (Rolling pin, Clean plate)
  zap(test,label){
    let n=0;
    for(let r=0;r<H;r++)for(let c=0;c<W;c++){const t=this.g[r][c];if(t&&!t.clr&&test(t,r,c)){const p=this.at(r,c);this.burst(p.x,p.y,t.t,4);this.g[r][c]=null;n++}}
    this.gravity();this.score+=n*12;this.shake=6;this.path&&(this.path=[]);
    this.pop(label.replace('#',n),3,5,'#F7C548',1.05);this.sfx('feast');return n;
  }
  flatten(){let top=0;while(top<H&&!this.g[top].some(Boolean))top++;this.zap((t,r)=>r<top+3,'Rolled flat! # gone')}
  clearFood(){const n=new Array(NT).fill(0);this.g.forEach(row=>row.forEach(t=>{if(t&&t.t>=0)n[t.t]++}));let f=0;for(let k=1;k<NT;k++)if(n[k]>n[f])f=k;this.zap(t=>t.t===f||t.t<0,'Clean plate! # cleared')}
  // Switcheroo: two boards of this mode trade stacks (the engine swaps .g locally; online it trades this code)
  gridCode(){let g='';for(let r=0;r<H;r++)for(let c=0;c<W;c++){const t=this.g[r][c];g+=!t||t.clr>0?'.':t.t<0?'j':String(t.t)}return {g}}
  loadGrid(code){
    if(!code||typeof code.g!=='string'||code.g.length!==W*H)return false;
    for(let r=0;r<H;r++)for(let c=0;c<W;c++){const ch=code.g[r*W+c];this.g[r][c]=ch>='0'&&ch<='4'?T(+ch):ch==='j'?T(-1):null}
    return true;
  }
  swapped(other){this.hitFlash=24;this.shake=10;this.path&&(this.path=[]);this.pop(`Switcheroo! You got ${other&&other.name?other.name:'their'}'s stack`,3,5,'#56B4E9',.85);this.sfx('blender');this.gravity()}
  // bots use their power-ups like a person would: cleaners when the stack is high, attacks whenever
  botItems(d){
    if(!this.rack.length||--this.fireT>0)return;
    this.fireT=[900,420,260][d]+Math.floor(Math.random()*240);
    const h=this.rows(),self=this.rack.findIndex(x=>SELF.includes(x.k)),swp=this.rack.findIndex(x=>x.k==='swap'),atk=this.rack.findIndex(x=>!SELF.includes(x.k)&&x.k!=='swap');
    if(self>=0&&h>=11)this.fire(self);else if(swp>=0&&h>=12)this.fire(swp);else if(atk>=0)this.fire(atk);else if(self>=0&&this.rack.length>=RACK_N)this.fire(self);
  }
  snap(){
    let g='';for(let r=0;r<H;r++)for(let c=0;c<W;c++){const t=this.g[r][c];g+=!t?'.':t.t<0?(t.clr>0?'J':'j'):t.clr>0?'abcde'[t.t]:String(t.t)}
    return {id:this.id,cv:1,g,p:this.preview.map(x=>x.t).join(''),r:Math.round(this.rise*100),ht:this.height(),i:this.incoming(),k:this.rack.length,
      h:this.rushT>0?1:0,c:this.steamT>0?1:0,z:this.frozenT>0?1:0,q:this.orders|0,o:this.kos,d:this.dead?1:0,x:0};
  }
}

class SlurpBoard extends RiseBoard{
  constructor(...a){super(...a);this.path=[];this.longest=0}
  points(n){return n*n*2}
  attackFor(n){return n<=3?0:n===4?1:n===5?2:n===6?3:n-2}
  // ---------- the chain you're dragging (kept as the tiles themselves: the stack can rise or settle mid-drag) ----------
  pos(t){for(let r=0;r<H;r++){const c=this.g[r].indexOf(t);if(c>=0)return [r,c]}return null}
  pathCells(){const out=[];for(const t of this.path){const p=this.pos(t);if(!p||t.clr)break;out.push(p)}return out}
  start(r,c){if(!this.canAct())return false;const t=this.live(r,c);if(!t)return false;this.path=[t];this.ptype=t.t;this.sfx('tap');return true}
  extend(r,c){
    if(!this.path.length||!this.canAct())return false;
    const cells=this.pathCells();if(cells.length!==this.path.length)this.path.length=cells.length;
    if(!cells.length)return false;
    const L=cells[cells.length-1],P=cells[cells.length-2];
    if(P&&P[0]===r&&P[1]===c){this.path.pop();this.sfx('tap');return true}   // back onto the cell before: undo
    if(Math.max(Math.abs(L[0]-r),Math.abs(L[1]-c))!==1)return false;
    const t=this.live(r,c);if(!t||t.t!==this.ptype||this.path.includes(t))return false;
    this.path.push(t);this.sfx('harp',Math.min(12,this.path.length-1));return true;
  }
  finish(){
    const cells=this.pathCells();this.path=[];
    if(!this.canAct())return false;
    let k=1;while(k<cells.length&&Math.max(Math.abs(cells[k][0]-cells[k-1][0]),Math.abs(cells[k][1]-cells[k-1][1]))===1)k++;
    const p=cells.slice(0,k);
    if(p.length<3){if(cells.length>1)this.pop('Need 3 in a chain',3,4,'#EEF0FA',.7,40);return false}
    const n=p.length,t=this.ptype,at=this.clearCells(p,n);
    this.longest=Math.max(this.longest,n);
    this.pop(n>=8?`SLUUURP! ${n}`:n>=5?`Slurp! ${n}`:`+${at.pts}`,at.x,at.y,n>=5?'#F7C548':'#EEF0FA',n>=5?1.15:.85);
    if(this.combo>=2)this.pop(`${this.combo} combo`,at.x,at.y+.9,'#CC79A7',.8);
    if(n>=5)this.sfx('chain',Math.min(8,n-3));else this.sfx('match',n);
    this.burst(at.x,at.y,t,8);
    return true;
  }
  cancel(){this.path=[]}
  onShift(){if(this.plan)this.plan=this.plan.map(([r,c])=>[r-1,c])}
  bestChain(maxLen,maxTries){
    let best=null,tries=0;const seen=new Set();
    const dfs=(path,t)=>{
      if(++tries>maxTries)return;
      if(!best||path.length>best.length)best=path.slice();
      if(path.length>=maxLen)return;
      const [r,c]=path[path.length-1];
      for(const [dr,dc] of N8){const rr=r+dr,cc=c+dc,k=rr*W+cc,u=this.live(rr,cc);
        if(!u||u.t!==t||seen.has(k))continue;seen.add(k);path.push([rr,cc]);dfs(path,t);path.pop();seen.delete(k)}
    };
    const starts=[];for(let r=0;r<H;r++)for(let c=0;c<W;c++)if(this.live(r,c))starts.push([r,c]);
    starts.sort((a,b)=>a[0]-b[0]||Math.random()-.5);   // high in the stack first
    for(const s of starts){if(tries>maxTries)break;seen.clear();seen.add(s[0]*W+s[1]);dfs([s],this.g[s[0]][s[1]].t)}
    return best&&best.length>=3?best:null;
  }
  ai(){
    const d=this.game.d|0;
    if(!this.canAct())return;
    this.botItems(d);
    if(this.plan){
      if(--this.stepT>0)return;
      this.stepT=[10,6,3][d];
      const k=this.path.length;
      if(k===0){if(!this.start(...this.plan[0])){this.plan=null;return}}
      else if(k<this.plan.length){if(!this.extend(...this.plan[k])){this.finish();this.plan=null;this.think=24;return}}
      else{this.finish();this.plan=null;this.think=[40,24,10][d]+Math.floor(Math.random()*[40,24,10][d])}
      return;
    }
    if(this.busy||--this.think>0)return;
    const h=this.rows(),hurry=h>=12;
    // nothing on fire and plenty of room: Medium/Hard hold Raise for a moment to bring up more food
    this.raising=d>0&&h<7&&Math.random()<.5;
    const maxLen=hurry?[3,5,5][d]:[3+Math.floor(Math.random()*2),7,10][d];
    const p=this.bestChain(maxLen,[300,900,2400][d]);
    if(!p){this.think=24;return}
    if(d===0&&Math.random()<.15){this.think=40;return}   // Easy daydreams
    this.plan=p;this.stepT=[16,9,4][d];
  }
}

class BuffetBoard extends RiseBoard{
  constructor(...a){super(...a);this.biggest=0;this.hover=null}
  points(n){return (n-1)*(n-1)*2}
  attackFor(n){return n<=3?0:n<=5?1:n<=7?2:n<=9?3:Math.floor(n/2)-1}
  group(r,c){
    const t=this.live(r,c);if(!t)return [];
    const out=[[r,c]],seen=new Set([r*W+c]);
    for(let i=0;i<out.length;i++){const [rr,cc]=out[i];
      for(const [dr,dc] of N4){const r2=rr+dr,c2=cc+dc,k=r2*W+c2,u=this.live(r2,c2);if(u&&u.t===t.t&&!seen.has(k)){seen.add(k);out.push([r2,c2])}}}
    return out;
  }
  grab(r,c){
    if(!this.canAct())return false;
    const gr=this.group(r,c);
    if(gr.length<2){if(gr.length===1){this.pop('Grab 2 or more',3,4,'#EEF0FA',.7,40);this.sfx('tap')}return false}
    const n=gr.length,t=this.g[r][c].t,at=this.clearCells(gr,n);
    this.biggest=Math.max(this.biggest,n);
    this.pop(n>=10?`ALL YOU CAN EAT! ${n}`:n>=6?`Big plate! ${n}`:`+${at.pts}`,at.x,at.y,n>=6?'#F7C548':'#EEF0FA',n>=6?1.1:.85);
    if(this.combo>=2)this.pop(`${this.combo} combo`,at.x,at.y+.9,'#CC79A7',.8);
    if(n>=6)this.sfx('chain',Math.min(8,n-4));else this.sfx('match',n);
    this.burst(at.x,at.y,t,8);
    return true;
  }
  groups(){
    const seen=new Set(),out=[];
    for(let r=0;r<H;r++)for(let c=0;c<W;c++){if(seen.has(r*W+c)||!this.live(r,c))continue;const gr=this.group(r,c);gr.forEach(([a,b])=>seen.add(a*W+b));if(gr.length>=2)out.push(gr)}
    return out;
  }
  ai(){
    const d=this.game.d|0;
    if(!this.canAct())return;
    this.botItems(d);
    if(this.busy||--this.think>0)return;
    this.think=[70,30,14][d]+Math.floor(Math.random()*[60,24,10][d]);
    const gs=this.groups();if(!gs.length)return;
    const h=this.rows();
    this.raising=d>0&&h<7&&Math.random()<.5;
    let pick;
    if(d===0)pick=gs[Math.floor(Math.random()*gs.length)];
    else{
      const sc=g=>g.length*(h>=12?1:2)+(h>=10?(H-Math.min(...g.map(x=>x[0])))*.6:0)+Math.random()*(d===1?3:1);
      pick=gs.reduce((a,b)=>sc(b)>sc(a)?b:a);
      if(pick.length<4&&h<9&&Math.random()<(d===2?.6:.35))return;   // wait for small plates to grow
    }
    const [r,c]=pick[Math.floor(Math.random()*pick.length)];
    this.grab(r,c);
  }
}

RiseBoard.GEO={W,H,K};RiseBoard.ITEMS=ITEMS;RiseBoard.SELF=SELF;
E.RiseBoard=RiseBoard;
E.BOARD_TYPES.slurp=SlurpBoard;if(!E.VARIANTS.includes('slurp'))E.VARIANTS.push('slurp');
E.BOARD_TYPES.buffet=BuffetBoard;if(!E.VARIANTS.includes('buffet'))E.VARIANTS.push('buffet');
if(typeof module!=='undefined')module.exports={SlurpBoard,BuffetBoard,RiseBoard};
})();
