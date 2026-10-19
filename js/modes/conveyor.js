// Conveyor Belt (plug-in mode): a line of food rides a belt that snakes down the board towards the trash can.
// Throw food into the line: 3 or more of one food in a row pop, and the line closes up behind them, so the front
// of the line is pulled back. When the two foods meeting at the gap match, they pop too (a chain). If the front
// reaches the trash can you're out. Pops send trash bags into your rivals' lines (and speed their belts up for a moment).
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const {COLS,ROWS,NT}=E;
// ---------- the belt: lanes at y 0.8 ... 8.0 joined by half-circle turns ----------
const LANES=[0.8,2.6,4.4,6.2,8.0],XL=1.35,XR=4.65,R=0.9;   // turns stay inside the 6-wide board
const SEGS=[];
{SEGS.push({k:'l',x0:-0.7,y0:LANES[0],x1:XR,y1:LANES[0]});
 for(let i=0;i<LANES.length-1;i++){
   const right=i%2===0,cx=right?XR:XL,cy=LANES[i]+R;
   // right side turns clockwise (top -> bottom on the right), left side counter-clockwise
   SEGS.push(right?{k:'a',cx,cy,a0:-Math.PI/2,a1:Math.PI/2}:{k:'a',cx,cy,a0:-Math.PI/2,a1:-3*Math.PI/2});
   const y=LANES[i+1],last=i+1===LANES.length-1;
   if(right)SEGS.push({k:'l',x0:XR,y0:y,x1:last?XL:XL,y1:y});
   else SEGS.push({k:'l',x0:XL,y0:y,x1:last?4.3:XR,y1:y});
 }}
SEGS.forEach(s=>{s.len=s.k==='l'?Math.hypot(s.x1-s.x0,s.y1-s.y0):Math.abs(s.a1-s.a0)*R});
const L=SEGS.reduce((a,s)=>a+s.len,0);
const STEP=0.02,TAB=[];
for(let s=0;s<=L+STEP;s+=STEP)TAB.push(rawAt(s));
function rawAt(s){
  for(const g of SEGS){
    if(s<=g.len){const k=s/g.len;
      if(g.k==='l')return [g.x0+(g.x1-g.x0)*k,g.y0+(g.y1-g.y0)*k];
      const a=g.a0+(g.a1-g.a0)*k;return [g.cx+Math.cos(a)*R,g.cy+Math.sin(a)*R]}
    s-=g.len}
  const g=SEGS[SEGS.length-1];return [g.x1,g.y1];
}
// position on the belt at distance s (before the entrance it carries on straight off the left edge)
function at(s){
  if(s<0){const [x,y]=TAB[0];return [x+s,y]}
  const i=Math.min(TAB.length-2,Math.floor(s/STEP)),k=s/STEP-i,a=TAB[i],b=TAB[i+1];
  return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k];
}
const D=0.84,BR=0.42;            // spacing between foods along the belt, and a food's radius
const SX=3,SY=10.05;              // where your throws start
const SPD=0.42,CD=14;             // throw speed (units per frame), frames between throws
const AMIN=-Math.PI+0.12,AMAX=-0.12;
const BOT={think:[[85,130],[40,62],[24,36]],aimErr:[0.14,0.04,0.012],turn:[0.03,0.06,0.12],smart:[0.45,0.85,1]};

