
// Food Fight engine — pure game logic, no DOM. Shared by the site, the artifact build and the node tests.
const COLS=6,ROWS=12,NT=5,CLR=40,POP=9,HOVER=9,INC_T=220,GRACE=150,FLY=34;
const DIFFS=[
  // think = frames between moves, miss = chance to skip a turn, fire = frames between throws, noise = how sloppy move choice is, hit = size of bot throws (v0.9.5: toned down again)
  {name:'Easy',  think:[120,175],miss:.55, raiseH:4, fire:[480,900], noise:5.5, hit:.4},   // v1.13.4: easier again
  {name:'Normal',think:[40,60],  miss:.28, raiseH:5, fire:[140,300], noise:2.2, hit:.7},
  {name:'Hard',  think:[21,32],  miss:.13, raiseH:6, fire:[75,190],  noise:1.4, hit:.66},
];
const ORDER_EASY={think:[90,130],miss:.48};
// game modes. Classic, Order Up! and Boss Brawl use the swap board; Snack Stack and Splat Shot bring their own boards (stack.js, shot.js)
const VARIANTS=['classic','order','stack','shot','boss','blocks'];
const BOARD_TYPES={};   // variant -> board class, filled in by stack.js / shot.js
const ORDER_GOAL=10;
const MARGIN=50,RACK=3,RUSH=180,CYCLE=180,CREAM=300,FREEZE=150,SPECIAL_RATE=.16;
// rack items: pie/tower = junk (drawn as trash bags), sauce = fast rise, cream = board covered, freeze = no swaps, blender = scramble top rows,
// pin = flatten own top rows, plate = clear every tile of one food on your own board, swap = trade whole boards with your target
const JUNK_KINDS=['pie','tower'],ATTACK_KINDS=['pie','tower','sauce','cream','freeze','blender','swap','steam','grease','lights','reverse','scramble','twist','quake','speed','dark','shotgun','blast','hide'],SPECIALS=['cream','freeze','blender','pin','plate','swap'],SPECIAL_W=[3,2,3,2,2,1.5];
const SELF_KINDS=['pin','plate'];
const SPECIAL_TOTAL=SPECIAL_W.reduce((a,b)=>a+b,0);
function pickSpecial(rng){let x=rng()*SPECIAL_TOTAL;for(let i=0;i<SPECIALS.length;i++){x-=SPECIAL_W[i];if(x<0)return SPECIALS[i]}return SPECIALS[0]}
function specialRow(rng){if(rng()>=SPECIAL_RATE)return null;const col=Math.floor(rng()*COLS),row=new Array(COLS).fill(null);row[col]=pickSpecial(rng);return row}
// the cast: eight fighters, one per seat in a full room; bots use whoever you didn't pick
const FIGHTERS=['bun','sprinkles','crunch','slice','fudge','splat','guac','glaze'];
const BOTS=[{name:'Patty',av:'bun'},{name:'Sprinkles',av:'sprinkles'},{name:'Crunch',av:'crunch'},{name:'Slice',av:'slice'},
            {name:'Fudge',av:'fudge'},{name:'Splat',av:'splat'},{name:'Guac',av:'guac'},{name:'Glaze',av:'glaze'}];
