// Food Fight UI: drawing, input, settings, practice mode and the online lobby.
(function(){
const VERSION='0.3.1';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const cv=$('#board'),ctx=cv.getContext('2d');
const NET=typeof window.FFNet!=='undefined'&&window.FFNet.enabled?window.FFNet:null;
let S=40,DPR=1,G=null,drag=null,lastDiff=1,lastMode='duel',minis=[];

/* ---------- settings ---------- */
const PALETTES={
  classic:   {name:'Classic',             note:'Bright default, safe for most color vision',c:['#E5682A','#F0E442','#56B4E9','#16A982','#CC79A7'],ink:'rgba(22,16,40,.62)',plate:.42},
  redgreen:  {name:'Red-green friendly',  note:'Tuned for protanopia and deuteranopia',     c:['#FE6100','#FFB000','#648FFF','#785EF0','#DC267F'],ink:'rgba(18,14,34,.66)',plate:.38},
  blueyellow:{name:'Blue-yellow friendly',note:'Tuned for tritanopia',                      c:['#E53935','#F48FB1','#80DEEA','#00897B','#BDBDBD'],ink:'rgba(18,14,34,.66)',plate:.38},
  contrast:  {name:'High contrast',       note:'Maximum separation, bold edges',            c:['#FF5A00','#FFF200','#00B4FF','#00E08A','#FF4FD8'],ink:'rgba(0,0,0,.86)',edge:'rgba(255,255,255,.95)',plate:.12},
  pastel:    {name:'Pastel',              note:'Soft and easy on the eyes',                 c:['#F4A582','#F7E39A','#9CCBEA','#9ED9C2','#D8B4E2'],ink:'rgba(40,30,60,.6)',plate:.15},
  mono:      {name:'Shapes only',         note:'All grey, play entirely by shape',          c:['#EDEDED','#CFCFCF','#B3B3B3','#E0E0E0','#C2C2C2'],ink:'rgba(0,0,0,.82)',plate:0},
};
const FOOD_NAMES=['Tomato','Cheese','Donut','Avocado','Grapes'],SHAPE_NAMES=['Circle','Triangle','Diamond','Drop','Star'];
const names=()=>prefs.art==='shapes'?SHAPE_NAMES:FOOD_NAMES;
let prefs={palette:'classic',theme:'night',muted:false,name:'',art:'food'};
try{const s=JSON.parse(localStorage.getItem('ff-prefs')||'null');if(s)prefs=Object.assign(prefs,s)}catch(e){}
if(!PALETTES[prefs.palette])prefs.palette='classic';
if(!['food','shapes'].includes(prefs.art))prefs.art='food';
if(!['night','day','auto'].includes(prefs.theme))prefs.theme='night';
function savePrefs(){try{localStorage.setItem('ff-prefs',JSON.stringify(prefs))}catch(e){}}
let PAL=PALETTES[prefs.palette],TOK={};
function readTokens(){
  const cs=getComputedStyle(document.documentElement),g=n=>cs.getPropertyValue(n).trim();
  TOK={well:g('--well')||'#0B0D1B',grid:g('--grid')||'rgba(255,255,255,.025)',shade:g('--shade')||'rgba(11,13,27,.35)',bg:g('--bg')||'#131627'};
}
function applyLook(){
  PAL=PALETTES[prefs.palette];
  document.documentElement.setAttribute('data-ff-theme',prefs.theme);
  readTokens();
  const tc=document.querySelector('meta[name="theme-color"]');if(tc)tc.setAttribute('content',TOK.bg);
  drawLegend();renderPals();
  $$('#theme button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.t===prefs.theme)));
  $$('#art button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.a===prefs.art)));
  render();minis.forEach(renderMini);
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(prefs.theme==='auto')applyLook()});

/* ---------- saved bests ---------- */
let best={score:0,chain:1,wins:0};
try{const s=JSON.parse(localStorage.getItem('ff-best')||'null');if(s)best=Object.assign(best,s)}catch(e){}
function saveBest(){try{localStorage.setItem('ff-best',JSON.stringify(best))}catch(e){}}
function showBest(){$('#best').textContent=(best.wins||best.score?`Your best: ${best.score} points · ${best.chain}-chain · ${best.wins} win${best.wins===1?'':'s'} · `:'')+'v'+VERSION}

/* ---------- audio ---------- */
let AC=null;
function tone(f,d=.08,type='triangle',v=.07){
  if(!AC||prefs.muted)return;
  try{const t0=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.setValueAtTime(f,t0);g.gain.setValueAtTime(v,t0);
  g.gain.exponentialRampToValueAtTime(.0001,t0+d);o.connect(g).connect(AC.destination);o.start(t0);o.stop(t0+d+.02)}catch(e){}
}
function wakeAudio(){
  if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(AC&&AC.state==='suspended')AC.resume();
}
function showMute(){$('#wave').style.opacity=prefs.muted?0:1;$('#bSound').setAttribute('aria-label',prefs.muted?'Sound off':'Sound on')}

/* ---------- drawing ---------- */
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function shape(c,t,cx,cy,m){
  c.beginPath();
  if(t===0){c.arc(cx,cy,m*.95,0,Math.PI*2)}
  else if(t===1){c.moveTo(cx,cy-m*1.05);c.lineTo(cx+m*1.1,cy+m*.85);c.lineTo(cx-m*1.1,cy+m*.85);c.closePath()}
  else if(t===2){c.moveTo(cx,cy-m*1.15);c.lineTo(cx+m*.95,cy);c.lineTo(cx,cy+m*1.15);c.lineTo(cx-m*.95,cy);c.closePath()}
  else if(t===3){c.moveTo(cx,cy-m*1.2);c.quadraticCurveTo(cx+m*.9,cy-m*.15,cx+m*.8,cy+m*.35);c.arc(cx,cy+m*.35,m*.8,0,Math.PI);c.quadraticCurveTo(cx-m*.9,cy-m*.15,cx,cy-m*1.2);c.closePath()}
  else{for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rad=i%2?m*.5:m*1.15;c.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad)}c.closePath()}
  c.fill();
}
/* food art: each food has its own silhouette AND its own natural colors; the palette tints the plate behind it */
function mix(hex,to,a){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),A=p(hex),B=p(to);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*a).toString(16).padStart(2,'0')).join('')}
const OUT='#2A1A12';
function outline(c,s){c.lineWidth=Math.max(1,s*.04);c.strokeStyle=OUT;c.lineJoin='round';c.lineCap='round';c.stroke()}
function drawFood(c,t,x,y,s){
  const X=v=>x+v*s,Y=v=>y+v*s;
  if(t===0){ // tomato: round, red, green leafy crown
    const cx=X(.5),cy=Y(.57),r=s*.29;
    c.beginPath();c.ellipse(cx,cy,r*1.06,r*.94,0,0,Math.PI*2);c.fillStyle='#E2392B';c.fill();outline(c,s);
    c.beginPath();c.ellipse(cx-r*.42,cy-r*.32,r*.24,r*.13,-.6,0,Math.PI*2);c.fillStyle='rgba(255,255,255,.55)';c.fill();
    c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rad=i%2?r*.13:r*.5;c.lineTo(cx+Math.cos(a)*rad,cy-r*.86+Math.sin(a)*rad*.7)}c.closePath();
    c.fillStyle='#2F8F3A';c.fill();outline(c,s);
    c.beginPath();c.moveTo(cx,cy-r*.9);c.lineTo(cx+r*.1,cy-r*1.25);c.lineWidth=Math.max(1.5,s*.06);c.strokeStyle='#2F6B2A';c.stroke();
  }else if(t===1){ // cheese: chunky wedge with holes
    const P=[[.1,.6],[.8,.22],[.9,.32],[.9,.8],[.1,.8]];
    c.beginPath();P.forEach(([a,b],i)=>i?c.lineTo(X(a),Y(b)):c.moveTo(X(a),Y(b)));c.closePath();c.fillStyle='#F5C542';c.fill();
    c.beginPath();c.moveTo(X(.1),Y(.6));c.lineTo(X(.8),Y(.22));c.lineTo(X(.9),Y(.32));c.lineTo(X(.18),Y(.68));c.closePath();c.fillStyle='#FCE38A';c.fill();
    c.beginPath();c.rect(X(.81),Y(.32),s*.09,s*.48);c.fillStyle='#E0A526';c.fill();
    c.fillStyle='#D9A21F';[[.38,.7,.06],[.6,.56,.08],[.66,.72,.045],[.25,.74,.04],[.72,.4,.035]].forEach(([a,b,r])=>{c.beginPath();c.arc(X(a),Y(b),s*r,0,Math.PI*2);c.fill()});
    c.beginPath();P.forEach(([a,b],i)=>i?c.lineTo(X(a),Y(b)):c.moveTo(X(a),Y(b)));c.closePath();outline(c,s);
  }else if(t===2){ // donut: ring with pink icing and sprinkles
    const cx=X(.5),cy=Y(.53),R=s*.33,h=s*.11;
    c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.arc(cx,cy,h,0,Math.PI*2,true);c.fillStyle='#D08A45';c.fill('evenodd');
    c.beginPath();for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,rad=R*.84+Math.sin(i*1.9)*R*.06;c.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad)}c.closePath();
    c.arc(cx,cy,h*1.25,0,Math.PI*2,true);c.fillStyle='#F06FAE';c.fill('evenodd');
    c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);outline(c,s);c.beginPath();c.arc(cx,cy,h,0,Math.PI*2);outline(c,s);
    const sp=[['#FFFFFF',-.9,.62],['#5BC0EB',.3,.6],['#FDE74C',1.4,.62],['#FFFFFF',2.4,.58],['#5BC0EB',3.4,.64],['#FDE74C',4.5,.6],['#FFFFFF',5.4,.62]];
    c.lineWidth=Math.max(1.2,s*.045);c.lineCap='round';
    sp.forEach(([col,a,d])=>{const px=cx+Math.cos(a)*R*d,py=cy+Math.sin(a)*R*d;c.beginPath();c.moveTo(px-Math.cos(a+1)*s*.035,py-Math.sin(a+1)*s*.035);c.lineTo(px+Math.cos(a+1)*s*.035,py+Math.sin(a+1)*s*.035);c.strokeStyle=col;c.stroke()});
  }else if(t===3){ // avocado half: teardrop, pale flesh, big brown pit
    const cx=X(.5),cy=Y(.5),m=s*.31;
    const drop=(k,dy)=>{c.beginPath();c.moveTo(cx,cy-m*1.2*k+dy);c.bezierCurveTo(cx+m*.62*k,cy-m*.9*k+dy,cx+m*.95*k,cy+m*.05*k+dy,cx+m*.95*k,cy+m*.45*k+dy);c.arc(cx,cy+m*.45*k+dy,m*.95*k,0,Math.PI);c.bezierCurveTo(cx-m*.95*k,cy+m*.05*k+dy,cx-m*.62*k,cy-m*.9*k+dy,cx,cy-m*1.2*k+dy);c.closePath()};
    drop(1,0);c.fillStyle='#3B6B25';c.fill();outline(c,s);
    drop(.8,m*.08);c.fillStyle='#D8E68C';c.fill();
    c.beginPath();c.arc(cx,cy+m*.48,m*.42,0,Math.PI*2);c.fillStyle='#8A5A2E';c.fill();outline(c,s);
    c.beginPath();c.arc(cx-m*.13,cy+m*.36,m*.11,0,Math.PI*2);c.fillStyle='rgba(255,255,255,.45)';c.fill();
  }else{ // grapes: purple cluster with stem and leaf
    c.beginPath();c.moveTo(X(.5),Y(.34));c.quadraticCurveTo(X(.48),Y(.22),X(.56),Y(.16));c.lineWidth=Math.max(1.5,s*.05);c.strokeStyle='#6B4423';c.stroke();
    c.beginPath();c.ellipse(X(.67),Y(.22),s*.12,s*.06,-.4,0,Math.PI*2);c.fillStyle='#4CA43C';c.fill();outline(c,s);
    [[.33,.42],[.5,.42],[.67,.42],[.41,.57],[.59,.57],[.5,.72]].forEach(([a,b])=>{
      c.beginPath();c.arc(X(a),Y(b),s*.105,0,Math.PI*2);c.fillStyle='#7B3FA3';c.fill();outline(c,s);
      c.beginPath();c.arc(X(a)-s*.035,Y(b)-s*.035,s*.03,0,Math.PI*2);c.fillStyle='rgba(255,255,255,.6)';c.fill();
    });
  }
}
function drawJunk(c,x,y,s){
  const p=Math.max(1,s*.04),w=s-p*2,r=s*.12;
  rr(c,x+p,y+p,w,w,r);c.fillStyle='#6B5141';c.fill();
  c.save();c.clip();
  c.fillStyle='#B48A63';c.fillRect(x,y,s,s*.22);
  c.fillStyle='rgba(0,0,0,.18)';
  for(let i=0;i<3;i++){c.beginPath();c.arc(x+s*(.28+i*.22),y+s*(.5+(i%2)*.16),s*.07,0,Math.PI*2);c.fill()}
  c.fillStyle='rgba(255,240,220,.85)';c.beginPath();c.arc(x+s*.3,y+s*.22,s*.09,0,Math.PI*2);c.arc(x+s*.62,y+s*.24,s*.06,0,Math.PI*2);c.fill();
  c.restore();
}
function drawTileArt(c,t,x,y,s,pal,art){
  if(t<0){drawJunk(c,x,y,s);return}
  const p=Math.max(1,s*.04),w=s-p*2,r=s*.2;
  if(art==='food'){
    const plate=pal.plate?mix(pal.c[t],'#FFFFFF',pal.plate):pal.c[t];
    rr(c,x+p,y+p,w,w,r);c.fillStyle=plate;c.fill();
    c.save();c.clip();c.fillStyle='rgba(0,0,0,.12)';c.fillRect(x,y+s*.88,s,s*.12);c.restore();
    if(pal.edge){rr(c,x+p+1,y+p+1,w-2,w-2,r);c.lineWidth=Math.max(1.5,s*.05);c.strokeStyle=pal.edge;c.stroke()}
    drawFood(c,t,x,y,s);
    return;
  }
  rr(c,x+p,y+p,w,w,r);c.fillStyle=pal.c[t];c.fill();
  c.save();c.clip();
  c.fillStyle='rgba(255,255,255,.2)';c.fillRect(x,y,s,s*.3);
  c.fillStyle='rgba(0,0,0,.16)';c.fillRect(x,y+s*.86,s,s*.14);
  c.restore();
  if(pal.edge){rr(c,x+p+1,y+p+1,w-2,w-2,r);c.lineWidth=Math.max(1.5,s*.05);c.strokeStyle=pal.edge;c.stroke()}
  c.fillStyle=pal.ink;shape(c,t,x+s/2,y+s*.5,s*.27);
}
// tiles are drawn once per size/look into small canvases, then copied: keeps 60fps with detailed food art
const sprites=new Map();
function tileSprite(t,s,pal){
  const px=Math.max(8,Math.round(s*DPR)),key=prefs.art+'|'+pal.name+'|'+t+'|'+px;
  let sp=sprites.get(key);
  if(!sp){
    if(sprites.size>600)sprites.clear();
    sp=document.createElement('canvas');sp.width=sp.height=px;
    drawTileArt(sp.getContext('2d'),t,0,0,px,pal,prefs.art);
    sprites.set(key,sp);
  }
  return sp;
}
const SPECIAL_COL={cream:'#FFF6E8',freeze:'#9BE3FF',blender:'#E7A6D1',pin:'#E0A86E'};
function drawBadgeIcon(c,k,cx,cy,r){
  c.save();c.lineCap='round';c.lineJoin='round';
  if(k==='cream'){c.fillStyle='#FFF6E8';[[0,.45,.62],[0,.05,.48],[0,-.32,.32]].forEach(([dx,dy,rr2])=>{c.beginPath();c.ellipse(cx+dx*r,cy+dy*r,rr2*r*1.25,rr2*r*.75,0,0,Math.PI*2);c.fill()});c.beginPath();c.moveTo(cx,cy-.55*r);c.lineTo(cx+.12*r,cy-.8*r);c.lineWidth=r*.18;c.strokeStyle='#FFF6E8';c.stroke()}
  else if(k==='freeze'){c.strokeStyle='#9BE3FF';c.lineWidth=r*.16;for(let i=0;i<3;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(cx-Math.cos(a)*r*.75,cy-Math.sin(a)*r*.75);c.lineTo(cx+Math.cos(a)*r*.75,cy+Math.sin(a)*r*.75);c.stroke()}}
  else if(k==='blender'){c.fillStyle='#E7A6D1';c.beginPath();c.moveTo(cx-r*.5,cy-r*.65);c.lineTo(cx+r*.5,cy-r*.65);c.lineTo(cx+r*.35,cy+r*.25);c.lineTo(cx-r*.35,cy+r*.25);c.closePath();c.fill();c.fillStyle='#FFFFFF';c.fillRect(cx-r*.45,cy+r*.32,r*.9,r*.38)}
  else{c.fillStyle='#E0A86E';rr(c,cx-r*.55,cy-r*.22,r*1.1,r*.44,r*.2);c.fill();c.fillStyle='#B48A63';c.fillRect(cx-r*.85,cy-r*.1,r*.3,r*.2);c.fillRect(cx+r*.55,cy-r*.1,r*.3,r*.2)}
  c.restore();
}
function drawBadge(c,k,x,y,s,frame){
  const cx=x+s*.79,cy=y+s*.21,r=s*.19,pulse=.5+.5*Math.sin(frame*.15);
  rr(c,x+s*.05,y+s*.05,s*.9,s*.9,s*.2);c.lineWidth=Math.max(1.5,s*.06);c.strokeStyle=`rgba(247,197,72,${.45+.45*pulse})`;c.stroke();
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle='#1B1F33';c.fill();c.lineWidth=Math.max(1,s*.035);c.strokeStyle='#F7C548';c.stroke();
  drawBadgeIcon(c,k,cx,cy,r*.85);
}
function drawTile(c,t,x,y,s,alpha,frame,simple,pal){
  pal=pal||PAL;
  let sc=1,flash=0;
  if(t.clr>0){if(t.conv||t.clr>POP)flash=(Math.floor(frame/4)%2)?.55:.15;else sc=t.clr/POP}
  if(simple){
    c.globalAlpha=alpha;
    c.fillStyle=t.t<0?'#8A6A50':pal.c[t.t];c.fillRect(x+.5,y+.5,s-1,s-1);
    if(flash){c.fillStyle=`rgba(255,255,255,${flash})`;c.fillRect(x+.5,y+.5,s-1,s-1)}
    c.globalAlpha=1;return;
  }
  c.save();c.globalAlpha=alpha;
  if(sc<1){c.translate(x+s/2,y+s/2);c.scale(sc,sc);c.translate(-x-s/2,-y-s/2)}
  c.drawImage(tileSprite(t.t,s,pal),x,y,s,s);
  if(t.sp&&!flash)drawBadge(c,t.sp,x,y,s,frame);
  if(flash){const p=Math.max(1,s*.04);rr(c,x+p,y+p,s-p*2,s-p*2,s*.2);c.fillStyle=`rgba(255,255,255,${flash})`;c.fill()}
  c.restore();
}
function render(){
  const W=S*COLS,H=S*ROWS;
  ctx.fillStyle=TOK.well;ctx.fillRect(0,0,W,H);
  if(!G)return;
  const B=G.player,ro=B.rise*S,f=G.frame;
  ctx.fillStyle=TOK.grid;
  for(let r=-1;r<=ROWS;r++)for(let c=0;c<COLS;c++)if((r+c+400)%2===0)ctx.fillRect(c*S,r*S-ro,S,S);
  const danger=[];for(let c=0;c<COLS;c++)danger[c]=!!(B.g[0][c]||B.g[1][c]);
  if(danger.some(Boolean)){
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,S*.3);ctx.clip();
    ctx.fillStyle=B.grace<GRACE?'rgba(247,197,72,.6)':'rgba(247,197,72,.28)';
    for(let i=-2;i<COLS*3+2;i++){ctx.beginPath();ctx.moveTo(i*S/3,0);ctx.lineTo(i*S/3+S/6,0);ctx.lineTo(i*S/3,S*.3);ctx.lineTo(i*S/3-S/6,S*.3);ctx.fill()}
    ctx.restore();
  }
  if(B.rushT>0){
    const hgt=S*.45,pulse=.35+.25*Math.sin(f*.4);
    ctx.save();ctx.beginPath();ctx.rect(0,H-hgt,W,hgt);ctx.clip();
    ctx.fillStyle=`rgba(229,104,42,${pulse})`;
    for(let i=0;i<COLS*2;i++){const x=i*S/2;ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x+S*.1,H-hgt*(.6+.4*Math.sin(f*.5+i)),x+S/4,H-hgt);ctx.quadraticCurveTo(x+S*.4,H-hgt*.5,x+S/2,H);ctx.fill()}
    ctx.restore();
  }
  const shakeY=B.shake?Math.sin(B.shake*2)*S*.04:0,live=!G.paused&&!B.dead;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const t=B.g[r][c];if(!t)continue;
    const sx=danger[c]&&live?Math.sin(f*.8+c*1.7)*S*(B.grace<GRACE?.05:.025):0;
    drawTile(ctx,t,c*S+t.xo*S+sx,r*S-ro+t.yo*S+shakeY,S,B.dead?.45:1,f);
    if(t.splat>0){const k=1-t.splat/24,x=c*S+S/2,y=r*S-ro+S/2+shakeY;ctx.globalAlpha=1-k;ctx.strokeStyle='#E0A86E';ctx.lineWidth=S*.12*(1-k)+1;ctx.beginPath();ctx.arc(x,y,S*(.35+k*.6),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}
  }
  for(let c=0;c<COLS;c++)drawTile(ctx,{t:B.preview[c],clr:0,sp:B.previewSp&&B.previewSp[c]},c*S,ROWS*S-ro+shakeY,S,.45,f);
  ctx.fillStyle=TOK.shade;ctx.fillRect(0,H-ro,W,ro);
  if(drag&&(drag.mode==='h'||drag.mode==='v')&&drag.r!=null&&drag.r>=0){
    const t=B.g[drag.r]&&B.g[drag.r][drag.c];
    if(t){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2.5;rr(ctx,drag.c*S+t.xo*S+1.5,drag.r*S-ro+t.yo*S+1.5,S-3,S-3,S*.2);ctx.stroke()}
  }
  if(kb.on){ctx.strokeStyle='#F7C548';ctx.lineWidth=3;rr(ctx,kb.c*S+1.5,kb.r*S-ro+1.5,S*2-3,S-3,S*.22);ctx.stroke()}
  drawEffects(ctx,B,W,H,f);
  B.parts.forEach(p=>{ctx.globalAlpha=Math.min(1,p.life/14);ctx.fillStyle=p.kind<0?'#E0A86E':PAL.c[p.kind];ctx.beginPath();ctx.arc(p.x*S,p.y*S-ro,S*.07,0,Math.PI*2);ctx.fill()});
  ctx.globalAlpha=1;
  ctx.textAlign='center';ctx.textBaseline='middle';
  B.pops.forEach(p=>{
    const a=Math.min(1,p.life/20),yy=(p.y-(60-p.life)*.012)*S-ro,xx=Math.min(Math.max(p.x*S,S*1.6),W-S*1.6);
    ctx.globalAlpha=a;ctx.font=`${Math.round(S*.62*p.size)}px 'Lilita One','Arial Rounded MT Bold',sans-serif`;
    ctx.lineWidth=S*.14;ctx.strokeStyle='#0B0D1B';ctx.strokeText(p.text,xx,yy);
    ctx.fillStyle=p.col;ctx.fillText(p.text,xx,yy);
  });
  ctx.globalAlpha=1;
}
function drawEffects(c,B,W,H,f){
  if(B.frozenT>0){
    const a=Math.min(1,B.frozenT/20);
    c.fillStyle=`rgba(150,215,255,${.28*a})`;c.fillRect(0,0,W,H);
    c.strokeStyle=`rgba(225,245,255,${.85*a})`;c.lineWidth=S*.08;c.lineCap='round';
    for(let i=0;i<14;i++){const side=i%4,t=((i*37)%100)/100,len=S*(.4+((i*13)%5)/10);
      const x=side===0?t*W:side===1?W:side===2?t*W:0,y=side===0?0:side===1?t*H:side===2?H:t*H;
      const ang=[Math.PI/2,Math.PI,-Math.PI/2,0][side]+((i%3)-1)*.5;
      c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(ang)*len,y+Math.sin(ang)*len);c.stroke()}
    drawBadgeIcon(c,'freeze',W/2,H*.45,S*1.1*a);
  }
  if(B.creamT>0){
    if(B._cream!==B.creamSeed){B._cream=B.creamSeed;let sd=Math.floor((B.creamSeed||.5)*1e6)||7;const r=()=>(sd=(sd*16807)%2147483647)/2147483647;
      B._blobs=Array.from({length:10},()=>({x:r()*W,y:r()*H*.72,r:S*(.9+r()*1.1),p:r()*6}))}
    const a=Math.min(1,B.creamT/40,(CREAM-B.creamT)/10+.2);
    c.globalAlpha=.95*a;
    B._blobs.forEach(b=>{
      const wob=Math.sin(f*.05+b.p)*S*.06;
      c.fillStyle='#E9D9C2';[[0,0,1],[.6,.3,.7],[-.55,.35,.65]].forEach(([dx,dy,k])=>{c.beginPath();c.arc(b.x+dx*b.r,b.y+dy*b.r+S*.08+wob,b.r*k,0,Math.PI*2);c.fill()});
      c.fillStyle='#FFF6E8';[[0,0,1],[.6,.3,.7],[-.55,.35,.65]].forEach(([dx,dy,k])=>{c.beginPath();c.arc(b.x+dx*b.r,b.y+dy*b.r+wob,b.r*k,0,Math.PI*2);c.fill()});
    });
    c.globalAlpha=1;
  }
}
function renderMini(m){
  const b=m.board,c=m.ctx,w=m.cv.width,h=m.cv.height,s=w/COLS;
  c.fillStyle=TOK.well;c.fillRect(0,0,w,h);
  const ro=b.rise*s,simple=s<14,fr=G?G.frame:0;
  for(let r=0;r<ROWS;r++)for(let k=0;k<COLS;k++){const t=b.g[r][k];if(t)drawTile(c,t,k*s+(t.xo||0)*s,r*s-ro+(t.yo||0)*s,s,b.dead?.5:1,fr,simple)}
  for(let k=0;k<COLS;k++)drawTile(c,{t:b.preview[k],clr:0},k*s,ROWS*s-ro,s,.3,0,simple);
  if(b.g[0].some(Boolean)||b.g[1].some(Boolean)){c.fillStyle='rgba(247,197,72,.55)';c.fillRect(0,0,w,Math.max(2,s*.2))}
  if(b.rushT>0){c.fillStyle=`rgba(229,104,42,${.4+.3*Math.sin(fr*.4)})`;c.fillRect(0,h-Math.max(3,s*.5),w,Math.max(3,s*.5))}
  if(b.frozenT>0){c.fillStyle='rgba(150,215,255,.4)';c.fillRect(0,0,w,h)}
  if(b.creamT>0){c.fillStyle='rgba(255,246,232,.85)';c.beginPath();c.ellipse(w*.35,h*.3,w*.4,h*.16,0,0,Math.PI*2);c.ellipse(w*.7,h*.45,w*.32,h*.12,0,0,Math.PI*2);c.fill()}
  if(b.dead){c.fillStyle='rgba(11,13,27,.55)';c.fillRect(0,0,w,h);c.fillStyle='#EEF0FA';c.textAlign='center';c.textBaseline='middle';c.font=`${Math.round(w*.32)}px 'Lilita One',sans-serif`;c.fillText('KO',w/2,h/2)}
}
function drawLegend(){
  const lg=$('#legend');lg.innerHTML='';
  for(let t=-1;t<NT;t++){
    const tt=t<0?NT:t;
    const c=document.createElement('canvas');c.width=72;c.height=72;
    const name=tt===NT?'Junk':names()[tt];c.title=name;c.setAttribute('aria-label',name);c.setAttribute('role','img');
    drawTile(c.getContext('2d'),{t:tt===NT?-1:tt,clr:0},0,0,72,1,0);lg.appendChild(c);
  }
}
function renderPals(){
  const box=$('#pals');
  if(box.dataset.art!==prefs.art){box.innerHTML='';box.dataset.art=prefs.art}
  if(!box.children.length){
    Object.entries(PALETTES).forEach(([key,p])=>{
      const b=document.createElement('button');b.className='pal';b.type='button';b.dataset.p=key;
      b.innerHTML=`<canvas width="250" height="50" aria-hidden="true"></canvas><b>${p.name}</b><span>${p.note}</span>`;
      const c=b.querySelector('canvas').getContext('2d');
      for(let t=0;t<NT;t++)drawTile(c,{t,clr:0},t*50,0,50,1,0,false,p);
      b.addEventListener('click',()=>{prefs.palette=key;savePrefs();applyLook()});
      box.appendChild(b);
    });
  }
  $$('.pal').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p===prefs.palette)));
}

