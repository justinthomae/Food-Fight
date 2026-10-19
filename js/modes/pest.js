// Pest Control: your picnic is six plates of food along the bottom of the board, three bites each.
// Ants (slow, straight), flies (fast, zigzag) and mice (two swats) head for a plate; tap one to swat it.
// A pest that reaches a plate takes a bite; no bites left on any plate and you're out.
// Now and then a cat strolls across: swat it and it hisses and knocks a bite off the nearest plate.
// Quick streaks of swats send trash; trash that lands on you arrives as extra pests.
(function(){
const E=typeof module!=='undefined'?require('../engine.js'):window.FFEngine;
const {COLS,ROWS}=E;
const ANT=0,FLY=1,MOUSE=2,CAT=3;
const PLATE_Y=11.15,BITES=3,HIT_R=.8,STREAK_GAP=60;
const SPEED=[.017,.032,.026,.03];   // units per frame at the start
const SCORE=[10,20,40];
// bots: how long before they react to a new pest, how far off they aim, how often they can swat, how often they slap the cat
const BOT={react:[50,24,12],err:[.75,.3,.12],gap:[46,20,11],cat:[.12,.02,0]};

class PestBoard extends E.BaseBoard{
  constructor(game,name,isBot,idx,id,seed){
    super(game,name,isBot,idx,id,seed);
    Object.assign(this,{pest:true,bites:new Array(COLS).fill(BITES),pests:[],marks:[],nextSpawn:90,nextCat:60*(14+this.rng()*8),
      combo:0,lastSwat:-999,swats:0,misses:0,stunT:0,botT:40,pid:0});
  }
  secs(){return (this.game.frame-this.startF)/60}
  // gets faster and busier the longer the picnic goes on
  pace(){return 1+this.secs()/80}
  alivePlates(){const a=[];this.bites.forEach((b,c)=>{if(b>0)a.push(c)});return a}
  totalBites(){return this.bites.reduce((a,b)=>a+b,0)}
  height(){return Math.round((COLS*BITES-this.totalBites())/(COLS*BITES)*ROWS)}
  plateX(c){return c+.5}
  // ---------- pests ----------
  spawn(kind,fromTrash){
    const plates=this.alivePlates();if(!plates.length)return;
    const rng=this.rng,p={id:++this.pid,k:kind,t:0,hp:kind===MOUSE?2:1,ph:rng()*6.28,daze:0,trash:!!fromTrash};
    if(kind===CAT){
      const left=rng()<.5;p.x=left?-1:COLS+1;p.y=7.6+rng()*2;p.dir=left?1:-1;
    }else{
      const side=rng();
      if(side<.6){p.x=.3+rng()*(COLS-.6);p.y=-.5}
      else if(side<.8){p.x=-.5;p.y=.5+rng()*6}
      else{p.x=COLS+.5;p.y=.5+rng()*6}
      p.tc=plates[Math.floor(rng()*plates.length)];
    }
    p.px=p.x;p.py=p.y;p.vx=0;p.vy=0;
    this.pests.push(p);
  }
  spawnKind(){
    const s=this.secs(),r=this.rng();
    if(s>20&&r<.2)return MOUSE;
    if(s>8&&r<.5)return FLY;
    return ANT;
  }
  movePests(){
    const pace=this.pace(),keep=[];
    for(const p of this.pests){
      p.px=p.x;p.py=p.y;p.t++;
      if(p.k===CAT){
        p.x+=p.dir*SPEED[CAT];p.y+=Math.sin(p.t*.05)*.004;p.vx=p.dir;p.vy=0;
        if(p.x<-1.6||p.x>COLS+1.6)continue;
        keep.push(p);continue;
      }
      if(p.daze>0){p.daze--;keep.push(p);continue}
      if(this.bites[p.tc]<=0){const a=this.alivePlates();if(!a.length){keep.push(p);continue}p.tc=a.reduce((b,c)=>Math.abs(c+.5-p.x)<Math.abs(b+.5-p.x)?c:b,a[0])}
      const tx=this.plateX(p.tc),ty=PLATE_Y-.2;
      let dx=tx-p.x,dy=ty-p.y;const d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;
      let sp=SPEED[p.k]*pace;
      if(p.k===FLY){   // zigzag: a sideways wobble across the line to the plate
        const w=Math.sin(p.t*.12+p.ph)*.9;const nx=dx-dy*w,ny=dy+dx*w,n=Math.hypot(nx,ny);dx=nx/n;dy=ny/n;
      }else if(p.k===ANT){const w=Math.sin(p.t*.07+p.ph)*.15;const nx=dx-dy*w,ny=dy+dx*w,n=Math.hypot(nx,ny);dx=nx/n;dy=ny/n}
      p.vx=dx;p.vy=dy;p.x+=dx*sp;p.y+=dy*sp;
      if(Math.hypot(tx-p.x,ty-p.y)<.3){this.bite(p.tc,p);continue}
      keep.push(p);
    }
    this.pests=keep;
  }
  bite(c,p){
    if(this.bites[c]<=0)return;
    this.bites[c]--;this.shake=6;
    this.pop(this.bites[c]?'Chomp!':'Plate gone!',c+.5,PLATE_Y-1.3,'#E5682A',this.bites[c]?.8:.95);
    this.sfx(this.bites[c]?'stolen':'junk');this.burst(c+.5,PLATE_Y,c%5,6);
    if(!this.alivePlates().length)this.die();
  }
  // ---------- swatting (the human taps, bots call the same thing) ----------
  canSwat(){return !this.dead&&this.stunT<=0}
  swat(x,y){
    if(!this.canSwat())return false;
    // nearest pest in reach; the cat only if nothing else is there
    let best=null,bd=1e9,cat=null,cd=1e9;
    for(const p of this.pests){const r=p.k===CAT?.85:p.k===MOUSE?HIT_R*1.05:HIT_R,d=Math.hypot(p.x-x,p.y-y);if(d>r)continue;
      if(p.k===CAT){if(d<cd){cd=d;cat=p}}else if(d<bd){bd=d;best=p}}
    const f=this.game.frame;
    if(!best&&cat){
      this.marks.push({x,y,life:24,hit:0});
      cat.hissT=40;cat.dir*=1;this.stunT=60;this.combo=0;
      const a=this.alivePlates();if(a.length){const c=a.reduce((b,k)=>Math.abs(k+.5-cat.x)<Math.abs(b+.5-cat.x)?k:b,a[0]);this.bite(c,cat)}
      this.pop('Hissss! Not the cat!',3,6,'#F2A7D2',.95);this.sfx('sauce');
      return false;
    }
    if(!best){this.marks.push({x,y,life:18,hit:0});this.misses++;this.sfx('tap');return false}
    this.marks.push({x:best.x,y:best.y,life:30,hit:1});
    best.hp--;
    if(best.hp>0){best.daze=26;best.x-=best.vx*.5;best.y-=best.vy*.5;best.px=best.x;best.py=best.y;this.pop('Bonk!',best.x,best.y-.6,'#EEF0FA',.7);this.sfx('break');return true}
    this.pests.splice(this.pests.indexOf(best),1);
    this.swats++;this.combo=f-this.lastSwat<=STREAK_GAP?this.combo+1:1;this.lastSwat=f;
    this.maxChain=Math.max(this.maxChain,this.combo);
    this.score+=Math.round(SCORE[best.k]*(1+Math.min(4,Math.max(0,this.combo-1))*.25));   // streak bonus caps at x2
    this.burst(best.x,best.y,-1,7);
    if(this.combo>=3){this.pop(`${this.combo} in a row!`,best.x,best.y-.7,'#F7C548',.85);this.sfx('chain',this.combo-1)}
    else{this.pop(['Squish!','Splat!','Got it!'][best.k],best.x,best.y-.6,'#EEF0FA',.7);this.sfx('match',3+best.k)}
    return true;
  }
  // a streak ends when you go a second without a swat: long streaks dump trash on your target
  endStreak(){
    if(this.combo>=3){const n=Math.min(8,this.combo-2);this.sendJunk(n);this.pop(`Streak! ${n} pest${n>1?'s':''} sent`,3,5,'#F7C548',.85)}
    this.combo=0;
  }
  receive(cells,from){super.receive(cells,from)}
  // ---------- each frame ----------
  step(){
    if(this.dead)return;this.tickBase();
    if(this.stunT>0)this.stunT--;
    this.marks=this.marks.filter(m=>--m.life>0);
    this.pests.forEach(p=>{if(p.hissT>0)p.hissT--});
    if(this.combo&&this.game.frame-this.lastSwat>STREAK_GAP)this.endStreak();
    // new pests: about one every 1.8 s at the start, faster and faster
    if(--this.nextSpawn<=0){
      const s=this.secs();
      this.spawn(this.spawnKind());
      if(s>90&&this.rng()<Math.min(.6,(s-90)/150))this.spawn(this.spawnKind());   // rush hour: pairs
      this.nextSpawn=Math.max(14,Math.round(108/this.pace()-s*.12))+Math.floor(this.rng()*20);
    }
    if(--this.nextCat<=0){this.spawn(CAT);this.nextCat=60*(12+this.rng()*12)}
    // trash that has landed: extra pests from whoever sent it
    if(this.inc.length&&this.inc[0].t<=0){
      const from=this.inc[0].from,n=this.takeIncoming(8);
      for(let i=0;i<n;i++)this.spawn(i%3===2?FLY:ANT,true);
      if(n){this.pop(`+${n} pest${n>1?'s':''}${from&&from.name?' from '+from.name:''}!`,3,3,'#E5682A',.85);this.sfx('junk');this.shake=6}
    }
    this.movePests();
    if(this.isBot)this.ai();
  }
  // ---------- bot ----------
  ai(){
    if(--this.botT>0||!this.canSwat())return;
    const d=this.game.d|0;
    this.botT=BOT.gap[d]+Math.floor(Math.random()*BOT.gap[d]*.6);
    const seen=this.pests.filter(p=>p.t>=BOT.react[d]);if(!seen.length){this.botT=6;return}
    let tgt;
    const cat=seen.find(p=>p.k===CAT);
    if(cat&&Math.random()<BOT.cat[d])tgt=cat;
    else{const bugs=seen.filter(p=>p.k!==CAT);if(!bugs.length){this.botT=6;return}tgt=bugs.reduce((a,b)=>b.y>a.y?b:a,bugs[0])}
    const e=BOT.err[d],ang=Math.random()*6.28,r=Math.random()*e*1.5;
    const lead=SPEED[tgt.k]*this.pace()*8;
    this.swat(tgt.x+tgt.vx*lead+Math.cos(ang)*r,tgt.y+tgt.vy*lead+Math.sin(ang)*r);
  }
  snap(){
    return {id:this.id,cv:1,ht:this.height(),i:this.incoming(),q:0,o:this.kos,d:this.dead?1:0,k:0,
      b:this.bites.join(''),s:this.swats,
      p:this.pests.map(p=>[p.k===CAT&&p.dir<0?4:p.k,Math.round(p.x*10)/10,Math.round(p.y*10)/10])};
  }
}
PestBoard.KIND={ANT,FLY,MOUSE,CAT};PestBoard.PLATE_Y=PLATE_Y;PestBoard.BITES=BITES;
E.BOARD_TYPES.pest=PestBoard;if(!E.VARIANTS.includes('pest'))E.VARIANTS.push('pest');
if(typeof module!=='undefined')module.exports=PestBoard;
})();