const BOTNAMES=BOTS.map(b=>b.name);
// Boss Brawl: any fighter can be the boss, super-sized
const BOSS_HP=1800;
const BOSSES={bun:{name:'Big Patty',attack:'Grease fire'},sprinkles:{name:'Mega Sprinkles',attack:'Sugar storm'},crunch:{name:'King Crunch',attack:'Shell shower'},
  slice:{name:'Mega Slice',attack:'Cheese avalanche'},fudge:{name:'Big Fudge',attack:'Chocolate flood'},splat:{name:'Big Splat',attack:'Ketchup tsunami'},
  guac:{name:'Grand Guac',attack:'Pit barrage'},glaze:{name:'Mega Glaze',attack:'Glaze blaze'}};
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
    this.dmg=0;
    if(game.variant==='order'){this.orders=0;this.tips=0;this.spills=0;this.tickets=[];this.ticketNo=40+idx*100;this.orng=mulberry32((seed^0x9e3779b9)+idx*7919);while(this.tickets.length<3)this.newTicket()}
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
      if(game.variant==='order')this.fillOrders(arr,cx,cy);
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
    this.riseD=0;
    if(!busy&&(this.stop<=0||this.rushT>0)){
      if(top){if(!moving){this.grace--;if(this.grace<=0)return this.die()}}
      else{
        this.grace=GRACE;
        this.riseD=this.raising?.1:this.rushT>0?.012:(.10+game.level()*.045)/60;this.rise+=this.riseD;
        if(this.rise>=1){this.rise-=1;this.shiftUp()}
      }
    }else if(!top)this.grace=GRACE;
    // 6. incoming
    this.inc.forEach(it=>{if(it.t>0)it.t--});
    if(this.inc.length&&this.inc[0].t<=0&&this.chain===1&&!busy){const it=this.inc.shift();this.dropJunk(it.cells,it.at)}
    if(this.tickets)this.tickTickets();
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
    const label={pie:`Trash +${item.cells}`,tower:`Trash heap +${item.cells}`,sauce:'Hot sauce earned',cream:'Whipped cream!',freeze:'Brain freeze!',blender:'Blender!',pin:'Rolling pin!',plate:'Clean plate!',swap:'Switcheroo!'}[item.k];
    const special=!JUNK_KINDS.includes(item.k);
    this.pop(label,cx,cy,special?'#F7C548':'#EEF0FA',.85);
    this.sfx('earn',special);
    if(this.rack.length>RACK){const i=this.rack.findIndex(x=>!SELF_KINDS.includes(x.k));this.fire(i<0?0:i)}
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
  }
  fire(i,food){
    if(this.dead||i<0||i>=this.rack.length)return false;
    if(this.rack[i].k==='plate'){
      // you choose the food: the player's app asks for a tap on the board; bots and overflow pick the most common food
      if(food==null&&this===this.game.player&&this.game.hooks.pickFood&&this.game.hooks.pickFood(this.rack[i]))return true;
      this.rack.splice(i,1);this.clearFood(food==null?this.commonFood():food);
      if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
      return true;
    }
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
    if(this.game.boss)return this.game.boss.hp>0?this.game.bossObj:null;
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
    if(v&&v.boss){this.game.launch(this,{k:'pie',cells:10},v);return}   // Boss Brawl: a snack attack is a free 100-damage pie
    if(!v||v.dead||!v.rack||!v.rack.length)return;
    if(v.remote){if(this.game.hooks.send)this.game.hooks.send({t:'steal',from:this.id,to:v.id})}
    else{const it=v.stealFrom(this);if(it)this.takeItem(it,v)}
  }
  stealFrom(thief){
    if(this.dead||!this.rack.length)return null;
    const it=this.rack.shift();
    this.pop(`${thief?thief.name:'Someone'} stole your ${it.k==='pie'?'pie':it.k==='tower'?'tower':it.k==='sauce'?'hot sauce':it.k==='pin'?'rolling pin':it.k==='plate'?'clean plate':it.k==='swap'?'switcheroo':it.k}!`,3,8,'#CC79A7',.75);
    this.sfx('stolen');
    if(this===this.game.player&&this.game.hooks.rack)this.game.hooks.rack();
    return {k:it.k,cells:it.cells,at:it.at};
  }
  takeItem(it,from){
    if(this.dead||!it)return;
    const item={k:it.k,cells:it.cells|0,at:it.at||null,id:++uid};
    this.rack.push(item);this.stolen=(this.stolen||0)+1;
    this.pop(`Yoink! ${from?'From '+from.name:''}`,3,6,'#F7C548',.85);
    if(this.rack.length>RACK){const i=this.rack.findIndex(x=>!SELF_KINDS.includes(x.k));this.fire(i<0?0:i)}
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
  // ---------- Switcheroo: whole boards change hands ----------
  // compact copy of the stack: '.' empty, 0-4 food, A-Z junk (one letter per junk block), plus special badges
  gridCode(){
    let g='';const ids=new Map(),sp=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const t=this.g[r][c];
      if(!t||(t.clr>0&&!t.conv)){g+='.';continue}
      if(t.t<0&&!t.conv){if(!ids.has(t.gid))ids.set(t.gid,String.fromCharCode(65+Math.min(25,ids.size)));g+=ids.get(t.gid)}
      else{g+=String(t.t<0?Math.floor(this.rng()*NT):t.t);if(t.sp)sp.push([r*COLS+c,t.sp])}
    }
    return {g,sp};
  }
  loadGrid(code){
    if(!code||typeof code.g!=='string'||code.g.length!==ROWS*COLS)return false;
    const gids=new Map(),sps=new Map((code.sp||[]).filter(x=>Array.isArray(x)&&SPECIALS.includes(x[1])).map(x=>[x[0]|0,x[1]]));
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const ch=code.g[r*COLS+c];let t=null;
      if(ch>='0'&&ch<='4'){t=T(+ch);if(sps.has(r*COLS+c))t.sp=sps.get(r*COLS+c)}
      else if(ch>='A'&&ch<='Z'){t=T(-1);if(!gids.has(ch))gids.set(ch,++gidc);t.gid=gids.get(ch)}
      if(t)t.yo=-.6;
      this.g[r][c]=t;
    }
    this.chain=1;this.tower=0;this.grace=GRACE;
    return true;
  }
  swapped(other){
    this.hitFlash=24;this.shake=10;this.streak=0;this.streakType=null;
    this.pop(`Switcheroo! You got ${other&&other.name?other.name:'their'}'s board`,3,6,'#56B4E9',.9);this.sfx('blender');
    if(this===this.game.player&&this.game.hooks.swapped)this.game.hooks.swapped();
  }
  // ---------- Order Up! ----------
  newTicket(){
    const r=this.orng,foods=[0,1,2,3,4];
    for(let i=4;i>0;i--){const j=Math.floor(r()*(i+1));[foods[i],foods[j]]=[foods[j],foods[i]]}
    const two=r()<.55,items=two?[{t:foods[0],n:4+Math.floor(r()*3),got:0},{t:foods[1],n:4+Math.floor(r()*3),got:0}]:[{t:foods[0],n:7+Math.floor(r()*4),got:0}];
    const rush=this.tickets.length>0&&r()<.25;
    this.tickets.push({id:++this.ticketNo,items,rush,T:rush?60*22:0,T0:60*22});
  }
  fillOrders(arr,cx,cy){
    const n=new Array(NT).fill(0);arr.forEach(t=>{if(t.t>=0)n[t.t]++});
    for(const tk of this.tickets)for(const it of tk.items){const m=Math.min(n[it.t],it.n-it.got);it.got+=m;n[it.t]-=m}
    for(let i=0;i<this.tickets.length;i++){
      const tk=this.tickets[i];
      if(!tk.items.every(it=>it.got>=it.n))continue;
      this.tickets.splice(i--,1);this.orders++;
      const bonus=tk.rush?300:150;this.score+=bonus;
      if(tk.rush){this.tips++;this.pop(`Rush order #${tk.id}! Tip +${bonus}`,cx,cy-2,'#F7C548',.95);this.earn({k:'sauce'},cx,cy-2.8)}
      else this.pop(`Order up! #${tk.id}`,cx,cy-2,'#F7C548',1);
      this.sfx('helping');
      if(this.orders>=ORDER_GOAL){this.game.orderDone(this);return}
    }
    while(this.tickets.length<3)this.newTicket();
  }
  tickTickets(){
    for(let i=0;i<this.tickets.length;i++){const tk=this.tickets[i];if(tk.rush&&--tk.T<=0){this.tickets.splice(i--,1);this.pop(`Rush #${tk.id} went cold`,3,5,'#949BBD',.75)}}
    while(this.tickets.length<3)this.newTicket();
  }
  // topping out in Order Up! spills your tray: top of the stack is cleared, you lose an order and freeze for a moment
  spill(){
    let n=0;
    for(let r=0;r<6;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.clr===0){t.clr=CLR+n;t.conv=false;t.sp=null;n++}}
    this.inc.length=0;this.orders=Math.max(0,this.orders-1);this.spills++;
    this.frozenT=90;this.grace=GRACE;this.raising=false;this.rushT=0;
    this.pop('Spilled! −1 order',3,7,'#CC79A7',1.1);this.sfx('lose');
  }
  commonFood(){
    const n=new Array(NT).fill(0);let best=0;
    this.each((t,r)=>{if(t.t>=0&&t.clr===0)n[t.t]+=r<ROWS/2?2:1});   // tiles high in the stack count double
    for(let k=1;k<NT;k++)if(n[k]>n[best])best=k;
    return best;
  }
  clearFood(food){
    if(this.dead||!(food>=0&&food<NT))return 0;
    let n=0;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];if(t&&t.t===food&&t.clr===0&&t.st==='idle'){t.clr=CLR+n*2;t.sp=null;t.chain=false;n++;this.burst(r,c,food,3)}}
    this.score+=n*15;this.plates=(this.plates||0)+1;
    this.pop(n?`Clean plate! ${n} cleared`:'Clean plate!',3,5,'#F7C548',1.05);this.sfx('feast');
    return n;
  }
  snap(){
    let g='';
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=this.g[r][c];g+=!t?'.':t.t<0?(t.clr>0?'J':'j'):t.clr>0?'abcde'[t.t]:String(t.t)}
    return {id:this.id,g,p:this.preview.join(''),r:Math.round(this.rise*100),k:this.rack.length,h:this.rushT>0?1:0,c:this.creamT>0?1:0,z:this.frozenT>0?1:0,o:this.kos,d:this.dead?1:0,q:this.orders|0,x:Math.round(this.dmg||0)};
  }
  die(){if(this.dead)return;if(this.game.variant==='order'&&!this.forceDie&&!this.game.over)return this.spill();this.dead=true;this.raising=false;this.diedAt=this.game.frame;this.game.onDeath(this)}
  pop(text,x,y,col,size){if(this===this.game.player)this.pops.push({text,x,y,col,size,life:60})}
  burst(r,c,kind,n){if(this!==this.game.player)return;for(let i=0;i<n;i++)this.parts.push({x:c+.5,y:r+.5,vx:(Math.random()-.5)*.14,vy:-Math.random()*.12-.02,kind,life:24+rnd(14)})}
  // ---- bot brain ----
  ai(){
    if(this.raiseT>0){this.raiseT--;this.raising=this.raiseT>0}
    if(this.rack.length&&--this.fireT<=0){
      const F=DIFFS[this.game.d].fire;this.fireT=F[0]+rnd(F[1]-F[0]);
      const pin=this.rack.findIndex(x=>x.k==='pin'),plate=this.rack.findIndex(x=>x.k==='plate'),swp=this.rack.findIndex(x=>x.k==='swap'),atk=this.rack.findIndex(x=>!SELF_KINDS.includes(x.k)&&(x.k!=='swap'||!!this.game.boss));
      if(pin>=0&&this.height()>=8)this.fire(pin);
      else if(plate>=0&&this.height()>=7)this.fire(plate);
      else if(swp>=0&&!this.game.boss&&this.height()>=8)this.fire(swp);
      else if(atk>=0)this.fire(atk);
    }
    if(this.frozenT>0)return;
    if(--this.think>0)return;
    if(this.creamT>0&&Math.random()<.5){this.think=20;return}
    // Order Up! is a race: Easy bots still need to finish orders, so they move a little quicker there
    const D=this.game.variant==='order'&&this.game.d===0?ORDER_EASY:DIFFS[this.game.d];
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
  noise(){return this.isBot?(DIFFS[this.game.d].noise||.2):.2}
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
          s+=s>=3?Math.random()*this.noise():Math.random()*.2;
          if(s>bs){bs=s;best={r,c,v:false}}
        }
      }
      if(r<ROWS-1){
        const a=g[r][c],b=g[r+1][c];
        if(okV(a)&&okV(b)&&a.t!==b.t){
          g[r][c]=b;g[r+1][c]=a;
          let s=this.runScore(r,c)+this.runScore(r+1,c);
          g[r][c]=a;g[r+1][c]=b;
          s+=s>=3?Math.random()*this.noise():Math.random()*.2;
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
  height(){
    if(this.bm){const i=this.bm.search(/[^.]/);return i<0?0:Math.round((20-Math.floor(i/10))/20*ROWS)}
    if(this.hex){const Q=BOARD_TYPES.shot&&BOARD_TYPES.shot.GEO;if(!Q)return 0;for(let r=Q.NR-1;r>=0;r--)if(/[^.]/.test(this.hex.slice(r*Q.HC,(r+1)*Q.HC)))return Math.round((r+1)/Q.NR*ROWS);return 0}
    for(let r=0;r<ROWS;r++)if(this.g[r].some(Boolean))return ROWS-r;return 0;
  }
  apply(s){
    // Splat Shot boards send their hex grid instead
    const SQ=BOARD_TYPES.shot&&BOARD_TYPES.shot.GEO;
    if(s&&s.v==='shot'&&typeof s.g==='string'&&SQ&&s.g.length===SQ.NR*SQ.HC){
      this.hex=s.g;this.par=s.pr?1:0;this.aimA=Number.isFinite(+s.a)?+s.a:-1.57;this.cur=s.u|0;this.next=s.n|0;
      this.ball=Array.isArray(s.b)?{x:+s.b[0]||0,y:+s.b[1]||0,t:s.b[2]|0}:null;
      this.rushT=s.h?1:0;this.creamT=s.c?1:0;this.frozenT=s.z?1:0;this.kos=s.o|0;this.dmg=s.x|0;this.lastSnap=this.game.frame;
      return;
    }
    // Packed Lunch boards send their 10x20 well
    if(s&&s.v==='blocks'&&typeof s.g==='string'&&s.g.length===200){
      this.bm=s.g;this.binc=s.i|0;this.bhold=s.hd|0;this.bnext=typeof s.nx==='string'?s.nx:'';this.kos=s.o|0;this.lastSnap=this.game.frame;return;
    }
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
    this.rack={length:s.k|0};this.rushT=s.h?1:0;this.creamT=s.c?1:0;this.frozenT=s.z?1:0;this.kos=s.o|0;this.orders=s.q|0;this.dmg=s.x|0;
    this.lastSnap=this.game.frame;
  }
  step(){if(this.hitFlash>0)this.hitFlash--}
}

class Game{
  // opts.roster (online): [{id,name,bot?:true,owner}] in seat order; opts.myId; opts.seed
  constructor(mode,d,hooks,allBots,opts){
    opts=opts||{};
    const seed=opts.seed!=null?opts.seed:Math.floor(Math.random()*2**31);
    Object.assign(this,{mode,d,hooks:hooks||{},frame:0,over:false,paused:false,flights:[],boards:[],result:null,watched:new Set(),
      online:!!opts.roster,myId:opts.myId||'me',seed,variant:VARIANTS.includes(opts.variant)?opts.variant:'classic',hostId:opts.hostId||null});
    const Make=BOARD_TYPES[this.variant]||Board;
    if(opts.roster){
      opts.roster.forEach((m,i)=>{
        let b;
        if(m.id===opts.myId){b=new Make(this,m.name,!!allBots,i,m.id,seed);this.player=b}
        else if(m.bot&&m.owner===opts.myId)b=new Make(this,m.name,true,i,m.id,seed);
        else b=new RemoteBoard(this,m.id,m.name,i,m.owner);
        b.av=FIGHTERS.includes(m.av)?m.av:FIGHTERS[i%FIGHTERS.length];
        if(b.remote)b.isBot=!!m.bot;
        this.boards.push(b);
      });
    }else{
      this.player=new Make(this,opts.name||'You',!!allBots,0,'me',seed);
      this.player.av=FIGHTERS.includes(opts.av)?opts.av:'bun';
      this.boards.push(this.player);
      const n=mode==='brawl'?Math.max(2,Math.min(MAX_PLAYERS,opts.size||4))-1:1;
      pickBots(n,this.player.av,opts.avoid).forEach((bt,i)=>{const b=new Make(this,bt.name,true,i+1,'bot'+i,seed);b.av=bt.av;this.boards.push(b)});
    }
    if(!this.hostId)this.hostId=this.online?(opts.roster.find(m=>m.bot)||{}).owner||opts.roster[0].id:this.myId;
    if(this.variant==='boss')this.setupBoss(opts.boss);
  }
  isHost(){return !this.online||this.hostId===this.myId}
  // ---------- Order Up! ----------
  orderDone(b){
    if(this.over)return;
    if(!this.online){this.finishOrders(b);return}
    if(this.isHost()){if(this.hooks.send)this.hooks.send({t:'owin',id:b.id});this.finishOrders(b)}
    else{if(this.hooks.send)this.hooks.send({t:'odone',id:b.id});this.orderWait=this.frame}
  }
  netOrderDone(id){const b=this.byId(id);if(b&&this.isHost()&&!this.over){if(this.hooks.send)this.hooks.send({t:'owin',id});this.finishOrders(b)}}
  finishOrders(w){
    if(this.over||!w)return;
    if(w.remote)w.orders=Math.max(w.orders|0,ORDER_GOAL);
    const rank=this.boards.slice().sort((a,b)=>(b===w)-(a===w)||(b.orders|0)-(a.orders|0)||(b.score|0)-(a.score|0));
    rank.forEach((b,i)=>{if(!b.dead)b.place=i+1});
    this.over=true;this.result={won:w===this.player,place:this.player.place||rank.indexOf(this.player)+1,winner:w};
    if(this.hooks.end)this.hooks.end(this.result);
  }
  // ---------- Boss Brawl ----------
  setupBoss(spec){
    spec=spec||{};
    const used=new Set(this.boards.map(b=>b.av));
    const av=FIGHTERS.includes(spec.av)?spec.av:(FIGHTERS.find(a=>!used.has(a))||'fudge');
    const info=BOSSES[av]||{name:'Big Boss'};
    const n=this.boards.length,max=Math.round((spec.hp||BOSS_HP)*(.55+.45*n)*[.55,1,1.25][this.d]);
    this.boss={av,name:info.name,attack:info.attack,hp:max,max,phase:1,next:null,nextAt:this.frame+60*8,last:-999};
    this.bossObj={id:'boss',name:info.name,av,boss:true,remote:true,dead:false,isBot:true};
  }
  // one hit on the boss: damage for each item kind. Host (or practice) owns the HP; everyone else reports damage
  bossDamage(item){
    const k=item.k;
    if(k==='pie'||k==='tower')return Math.round(item.cells*10);
    return {sauce:60,cream:80,freeze:80,blender:90,swap:110}[k]||40;
  }
  hitBoss(src,amt,remote){
    if(!this.boss||this.over)return;
    if(!remote){src.dmg=(src.dmg||0)+amt;src.score+=Math.round(amt/2)}
    if(!this.isHost()){if(!remote&&this.hooks.send)this.hooks.send({t:'dmg',from:src.id,amt});this.boss.hitT=12;return}
    this.boss.hp=Math.max(0,this.boss.hp-amt);this.boss.hitT=12;
    const ph=this.boss.hp<=this.boss.max*.25?3:this.boss.hp<=this.boss.max*.6?2:1;
    if(ph>this.boss.phase){this.boss.phase=ph;if(this.hooks.bossPhase)this.hooks.bossPhase(ph)}
    this.bossSync(true);
    if(this.boss.hp<=0)this.bossDefeated();
  }
  netDamage(m){const b=this.byId(m.from);if(b&&b.remote&&this.isHost())this.hitBoss(b,Math.max(0,Math.min(1200,+m.amt||0)),true)}
  bossSync(now){
    if(!this.online||!this.isHost()||!this.hooks.send)return;
    if(!now&&this.frame-this.boss.last<30)return;
    this.boss.last=this.frame;const nx=this.boss.next;
    this.hooks.send({t:'boss',hp:this.boss.hp,max:this.boss.max,ph:this.boss.phase,nk:nx?nx.k:null,nto:nx?nx.to:null,nin:nx?Math.max(0,this.boss.nextAt-this.frame):0});
  }
  netBoss(m){
    if(!this.boss||this.isHost())return;
    const b=this.boss,hp=Math.max(0,+m.hp||0);
    if(hp<b.hp)b.hitT=12;
    b.hp=hp;b.max=Math.max(1,+m.max||b.max);b.phase=m.ph|0||b.phase;
    b.next=m.nk?{k:m.nk,to:m.nto}:null;b.nextAt=this.frame+(m.nin|0);
    if(b.hp<=0)this.bossDefeated();
  }
  bossTick(){
    const b=this.boss;if(!b||b.hp<=0)return;
    if(b.hitT>0)b.hitT--;
    if(!this.isHost())return;
    const alive=this.alive();if(!alive.length)return;
    // pick the next attack 5 seconds ahead so everyone can see it coming
    if(!b.next&&this.frame>=b.nextAt-60*5){
      const to=alive[Math.floor(Math.random()*alive.length)];
      const kinds=b.phase>=3?['pie','pie','sauce','freeze','blender','cream']:b.phase===2?['pie','pie','sauce','cream','freeze']:['pie','pie','cream'];
      const k=kinds[Math.floor(Math.random()*kinds.length)];
      const cells=k==='pie'?Math.round((4+b.phase*2+Math.random()*3)*[.7,1,1.25][this.d]):0;
      b.next={k,to:to.id,cells};this.bossSync(true);
    }
    if(b.next&&this.frame>=b.nextAt){
      const nx=b.next;b.next=null;b.nextAt=this.frame+60*([9,7,5.5][b.phase-1]||6)*[1.25,1,.85][this.d];
      const to=this.byId(nx.to);
      if(to&&!to.dead){
        const item={k:nx.k,cells:nx.cells,at:null};
        if(to.remote){if(this.hooks.send)this.hooks.send({t:'batk',to:to.id,k:nx.k,cells:nx.cells})}
        else this.flights.push({from:this.bossObj,to,item,t:FLY});
        if(this.hooks.fly)this.hooks.fly(this.bossObj,to,item);
      }
      this.bossSync(true);
    }
    this.bossSync(false);
  }
  netBossAttack(m){
    const to=this.byId(m.to);if(!to||to.remote||to.dead||this.over||!this.boss)return;
    const k=['pie','sauce','cream','freeze','blender'].includes(m.k)?m.k:'pie';
    const item={k,cells:k==='pie'?Math.max(1,Math.min(30,m.cells|0)):0,at:null};
    this.flights.push({from:this.bossObj,to,item,t:FLY});
    if(this.hooks.fly)this.hooks.fly(this.bossObj,to,item);
  }
  bossDefeated(){
    if(this.over)return;
    if(this.online&&this.isHost()&&this.hooks.send)this.hooks.send({t:'boss',hp:0,max:this.boss.max,ph:3});
    const rank=this.boards.slice().sort((a,b)=>(b.dmg||0)-(a.dmg||0)||(b.score|0)-(a.score|0));
    rank.forEach((b,i)=>b.place=i+1);
    this.over=true;this.result={won:true,coop:true,place:this.player.place,winner:rank[0]};
    if(this.hooks.end)this.hooks.end(this.result);
  }
  byId(id){return this.boards.find(b=>b.id===id)}
  // only bots are still cooking: the humans are all out, so the rest can be fast-forwarded
  onlyBotsLeft(){const a=this.alive();return !this.over&&a.length>1&&a.every(b=>b.isBot)}
  // stalled fast-forward safety net: rank the remaining bots by stack height (lowest stack wins)
  resolveByHeight(){
    if(this.boss){if(this.isHost()){this.boss.hp=0;this.bossDefeated()}return}
    if(this.variant==='order'){const w=this.boards.slice().sort((x,y)=>(y.orders|0)-(x.orders|0))[0];this.finishOrders(w);return}
    const a=this.alive().filter(b=>!b.remote).sort((x,y)=>y.height()-x.height()||y.score-x.score);
    for(let i=0;i<a.length-1&&!this.over;i++)a[i].die();
  }
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
    this.flights.push({from,to,item:{k,cells,at,g:k==='swap'?m.g:undefined},t:FLY});
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
    const kinds=['pie','tower','sauce','cream','freeze','blender','pin','plate','swap'];if(!kinds.includes(m.k))return;
    const at=Number.isFinite(m.ac)&&Number.isFinite(m.ar)?{c:Math.max(0,Math.min(COLS,m.ac)),r:Math.max(0,Math.min(ROWS,m.ar))}:null;
    to.takeItem({k:m.k,cells:JUNK_KINDS.includes(m.k)?Math.max(1,Math.min(72,m.cells|0)):0,at},from);
  }
  swapBoards(to,from,item){
    if(!to||to.dead||!to.gridCode)return;
    to.lastAttacker=from;
    if(from&&!from.remote&&!from.dead&&from.gridCode){
      if(to.shot&&from.shot){const a=to.h,p=to.par;to.h=from.h;to.par=from.par;from.h=a;from.par=p;to.ball=from.ball=null}
      else if(to.blocks&&from.blocks){const a=to.m;to.m=from.m;from.m=a}
      else{const a=to.g;to.g=from.g;from.g=a}
      to.chain=from.chain=1;to.tower=from.tower=0;
      to.swapped(from);from.swapped(to);
    }else if(item&&item.g){
      const mine=to.gridCode();
      if(!to.loadGrid(item.g))return;
      to.swapped(from);
      if(this.hooks.send&&from)this.hooks.send({t:'swapg',to:from.id,from:to.id,g:mine});
    }
  }
  netSwapGrid(m){const b=this.byId(m.to),o=this.byId(m.from);if(!b||b.remote||b.dead||this.over||!b.loadGrid(m.g))return;b.swapped(o)}
  netLeave(ownerId){this.boards.filter(b=>b.remote&&b.owner===ownerId&&!b.dead).forEach(b=>this.netKO(b.id,null))}
  level(){return Math.min(10,1+Math.floor(this.frame/(60*20)))}
  margin(){const s=this.frame/60-MARGIN;return s>0?1+Math.floor(s/15)*.3:1}
  alive(){return this.boards.filter(b=>!b.dead)}
  deliver(to,item,from){
    if(to.blocks&&item.k!=='swap'&&!JUNK_KINDS.includes(item.k)){to.effect(item.k,from);return}   // Packed Lunch items
    if(item.k==='sauce')to.rush(from);
    else if(item.k==='cream')to.cream(from);
    else if(item.k==='freeze')to.freeze(from);
    else if(item.k==='blender')to.blend(from);
    else if(item.k==='swap')this.swapBoards(to,from,item);
    else if(item.k==='steam'){if(to.steam)to.steam(from);else to.cream(from)}
    else if(item.k==='grease'){if(to.grease)to.grease(from);else to.freeze(from)}
    else if(item.k==='lights'||item.k==='reverse'){if(to[item.k])to[item.k](from)}
    else to.receive(item.cells,from,item.at);
  }
  aim(){if(this.boss)return this.bossObj;const o=this.alive().filter(b=>b!==this.player);return o.length?o[Math.floor(this.frame/CYCLE)%o.length]:null}
  launch(src,item,tgt,slot){
    const it={k:item.k,cells:item.cells||0,at:item.at||null};
    if(JUNK_KINDS.includes(it.k)&&src.blocks)src.sent+=it.cells;   // Packed Lunch: garbage lines go out exactly as earned
    else if(JUNK_KINDS.includes(it.k)){it.cells=Math.max(1,Math.round(it.cells*(1+.25*src.kos)*this.margin()*(src.isBot?(DIFFS[this.d].hit||1):1)));src.sent+=it.cells}
    if(tgt.boss){
      if(this.hooks.fly)this.hooks.fly(src,tgt,it,slot);
      const amt=this.bossDamage(it);
      this.flights.push({from:src,to:tgt,item:it,t:FLY,boss:amt});
      return;
    }
    if(tgt.remote){if(this.hooks.send)this.hooks.send({t:'atk',from:src.id,to:tgt.id,k:it.k,cells:it.cells,ac:it.at?+it.at.c.toFixed(2):null,ar:it.at?+it.at.r.toFixed(2):null,g:it.k==='swap'&&src.gridCode?src.gridCode():undefined})}
    else this.flights.push({from:src,to:tgt,item:it,t:FLY});
    if(this.hooks.fly)this.hooks.fly(src,tgt,it,slot);
  }
  step(){
    if(this.over||this.paused)return;
    this.frame++;
    for(const b of this.boards)if(!b.dead)b.step();
    if(this.online&&this.hooks.send){
      // everyone's boards ~5x a second; a board someone is spectating full screen goes out 10x a second
      const f=this.frame,base=this.ffMode?240:this.boards.length>4?20:12;let l=null;
      if(f%base===0)l=this.local().filter(b=>!b.dead||b.diedAt===f-1);
      else if(!this.ffMode&&this.watched.size&&f%6===0)l=this.local().filter(b=>!b.dead&&this.watched.has(b.id));
      if(l&&l.length)this.hooks.send({t:'snaps',list:l.map(b=>b.snap())});
    }
    if(this.flights.length)this.flights=this.flights.filter(f=>{if(--f.t>0)return true;if(f.to.boss)this.hitBoss(f.from,f.boss);else if(!f.to.dead)this.deliver(f.to,f.item,f.from);return false});
    if(this.boss)this.bossTick();
    if(this.orderWait&&this.frame-this.orderWait>180&&!this.over){const w=this.local().find(b=>b.orders>=ORDER_GOAL);if(w)this.finishOrders(w)}
    this.checkEnd();
  }
  onDeath(b){
    b.place=this.alive().length+1;
    if(this.boss&&!b.lastAttacker)b.lastAttacker=this.bossObj;
    const k=b.lastAttacker;
    if(k&&!k.dead&&k!==b){if(!k.remote)k.kos++;b.killedBy=k}
    if(this.online&&this.hooks.send)this.hooks.send({t:'ko',id:b.id,by:k&&!k.dead?k.id:null});
    if(this.hooks.ko)this.hooks.ko(b,k);
  }
  checkEnd(){
    if(this.over)return;
    const p=this.player,alive=this.alive();
    if(this.boss){
      if(p.dead&&!this.playerOut){this.playerOut=true;if(this.hooks.out)this.hooks.out(p.place)}
      if(!alive.length){this.over=true;const rank=this.boards.slice().sort((a,b)=>(b.dmg||0)-(a.dmg||0));rank.forEach((b,i)=>b.place=i+1);this.result={won:false,coop:true,place:p.place,winner:null}}
    }
    else if(this.variant==='order'){
      if(alive.length<=1&&this.boards.length>1){this.finishOrders(alive[0]||p);return}
    }
    else if(this.online||this.boards.length>2){
      // keep simulating after you're out (online, and practice brawls) so you can spectate: the host's bots and everyone's view must run to the end
      if(p.dead&&!this.playerOut){this.playerOut=true;if(this.hooks.out)this.hooks.out(p.place)}
      if(alive.length<=1){if(!p.dead)p.place=1;this.over=true;this.result={won:!p.dead,place:p.place,winner:alive[0]||null}}
    }
    else if(p.dead){this.over=true;this.result={won:false,place:p.place}}
    else if(alive.length===1){p.place=1;this.over=true;this.result={won:true,place:1}}
    if(this.over&&this.hooks.end)this.hooks.end(this.result);
  }
}

const FFE={VARIANTS,BOARD_TYPES,ORDER_GOAL,BOSSES,BOSS_HP,JUNK_KINDS,T,genRow,rnd,nextId:()=>++uid,nextGid:()=>++gidc,COLS,ROWS,NT,CLR,POP,HOVER,INC_T,GRACE,FLY,DIFFS,MARGIN,RACK,RUSH,CYCLE,CREAM,FREEZE,SPECIALS,BOTNAMES,BOTS,FIGHTERS,MAX_PLAYERS,pickBots,Board,RemoteBoard,Game,mulberry32};
if(typeof module!=='undefined')module.exports=FFE;else window.FFEngine=FFE;
