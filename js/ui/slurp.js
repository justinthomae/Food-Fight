// Screens for the two rising-stack modes: Noodle Slurp (drag a chain) and Buffet Grab (tap a group)
(function(){
const U=()=>window.FFUI;
const GW=8,GH=16;
const kb={on:false,r:11,c:3};
const cellPx=()=>U().S*6/GW;
// how far the stack has risen this frame (carried between steps so it glides)
function riseOf(B){const F=U();if(B.remote)return Math.min(.999,B.ms?(B.ms.r|0)/100:0);const busy=B.g.some(row=>row.some(t=>t&&t.clr>0));return Math.min(.999,B.rise+(busy||B.g[0].some(Boolean)?0:B.speed()*F.ALPHA))}
function cellAt(B,p){const cs=cellPx(),ro=riseOf(B)*cs;return [Math.floor((p.y+ro)/cs),Math.floor(p.x/cs)]}
// a remote board's stack, rebuilt from its snapshot
function gridOf(B){
  if(!B.remote)return B.g;
  const g=[],s=B.ms&&B.ms.g||'';
  for(let r=0;r<GH;r++){const row=[];for(let c=0;c<GW;c++){const ch=s[r*GW+c];row.push(!ch||ch==='.'?null:ch==='j'?{t:-1,clr:0}:ch==='J'?{t:-1,clr:20}:ch>='a'&&ch<='e'?{t:ch.charCodeAt(0)-97,clr:20}:{t:+ch,clr:0})}g.push(row)}
  return g;
}
const previewOf=B=>B.remote?((B.ms&&B.ms.p)||'').split('').map(t=>({t:+t})):B.preview;
// the board: checker, rising stack, the next row coming up underneath, danger glow, power-up effects
function drawRise(B,extra){
  const F=U(),ctx=F.ctx,S=F.S,G=F.G,W=S*6,H=S*12,f=G.frame,mine=B===G.player,cs=cellPx(),ro=riseOf(B)*cs,g=gridOf(B);
  ctx.fillStyle=F.TOK.grid;for(let r=-1;r<=GH;r++)for(let c=0;c<GW;c++)if((r+c+400)%2===0)ctx.fillRect(c*cs,r*cs-ro,cs,cs);
  const danger=g[0].some(Boolean)||g[1].some(Boolean)||g[2].some(Boolean);
  if(danger){const a=B.grace>0?.55+.3*Math.sin(f*.5):.3;ctx.fillStyle=`rgba(229,72,77,${a*.35})`;ctx.fillRect(0,0,W,cs*3)}
  const rush=B.remote?B.ms&&B.ms.h:B.rushT>0;
  if(rush){const hg=S*.45,pulse=.35+.25*Math.sin(f*.4);ctx.fillStyle=`rgba(229,104,42,${pulse})`;
    for(let i=0;i<GW*2;i++){const x=i*cs/2;ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x+cs*.1,H-hg*(.6+.4*Math.sin(f*.5+i)),x+cs/4,H-hg);ctx.quadraticCurveTo(x+cs*.4,H-hg*.5,x+cs/2,H);ctx.fill()}}
  const sh=B.shake?Math.sin(B.shake*2)*cs*.05:0;
  for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){const t=g[r][c];if(!t)continue;
    const yo=t.yo<0?Math.min(0,t.yo+.42*F.ALPHA):(t.yo||0);
    const wob=danger&&!B.dead&&r<3?Math.sin(f*.8+c*1.7)*cs*.03:0;
    F.drawTile(ctx,t,c*cs+wob,(r+yo)*cs-ro+sh,cs,B.dead?.45:1,f)}
  const pv=previewOf(B)||[];for(let c=0;c<GW;c++)if(pv[c])F.drawTile(ctx,{t:pv[c].t,clr:0,sp:pv[c].sp},c*cs,GH*cs-ro+sh,cs,.45,f);
  ctx.fillStyle=F.TOK.shade;ctx.fillRect(0,H-ro,W,ro);
  if(extra)extra(ro,cs);
  if(mine&&kb.on){ctx.strokeStyle='#F7C548';ctx.lineWidth=3;F.rr(ctx,kb.c*cs+2,kb.r*cs-ro+2,cs-4,cs-4,cs*.22);ctx.stroke()}
  if(!B.remote&&B.combo>=1&&B.comboT>0){
    const t=`Combo ×${B.combo}`;ctx.font=`800 ${Math.round(S*.32)}px Figtree,sans-serif`;const tw=ctx.measureText(t).width+S*.6,x=W-tw-S*.15,y=S*.15,h=S*.56;
    ctx.fillStyle='rgba(204,121,167,.95)';F.rr(ctx,x,y,tw,h,h/2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(x+h/2,y+h-S*.09,(tw-h)*B.comboT/95,S*.05);
    ctx.fillStyle='#FFFFFF';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x+tw/2,y+h/2-1);
  }
  if(B.remote){if(B.ms&&B.ms.z){ctx.fillStyle='rgba(150,215,255,.3)';ctx.fillRect(0,0,W,H)}if(B.ms&&B.ms.c)F.drawSteam({steamT:200},W,H,f)}
  else{F.drawEffects(ctx,B,W,H,f);F.drawSteam(B,W,H,f)}
  F.drawFxLayer(B,0);
  if(B.dead&&G.playerOut&&!G.over)F.drawKO(B,W,H);
}
// the little opponent board
function drawMini(c,b,w,h){
  const F=U(),cs=w/GW,ro=riseOf(b)*cs,g=gridOf(b);
  for(let r=0;r<GH;r++)for(let k=0;k<GW;k++){const t=g[r][k];if(t)F.drawTile(c,t,k*cs,r*cs-ro,cs,b.dead?.5:1,0,cs<14)}
  if(g[0].some(Boolean)||g[1].some(Boolean)){c.fillStyle='rgba(247,197,72,.55)';c.fillRect(0,0,w,Math.max(2,cs*.25))}
  const fz=b.remote?b.ms&&b.ms.z:b.frozenT>0;if(fz){c.fillStyle='rgba(150,215,255,.4)';c.fillRect(0,0,w,h)}
  const rs=b.remote?b.ms&&b.ms.h:b.rushT>0;if(rs){c.fillStyle='rgba(229,104,42,.6)';c.fillRect(0,h-Math.max(3,cs*.5),w,Math.max(3,cs*.5))}
  if(b.dead)F.miniKO(c,w,h);
}
// shared layout: Incoming on top of the right column, power-ups under it, Raise (hold) at the bottom, like Classic
const SIDE={rightCol:true,narrow:true,slots:true,noFooter:true,side(){return '<div id="slotHost"></div>'},sideW(){return 66},mini:drawMini};
function itemKey(B,k,down){
  if(k==='Shift'){B.raising=down;const rb=U().$('#bRaise');if(rb)rb.classList.toggle('on',down);return true}
  if(!down)return false;
  if(k==='v'||k==='V'){if(B.rack.length)B.fire(0);return true}
  if('123'.includes(k)&&k.length===1){B.fire(+k-1);return true}
  return false;
}
function keyMove(B,k){
  const d={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0],q:[-1,-1],Q:[-1,-1],e:[-1,1],E:[-1,1],z:[1,-1],Z:[1,-1],c:[1,1],C:[1,1]}[k];
  if(!d)return false;kb.on=true;kb.r=Math.max(0,Math.min(GH-1,kb.r+d[0]));kb.c=Math.max(0,Math.min(GW-1,kb.c+d[1]));return true;
}

