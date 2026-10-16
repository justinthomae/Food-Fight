
// Food Fight engine — pure game logic, no DOM. Shared by the site, the artifact build and the node tests.
const COLS=6,ROWS=12,NT=5,CLR=40,POP=9,HOVER=9,INC_T=220,GRACE=150,FLY=34;
const DIFFS=[
  {name:'Easy',  think:[44,66], miss:.3,  raiseH:5},
  {name:'Normal',think:[24,38], miss:.12, raiseH:6},
  {name:'Hard',  think:[12,20], miss:.03, raiseH:7},
];
const MARGIN=50,RACK=3,RUSH=180,CYCLE=180,CREAM=300,FREEZE=150,SPECIAL_RATE=.16;
// rack items: pie/tower = junk, sauce = fast rise, cream = board covered, freeze = no swaps, blender = scramble top rows, pin = flatten own top rows
const JUNK_KINDS=['pie','tower'],ATTACK_KINDS=['pie','tower','sauce','cream','freeze','blender'],SPECIALS=['cream','freeze','blender','pin'],SPECIAL_W=[3,2,3,2];
function pickSpecial(rng){let x=rng()*10;for(let i=0;i<SPECIALS.length;i++){x-=SPECIAL_W[i];if(x<0)return SPECIALS[i]}return SPECIALS[0]}
function specialRow(rng){if(rng()>=SPECIAL_RATE)return null;const col=Math.floor(rng()*COLS),row=new Array(COLS).fill(null);row[col]=pickSpecial(rng);return row}
// the cast: eight fighters, one per seat in a full room; bots use whoever you didn't pick
const FIGHTERS=['bun','sprinkles','crunch','slice','fudge','splat','guac','glaze'];
const BOTS=[{name:'Patty',av:'bun'},{name:'Sprinkles',av:'sprinkles'},{name:'Crunch',av:'crunch'},{name:'Slice',av:'slice'},
            {name:'Fudge',av:'fudge'},{name:'Splat',av:'splat'},{name:'Guac',av:'guac'},{name:'Glaze',av:'glaze'}];
const BOTNAMES=BOTS.map(b=>b.name);
const MAX_PLAYERS=8;
// bots for a match: characters other than yours first, so a duel is always a real match-up
function pickBots(n,playerAv,taken){
  const used=new Set(taken||[]);
  const order=BOTS.filter(b=>b.av!==playerAv&&!used.has(b.name)).concat(BOTS.filter(b=>b.av===playerAv&&!used.has(b.name)));
  return order.slice(0,n);
}
const rnd=n=>Math.floor(Math.random()*n);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let uid=0,gidc=0;
function T(t){return {t,id:++uid,st:'idle',tm:0,clr:0,conv:false,chain:false,yo:0,xo:0,gid:0}}
function genRow(a1,a2,rng){
  const rnd=n=>Math.floor(rng()*n),row=[];
  for(let c=0;c<COLS;c++){
    let t,tries=0;
    do{t=rnd(NT);tries++}while(tries<30&&(
      (c>=2&&row[c-1]===t&&row[c-2]===t)||
      (a1&&a2&&a1[c]&&a2[c]&&a1[c].t===t&&a2[c].t===t)||
      (c>=1&&row[c-1]===t&&tries<6)));
    row.push(t);
  }
  return row;
}
function newGrid(rng){
  const rnd=n=>Math.floor(rng()*n);
  const g=[];for(let r=0;r<ROWS;r++)g.push(new Array(COLS).fill(null));
  const h=[5,6,4,6,5,6];for(let i=h.length-1;i>0;i--){const j=rnd(i+1);[h[i],h[j]]=[h[j],h[i]]}
  for(let r=ROWS-1;r>=0;r--)for(let c=0;c<COLS;c++){
    if(ROWS-r>h[c])continue;
    let t,tries=0;
    do{t=rnd(NT);tries++}while(tries<40&&(
      (c>=2&&g[r][c-1]&&g[r][c-2]&&g[r][c-1].t===t&&g[r][c-2].t===t)||
      (r<=ROWS-3&&g[r+1][c]&&g[r+2][c]&&g[r+1][c].t===t&&g[r+2][c].t===t)));
    g[r][c]=T(t);
  }
  return g;
}

