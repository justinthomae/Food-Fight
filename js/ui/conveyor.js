// Conveyor Belt screen: the belt snaking down the board, the line of food on it, the trash can at the end,
// and your fighter at the bottom throwing. Drag on the board to aim, let go to throw; tap the next food to swap.
(function(){
const U=()=>window.FFUI;
const GEO=()=>window.FFEngine&&FFEngine.BOARD_TYPES.conveyor?FFEngine.BOARD_TYPES.conveyor.GEO:null;
let drag=null;
// the line, from either a local board or a remote snapshot: [{t,s}] front first
function lineOf(B){
  const Q=GEO();
  if(!B.remote)return B.line.map(b=>({t:b.t,s:b.vs,ins:b.ins}));
  const m=B.ms;if(!m||typeof m.l!=='string')return [];
  const n=m.l.length,f=+m.f||0;return [...m.l].map((ch,i)=>({t:ch==='j'?-1:+ch,s:f+(n-1-i)*Q.D,ins:0}));
}
function stateOf(B){
  if(!B.remote)return {cur:B.cur,next:B.next,aim:B.aimA,ball:B.ball,belt:B.belt,head:B.head()};
  const m=B.ms||{},Q=GEO(),n=(m.l||'').length;
  return {cur:m.u|0,next:m.n|0,aim:Number.isFinite(+m.a)?+m.a:-Math.PI/2,ball:Array.isArray(m.b)?{x:+m.b[0],y:+m.b[1],t:m.b[2]|0}:null,belt:+m.bt||0,head:(+m.f||0)+(n-1)*Q.D};
}
function beltPath(c,Q,u,step){c.beginPath();for(let s=-.7;s<=Q.L;s+=step){const [x,y]=Q.at(s);s===-.7?c.moveTo(x*u,y*u):c.lineTo(x*u,y*u)}const e=Q.at(Q.L);c.lineTo(e[0]*u,e[1]*u)}
// a little trash can (lid lifts and the can shakes when the line is close)
function drawCan(c,x,y,s,danger,f){
  const wob=danger>0?Math.sin(f*.6)*s*.04*danger:0;c.save();c.translate(x+wob,y);
  c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.ellipse(0,s*.52,s*.42,s*.1,0,0,Math.PI*2);c.fill();
  c.fillStyle=danger>.5?'#8A4A4A':'#6B7080';c.beginPath();c.moveTo(-s*.36,-s*.22);c.lineTo(s*.36,-s*.22);c.lineTo(s*.29,s*.5);c.lineTo(-s*.29,s*.5);c.closePath();c.fill();
  c.strokeStyle='rgba(0,0,0,.28)';c.lineWidth=Math.max(1,s*.05);[-.14,0,.14].forEach(k=>{c.beginPath();c.moveTo(k*s,-s*.12);c.lineTo(k*s*.85,s*.42);c.stroke()});
  const lift=danger*s*.18;c.save();c.translate(0,-s*.24-lift);c.rotate(-danger*.35);
  c.fillStyle='#9AA3BC';U().rr(c,-s*.42,-s*.08,s*.84,s*.12,s*.05);c.fill();c.fillRect(-s*.09,-s*.15,s*.18,s*.08);c.restore();
  c.restore();
}
function drawFood(c,t,x,y,d,a,f){
  const F=U();c.globalAlpha=a==null?1:a;
  c.fillStyle='rgba(11,13,27,.45)';c.beginPath();c.arc(x,y+d*.05,d*.5,0,Math.PI*2);c.fill();c.globalAlpha=1;
  F.drawTile(c,{t,clr:0},x-d/2,y-d/2,d,a==null?1:a,f);
}
(window.FF_MODES=window.FF_MODES||{}).conveyor={
  info:{how:'Aim and throw food into the line on the belt. Match 3 to pop them before the line reaches the trash can.',name:'Conveyor Belt',tag:'Aim and match 3',sizes:['Duel','Brawl','Big Brawl'],hidden:true,blurb:'throw food into the line, match 3 before it hits the trash can'},
  noTray:true,noRaise:true,noFooter:true,
  icon(x){
    const F=U();x.lineCap='round';x.strokeStyle='#3A3550';x.lineWidth=22;x.beginPath();x.moveTo(10,30);x.lineTo(84,30);x.arc(84,46,16,-Math.PI/2,Math.PI/2);x.lineTo(40,62);x.stroke();
    x.strokeStyle='#5A5474';x.lineWidth=2;for(let i=0;i<6;i++){x.beginPath();x.moveTo(16+i*13,21);x.lineTo(16+i*13,39);x.stroke()}
    [[22,0],[42,0],[62,2]].forEach(([px,t])=>F.drawTile(x,{t,clr:0},px-10,20,20,1,0));
    F.drawTile(x,{t:2,clr:0},74,52,20,1,0);
    x.strokeStyle='#F7C548';x.lineWidth=3;x.beginPath();x.moveTo(50,62);x.lineTo(30,62);x.moveTo(36,56);x.lineTo(30,62);x.lineTo(36,68);x.stroke();
  },
  render(){
    const F=U(),Q=GEO();if(!Q)return;
    const ctx=F.ctx,S=F.S,G=F.G,B=F.spec||G.player,mine=B===G.player,W=S*F.COLS,H=S*F.ROWS,f=G.frame,u=S;
    const st=stateOf(B),line=lineOf(B),danger=Math.max(0,Math.min(1,(st.head-(Q.L-8))/8));
    F.checker(0);
    // the belt: a dark rubber band with lighter rails, rollers sliding along with it
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    beltPath(ctx,Q,u,.2);ctx.strokeStyle='#2B2740';ctx.lineWidth=u*1.04;ctx.stroke();
    ctx.strokeStyle='#3A3550';ctx.lineWidth=u*.86;ctx.stroke();
    const ph=((st.belt+(!B.remote&&!G.paused&&!B.dead?B.speed()*F.ALPHA:0))%.5+.5)%.5;
    ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=Math.max(1,u*.05);ctx.beginPath();
    for(let s=ph;s<Q.L;s+=.5){const [x,y]=Q.at(s),[x2,y2]=Q.at(s+.02),dx=x2-x,dy=y2-y,n=Math.hypot(dx,dy)||1,nx=-dy/n*.38,ny=dx/n*.38;ctx.moveTo((x+nx)*u,(y+ny)*u);ctx.lineTo((x-nx)*u,(y-ny)*u)}
    ctx.stroke();
    // the last stretch glows red as the line gets close to the can
    if(danger>0){ctx.save();ctx.beginPath();for(let s=Q.L-4;s<=Q.L;s+=.2){const [x,y]=Q.at(s);s===Q.L-4?ctx.moveTo(x*u,y*u):ctx.lineTo(x*u,y*u)}
      ctx.strokeStyle=`rgba(229,72,77,${.18+.22*danger+.12*Math.sin(f*.3)})`;ctx.lineWidth=u*.9;ctx.stroke();ctx.restore()}
    ctx.restore();
    // entrance chute at the top left
    ctx.fillStyle='#4A4466';F.rr(ctx,-u*.2,Q.LANES[0]*u-u*.6,u*.55,u*1.2,u*.15);ctx.fill();
    const end=Q.at(Q.L);drawCan(ctx,(end[0]+.62)*u,end[1]*u,u*1.15,danger,f);
    // the line
    const sh=B.shake?Math.sin(B.shake*2)*u*.05:0,d=Q.BR*2*u,dim=B.dead?.45:1;
    for(let i=line.length-1;i>=0;i--){const b=line[i];if(b.s<-.6)continue;const [x,y]=Q.at(b.s),k=b.ins?1+b.ins*.03:1;drawFood(ctx,b.t,x*u,y*u+sh,d*k,dim,f)}
    if(!B.remote)(B.popping||[]).forEach(p=>{const k=p.life/16;drawFood(ctx,p.t,p.x*u,p.y*u,d*(1+(1-k)*.5),k,f)});
    // aim guide in the colour of the food you're throwing, to where it joins the line
    const col=st.cur>=0&&F.PAL.c[st.cur]?F.PAL.c[st.cur]:'#EEF0FA';
    if(!B.dead&&!st.ball){
      let tx,ty;
      if(!B.remote){const h=B.trace(st.aim);if(h){tx=h.x;ty=h.y}}
      if(tx==null){tx=Q.SX+Math.cos(st.aim)*(B.remote?2.2:11);ty=Q.SY+Math.sin(st.aim)*(B.remote?2.2:11)}
      ctx.save();ctx.setLineDash([2,S*.22]);ctx.lineCap='round';
      ctx.lineWidth=Math.max(3,S*.1);ctx.strokeStyle='rgba(11,13,27,.6)';ctx.beginPath();ctx.moveTo(Q.SX*u,Q.SY*u);ctx.lineTo(tx*u,ty*u);ctx.stroke();
      ctx.lineWidth=Math.max(2,S*.07);ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(Q.SX*u,Q.SY*u);ctx.lineTo(tx*u,ty*u);ctx.stroke();ctx.restore();
      if(!B.remote&&B.trace(st.aim)){ctx.strokeStyle='#FFFFFF';ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx*u,ty*u,Q.BR*u*.8,0,Math.PI*2);ctx.stroke()}
    }
    // the throw in flight
    if(st.ball){const b=st.ball,a=mine&&!B.remote?F.ALPHA:0;drawFood(ctx,b.t,(b.x+(b.vx||0)*a)*u,(b.y+(b.vy||0)*a)*u,d,1,f)}
    // your fighter at the bottom, holding the next throw over their head
    const im=F.fighterImg(B.av||'bun'),fh=u*1.55;
    if(im&&im.complete&&im.naturalWidth){const fw=fh*im.naturalWidth/im.naturalHeight;ctx.globalAlpha=dim;ctx.drawImage(im,Q.SX*u-fw/2,H-fh-u*.02,fw,fh);ctx.globalAlpha=1}
    if(!B.dead){
      const big=d*1.12;ctx.fillStyle='rgba(11,13,27,.6)';ctx.beginPath();ctx.arc(Q.SX*u,Q.SY*u,big*.66,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(3,S*.09);ctx.beginPath();ctx.arc(Q.SX*u,Q.SY*u,big*.66,0,Math.PI*2);ctx.stroke();
      F.drawTile(ctx,{t:st.cur,clr:0},Q.SX*u-big/2,Q.SY*u-big/2,big,1,f);
      // next food on the right: tap it to swap
      const nx=(Q.SX+1.75)*u,ny=(Q.SY+.75)*u,ns=d*.86;
      ctx.fillStyle='rgba(11,13,27,.55)';ctx.beginPath();ctx.arc(nx,ny,ns*.68,0,Math.PI*2);ctx.fill();
      F.drawTile(ctx,{t:st.next,clr:0},nx-ns/2,ny-ns/2,ns,.95,f);
      ctx.fillStyle='rgba(148,155,189,.95)';ctx.font=`800 ${Math.round(S*.2)}px Figtree,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(mine?'NEXT · TAP':'NEXT',nx,ny+ns*.86);
    }
    // trash on its way: a pill bottom-left (the top-left is the belt entrance)
    const inc=B.remote?(B.minc|0):B.incoming();
    if(inc>0&&!B.dead){
      const soon=!B.remote&&B.inc.some(i=>i.t<70),t=`TRASH +${inc}`;ctx.font=`800 ${Math.round(S*.28)}px Figtree,sans-serif`;
      const tw=ctx.measureText(t).width+S*.5,y=H-S*.72;ctx.fillStyle=soon?`rgba(229,104,42,${.8+.2*Math.sin(f*.5)})`:'rgba(11,13,27,.82)';F.rr(ctx,S*.12,y,tw,S*.5,S*.25);ctx.fill();
      ctx.fillStyle='#EEF0FA';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(t,S*.37,y+S*.26);
    }
    if(mine&&B.burstT>0){ctx.fillStyle=`rgba(229,104,42,${.75+.25*Math.sin(f*.4)})`;ctx.font=`800 ${Math.round(S*.26)}px Figtree,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('BELT RUSH!',S*.2,H-S*1.05)}
    // desktop: the keys, small, in the empty corner
    if(mine&&F.DESK.matches&&!B.dead){ctx.fillStyle='rgba(148,155,189,.75)';ctx.font=`700 ${Math.round(S*.2)}px Figtree,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
      ['← → aim','Space throw','C swap'].forEach((t,i)=>ctx.fillText(t,S*.2,H-S*(2.1-i*.3)))}
    if(!B.remote)F.drawFxLayer(B,0);
    if(B.dead&&G.playerOut&&!G.over)F.drawKO(B,W,H);
  },
  mini(c,b,w,h,s){
    const F=U(),Q=GEO();if(!Q)return;
    c.save();c.lineCap='round';c.lineJoin='round';beltPath(c,Q,s,.3);c.strokeStyle='#3A3550';c.lineWidth=s*.8;c.stroke();c.restore();
    const line=lineOf(b);
    line.forEach(x=>{if(x.s<-.4)return;const [px,py]=Q.at(x.s);c.fillStyle=x.t<0?'#6B7080':F.PAL.c[x.t];c.beginPath();c.arc(px*s,py*s,s*.34,0,Math.PI*2);c.fill()});
    const e=Q.at(Q.L),hd=line.length?line[0].s:0;c.fillStyle=hd>Q.L-6?'#E5484D':'#9AA3BC';c.fillRect((e[0]+.35)*s,(e[1]-.35)*s,s*.6,s*.7);
    if(b.dead)F.miniKO(c,w,h);
  },
  stat(B){return [B.maxChain,'Best chain']},
  meta(b,h){return h>=10?['Danger!','line near the can']:null},
  endLine(res,B){return null},
  down(e,p){
    const F=U(),Q=GEO(),S=F.S,B=F.G.player,x=p.x/S,y=p.y/S;
    if(Math.hypot(x-(Q.SX+1.75),y-(Q.SY+.75))<.6){B.swap();drag=null;return}
    drag={id:e.pointerId};if(y<Q.SY-.2)B.aimAt(x,y);
  },
  move(e,p){if(!drag||e.pointerId!==drag.id)return;const F=U(),Q=GEO(),x=p.x/F.S,y=p.y/F.S;if(y<Q.SY-.2)F.G.player.aimAt(x,y)},
  up(e,p){
    if(!drag||(e&&e.pointerId!==drag.id))return;drag=null;if(!p)return;
    const F=U(),Q=GEO();if(p.y/F.S>Q.SY+.3)return;   // let go down by your fighter to cancel
    F.G.player.shoot();
  },
  key(k,down){
    if(!down)return false;const B=U().G.player;
    if(k==='ArrowLeft')B.setAim(B.aimA-.045);else if(k==='ArrowRight')B.setAim(B.aimA+.045);
    else if(k===' '||k==='ArrowUp'||k==='Enter')B.shoot();
    else if(k==='c'||k==='C'||k==='x'||k==='X'||k==='ArrowDown'||k==='Shift')B.swap();
    else return false;
    return true;
  },
};
})();