/* ---------- rack ---------- */
const ICONS={
  pie:'<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="9" fill="#E0A86E"/><path d="M12 13V4a9 9 0 0 1 8.5 6z" fill="#2B1A0C" opacity=".35"/><circle cx="9" cy="15" r="1.4" fill="#2B1A0C" opacity=".35"/><circle cx="14" cy="17" r="1.2" fill="#2B1A0C" opacity=".35"/></svg>',
  tower:'<svg viewBox="0 0 24 24"><rect x="3" y="15" width="18" height="6" rx="2" fill="#E0A86E"/><rect x="5" y="9" width="14" height="6" rx="2" fill="#B48A63"/><rect x="7" y="3" width="10" height="6" rx="2" fill="#E0A86E"/></svg>',
  sauce:'<svg viewBox="0 0 24 24"><path d="M10 2h4v4l2.5 3.5V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9.5L10 6z" fill="#E5682A"/><rect x="9.5" y="12" width="5" height="5" rx="1" fill="#F0E442"/></svg>'
};
ICONS.cream='<svg viewBox="0 0 24 24"><ellipse cx="12" cy="18" rx="8" ry="4" fill="#FFF6E8" stroke="#2A1A12" stroke-width="1.3"/><ellipse cx="12" cy="12.5" rx="6" ry="3.4" fill="#FFF6E8" stroke="#2A1A12" stroke-width="1.3"/><ellipse cx="12" cy="7.5" rx="3.6" ry="2.4" fill="#FFF6E8" stroke="#2A1A12" stroke-width="1.3"/><path d="M12 5l1.5-3" stroke="#2A1A12" stroke-width="1.3" stroke-linecap="round"/></svg>';
ICONS.freeze='<svg viewBox="0 0 24 24" stroke="#56B4E9" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 4L12 6.5 14.5 4M9.5 20l2.5-2.5 2.5 2.5" fill="none"/></svg>';
ICONS.blender='<svg viewBox="0 0 24 24"><path d="M6 3h12l-2 12H8z" fill="#E7A6D1" stroke="#2A1A12" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 9l6-2" stroke="#2A1A12" stroke-width="1.3" stroke-linecap="round"/><rect x="6" y="15" width="12" height="6" rx="2" fill="#7B6B8F" stroke="#2A1A12" stroke-width="1.3"/></svg>';
ICONS.pin='<svg viewBox="0 0 24 24"><rect x="6" y="8" width="12" height="8" rx="3" fill="#E0A86E" stroke="#2A1A12" stroke-width="1.3"/><rect x="1.5" y="10.5" width="4.5" height="3" rx="1.5" fill="#B48A63" stroke="#2A1A12" stroke-width="1.1"/><rect x="18" y="10.5" width="4.5" height="3" rx="1.5" fill="#B48A63" stroke="#2A1A12" stroke-width="1.1"/></svg>';
const LABEL={pie:'Pie',tower:'Tower',sauce:'Sauce',cream:'Cream',freeze:'Freeze',blender:'Blender',pin:'Pin'};
const VALUE={sauce:'3s',cream:'5s',freeze:'2.5s',blender:'Mix',pin:'Self'};
let rackIds='';
function renderRack(){
  const box=$('#slots'),B=G&&G.player;
  const items=B?B.rack:[],ids=items.map(i=>i.id).join(',');
  if(ids===rackIds&&box.children.length===RACK)return;
  const prev=new Set(rackIds.split(','));rackIds=ids;
  box.innerHTML='';
  for(let i=0;i<RACK;i++){
    const it=items[i],b=document.createElement('button');b.type='button';
    if(it){
      b.className='slot full'+(prev.has(String(it.id))?'':' new');
      b.innerHTML=ICONS[it.k]+`<b>${VALUE[it.k]||it.cells}</b><span>${LABEL[it.k]}</span>`;
      b.setAttribute('aria-label',`Throw ${LABEL[it.k]}${it.cells?' '+it.cells:''}`);
      b.addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())G.player.fire(i)});
    }else{b.className='slot';b.disabled=true;b.setAttribute('aria-label','Empty rack slot')}
    box.appendChild(b);
  }
}