class Board{
  constructor(game,name,isBot,idx,id,seed){
    const rng=mulberry32(seed>>>0);
    Object.assign(this,{game,name,isBot,idx,id:id||('b'+idx),rng,g:newGrid(rng),rise:0,chain:1,maxChain:1,maxCombo:0,score:0,inc:[],stop:0,
      grace:GRACE,raising:false,raiseT:0,dead:false,sent:0,blocked:0,kos:0,pops:[],parts:[],side:false,shake:0,
      lastAttacker:null,killedBy:null,place:0,think:50+rnd(40),hitFlash:0,diedAt:0,rack:[],tower:0,rushT:0,fireT:60,creamT:0,frozenT:0,blendT:0,streak:0,streakType:null,maxStreak:1});
    this.preview=genRow(this.g[ROWS-1],this.g[ROWS-2],this.rng);
    this.previewSp=specialRow(this.rng);
  }
  sfx(name,arg){if(this===this.game.player&&this.game.hooks.sfx)this.game.hooks.sfx(name,arg)}
  each(fn){for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t)fn(t,r,c)}}
  height(){for(let r=0;r<ROWS;r++)if(this.g[r].some(Boolean))return ROWS-r;return 0}
  trySwap(r,c,d){
    if(this.frozenT>0)return false;
    const g=this.g,c2=c+d;
    if(c2<0||c2>=COLS||r<0||r>=ROWS)return false;
    const a=g[r][c],b=g[r][c2];
    if(!a&&!b)return false;
    const ok=t=>!t||(t.clr===0&&t.t>=0&&(t.st==='idle'||t.st==='hover'));
    if(!ok(a)||!ok(b))return false;
    if(!b&&r>0&&g[r-1][c2]&&g[r-1][c2].st!=='idle')return false;
    if(!a&&r>0&&g[r-1][c]&&g[r-1][c].st!=='idle')return false;
    g[r][c]=b;g[r][c2]=a;
    if(a){a.xo=-d;a.chain=false}
    if(b){b.xo=d;b.chain=false}
    this.sfx('swap');
    return true;
  }
  trySwapV(r,c,d){
    if(this.frozenT>0)return false;
    const g=this.g,r2=r+d;
    if(r2<0||r2>=ROWS||c<0||c>=COLS||r<0||r>=ROWS)return false;
    const a=g[r][c],b=g[r2][c];
    const ok=t=>t&&t.clr===0&&t.t>=0&&t.st==='idle';
    if(!ok(a)||!ok(b))return false;
    g[r][c]=b;g[r2][c]=a;
    a.yo=-d;b.yo=d;a.chain=b.chain=false;
    this.sfx('swap');
    return true;
  }
  shiftUp(){
    const g=this.g;
    for(let r=0;r<ROWS-1;r++)g[r]=g[r+1];
    g[ROWS-1]=this.preview.map((t,c)=>{const x=T(t);if(this.previewSp&&this.previewSp[c])x.sp=this.previewSp[c];return x});
    this.preview=genRow(g[ROWS-1],g[ROWS-2],this.rng);
    this.previewSp=specialRow(this.rng);
    this.score+=1;
    if(this===this.game.player&&this.game.hooks.shift)this.game.hooks.shift();
  }
  step(){
    const g=this.g,game=this.game;
    if(this.hitFlash>0)this.hitFlash--;
    if(this.creamT>0)this.creamT--;
    if(this.frozenT>0)this.frozenT--;
    if(this.blendT>0)this.blendT--;
    this.each(t=>{if(t.splat>0)t.splat--});
    this.each(t=>{
      if(t.xo){const s=Math.sign(t.xo);t.xo-=s*.3;if(Math.sign(t.xo)!==s)t.xo=0}
      if(t.yo<0){t.yo+=Math.max(.3,-t.yo*.1);if(t.yo>0)t.yo=0}
      else if(t.yo>0){t.yo-=.3;if(t.yo<0)t.yo=0}
    });
    // 1. clear timers
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const t=g[r][c];if(!t||t.clr<=0)continue;
      t.clr--;
      if(t.clr===0){
        if(t.conv){t.conv=false;t.t=Math.floor(this.rng()*NT);t.gid=0;t.chain=true;t.st='idle';this.burst(r,c,-1,5)}
        else{
          g[r][c]=null;this.burst(r,c,t.t,7);
          for(let k=r-1;k>=0;k--){const u=g[k][c];if(!u||u.clr>0)break;u.chain=true}
        }
      }
    }
    // 2. gravity
    for(let r=ROWS-1;r>=0;r--)for(let c=0;c<COLS;c++){
      const t=g[r][c];if(!t||t.clr>0)continue;
      if(t.st==='hover'){t.tm--;if(t.tm<=0)t.st='fall'}
      if(r===ROWS-1){if(t.st!=='idle')t.st='idle';continue}
      const b=g[r+1][c];
      if(b===null){
        if(t.st==='idle'){t.st='hover';t.tm=HOVER}
        if(t.st==='fall'&&t.yo>-.05){g[r+1][c]=t;g[r][c]=null;t.yo-=1}
      }else if(b.clr===0&&(b.st==='hover'||b.st==='fall')){
        if(t.st==='idle'){t.st=b.st;t.tm=b.tm}
      }else if(t.st!=='idle'){
        if(t.st==='fall'&&t.t<0)this.shake=6;
        t.st='idle';
      }
    }
    // 3. matches
    const el=t=>t&&t.clr===0&&t.st==='idle'&&t.t>=0&&Math.abs(t.xo)<.35&&t.yo>-.3&&t.yo<.35;
    const hit=new Set(),pos=new Map();
    for(let r=0;r<ROWS;r++){let c=0;while(c<COLS){const t=g[r][c];if(!el(t)){c++;continue}let e=c+1;while(e<COLS&&el(g[r][e])&&g[r][e].t===t.t)e++;if(e-c>=3)for(let k=c;k<e;k++){hit.add(g[r][k]);pos.set(g[r][k],[r,k])}c=e}}
    for(let c=0;c<COLS;c++){let r=0;while(r<ROWS){const t=g[r][c];if(!el(t)){r++;continue}let e=r+1;while(e<ROWS&&el(g[e][c])&&g[e][c].t===t.t)e++;if(e-r>=3)for(let k=r;k<e;k++){hit.add(g[k][c]);pos.set(g[k][c],[k,c])}r=e}}
    if(hit.size){
      let arr=[...hit].sort((a,b)=>{const p=pos.get(a),q=pos.get(b);return p[0]-q[0]||p[1]-q[1]});
      // ---- food streak: the same food cleared in back-to-back matches ----
      const counts={};arr.forEach(t=>counts[t.t]=(counts[t.t]||0)+1);
      const ft=this.streakType!=null&&counts[this.streakType]?this.streakType:+Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
      if(ft===this.streakType)this.streak++;else{this.streakType=ft;this.streak=1}
      this.maxStreak=Math.max(this.maxStreak||1,this.streak);
      const streak=this.streak;
      if(streak>=4){ // Feast: every other tile of that food on the board joins this clear
        for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const u=g[r][c];if(u&&u.t===ft&&u.clr===0&&u.st==='idle'&&!hit.has(u)){hit.add(u);pos.set(u,[r,c]);arr.push(u)}}
        this.streak=0;this.streakType=null;
      }
      const n=arr.length,isChain=arr.some(t=>t.chain);
      if(isChain){this.chain++;this.maxChain=Math.max(this.maxChain,this.chain)}
      this.maxCombo=Math.max(this.maxCombo,n);
      arr.forEach((t,i)=>{t.clr=CLR+i*4;t.chain=false});
      const specials=arr.filter(t=>t.sp).map(t=>{const k=t.sp;t.sp=null;return k});
      const gids=new Set();let broke=0;
      arr.forEach(t=>{const [r,c]=pos.get(t);[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const u=g[r+dr]&&g[r+dr][c+dc];if(u&&u.t<0&&u.clr===0)gids.add(u.gid)})});
      if(gids.size){let i=0;for(let r=ROWS-1;r>=0;r--)for(let c=0;c<COLS;c++){const u=g[r][c];if(u&&u.t<0&&gids.has(u.gid)&&u.clr===0){u.clr=CLR+n*4+12+i*3;u.conv=true;i++}}broke=i;this.sfx('break')}
      if(isChain)this.tower+=6;
      const gained=n*10*this.chain+(n>=4?(n-3)*30:0)+(isChain?this.chain*50:0);
      this.score+=gained;
      this.stop=Math.max(this.stop,40+n*6+(isChain?this.chain*25:0));
      let cx=0,cy=0;arr.forEach(t=>{const [r,c]=pos.get(t);cx+=c+.5;cy+=r+.5});cx/=n;cy/=n;
      if(isChain)this.pop(`${this.chain} chain!`,cx,cy,'#F7C548',1.2);
      else if(n>=4)this.pop(`${n} combo`,cx,cy,'#EEF0FA',1);
      if(isChain)this.sfx('chain',this.chain);else this.sfx('match',n);
      if(streak===2){this.score+=gained;this.pop('Double helping! ×2 points',cx,cy-1,'#F7C548',.8);this.sfx('helping')}
      else if(streak===3){this.pop('Snack attack!',cx,cy-1,'#F7C548',.95);this.snack();this.sfx('snack')}
      else if(streak>=4){this.pop('FEAST!',cx,cy-1.2,'#F7C548',1.4);this.feasts=(this.feasts||0)+1;this.sfx('feast')}
      if(isChain)this.towerAt={c:cx,r:cy};
      if(n>=4)this.earn({k:'pie',cells:Math.min(12,n-1)},cx,cy);
      if(broke)this.earn({k:'sauce'},cx,cy-1);
      specials.forEach((k,i)=>this.earn({k},cx,cy-1.4-i*.8));
    }
    // 4. stale chain flags, chain end
    let busy=false,moving=false;
    this.each(t=>{if(t.chain&&t.st==='idle'&&t.clr===0&&!hit.has(t))t.chain=false;if(t.clr>0)busy=true;if(t.st!=='idle')moving=true});
    if(this.chain>1&&!busy&&!moving){this.chain=1;if(this.tower){const a=this.towerAt||{c:3,r:6};this.earn({k:'tower',cells:this.tower,at:a},a.c,a.r);this.tower=0}}
    // 5. rise
    if(this.isBot)this.ai();
    if(!busy&&this.stop>0)this.stop--;
    if(this.rushT>0)this.rushT--;
    const top=g[0].some(Boolean);
    if(!busy&&(this.stop<=0||this.rushT>0)){
      if(top){if(!moving){this.grace--;if(this.grace<=0)return this.die()}}
      else{
        this.grace=GRACE;
        this.rise+=this.raising?.1:this.rushT>0?.012:(.10+game.level()*.045)/60;
        if(this.rise>=1){this.rise-=1;this.shiftUp()}
      }
    }else if(!top)this.grace=GRACE;
    // 6. incoming
    this.inc.forEach(it=>{if(it.t>0)it.t--});
    if(this.inc.length&&this.inc[0].t<=0&&this.chain===1&&!busy){const it=this.inc.shift();this.dropJunk(it.cells,it.at)}
    // fx
    if(this.pops.length)this.pops=this.pops.filter(p=>--p.life>0);
    if(this.parts.length)this.parts=this.parts.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.012;return --p.life>0});
    if(this.shake>0)this.shake--;
  }
  earn(item,cx,cy){
    if(this.dead)return;
    if(JUNK_KINDS.includes(item.k)){
      let a=item.cells,blocked=0;
      while(a>0&&this.inc.length){const it=this.inc[0];const m=Math.min(a,it.cells);it.cells-=m;a-=m;blocked+=m;if(it.cells<=0)this.inc.shift()}
      if(blocked){this.blocked+=blocked;this.pop(`Blocked ${blocked}`,cx,cy+.9,'#56B4E9',.9);this.sfx('block')}
      if(a<=0)return;
      item.cells=a;
    }
    if(JUNK_KINDS.includes(item.k)&&!item.at)item.at={c:cx,r:cy};
    item.id=++uid;this.rack.push(item);
    const label={pie:`Pie +${item.cells}`,tower:`Pie tower +${item.cells}`,sauce:'Hot sauce earned',cream:'Whipped cream!',freeze:'Brain freeze!',blender:'Blender!',pin:'Rolling pin!'}[item.k];
    const special=!JUNK_KINDS.includes(item.k);
    this.pop(label,cx,cy,special?'#F7C548':'#EEF0FA',.85);
    this.sfx('earn',special);
    if(this.rack.length>RACK){const i=this.rack.findIndex(x=>x.k!=='pin');this.fire(i<0?0:i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
  }
  fire(i){
    if(this.dead||i<0||i>=this.rack.length)return false;
    if(this.rack[i].k==='pin'){
      this.rack.splice(i,1);this.flatten();
      if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
      return true;
    }
    const tgt=this.pickTarget();if(!tgt)return false;
    const item=this.rack.splice(i,1)[0];
    this.game.launch(this,item,tgt,i);
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
    return true;
  }
  pickTarget(){
    const g=this.game,others=g.alive().filter(b=>b!==this);
    if(!others.length)return null;
    if(this===g.player)return g.aim();
    const la=this.lastAttacker;
    if(la&&!la.dead&&la!==this&&Math.random()<.5)return la;
    return others[rnd(others.length)];
  }
  rush(from){
    if(this.dead)return;
    this.rushT=RUSH;this.lastAttacker=from;this.hitFlash=24;
    this.pop('Hot sauce!',3,10.5,'#F7C548',1.1);this.sfx('sauce');
  }
  receive(cells,from,at){
    if(this.dead)return;
    this.inc.push({cells,t:INC_T,T:INC_T,from,at:at||null});
    this.lastAttacker=from;this.hitFlash=24;
    this.sfx('incoming');
  }
  // junk lands where the thrower made it: same columns, wedged into the stack at the same row
  // (tiles above get pushed up); if that spot is above the stack it just drops onto those columns
  dropJunk(cells,at){
    const g=this.g,widths=[];
    for(let i=0;i<Math.floor(cells/6);i++)widths.push(6);
    if(cells%6)widths.push(cells%6);
    const r0=at?Math.max(0,Math.min(ROWS-1,Math.floor(at.r))):-1;
    for(const w of widths){
      const gid=++gidc;let cols=[];
      if(w===6)cols=[0,1,2,3,4,5];
      else if(at){const st=Math.max(0,Math.min(COLS-w,Math.round(at.c-w/2)));for(let i=0;i<w;i++)cols.push(st+i)}
      else{for(let i=0;i<w;i++)cols.push(this.side?COLS-1-i:i);this.side=!this.side}
      for(const c of cols){
        let top=0;while(top<ROWS&&!g[top][c])top++;
        const t=T(-1);t.gid=gid;
        if(at&&r0>=top){
          if(g[0][c])return this.die();
          for(let r=0;r<r0;r++){g[r][c]=g[r+1][c];if(g[r][c])g[r][c].yo+=1}
          t.splat=24;g[r0][c]=t;
        }else{
          const r=top-1;
          if(r<0)return this.die();
          t.yo=-(r+2);g[r][c]=t;
        }
      }
    }
    if(this===this.game.player)this.shake=8;
    this.sfx('junk');
  }
  // Snack attack: grab the oldest item from the cook you're aiming at, and turn 2 of your junk back into food
  snack(){
    let cleaned=0;
    for(let r=ROWS-1;r>=0&&cleaned<2;r--)for(let c=0;c<COLS&&cleaned<2;c++){const u=this.g[r][c];if(u&&u.t<0&&u.clr===0){u.clr=CLR+cleaned*6;u.conv=true;cleaned++}}
    const v=this.pickTarget();
    if(!v||v.dead||!v.rack.length)return;
    if(v.remote){if(this.game.hooks.send)this.game.hooks.send({t:'steal',from:this.id,to:v.id})}
    else{const it=v.stealFrom(this);if(it)this.takeItem(it,v)}
  }
  stealFrom(thief){
    if(this.dead||!this.rack.length)return null;
    const it=this.rack.shift();
    this.pop(`${thief?thief.name:'Someone'} stole your ${it.k==='pie'?'pie':it.k==='tower'?'tower':it.k==='sauce'?'hot sauce':it.k==='pin'?'rolling pin':it.k}!`,3,8,'#CC79A7',.75);
    this.sfx('stolen');
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
    return {k:it.k,cells:it.cells,at:it.at};
  }
  takeItem(it,from){
    if(this.dead||!it)return;
    const item={k:it.k,cells:it.cells|0,at:it.at||null,id:++uid};
    this.rack.push(item);this.stolen=(this.stolen||0)+1;
    this.pop(`Yoink! ${from?'From '+from.name:''}`,3,6,'#F7C548',.85);
    if(this.rack.length>RACK){const i=this.rack.findIndex(x=>x.k!=='pin');this.fire(i<0?0:i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
  }
  cream(from){if(this.dead)return;this.creamT=CREAM;this.creamSeed=Math.random();this.lastAttacker=from;this.hitFlash=24;this.pop('Whipped cream!',3,9,'#EEF0FA',1.1);this.sfx('cream')}
  freeze(from){if(this.dead)return;this.frozenT=FREEZE;this.lastAttacker=from;this.hitFlash=24;this.raising=false;this.pop('Brain freeze!',3,9,'#56B4E9',1.1);this.sfx('freeze')}
  blend(from){
    if(this.dead)return;
    this.lastAttacker=from;this.hitFlash=24;this.blendT=30;
    let top=0;while(top<ROWS&&!this.g[top].some(Boolean))top++;
    const cells=[];
    for(let r=top;r<Math.min(ROWS,top+3);r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.t>=0&&t.clr===0&&t.st==='idle')cells.push(t)}
    const types=cells.map(t=>t.t);
    for(let i=types.length-1;i>0;i--){const j=Math.floor(this.rng()*(i+1));[types[i],types[j]]=[types[j],types[i]]}
    cells.forEach((t,i)=>{t.t=types[i];t.chain=false;t.xo=(this.rng()-.5)*.6});
    this.pop('Blended!',3,9,'#CC79A7',1.1);this.sfx('blender');
  }
  flatten(){
    let top=0;while(top<ROWS&&!this.g[top].some(Boolean))top++;
    let n=0;
    for(let r=top;r<Math.min(ROWS,top+3);r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.clr===0){t.clr=CLR+n*2;t.conv=false;t.sp=null;t.chain=false;n++}}
    this.pop('Flattened!',3,top+1.5,'#F7C548',1.1);this.sfx('pin');
  }
  snap(){
    let g='';
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];g+=!t?'.':t.t<0?(t.clr>0?'J':'j'):t.clr>0?'abcde'[t.t]:String(t.t)}
    return {id:this.id,g,p:this.preview.join(''),r:Math.round(this.rise*100),k:this.rack.length,h:this.rushT>0?1:0,c:this.creamT>0?1:0,z:this.frozenT>0?1:0,o:this.kos,d:this.dead?1:0};
  }
  die(){if(this.dead)return;this.dead=true;this.raising=false;this.diedAt=this.game.frame;this.game.onDeath(this)}
  pop(text,x,y,col,size){if(this===this.game.player)this.pops.push({text,x,y,col,size,life:60})}
  burst(r,c,kind,n){if(this!==this.game.player)return;for(let i=0;i<n;i++)this.parts.push({x:c+.5,y:r+.5,vx:(Math.random()-.5)*.14,vy:-Math.random()*.12-.02,kind,life:24+rnd(14)})}
  // ---- bot brain ----
  ai(){
    if(this.raiseT>0){this.raiseT--;this.raising=this.raiseT>0}
    if(this.rack.length&&--this.fireT<=0){
      this.fireT=30+rnd(90);
      const pin=this.rack.findIndex(x=>x.k==='pin'),atk=this.rack.findIndex(x=>x.k!=='pin');
      if(pin>=0&&this.height()>=8)this.fire(pin);else if(atk>=0)this.fire(atk);
    }
    if(this.frozenT>0)return;
    if(--this.think>0)return;
    if(this.creamT>0&&Math.random()<.5){this.think=20;return}
    const D=DIFFS[this.game.d];
    this.think=D.think[0]+rnd(D.think[1]-D.think[0]+1);
    if(Math.random()<D.miss)return;
    const mv=this.bestMove();
    if(mv){mv.v?this.trySwapV(mv.r,mv.c,1):this.trySwap(mv.r,mv.c,1)}
    else if(this.height()<D.raiseH){this.raiseT=18;this.raising=true}
    if(this.height()<4){this.raiseT=14;this.raising=true}
  }
  runScore(r,c){
    const g=this.g,t=g[r][c];
    if(!t||t.t<0||t.clr>0)return 0;
    if(r<ROWS-1&&!g[r+1][c])return 0;
    const same=(rr,cc)=>{const u=g[rr]&&g[rr][cc];return u&&u.t===t.t&&u.clr===0&&u.st==='idle'};
    let h=1,v=1;
    for(let k=c-1;k>=0&&same(r,k);k--)h++;
    for(let k=c+1;k<COLS&&same(r,k);k++)h++;
    for(let k=r-1;k>=0&&same(k,c);k--)v++;
    for(let k=r+1;k<ROWS&&same(k,c);k++)v++;
    let s=(h>=3?h:0)+(v>=3?v:0);
    if(s){for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const u=g[r+dr]&&g[r+dr][c+dc];if(u&&u.t<0){s+=2;break}}}
    return s;
  }
  bestMove(){
    const g=this.g;let best=null,bs=.25;
    const okH=t=>!t||(t.clr===0&&t.t>=0&&t.st==='idle');
    const okV=t=>t&&t.clr===0&&t.t>=0&&t.st==='idle';
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(c<COLS-1){
        const a=g[r][c],b=g[r][c+1];
        if((a||b)&&okH(a)&&okH(b)&&!(a&&b&&a.t===b.t)&&!(r>0&&((!a&&g[r-1][c])||(!b&&g[r-1][c+1])))){
          g[r][c]=b;g[r][c+1]=a;
          let s=this.runScore(r,c)+this.runScore(r,c+1);
          g[r][c]=a;g[r][c+1]=b;
          if(!s&&(!a||!b)){const cc=a?c+1:c;if(r<ROWS-1&&!g[r+1][cc])s=.3+r*.02}
          s+=Math.random()*.2;
          if(s>bs){bs=s;best={r,c,v:false}}
        }
      }
      if(r<ROWS-1){
        const a=g[r][c],b=g[r+1][c];
        if(okV(a)&&okV(b)&&a.t!==b.t){
          g[r][c]=b;g[r+1][c]=a;
          let s=this.runScore(r,c)+this.runScore(r+1,c);
          g[r][c]=a;g[r+1][c]=b;
          s+=Math.random()*.2;
          if(s>bs){bs=s;best={r,c,v:true}}
        }
      }
    }
    return best;
  }
}

