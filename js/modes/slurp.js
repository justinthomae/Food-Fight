// Noodle Slurp: the stack rises from the bottom like Classic. Drag through 3 or more of the same food that touch
// (sideways, up/down or diagonally) and the whole chain is slurped up; what's above falls down. Long chains, and
// chains in quick succession (a combo), dump trash bags on your target. Trash bags break when food next to them goes.
// Also defines the shared rising-stack board (E.RiseBoard) that Buffet Grab builds on.
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const {COLS,ROWS,NT,T,CLR}=E;
const START_ROWS=5,COMBO_T=110;
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

class RiseBoard extends E.BaseBoard{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{combo:0,comboT:0,busy:0,think:90,plan:null,stepT:0,clears:0,grace:0,raising:false});
    for(let r=ROWS-START_ROWS;r<ROWS;r++)for(let c=0;c<COLS;c++)this.g[r][c]=T(this.food());
    this.preview=this.newRow();
  }
  food(){return Math.floor(this.rng()*NT)}
  newRow(){return Array.from({length:COLS},()=>this.food())}
  inGrid(r,c){return r>=0&&r<ROWS&&c>=0&&c<COLS}
  tile(r,c){return this.inGrid(r,c)?this.g[r][c]:null}
  // a tile you can use: food, not already going
  live(r,c){const t=this.tile(r,c);return t&&t.t>=0&&!t.clr?t:null}
  secs(){return (this.game.frame-this.startF)/60}
  // rows per frame: about one row every 8s at the start, every ~2.6s after three minutes
  speed(){const s=this.secs();let v=(1/(60*8))*(1+Math.min(2,s/120));if(this.raising)v=Math.max(v,1/20);return v}
  step(){
    if(this.dead)return;
    this.tickBase();
    if(this.comboT>0&&--this.comboT===0)this.endCombo();
    // tiles fall into place and clearing tiles shrink away
    let clearing=false;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(!t)continue;
      if(t.yo<0)t.yo=Math.min(0,t.yo+.28);
      if(t.clr>0){clearing=true;if(--t.clr===0){this.g[r][c]=null;this.burst(c+.5,r+.5-this.rise,t.t,5)}}}
    if(!clearing&&this.needFall){this.needFall=false;this.gravity()}
    // trash lands between moves
    if(!clearing&&!this.busy&&this.inc.length&&this.inc[0].t<=0)this.dropTrash(this.takeIncoming(COLS*3));
    // the stack keeps rising; touching the top gives a short grace, then you're out
    const top=this.g[0].some(Boolean);
    if(top){if(++this.grace>150)return this.die()}
    else{this.grace=0;
      if(!clearing){this.rise+=this.speed();if(this.rise>=1){this.rise-=1;this.shiftUp()}}}
    if(this.busy>0)this.busy--;
    if(this.isBot)this.ai();
  }
  shiftUp(){
    if(this.g[0].some(Boolean))return this.die();
    this.g.shift();this.g.push(this.preview.map(t=>T(t)));this.preview=this.newRow();
    this.onShift&&this.onShift();
  }
  gravity(){
    for(let c=0;c<COLS;c++){let w=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){const t=this.g[r][c];if(!t)continue;if(r!==w){this.g[w][c]=t;this.g[r][c]=null;t.yo=(t.yo||0)-(w-r)}w--}}
  }
  // clear these cells (a chain or a group): trash next to them breaks too
  clearCells(cells,n){
    const hit=new Set(cells.map(([r,c])=>r*COLS+c));
    cells.forEach(([r,c],i)=>{const t=this.g[r][c];if(t){t.clr=Math.round(CLR*.45)+i*2}});
    cells.forEach(([r,c])=>N4.forEach(([dr,dc])=>{const u=this.tile(r+dr,c+dc);if(u&&u.t<0&&!u.clr&&!hit.has((r+dr)*COLS+c+dc)){u.clr=CLR*.6;this.score+=15}}));
    this.needFall=true;this.busy=8;this.clears++;
    this.combo++;this.comboT=COMBO_T;this.maxChain=Math.max(this.maxChain,this.combo);this.maxCombo=Math.max(this.maxCombo,n);
    const [r0,c0]=cells[Math.floor(cells.length/2)];
    const pts=this.points(n)*this.combo;this.score+=pts;
    this.comboJunk=(this.comboJunk||0)+this.attackFor(n);
    return {x:c0+.5,y:r0+.5-this.rise,pts};
  }
  // a combo ends when nothing clears for ~2s: its trash goes out in one throw
  endCombo(){
    const n=this.comboJunk||0,k=this.combo;
    if(k>=3)n&&this.pop(`${k}x combo!`,3,4,'#CC79A7',1);
    const extra=k>=2?k-1:0;
    if(n+extra>0)this.sendJunk(n+extra);
    this.comboJunk=0;this.combo=0;
  }
  // landed trash: bags drop onto the tops of the columns, spread out
  dropTrash(n){
    if(!n)return;
    const order=[0,1,2,3,4,5];
    for(let i=0;i<n;i++){
      if(i%COLS===0)for(let k=5;k>0;k--){const j=Math.floor(Math.random()*(k+1));[order[k],order[j]]=[order[j],order[k]]}
      const c=order[i%COLS];let top=0;while(top<ROWS&&!this.g[top][c])top++;
      if(top===0)continue;
      const t=T(-1);t.yo=-(top+1);this.g[top-1][c]=t;
    }
    this.shake=8;this.sfx('junk');this.pop(`+${n} trash!`,3,3,'#E5682A',.9);
  }
  snap(){
    return {id:this.id,g:this.gridString(),p:this.preview.join(''),r:Math.round(this.rise*100),k:0,q:this.orders|0,o:this.kos,d:this.dead?1:0,x:0};
  }
}