// ---------------- Noodle Slurp ----------------
let sl=null;
(window.FF_MODES=window.FF_MODES||{}).slurp={
  info:{how:'Drag through 3 or more touching foods of a kind (diagonals count). Longer chains dump more trash. Hold Raise for more food.',name:'Noodle Slurp',tag:'Drag a chain',sizes:['Duel','Brawl','Big Brawl'],blurb:'drag through 3+ matching foods, long chains dump trash'},
  ...SIDE,
  icon(x){const F=U();[[16,40],[44,18],[72,40]].forEach(([a,b])=>F.drawTile(x,{t:1,clr:0},a,b,26,1,0));
    x.lineCap='round';x.lineJoin='round';x.strokeStyle='#0B0D1B';x.lineWidth=11;x.beginPath();x.moveTo(29,53);x.lineTo(57,31);x.lineTo(85,53);x.stroke();
    x.strokeStyle='#F2D27A';x.lineWidth=7;x.stroke();x.strokeStyle='rgba(255,255,255,.6)';x.lineWidth=2;x.stroke()},
  render(){
    const F=U(),G=F.G,B=F.spec||G.player,S=F.S,ctx=F.ctx,mine=B===G.player;
    drawRise(B,(ro,cs)=>{
      if(!mine||B.remote||!B.pathCells)return;
      const cells=B.pathCells();if(!cells.length)return;const S=cs;
      const col=F.PAL.c[B.ptype]||'#F2D27A',pts=cells.map(([r,c])=>[c*S+S/2,r*S+S/2-ro]);
      // the noodle: a thick slurpy line through the chain, outlined, with a shine
      cells.forEach(([r,c])=>{ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=3;F.rr(ctx,c*S+3,r*S-ro+3,S-6,S-6,S*.22);ctx.stroke()});
      ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
      if(pts.length===1)ctx.lineTo(pts[0][0]+.1,pts[0][1]);
      ctx.strokeStyle='#0B0D1B';ctx.lineWidth=S*.34;ctx.stroke();ctx.strokeStyle=col;ctx.lineWidth=S*.24;ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=S*.06;ctx.stroke();
      const [lx,ly]=pts[pts.length-1],n=cells.length,ok=n>=3;
      ctx.fillStyle=ok?'#F7C548':'rgba(11,13,27,.85)';ctx.beginPath();ctx.arc(lx+S*.32,ly-S*.32,S*.27,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=ok?'#2A1E05':'#EEF0FA';ctx.font=`900 ${Math.round(S*.3)}px Figtree,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n,lx+S*.32,ly-S*.3);
    });
  },
  stat(B){return [B.longest|0,'Longest']},
  down(e,p){const B=U().G.player;const [r,c]=cellAt(B,p);kb.on=false;sl={id:e.pointerId,x:p.x,y:p.y};B.start(r,c)},
  move(e,p){
    const B=U().G.player,S=cellPx();if(!sl||e.pointerId!==sl.id||!B.path.length)return;
    // walk from the last point to this one in small steps so fast swipes don't skip cells
    const n=Math.max(1,Math.ceil(Math.hypot(p.x-sl.x,p.y-sl.y)/(S*.2)));
    for(let i=1;i<=n;i++){const x=sl.x+(p.x-sl.x)*i/n,y=sl.y+(p.y-sl.y)*i/n,ro=riseOf(B)*S;
      const r=Math.floor((y+ro)/S),c=Math.floor(x/S),cx=c*S+S/2,cy=r*S+S/2-ro;
      if(Math.hypot(x-cx,y-cy)<S*.4)B.extend(r,c)}
    sl.x=p.x;sl.y=p.y;
  },
  up(e,p){if(!sl||(e&&e.pointerId!==sl.id))return;sl=null;const B=U().G.player;if(B.path.length)B.finish()},
  key(k,down){
    const B=U().G.player;if(itemKey(B,k,down))return true;if(!down)return false;
    if(k===' '||k==='Enter'){kb.on=true;if(B.path.length)B.finish();else B.start(kb.r,kb.c);return true}
    if(k==='Backspace'||k==='x'||k==='X'){B.cancel();return true}
    if(keyMove(B,k)){if(B.path.length)B.extend(kb.r,kb.c);return true}
    return false;
  },
};

// ---------------- Buffet Grab ----------------
(window.FF_MODES=window.FF_MODES||{}).buffet={
  info:{how:'Tap a group of 2 or more touching foods of a kind. Bigger groups dump more trash. Hold Raise for more food.',name:'Buffet Grab',tag:'Tap a group',sizes:['Duel','Brawl','Big Brawl'],blurb:'tap groups of matching food, big plates dump trash'},
  ...SIDE,
  icon(x){const F=U();[[26,14],[52,14],[26,40],[52,40]].forEach(([a,b])=>F.drawTile(x,{t:3,clr:0},a,b,26,1,0));F.drawTile(x,{t:0,clr:0},78,40,26,1,0);
    x.strokeStyle='#F7C548';x.lineWidth=3;x.beginPath();x.arc(66,40,10,0,Math.PI*2);x.stroke();x.beginPath();x.arc(66,40,17,0,Math.PI*2);x.globalAlpha=.5;x.stroke();x.globalAlpha=1},
  render(){
    const F=U(),G=F.G,B=F.spec||G.player,S=F.S,ctx=F.ctx,mine=B===G.player;
    drawRise(B,(ro,cs)=>{
      // the group under your finger / mouse lights up, with its size
      if(!mine||B.remote||!B.hover)return;const S=cs;
      const [r,c]=B.hover,gr=B.group(r,c);if(gr.length<2)return;
      const has=(a,b)=>gr.some(x=>x[0]===a&&x[1]===b);
      ctx.fillStyle='rgba(255,255,255,.16)';gr.forEach(([a,b])=>ctx.fillRect(b*S,a*S-ro,S,S));
      ctx.strokeStyle='#FFFFFF';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();
      gr.forEach(([a,b])=>{const x=b*S,y=a*S-ro;if(!has(a-1,b)){ctx.moveTo(x,y);ctx.lineTo(x+S,y)}if(!has(a+1,b)){ctx.moveTo(x,y+S);ctx.lineTo(x+S,y+S)}if(!has(a,b-1)){ctx.moveTo(x,y);ctx.lineTo(x,y+S)}if(!has(a,b+1)){ctx.moveTo(x+S,y);ctx.lineTo(x+S,y+S)}});ctx.stroke();
      const top=gr.reduce((m,x)=>x[0]<m[0]||(x[0]===m[0]&&x[1]<m[1])?x:m),bx=top[1]*S+S*.5,by=top[0]*S-ro;
      ctx.fillStyle='#F7C548';ctx.beginPath();ctx.arc(bx,by,S*.26,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#2A1E05';ctx.font=`900 ${Math.round(S*.3)}px Figtree,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(gr.length,bx,by+1);
    });
  },
  stat(B){return [B.biggest|0,'Biggest']},
  down(e,p){const B=U().G.player;const [r,c]=cellAt(B,p);kb.on=false;B.hover=null;B.grab(r,c)},
  move(e,p){const B=U().G.player;if(e.pointerType==='mouse'){const [r,c]=cellAt(B,p);B.hover=[r,c]}},
  up(){},
  key(k,down){
    const B=U().G.player;if(itemKey(B,k,down))return true;if(!down)return false;
    if(k===' '||k==='Enter'){kb.on=true;B.grab(kb.r,kb.c);B.hover=[kb.r,kb.c];return true}
    if(keyMove(B,k)){B.hover=[kb.r,kb.c];return true}
    return false;
  },
};
})();
