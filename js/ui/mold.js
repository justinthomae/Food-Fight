// Mold Patrol screen: the Snack Stack screen (same controls, Next and Bank), with mouldy food drawn fuzzy green on top
(function(){
const U=()=>window.FFUI;
const ST=()=>U().MODE_UI.stack;
// ---- the mould: fuzzy grey-green patches with dark spores and white fuzz, cached per size and look ----
const spr=new Map();
function moldSprite(s,v){
  s=Math.max(6,Math.round(s));const key=s+'|'+v;let c=spr.get(key);if(c)return c;
  if(spr.size>60)spr.clear();
  c=document.createElement('canvas');c.width=c.height=s;const x=c.getContext('2d');
  let sd=7+v*131;const rnd=()=>(sd=(sd*16807)%2147483647)/2147483647;
  // the food under it looks spoiled: a dull grey-green wash
  x.fillStyle='rgba(88,104,64,.32)';x.fillRect(s*.05,s*.05,s*.9,s*.9);
  // one lumpy furry patch covering most of the food, centred a little off-middle
  const cx=s*[.36,.64,.4][v],cy=s*[.38,.4,.62][v],lumps=[];   // off to one side so you can still tell which food it is
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2+rnd()*.5,d=s*(.08+rnd()*.07);lumps.push([cx+Math.cos(a)*d,cy+Math.sin(a)*d,s*(.09+rnd()*.05)])}
  lumps.push([cx,cy,s*.14]);
  // a couple of smaller spots elsewhere on the food
  lumps.push([s-cx*.95,s-cy*.9,s*.075],[s-cx*.7,s-cy*1.15,s*.05]);
  const disc=(l,k,col)=>{x.fillStyle=col;x.beginPath();l.forEach(([bx,by,r])=>{x.moveTo(bx+r*k,by);x.arc(bx,by,r*k,0,Math.PI*2)});x.fill()};
  // fuzz: pale hairs sticking out round the edge
  x.strokeStyle='rgba(226,236,204,.9)';x.lineWidth=Math.max(.7,s*.018);x.lineCap='round';x.beginPath();
  lumps.forEach(([bx,by,r])=>{for(let j=0;j<7;j++){const a=rnd()*Math.PI*2,r1=r*.85,r2=r*(1.12+rnd()*.22);x.moveTo(bx+Math.cos(a)*r1,by+Math.sin(a)*r1);x.lineTo(bx+Math.cos(a)*r2,by+Math.sin(a)*r2)}});x.stroke();
  disc(lumps,1.04,'#C9D8AE');          // pale furry rim
  disc(lumps,.9,'#8FA96A');            // the mould
  disc(lumps.map(([bx,by,r])=>[bx+r*.15,by+r*.18,r]),.55,'#6F8B4E');   // darker, older middle
  // spores: dark speckles and a few blue-green ones
  for(let i=0;i<14;i++){const a=rnd()*Math.PI*2,d=rnd()*s*.16;x.fillStyle=i%4?'#3C5530':'#3F7A6E';x.beginPath();x.arc(cx+Math.cos(a)*d,cy+Math.sin(a)*d,s*(.018+rnd()*.024),0,Math.PI*2);x.fill()}
  // a soft highlight so it looks fuzzy, not flat
  x.fillStyle='rgba(236,244,220,.45)';x.beginPath();x.arc(cx-s*.08,cy-s*.1,s*.07,0,Math.PI*2);x.fill();
  spr.set(key,c);return c;
}
function drawMold(c,x,y,s,id,a){if(a!=null&&a<1)c.globalAlpha=a;c.drawImage(moldSprite(s,(id|0)%3),x,y,s,s);c.globalAlpha=1}
const left=b=>{let n=0;(b.g||[]).forEach(r=>r.forEach(t=>{if(t&&t.mold&&!(t.clr>0))n++}));return n};
// the bank box (Snack Stack draws its own inside a closure we can't reach, so this is a small copy)
let bankKey='';
function drawBank(B){
  const F=U(),c=F.$('#bankCv'),box=F.$('#bankBox');if(!c||!box)return;
  const s=ST().ns||26,h=B.held,key=JSON.stringify(h)+'|'+!!B.heldUsed+'|'+s+F.prefs.palette+F.prefs.art+F.cuisine()+F.DPR;if(key===bankKey)return;bankKey=key;
  const D=F.DPR;c.width=s*D;c.height=s*2*D;c.style.width=s+'px';c.style.height=s*2+'px';
  const x=c.getContext('2d'),u=s*D;x.clearRect(0,0,c.width,c.height);
  box.classList.toggle('used',!!B.heldUsed);box.classList.toggle('full',h!=null);
  if(h==null){x.strokeStyle='rgba(255,255,255,.3)';x.lineWidth=2*D;x.setLineDash([4*D,3*D]);F.rr(x,D*2,D*2,c.width-D*4,c.height-D*4,u*.2);x.stroke();
    x.setLineDash([]);x.fillStyle='rgba(238,240,250,.55)';x.font=`800 ${Math.round(u*.28)}px Figtree,sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText('Tap',c.width/2,c.height/2);return}
  F.drawTile(x,{t:h[1],clr:0},0,0,u,1,0);F.drawTile(x,{t:h[0],clr:0},0,u,u,1,0);
}
let vis=null;
(window.FF_MODES=window.FF_MODES||{}).mold={
  info:{how:'Move and spin the falling pairs. Connect 4 to pop them. Pop every mouldy food first to win.',name:'Mold Patrol',tag:'Clean the kitchen',sizes:['Duel','Race of 4','Race of 8'],hidden:true,blurb:'pop 4 to clean out the mould, first clean kitchen wins'},
  deskNoFooter:true,keys:'← → move · ↓ faster · ↑ / X spin · Z spin back · Space drop · C bank · Shift unbank',growSide:true,noTray:true,
  footClass(){return ST().footClass()},
  noRaise(){return ST().noRaise()},
  raiseLabel:'Drop',
  side(){return ST().side().replace('<div id="slotHost"></div>','')},
  sideW(){return ST().sideW()},
  ctl(){return ST().ctl().replace('<div id="slotHost"></div>','')},
  bind(){bankKey='';vis=null;ST().bind.call(ST())},
  icon(x){
    const F=U();F.drawTile(x,{t:1,clr:0},12,24,50,1,0);x.drawImage(moldSprite(50,0),12,24,50,50);
    F.drawTile(x,{t:3,clr:0},62,38,38,1,0);x.drawImage(moldSprite(38,2),62,38,38,38);
    // a cleaning sparkle
    const star=(cx,cy,r)=>{x.fillStyle='#F7C548';x.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.32:r;x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)}x.closePath();x.fill()};
    star(92,18,13);star(72,10,6);
  },
  render(){
    const F=U(),ctx=F.ctx,S=F.S,G=F.G,B=F.spec||G.player,W=S*F.COLS,H=S*F.ROWS,f=G.frame,mine=B===G.player,ALPHA=F.ALPHA;
    F.checker(0);
    // the drop column: if it fills to the top you're out
    ctx.strokeStyle='rgba(204,121,167,.55)';ctx.lineWidth=Math.max(2,S*.06);const xc=2*S+S/2,yc=S/2,k=S*.18;
    ctx.beginPath();ctx.moveTo(xc-k,yc-k);ctx.lineTo(xc+k,yc+k);ctx.moveTo(xc+k,yc-k);ctx.lineTo(xc-k,yc+k);ctx.stroke();
    const sh=B.shake?Math.sin(B.shake*2)*S*.04:0,dim=B.dead?.45:1;
    for(let r=0;r<F.ROWS;r++)for(let c=0;c<F.COLS;c++){const t=B.g[r][c];if(!t)continue;
      const y=(r+(t.yo<0?Math.min(0,t.yo+.34*ALPHA):(t.yo||0)))*S+sh;
      F.drawTile(ctx,t,c*S,y,S,dim,f);
      if(t.mold){const a=t.clr>0?Math.min(1,t.clr/20):1;drawMold(ctx,c*S,y,S,t.id!=null?t.id:r*7+c,dim*a)}}
    const p=B.piece;
    if(p&&B.cells){
      let g=Object.assign({},p);while(B.fits(Object.assign({},g,{r:Math.floor(g.r)+1})))g.r=Math.floor(g.r)+1;
      B.cells(Object.assign({},g,{r:Math.floor(g.r)})).forEach(([r,c,t])=>{if(r>=0)F.drawTile(ctx,{t,clr:0},c*S,r*S,S,.22,f)});
      const off=[[-1,0],[0,1],[1,0],[0,-1]][p.rot];
      let pr=p.r;if(ALPHA&&typeof B.speed==='function'){const bl=Math.floor(p.r)+1;if(B.fits(Object.assign({},p,{r:bl})))pr=Math.min(bl,p.r+B.speed()*ALPHA)}
      const v=vis||(vis={}),ta=Math.atan2(off[0],off[1]);
      if(v.pid!==B.pid||v.b!==B){v.pid=B.pid;v.b=B;v.c=p.c;v.a=ta}
      const kk=1-Math.exp(-F.drawDt/28);v.c+=(p.c-v.c)*kk;
      let da=ta-v.a;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;v.a+=da*kk;
      if(Math.abs(p.c-v.c)<.01)v.c=p.c;if(Math.abs(da)<.01)v.a=ta;
      const dr=Math.sin(v.a),dc=Math.cos(v.a);
      F.drawTile(ctx,{t:p.a,clr:0},v.c*S,pr*S+sh,S,1,f);
      F.drawTile(ctx,{t:p.b,clr:0},(v.c+dc)*S,(pr+dr)*S+sh,S,1,f);
      if(mine){ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2.5;F.rr(ctx,v.c*S+1.5,pr*S+1.5+sh,S-3,S-3,S*.2);ctx.stroke()}
    }
    F.drawEffects(ctx,B,W,H,f);F.drawSteam(B,W,H,f);
    if(mine)F.drawIncoming(B);
    // mould left, top right
    {const n=B.remote?left(B):B.moldLeft(),tot=B.remote?n+(B.orders|0):B.moldTotal(),txt=n?`${n} mould left`:'Spotless!';
     ctx.font=`800 ${Math.round(S*.3)}px Figtree,sans-serif`;const tw=ctx.measureText(txt).width+S*.82,hh=S*.5,x0=W-tw-S*.12,y0=S*.12;
     ctx.fillStyle=n?'rgba(46,70,38,.9)':'rgba(247,197,72,.95)';F.rr(ctx,x0,y0,tw,hh,hh/2);ctx.fill();
     ctx.drawImage(moldSprite(hh*.9,1),x0+S*.06,y0+hh*.05,hh*.9,hh*.9);
     ctx.fillStyle=n?'#DDF2C8':'#2A1E05';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,x0+S*.62,y0+hh/2+1);
     if(tot>0){const w2=tw-S*.3;ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(x0+S*.15,y0+hh+S*.06,w2,S*.07);ctx.fillStyle='#9BE07A';ctx.fillRect(x0+S*.15,y0+hh+S*.06,w2*(1-n/tot),S*.07)}}
    if(mine&&B.reverseT>0){const t=`⇄ Controls reversed ${Math.ceil(B.reverseT/60)}s`;ctx.font=`800 ${Math.round(S*.3)}px Figtree,sans-serif`;const tw=ctx.measureText(t).width+S*.6;ctx.fillStyle='rgba(204,121,167,.95)';F.rr(ctx,W/2-tw/2,S*.78,tw,S*.5,S*.25);ctx.fill();ctx.fillStyle='#FFFFFF';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,S*1.03)}
    F.drawFxLayer(B,0);
    if(B.dead&&G.playerOut&&!G.over)F.drawKO(B,W,H);
    if(mine){ST().drawNext.call(ST());drawBank(B)}
  },
  mini(c,b,w,h,s){
    const F=U(),simple=s<14;
    const grid=b.g.map(r=>r.slice());
    if(!b.remote&&b.piece&&b.cells)b.cells(b.piece).forEach(([r,cc,t])=>{if(r>=0&&r<F.ROWS&&grid[r]&&!grid[r][cc])grid[r][cc]={t,clr:0}});
    for(let r=0;r<F.ROWS;r++)for(let k=0;k<F.COLS;k++){const t=grid[r][k];if(!t)continue;F.drawTile(c,t,k*s,r*s,s,b.dead?.5:1,0,simple);
      if(t.mold){if(simple){c.fillStyle='#C9D8AE';c.fillRect(k*s+s*.22,r*s+s*.22,s*.56,s*.56);c.fillStyle='#4E6B38';c.fillRect(k*s+s*.32,r*s+s*.32,s*.36,s*.36)}
        else c.drawImage(moldSprite(s,(t.id|0)%3),k*s,r*s,s,s)}}
    if(grid[0].some(Boolean)||grid[1].some(Boolean)){c.fillStyle='rgba(247,197,72,.55)';c.fillRect(0,0,w,Math.max(2,s*.2))}
    if(b.dead)F.miniKO(c,w,h);
  },
  stat(B){return [B.moldLeft(),'Mould left']},
  meta(b,h){const n=b.remote?left(b):b.moldLeft();return [n?`${n} mould left`:'Spotless!',h>=9?'stack high':`${b.orders|0} cleaned`]},
  endLine(res,B){
    const w=res.winner;
    if(res.won)return w===B&&B.wonRace?'Spotless kitchen first. The health inspector is impressed!':'Last kitchen standing. Mould and rivals, both handled.';
    if(B.dead)return `${B.killedBy?B.killedBy.name+' buried you':'Your kitchen overflowed'} with ${B.moldLeft()} mould still to go.`;
    return `${w?w.name:'Someone'} cleaned their kitchen first. You cleared ${B.orders|0} mould.`;
  },
  down(e,p){ST().down(e,p)},move(e,p){ST().move(e,p)},up(e,p){ST().up(e,p)},raise(){ST().raise()},
  key(k,down){if(!down&&k!=='ArrowDown')return false;if(down&&(k==='v'||k==='V'||('123'.includes(k)&&k.length===1)))return false;return ST().key(k,down)},
};
})();