/* ---------- opponents ---------- */
const multi=()=>G&&G.boards.length>2;
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function buildOpps(){
  const box=$('#opps');box.innerHTML='';box.classList.toggle('duel',!multi());
  minis=G.boards.filter(b=>b!==G.player).map(b=>{
    const el=document.createElement('div');el.className='foe';
    el.innerHTML=`<canvas></canvas><div class="who"><div class="nm">${esc(b.name)}</div><div class="st">Cooking</div><div class="tag" hidden>Aim</div></div>`;
    box.appendChild(el);
    const cvm=el.querySelector('canvas');
    return {board:b,el,cv:cvm,ctx:cvm.getContext('2d'),st:el.querySelector('.st'),tag:el.querySelector('.tag')};
  });
  sizeMinis();updateAim();
}
function sizeMinis(){minis.forEach(m=>{const r=m.cv.getBoundingClientRect();if(r.width){m.cv.width=Math.round(r.width*DPR);m.cv.height=Math.round(r.width*2*DPR)}})}
let aimName='';
function updateAim(){
  if(!G)return;
  const a=G.over||G.player.dead?null:G.aim();
  minis.forEach(m=>{
    const on=a===m.board;
    m.el.classList.toggle('aim',on);m.tag.hidden=!on;
    m.el.classList.toggle('dead',m.board.dead);
  });
  const n=a?a.name:'nobody';
  if(n!==aimName){aimName=n;$('#aimline').innerHTML=`Tap to throw at <b>${esc(n)}</b>`}
}
const placeName=p=>['','1st','2nd','3rd','4th'][p]||p+'th';
function updateOpps(){
  minis.forEach(m=>{
    const b=m.board;renderMini(m);
    m.el.classList.toggle('hit',b.hitFlash>0);
    const h=b.height(),kos=b.kos?` · KO ${b.kos}`:'',hold=b.rack.length?` · holding ${b.rack.length}`:'';
    m.st.textContent=b.dead?(b.place?placeName(b.place)+' place':'Out'):(b.frozenT>0?'Frozen':b.creamT>0?'Creamed':b.rushT>0?'Hot sauce!':h>=10?'In trouble':h>=8?'Stack high':'Cooking')+hold+kos;
  });
}

