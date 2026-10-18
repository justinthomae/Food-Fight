// Splat Shot: a bubble shooter. Food hangs from the ceiling on a hex grid; aim, throw, bank off the walls.
// 3+ of one food touching pops, and anything left hanging falls with them. Pops and drops send junk rows
// that push the target's ceiling down. A bubble past the dashed line knocks you out.
// Board space is the same 6 x 12 units as the other boards, so the app can draw it at the same size.
(function(){
const E=typeof module!=='undefined'?require('./engine.js'):window.FFEngine;
const {COLS,ROWS,NT,INC_T,DIFFS,mulberry32}=E;
const rnd=n=>Math.floor(Math.random()*n);
const HC=7,D=COLS/HC,R=D/2,RH=D*Math.sqrt(3)/2,NR=14,DEAD_ROW=12;
const SX=COLS/2,SY=ROWS-.75,SPEED=.3;
const MIN_A=-Math.PI+.16,MAX_A=-.16;
// Splat Shot items: gold-badge foods in new rows. Pop or drop one to rack its item.
// attacks: steam (fog over their food), grease (no aim guide + wobbly aim), sauce (ceiling drops), freeze (can't throw),
// blender (foods reshuffled), swap (trade boards). Self: rainbow (next throw matches anything), bomb (next throw blasts an area).
const SHOT_ITEMS=['steam','grease','sauce','freeze','blender','swap','rainbow','bomb'],SHOT_W=[3,3,2,2,2,1,2.5,2.5],SHOT_SELF=['rainbow','bomb'];
const SHOT_WT=SHOT_W.reduce((a,b)=>a+b,0);
const RACK_N=3;

class ShotBoard{
  constructor(game,name,isBot,idx,id,seed){
    Object.assign(this,{game,name,isBot,idx,id:id||('b'+idx),rng:mulberry32(seed>>>0),
      rise:0,chain:1,maxChain:1,maxCombo:0,score:0,inc:[],dead:false,sent:0,blocked:0,kos:0,pops:[],parts:[],shake:0,
      lastAttacker:null,killedBy:null,place:0,hitFlash:0,diedAt:0,rack:[],rushT:0,creamT:0,frozenT:0,blendT:0,dmg:0,
      par:0,aimA:-Math.PI/2,ball:null,falling:[],popping:[],cool:30,think:60,plan:null,shots:0,ceilT:0,shot:true,preview:null,
      steamT:0,greaseT:0,armed:null,fireT:120,bank:0});
    this.h=[];for(let r=0;r<NR;r++)this.h.push(new Array(HC).fill(null));
    for(let r=0;r<5;r++)this.fillRow(r,false);
    this.cur=this.pick();this.next=this.pick();
    this.ceilT=this.ceilEvery();
    this.g=[];for(let r=0;r<ROWS;r++)this.g.push(new Array(COLS).fill(null));   // stand-in grid for code that expects one
  }
  sfx(n,a){if(this===this.game.player&&this.game.hooks.sfx)this.game.hooks.sfx(n,a)}
  pop(text,x,y,col,size){if(this===this.game.player)this.pops.push({text,x,y,col,size,life:60})}
  burst(x,y,kind,n){if(this!==this.game.player)return;for(let i=0;i<n;i++)this.parts.push({x,y,vx:(Math.random()-.5)*.14,vy:-Math.random()*.12-.02,kind,life:24+rnd(14)})}
  // ---------- hex geometry ----------
  odd(r){return (r+this.par)%2===1}
  width(r){return this.odd(r)?HC-1:HC}
  cx(r,c){return R+c*D+(this.odd(r)?R:0)}
  cy(r){return R+r*RH}
  inside(r,c){return r>=0&&r<NR&&c>=0&&c<this.width(r)}
  nb(r,c){
    const o=this.odd(r),out=[[r,c-1],[r,c+1]];
    for(const dr of [-1,1]){const rr=r+dr;if(o)out.push([rr,c],[rr,c+1]);else out.push([rr,c-1],[rr,c])}
    return out.filter(([a,b])=>this.inside(a,b));
  }
  fillRow(r,junky){
    const w=this.width(r),row=this.h[r];
    for(let c=0;c<HC;c++)row[c]=null;
    for(let c=0;c<w;c++){
      if(junky){row[c]=this.rng()<.25?{t:Math.floor(this.rng()*NT)}:{t:-1};continue}
      // clumps: often copy a neighbour so groups form naturally
      const left=c>0&&row[c-1],up=r>0&&this.h[r-1][c];
      const v=this.rng();
      row[c]={t:v<.35&&left?left.t:v<.6&&up&&up.t>=0?up.t:Math.floor(this.rng()*NT)};
    }
    // now and then a gold-badge food carries an item
    if(!junky&&this.rng()<.3){const c=Math.floor(this.rng()*w);let x=this.rng()*SHOT_WT,k=SHOT_ITEMS[0];for(let i=0;i<SHOT_ITEMS.length;i++){x-=SHOT_W[i];if(x<0){k=SHOT_ITEMS[i];break}}if(row[c])row[c].sp=k}
  }
  // push everything down one row and bring in a new top row
  insertRow(junky){
    this.h.pop();this.h.unshift(new Array(HC).fill(null));this.par^=1;
    this.fillRow(0,junky);
    // a row that changed width would leave a cell outside the grid: trim
    for(let r=0;r<NR;r++)for(let c=this.width(r);c<HC;c++)this.h[r][c]=null;
    this.shake=6;
  }
  ceilEvery(){return Math.round(60*Math.max(7,16-this.game.level()*.9))}
  colorsLeft(){const s=new Set();for(const row of this.h)for(const b of row)if(b&&b.t>=0)s.add(b.t);return [...s]}
  pick(){const cs=this.colorsLeft();return cs.length?cs[Math.floor(this.rng()*cs.length)]:Math.floor(this.rng()*NT)}
  height(){for(let r=NR-1;r>=0;r--)if(this.h[r].some(Boolean))return Math.round((r+1)/NR*ROWS);return 0}
  lowest(){for(let r=NR-1;r>=0;r--)if(this.h[r].some(Boolean))return r;return -1}
  // ---------- aiming and flight ----------
  setAim(a){this.aimA=Math.max(MIN_A,Math.min(MAX_A,a))}
  aimAt(x,y){this.setAim(Math.atan2(y-SY,x-SX))}
  canAct(){return !this.dead&&!this.ball&&this.cool<=0&&this.frozenT<=0}
  swap(){if(this.dead||this.ball)return;[this.cur,this.next]=[this.next,this.cur];this.sfx('swap')}
  shoot(){
    if(!this.canAct())return false;
    this.ball={x:SX,y:SY,vx:Math.cos(this.aimA)*SPEED,vy:Math.sin(this.aimA)*SPEED,t:this.cur,wild:this.armed==='rainbow',bomb:this.armed==='bomb'};
    this.armed=null;
    this.cur=this.next;this.next=this.pick();this.shots++;
    this.sfx('throw');return true;
  }
  // follow a throw to where it sticks; used for flight, the aim guide and the bot
  trace(a,fn){
    let x=SX,y=SY,vx=Math.cos(a)*.12,vy=Math.sin(a)*.12;
    for(let i=0;i<600;i++){
      x+=vx;y+=vy;
      if(x<R){x=2*R-x;vx=-vx;fn&&fn('bounce',x,y)}
      if(x>COLS-R){x=2*(COLS-R)-x;vx=-vx;fn&&fn('bounce',x,y)}
      const hit=this.collide(x,y);
      if(hit)return Object.assign({x,y},this.cellAt(x,y));
    }
    return null;
  }
  collide(x,y){
    if(y<=R)return true;
    const r0=Math.max(0,Math.floor((y-R)/RH)-1);
    for(let r=r0;r<=Math.min(NR-1,r0+3);r++)for(let c=0;c<this.width(r);c++){
      if(!this.h[r][c])continue;
      const dx=this.cx(r,c)-x,dy=this.cy(r)-y;
      if(dx*dx+dy*dy<(D*.82)*(D*.82))return true;
    }
    return false;
  }
  cellAt(x,y){
    let best=null,bd=1e9;
    const r0=Math.max(0,Math.round((y-R)/RH)-1);
    for(let r=r0;r<=Math.min(NR-1,r0+2);r++)for(let c=0;c<this.width(r);c++){
      if(this.h[r][c])continue;
      if(r>0&&!this.nb(r,c).some(([a,b])=>this.h[a][b]))continue;
      const dx=this.cx(r,c)-x,dy=this.cy(r)-y,d=dx*dx+dy*dy;
      if(d<bd){bd=d;best={r,c}}
    }
    return best;
  }
  // ---------- simulation ----------
  step(){
    if(this.hitFlash>0)this.hitFlash--;
    if(this.creamT>0)this.creamT--;if(this.frozenT>0)this.frozenT--;if(this.blendT>0)this.blendT--;if(this.shake>0)this.shake--;
    if(this.cool>0)this.cool--;
    if(this.steamT>0)this.steamT--;
    if(this.greaseT>0){this.greaseT--;this.setAim(this.aimA+Math.sin(this.game.frame*.21+this.idx)*.014)}
    this.inc.forEach(it=>{if(it.t>0)it.t--});
    if(this.ball){
      const b=this.ball;
      for(let k=0;k<3&&this.ball;k++){
        b.x+=b.vx/3;b.y+=b.vy/3;
        if(b.x<R){b.x=2*R-b.x;b.vx=-b.vx;this.sfx('tap')}
        if(b.x>COLS-R){b.x=2*(COLS-R)-b.x;b.vx=-b.vx;this.sfx('tap')}
        if(this.collide(b.x,b.y))this.land(b);
      }
    }
    this.popping=this.popping.filter(p=>--p.life>0);
    this.falling=this.falling.filter(f=>{f.vy+=.012;f.y+=f.vy;f.x+=f.vx;return f.y<ROWS+1});
    // the ceiling creeps down over time (hot sauce speeds it up)
    if(--this.ceilT<=0||(this.rushT>0&&this.rushT%60===0)){this.ceilT=this.ceilEvery();this.insertRow(false);this.sfx('junk');this.checkDead()}
    if(this.rushT>0)this.rushT--;
    if(this.isBot)this.ai();
    if(this.pops.length)this.pops=this.pops.filter(p=>--p.life>0);
    if(this.parts.length)this.parts=this.parts.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.012;return --p.life>0});
  }
  land(b){
    this.ball=null;this.cool=6;
    const s=this.cellAt(b.x,b.y);
    if(!s){this.checkDead();return}
    if(b.wild){
      // rainbow: becomes whichever touching food makes the biggest group
      let best=b.t,bn=0;
      for(const [r,c] of this.nb(s.r,s.c)){const u=this.h[r][c];if(!u||u.t<0)continue;const n=this.groupSize(r,c);if(n>bn){bn=n;best=u.t}}
      b.t=best;
    }
    this.h[s.r][s.c]={t:b.t};
    if(b.bomb)return this.explode(s);
    // same food touching -> pop
    const grp=[[s.r,s.c]],seen=new Set([s.r*HC+s.c]);
    for(let i=0;i<grp.length;i++)for(const [r,c] of this.nb(grp[i][0],grp[i][1])){const u=this.h[r][c];if(u&&u.t===b.t&&!seen.has(r*HC+c)){seen.add(r*HC+c);grp.push([r,c])}}
    let popped=0,dropped=0;
    if(grp.length>=3){
      const got=[];
      grp.forEach(([r,c])=>{const u=this.h[r][c];if(u.sp)got.push(u.sp);this.popping.push({x:this.cx(r,c),y:this.cy(r),t:u.t,life:14});this.burst(this.cx(r,c),this.cy(r),u.t,5);this.h[r][c]=null});
      popped=grp.length;
      dropped=this.dropFloating(got);
      got.forEach((k,i)=>this.earn({k},this.cx(s.r,s.c),this.cy(s.r)-.5-i*.6));
      const n=popped+dropped;
      this.maxCombo=Math.max(this.maxCombo,n);
      this.score+=popped*10+dropped*25+(dropped>=4?dropped*15:0);
      const cx=this.cx(s.r,s.c),cy=this.cy(s.r);
      if(dropped)this.pop(`Pop ${popped} + drop ${dropped}!`,cx,cy+.6,'#F7C548',dropped>=4?1.1:.9);else this.pop(popped>3?`Pop ${popped}!`:'Pop!',cx,cy+.6,'#EEF0FA',.85);
      this.sfx(dropped>=4?'chain':'match',dropped>=4?Math.min(6,2+Math.floor(dropped/4)):popped);
      const cells=Math.max(0,popped-3)+dropped+(dropped>=5?2:0);
      if(cells)this.sendJunk(cells);
      if(!this.h.some(row=>row.some(Boolean))){this.score+=500;this.pop('Clean plate! +500',3,4,'#F7C548',1.2);for(let r=0;r<4;r++)this.insertRow(false)}
    }else this.sfx('swap');
    // incoming junk rows land after your throw
    this.dropIncoming();
    this.checkDead();
  }
  groupSize(r0,c0){const t=this.h[r0][c0].t,seen=new Set([r0*HC+c0]),q=[[r0,c0]];for(let i=0;i<q.length;i++)for(const [r,c] of this.nb(q[i][0],q[i][1])){const u=this.h[r][c];if(u&&u.t===t&&!seen.has(r*HC+c)){seen.add(r*HC+c);q.push([r,c])}}return q.length}
  // anything not hanging from the ceiling falls; badges on falling food still pay out
  dropFloating(got){
    const keep=new Set(),q=[];let dropped=0;
    for(let c=0;c<this.width(0);c++)if(this.h[0][c]){keep.add(c);q.push([0,c])}
    while(q.length){const [r,c]=q.pop();for(const [a,bb] of this.nb(r,c)){const k=a*HC+bb;if(this.h[a][bb]&&!keep.has(k)){keep.add(k);q.push([a,bb])}}}
    for(let r=0;r<NR;r++)for(let c=0;c<this.width(r);c++){const u=this.h[r][c];if(u&&!keep.has(r*HC+c)){if(u.sp&&got)got.push(u.sp);this.falling.push({x:this.cx(r,c),y:this.cy(r),vx:(Math.random()-.5)*.04,vy:0,t:u.t});this.h[r][c]=null;dropped++}}
    return dropped;
  }
  // chili bomb: everything near the landing spot goes, junk included
  explode(s){
    const x0=this.cx(s.r,s.c),y0=this.cy(s.r),rad=D*1.75,got=[];let n=0;
    for(let r=0;r<NR;r++)for(let c=0;c<this.width(r);c++){const u=this.h[r][c];if(!u)continue;const dx=this.cx(r,c)-x0,dy=this.cy(r)-y0;
      if(dx*dx+dy*dy<=rad*rad){if(u.sp)got.push(u.sp);this.popping.push({x:this.cx(r,c),y:this.cy(r),t:u.t,life:16});this.burst(this.cx(r,c),this.cy(r),u.t<0?-1:u.t,6);this.h[r][c]=null;n++}}
    const dropped=this.dropFloating(got);
    this.score+=n*15+dropped*25;this.shake=12;
    this.pop(`KABOOM! ${n+dropped}`,x0,y0+.6,'#E5682A',1.2);this.sfx('slam');
    got.forEach((k,i)=>this.earn({k},x0,y0-.5-i*.6));
    const cells=Math.floor(n/2)+dropped;if(cells)this.sendJunk(cells);
    this.dropIncoming();this.checkDead();
  }
  checkDead(){if(this.dead)return;for(let r=DEAD_ROW;r<NR;r++)if(this.h[r].some(Boolean))return this.die()}
  sendJunk(cells){
    let a=cells,blocked=0;
    while(a>0&&this.inc.length){const it=this.inc[0],m=Math.min(a,it.cells);it.cells-=m;a-=m;blocked+=m;if(it.cells<=0)this.inc.shift()}
    if(blocked){this.blocked+=blocked;this.pop(`Blocked ${blocked}`,3,7.5,'#56B4E9',.9);this.sfx('block')}
    if(a<=0)return;
    const tgt=this.pickTarget();if(!tgt)return;
    if(this.isBot)a=Math.max(1,Math.round(a*[.4,.38,.5][this.game.d]));
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
  dropIncoming(){
    let cells=0;
    while(this.inc.length&&this.inc[0].t<=0){cells+=this.inc[0].cells;this.inc.shift()}
    if(!cells)return;
    // every 6 junk is one row of crust; leftovers carry over to the next hit
    this.bank=(this.bank||0)+cells;
    const rows=Math.min(5,Math.floor(this.bank/6));this.bank-=rows*6;
    if(!rows)return;
    for(let i=0;i<rows;i++)this.insertRow(true);
    this.shake=10;this.sfx('junk');
  }
  receive(cells,from){if(this.dead)return;this.inc.push({cells,t:INC_T,T:INC_T,from});this.lastAttacker=from;this.hitFlash=24;this.sfx('incoming')}
  rush(from){this.rushT=120;this.lastAttacker=from;this.hitFlash=24;this.pop('Hot sauce!',3,9,'#F7C548',1.1);this.sfx('sauce')}
  cream(from){this.steam(from)}
  steam(from){if(this.dead)return;this.steamT=360;this.lastAttacker=from;this.hitFlash=24;this.pop('Steamed up!',3,8,'#EEF0FA',1.05);this.sfx('cream')}
  grease(from){if(this.dead)return;this.greaseT=360;this.lastAttacker=from;this.hitFlash=24;this.pop('Greasy fingers!',3,8,'#F7C548',1.05);this.sfx('sauce')}
  freeze(from){this.frozenT=150;this.lastAttacker=from;this.hitFlash=24;this.pop('Brain freeze!',3,9,'#56B4E9',1.1);this.sfx('freeze')}
  blend(from){this.lastAttacker=from;this.hitFlash=24;for(const row of this.h)for(const b of row)if(b&&b.t>=0&&Math.random()<.4)b.t=Math.floor(Math.random()*NT);this.sfx('blender')}
  stealFrom(){return null}
  takeItem(){}
  earn(item,cx,cy){
    if(this.dead||!SHOT_ITEMS.includes(item.k))return;
    item.id=E.nextId();this.rack.push(item);
    this.pop({steam:'Steam cloud!',grease:'Greasy fingers!',sauce:'Hot sauce!',freeze:'Brain freeze!',blender:'Blender!',swap:'Switcheroo!',rainbow:'Rainbow sprinkles!',bomb:'Chili bomb!'}[item.k],cx==null?3:cx,cy==null?6:cy,'#F7C548',.85);
    this.sfx('earn',true);
    if(this.rack.length>RACK_N){const i=this.rack.findIndex(x=>!SHOT_SELF.includes(x.k));this.fire(i<0?0:i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
  }
  fire(i){
    if(this.dead||i<0||i>=this.rack.length)return false;
    const it=this.rack[i];
    if(SHOT_SELF.includes(it.k)){
      this.rack.splice(i,1);this.armed=it.k;
      this.pop(it.k==='bomb'?'Next throw: CHILI BOMB':'Next throw: RAINBOW',3,9,'#F7C548',.9);this.sfx('earn',true);
    }else{
      const tgt=this.pickTarget();if(!tgt)return false;
      this.rack.splice(i,1);
      this.game.launch(this,{k:it.k,cells:0,at:null},tgt,i);
    }
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
    return true;
  }
  // Switcheroo between two Splat Shot boards
  gridCode(){return {h:this.h.map(row=>row.map(b=>b?(b.t<0?'j':String(b.t))+(b.sp?':'+b.sp:''):'.').join(',')),par:this.par}}
  loadGrid(code){
    if(!code||!Array.isArray(code.h)||code.h.length!==NR)return false;
    this.par=code.par?1:0;
    this.h=code.h.map(line=>{const cells=String(line).split(',');const row=new Array(HC).fill(null);
      for(let c=0;c<HC;c++){const v=cells[c];if(!v||v==='.')continue;const [t,sp]=v.split(':');row[c]={t:t==='j'?-1:Math.max(0,Math.min(NT-1,+t||0))};if(sp&&SHOT_ITEMS.includes(sp))row[c].sp=sp}
      return row});
    for(let r=0;r<NR;r++)for(let c=this.width(r);c<HC;c++)this.h[r][c]=null;
    this.ball=null;this.checkDead();return true;
  }
  swapped(other){this.hitFlash=24;this.shake=10;this.pop(`Switcheroo! You got ${other&&other.name?other.name:'their'}'s board`,3,7,'#56B4E9',.85);this.sfx('blender');this.checkDead()}
  die(){if(this.dead)return;this.dead=true;this.diedAt=this.game.frame;this.ball=null;this.game.onDeath(this)}
  snap(){
    let g='';for(let r=0;r<NR;r++)for(let c=0;c<HC;c++){const b=this.h[r][c];g+=!b?'.':b.t<0?'j':String(b.t)}
    return {id:this.id,v:'shot',g,pr:this.par,a:+this.aimA.toFixed(2),u:this.cur,n:this.next,k:this.rack.length,h:this.rushT>0?1:0,c:this.steamT>0?1:0,z:this.frozenT>0?1:0,o:this.kos,d:this.dead?1:0,x:Math.round(this.dmg||0),
      b:this.ball?[+this.ball.x.toFixed(2),+this.ball.y.toFixed(2),this.ball.t]:null};
  }
  // ---------- bot brain: sweep the aim, score each landing spot ----------
  judge(a,t){
    const L=this.trace(a);if(!L||!L.r&&L.r!==0)return null;
    const h=this.h,saved=h[L.r][L.c];h[L.r][L.c]={t};
    const grp=[[L.r,L.c]],seen=new Set([L.r*HC+L.c]);
    for(let i=0;i<grp.length;i++)for(const [r,c] of this.nb(grp[i][0],grp[i][1])){const u=h[r][c];if(u&&u.t===t&&!seen.has(r*HC+c)){seen.add(r*HC+c);grp.push([r,c])}}
    let v;
    if(grp.length>=3){
      // count what would fall
      const keep=new Set(seen),hang=new Set(),q=[];
      for(let c=0;c<this.width(0);c++)if(h[0][c]&&!keep.has(c)){hang.add(c);q.push([0,c])}
      while(q.length){const [r,c]=q.pop();for(const [aa,b] of this.nb(r,c)){const k=aa*HC+b;if(h[aa][b]&&!keep.has(k)&&!hang.has(k)){hang.add(k);q.push([aa,b])}}}
      let total=0;for(let r=0;r<NR;r++)for(let c=0;c<this.width(r);c++)if(h[r][c])total++;
      const drops=total-grp.length-hang.size;
      v=50+grp.length*10+drops*18;
    }else{
      v=(grp.length-1)*8-L.r*1.2;
      for(const [r,c] of this.nb(L.r,L.c)){const u=h[r][c];if(u&&u.t!==t)v-=2}
    }
    h[L.r][L.c]=saved;
    return v;
  }
  ai(){
    if(this.dead||this.ball||this.frozenT>0)return;
    const D2=DIFFS[this.game.d];
    if(this.rack.length&&--this.fireT<=0){
      this.fireT=D2.fire[0]+rnd(D2.fire[1]-D2.fire[0]);
      const self=this.rack.findIndex(x=>SHOT_SELF.includes(x.k)),swp=this.rack.findIndex(x=>x.k==='swap'),atk=this.rack.findIndex(x=>!SHOT_SELF.includes(x.k)&&x.k!=='swap');
      if(self>=0&&!this.armed)this.fire(self);
      else if(swp>=0&&this.lowest()>=DEAD_ROW-3)this.fire(swp);
      else if(atk>=0)this.fire(atk);
    }
    if(!this.plan){
      if(--this.think>0)return;
      let best=null,bs=-1e9;
      for(let a=MIN_A;a<=MAX_A;a+=.035){
        const v=this.judge(a,this.cur);if(v==null)continue;
        const s=v+Math.random()*(D2.noise||1)*8;
        if(s>bs){bs=s;best=a}
      }
      if(best==null||Math.random()<D2.miss*.35)best=MIN_A+Math.random()*(MAX_A-MIN_A);
      this.plan={a:best};
    }
    // swing the aim over, then throw
    const d=this.plan.a-this.aimA,st=.05+(this.game.d*.03);
    if(Math.abs(d)>st){this.aimA+=Math.sign(d)*st;return}
    this.aimA=this.plan.a;
    if(this.canAct()){this.shoot();this.plan=null;this.think=Math.round((D2.think[0]+rnd(D2.think[1]-D2.think[0]+1))*2.1)}
  }
}
ShotBoard.GEO={HC,D,R,RH,NR,DEAD_ROW,SX,SY,MIN_A,MAX_A};
ShotBoard.ITEMS=SHOT_ITEMS;
E.BOARD_TYPES.shot=ShotBoard;
if(typeof module!=='undefined')module.exports=ShotBoard;
})();
