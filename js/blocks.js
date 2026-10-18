// Block Battle (hidden, admin-only mode): classic falling-block versus play in the style of the old online battle games.
// 10x20 well, 7 pieces from a shuffled bag, SRS rotation + wall kicks, hold, 5-piece preview, ghost, DAS/ARR,
// lock delay with move resets, T-spins, back-to-back, combos and garbage lines that cancel incoming garbage.
// Plugs into the engine as BOARD_TYPES.blocks and speaks the same board interface as the other modes.
(function(){
const E=typeof module!=='undefined'?require('./engine.js'):window.FFEngine;
const {ROWS,DIFFS,mulberry32}=E;
const rnd=n=>Math.floor(Math.random()*n);
const W=10,VH=20,HID=2,H=VH+HID;          // 2 hidden rows above the visible 20
const DAS=10,ARR=2,LOCK=30,RESETS=15,ARE=6,CLEAR_T=14,GARB_T=20;
// piece ids: 1 I, 2 O, 3 T, 4 S, 5 Z, 6 J, 7 L, 8 = garbage
const NAMES=['','I','O','T','S','Z','J','L'];
const BASE={1:[[1,0],[1,1],[1,2],[1,3]],2:[[0,1],[0,2],[1,1],[1,2]],3:[[0,1],[1,0],[1,1],[1,2]],4:[[0,1],[0,2],[1,0],[1,1]],5:[[0,0],[0,1],[1,1],[1,2]],6:[[0,0],[1,0],[1,1],[1,2]],7:[[0,2],[1,0],[1,1],[1,2]]};
const BOX={1:4,2:4,3:3,4:3,5:3,6:3,7:3};
// all four rotation states, made by turning the spawn state clockwise inside its box (that's exactly SRS)
const SHAPES={};
for(let p=1;p<=7;p++){const n=BOX[p];let s=BASE[p];SHAPES[p]=[s];for(let k=1;k<4;k++){s=s.map(([r,c])=>[c,n-1-r]);SHAPES[p].push(s)}}
SHAPES[2]=[BASE[2],BASE[2],BASE[2],BASE[2]];
// SRS kick tests as [dc,dr] (dr down is positive)
const K=(a)=>a.map(([x,y])=>[x,-y]);
const KJ={'0>1':K([[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]]),'1>0':K([[0,0],[1,0],[1,-1],[0,2],[1,2]]),'1>2':K([[0,0],[1,0],[1,-1],[0,2],[1,2]]),'2>1':K([[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]]),
  '2>3':K([[0,0],[1,0],[1,1],[0,-2],[1,-2]]),'3>2':K([[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]),'3>0':K([[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]),'0>3':K([[0,0],[1,0],[1,1],[0,-2],[1,-2]])};
const KI={'0>1':K([[0,0],[-2,0],[1,0],[-2,-1],[1,2]]),'1>0':K([[0,0],[2,0],[-1,0],[2,1],[-1,-2]]),'1>2':K([[0,0],[-1,0],[2,0],[-1,2],[2,-1]]),'2>1':K([[0,0],[1,0],[-2,0],[1,-2],[-2,1]]),
  '2>3':K([[0,0],[2,0],[-1,0],[2,1],[-1,-2]]),'3>2':K([[0,0],[-2,0],[1,0],[-2,-1],[1,2]]),'3>0':K([[0,0],[1,0],[-2,0],[1,-2],[-2,1]]),'0>3':K([[0,0],[-1,0],[2,0],[-1,2],[2,-1]])};
// battle garbage: lines sent for each clear
const ATK_N=[0,0,1,2,4],ATK_TS=[0,2,4,6],ATK_MINI=[0,0,1,2],COMBO=[0,1,1,2,2,3,3,4,4,4,5];
const PTS_N=[0,100,300,500,800],PTS_TS=[400,800,1200,1600],PTS_MINI=[100,200,400,600];
// bots: how long they think, how fast they move, how sloppy they are
// Items, Tetris Friends Arena style: some pieces carry a flashing "?" block; clear the line it's in to rack a random item (3 max).
// V (or tap) throws the oldest at your target. The last three only work on yourself.
const ITEMS=['swap','scramble','twist','quake','speed','dark','shotgun','blast','hide','shield','avalanche','push'];
const ITEM_NAME={swap:'Switcheroo',scramble:'Scramble',twist:'Twist',quake:'Earthquake',speed:'Speed up',dark:'Darkness',shotgun:'Shotgun',blast:'Garbage blast',hide:'Hide',shield:'Shield',avalanche:'Avalanche',push:'Push'};
const SELF=['shield','avalanche','push'],RACK_N=3,SP=16;   // a locked cell value with the 16 bit set is a "?" block
const FX_T={speed:360,dark:480,hide:600,shield:600};
const BOT={think:[46,26,12],move:[8,4,2],noise:[.9,.35,.06],drop:[0,1,1]};

class BlocksBoard{
  constructor(game,name,isBot,idx,id,seed){
    Object.assign(this,{game,name,isBot,idx,id:id||('b'+idx),rng:mulberry32(seed>>>0),blocks:true,
      rise:0,chain:0,maxChain:1,maxCombo:0,score:0,inc:[],dead:false,sent:0,blocked:0,kos:0,pops:[],parts:[],shake:0,
      lastAttacker:null,killedBy:null,place:0,hitFlash:0,diedAt:0,rack:[],rushT:0,creamT:0,frozenT:0,blendT:0,dmg:0,
      state:'are',wait:30,piece:null,bag:[],queue:[],hold:0,holdUsed:false,lines:0,combo:-1,b2b:false,
      lockT:0,resets:0,lowest:0,gAcc:0,soft:false,dir:0,dasT:0,arrT:0,lastRot:false,lastKick:0,clearRows:null,clearT:0,
      plan:null,think:30,moveT:0,startF:game.frame,flash:[],spCell:-1,speedT:0,darkT:0,hideT:0,shieldT:0,fireT:200});
    this.m=[];for(let r=0;r<H;r++)this.m.push(new Array(W).fill(0));
    while(this.queue.length<6)this.queue.push(this.draw());
  }
  // the visible 20 rows (shared code peeks at g[0] / g[1] to see if you're in danger)
  get g(){return this.m.slice(HID)}
  draw(){
    if(!this.bag.length){this.bag=[1,2,3,4,5,6,7];for(let i=6;i>0;i--){const j=Math.floor(this.rng()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]]}}
    return this.bag.pop();
  }
  sfx(n,a){if(this===this.game.player&&this.game.hooks.sfx)this.game.hooks.sfx(n,a)}
  pop(text,x,y,col,size){if(this===this.game.player)this.pops.push({text,x,y,col,size,life:70})}
  height(){for(let r=HID;r<H;r++)if(this.m[r].some(Boolean))return Math.round((H-r)/VH*ROWS);return 0}
  rows(){for(let r=HID;r<H;r++)if(this.m[r].some(Boolean))return H-r;return 0}
  cellsOf(p,rot,r,c){return SHAPES[p][rot].map(([dr,dc])=>[r+dr,c+dc])}
  fitsAt(p,rot,r,c){for(const [rr,cc] of this.cellsOf(p,rot,r,c)){if(cc<0||cc>=W||rr>=H)return false;if(rr>=0&&this.m[rr][cc])return false}return true}
  fits(o){return this.fitsAt(o.p,o.rot,o.r,o.c)}
  level(){return Math.min(15,1+Math.floor((this.game.frame-this.startF)/(60*30)))}
  gravity(){const l=this.level();return 1/(60*Math.pow(.8-(l-1)*.007,l-1))}   // rows per frame (guideline curve)
  ghostRow(){const p=this.piece;if(!p)return 0;let r=p.r;while(this.fitsAt(p.p,p.rot,r+1,p.c))r++;return r}
  // ---------- spawning ----------
  spawn(type){
    const p=type||this.queue.shift();if(!type){this.queue.push(this.draw())}
    // appears fully inside the top of the visible well; if that's blocked it tries the hidden rows above before topping out
    const o={p,rot:0,r:p===1?HID-1:HID,c:3};
    while(!this.fits(o)&&o.r>(p===1?-1:0))o.r--;
    if(!this.fits(o)){this.piece=null;return this.die()}
    this.spCell=this.rng()<1/6?Math.floor(this.rng()*4):-1;   // about one piece in six carries a ? block
    this.piece=o;this.pid=(this.pid||0)+1;this.lockT=0;this.resets=0;this.lowest=o.r;this.gAcc=0;this.lastRot=false;this.lastKick=0;
    this.state='fall';this.plan=null;if(this.isBot)this.soft=false;
  }
  // ---------- player controls ----------
  canAct(){return !this.dead&&this.state==='fall'&&!!this.piece}
  touched(){   // moved or turned: lock delay resets (a limited number of times per piece)
    const p=this.piece;if(p.r>this.lowest){this.lowest=p.r;this.resets=0}
    if(this.resets<RESETS){this.lockT=0;this.resets++}
  }
  shift(d){
    if(!this.canAct())return false;const p=this.piece;
    if(!this.fitsAt(p.p,p.rot,p.r,p.c+d))return false;
    p.c+=d;this.lastRot=false;this.touched();this.sfx('tap');return true;
  }
  rotate(d){
    if(!this.canAct())return false;const p=this.piece;if(p.p===2)return false;
    const to=(p.rot+(d>0?1:3))%4,tests=(p.p===1?KI:KJ)[p.rot+'>'+to];
    for(let i=0;i<tests.length;i++){const [dc,dr]=tests[i];
      if(this.fitsAt(p.p,to,p.r+dr,p.c+dc)){p.rot=to;p.r+=dr;p.c+=dc;this.lastRot=true;this.lastKick=i;this.touched();this.sfx('swap');return true}}
    return false;
  }
  hardDrop(){
    if(!this.canAct())return false;const p=this.piece,r=this.ghostRow();
    if(r>p.r){this.score+=(r-p.r)*2;this.lastRot=false}p.r=r;this.lock();this.shake=3;return true;
  }
  doHold(){
    if(!this.canAct()||this.holdUsed)return false;
    const cur=this.piece.p,had=this.hold;this.hold=cur;this.piece=null;
    if(had)this.spawn(had);else this.spawn();
    this.holdUsed=true;this.sfx('swap');return true;
  }
  // keyboard / buttons: press and release, auto-repeat handled in step()
  press(a){
    if(a==='L'||a==='R'){const d=a==='L'?-1:1;this.dir=d;this.dasT=0;this.arrT=0;this.shift(d)}
    else if(a==='SD')this.soft=true;
    else if(a==='HD')this.hardDrop();
    else if(a==='CW')this.rotate(1);
    else if(a==='CCW')this.rotate(-1);
    else if(a==='HOLD')this.doHold();
  }
  release(a){
    if(a==='L'&&this.dir===-1)this.dir=0;else if(a==='R'&&this.dir===1)this.dir=0;
    else if(a==='SD')this.soft=false;
  }
  moveTo(c){if(!this.canAct())return;let n=0;while(this.piece&&this.piece.c!==c&&n++<12){if(!this.shift(Math.sign(c-this.piece.c)))break}}
  // ---------- each frame ----------
  step(){
    if(this.dead)return;
    if(this.shake>0)this.shake--;if(this.hitFlash>0)this.hitFlash--;
    this.inc.forEach(i=>{if(i.t>0)i.t--});
    if(this.speedT>0)this.speedT--;if(this.darkT>0)this.darkT--;if(this.hideT>0)this.hideT--;if(this.shieldT>0)this.shieldT--;
    if(this.state==='are'){if(--this.wait<=0)this.spawn()}
    else if(this.state==='clear'){if(--this.clearT<=0)this.collapse()}
    else if(this.state==='fall')this.fall();
    if(this.isBot)this.ai();
    if(this.pops.length)this.pops=this.pops.filter(p=>--p.life>0);
    if(this.parts.length)this.parts=this.parts.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.02;return --p.life>0});
  }
  fall(){
    const p=this.piece;
    // held left/right: wait DAS frames, then repeat every ARR frames
    if(this.dir&&!this.isBot){this.dasT++;if(this.dasT>=DAS){if(++this.arrT>=ARR){this.arrT=0;this.shift(this.dir)}}}
    if(!this.piece)return;
    const base=this.speedT>0?Math.max(this.gravity()*12,.34):this.gravity();
    const g=this.soft?Math.max(base*20,.5):base;
    this.gAcc+=g;
    while(this.gAcc>=1){this.gAcc-=1;
      if(this.fitsAt(p.p,p.rot,p.r+1,p.c)){p.r++;this.lastRot=false;if(this.soft)this.score+=1;if(p.r>this.lowest){this.lowest=p.r;this.resets=0;this.lockT=0}}
      else{this.gAcc=0;break}}
    if(!this.fitsAt(p.p,p.rot,p.r+1,p.c)){if(++this.lockT>=LOCK)this.lock()}
    else this.lockT=0;
  }
  tspin(){
    const p=this.piece;if(p.p!==3||!this.lastRot)return null;
    const occ=(r,c)=>c<0||c>=W||r>=H||(r>=0&&!!this.m[r][c]);
    const cs=[[p.r,p.c],[p.r,p.c+2],[p.r+2,p.c+2],[p.r+2,p.c]];   // TL TR BR BL
    const n=cs.filter(([r,c])=>occ(r,c)).length;if(n<3)return null;
    const front=[[0,1],[1,2],[2,3],[3,0]][p.rot];
    return (occ(...cs[front[0]])&&occ(...cs[front[1]]))||this.lastKick===4?'full':'mini';
  }
  lock(){
    const p=this.piece;if(!p)return;
    const ts=this.tspin(),cells=this.cellsOf(p.p,p.rot,p.r,p.c);
    cells.forEach(([r,c],i)=>{if(r>=0)this.m[r][c]=p.p|(i===this.spCell?SP:0)});this.spCell=-1;
    this.piece=null;this.sfx('swap');
    // locked entirely above the visible well: out
    if(cells.every(([r])=>r<HID))return this.die();
    const full=[];for(let r=0;r<H;r++)if(this.m[r].every(Boolean))full.push(r);
    const n=full.length;
    if(n){
      this.combo++;
      const diff=n===4||(ts&&n>0),b2b=diff&&this.b2b;
      let atk=(ts==='full'?ATK_TS[n]:ts==='mini'?ATK_MINI[n]:ATK_N[n])+(b2b?1:0)+COMBO[Math.min(this.combo,COMBO.length-1)];
      let pts=(ts==='full'?PTS_TS[n]:ts==='mini'?PTS_MINI[n]:PTS_N[n])*this.level();if(b2b)pts=Math.round(pts*1.5);pts+=50*Math.max(0,this.combo)*this.level();
      this.score+=pts;this.lines+=n;this.b2b=diff;
      this.maxChain=Math.max(this.maxChain,this.combo+1);this.maxCombo=Math.max(this.maxCombo,n);
      const label=(ts==='full'?'T-spin ':ts==='mini'?'T-spin mini ':'')+(ts?['','single','double','triple'][n]:['','Single','Double','Triple','Tetris!'][n]);
      const y=(full[0]-HID)/VH*ROWS;
      if(ts||n>=2)this.pop(label,3,y,n===4||ts?'#F7C548':'#EEF0FA',n===4||ts?1.15:.9);
      if(b2b)this.pop(n===4&&!ts?'Back-to-back Tetris!':'Back-to-back',3,y+.9,'#56B4E9',n===4?1:.8);
      if(this.combo>=1)this.pop(`${this.combo} combo`,3,y+(b2b?1.8:.9),'#CC79A7',.8);
      // sound: Tetris fanfare (with the announcer on a back-to-back Tetris), and a harp note that climbs with every back-to-back clear
      if(n===4&&!ts)this.sfx(b2b?'b2btetris':'tetris');else this.sfx(ts?'chain':'match',ts?4:n+1);
      if(this.combo>=1)this.sfx('harp',this.combo);
      // ? blocks in the cleared lines become items
      let got=0;full.forEach(r=>this.m[r].forEach(v=>{if(v&SP)got++}));
      for(let i=0;i<got;i++)this.earn({k:ITEMS[Math.floor(this.rng()*ITEMS.length)]},3,y-1-i*.8);
      if(atk>0)this.sendLines(atk);
      this.clearRows=full;this.clearT=CLEAR_T;this.state='clear';
      if(this.m.every(row=>row.every(v=>!v)))this.pop('Perfect clear!',3,6,'#F7C548',1.2);
      return;
    }
    if(ts){this.score+=(ts==='full'?400:100)*this.level();this.pop(ts==='full'?'T-spin':'T-spin mini',3,6,'#CC79A7',.85)}
    this.combo=-1;
    this.dropGarbage();
    if(this.dead)return;
    this.state='are';this.wait=ARE;this.holdUsed=false;
  }
  collapse(){
    const rows=this.clearRows||[];
    rows.forEach(r=>{for(let c=0;c<W;c++)this.burst(r,c,this.m[r][c]&15)});
    const keep=this.m.filter((row,r)=>!rows.includes(r));
    while(keep.length<H)keep.unshift(new Array(W).fill(0));
    this.m=keep;this.clearRows=null;
    this.state='are';this.wait=ARE;this.holdUsed=false;
  }
  burst(r,c,v){if(this!==this.game.player||r<HID)return;for(let i=0;i<2;i++)this.parts.push({x:(c+.5)*.6,y:(r-HID+.5)*.6,vx:(Math.random()-.5)*.12,vy:-Math.random()*.12,kind:v||8,life:18+rnd(10)})}
  // lines you clear first cancel garbage that's on its way to you, the rest goes to your target
  sendLines(n){
    let a=n,blocked=0;
    while(a>0&&this.inc.length){const it=this.inc[0],m=Math.min(a,it.cells);it.cells-=m;a-=m;blocked+=m;if(it.cells<=0)this.inc.shift()}
    if(blocked){this.blocked+=blocked;this.pop(`Blocked ${blocked}`,3,9,'#56B4E9',.85);this.sfx('block')}
    if(a<=0)return;
    const tgt=this.pickTarget();if(!tgt)return;
    this.game.launch(this,{k:'pie',cells:a,at:null},tgt);
  }
  pickTarget(){
    const g=this.game,others=g.alive().filter(b=>b!==this);if(!others.length)return null;
    if(this===g.player)return g.aim();
    const la=this.lastAttacker;if(la&&!la.dead&&la!==this&&Math.random()<.5)return la;
    return others[rnd(others.length)];
  }
  // garbage that has arrived rises in from the bottom after a piece locks without clearing
  dropGarbage(){
    let rows=0;
    while(this.inc.length&&this.inc[0].t<=0){
      const it=this.inc.shift(),hole=rnd(W);
      for(let i=0;i<it.cells;i++){
        if(this.m[0].some(Boolean)){this.die();return}
        this.m.shift();const row=new Array(W).fill(8);row[hole]=0;this.m.push(row);rows++;
      }
    }
    if(rows){this.shake=8;this.sfx('junk')}
  }
  receive(cells,from){if(this.dead)return;if(this.shieldT>0){this.blocked+=cells;this.pop(`Shield blocked ${cells}`,3,9,'#56B4E9',.85);this.sfx('block');this.lastAttacker=from;return}this.inc.push({cells,t:GARB_T,T:GARB_T,from});this.lastAttacker=from;this.hitFlash=18;this.sfx('incoming')}
  incoming(){return this.inc.reduce((a,i)=>a+i.cells,0)}
  // no items in this mode
  rush(){}cream(){}steam(){}grease(){}freeze(){}blend(){}lights(){}reverse(){}
  stealFrom(){return null}takeItem(){}
  earn(item,cx,cy){
    if(this.dead||!ITEMS.includes(item.k))return;
    item.id=E.nextId();this.rack.push(item);
    this.pop(ITEM_NAME[item.k]+'!',cx==null?3:cx,cy==null?6:cy,'#F7C548',.85);this.sfx('earn',true);
    if(this.rack.length>RACK_N){const i=this.rack.findIndex(x=>!SELF.includes(x.k));this.fire(i<0?0:i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
  }
  fire(i){
    if(this.dead||i<0||i>=this.rack.length)return false;
    const it=this.rack[i];
    if(SELF.includes(it.k)){this.rack.splice(i,1);this.effect(it.k,this)}
    else{const tgt=this.pickTarget();if(!tgt)return false;this.rack.splice(i,1);this.game.launch(this,{k:it.k,cells:0,at:null},tgt,i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
    return true;
  }
  // ---------- what each item does when it lands ----------
  effect(k,from){
    if(this.dead)return;
    const mine=from===this;if(!mine){this.lastAttacker=from;this.hitFlash=24}
    const say=(t,col)=>this.pop(t,3,6,col||'#F7C548',1.05);
    const stackTop=()=>{for(let r=0;r<H;r++)if(this.m[r].some(Boolean))return r;return H};
    if(k==='scramble'){
      // your piece and the whole preview turn into awkward ones
      const ugly=[4,5,4,5,2,1,3];
      for(let i=0;i<this.queue.length;i++)this.queue[i]=ugly[Math.floor(this.rng()*ugly.length)];
      const p=this.piece;if(p){const t=ugly[Math.floor(this.rng()*4)];const o={p:t,rot:0,r:p.r,c:Math.max(0,Math.min(W-BOX[t],p.c))};while(!this.fits(o)&&o.r>0)o.r--;if(this.fits(o)){this.piece=o;this.pid=(this.pid||0)+1}}
      this.holdUsed=false;say('Scrambled!','#CC79A7');this.sfx('blender');
    }else if(k==='twist'){
      // the whole stack flips left to right
      this.m=this.m.map(row=>row.slice().reverse());
      const p=this.piece;if(p){p.c=W-BOX[p.p]-p.c;p.rot=(4-p.rot)%4;while(!this.fits(p)&&p.r>0)p.r--}
      say('Twisted!','#CC79A7');this.shake=10;this.sfx('blender');
    }else if(k==='quake'){
      // every row slides a little, wrapping round: holes end up in all the wrong places
      this.m=this.m.map(row=>{if(!row.some(Boolean))return row;const d=Math.floor(this.rng()*5)-2;if(!d)return row;return row.map((_,c)=>row[((c-d)%W+W)%W])});
      const p=this.piece;if(p)while(!this.fits(p)&&p.r>0)p.r--;
      say('Earthquake!','#E5682A');this.shake=18;this.sfx('junk');
    }else if(k==='speed'){this.speedT=FX_T.speed;say('Speed up!','#E5682A');this.sfx('sauce')}
    else if(k==='dark'){this.darkT=FX_T.dark;say('Darkness!','#9AA3BC');this.sfx('freeze')}
    else if(k==='hide'){this.hideT=FX_T.hide;say('Next & Hold hidden!','#9AA3BC');this.sfx('freeze')}
    else if(k==='shotgun'){
      // pellets of junk land on top of random columns
      for(let i=0;i<8;i++){const c=Math.floor(this.rng()*W);let r=0;while(r<H&&!this.m[r][c])r++;if(r>0)this.m[r-1][c]=8}
      const p=this.piece;if(p)while(!this.fits(p)&&p.r>0)p.r--;
      say('Shotgun!','#E5484D');this.shake=12;this.sfx('junk');
    }else if(k==='blast'){
      // 4 garbage lines straight in, no warning (a shield still stops them)
      if(this.shieldT>0){this.receive(4,from);return}
      const hole=Math.floor(this.rng()*W);for(let i=0;i<4;i++){if(this.m[0].some(Boolean)){this.die();return}this.m.shift();const row=new Array(W).fill(8);row[hole]=0;this.m.push(row)}
      const p=this.piece;if(p)while(!this.fits(p)&&p.r>0)p.r--;
      say('Garbage blast!','#E5484D');this.shake=12;this.sfx('junk');
    }else if(k==='swap'){/* handled by the engine (boards trade wells) */}
    else if(k==='shield'){this.shieldT=FX_T.shield;say('Shield up!','#56B4E9');this.sfx('block')}
    else if(k==='avalanche'){
      // everything drops straight down into the holes, then full lines clear
      for(let c=0;c<W;c++){let w=H-1;for(let r=H-1;r>=0;r--){const v=this.m[r][c];if(!v)continue;if(r!==w){this.m[w][c]=v;this.m[r][c]=0}w--}}
      const n=this.clearFull();say(n?`Avalanche! ${n} line${n>1?'s':''}`:'Avalanche!','#56B4E9');this.shake=10;this.sfx('feast');
    }else if(k==='push'){
      // the bottom 4 rows are pushed out of the well
      for(let i=0;i<4;i++){this.m.pop();this.m.unshift(new Array(W).fill(0))}
      say('Pushed down 4!','#56B4E9');this.sfx('feast');
    }
  }
  clearFull(){const keep=this.m.filter(row=>!row.every(Boolean)),n=H-keep.length;while(keep.length<H)keep.unshift(new Array(W).fill(0));this.m=keep;this.lines+=n;return n}
  // Switcheroo: whole wells trade places (the engine swaps .m for two local boards, or sends this code online)
  gridCode(){let g='';for(const row of this.m)for(const v of row)g+=v?String.fromCharCode(64+v):'.';return {g,bk:1}}
  loadGrid(code){
    if(!code||typeof code.g!=='string'||code.g.length!==H*W)return false;
    for(let r=0;r<H;r++)for(let c=0;c<W;c++){const ch=code.g[r*W+c];let v=ch==='.'?0:ch.charCodeAt(0)-64;if(!(v>0&&v<=8+SP))v=0;this.m[r][c]=v}
    return true;
  }
  swapped(other){
    this.hitFlash=24;this.shake=12;this.pop(`Switcheroo! You got ${other&&other.name?other.name:'their'}'s well`,3,6,'#56B4E9',.85);this.sfx('blender');
    const p=this.piece;if(p){while(!this.fits(p)&&p.r>0)p.r--;if(!this.fits(p)){this.piece=null;this.state='are';this.wait=ARE}}
  }
  die(){if(this.dead)return;this.dead=true;this.diedAt=this.game.frame;this.piece=null;this.game.onDeath(this)}
  // what other players see: the visible well with the falling piece drawn in
  view(){
    const v=this.m.slice(HID).map(r=>r.map(x=>x&15));
    const p=this.piece;if(p)this.cellsOf(p.p,p.rot,p.r,p.c).forEach(([r,c])=>{if(r>=HID)v[r-HID][c]=p.p});
    return v;
  }
  snap(){
    const v=this.view();let g='';for(const row of v)for(const x of row)g+=x?String(x):'.';
    return {id:this.id,v:'blocks',g,i:this.incoming(),hd:this.hold|0,nx:this.queue.slice(0,3).join(''),o:this.kos,d:this.dead?1:0,k:0,x:0};
  }
  // ---------- bot brain: try every spin and column, keep the placement that leaves the tidiest well ----------
  evalPlace(p,rot,c){
    let r=p===1?-1:0;if(!this.fitsAt(p,rot,r,c)){r++;if(!this.fitsAt(p,rot,r,c))return null}
    while(this.fitsAt(p,rot,r+1,c))r++;
    const m=this.m.map(row=>row.slice()),cells=this.cellsOf(p,rot,r,c);
    cells.forEach(([rr,cc])=>{if(rr>=0)m[rr][cc]=p});
    let cleared=0;for(let rr=H-1;rr>=0;rr--)if(m[rr].every(Boolean)){m.splice(rr,1);cleared++}
    while(m.length<H)m.unshift(new Array(W).fill(0));
    const land=H-Math.max(...cells.map(x=>x[0]))-1+(BOX[p]-1)/2;
    let rowT=0,colT=0,holes=0,wells=0,hi=0;
    const hts=[];for(let cc=0;cc<W;cc++){let k=0;while(k<H&&!m[k][cc])k++;hts.push(H-k);hi=Math.max(hi,H-k)}
    for(let rr=0;rr<H;rr++){let prev=1;for(let cc=0;cc<W;cc++){const f=m[rr][cc]?1:0;if(f!==prev)rowT++;prev=f}if(!prev)rowT++}
    for(let cc=0;cc<W;cc++){let prev=0;for(let rr=0;rr<H;rr++){const f=m[rr][cc]?1:0;if(f!==prev)colT++;prev=f;if(!f&&rr>H-hts[cc])holes++}if(!prev)colT++}
    for(let cc=0;cc<W;cc++){const l=cc?hts[cc-1]:99,rr=cc<W-1?hts[cc+1]:99,d=Math.min(l,rr)-hts[cc];if(d>0)wells+=d*(d+1)/2}
    // when the well is getting tall, clearing lines matters more
    const urgent=hi>11?2.5:1;
    return -4.5*land+3.42*cleared*urgent+(cleared===4?6:0)-3.22*rowT-9.35*colT-7.9*holes-3.39*wells-(hi>17?60:0);
  }
  ai(){
    if(this.state!=='fall'||!this.piece)return;
    const d=this.game.d|0;
    if(this.rack.length&&--this.fireT<=0){
      this.fireT=[600,360,220][d]+rnd(240);const h=this.rows();
      const sh=this.rack.findIndex(x=>x.k==='shield'),av=this.rack.findIndex(x=>x.k==='avalanche'||x.k==='push'),atk=this.rack.findIndex(x=>!SELF.includes(x.k));
      if(sh>=0&&this.incoming()>0)this.fire(sh);else if(av>=0&&h>=11)this.fire(av);else if(atk>=0)this.fire(atk);
    }
    if(!this.plan){
      if(--this.think>0)return;
      this.think=BOT.think[d]+rnd(Math.max(1,BOT.think[d]>>1));
      let best=null,bs=-1e9;const p=this.piece.p;
      for(let rot=0;rot<(p===2?1:4);rot++)for(let c=-2;c<W;c++){
        const v=this.evalPlace(p,rot,c);if(v==null)continue;
        const s=v+(Math.random()-.5)*BOT.noise[d]*8;
        if(s>bs){bs=s;best={rot,c}}
      }
      this.plan=best||{rot:0,c:this.piece.c};this.moveT=0;
    }
    if(--this.moveT>0)return;
    this.moveT=BOT.move[d];
    const p=this.piece,pl=this.plan;
    if(p.rot!==pl.rot){if(!this.rotate(1))pl.rot=p.rot;return}
    if(p.c!==pl.c){if(!this.shift(Math.sign(pl.c-p.c)))pl.c=p.c;return}
    if(BOT.drop[d])this.hardDrop();else this.soft=true;
  }
}
BlocksBoard.GEO={W,VH,HID};
BlocksBoard.NAMES=NAMES;BlocksBoard.ITEMS=ITEMS;BlocksBoard.SELF=SELF;BlocksBoard.ITEM_NAME=ITEM_NAME;BlocksBoard.SP=SP;BlocksBoard.SHAPES=SHAPES;BlocksBoard.BOX=BOX;
E.BOARD_TYPES.blocks=BlocksBoard;
if(typeof module!=='undefined')module.exports=BlocksBoard;
})();