/* ---------- flying pies ---------- */
function pointFor(b,isTarget,slot){
  if(b===G.player){
    if(isTarget){const r=$('#tray').getBoundingClientRect();return[r.right-30,r.top+r.height/2]}
    const el=$('#slots').children[slot]||$('#slots');const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2];
  }
  const m=minis.find(m=>m.board===b);if(!m)return[0,0];
  const r=m.cv.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height*(isTarget?.3:.6)];
}
function fly(src,tgt,it,slot){
  const [x,y]=pointFor(src,false,slot),[tx,ty]=pointFor(tgt,true);
  const d=document.createElement('div');d.className='fly'+(JUNK_KINDS.includes(it.k)?(it.cells>=6?' big':''):' '+it.k);document.body.appendChild(d);
  d.style.transform=`translate(${x}px,${y}px)`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{d.style.transform=`translate(${tx}px,${ty}px) scale(.8)`}));
  setTimeout(()=>d.remove(),600);
  if(src===G.player)tone(500,.1,'triangle',.06);
  if(tgt===G.player)tone(240,.1,'sawtooth',.03);
}

/* ---------- tray + hud ---------- */
let trayKey='';
function renderTray(){
  const tray=$('#tray'),B=G&&G.player;
  const key=B?B.inc.map(i=>i.cells+(i.from?i.from.id:'')).join(','):'';
  if(key!==trayKey){
    trayKey=key;
    if(!B||!B.inc.length)tray.innerHTML='<span class="lbl">Incoming</span><span class="none">Nothing yet</span>';
    else tray.innerHTML='<span class="lbl">Incoming</span>'+B.inc.map(i=>`<div class="pie${i.cells>=6?' big':''}"><div class="disc">${i.cells}${multi()&&i.from?`<small>${esc(i.from.name[0])}</small>`:''}</div><div class="tick"><i></i></div></div>`).join('');
  }
  if(B){
    const ticks=tray.querySelectorAll('.tick i');
    B.inc.forEach((it,k)=>{if(ticks[k])ticks[k].style.width=(it.t/it.T*100)+'%'});
    tray.classList.toggle('alarm',B.inc.some(i=>i.t<70));
  }
}
const fmt=fr=>{const s=Math.floor(fr/60);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function hud(){
  if(!G)return;
  $('#sTime').textContent=fmt(G.frame);$('#sScore').textContent=G.player.score;
  if(multi()){$('#sThird').textContent=G.player.kos;$('#sThirdL').textContent='KOs'}
  else{$('#sThird').textContent=G.level();$('#sThirdL').textContent='Heat'}
}

/* ---------- sizing ---------- */
function resize(){
  const w=$('#wrap');const W=w.clientWidth,H=w.clientHeight;
  S=Math.max(16,Math.floor(Math.min(W/COLS,H/ROWS)));
  DPR=Math.min(3,window.devicePixelRatio||1);
  cv.style.width=S*COLS+'px';cv.style.height=S*ROWS+'px';
  cv.width=Math.round(S*COLS*DPR);cv.height=Math.round(S*ROWS*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  document.documentElement.style.setProperty('--bw',S*COLS+'px');
  sizeMinis();render();
}
new ResizeObserver(resize).observe($('#wrap'));
window.addEventListener('resize',resize);

/* ---------- input ---------- */
const kb={on:false,r:8,c:2};
function bp(e){const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function canPlay(){return G&&!G.over&&!G.paused&&!G.player.dead&&!G.waiting}
cv.addEventListener('pointerdown',e=>{
  if(!canPlay())return;
  e.preventDefault();wakeAudio();
  try{cv.setPointerCapture(e.pointerId)}catch(_){}
  const B=G.player,p=bp(e),c=Math.floor(p.x/S),r=Math.floor((p.y+B.rise*S)/S);
  const t=r>=0&&r<ROWS&&c>=0&&c<COLS?B.g[r][c]:null;
  drag={id:e.pointerId,x0:p.x,y0:p.y,r:t?r:null,c,mode:null};
  kb.on=false;
});
cv.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id||!canPlay())return;
  const B=G.player,p=bp(e),dx=p.x-drag.x0,dy=p.y-drag.y0,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!drag.mode){
    if(drag.r==null){if(dy<-S*.4&&ay>ax){drag.mode='raise';B.raising=true;$('#bRaise').classList.add('on')}}
    else if(ax>S*.18||ay>S*.18)drag.mode=ax>=ay?'h':'v';
  }
  if(drag.mode==='h'&&drag.r!=null&&drag.r>=0){
    const tc=Math.max(0,Math.min(COLS-1,Math.floor(p.x/S)));
    while(drag.c!==tc){const d=Math.sign(tc-drag.c);if(!B.trySwap(drag.r,drag.c,d))break;drag.c+=d}
  }else if(drag.mode==='v'&&drag.r!=null&&drag.r>=0){
    const tr=Math.max(0,Math.min(ROWS-1,Math.floor((p.y+B.rise*S)/S)));
    while(drag.r!==tr){const d=Math.sign(tr-drag.r);if(!B.trySwapV(drag.r,drag.c,d))break;drag.r+=d}
  }
});
function endDrag(e){if(!drag||(e&&e.pointerId!==drag.id))return;if(drag.mode==='raise'&&G){G.player.raising=false;$('#bRaise').classList.remove('on')}drag=null}
cv.addEventListener('pointerup',endDrag);cv.addEventListener('pointercancel',endDrag);
const rb=$('#bRaise');
rb.addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay()){G.player.raising=true;rb.classList.add('on')}});
['pointerup','pointercancel','pointerleave'].forEach(ev=>rb.addEventListener(ev,()=>{if(G)G.player.raising=false;rb.classList.remove('on')}));
const anyOverlay=()=>$$('.overlay').some(o=>!o.hidden);
document.addEventListener('keydown',e=>{
  if(!G||e.target.tagName==='INPUT')return;
  if(e.key==='Escape'&&!$('#ovPause').hidden){closePause();return}
  if(anyOverlay()&&$('#ovPause').hidden)return;
  if(e.key==='p'||e.key==='Escape'){if(!G.over)openPause();return}
  if(!canPlay())return;
  const B=G.player,k=e.key;let used=true;
  if(k==='ArrowLeft')kb.c=Math.max(0,kb.c-1);
  else if(k==='ArrowRight')kb.c=Math.min(COLS-2,kb.c+1);
  else if(k==='ArrowUp')kb.r=Math.max(0,kb.r-1);
  else if(k==='ArrowDown')kb.r=Math.min(ROWS-1,kb.r+1);
  else if(k===' '||k==='x'||k==='X'||k==='Enter')B.trySwap(kb.r,kb.c,1);
  else if(k==='c'||k==='C')B.trySwapV(kb.r,kb.c,1);
  else if(k==='Shift'||k==='z'||k==='Z')B.raising=true;
  else if('123'.includes(k)&&k.length===1)B.fire(+k-1);
  else used=false;
  if(used){kb.on=true;e.preventDefault()}
});
document.addEventListener('keyup',e=>{if(G&&(e.key==='Shift'||e.key==='z'||e.key==='Z'))G.player.raising=false});
if(matchMedia('(pointer:fine)').matches)$('#kbd').hidden=false;