class SlurpBoard extends RiseBoard{
  constructor(...a){super(...a);this.path=[];this.longest=0}
  points(n){return n*n*5}
  attackFor(n){return n<=3?0:n===4?1:n===5?2:n===6?3:n-2}
  // ---------- the chain you're dragging (kept as the tiles themselves: the stack can rise or settle mid-drag) ----------
  pos(t){for(let r=0;r<ROWS;r++){const c=this.g[r].indexOf(t);if(c>=0)return [r,c]}return null}
  pathCells(){const out=[];for(const t of this.path){const p=this.pos(t);if(!p||t.clr)break;out.push(p)}return out}
  start(r,c){if(this.dead)return false;const t=this.live(r,c);if(!t)return false;this.path=[t];this.ptype=t.t;this.sfx('tap');return true}
  extend(r,c){
    if(!this.path.length)return false;
    const cells=this.pathCells();if(cells.length!==this.path.length)this.path.length=cells.length;
    if(!cells.length)return false;
    const L=cells[cells.length-1],P=cells[cells.length-2];
    // back onto the cell before: undo the last step
    if(P&&P[0]===r&&P[1]===c){this.path.pop();this.sfx('tap');return true}
    if(Math.max(Math.abs(L[0]-r),Math.abs(L[1]-c))!==1)return false;
    const t=this.live(r,c);if(!t||t.t!==this.ptype||this.path.includes(t))return false;
    this.path.push(t);this.sfx('harp',Math.min(12,this.path.length-1));return true;
  }
  // let go: 3 or more in an unbroken chain is slurped up
  finish(){
    const cells=this.pathCells();this.path=[];
    let k=1;while(k<cells.length&&Math.max(Math.abs(cells[k][0]-cells[k-1][0]),Math.abs(cells[k][1]-cells[k-1][1]))===1)k++;
    const p=cells.slice(0,k);
    if(p.length<3){if(cells.length>1)this.pop('Need 3 in a chain',3,4,'#EEF0FA',.7,40);return false}
    const n=p.length,t=this.ptype,at=this.clearCells(p,n);
    this.longest=Math.max(this.longest,n);
    this.pop(n>=7?`SLUUURP! ${n}`:n>=5?`Slurp! ${n}`:`+${at.pts}`,at.x,at.y,n>=5?'#F7C548':'#EEF0FA',n>=5?1.15:.85);
    if(this.combo>=2)this.pop(`${this.combo} combo`,at.x,at.y+.9,'#CC79A7',.8);
    if(n>=5)this.sfx('chain',Math.min(8,n-3));else this.sfx('match',n);
    this.burst(at.x,at.y,t,8);
    return true;
  }
  cancel(){this.path=[]}
  onShift(){if(this.plan)this.plan=this.plan.map(([r,c])=>[r-1,c])}
  // ---------- bot: find the longest chain it can see, then trace it a cell at a time ----------
  bestChain(maxLen,maxTries){
    let best=null,tries=0;
    const seen=new Set();
    const dfs=(path,t)=>{
      if(++tries>maxTries)return;
      if(!best||path.length>best.length)best=path.slice();
      if(path.length>=maxLen)return;
      const [r,c]=path[path.length-1];
      for(const [dr,dc] of N8){const rr=r+dr,cc=c+dc,k=rr*COLS+cc,u=this.live(rr,cc);
        if(!u||u.t!==t||seen.has(k))continue;seen.add(k);path.push([rr,cc]);dfs(path,t);path.pop();seen.delete(k)}
    };
    const starts=[];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(this.live(r,c))starts.push([r,c]);
    // prefer chains high in the stack when it's getting tall
    starts.sort((a,b)=>a[0]-b[0]||Math.random()-.5);
    for(const s of starts){if(tries>maxTries)break;seen.clear();seen.add(s[0]*COLS+s[1]);dfs([s],this.g[s[0]][s[1]].t)}
    return best&&best.length>=3?best:null;
  }
  ai(){
    const d=this.game.d|0;
    if(this.plan){
      if(--this.stepT>0)return;
      this.stepT=[16,7,4][d];
      const k=this.path.length;
      if(k===0){if(!this.start(...this.plan[0])){this.plan=null;return}}
      else if(k<this.plan.length){if(!this.extend(...this.plan[k])){this.finish();this.plan=null;this.think=30;return}}
      else{this.finish();this.plan=null;this.think=[70,30,14][d]+Math.floor(Math.random()*[70,30,14][d])}
      return;
    }
    if(this.busy||--this.think>0)return;
    const h=this.height(),hurry=h>=9;
    const maxLen=hurry?[3,5,5][d]:[3+Math.floor(Math.random()*2),7,10][d];
    const p=this.bestChain(maxLen,[300,900,2400][d]);
    if(!p){this.think=30;return}
    // Easy sometimes just pauses or bails out on a short chain
    if(d===0&&Math.random()<.25){this.think=60;return}
    this.plan=p;this.stepT=[24,10,5][d];
  }
}

