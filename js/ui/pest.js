// Pest Control screen: a picnic blanket, six plates along the bottom, cartoon pests to swat.
(function(){
const U=()=>window.FFUI;
const PT=()=>window.FFEngine&&FFEngine.BOARD_TYPES.pest;
const PLATE='#F4F1EA',RIM='#CFC6B4',INK='#2B1B14',ANTC='#B4472A';
let hover=null;   // where the mouse is (desktop): a swatter follows it

// ---------- critters, drawn facing +x in units of u (one board cell) ----------
function ant(c,u,t){
  c.strokeStyle=ANTC;c.lineWidth=Math.max(1,u*.035);c.lineCap='round';
  const k=Math.sin(t*.45)*.05;
  for(let i=-1;i<=1;i++){const lx=i*.07*u;[1,-1].forEach(s=>{const sw=(i%2?k:-k)*s;c.beginPath();c.moveTo(lx,0);c.lineTo(lx+(.04+sw)*u,s*.12*u);c.lineTo(lx+(.02+sw*1.6)*u,s*.2*u);c.stroke()})}
  c.fillStyle=ANTC;c.strokeStyle='rgba(255,226,200,.75)';c.lineWidth=Math.max(1,u*.022);
  c.beginPath();c.ellipse(-.17*u,0,.13*u,.1*u,0,0,Math.PI*2);c.fill();c.stroke();
  c.beginPath();c.ellipse(0,0,.08*u,.06*u,0,0,Math.PI*2);c.fill();c.stroke();
  c.beginPath();c.arc(.13*u,0,.07*u,0,Math.PI*2);c.fill();c.stroke();
  c.strokeStyle=ANTC;c.lineWidth=Math.max(1,u*.03);c.beginPath();c.moveTo(.17*u,-.03*u);c.quadraticCurveTo(.26*u,-.1*u,.3*u,-.12*u);c.moveTo(.17*u,.03*u);c.quadraticCurveTo(.26*u,.1*u,.3*u,.12*u);c.stroke();
  c.fillStyle='rgba(255,255,255,.35)';c.beginPath();c.ellipse(-.2*u,-.04*u,.05*u,.03*u,0,0,Math.PI*2);c.fill();
}
function fly(c,u,t){
  // shadow on the blanket: it's in the air
  c.fillStyle='rgba(0,0,0,.16)';c.beginPath();c.ellipse(.03*u,.2*u,.15*u,.06*u,0,0,Math.PI*2);c.fill();
  const f=.55+.45*Math.abs(Math.sin(t*.9));
  c.fillStyle='rgba(215,232,255,.75)';c.strokeStyle='rgba(120,140,170,.8)';c.lineWidth=Math.max(1,u*.02);
  [1,-1].forEach(s=>{c.save();c.rotate(s*(.5+.4*(1-f)));c.beginPath();c.ellipse(-.12*u,s*.09*u,.17*u,.08*u*f,0,0,Math.PI*2);c.fill();c.stroke();c.restore()});
  c.fillStyle='#2F3A4A';c.strokeStyle='rgba(215,232,255,.8)';c.lineWidth=Math.max(1,u*.022);c.beginPath();c.ellipse(-.03*u,0,.15*u,.1*u,0,0,Math.PI*2);c.fill();c.stroke();
  c.strokeStyle='#56657A';c.lineWidth=Math.max(1,u*.025);[-.09,-.03].forEach(x=>{c.beginPath();c.moveTo(x*u,-.08*u);c.lineTo(x*u,.08*u);c.stroke()});
  c.fillStyle='#2F3A4A';c.beginPath();c.arc(.13*u,0,.07*u,0,Math.PI*2);c.fill();c.stroke();
  c.fillStyle='#E5484D';[1,-1].forEach(s=>{c.beginPath();c.arc(.16*u,s*.05*u,.045*u,0,Math.PI*2);c.fill()});
  c.fillStyle='rgba(255,255,255,.8)';[1,-1].forEach(s=>{c.beginPath();c.arc(.175*u,s*.05*u-.015*u,.014*u,0,Math.PI*2);c.fill()});
}
function mouse(c,u,t,dazed){
  const w=Math.sin(t*.3)*.08;
  c.strokeStyle='#E7A3AE';c.lineWidth=Math.max(1.5,u*.045);c.lineCap='round';
  c.beginPath();c.moveTo(-.28*u,0);c.bezierCurveTo(-.45*u,(.12+w)*u,-.5*u,(-.1-w)*u,-.62*u,(.05+w)*u);c.stroke();
  c.fillStyle='#A3A3B0';c.strokeStyle='#6E6E7C';c.lineWidth=Math.max(1,u*.03);
  c.beginPath();c.ellipse(-.04*u,0,.28*u,.19*u,0,0,Math.PI*2);c.fill();c.stroke();
  c.beginPath();c.ellipse(.24*u,0,.14*u,.12*u,0,0,Math.PI*2);c.fill();c.stroke();
  [1,-1].forEach(s=>{c.fillStyle='#A3A3B0';c.beginPath();c.arc(.17*u,s*.13*u,.08*u,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#F2B8C2';c.beginPath();c.arc(.17*u,s*.13*u,.045*u,0,Math.PI*2);c.fill()});
  c.fillStyle='#F28BA0';c.beginPath();c.arc(.38*u,0,.035*u,0,Math.PI*2);c.fill();
  c.fillStyle=INK;[1,-1].forEach(s=>{c.beginPath();c.arc(.28*u,s*.055*u,.025*u,0,Math.PI*2);c.fill()});
  c.strokeStyle='rgba(43,27,20,.5)';c.lineWidth=Math.max(1,u*.012);[1,-1].forEach(s=>{c.beginPath();c.moveTo(.34*u,s*.02*u);c.lineTo(.46*u,s*.08*u);c.moveTo(.34*u,s*.03*u);c.lineTo(.45*u,s*.12*u);c.stroke()});
  if(dazed){c.fillStyle='#F7C548';for(let i=0;i<3;i++){const a=t*.2+i*2.1;star(c,.24*u+Math.cos(a)*.2*u,Math.sin(a)*.2*u,.06*u)}}
}
function star(c,x,y,r){c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr2=i%2?r*.45:r;c.lineTo(x+Math.cos(a)*rr2,y+Math.sin(a)*rr2)}c.closePath();c.fill()}
// the cat walks across side-on (flipped by direction); dir is +1 right, -1 left
function cat(c,u,t,hiss){
  const b=Math.sin(t*.2)*.03*u,leg=Math.sin(t*.2)*.08*u;
  c.fillStyle='rgba(0,0,0,.15)';c.beginPath();c.ellipse(0,.36*u,.55*u,.08*u,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#B5641F';c.lineWidth=Math.max(1,u*.03);c.lineCap='round';c.lineJoin='round';
  // tail
  c.strokeStyle='#E8913A';c.lineWidth=u*.09;c.beginPath();c.moveTo(-.4*u,-.02*u+b);c.quadraticCurveTo(-.7*u,-.2*u,-.62*u,(-.5+Math.sin(t*.08)*.06)*u);c.stroke();
  c.strokeStyle='#B5641F';c.lineWidth=Math.max(1,u*.03);
  // legs
  c.fillStyle='#E8913A';[[-.3,leg],[-.18,-leg],[.2,-leg],[.32,leg]].forEach(([x,d])=>{rr(c,(x-.05)*u+d*.5,.05*u+b,.1*u,.28*u,.05*u);c.fill();c.stroke()});
  // body
  c.beginPath();c.ellipse(0,0+b,.45*u,(hiss?.27:.22)*u,0,0,Math.PI*2);c.fill();c.stroke();
  c.strokeStyle='#C0621E';c.lineWidth=u*.04;[-.22,-.06,.1].forEach(x=>{c.beginPath();c.moveTo(x*u,-.2*u+b);c.quadraticCurveTo((x+.05)*u,-.08*u+b,x*u,0+b);c.stroke()});
  // head
  const hx=.45*u,hy=-.18*u+b;c.fillStyle='#E8913A';c.strokeStyle='#B5641F';c.lineWidth=Math.max(1,u*.03);
  [[-.15,-.12],[.1,-.16]].forEach(([dx,dy])=>{c.beginPath();c.moveTo(hx+dx*u,hy-.08*u);c.lineTo(hx+(dx+.04)*u,hy+dy*u-.14*u);c.lineTo(hx+(dx+.13)*u,hy-.1*u);c.closePath();c.fill();c.stroke()});
  c.beginPath();c.arc(hx,hy,.22*u,0,Math.PI*2);c.fill();c.stroke();
  c.fillStyle='#FFF3E4';c.beginPath();c.ellipse(hx+.08*u,hy+.08*u,.12*u,.08*u,0,0,Math.PI*2);c.fill();
  // face
  c.fillStyle=hiss?'#E5484D':'#4F8A2E';[-.02,.12].forEach(dx=>{c.beginPath();c.ellipse(hx+dx*u,hy-.03*u,.035*u,hiss?.02*u:.045*u,0,0,Math.PI*2);c.fill()});
  c.fillStyle=INK;[-.02,.12].forEach(dx=>{c.fillRect(hx+dx*u-.007*u,hy-.06*u,.014*u,.06*u)});
  c.fillStyle='#F28BA0';c.beginPath();c.arc(hx+.08*u,hy+.04*u,.025*u,0,Math.PI*2);c.fill();
  if(hiss){c.fillStyle='#6B1E1E';c.beginPath();c.ellipse(hx+.08*u,hy+.12*u,.05*u,.035*u,0,0,Math.PI*2);c.fill()}
  c.strokeStyle='rgba(43,27,20,.55)';c.lineWidth=Math.max(1,u*.012);[[.18,.0],[.18,.06]].forEach(([dx,dy])=>{c.beginPath();c.moveTo(hx+dx*u,hy+dy*u);c.lineTo(hx+(dx+.17)*u,hy+(dy-.02)*u);c.stroke()});
}
const rr=(c,x,y,w,h,r)=>U().rr(c,x,y,w,h,r);
// one critter at board position (x,y), heading angle a
function critter(c,k,x,y,a,u,t,p){
  c.save();c.translate(x,y);
  {const r=u*(k>=3?.8:k===2?.55:.42),g=c.createRadialGradient&&c.createRadialGradient(0,0,0,0,0,r);if(g){g.addColorStop(0,'rgba(255,246,232,.22)');g.addColorStop(1,'rgba(255,246,232,0)');c.fillStyle=g}else c.fillStyle='rgba(255,246,232,.1)';c.fillRect(-r,-r,r*2,r*2)}
  if(k===3||k===4){const dir=k===4?-1:1;c.scale(dir,1);cat(c,u*1.05,t,p&&p.hissT>0)}
  else{c.rotate(a);if(k===0)ant(c,u*1.15,t);else if(k===1)fly(c,u*1.25,t);else mouse(c,u,t,p&&p.daze>0)}
  c.restore();
}
// the fly swatter: a mesh head on a handle, pointing up-left from the hand
function swatter(c,x,y,u,alpha,tilt){
  c.save();c.globalAlpha=alpha;c.translate(x,y);c.rotate(tilt||-.5);
  c.strokeStyle='#2E7D5B';c.lineWidth=u*.08;c.lineCap='round';c.beginPath();c.moveTo(0,.25*u);c.lineTo(0,1.1*u);c.stroke();
  c.fillStyle='rgba(66,181,128,.85)';c.strokeStyle='#2E7D5B';c.lineWidth=u*.05;rr(c,-.3*u,-.32*u,.6*u,.58*u,.14*u);c.fill();c.stroke();
  c.strokeStyle='rgba(30,90,64,.6)';c.lineWidth=Math.max(1,u*.02);c.beginPath();
  for(let i=1;i<5;i++){c.moveTo(-.3*u+i*.12*u,-.3*u);c.lineTo(-.3*u+i*.12*u,.24*u);c.moveTo(-.28*u,-.32*u+i*.115*u);c.lineTo(.28*u,-.32*u+i*.115*u)}c.stroke();
  c.restore();
}
// picnic blanket: soft red gingham over the board colour
function blanket(c,W,H,u){
  const F=U();c.fillStyle=F.TOK.well;c.fillRect(0,0,W,H);
  c.fillStyle='rgba(229,72,77,.10)';const b=u/2;
  for(let x=0;x<W;x+=b*2)c.fillRect(x,0,b,H);
  for(let y=0;y<H;y+=b*2)c.fillRect(0,y,W,b);
}
// one plate with however much food is left on it
function plate(c,cx,cy,u,t,bites,max,danger,frame){
  const R=u*.46;
  c.fillStyle='rgba(0,0,0,.18)';c.beginPath();c.ellipse(cx,cy+u*.06,R,R*.92,0,0,Math.PI*2);c.fill();
  c.fillStyle=bites?PLATE:'rgba(244,241,234,.35)';c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.fill();
  c.strokeStyle=danger?`rgba(229,72,77,${.6+.4*Math.sin(frame*.3)})`:RIM;c.lineWidth=danger?Math.max(2,u*.08):Math.max(1,u*.04);c.stroke();
  c.strokeStyle='rgba(207,198,180,.7)';c.lineWidth=Math.max(1,u*.02);c.beginPath();c.arc(cx,cy,R*.72,0,Math.PI*2);c.stroke();
  if(!bites){c.fillStyle='rgba(184,115,47,.5)';[[-.15,.05],[.1,-.12],[.18,.14],[-.05,-.18]].forEach(([dx,dy])=>{c.beginPath();c.arc(cx+dx*u,cy+dy*u,u*.03,0,Math.PI*2);c.fill()});return}
  const s=u*.74,fr=u*.34;
  c.save();c.beginPath();c.arc(cx,cy,fr,0,Math.PI*2);c.clip();
  U().drawTile(c,{t,clr:0},cx-s/2,cy-s/2,s,1,frame);
  // bite marks: big scallops out of the food's edge, one per missing bite
  c.fillStyle=PLATE;const spots=[-.75,2.2,.75];
  for(let i=0;i<max-bites;i++){const a=spots[i],bx=cx+Math.cos(a)*fr,by=cy+Math.sin(a)*fr;[[0,.21],[.55,.13],[-.55,.13]].forEach(([da,r])=>{c.beginPath();c.arc(bx+Math.cos(a+Math.PI/2)*da*fr*.55,by+Math.sin(a+Math.PI/2)*da*fr*.55,r*u,0,Math.PI*2);c.fill()})}
  c.restore();
  c.strokeStyle='rgba(43,27,20,.12)';c.lineWidth=Math.max(1,u*.02);c.beginPath();c.arc(cx,cy,fr,0,Math.PI*2);c.stroke();
}
function pestsOf(B){
  if(!B.remote)return B.pests.map(p=>{const a=U().ALPHA,x=p.px+(p.x-p.px)*a,y=p.py+(p.y-p.py)*a;return {k:p.k===3&&p.dir<0?4:p.k,x,y,a:Math.atan2(p.vy||1,p.vx||0),t:p.t+a,p}});
  return ((B.ms&&B.ms.p)||[]).map((q,i)=>({k:q[0],x:q[1],y:q[2],a:Math.PI/2,t:(U().G.frame+i*7)}));
}
function bitesOf(B){if(!B.remote)return B.bites;const s=B.ms&&B.ms.b;return s?s.split('').map(Number):[3,3,3,3,3,3]}

(window.FF_MODES=window.FF_MODES||{}).pest={
  info:{how:'Tap the pests before they eat your plates. Quick streaks send pests to rivals. Don’t swat the cat!',name:'Pest Control',tag:'Swat the bugs',sizes:['Duel','Brawl','Big Brawl'],blurb:'swat the pests before they eat your picnic, but leave the cat alone'},
  noTray:true,noRaise:true,noFooter:true,
  icon(x){
    const u=40;plate(x,56,54,u,0,3,3,false,0);
    x.save();x.translate(60,22);x.rotate(.5);fly(x,u*1.2,6);x.restore();
    swatter(x,92,30,26,1,.6);
  },
  render(){
    const F=U(),c=F.ctx,S=F.S,G=F.G,B=F.spec||G.player,mine=B===G.player,W=S*F.COLS,H=S*F.ROWS,f=G.frame,K=PT();if(!K)return;
    blanket(c,W,H,S);
    const sh=B.shake?Math.sin(B.shake*2)*S*.05:0;c.save();c.translate(sh,0);
    const bites=bitesOf(B),ps=pestsOf(B),PY=K.PLATE_Y;
    // plates under threat pulse red: something is within two cells of them
    const near=new Array(6).fill(false);ps.forEach(p=>{if(p.k<3)for(let i=0;i<6;i++)if(Math.hypot(p.x-(i+.5),p.y-PY)<2)near[i]=true});
    for(let i=0;i<6;i++)plate(c,(i+.5)*S,PY*S,S,i%5,bites[i],K.BITES,near[i]&&bites[i]>0,f);
    // swat marks: a green splat where something got squished, a faint ring for a miss
    if(!B.remote)B.marks.forEach(m=>{const a=m.life/30,x=m.x*S,y=m.y*S;
      if(m.hit){c.globalAlpha=Math.min(1,a*1.6);c.fillStyle='#B5E05A';star(c,x,y,S*.32*(1.2-a*.4));c.fillStyle='#6E9E2C';c.beginPath();c.arc(x,y,S*.1,0,Math.PI*2);c.fill()}
      else{c.globalAlpha=a;c.strokeStyle='rgba(238,240,250,.7)';c.lineWidth=2;c.beginPath();c.arc(x,y,S*.35*(1.3-a*.3),0,Math.PI*2);c.stroke()}
      c.globalAlpha=1;if(m.life>(m.hit?22:12))swatter(c,x+S*.05,y,S*.9,Math.min(1,a*2),-.35)});
    ps.filter(p=>p.k<3).forEach(p=>critter(c,p.k,p.x*S,p.y*S,p.a,S,p.t,p.p));
    ps.filter(p=>p.k>=3).forEach(p=>critter(c,p.k,p.x*S,p.y*S,0,S,p.t,p.p));
    c.restore();
    if(!B.remote){
      if(mine&&F.DESK.matches&&hover&&!B.dead)swatter(c,hover.x+S*.05,hover.y,S*.9,B.stunT>0?.25:.55,-.35);
      F.drawIncoming(B);
      if(B.combo>=2&&!B.dead){const t=`×${B.combo} streak`;c.font=`800 ${Math.round(S*.34)}px Figtree,sans-serif`;const tw=c.measureText(t).width+S*.6;
        c.fillStyle=B.combo>=3?'rgba(247,197,72,.95)':'rgba(11,13,27,.8)';rr(c,W-tw-S*.15,S*.15,tw,S*.55,S*.27);c.fill();c.fillStyle=B.combo>=3?'#2A1E05':'#EEF0FA';c.textAlign='center';c.textBaseline='middle';c.fillText(t,W-tw/2-S*.15,S*.43)}
      if(B.stunT>0){c.fillStyle=`rgba(242,167,210,${.18*Math.min(1,B.stunT/15)})`;c.fillRect(0,0,W,H);F.bigText('Hissss!',W/2,H*.42,S*.9,'#F2A7D2',W*.9)}
      F.drawFxLayer(B,0);
    }
    if(B.dead&&G.playerOut&&!G.over)F.drawKO(B,W,H);
  },
  mini(c,b,w,h,s){
    const F=U(),K=PT();c.fillStyle='rgba(229,72,77,.10)';for(let x=0;x<w;x+=s)c.fillRect(x,0,s/2,h);
    const bites=bitesOf(b),PY=K?K.PLATE_Y:11.15;
    for(let i=0;i<6;i++){const cx=(i+.5)*s,cy=PY*s;c.beginPath();c.arc(cx,cy,s*.42,0,Math.PI*2);
      if(bites[i]){c.fillStyle=PLATE;c.fill();c.fillStyle=F.PAL.c[i%5];c.globalAlpha=.4+.2*bites[i];c.beginPath();c.arc(cx,cy,s*.28*(bites[i]/3+.2),0,Math.PI*2);c.fill();c.globalAlpha=1}
      else{c.strokeStyle='rgba(244,241,234,.35)';c.lineWidth=1;c.stroke()}}
    const col=['#2B1B14','#2F3A4A','#8F8F9C','#E8913A','#E8913A'];
    const ps=b.remote?((b.ms&&b.ms.p)||[]).map(q=>({k:q[0],x:q[1],y:q[2]})):b.pests.map(p=>({k:p.k,x:p.x,y:p.y}));
    ps.forEach(p=>{c.fillStyle=col[p.k]||INK;c.beginPath();c.arc(p.x*s,p.y*s,Math.max(1.5,s*(p.k>=3?.32:p.k===2?.2:.13)),0,Math.PI*2);c.fill()});
    if(b.dead)F.miniKO(c,w,h);
  },
  stat(B){return [B.swats|0,'Swats']},
  meta(b){const bt=bitesOf(b),pl=bt.filter(Boolean).length,n=b.remote?((b.ms&&b.ms.p)||[]).length:b.pests.length;return [pl<=2?'Danger!':`${pl} plates`,`${n} pest${n===1?'':'s'}`]},
  endLine(res,B){return res.won?`Picnic saved! You swatted ${B.swats} pests.`:`The pests ate your picnic. You swatted ${B.swats}.`},
  down(e,p){const B=U().G.player,S=U().S;hover=p;if(B.swat)B.swat(p.x/S,p.y/S)},
  move(e,p){hover=p},
  up(){},
  key(){return false},
};
})();