class RemoteBoard{
  constructor(game,id,name,idx,owner){
    Object.assign(this,{game,id,name,idx,owner:owner||id,remote:true,isBot:false,dead:false,place:0,kos:0,killedBy:null,
      lastAttacker:null,rise:0,rack:{length:0},rushT:0,hitFlash:0,sent:0,g:[],preview:[0,1,2,3,4,0],lastSnap:0});
    for(let r=0;r<ROWS;r++)this.g.push(new Array(COLS).fill(null));
  }
  height(){for(let r=0;r<ROWS;r++)if(this.g[r].some(Boolean))return ROWS-r;return 0}
  apply(s){
    if(!s||typeof s.g!=='string'||s.g.length!==ROWS*COLS)return;
    for(let i=0;i<ROWS*COLS;i++){
      const ch=s.g[i],r=Math.floor(i/COLS),c=i%COLS;
      let t=null;
      if(ch>='0'&&ch<='4')t={t:+ch,clr:0,xo:0,yo:0};
      else if(ch>='a'&&ch<='e')t={t:ch.charCodeAt(0)-97,clr:CLR,xo:0,yo:0};
      else if(ch==='j')t={t:-1,clr:0,xo:0,yo:0};
      else if(ch==='J')t={t:-1,clr:CLR,conv:true,xo:0,yo:0};
      this.g[r][c]=t;
    }
    if(typeof s.p==='string'&&s.p.length===COLS)this.preview=s.p.split('').map(Number);
    this.rise=Math.max(0,Math.min(1,(s.r||0)/100));
    this.rack={length:s.k|0};this.rushT=s.h?1:0;this.creamT=s.c?1:0;this.frozenT=s.z?1:0;this.kos=s.o|0;
    this.lastSnap=this.game.frame;
  }
  step(){if(this.hitFlash>0)this.hitFlash--}
}