class BuffetBoard extends RiseBoard{
  constructor(...a){super(...a);this.biggest=0;this.hover=null}
  points(n){return (n-1)*(n-1)*6}
  attackFor(n){return n<=3?0:n<=5?1:n<=7?2:n<=9?3:Math.floor(n/2)-1}
  group(r,c){
    const t=this.live(r,c);if(!t)return [];
    const out=[[r,c]],seen=new Set([r*COLS+c]);
    for(let i=0;i<out.length;i++){const [rr,cc]=out[i];
      for(const [dr,dc] of N4){const r2=rr+dr,c2=cc+dc,k=r2*COLS+c2,u=this.live(r2,c2);if(u&&u.t===t.t&&!seen.has(k)){seen.add(k);out.push([r2,c2])}}}
    return out;
  }
  // tap: grab the whole group (2 or more touching, side by side or up and down)
  grab(r,c){
    if(this.dead)return false;
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
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(seen.has(r*COLS+c)||!this.live(r,c))continue;const gr=this.group(r,c);gr.forEach(([a,b])=>seen.add(a*COLS+b));if(gr.length>=2)out.push(gr)}
    return out;
  }
  ai(){
    const d=this.game.d|0;
    if(this.busy||--this.think>0)return;
    this.think=[85,40,20][d]+Math.floor(Math.random()*[70,30,14][d]);
    const gs=this.groups();if(!gs.length)return;
    const h=this.height();
    let pick;
    if(d===0)pick=gs[Math.floor(Math.random()*gs.length)];   // Easy: any plate it spots
    else{
      // bigger plates send more, but clear the top when the stack climbs
      const sc=g=>g.length*(h>=9?1:2)+(h>=8?(ROWS-Math.min(...g.map(x=>x[0])))*.6:0)+Math.random()*(d===1?3:1);
      pick=gs.reduce((a,b)=>sc(b)>sc(a)?b:a);
      // Medium/Hard hold off on tiny plates when there's time, waiting for them to grow
      if(pick.length<4&&h<7&&Math.random()<(d===2?.6:.35))return;
    }
    const [r,c]=pick[Math.floor(Math.random()*pick.length)];
    this.grab(r,c);
  }
}

E.RiseBoard=RiseBoard;
E.BOARD_TYPES.slurp=SlurpBoard;if(!E.VARIANTS.includes('slurp'))E.VARIANTS.push('slurp');
E.BOARD_TYPES.buffet=BuffetBoard;if(!E.VARIANTS.includes('buffet'))E.VARIANTS.push('buffet');
if(typeof module!=='undefined')module.exports={SlurpBoard,BuffetBoard,RiseBoard};
})();