/* ---------- overlays ---------- */
const OVS=['#ovStart','#ovHow','#ovLook','#ovBoard','#ovOnline','#ovLobby','#ovCount','#ovPause','#ovEnd'];
let backTo='#ovStart';
function show(id){OVS.forEach(s=>$(s).hidden=s!==id);if(id!=='#ovEnd')$('#outToast').hidden=true}
function hideAll(){OVS.forEach(s=>$(s).hidden=true)}
function openSub(id){backTo=OVS.find(s=>!$(s).hidden)||null;show(id)}
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(backTo)show(backTo);else hideAll()}));
$('#bHow').addEventListener('click',()=>openSub('#ovHow'));
$('#bLook').addEventListener('click',()=>openSub('#ovLook'));
$('#bLook2').addEventListener('click',()=>openSub('#ovLook'));
$$('#theme button').forEach(b=>b.addEventListener('click',()=>{prefs.theme=b.dataset.t;savePrefs();applyLook()}));
$$('#art button').forEach(b=>b.addEventListener('click',()=>{prefs.art=b.dataset.a;savePrefs();applyLook()}));

/* ---------- game hooks ---------- */
const baseHooks={
  sound:tone,
  fly,
  rack:renderRack,
  shift(){if(drag&&drag.r!=null)drag.r--;kb.r=Math.max(0,kb.r-1)},
  ko(b,k){
    if(b!==G.player){tone(880,.25,'triangle',.07);if(k===G.player)G.player.pops.push({text:'KO! Power up',x:3,y:5,col:'#F7C548',size:1.1,life:80})}
    updateAim();
  },
  end(res){
    const B=G.player,won=res.won,n=G.boards.length,D=DIFFS[G.d].name;
    if(won)best.wins++;
    best.score=Math.max(best.score,B.score);best.chain=Math.max(best.chain,B.maxChain);saveBest();
    $('#eTitle').textContent=won?'You win':(n>2?`${placeName(res.place)} of ${n}`:'Topped out');
    if(G.online){
      const w=res.winner;
      $('#eSub').textContent=won?`Last kitchen standing. Nice cooking.`:(w?`${w.name} wins the match.`:'Match over.');
      $('#bAgain').textContent='Back to lobby';$('#bMenu').textContent='Leave room';
    }else{
      $('#eSub').textContent=won
        ?(n>2?`Last kitchen standing on ${D}.`:`${G.boards[1].name}'s stack overflowed on ${D}.`)
        :(B.killedBy?`${B.killedBy.name} knocked you out on ${D}.`:`Your stack hit the top on ${D}.`);
      $('#bAgain').textContent='Play again';$('#bMenu').textContent='Change mode';
    }
    recordScore(res);
    $('#eTime').textContent=fmt(G.frame);$('#eChain').textContent=B.maxChain;$('#eScore').textContent=B.score;
    $('#eSent').textContent=B.sent;$('#eBlock').textContent=B.blocked;$('#eKO').textContent=B.kos;
    tone(won?660:200,.4,'triangle',.08);
    B.raising=false;
    setTimeout(()=>{if(G&&G.over){$('#outToast').hidden=true;show('#ovEnd')}},700);
  }
};