class Game{
  // opts.roster (online): [{id,name,bot?:true,owner}] in seat order; opts.myId; opts.seed
  constructor(mode,d,hooks,allBots,opts){
    opts=opts||{};
    const seed=opts.seed!=null?opts.seed:Math.floor(Math.random()*2**31);
    Object.assign(this,{mode,d,hooks:hooks||{},frame:0,over:false,paused:false,flights:[],boards:[],result:null,
      online:!!opts.roster,myId:opts.myId||'me',seed});
    if(opts.roster){
      opts.roster.forEach((m,i)=>{
        let b;
        if(m.id===opts.myId){b=new Board(this,m.name,!!allBots,i,m.id,seed);this.player=b}
        else if(m.bot&&m.owner===opts.myId)b=new Board(this,m.name,true,i,m.id,seed);
        else b=new RemoteBoard(this,m.id,m.name,i,m.owner);
        b.av=FIGHTERS.includes(m.av)?m.av:FIGHTERS[i%FIGHTERS.length];
        this.boards.push(b);
      });
    }else{
      this.player=new Board(this,opts.name||'You',!!allBots,0,'me',seed);
      this.player.av=FIGHTERS.includes(opts.av)?opts.av:'bun';
      this.boards.push(this.player);
      const n=mode==='brawl'?Math.max(2,Math.min(MAX_PLAYERS,opts.size||4))-1:1;
      pickBots(n,this.player.av).forEach((bt,i)=>{const b=new Board(this,bt.name,true,i+1,'bot'+i,seed);b.av=bt.av;this.boards.push(b)});
    }
  }
  byId(id){return this.boards.find(b=>b.id===id)}
  local(){return this.boards.filter(b=>!b.remote)}
  // ---- network inbound ----
  netSnaps(list){(list||[]).forEach(s=>{const b=this.byId(s&&s.id);if(b&&b.remote&&!b.dead){b.apply(s);if(s.d)this.netKO(b.id,null)}})}
  netAttack(m){
    const to=this.byId(m.to),from=this.byId(m.from);
    if(!to||to.remote||to.dead||!from||this.over)return;
    const k=ATTACK_KINDS.includes(m.k)?m.k:'pie';
    const cells=JUNK_KINDS.includes(k)?Math.max(0,Math.min(72,m.cells|0)):0;
    if(JUNK_KINDS.includes(k)&&!cells)return;
    from.sent+=cells;
    const at=Number.isFinite(m.ac)&&Number.isFinite(m.ar)?{c:Math.max(0,Math.min(COLS,m.ac)),r:Math.max(0,Math.min(ROWS,m.ar))}:null;
    this.flights.push({from,to,item:{k,cells,at},t:FLY});
    if(this.hooks.fly)this.hooks.fly(from,to,{k,cells});
  }
  netKO(id,by){
    const b=this.byId(id);if(!b||b.dead)return;
    b.dead=true;b.diedAt=this.frame;b.place=this.alive().length+1;
    const k=by?this.byId(by):null;
    if(k&&!k.dead){b.killedBy=k;if(!k.remote)k.kos++}
    if(this.hooks.ko)this.hooks.ko(b,k,true);
    this.checkEnd();
  }
  netSteal(m){
    const v=this.byId(m.to),th=this.byId(m.from);
    if(!v||v.remote||v.dead||!th||this.over)return;
    const it=v.stealFrom(th);
    if(it&&this.hooks.send)this.hooks.send({t:'give',to:th.id,from:v.id,k:it.k,cells:it.cells|0,ac:it.at?+(+it.at.c).toFixed(2):null,ar:it.at?+(+it.at.r).toFixed(2):null});
  }
  netGive(m){
    const to=this.byId(m.to),from=this.byId(m.from);
    if(!to||to.remote||to.dead||this.over)return;
    const kinds=['pie','tower','sauce','cream','freeze','blender','pin'];if(!kinds.includes(m.k))return;
    const at=Number.isFinite(m.ac)&&Number.isFinite(m.ar)?{c:Math.max(0,Math.min(COLS,m.ac)),r:Math.max(0,Math.min(ROWS,m.ar))}:null;
    to.takeItem({k:m.k,cells:JUNK_KINDS.includes(m.k)?Math.max(1,Math.min(72,m.cells|0)):0,at},from);
  }
  netLeave(ownerId){this.boards.filter(b=>b.remote&&b.owner===ownerId&&!b.dead).forEach(b=>this.netKO(b.id,null))}
  level(){return Math.min(10,1+Math.floor(this.frame/(60*20)))}
  margin(){const s=this.frame/60-MARGIN;return s>0?1+Math.floor(s/15)*.3:1}
  alive(){return this.boards.filter(b=>!b.dead)}
  deliver(to,item,from){
    if(item.k==='sauce')to.rush(from);
    else if(item.k==='cream')to.cream(from);
    else if(item.k==='freeze')to.freeze(from);
    else if(item.k==='blender')to.blend(from);
    else to.receive(item.cells,from,item.at);
  }
  aim(){const o=this.alive().filter(b=>b!==this.player);return o.length?o[Math.floor(this.frame/CYCLE)%o.length]:null}
  launch(src,item,tgt,slot){
    const it={k:item.k,cells:item.cells||0,at:item.at||null};
    if(JUNK_KINDS.includes(it.k)){it.cells=Math.round(it.cells*(1+.25*src.kos)*this.margin());src.sent+=it.cells}
    if(tgt.remote){if(this.hooks.send)this.hooks.send({t:'atk',from:src.id,to:tgt.id,k:it.k,cells:it.cells,ac:it.at?+it.at.c.toFixed(2):null,ar:it.at?+it.at.r.toFixed(2):null})}
    else this.flights.push({from:src,to:tgt,item:it,t:FLY});
    if(this.hooks.fly)this.hooks.fly(src,tgt,it,slot);
  }
  step(){
    if(this.over||this.paused)return;
    this.frame++;
    for(const b of this.boards)if(!b.dead)b.step();
    if(this.online&&this.hooks.send&&this.frame%(this.boards.length>4?20:12)===0){const l=this.local().filter(b=>!b.dead||b.diedAt===this.frame-1);if(l.length)this.hooks.send({t:'snaps',list:l.map(b=>b.snap())})}
    if(this.flights.length)this.flights=this.flights.filter(f=>{if(--f.t>0)return true;if(!f.to.dead)this.deliver(f.to,f.item,f.from);return false});
    this.checkEnd();
  }
  onDeath(b){
    b.place=this.alive().length+1;
    const k=b.lastAttacker;
    if(k&&!k.dead&&k!==b){if(!k.remote)k.kos++;b.killedBy=k}
    if(this.online&&this.hooks.send)this.hooks.send({t:'ko',id:b.id,by:k&&!k.dead?k.id:null});
    if(this.hooks.ko)this.hooks.ko(b,k);
  }
  checkEnd(){
    if(this.over)return;
    const p=this.player,alive=this.alive();
    if(this.online){
      // keep simulating after you're out: the host's bots and everyone's view must run to the end
      if(p.dead&&!this.playerOut){this.playerOut=true;if(this.hooks.out)this.hooks.out(p.place)}
      if(alive.length<=1){if(!p.dead)p.place=1;this.over=true;this.result={won:!p.dead,place:p.place,winner:alive[0]||null}}
    }
    else if(p.dead){this.over=true;this.result={won:false,place:p.place}}
    else if(alive.length===1){p.place=1;this.over=true;this.result={won:true,place:1}}
    if(this.over&&this.hooks.end)this.hooks.end(this.result);
  }
}

if(typeof module!=='undefined')module.exports={COLS,ROWS,NT,CLR,POP,HOVER,INC_T,GRACE,FLY,DIFFS,MARGIN,RACK,RUSH,CYCLE,CREAM,FREEZE,SPECIALS,BOTNAMES,BOTS,FIGHTERS,MAX_PLAYERS,pickBots,Board,RemoteBoard,Game,mulberry32};