class ConveyorBoard extends E.BaseBoard{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{line:[],feed:0,ball:null,cool:0,aimA:-Math.PI/2,cur:0,next:1,lastT:-1,burstT:0,pend:0,chainT:0,junc:-1,
      popping:[],think:40,plan:null,uid:0,shots:0,belt:0});
    // the line starts a third of the way along the belt
    const n=13;for(let i=0;i<n;i++)this.line.push(this.mk(this.feedFood()));
    this.feed=10-(n-1)*D;
    this.line.forEach((b,i)=>{b.vs=this.sOf(i)});
    this.cur=this.pickThrow();this.next=this.pickThrow();
  }
  mk(t){return {t,id:++this.uid,vs:0,ins:0}}
  // runs of the same food come in clumps, so there's always something to aim at
  feedFood(){const t=this.lastT>=0&&this.rng()<.42?this.lastT:Math.floor(this.rng()*NT);this.lastT=t;return t}
  sOf(i){return this.feed+(this.line.length-1-i)*D}       // index 0 is the front of the line
  head(){return this.line.length?this.sOf(0):this.feed}
  height(){return Math.max(0,Math.min(ROWS,Math.round(this.head()/L*12)))}
  secs(){return (this.game.frame-this.startF)/60}
  speed(){const t=this.secs();let v=0.0042*(1+Math.min(9,t/55));if(this.burstT>0)v*=3.2;return v}
  colours(){const s=new Set();this.line.forEach(b=>{if(b.t>=0)s.add(b.t)});return [...s]}
  pickThrow(){const c=this.colours();return c.length?c[Math.floor(this.rng()*c.length)]:Math.floor(this.rng()*NT)}
  fixThrows(){const c=this.colours();if(!c.length)return;if(!c.includes(this.cur))this.cur=this.pickThrow();if(!c.includes(this.next))this.next=this.pickThrow()}
  // ---------- controls ----------
  canAct(){return !this.dead&&!this.game.over}
  setAim(a){this.aimA=Math.max(AMIN,Math.min(AMAX,a))}
  aimAt(x,y){this.setAim(Math.atan2(y-SY,x-SX))}
  swap(){if(!this.canAct())return false;[this.cur,this.next]=[this.next,this.cur];this.sfx('swap');return true}
  shoot(){
    if(!this.canAct()||this.ball||this.cool>0)return false;
    const a=this.aimA;this.ball={x:SX,y:SY,vx:Math.cos(a)*SPD,vy:Math.sin(a)*SPD,t:this.cur};
    this.cur=this.next;this.next=this.pickThrow();this.cool=CD;this.shots++;this.sfx('throw');return true;
  }
  // ---------- each frame ----------
  step(){
    if(this.dead)return;this.tickBase();
    if(this.cool>0)this.cool--;if(this.burstT>0)this.burstT--;
    // landed trash joins the line at the entrance and gives the belt a shove
    const tr=this.takeIncoming(4);
    if(tr){for(let i=0;i<tr;i++){this.line.push(this.mk(-1));this.feed-=D;this.line[this.line.length-1].vs=this.sOf(this.line.length-1)}
      this.burstT=Math.max(this.burstT,40+tr*12);this.shake=8;this.sfx('junk');this.pop(`+${tr} trash on the belt!`,2.4,1.9,'#E5682A',.75)}
    // the belt moves, new food comes in at the entrance
    const v=this.speed();this.feed+=v;this.belt+=v;
    while(this.feed>-D*.5){const b=this.mk(this.feedFood());this.line.push(b);this.feed-=D;b.vs=this.sOf(this.line.length-1)}
    // foods glide to where the belt says they are (a popped gap closes smoothly; the front rolls back)
    this.line.forEach((b,i)=>{const s=this.sOf(i);b.vs+=(s-b.vs)*.2;if(Math.abs(s-b.vs)<.002)b.vs=s;if(b.ins>0)b.ins--});
    if(this.popping.length)this.popping=this.popping.filter(p=>--p.life>0);
    if(this.ball)this.moveBall();
    // after a pop, once the gap has closed, see if the foods meeting there match
    if(this.chainT>0&&--this.chainT===0)this.checkJunction();
    if(this.head()>=L-.05){this.ball=null;return this.die()}
    if(this.isBot)this.ai();
  }
  moveBall(){
    const b=this.ball;
    for(let k=0;k<3;k++){   // a few sub-steps so a fast throw can't skip through the line
      b.x+=b.vx/3;b.y+=b.vy/3;
      const hit=this.hitTest(b.x,b.y);
      if(hit){this.insert(hit,b.t);this.ball=null;return}
      if(b.y<-0.6||b.x<-0.6||b.x>COLS+0.6){this.ball=null;return}
    }
  }
  // which food a throw at (x,y) touches, and whether it goes in front of it or behind it
  hitTest(x,y){
    let best=null,bd=(BR*2*.93)**2;
    for(let i=0;i<this.line.length;i++){const s=this.sOf(i);if(s<-.2)continue;const [px,py]=at(s),d=(px-x)**2+(py-y)**2;if(d<bd){bd=d;best=i}}
    if(best==null)return null;
    const s=this.sOf(best),f=at(s+D/2),r=at(s-D/2);
    const front=(f[0]-x)**2+(f[1]-y)**2<(r[0]-x)**2+(r[1]-y)**2;
    return {i:best,front};
  }
  insert(hit,t){
    const at_=hit.front?hit.i:hit.i+1,b=this.mk(t);b.ins=8;
    this.line.splice(at_,0,b);b.vs=this.sOf(at_);
    this.sfx('tap');
    const run=this.runAt(at_);
    if(run&&run[1]-run[0]+1>=3){this.chain=0;this.pend=0;this.popRun(run[0],run[1])}
  }
  runAt(i){
    const L_=this.line;if(i<0||i>=L_.length||L_[i].t<0)return null;const t=L_[i].t;let a=i,b=i;
    while(a>0&&L_[a-1].t===t)a--;while(b<L_.length-1&&L_[b+1].t===t)b++;return [a,b];
  }
  popRun(a,b){
    const n=b-a+1;this.chain++;this.maxChain=Math.max(this.maxChain,this.chain);this.maxCombo=Math.max(this.maxCombo,n);
    // trash bags touching the pop go too
    if(a>0&&this.line[a-1].t<0)a--;if(b<this.line.length-1&&this.line[b+1].t<0)b++;
    let cx=0,cy=0;
    for(let i=a;i<=b;i++){const f=this.line[i],[x,y]=at(f.vs);cx+=x;cy+=y;this.popping.push({x,y,t:f.t,life:16});this.burst(x,y,f.t,5)}
    cx/=b-a+1;cy/=b-a+1;
    const t0=this.line[a].t;this.line.splice(a,b-a+1);
    this.score+=n*10*this.chain*this.chain;
    this.pend+=(this.chain===1?1:2)+Math.max(0,n-3);
    if(this.chain>1){this.pop(`${this.chain} chain!`,cx,cy-.6,'#F7C548',1+.1*Math.min(4,this.chain));this.sfx('chain',this.chain)}
    else{this.pop(n>3?`${n} in a row!`:'Pop!',cx,cy-.6,'#EEF0FA',.85);this.sfx('match',n)}
    this.shake=Math.min(10,3+this.chain*2);
    // the gap closes; when it has, check whether the two sides now match
    this.junc=a;this.chainT=12;
    this.fixThrows();void t0;
  }
  checkJunction(){
    const i=this.junc,L_=this.line;
    if(i>0&&i<L_.length&&L_[i-1].t>=0&&L_[i-1].t===L_[i].t){const r=this.runAt(i);if(r&&r[1]-r[0]+1>=3){this.popRun(r[0],r[1]);return}}
    // chain over: throw what it earned
    if(this.pend>0)this.sendJunk(this.pend);
    this.pend=0;this.chain=0;this.junc=-1;
  }
  // ---------- online ----------
  snap(){
    let l='';for(const b of this.line)l+=b.t<0?'j':String(b.t);
    const b=this.ball;
    return {id:this.id,cv:1,ht:this.height(),i:this.incoming(),q:0,o:this.kos,d:this.dead?1:0,k:0,
      l,f:+this.feed.toFixed(2),a:+this.aimA.toFixed(2),u:this.cur,n:this.next,b:b?[+b.x.toFixed(2),+b.y.toFixed(2),b.t]:0,bt:+this.belt.toFixed(2)};
  }
  // ---------- bot ----------
  // where a throw at angle a would join the line (the same path the real throw takes)
  trace(a){
    let x=SX,y=SY;const vx=Math.cos(a)*SPD/3,vy=Math.sin(a)*SPD/3;
    for(let k=0;k<180;k++){x+=vx;y+=vy;const h=this.hitTest(x,y);if(h)return Object.assign(h,{x,y});if(y<-.6||x<-.6||x>COLS+.6)return null}
    return null;
  }
  // how good is putting food t at index i
  value(i,t){
    const L_=this.line;let a=i,b=i-1;   // the run the new food would join: left neighbours [a..i-1] and right [i..b]
    let n=1;let j=i-1;while(j>=0&&L_[j].t===t){n++;j--}let k=i;while(k<L_.length&&L_[k].t===t){n++;k++}
    const front=1-Math.min(1,i/Math.max(1,L_.length));   // nearer the trash can is more urgent
    if(n>=3){
      let v=40+n*8+front*30;
      // would the gap close on a match? (chain)
      const l=L_[j],r=L_[k];if(l&&r&&l.t>=0&&l.t===r.t){let m=2;let jj=j-1;while(jj>=0&&L_[jj].t===l.t){m++;jj--}let kk=k+1;while(kk<L_.length&&L_[kk].t===l.t){m++;kk++}if(m>=3)v+=60}
      void a;void b;return v;
    }
    return n===2?6+front*4:-2;
  }
  ai(){
    const d=this.game.d|0;
    if(this.ball||this.cool>0)return;
    if(!this.plan){
      if(--this.think>0)return;
      const [t0,t1]=BOT.think[d];this.think=t0+Math.floor(Math.random()*(t1-t0));
      let best=null;
      for(const sw of [0,1]){const t=sw?this.next:this.cur;
        for(let a=AMIN+.02;a<=AMAX;a+=.025){const h=this.trace(a);if(!h)continue;const i=h.front?h.i:h.i+1;
          const v=this.value(i,t)+Math.random()*(1-BOT.smart[d])*40-(sw?3:0);
          if(!best||v>best.v)best={a,v,sw}}}
      if(!best)best={a:-Math.PI/2+(Math.random()-.5),v:0,sw:0};
      best.a+=(Math.random()-.5)*2*BOT.aimErr[d];
      this.plan=best;if(best.sw)this.swap();
      return;
    }
    const p=this.plan,da=p.a-this.aimA,st=BOT.turn[d];
    if(Math.abs(da)>st){this.setAim(this.aimA+Math.sign(da)*st);return}
    this.setAim(p.a);this.shoot();this.plan=null;
  }
}
ConveyorBoard.GEO={L,D,BR,SX,SY,at,SEGS,LANES,AMIN,AMAX,SPD};
E.BOARD_TYPES.conveyor=ConveyorBoard;if(!E.VARIANTS.includes('conveyor'))E.VARIANTS.push('conveyor');
if(typeof module!=='undefined')module.exports=ConveyorBoard;
})();