/* ---------- scores & leaderboards ---------- */
const SCORES=window.FFScores&&window.FFScores.enabled?window.FFScores:null;
let deviceId='';
try{deviceId=localStorage.getItem('ff-device')||''}catch(e){}
if(!/^[\w-]{8,64}$/.test(deviceId)){deviceId='d-'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));try{localStorage.setItem('ff-device',deviceId)}catch(e){}}
const boardKey=(mode,d)=>mode+'-'+(mode==='online'?1:d);
let localScores={};
try{localScores=JSON.parse(localStorage.getItem('ff-scores')||'{}')||{}}catch(e){}
function saveLocal(key,row){
  const list=(localScores[key]||[]).concat(row).sort((a,b)=>b.score-a.score||a.at-b.at).slice(0,20);
  localScores[key]=list;try{localStorage.setItem('ff-scores',JSON.stringify(localScores))}catch(e){}
  return list;
}
let lastBoard={mode:'duel',d:1};
function recordScore(res){
  const B=G.player,mode=G.online?'online':G.mode,d=G.online?1:G.d,key=boardKey(mode,d);
  lastBoard={mode,d};
  const prevBest=(localScores[key]||[])[0];
  const row={name:ME.name,score:B.score,chain:B.maxChain,won:!!res.won,place:res.place||1,at:Date.now()};
  const list=saveLocal(key,row);
  const pb=!prevBest||row.score>prevBest.score;
  const el=$('#eRank');
  const localLine=pb&&B.score>0?'New personal best!':`Your best here: ${list[0].score}`;
  el.textContent=localLine;
  const duration=Math.round(G.frame/60);
  if(!SCORES||B.score<=0||duration<10)return;
  el.textContent='Saving your score…';
  SCORES.submit({deviceId,name:ME.name,mode,difficulty:d,score:B.score,maxChain:B.maxChain,kos:B.kos,won:!!res.won,place:res.place||1,duration,version:VERSION})
    .then(r=>{
      if(!r||!r.ok){el.textContent=localLine+(r&&r.reason==='too_fast'?'':' · Leaderboard unavailable right now');return}
      el.textContent=`#${r.rank_day} today · #${r.rank_all} all time`+(r.personal_best?' · New personal best!':'');
    });
}
const lb={mode:'duel',d:1,period:'day',req:0};
function setSeg(id,v){$$(id+' button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===String(v))))}
function openBoard(mode,d){
  if(mode){lb.mode=mode;lb.d=d}
  openSub('#ovBoard');loadBoard();
}
const dateFmt=t=>{const d=new Date(t),now=Date.now(),h=(now-d)/36e5;return h<1?'just now':h<24?Math.floor(h)+'h ago':d.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
async function loadBoard(){
  setSeg('#lbMode',lb.mode);setSeg('#lbDiff',lb.d);setSeg('#lbPeriod',lb.period);
  $('#lbDiff').hidden=lb.mode==='online';$('#lbPeriod').hidden=!SCORES;
  const list=$('#lbList'),req=++lb.req;
  const meta=r=>`${r.max_chain||r.chain||1}-chain · ${r.won?'Won':placeName(r.place||2)}`;
  const row=(rank,name,score,sub,mine)=>`<li${mine?' class="mine"':''}><span class="rk">${rank}</span><div class="who"><b>${esc(name)}</b><span>${sub}</span></div><span class="sc">${score}</span></li>`;
  if(!SCORES){
    $('#lbSrc').textContent='Your games on this device';$('#lbNote').textContent='';
    const rows=localScores[boardKey(lb.mode,lb.d)]||[];
    list.innerHTML=rows.length?rows.slice(0,10).map((r,i)=>row(i+1,r.name,r.score,meta(r)+' · '+dateFmt(r.at),false)).join(''):'<li class="lbempty">No games here yet. Finish one to set a score.</li>';
    return;
  }
  $('#lbSrc').textContent='Everyone · best score per cook';$('#lbNote').textContent=lb.period==='day'?'Last 24 hours':'';
  list.innerHTML='<li class="lbempty">Loading…</li>';
  try{
    const rows=await SCORES.board(lb.mode,lb.d,lb.period,deviceId,50);
    if(req!==lb.req)return;
    let html='',prev=0;
    rows.forEach(r=>{if(r.rank>prev+1&&prev)html+='<li class="gap">⋯</li>';prev=r.rank;html+=row(r.rank,r.name,r.score,meta(r)+' · '+dateFmt(r.created_at),r.mine)});
    list.innerHTML=html||'<li class="lbempty">No scores yet. Be the first!</li>';
  }catch(e){
    if(req!==lb.req)return;
    list.innerHTML='<li class="lbempty">Couldn\'t load the leaderboard. Check your connection and try again.</li>';
  }
}
['#lbMode','#lbDiff','#lbPeriod'].forEach(id=>$$(id+' button').forEach(b=>b.addEventListener('click',()=>{
  const v=b.dataset.v;if(id==='#lbMode')lb.mode=v;else if(id==='#lbDiff')lb.d=+v;else lb.period=v;loadBoard();
})));
$('#bBoard').addEventListener('click',()=>openBoard());
$('#bBoardEnd').addEventListener('click',()=>openBoard(lastBoard.mode,lastBoard.d));

/* ---------- practice ---------- */
function startPractice(d,mode){
  wakeAudio();
  lastDiff=d;lastMode=mode;
  G=new Game(mode,d,baseHooks);
  rackIds='~';trayKey='~';
  hideAll();buildOpps();renderRack();resize();
}
let pickMode='duel';
$$('#mode button').forEach(b=>b.addEventListener('click',()=>{
  pickMode=b.dataset.m;$$('#mode button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));
$$('.diff [data-d]').forEach(b=>b.addEventListener('click',()=>startPractice(+b.dataset.d,pickMode)));
function openPause(){
  if(!G||G.over)return;
  const on=G.online;
  if(!on)G.paused=true;
  $('#pTitle').textContent=on?'Leave match?':'Paused';$('#pSub').hidden=!on;
  $('#bQuit').textContent=on?'Leave room':'Quit';
  if(G.player)G.player.raising=false;drag=null;
  show('#ovPause');
}
function closePause(){if(G&&!G.online)G.paused=false;hideAll()}
$('#bPause').addEventListener('click',()=>{if(!$('#ovPause').hidden)closePause();else if(!anyOverlay())openPause()});
$('#bResume').addEventListener('click',closePause);
$('#bQuit').addEventListener('click',()=>{if(G&&G.online){leaveRoom()}else{if(G)G.over=true;toMenu()}});
$('#bAgain').addEventListener('click',()=>{if(G&&G.online)backToLobby();else startPractice(lastDiff,lastMode)});
$('#bMenu').addEventListener('click',()=>{if(G&&G.online)leaveRoom();else toMenu()});
$('#bSound').addEventListener('click',()=>{prefs.muted=!prefs.muted;savePrefs();showMute();wakeAudio()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&G&&!G.over&&!G.online&&!G.paused&&!anyOverlay())openPause()});
function toMenu(){showBest();demo();show('#ovStart')}
function demo(){G=new Game('duel',1,baseHooks);G.paused=true;rackIds='~';trayKey='~';buildOpps();renderRack()}

/* ---------- profile ---------- */
const ME={id:(crypto.randomUUID?crypto.randomUUID():'u'+Math.random().toString(36).slice(2)+Date.now().toString(36)),name:''};
const nameIn=$('#nameIn');
ME.name=prefs.name||('Cook '+(100+Math.floor(Math.random()*900)));
nameIn.value=prefs.name||'';nameIn.placeholder=ME.name;
nameIn.addEventListener('input',()=>{const v=nameIn.value.trim().slice(0,14);prefs.name=v;savePrefs();ME.name=v||nameIn.placeholder});

/* ---------- online ---------- */
let lobbyMembers=[],fillBots=true,botSkill=1,countTimer=null,inRoom=false;
const onlineMsg=t=>{$('#onlineMsg').textContent=t||''};
const lobbyMsg=t=>{$('#lobbyMsg').textContent=t||''};
if(!NET){
  $('#onlineNote').textContent=typeof window.FFNet==='undefined'?'Online play runs at foodfight.grudgematchgames.com':'Online play is not set up yet';
  $('#bOnline').disabled=true;
}
$('#bOnline').addEventListener('click',()=>{if(!NET)return;wakeAudio();onlineMsg('');openSub('#ovOnline')});
async function enterRoom(code){
  onlineMsg('Connecting…');$('#bCreate').disabled=$('#bJoin').disabled=true;
  try{
    await NET.join(code,{id:ME.id,name:ME.name});
    inRoom=true;
    try{history.replaceState(null,'','?room='+code)}catch(e){}
    $('#roomCode').textContent=code;lobbyMsg('');
    show('#ovLobby');renderLobby();
  }catch(e){
    onlineMsg("Couldn't reach the game server. Check your connection and try again.");
  }finally{$('#bCreate').disabled=$('#bJoin').disabled=false}
}
$('#bCreate').addEventListener('click',()=>enterRoom(NET.makeCode()));
const codeIn=$('#codeIn');
codeIn.addEventListener('input',()=>{codeIn.value=codeIn.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4)});
function tryJoin(){const c=codeIn.value;if(c.length!==4){onlineMsg('Room codes are 4 letters.');return}enterRoom(c)}
$('#bJoin').addEventListener('click',tryJoin);
codeIn.addEventListener('keydown',e=>{if(e.key==='Enter')tryJoin()});
async function leaveRoom(){
  inRoom=false;clearInterval(countTimer);
  if(NET)await NET.leave();
  try{history.replaceState(null,'',location.pathname)}catch(e){}
  toMenu();
}
$('#bLeave').addEventListener('click',leaveRoom);
$('#bOutLeave').addEventListener('click',backToLobby);
function backToLobby(){
  if(!inRoom){toMenu();return}
  NET.setState('lobby');$('#outToast').hidden=true;
  show('#ovLobby');renderLobby();
}
$('#bInvite').addEventListener('click',async()=>{
  const url=location.origin+location.pathname+'?room='+NET.code;
  const text=`Join my Food Fight room: ${NET.code}`;
  try{if(navigator.share){await navigator.share({title:'Food Fight',text,url});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(url);lobbyMsg('Invite link copied.')}catch(e){lobbyMsg(url)}
});
$('#fillBots').addEventListener('change',e=>{fillBots=e.target.checked;renderLobby()});
$$('#botSkill button').forEach(b=>b.addEventListener('click',()=>{botSkill=+b.dataset.d;$$('#botSkill button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}));
function isHost(){return lobbyMembers.length&&lobbyMembers[0].id===ME.id}
function renderLobby(){
  if(!inRoom)return;
  const me=lobbyMembers.findIndex(m=>m.id===ME.id),host=lobbyMembers[0];
  const playing=lobbyMembers.filter(m=>m.state==='playing');
  const seated=lobbyMembers.slice(0,4);
  const ul=$('#seats');ul.innerHTML='';
  seated.forEach((m,i)=>{
    const li=document.createElement('li');
    const tag=m.state==='playing'?'In a match':i===0?'Host':m.id===ME.id?'You':'';
    li.innerHTML=`<i class="dot"></i>${esc(m.name)}${m.id===ME.id&&i===0?' (you)':''}<span>${tag}</span>`;
    ul.appendChild(li);
  });
  const hostView=isHost();
  for(let i=seated.length;i<4;i++){
    const li=document.createElement('li');
    if(hostView&&fillBots){li.className='bot';li.innerHTML=`<i class="dot"></i>${BOTNAMES[i-seated.length]||'Bot'}<span>Bot</span>`}
    else{li.className='empty';li.textContent='Open seat'}
    ul.appendChild(li);
  }
  $('#seatCount').textContent=`· ${seated.length} of 4`;
  $('#hostBox').hidden=!hostView;$('#bStart').hidden=!hostView;
  if(me>=4)lobbyMsg('This room is full. You can wait here for an open seat.');
  else if(playing.length)lobbyMsg(playing.some(m=>m.id===ME.id)?'':'A match is in progress. You will be in the next one.');
  else if(!hostView&&host)lobbyMsg(`Waiting for ${host.name} to start.`);
  else if(hostView&&seated.length<2&&!fillBots)lobbyMsg('Share the code, or turn on bots to play now.');
  else lobbyMsg('');
  $('#bStart').disabled=!!playing.length||(seated.length<2&&!fillBots);
}
$('#bStart').addEventListener('click',()=>{
  if(!isHost())return;
  const humans=lobbyMembers.filter(m=>m.state!=='playing').slice(0,4);
  const roster=humans.map(h=>({id:h.id,name:h.name}));
  if(fillBots)for(let i=0;roster.length<4;i++)roster.push({id:`bot:${ME.id}:${i}`,name:BOTNAMES[i],bot:true,owner:ME.id});
  if(roster.length<2){lobbyMsg('Need at least one more cook. Share the code or turn on bots.');return}
  const m={t:'start',mid:Math.random().toString(36).slice(2,10),seed:Math.floor(Math.random()*2**31),roster,diff:botSkill,delay:3000};
  NET.send(m);onStart(m);
});
function onStart(m){
  if(!inRoom||!m||!Array.isArray(m.roster)||m.roster.length<2||m.roster.length>4)return;
  if(!m.roster.some(r=>r.id===ME.id)){if(!$('#ovLobby').hidden)lobbyMsg('A match just started. You will be in the next one.');return}
  wakeAudio();NET.setState('playing');
  clearInterval(countTimer);
  // build the match now so everyone sees boards during the countdown
  G=new Game('online',Math.max(0,Math.min(2,m.diff|0)),Object.assign({},baseHooks,{
    send:x=>{x.mid=m.mid;NET.send(x)},
    out:place=>{$('#outText').textContent=`You placed ${placeName(place)}. Watching the rest of the match.`;$('#outToast').hidden=false}
  }),false,{roster:m.roster.map(r=>({id:String(r.id),name:String(r.name||'Cook').slice(0,14),bot:!!r.bot,owner:r.owner?String(r.owner):undefined})),myId:ME.id,seed:m.seed>>>0});
  G.mid=m.mid;G.paused=true;G.waiting=true;
  rackIds='~';trayKey='~';buildOpps();renderRack();resize();
  let n=Math.max(1,Math.round((m.delay||3000)/1000));
  $('#countNum').textContent=n;show('#ovCount');tone(440,.12);
  countTimer=setInterval(()=>{
    n--;
    if(n>0){$('#countNum').textContent=n;tone(440,.12)}
    else{clearInterval(countTimer);hideAll();tone(880,.18);if(G&&G.mid===m.mid){G.paused=false;G.waiting=false}}
  },1000);
}
if(NET){
  NET.on({
    message(m){
      if(m.t==='start'){onStart(m);return}
      if(!G||!G.online||m.mid!==G.mid)return;
      if(m.t==='snaps')G.netSnaps(m.list);
      else if(m.t==='atk')G.netAttack(m);
      else if(m.t==='ko')G.netKO(m.id,m.by);
    },
    members(list){
      lobbyMembers=list;renderLobby();
      if(G&&G.online&&!G.over){
        const here=new Set(list.map(x=>x.id));
        G.boards.forEach(b=>{if(b.remote&&!b.dead&&!here.has(b.owner))G.netLeave(b.owner)});
      }
    },
    left(id){if(G&&G.online&&!G.over)G.netLeave(id)}
  });
  const q=new URLSearchParams(location.search).get('room');
  if(q&&/^[A-Za-z]{4}$/.test(q)){codeIn.value=q.toUpperCase();openSub('#ovOnline');enterRoom(q.toUpperCase())}
}

/* ---------- boot ---------- */
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=ICONS[e.dataset.icon]);
showMute();showBest();
demo();applyLook();
window.__ff={get game(){return G}}; // handy for debugging in the console

let acc=0,last=performance.now(),hf=0,lastMargin=1,lastG=null;
function loop(now){
  acc+=Math.min(100,now-last);last=now;
  while(acc>=1000/60){if(G)G.step();acc-=1000/60}
  if(G!==lastG){lastG=G;lastMargin=1}
  if(G&&!G.over&&!G.paused&&!G.player.dead){const m=G.margin();if(m>lastMargin){lastMargin=m;G.player.pops.push({text:`Overtime · throws ×${m.toFixed(1)}`,x:3,y:4,col:'#F7C548',size:.85,life:90});tone(330,.2,'triangle',.05)}}
  render();
  if(++hf%3===0&&G){updateOpps();renderTray();hud();updateAim()}
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
