// Food Fight UI: drawing, input, settings, practice mode and the online lobby.
(function(){
const VERSION='1.3.0';
let spec=null; // board being spectated after you're knocked out
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
const CZ=window.FFCuisines||{CUISINES:{},CUISINE_ORDER:['market']};
let czOverride=null;   // lets the cuisine picker draw a preview of a kitchen you haven't picked yet
const cuisine=()=>czOverride||(CZ.CUISINES[prefs.cuisine]?prefs.cuisine:'market');
const names=()=>prefs.art==='shapes'?SHAPE_NAMES:cuisine()==='market'?FOOD_NAMES:CZ.CUISINES[cuisine()].foods;
let prefs={palette:'classic',theme:'night',muted:false,name:'',art:'food',av:'bun',variant:'classic',cuisine:'market',stackCtl:'buttons'};
const VARIANT_INFO={
  classic:{name:'Classic',tag:'Swap and splat',sizes:['Duel','Brawl','Big Brawl']},
  order:{name:'Order Up!',tag:'Ticket race',sizes:['Duel','Race of 4','Race of 8']},
  stack:{name:'Snack Stack',tag:'Falling pairs',sizes:['Duel','Brawl','Big Brawl']},
  shot:{name:'Splat Shot',tag:'Aim and pop',sizes:['Duel','Brawl','Big Brawl']},
  boss:{name:'Boss Brawl',tag:'Co-op vs a boss',sizes:['Duo','Team of 4','Team of 8']}};
const VARIANT_KEYS=Object.keys(VARIANT_INFO);
const ART={
  logo:'assets/logo.webp',
  bun:'assets/bun.webp','bun-face':'assets/bun-face.webp',
  sprinkles:'assets/sprinkles.webp','sprinkles-face':'assets/sprinkles-face.webp',
  crunch:'assets/crunch.webp','crunch-face':'assets/crunch-face.webp',
  slice:'assets/slice.webp','slice-face':'assets/slice-face.webp',
  fudge:'assets/fudge.webp','fudge-face':'assets/fudge-face.webp',
  splat:'assets/splat.webp','splat-face':'assets/splat-face.webp',
  guac:'assets/guac.webp','guac-face':'assets/guac-face.webp',
  glaze:'assets/glaze.webp','glaze-face':'assets/glaze-face.webp',
};
const FIGHTER_INFO={bun:{name:'Patty',tag:'Burger brawler'},sprinkles:{name:'Sprinkles',tag:'Sweet and savage'},crunch:{name:'Crunch',tag:'Shell-shocker'},slice:{name:'Slice',tag:'Hot and cheesy'},fudge:{name:'Fudge',tag:'Tough cookie'},splat:{name:'Splat',tag:'Saucy striker'},guac:{name:'Guac',tag:'Ninja of the pit'},glaze:{name:'Glaze',tag:'Sugar-rush slugger'}};
const face=av=>ART[(FIGHTERS.includes(av)?av:'bun')+'-face'];
const body=av=>ART[FIGHTERS.includes(av)?av:'bun'];
const avImg=(av,cls)=>`<img class="${cls||'av'}" src="${face(av)}" alt="" width="64" height="64">`;
try{const s=JSON.parse(localStorage.getItem('ff-prefs')||'null');if(s)prefs=Object.assign(prefs,s)}catch(e){}
if(!VARIANT_INFO[prefs.variant])prefs.variant='classic';
if(!PALETTES[prefs.palette])prefs.palette='classic';
if(!['food','shapes'].includes(prefs.art))prefs.art='food';
if(!FIGHTERS.includes(prefs.av))prefs.av='bun';
if(!['night','day','auto'].includes(prefs.theme))prefs.theme='night';
function savePrefs(){try{localStorage.setItem('ff-prefs',JSON.stringify(prefs))}catch(e){}}
let PAL=PALETTES[prefs.palette],TOK={};
function readTokens(){
  const cs=getComputedStyle(document.documentElement),g=n=>cs.getPropertyValue(n).trim();
  TOK={well:g('--well')||'#0B0D1B',grid:g('--grid')||'rgba(255,255,255,.025)',shade:g('--shade')||'rgba(11,13,27,.35)',bg:g('--bg')||'#131627',panel:g('--panel')||'#1C2038'};
}
// phones: while a full-screen menu is up, the page behind it and the browser bars match the sheet colour
function sheetTint(){try{sheetTint0()}catch(e){}}
function sheetTint0(){
  const open=OVS.some(s=>!$(s).hidden&&$(s).classList.contains('sheet'))&&matchMedia('(max-width:600px)').matches;
  document.documentElement.classList.toggle('sheet-open',open);
  const tc=document.querySelector('meta[name="theme-color"]');if(tc&&TOK)tc.setAttribute('content',open?TOK.panel:TOK.bg);
}
function applyLook(){
  PAL=PALETTES[prefs.palette];
  document.documentElement.setAttribute('data-ff-theme',prefs.theme);
  readTokens();
  sheetTint();
  renderPals();renderCuisines();
  $$('#theme button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.t===prefs.theme)));
  $$('#art button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.a===prefs.art)));
  $$('#stackCtl button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.s===(prefs.stackCtl||'buttons'))));
  render();minis.forEach(renderMini);
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(prefs.theme==='auto')applyLook()});

/* ---------- saved bests ---------- */
let best={score:0,chain:1,wins:0};
try{const s=JSON.parse(localStorage.getItem('ff-best')||'null');if(s)best=Object.assign(best,s)}catch(e){}
function saveBest(){try{localStorage.setItem('ff-best',JSON.stringify(best))}catch(e){}}
function showBest(){$('#best').textContent=(best.wins||best.score?`Your best: ${best.score} points · ${best.chain}-chain · ${best.wins} win${best.wins===1?'':'s'} · `:'')+'v'+VERSION}

/* ---------- audio (js/sfx.js does the synthesis) ---------- */
const SND=window.FFSound;
const sfx=(n,a)=>SND&&SND.play(n,a);
function wakeAudio(){if(SND)SND.wake()}
function showMute(){$('#wave').style.opacity=prefs.muted?0:1;$('#bSound').setAttribute('aria-label',prefs.muted?'Sound off':'Sound on');if(SND)SND.setMuted(prefs.muted)}

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
  const cz=cuisine();if(cz!=='market'&&CZ.CUISINES[cz]){CZ.CUISINES[cz].draw(c,t,x,y,s,()=>outline(c,s));return}
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
  const px=Math.max(8,Math.round(s*DPR)),key=prefs.art+'|'+cuisine()+'|'+pal.name+'|'+t+'|'+px;
  let sp=sprites.get(key);
  if(!sp){
    if(sprites.size>600)sprites.clear();
    sp=document.createElement('canvas');sp.width=sp.height=px;
    drawTileArt(sp.getContext('2d'),t,0,0,px,pal,prefs.art);
    sprites.set(key,sp);
  }
  return sp;
}
const SPECIAL_COL={cream:'#FFF6E8',freeze:'#9BE3FF',blender:'#E7A6D1',pin:'#E0A86E',plate:'#FFFFFF',swap:'#56B4E9',steam:'#EEF0FA',grease:'#F7C548',rainbow:'#F0E442',bomb:'#D7263D',sauce:'#E5682A'};
function drawBadgeIcon(c,k,cx,cy,r){
  c.save();c.lineCap='round';c.lineJoin='round';
  if(k==='cream'){c.fillStyle='#FFF6E8';[[0,.45,.62],[0,.05,.48],[0,-.32,.32]].forEach(([dx,dy,rr2])=>{c.beginPath();c.ellipse(cx+dx*r,cy+dy*r,rr2*r*1.25,rr2*r*.75,0,0,Math.PI*2);c.fill()});c.beginPath();c.moveTo(cx,cy-.55*r);c.lineTo(cx+.12*r,cy-.8*r);c.lineWidth=r*.18;c.strokeStyle='#FFF6E8';c.stroke()}
  else if(k==='freeze'){c.strokeStyle='#9BE3FF';c.lineWidth=r*.16;for(let i=0;i<3;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(cx-Math.cos(a)*r*.75,cy-Math.sin(a)*r*.75);c.lineTo(cx+Math.cos(a)*r*.75,cy+Math.sin(a)*r*.75);c.stroke()}}
  else if(k==='blender'){c.fillStyle='#E7A6D1';c.beginPath();c.moveTo(cx-r*.5,cy-r*.65);c.lineTo(cx+r*.5,cy-r*.65);c.lineTo(cx+r*.35,cy+r*.25);c.lineTo(cx-r*.35,cy+r*.25);c.closePath();c.fill();c.fillStyle='#FFFFFF';c.fillRect(cx-r*.45,cy+r*.32,r*.9,r*.38)}
  else if(k==='steam'){c.fillStyle='#EEF0FA';[[-.3,.1,.36],[.15,-.05,.44],[.45,.15,.3]].forEach(([dx,dy,rr2])=>{c.beginPath();c.arc(cx+dx*r,cy+dy*r,rr2*r,0,Math.PI*2);c.fill()})}
  else if(k==='grease'){c.fillStyle='#F7C548';c.beginPath();c.moveTo(cx,cy-r*.8);c.quadraticCurveTo(cx+r*.75,cy+r*.1,cx,cy+r*.7);c.quadraticCurveTo(cx-r*.75,cy+r*.1,cx,cy-r*.8);c.fill()}
  else if(k==='rainbow'){c.lineWidth=r*.2;[['#E5682A',.7],['#F0E442',.48],['#56B4E9',.26]].forEach(([col,rad])=>{c.strokeStyle=col;c.beginPath();c.arc(cx,cy+r*.3,r*rad,Math.PI,0);c.stroke()})}
  else if(k==='bomb'){c.fillStyle='#D7263D';c.beginPath();c.arc(cx-r*.08,cy+r*.12,r*.55,0,Math.PI*2);c.fill();c.strokeStyle='#F7C548';c.lineWidth=r*.16;c.beginPath();c.moveTo(cx+r*.3,cy-r*.3);c.lineTo(cx+r*.55,cy-r*.65);c.stroke()}
  else if(k==='sauce'){c.fillStyle='#E5682A';c.fillRect(cx-r*.3,cy-r*.3,r*.6,r*.9);c.fillRect(cx-r*.14,cy-r*.75,r*.28,r*.5)}
  else if(k==='swap'){c.strokeStyle='#56B4E9';c.fillStyle='#56B4E9';c.lineWidth=r*.2;c.beginPath();c.arc(cx,cy,r*.55,Math.PI*1.1,Math.PI*1.9);c.stroke();c.beginPath();c.arc(cx,cy,r*.55,Math.PI*.1,Math.PI*.9);c.stroke();[[cx+r*.55*Math.cos(Math.PI*1.9),cy+r*.55*Math.sin(Math.PI*1.9),1],[cx+r*.55*Math.cos(Math.PI*.9),cy+r*.55*Math.sin(Math.PI*.9),-1]].forEach(([x,y,d])=>{c.beginPath();c.moveTo(x+r*.28*d,y);c.lineTo(x-r*.05*d,y-r*.3*d);c.lineTo(x-r*.12*d,y+r*.12*d);c.closePath();c.fill()})}
  else if(k==='plate'){c.fillStyle='#FFFFFF';c.beginPath();c.arc(cx,cy,r*.78,0,Math.PI*2);c.fill();c.strokeStyle='#B9C2D8';c.lineWidth=r*.12;c.beginPath();c.arc(cx,cy,r*.48,0,Math.PI*2);c.stroke();c.fillStyle='#F7C548';c.beginPath();c.moveTo(cx+r*.55,cy-r*.95);c.lineTo(cx+r*.66,cy-r*.66);c.lineTo(cx+r*.95,cy-r*.55);c.lineTo(cx+r*.66,cy-r*.44);c.lineTo(cx+r*.55,cy-r*.15);c.lineTo(cx+r*.44,cy-r*.44);c.lineTo(cx+r*.15,cy-r*.55);c.lineTo(cx+r*.44,cy-r*.66);c.closePath();c.fill()}
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
  const mu=MODE_UI[G.variant];if(mu&&mu.render){mu.render();return}
  const B=spec||G.player,mine=B===G.player,ro=B.rise*S,f=G.frame;
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
  if(mine&&drag&&(drag.mode==='h'||drag.mode==='v')&&drag.r!=null&&drag.r>=0){
    const t=B.g[drag.r]&&B.g[drag.r][drag.c];
    if(t){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2.5;rr(ctx,drag.c*S+t.xo*S+1.5,drag.r*S-ro+t.yo*S+1.5,S-3,S-3,S*.2);ctx.stroke()}
  }
  if(mine&&kb.on){ctx.strokeStyle='#F7C548';ctx.lineWidth=3;rr(ctx,kb.c*S+1.5,kb.r*S-ro+1.5,S*2-3,S-3,S*.22);ctx.stroke()}
  drawEffects(ctx,B,W,H,f);
  if(B.streak>=1&&B.streakType!=null&&!B.dead){
    const k=B.streak,next=k===1?'Double':k===2?'Snack':'FEAST',sz=S*.62,x=S*.12,y=S*.38;
    const label=`×${k} → ${next}`;
    ctx.font=`${Math.round(S*.34)}px 'Lilita One','Arial Rounded MT Bold',sans-serif`;
    const tw=ctx.measureText(label).width,w=sz+tw+S*.42,pulse=k>=3?.15*Math.sin(f*.25):0;
    ctx.globalAlpha=k===1?.6:1;
    ctx.fillStyle='rgba(20,12,28,.78)';rr(ctx,x,y,w,sz+S*.16,(sz+S*.16)/2);ctx.fill();
    if(k>=2){ctx.strokeStyle=`rgba(247,197,72,${.7+pulse})`;ctx.lineWidth=2;ctx.stroke()}
    ctx.drawImage(tileSprite(B.streakType,sz,PAL),x+S*.08,y+S*.08,sz,sz);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=k>=3?'#F7C548':'#EEF0FA';
    ctx.fillText(label,x+sz+S*.2,y+(sz+S*.16)/2+1);
    ctx.globalAlpha=1;ctx.textAlign='center';
  }
  (B.parts||[]).forEach(p=>{ctx.globalAlpha=Math.min(1,p.life/14);ctx.fillStyle=p.kind<0?'#E0A86E':PAL.c[p.kind];ctx.beginPath();ctx.arc(p.x*S,p.y*S-ro,S*.07,0,Math.PI*2);ctx.fill()});
  ctx.globalAlpha=1;
  ctx.textAlign='center';ctx.textBaseline='middle';
  (B.pops||[]).forEach(p=>{
    const a=Math.min(1,p.life/20),yy=(p.y-(60-p.life)*.012)*S-ro,xx=Math.min(Math.max(p.x*S,S*1.6),W-S*1.6);
    ctx.globalAlpha=a;ctx.font=`${Math.round(S*.62*p.size)}px 'Lilita One','Arial Rounded MT Bold',sans-serif`;
    ctx.lineWidth=S*.14;ctx.strokeStyle='#0B0D1B';ctx.strokeText(p.text,xx,yy);
    ctx.fillStyle=p.col;ctx.fillText(p.text,xx,yy);
  });
  ctx.globalAlpha=1;
  if(B.dead&&G.playerOut&&!G.over)drawKO(B,W,H);
}
// knocked out: say who did it, and point at the spectate cards
function drawKO(B,W,H){
  ctx.fillStyle='rgba(11,13,27,.62)';ctx.fillRect(0,0,W,H);
  const k=B.killedBy,mine=B===G.player,F=n=>`${Math.round(S*n)}px 'Lilita One','Arial Rounded MT Bold',sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=S*.14;ctx.strokeStyle='#0B0D1B';
  const line=(t,y,size,col)=>{ctx.font=F(size);const tw=ctx.measureText(t).width;if(tw>W*.88)ctx.font=F(size*W*.88/tw);ctx.strokeText(t,W/2,y);ctx.fillStyle=col;ctx.fillText(t,W/2,y)};
  line(B.place?placeName(B.place)+' place':'Knocked out',H*.36,.5,'#949BBD');
  line(mine?'KNOCKED OUT':`${B.name} is out`,H*.44,.8,'#EEF0FA');
  if(k){
    const im=faceImg(k.av),sz=S*1.5;
    if(im&&im.complete&&im.naturalWidth){ctx.save();ctx.beginPath();ctx.arc(W/2,H*.56,sz/2,0,Math.PI*2);ctx.clip();ctx.drawImage(im,W/2-sz/2,H*.56-sz/2,sz,sz);ctx.restore()}
    line(`by ${k===G.player?'you':k.name}`,H*.56+sz*.75,.62,'#F7C548');
  }
  if(mine)line(G.over?'':'Tap any board above to watch',H*.8,.4,'#EEF0FA');
}
const faceCache={};
function faceImg(av){if(!faceCache[av]){const im=new Image();im.src=face(av);faceCache[av]=im}return faceCache[av]}
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
  if(B.creamT>0||(B._blobs&&B._blobs.some(b=>b.amt>.08))){
    // whipped cream: blobs stay until the player rubs them off (or they melt after 15s)
    if(B.creamT>0&&B._cream!==B.creamSeed){
      B._cream=B.creamSeed;B._creamAt=G.frame;let sd=Math.floor((B.creamSeed||.5)*1e6)||7;const r=()=>(sd=(sd*16807)%2147483647)/2147483647;
      B._blobs=Array.from({length:9},()=>({x:.4+r()*(COLS-.8),y:.6+r()*ROWS*.66,r:.95+r()*.9,p:r()*6,amt:1}));
      if(B===G.player)B.pops.push({text:'Rub to wipe it off!',x:3,y:10,col:'#FFF6E8',size:.8,life:90});
    }
    const age=G.frame-(B._creamAt||0),melt=age>60*15?Math.max(0,1-(age-60*15)/60):1;
    if(B!==G.player&&!(B.creamT>0))B._blobs=null;   // other boards: show cream only while it's actually on
    const left=B._blobs?B._blobs.filter(b=>b.amt*melt>.08).length:0;
    if(left&&B===G.player&&B.creamT<3)B.creamT=3;   // keep the effect (and the opponent's view of it) alive until wiped
    if(!left){B.creamT=0;B._blobs=null}
    else B._blobs.forEach(b=>{
      const a=Math.max(0,Math.min(1,b.amt*melt));if(a<.08)return;
      const wob=Math.sin(f*.05+b.p)*S*.06,R=b.r*S*(.55+.45*a),X=b.x*S,Y=b.y*S;
      c.globalAlpha=.96*Math.min(1,a*1.4);
      c.fillStyle='#E9D9C2';[[0,0,1],[.6,.3,.7],[-.55,.35,.65]].forEach(([dx,dy,k])=>{c.beginPath();c.arc(X+dx*R,Y+dy*R+S*.08+wob,R*k,0,Math.PI*2);c.fill()});
      c.fillStyle='#FFF6E8';[[0,0,1],[.6,.3,.7],[-.55,.35,.65]].forEach(([dx,dy,k])=>{c.beginPath();c.arc(X+dx*R,Y+dy*R+wob,R*k,0,Math.PI*2);c.fill()});
      c.fillStyle='rgba(255,255,255,.7)';c.beginPath();c.arc(X-R*.3,Y-R*.35+wob,R*.18,0,Math.PI*2);c.fill();
    });
    c.globalAlpha=1;
  }
}
function renderMini(m){
  const b=m.board,c=m.ctx,w=m.cv.width,h=m.cv.height,s=w/COLS;
  c.fillStyle=TOK.well;c.fillRect(0,0,w,h);
  const ro=b.rise*s,simple=s<14,fr=G?G.frame:0;
  if(G&&G.variant==='shot'){
    const Q=SHOTGEO();if(Q)hexCells(b).forEach(p=>{c.fillStyle=p.t<0?'#B48A63':PAL.c[p.t];c.beginPath();c.arc(p.x*s,p.y*s,Q.R*s*.92,0,Math.PI*2);c.fill()});
    if(Q){c.strokeStyle='rgba(247,197,72,.5)';c.lineWidth=1;const y=(Q.DEAD_ROW*Q.RH)*s;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
    if(b.frozenT>0){c.fillStyle='rgba(150,215,255,.4)';c.fillRect(0,0,w,h)}
    if(b.dead){c.fillStyle='rgba(11,13,27,.55)';c.fillRect(0,0,w,h);c.fillStyle='#EEF0FA';c.textAlign='center';c.textBaseline='middle';c.font=`${Math.round(w*.32)}px 'Lilita One',sans-serif`;c.fillText('KO',w/2,h/2)}
    return;
  }
  for(let r=0;r<ROWS;r++)for(let k=0;k<COLS;k++){const t=b.g[r][k];if(t)drawTile(c,t,k*s+(t.xo||0)*s,r*s-ro+(t.yo||0)*s,s,b.dead?.5:1,fr,simple)}
  if(b.preview&&G&&(G.variant==='classic'||G.variant==='order'||G.variant==='boss'))for(let k=0;k<COLS;k++)drawTile(c,{t:b.preview[k],clr:0},k*s,ROWS*s-ro,s,.3,0,simple);
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
function renderCuisines(){
  const box=$('#cuisines');if(!box)return;
  if(!box.children.length){
    CZ.CUISINE_ORDER.forEach(key=>{
      const info=key==='market'?{name:'Farmers Market',note:'Tomato, cheese, donut, avocado, grapes'}:CZ.CUISINES[key];if(!info)return;
      const b=document.createElement('button');b.className='pal cz';b.type='button';b.dataset.c=key;
      b.innerHTML=`<canvas width="250" height="50" aria-hidden="true"></canvas><b>${info.name}</b><span>${info.note}</span>`;
      box.appendChild(b);
      b.addEventListener('click',()=>{prefs.cuisine=key;if(prefs.art!=='food')prefs.art='food';savePrefs();applyLook();sfx('tap')});
    });
  }
  // previews follow the current colour set
  $$('#cuisines .cz').forEach(b=>{
    const key=b.dataset.c,k=b.dataset.k||'';if(k!==prefs.palette){b.dataset.k=prefs.palette;
      const c=b.querySelector('canvas').getContext('2d');c.clearRect(0,0,250,50);
      czOverride=key;const art=prefs.art;prefs.art='food';
      for(let t=0;t<NT;t++)drawTileArt(c,t,t*50,0,50,PAL,'food');
      prefs.art=art;czOverride=null}
    b.setAttribute('aria-pressed',String(prefs.art==='food'&&cuisine()===key));
  });
}
function renderPals(){
  const box=$('#pals');
  if(box.dataset.art!==prefs.art+cuisine()){box.innerHTML='';box.dataset.art=prefs.art+cuisine()}
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
ICONS.plate='<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="9" fill="#FFFFFF" stroke="#2A1A12" stroke-width="1.3"/><circle cx="12" cy="13" r="5.5" fill="none" stroke="#B9C2D8" stroke-width="1.4"/><path d="M19 1.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" fill="#F7C548" stroke="#2A1A12" stroke-width=".8" stroke-linejoin="round"/></svg>';
ICONS.swap='<svg viewBox="0 0 24 24" fill="none" stroke="#56B4E9" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="7" height="12" rx="2" fill="#262B4A"/><rect x="15" y="6" width="7" height="12" rx="2" fill="#262B4A"/><path d="M9.5 9h5l-2-2M14.5 15h-5l2 2"/></svg>';
ICONS.steam='<svg viewBox="0 0 24 24"><path d="M6 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.6-1.2A4.2 4.2 0 0 1 18 17z" fill="#EEF0FA" stroke="#2A1A12" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 21c1-1 1-2 0-3M12 21c1-1 1-2 0-3M16 21c1-1 1-2 0-3" stroke="#B9C2D8" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
ICONS.grease='<svg viewBox="0 0 24 24"><path d="M12 3c3 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 3-6.5 6-11z" fill="#F7C548" stroke="#2A1A12" stroke-width="1.3" stroke-linejoin="round"/><ellipse cx="9.8" cy="14" rx="1.4" ry="2.4" fill="#FFF6C8"/></svg>';
ICONS.rainbow='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M3 18a9 9 0 0 1 18 0" stroke="#E5682A"/><path d="M6 18a6 6 0 0 1 12 0" stroke="#F0E442"/><path d="M9 18a3 3 0 0 1 6 0" stroke="#56B4E9"/></svg>';
ICONS.bomb='<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7" fill="#D7263D" stroke="#2A1A12" stroke-width="1.3"/><path d="M15 8l2-2" stroke="#2A1A12" stroke-width="2" stroke-linecap="round"/><path d="M18 4l1-1M20 6h1M18 2v1" stroke="#F7C548" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="8.5" cy="11.5" rx="1.6" ry="1" fill="rgba(255,255,255,.6)"/></svg>';
const LABEL={pie:'Pie',tower:'Tower',sauce:'Sauce',cream:'Cream',freeze:'Freeze',blender:'Blender',pin:'Pin',plate:'Plate',swap:'Swap',steam:'Steam',grease:'Grease',rainbow:'Rainbow',bomb:'Bomb'};
const VALUE={sauce:'3s',cream:'5s',freeze:'2.5s',blender:'Mix',pin:'Self',plate:'Pick',swap:'Board',steam:'6s',grease:'6s',rainbow:'Self',bomb:'Self'};
let rackIds='';
function renderRack(){
  const box=$('#slots'),B=G&&G.player;
  const items=B?B.rack:[],ids=items.map(i=>i.id).join(',')+'|'+plating;
  if(ids===rackIds&&box.children.length===RACK)return;
  const prev=new Set(rackIds.split('|')[0].split(','));rackIds=ids;
  box.innerHTML='';
  for(let i=0;i<RACK;i++){
    const it=items[i],b=document.createElement('button');b.type='button';
    if(it){
      b.className='slot full'+(prev.has(String(it.id))?'':' new')+(plating===it.id?' arming':'');
      b.innerHTML=ICONS[it.k]+`<b>${VALUE[it.k]||it.cells}</b><span>${LABEL[it.k]}</span>`;
      b.setAttribute('aria-label',`Throw ${LABEL[it.k]}${it.cells?' '+it.cells:''}`);
      b.addEventListener('pointerdown',e=>{
        e.preventDefault();if(!canPlay())return;if(plating===it.id){cancelPlate();return}
        if(!G.boss||SELF_KINDS.includes(it.k)){G.player.fire(i);return}
        // Boss Brawl: tap throws at the boss, hold for half a second to hand it to the teammate in the most trouble
        const id=it.id;let gave=false;
        const t=setTimeout(()=>{gave=true;b.classList.add('giving');giveItem(id)},450);
        const up=()=>{clearTimeout(t);b.removeEventListener('pointerup',up);b.removeEventListener('pointerleave',up);b.removeEventListener('pointercancel',up);if(!gave&&G){const k=G.player.rack.findIndex(x=>x.id===id);if(k>=0)G.player.fire(k)}};
        b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);b.addEventListener('pointercancel',up);
      });
    }else{b.className='slot';b.disabled=true;b.setAttribute('aria-label','Empty rack slot')}
    box.appendChild(b);
  }
}

function giveItem(id){
  const B=G.player,i=B.rack.findIndex(x=>x.id===id);if(i<0)return;
  const mates=G.alive().filter(b=>b!==B).sort((a,b)=>b.height()-a.height());
  const to=mates[0];if(!to){B.pops.push({text:'Nobody to help',x:3,y:6,col:'#EEF0FA',size:.75,life:50});return}
  const it=B.rack.splice(i,1)[0];
  if(to.remote){G.hooks.send&&G.hooks.send({t:'give',to:to.id,from:B.id,k:it.k,cells:it.cells|0,ac:null,ar:null})}
  else to.takeItem({k:it.k,cells:it.cells,at:null},B);
  fly(B,to,it,i);B.pops.push({text:`Passed to ${to.name}!`,x:3,y:6,col:'#56B4E9',size:.85,life:60});sfx('earn',true);renderRack();
}
/* ---------- clean plate: tap it, then tap a food on your board ---------- */
let plating=null;
function plateIndex(){return G&&plating!=null?G.player.rack.findIndex(x=>x.id===plating):-1}
function usePlateOn(t){
  const i=plateIndex();
  if(i<0){cancelPlate();return}
  if(!t||t.t<0||t.clr>0){G.player.pops.push({text:'Tap a food to clear',x:3,y:6,col:'#EEF0FA',size:.75,life:50});return}
  plating=null;G.player.fire(i,t.t);updatePlateHint();renderRack();
}
function cancelPlate(){if(plating==null)return;plating=null;updatePlateHint();renderRack()}
function updatePlateHint(){aimName='';if(G)updateAim();$('#board').classList.toggle('picking',plating!=null)}
/* ---------- opponents ---------- */
const multi=()=>G&&G.boards.length>2;
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function buildOpps(){
  const box=$('#opps');box.innerHTML='';box.classList.toggle('duel',!multi());box.classList.toggle('many',G.boards.length>4);
  minis=G.boards.filter(b=>b!==G.player).map(b=>{
    const el=document.createElement('div');el.className='foe';el.title=b.name;
    el.innerHTML=`<div class="nm">${esc(b.name)}</div><div class="body"><div class="mb"><canvas></canvas>${avImg(b.av)}</div><div class="who"><div class="st">Cooking</div><div class="meta"></div><div class="tag" hidden>Aim</div><div class="eye">Watching</div></div></div>`;
    el.addEventListener('click',()=>watchBoard(b));
    box.appendChild(el);
    const cvm=el.querySelector('canvas');
    return {board:b,el,cv:cvm,ctx:cvm.getContext('2d'),st:el.querySelector('.st'),meta:el.querySelector('.meta'),tag:el.querySelector('.tag')};
  });
  $('#rail').hidden=G.variant!=='order';railKey='';setControls();
  const bb=$('#bossBar');bb.hidden=!G.boss;
  if(G.boss){$('#bossImg').src=body(G.boss.av);$('#bossImg').alt=G.boss.name;$('#bossName').textContent=G.boss.name.toUpperCase();bossKey=''}
  sizeMinis();updateAim();
}
/* ---------- Order Up! tickets ---------- */
let railKey='';
const ticketIcon={};
function foodIcon(t){const k=t+'|'+prefs.palette+prefs.art+cuisine()+cuisine();if(!ticketIcon[k]){const c=document.createElement('canvas');c.width=c.height=36;drawTile(c.getContext('2d'),{t,clr:0},0,0,36,1,0);ticketIcon[k]=c.toDataURL()}return ticketIcon[k]}
function renderRail(){
  const B=G&&G.player;if(!B||!B.tickets)return;
  const key=B.tickets.map(t=>t.id+':'+t.items.map(i=>i.got).join('.')+(t.rush?':'+Math.ceil(t.T/60):'')).join('|')+'|'+prefs.palette+prefs.art+cuisine();
  if(key===railKey)return;railKey=key;
  $('#rail').innerHTML=B.tickets.map(tk=>{
    const secs=Math.ceil(tk.T/60);
    return `<div class="ticket${tk.rush?' rush':''}${tk.rush&&secs<=5?' cold':''}"><div class="th"><span>#${tk.id}${tk.rush?' 🔥':''}</span>${tk.rush?`<em>0:${String(secs).padStart(2,'0')}</em>`:''}</div>`+
      tk.items.map(it=>`<div class="ln${it.got>=it.n?' done':''}"><img src="${foodIcon(it.t)}" width="18" height="18" alt="${names()[it.t]}"><b>${it.got}/${it.n}</b><i><u style="width:${it.got/it.n*100}%"></u></i></div>`).join('')+'</div>';
  }).join('');
}
/* ---------- Boss Brawl bar ---------- */
let bossKey='';
function renderBoss(){
  const b=G&&G.boss;if(!b)return;
  const bar=$('#bossBar');bar.classList.toggle('hit',b.hitT>0);bar.classList.toggle('phase3',b.phase>=3);
  const nx=b.next,to=nx&&G.byId(nx.to),secs=Math.max(0,Math.ceil((b.nextAt-G.frame)/60));
  const what=nx?({pie:'Pie barrage',sauce:'Hot sauce',cream:'Whipped cream',freeze:'Brain freeze',blender:'Blender'}[nx.k]||'Attack'):'';
  const key=b.hp+'|'+b.phase+'|'+(nx?nx.k+nx.to+secs:'');
  if(key===bossKey)return;bossKey=key;
  $('#bossHp').style.width=(b.hp/b.max*100)+'%';
  $('#bossHpText').textContent=`HP ${Math.ceil(b.hp).toLocaleString()} / ${b.max.toLocaleString()}`;
  $('#bossPhase').textContent=b.hp<=0?'Defeated!':`Phase ${b.phase}`;
  $('#bossNext').innerHTML=b.hp<=0?'Down for the count!':nx?`${what} → <b>${to?(to===G.player?'YOU':esc(to.name)):'someone'}</b> in 0:${String(secs).padStart(2,'0')}`:'Sizing you up…';
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
  if(plating!=null&&plateIndex()<0)plating=null;
  const n=(plating!=null?'\u0000plate':a?a.name:'nobody')+'|'+G.variant;
  if(n!==aimName){
    aimName=n;$('#aimline').innerHTML=plating!=null?'<b>Clean plate:</b> tap a food on your board':(G.variant==='stack'||G.variant==='shot')?`Combos fly at <b>${esc(a?a.name:'nobody')}</b>`:`Tap to throw at <b>${esc(a?a.name:'nobody')}</b>`;
    $('#board').classList.toggle('picking',plating!=null);
    if(plating!=null)return;
    const box=$('#opps'),m=minis.find(x=>x.board===a);
    if(m&&box.classList.contains('many')&&box.scrollWidth>box.clientWidth){try{box.scrollTo({left:m.el.offsetLeft-box.offsetLeft-box.clientWidth/2+m.el.offsetWidth/2,behavior:'smooth'})}catch(e){}}
  }
}
const placeName=p=>p===1?'1st':p===2?'2nd':p===3?'3rd':p+'th';
function updateOpps(){
  minis.forEach(m=>{
    const b=m.board;renderMini(m);
    m.el.classList.toggle('hit',b.hitFlash>0);
    const h=b.height(),bits=[];
    if(b.rack.length)bits.push(`${b.rack.length} held`);if(b.kos)bits.push(`${b.kos} KO`);
    let st=b.dead?(b.place&&!G.boss?placeName(b.place)+' place':'Out'):(b.frozenT>0?'Frozen':b.creamT>0?'Creamed':b.rushT>0?'Sauced!':h>=10?'Danger!':h>=8?'Stacked':'Cooking');
    let meta=b.dead?(b.killedBy?`by ${b.killedBy===G.player?'you':b.killedBy.name}`:'Topped out'):bits.join(' · ');
    if(G.variant==='order'){st=`${b.orders|0}/${ORDER_GOAL}`;meta=b.frozenT>0?'Spilled!':h>=9?'orders · stack high':'orders'}
    if(G.boss&&!b.dead){if(h>=9)st='Needs help!';meta=`${Math.round(b.dmg||0)} dmg`}
    if(m.st.textContent!==st)m.st.textContent=st;
    if(m.meta.textContent!==meta)m.meta.textContent=meta;
    const can=!!(G.playerOut&&!G.over);
    m.el.classList.toggle('watchable',can);m.el.classList.toggle('watching',spec===b);
  });
}

/* ---------- flying pies ---------- */
function pointFor(b,isTarget,slot){
  if(b===G.player){
    if(isTarget){const r=$('#tray').getBoundingClientRect();return[r.right-30,r.top+r.height/2]}
    const el=$('#slots').children[slot]||$('#slots');const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2];
  }
  if(b&&b.boss){const r=$('#bossImg').getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}
  const m=minis.find(m=>m.board===b);if(!m)return[0,0];
  const r=m.cv.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height*(isTarget?.3:.6)];
}
function fly(src,tgt,it,slot){
  if(G&&G.ffMode)return;
  const [x,y]=pointFor(src,false,slot),[tx,ty]=pointFor(tgt,true);
  const d=document.createElement('div');d.className='fly'+(JUNK_KINDS.includes(it.k)?(it.cells>=6?' big':''):' '+it.k);document.body.appendChild(d);
  d.style.transform=`translate(${x}px,${y}px)`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{d.style.transform=`translate(${tx}px,${ty}px) scale(.8)`}));
  setTimeout(()=>d.remove(),600);
  if(src===G.player)sfx('throw');
  if(src&&src.boss&&tgt===G.player)sfx('incoming');
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
  if(G.variant==='order'){$('#sThird').textContent=`${G.player.orders|0}/${ORDER_GOAL}`;$('#sThirdL').textContent='Orders'}
  else if(G.boss){$('#sThird').textContent=Math.round(G.player.dmg||0);$('#sThirdL').textContent='Damage'}
  else if(G.variant==='stack'){$('#sThird').textContent=G.player.maxChain;$('#sThirdL').textContent='Best chain'}
  else if(multi()){$('#sThird').textContent=G.player.kos;$('#sThirdL').textContent='KOs'}
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

/* ---------- per-mode screens: Snack Stack and Splat Shot draw and steer their own boards ---------- */
const MODE_UI={};
function setControls(){
  const mu=MODE_UI[G&&G.variant],slots=$('#slots');
  // park the rack back in its normal spot before a mode rebuilds its bar
  if(slots.parentNode!==$('.rack'))$('#aimline').after(slots);
  $('#modeCtl').hidden=!(mu&&mu.ctl);slots.hidden=!!(mu&&mu.ctl&&!mu.slots);
  $('#tray').hidden=!!(mu&&mu.noTray);
  const noRaise=!!(mu&&(typeof mu.noRaise==='function'?mu.noRaise():mu.noRaise));
  rb.hidden=noRaise;document.querySelector('.controls').classList.toggle('wide',noRaise);
  rb.innerHTML=mu&&mu.raiseLabel?mu.raiseLabel:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 10h-5v6H9v-6H4z"/></svg>Raise';
  if(mu&&mu.ctl){$('#modeCtl').innerHTML=mu.ctl();const host=$('#slotHost');if(host&&mu.slots)host.appendChild(slots);if(mu.bind)mu.bind()}
  rackIds='~';renderRack();requestAnimationFrame(resize);
}
// steam: soft clouds drift over the top of a board (Snack Stack and Splat Shot)
function drawSteam(B,W,H,f){
  const t=B.steamT!=null?B.steamT:(B.remote&&B.creamT>0?200:0);if(!(t>0))return;
  const a=Math.min(1,t/40);
  for(let i=0;i<7;i++){const x=((i*.17+f*.0015*(i%2?1:-1))%1+1)%1*W,y=H*(.12+(i%4)*.13),r=S*(1.4+(i%3)*.5);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(245,246,252,${.9*a})`);g.addColorStop(1,'rgba(245,246,252,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
}
function drawFxLayer(B,ro){
  (B.parts||[]).forEach(p=>{ctx.globalAlpha=Math.min(1,p.life/14);ctx.fillStyle=p.kind<0?'#E0A86E':PAL.c[p.kind];ctx.beginPath();ctx.arc(p.x*S,p.y*S-ro,S*.07,0,Math.PI*2);ctx.fill()});
  ctx.globalAlpha=1;ctx.textAlign='center';ctx.textBaseline='middle';
  const W=S*COLS;
  (B.pops||[]).forEach(p=>{
    const a=Math.min(1,p.life/20),yy=(p.y-(60-p.life)*.012)*S-ro,xx=Math.min(Math.max(p.x*S,S*1.6),W-S*1.6);
    ctx.globalAlpha=a;ctx.font=`${Math.round(S*.62*p.size)}px 'Lilita One','Arial Rounded MT Bold',sans-serif`;
    ctx.lineWidth=S*.14;ctx.strokeStyle='#0B0D1B';ctx.strokeText(p.text,xx,yy);ctx.fillStyle=p.col;ctx.fillText(p.text,xx,yy);
  });
  ctx.globalAlpha=1;
}
function checker(ro){ctx.fillStyle=TOK.grid;for(let r=-1;r<=ROWS;r++)for(let c=0;c<COLS;c++)if((r+c+400)%2===0)ctx.fillRect(c*S,r*S-(ro||0),S,S)}
// ----- Snack Stack -----
let sd=null,nextKey='';
MODE_UI.stack={
  slots:true,
  noRaise:()=>prefs.stackCtl==='buttons',
  raiseLabel:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-10h-5V4H9v6H4z"/></svg>Drop',
  ctl(){
    const next='<div class="nextbox"><span>Next</span><canvas id="nextCv"></canvas></div>';
    if(prefs.stackCtl!=='buttons')return next+'<div id="slotHost"></div>';   // swipe mode: tap the board to spin, Drop on the left
    // left thumb: tap or slide the pad to move. right thumb: Spin on top, Drop underneath
    return `<div class="movepad" id="movePad"><span>◀</span><i>slide</i><span>▶</span></div>
      <div class="ctlmid">${next}<div id="slotHost"></div></div>
      <div class="ctlcol"><button class="spin" id="bSpin" type="button">↻ Spin</button><button class="spin drop" id="bDrop" type="button">⬇ Drop</button></div>`;
  },
  bind(){
    const c=$('#nextCv'),s=prefs.stackCtl==='buttons'?20:26;c.width=(s*2+8)*DPR;c.height=s*2*DPR;c.style.width=(s*2+8)+'px';c.style.height=s*2+'px';nextKey='';this.ns=s;
    const sp=$('#bSpin');if(sp)sp.addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())G.player.rotate(1)});
    const d=$('#bDrop');if(d)d.addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())G.player.hardDrop()});
    const pad=$('#movePad');if(!pad)return;
    let st=null,rep=null;
    const stop=()=>{clearTimeout(rep);clearInterval(rep);rep=null;st=null};
    pad.addEventListener('pointerdown',e=>{
      e.preventDefault();if(!canPlay())return;try{pad.setPointerCapture(e.pointerId)}catch(_){}
      const r=pad.getBoundingClientRect(),dir=e.clientX<r.left+r.width/2?-1:1;
      st={x:e.clientX,moved:0,id:e.pointerId};G.player.move(dir);
      // hold to keep sliding
      rep=setTimeout(()=>{rep=setInterval(()=>{if(st&&!st.moved&&canPlay())G.player.move(dir)},85)},260);
    });
    pad.addEventListener('pointermove',e=>{
      if(!st||e.pointerId!==st.id||!canPlay())return;
      const steps=Math.trunc((e.clientX-st.x)/26);
      if(steps){st.moved=1;st.x+=steps*26;for(let k=0;k<Math.abs(steps);k++)G.player.move(Math.sign(steps))}
    });
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>pad.addEventListener(ev,stop));
  },
  drawNext(){
    const B=G.player,c=$('#nextCv');if(!c||!B.queue)return;
    const hide=B.greaseT>0;
    const key=(hide?'grease':B.queue.slice(0,2).map(q=>q.join('')).join('|'))+prefs.palette+prefs.art+cuisine();if(key===nextKey)return;nextKey=key;
    const x=c.getContext('2d'),s=(this.ns||26)*DPR;x.clearRect(0,0,c.width,c.height);
    if(hide){x.fillStyle='#F7C548';x.font=`800 ${Math.round(s*.9)}px Figtree,sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText('??',c.width/2,c.height/2);return}
    B.queue.slice(0,2).forEach(([a,b,sa,sb],i)=>{const ox=i*(s+8*DPR),al=i?.55:1;drawTile(x,{t:b,clr:0,sp:sb},ox,0,s,al,0);drawTile(x,{t:a,clr:0,sp:sa},ox,s,s,al,0)});
  },
  render(){
    const B=spec||G.player,W=S*COLS,H=S*ROWS,f=G.frame,mine=B===G.player;
    checker(0);
    // the drop column: if it fills to the top you're out
    ctx.strokeStyle='rgba(204,121,167,.55)';ctx.lineWidth=Math.max(2,S*.06);const xc=2*S+S/2,yc=S/2,k=S*.18;
    ctx.beginPath();ctx.moveTo(xc-k,yc-k);ctx.lineTo(xc+k,yc+k);ctx.moveTo(xc+k,yc-k);ctx.lineTo(xc-k,yc+k);ctx.stroke();
    const sh=B.shake?Math.sin(B.shake*2)*S*.04:0;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=B.g[r][c];if(t)drawTile(ctx,t,c*S,(r+(t.yo||0))*S+sh,S,B.dead?.45:1,f)}
    const p=B.piece;
    if(p&&B.cells){
      // ghost where it will land
      let g=Object.assign({},p);while(B.fits(Object.assign({},g,{r:Math.floor(g.r)+1})))g.r=Math.floor(g.r)+1;
      if(!(B.greaseT>0))B.cells(Object.assign({},g,{r:Math.floor(g.r)})).forEach(([r,c,t])=>{if(r>=0)drawTile(ctx,{t,clr:0},c*S,r*S,S,.22,f)});
      const off=[[-1,0],[0,1],[1,0],[0,-1]][p.rot];
      drawTile(ctx,{t:p.a,clr:0,sp:p.sa},p.c*S,p.r*S+sh,S,1,f);
      drawTile(ctx,{t:p.b,clr:0,sp:p.sb},(p.c+off[1])*S,(p.r+off[0])*S+sh,S,1,f);
      if(mine){ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2.5;rr(ctx,p.c*S+1.5,p.r*S+1.5+sh,S-3,S-3,S*.2);ctx.stroke()}
    }
    drawEffects(ctx,B,W,H,f);drawSteam(B,W,H,f);
    drawFxLayer(B,0);
    if(B.dead&&G.playerOut&&!G.over)drawKO(B,W,H);
    if(mine)this.drawNext();
  },
  down(e,p){const B=G.player;sd={id:e.pointerId,x0:p.x,y0:p.y,t:performance.now(),c0:B.piece?B.piece.c:2,moved:false}},
  move(e,p){
    if(!sd||e.pointerId!==sd.id)return;const B=G.player,dx=p.x-sd.x0,dy=p.y-sd.y0;
    if(Math.abs(dx)>S*.35)sd.moved=true;
    if(sd.moved&&B.piece)B.moveTo(Math.max(0,Math.min(COLS-1,sd.c0+Math.round(dx/(S*.85)))));
    if(!sd.moved&&dy>S*1.1)B.soft=true;
  },
  up(e,p){
    if(!sd||(e&&e.pointerId!==sd.id))return;const B=G.player,dt=performance.now()-sd.t;
    if(p&&!sd.moved){const dy=p.y-sd.y0;if(dy>S*1.6&&dt<450)B.hardDrop();else if(Math.abs(dy)<S*.5&&dt<350)B.rotate(1)}
    B.soft=false;sd=null;
  },
  raise(){G.player.hardDrop()},
  key(k,down){
    const B=G.player;
    if(k==='ArrowDown'){B.soft=down;return true}
    if(!down)return false;
    if(k==='ArrowLeft')B.move(-1);else if(k==='ArrowRight')B.move(1);
    else if(k==='ArrowUp'||k==='x'||k==='X')B.rotate(1);else if(k==='z'||k==='Z')B.rotate(-1);
    else if(k===' '||k==='Enter')B.hardDrop();else return false;
    return true;
  }
};

// ----- Splat Shot -----
const SHOTGEO=()=>window.FFEngine&&FFEngine.BOARD_TYPES.shot?FFEngine.BOARD_TYPES.shot.GEO:null;
function hexCells(B){
  const Q=SHOTGEO(),out=[];if(!Q)return out;
  const par=B.par|0,odd=r=>(r+par)%2===1;
  for(let r=0;r<Q.NR;r++){const w=odd(r)?Q.HC-1:Q.HC;for(let c=0;c<w;c++){
    let t=null;
    let sp=null;if(B.h){const b=B.h[r][c];if(b){t=b.t;sp=b.sp||null}}
    else if(B.hex){const ch=B.hex[r*Q.HC+c];if(ch&&ch!=='.')t=ch==='j'?-1:+ch}
    if(t!=null)out.push({x:Q.R+c*Q.D+(odd(r)?Q.R:0),y:Q.R+r*Q.RH,t,r,sp})}}
  return out;
}
let shotDrag=null;
const shooterImg={};
function fighterImg(av){if(!shooterImg[av]){const im=new Image();im.src=body(av);shooterImg[av]=im}return shooterImg[av]}
MODE_UI.shot={
  noTray:true,slots:true,noRaise:true,
  raiseLabel:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>Swap',
  // what you're throwing and what's next live down here, clear of your thumb and your fighter
  ctl(){return '<div class="nextbox now"><span>Now</span><canvas id="nowCv"></canvas></div><button class="nextbox" id="bNextShot" type="button"><span>Next</span><canvas id="nxCv"></canvas></button><div id="slotHost"></div>'},
  bind(){
    const mk=(id,s)=>{const c=$(id);c.width=s*DPR;c.height=s*DPR;c.style.width=c.style.height=s+'px'};
    mk('#nowCv',36);mk('#nxCv',28);this.key_='';
    $('#bNextShot').addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())G.player.swap()});
  },
  drawCtl(B){
    const key=B.cur+'|'+B.next+'|'+prefs.palette+prefs.art+cuisine();if(key===this.key_)return;this.key_=key;
    const a=$('#nowCv'),b=$('#nxCv');if(!a||!b)return;
    const x=a.getContext('2d');x.clearRect(0,0,a.width,a.height);drawTile(x,{t:B.cur,clr:0},0,0,a.width,1,0);
    const y=b.getContext('2d');y.clearRect(0,0,b.width,b.height);drawTile(y,{t:B.next,clr:0},0,0,b.width,1,0);
  },
  render(){
    const Q=SHOTGEO();if(!Q)return;
    const B=spec||G.player,W=S*COLS,H=S*ROWS,f=G.frame,mine=B===G.player,u=S,sz=Q.D*u;
    checker(0);
    const sh=B.shake?Math.sin(B.shake*2)*S*.05:0;
    // ceiling: turns orange and says how much junk is on its way (there's no tray in this mode)
    const incoming=(B.inc||[]).reduce((a,i)=>a+i.cells,0);
    ctx.fillStyle=incoming?'#E5682A':'#7B6B8F';ctx.fillRect(0,0,W,Math.max(4,S*.1));
    // danger line
    const dy=(Q.DEAD_ROW*Q.RH)*u;
    ctx.save();ctx.setLineDash([S*.15,S*.15]);ctx.strokeStyle='rgba(247,197,72,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,dy);ctx.lineTo(W,dy);ctx.stroke();ctx.restore();
    hexCells(B).forEach(b=>drawTile(ctx,{t:b.t,clr:0,sp:b.sp},(b.x-Q.R)*u+sz*.02,(b.y-Q.R)*u+sh+sz*.02,sz*.96,B.dead?.45:1,f));
    (B.popping||[]).forEach(p=>{const k=p.life/14;drawTile(ctx,{t:p.t,clr:0},(p.x-Q.R*k)*u,(p.y-Q.R*k)*u,sz*k,k,f)});
    (B.falling||[]).forEach(p=>drawTile(ctx,{t:p.t,clr:0},(p.x-Q.R)*u,(p.y-Q.R)*u,sz*.96,.8,f));
    if(incoming&&mine){
      const soon=B.inc.some(i=>i.t<70),txt=`+${incoming} junk incoming`;
      ctx.font=`800 ${Math.round(S*.32)}px Figtree,sans-serif`;const tw=ctx.measureText(txt).width+S*.6;
      ctx.fillStyle=soon?'rgba(229,104,42,.97)':'rgba(11,13,27,.88)';rr(ctx,W/2-tw/2,dy-S*.62,tw,S*.48,S*.24);ctx.fill();
      ctx.fillStyle='#FFF6E8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(txt,W/2,dy-S*.38);
    }
    const a=B.aimA!=null?B.aimA:-Math.PI/2,col=B.cur!=null&&B.cur>=0?PAL.c[B.cur]:'#F7C548';
    if(mine&&!B.dead&&B.trace&&!B.ball&&!(B.greaseT>0)){
      // aim guide in the colour of the food you're throwing, ending on a ghost of where it sticks
      const pts=[[Q.SX,Q.SY-.55]];const L=B.trace(a,(k,x,y)=>pts.push([x,y]));
      if(L){pts.push([L.x,L.y]);
        ctx.save();ctx.setLineDash([2,S*.2]);ctx.lineCap='round';ctx.lineWidth=Math.max(3,S*.1);
        ctx.strokeStyle='rgba(11,13,27,.6)';ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x*u,y*u):ctx.moveTo(x*u,y*u));ctx.stroke();
        ctx.lineWidth=Math.max(2,S*.07);ctx.strokeStyle=col;ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x*u,y*u):ctx.moveTo(x*u,y*u));ctx.stroke();ctx.restore();
        if(L.r!=null){const cx=Q.R+L.c*Q.D+(((L.r+B.par)%2===1)?Q.R:0),cy=Q.R+L.r*Q.RH;
          drawTile(ctx,{t:B.cur,clr:0},(cx-Q.R)*u,(cy-Q.R)*u,sz,.45,f);
          ctx.strokeStyle='#FFFFFF';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx*u,cy*u,Q.R*u*.95,0,Math.PI*2);ctx.stroke()}
      }
    }else if(!B.dead&&!(mine&&B.greaseT>0)){
      ctx.strokeStyle='rgba(247,197,72,.5)';ctx.lineWidth=2;ctx.setLineDash([2,6]);ctx.beginPath();ctx.moveTo(Q.SX*u,(Q.SY-.55)*u);ctx.lineTo((Q.SX+Math.cos(a)*2.2)*u,(Q.SY-.55+Math.sin(a)*2.2)*u);ctx.stroke();ctx.setLineDash([]);
    }
    // your fighter cheers from the corner instead of sitting on top of the launcher
    const im=fighterImg(B.av||'bun');
    if(im.complete&&im.naturalWidth)ctx.drawImage(im,.05*u,(ROWS-1.45)*u,1.3*u,1.4*u);
    if(B.ball){if(B.ball.bomb||B.ball.wild){ctx.save();ctx.shadowColor=B.ball.bomb?'#E5682A':'#F7C548';ctx.shadowBlur=16}drawTile(ctx,{t:B.ball.t,clr:0},(B.ball.x-Q.R)*u,(B.ball.y-Q.R)*u,sz*.96,1,f);if(B.ball.bomb||B.ball.wild)ctx.restore()}
    if(B.cur!=null&&!B.dead){
      // launcher: a plate holding the food you're about to throw, big and ringed in its colour
      const lx=Q.SX*u,ly=(Q.SY-.55)*u,big=sz*1.18;
      ctx.fillStyle='rgba(11,13,27,.65)';ctx.beginPath();ctx.arc(lx,ly,big*.7,0,Math.PI*2);ctx.fill();
      if(B.armed==='rainbow'){const gr=ctx.createConicGradient?ctx.createConicGradient(f*.05,lx,ly):null;if(gr){['#E5682A','#F0E442','#16A982','#56B4E9','#CC79A7','#E5682A'].forEach((cc,i)=>gr.addColorStop(i/5,cc));ctx.strokeStyle=gr}else ctx.strokeStyle='#F0E442'}
      else ctx.strokeStyle=B.armed==='bomb'?'#E5682A':col;
      ctx.lineWidth=Math.max(3,S*(B.armed?.14:.09));ctx.beginPath();ctx.arc(lx,ly,big*.7,0,Math.PI*2);ctx.stroke();
      if(B.armed){ctx.fillStyle=B.armed==='bomb'?'#E5682A':'#F7C548';ctx.font=`800 ${Math.round(S*.24)}px Figtree,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(B.armed==='bomb'?'CHILI BOMB':'RAINBOW',lx,ly-big*.95)}
      if(!B.ball)drawTile(ctx,{t:B.cur,clr:0},lx-big/2,ly-big/2,big,1,f);
      // next one waits on the left of the launcher
      const nx=(Q.SX-1.35)*u,ny=(Q.SY-.35)*u,ns=sz*.72;
      drawTile(ctx,{t:B.next,clr:0},nx-ns/2,ny-ns/2,ns,.85,f);
      ctx.fillStyle='rgba(148,155,189,.95)';ctx.font=`800 ${Math.round(S*.22)}px Figtree,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('NEXT',nx,ny-ns*.75);
    }
    if(mine&&B.greaseT>0){ctx.fillStyle='rgba(247,197,72,.9)';ctx.font=`800 ${Math.round(S*.3)}px Figtree,sans-serif`;ctx.textAlign='center';ctx.fillText('Greasy fingers! No aim guide',W/2,(Q.SY-1.6)*u)}
    drawEffects(ctx,B,W,H,f);drawSteam(B,W,H,f);
    drawFxLayer(B,0);
    if(B.dead&&G.playerOut&&!G.over)drawKO(B,W,H);
    if(mine)this.drawCtl(B);
  },
  // aim by sliding your finger left/right anywhere on the board (relative, so a small slide is a small turn); let go to throw
  down(e,p){shotDrag={id:e.pointerId,x0:p.x,y0:p.y,a0:G.player.aimA,moved:false}},
  move(e,p){
    if(!shotDrag||e.pointerId!==shotDrag.id)return;
    const dx=p.x-shotDrag.x0;if(Math.abs(dx)>4)shotDrag.moved=true;
    G.player.setAim(shotDrag.a0+dx/(S*COLS)*1.8);
  },
  up(e,p){
    if(!shotDrag||(e&&e.pointerId!==shotDrag.id))return;const d=shotDrag;shotDrag=null;
    if(!p)return;
    if(p.y-d.y0>S*2.2)return;          // drag down off the shot to cancel
    G.player.shoot();
  },
  raise(){G.player.swap()},
  key(k,down){
    if(!down)return false;const B=G.player;
    if(k==='ArrowLeft')B.setAim(B.aimA-.05);else if(k==='ArrowRight')B.setAim(B.aimA+.05);
    else if(k==='ArrowUp'||k===' '||k==='Enter')B.shoot();else if(k==='x'||k==='X'||k==='Shift'||k==='ArrowDown')B.swap();else return false;
    return true;
  }
};

/* ---------- input ---------- */
function creamAt(x,y){
  const B=G&&G.player;if(!B||!B._blobs)return false;
  return B._blobs.some(b=>b.amt>.08&&Math.hypot(x-b.x*S,y-b.y*S)<b.r*S*1.15);
}
let wipeSnd=0;
function wipe(x0,y0,x1,y1){
  const B=G.player;if(!B._blobs)return;
  const d=Math.hypot(x1-x0,y1-y0);if(!d)return;
  let hit=false;
  B._blobs.forEach(b=>{
    if(b.amt<=.08)return;
    if(Math.hypot(x1-b.x*S,y1-b.y*S)<b.r*S*1.25){b.amt-=d/(b.r*S*5.5);hit=true;if(b.amt<=.08){b.amt=0;B.parts.push(...Array.from({length:5},()=>({x:b.x,y:b.y+B.rise,vx:(Math.random()-.5)*.12,vy:-Math.random()*.1,kind:-1,life:20})))}}
  });
  if(hit&&performance.now()-wipeSnd>140){wipeSnd=performance.now();sfx('wipe')}
}

const kb={on:false,r:8,c:2};
function bp(e){const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function canPlay(){return G&&!G.over&&!G.paused&&!G.player.dead&&!G.waiting}
cv.addEventListener('pointerdown',e=>{
  if(!canPlay())return;
  e.preventDefault();wakeAudio();
  try{cv.setPointerCapture(e.pointerId)}catch(_){}
  {const mu=MODE_UI[G.variant];if(mu&&mu.down){mu.down(e,bp(e));return}}
  const B=G.player,p=bp(e),c=Math.floor(p.x/S),r=Math.floor((p.y+B.rise*S)/S);
  const t=r>=0&&r<ROWS&&c>=0&&c<COLS?B.g[r][c]:null;
  if(plating){usePlateOn(t);return}
  drag={id:e.pointerId,x0:p.x,y0:p.y,r:t?r:null,c,mode:creamAt(p.x,p.y)?'wipe':null,lx:p.x,ly:p.y};
  kb.on=false;
});
cv.addEventListener('pointermove',e=>{
  {const mu=G&&MODE_UI[G.variant];if(mu&&mu.move){if(canPlay())mu.move(e,bp(e));return}}
  if(!drag||e.pointerId!==drag.id||!canPlay())return;
  const B=G.player,p=bp(e),dx=p.x-drag.x0,dy=p.y-drag.y0,ax=Math.abs(dx),ay=Math.abs(dy);
  if(drag.mode==='wipe'){wipe(drag.lx,drag.ly,p.x,p.y);drag.lx=p.x;drag.ly=p.y;return}
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
cv.addEventListener('pointerup',e=>{const mu=G&&MODE_UI[G.variant];if(mu&&mu.up){mu.up(e,bp(e));return}endDrag(e)});
cv.addEventListener('pointercancel',e=>{const mu=G&&MODE_UI[G.variant];if(mu&&mu.up){mu.up(e,null);return}endDrag(e)});
const rb=$('#bRaise');
rb.addEventListener('pointerdown',e=>{e.preventDefault();if(!canPlay())return;const mu=MODE_UI[G.variant];if(mu&&mu.raise){mu.raise();return}G.player.raising=true;rb.classList.add('on')});
['pointerup','pointercancel','pointerleave'].forEach(ev=>rb.addEventListener(ev,()=>{if(G)G.player.raising=false;rb.classList.remove('on')}));
const anyOverlay=()=>$$('.overlay').some(o=>!o.hidden);
document.addEventListener('keydown',e=>{
  if(!G||e.target.tagName==='INPUT')return;
  if(e.key==='Escape'&&!$('#ovPause').hidden){closePause();return}
  if(anyOverlay()&&$('#ovPause').hidden)return;
  if(e.key==='p'||e.key==='Escape'){if(!G.over)openPause();return}
  if(!canPlay())return;
  const B=G.player,k=e.key;let used=true;
  {const mu=MODE_UI[G.variant];if(mu&&mu.key){if(mu.key(k,true))e.preventDefault();return}}
  if(k==='ArrowLeft')kb.c=Math.max(0,kb.c-1);
  else if(k==='ArrowRight')kb.c=Math.min(COLS-2,kb.c+1);
  else if(k==='ArrowUp')kb.r=Math.max(0,kb.r-1);
  else if(k==='ArrowDown')kb.r=Math.min(ROWS-1,kb.r+1);
  else if(k===' '||k==='x'||k==='X'||k==='Enter')B.trySwap(kb.r,kb.c,1);
  else if(k==='c'||k==='C')B.trySwapV(kb.r,kb.c,1);
  else if(k==='Shift'||k==='z'||k==='Z')B.raising=true;
  else if('123'.includes(k)&&k.length===1){const it=B.rack[+k-1];if(it&&it.k==='plate'){const t=B.g[kb.r]&&B.g[kb.r][kb.c];B.fire(+k-1,t&&t.t>=0?t.t:null)}else B.fire(+k-1)}
  else used=false;
  if(used){kb.on=true;e.preventDefault()}
});
document.addEventListener('keyup',e=>{if(!G)return;const mu=MODE_UI[G.variant];if(mu&&mu.key){mu.key(e.key,false);return}if(e.key==='Shift'||e.key==='z'||e.key==='Z')G.player.raising=false});
if(matchMedia('(pointer:fine)').matches)$('#kbd').hidden=false;

/* ---------- overlays ---------- */
const OVS=['#ovLoad','#ovStart','#ovHow','#ovLook','#ovBoard','#ovOnline','#ovLobby','#ovVs','#ovPause','#ovEnd'];
let backTo='#ovStart';
function show(id){OVS.forEach(s=>$(s).hidden=s!==id);sheetTint();if(id!=='#ovEnd')$('#outToast').hidden=true;if(SND)SND.ambience(id==='#ovLobby')}
function hideAll(){OVS.forEach(s=>$(s).hidden=true);sheetTint();if(SND)SND.ambience(false)}
function openSub(id){backTo=OVS.find(s=>!$(s).hidden)||null;show(id)}
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(backTo)show(backTo);else hideAll()}));
$('#bHow').addEventListener('click',()=>openSub('#ovHow'));
$('#bLook').addEventListener('click',()=>openSub('#ovLook'));
$('#bLook2').addEventListener('click',()=>openSub('#ovLook'));
$$('#theme button').forEach(b=>b.addEventListener('click',()=>{prefs.theme=b.dataset.t;savePrefs();applyLook()}));
$$('#art button').forEach(b=>b.addEventListener('click',()=>{prefs.art=b.dataset.a;savePrefs();applyLook()}));
$$('#stackCtl button').forEach(b=>b.addEventListener('click',()=>{prefs.stackCtl=b.dataset.s;savePrefs();applyLook();if(G&&G.variant==='stack')setControls()}));

/* ---------- game hooks ---------- */
const baseHooks={
  sfx,
  fly,
  rack:renderRack,
  swapped(){drag=null;kb.on=false;if(plating!=null)cancelPlate()},
  bossPhase(ph){if(G&&G.player){G.player.pops.push({text:ph>=3?`${G.boss.name} is ENRAGED!`:`${G.boss.name} gets angry!`,x:3,y:4,col:'#CC79A7',size:1,life:90});sfx('overtime')}},
  pickFood(item){plating=item.id;renderRack();updatePlateHint();sfx('tap');return true},
  out(){spec=null;$('#bOutLeave').textContent=G.online?'Lobby':'Menu';setOut(true);$('#outToast').hidden=false;sfx('ko')},
  shift(){if(drag&&drag.r!=null)drag.r--;kb.r=Math.max(0,kb.r-1)},
  ko(b,k){
    if(b!==G.player){sfx('ko');if(k===G.player)G.player.pops.push({text:'KO! Power up',x:3,y:5,col:'#F7C548',size:1.1,life:80})}
    updateAim();
  },
  end(res){
    const B=G.player,won=res.won,n=G.boards.length,D=DIFFS[G.d].name;
    if(won)best.wins++;
    best.score=Math.max(best.score,B.score);best.chain=Math.max(best.chain,B.maxChain);saveBest();
    $('#eTitle').textContent=res.coop?(won?'Boss beaten!':'The boss wins'):won?'You win':(n>2?`${placeName(res.place)} of ${n}`:G.variant==='order'?'Outcooked':'Topped out');
    const champ=res.coop?(won?B:{av:G.boss.av,name:G.boss.name}):won?B:(res.winner||G.boards.find(b=>!b.dead&&b!==B)||B.killedBy||B);
    $('#eHero').src=body(champ.av);$('#eHero').alt=won?'Your fighter celebrates':`${champ.name} wins`;
    $('#eHero').style.animation='none';void $('#eHero').offsetWidth;$('#eHero').style.animation='';
    const modeLine=res.coop?(won?`${G.boss.name} is down! You did ${Math.round(B.dmg||0)} damage (${placeName(res.place)} on the team).`:`${G.boss.name} cleaned out the whole kitchen.`)
      :G.variant==='order'?(won?`First to ${ORDER_GOAL} orders. Kitchen of the day!`:`${res.winner?res.winner.name:'Someone'} filled ${ORDER_GOAL} orders first. You filled ${B.orders|0}.`):null;
    if(G.online){
      const w=res.winner;
      $('#eSub').textContent=modeLine||(won?`Last kitchen standing. Nice cooking.`:(w?`${w.name} wins the match.`:'Match over.'));
      if(lastMatch&&lastMatch.mid===G.mid)lastMatch.champ=res.winner?res.winner.id:null;
      setAgain('Grudge Match',`Rematch everyone who taps in${lastMatch&&lastMatch.bots?` · ${lastMatch.bots} bot${lastMatch.bots>1?'s':''}`:''}`,false);
      $('#bMenu').textContent='Leave room';$('#bLobby').hidden=false;$('#gmPanel').hidden=true;
    }else{
      $('#eSub').textContent=modeLine?modeLine+` (${D})`:won
        ?(n>2?`Last kitchen standing on ${D}.`:`${G.boards[1].name}'s stack overflowed on ${D}.`)
        :(B.killedBy?`${B.killedBy.name} knocked you out on ${D}.`:`Your stack hit the top on ${D}.`);
      setAgain('Grudge Match','Same cooks, run it back',false);
      $('#bMenu').textContent='Change mode';$('#bLobby').hidden=true;$('#gmPanel').hidden=true;
    }
    recordScore(res);
    $('#eTime').textContent=fmt(G.frame);$('#eChain').textContent=B.maxChain;$('#eScore').textContent=B.score;
    $('#eSent').textContent=B.sent;$('#eBlock').textContent=B.blocked;$('#eKO').textContent=B.kos;
    stopWatching();
    sfx(won?'win':'lose');
    B.raising=false;
    setTimeout(()=>{if(G&&G.over){$('#outToast').hidden=true;show('#ovEnd')}},700);
  }
};

/* ---------- scores & leaderboards ---------- */
const SCORES=window.FFScores&&window.FFScores.enabled?window.FFScores:null;
let deviceId='';
try{deviceId=localStorage.getItem('ff-device')||''}catch(e){}
if(!/^[\w-]{8,64}$/.test(deviceId)){deviceId='d-'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));try{localStorage.setItem('ff-device',deviceId)}catch(e){}}
const boardKey=(mode,d)=>mode+'-'+(/online$/.test(mode)?1:d);
let localScores={};
try{localScores=JSON.parse(localStorage.getItem('ff-scores')||'{}')||{}}catch(e){}
function saveLocal(key,row){
  const list=(localScores[key]||[]).concat(row).sort((a,b)=>b.score-a.score||a.at-b.at).slice(0,20);
  localScores[key]=list;try{localStorage.setItem('ff-scores',JSON.stringify(localScores))}catch(e){}
  return list;
}
let lastBoard={mode:'duel',d:1};
function recordScore(res){
  const B=G.player,base=G.online?'online':(G.mode==='brawl'&&G.boards.length>4?'brawl8':G.mode),mode=(G.variant&&G.variant!=='classic'?G.variant+'-':'')+base,d=G.online?1:G.d,key=boardKey(mode,d);
  lastBoard={mode,d};
  const prevBest=(localScores[key]||[])[0];
  const row={name:ME.name,av:prefs.av,score:B.score,chain:B.maxChain,won:!!res.won,place:res.place||1,at:Date.now()};
  const list=saveLocal(key,row);
  const pb=!prevBest||row.score>prevBest.score;
  const el=$('#eRank');
  const localLine=pb&&B.score>0?'New personal best!':`Your best here: ${list[0].score}`;
  el.textContent=localLine;
  const duration=Math.round(G.frame/60);
  if(!SCORES||B.score<=0||duration<10)return;
  el.textContent='Saving your score…';
  SCORES.submit({deviceId,name:ME.name,avatar:prefs.av,mode,difficulty:d,score:B.score,maxChain:B.maxChain,kos:B.kos,won:!!res.won,place:res.place||1,duration,version:VERSION})
    .then(r=>{
      if(!r||!r.ok){el.textContent=localLine+(r&&r.reason==='too_fast'?'':' · Leaderboard unavailable right now');return}
      el.textContent=`#${r.rank_day} today · #${r.rank_all} all time`+(r.personal_best?' · New personal best!':'');
    });
}
const lb={variant:'classic',mode:'duel',d:1,period:'day',req:0};
const lbKey=()=>(lb.variant!=='classic'?lb.variant+'-':'')+lb.mode;
function setSeg(id,v){$$(id+' button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===String(v))))}
function openBoard(mode,d){
  if(mode){const m=/^(order|stack|shot|boss)-(.+)$/.exec(mode);lb.variant=m?m[1]:'classic';lb.mode=m?m[2]:mode;lb.d=d}
  else lb.variant=prefs.variant;
  openSub('#ovBoard');loadBoard();
}
const dateFmt=t=>{const d=new Date(t),now=Date.now(),h=(now-d)/36e5;return h<1?'just now':h<24?Math.floor(h)+'h ago':d.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
async function loadBoard(){
  setSeg('#lbVar',lb.variant);setSeg('#lbMode',lb.mode);setSeg('#lbDiff',lb.d);setSeg('#lbPeriod',lb.period);
  $('#lbDiff').hidden=lb.mode==='online';$('#lbPeriod').hidden=!SCORES;
  const list=$('#lbList'),req=++lb.req;
  const meta=r=>`${lb.variant==='boss'?(r.won?'Boss beaten':'Boss won'):(r.max_chain||r.chain||1)+'-chain · '+(r.won?'Won':placeName(r.place||2))}`;
  const row=(rank,name,score,sub,mine,av)=>`<li${mine?' class="mine"':''}><span class="rk">${rank}</span><div class="who">${av?avImg(av):''}<div><b>${esc(name)}</b><span>${sub}</span></div></div><span class="sc">${score}</span></li>`;
  if(!SCORES){
    $('#lbSrc').textContent='Your games on this device';$('#lbNote').textContent='';
    const rows=localScores[boardKey(lbKey(),lb.d)]||[];
    list.innerHTML=rows.length?rows.slice(0,10).map((r,i)=>row(i+1,r.name,r.score,meta(r)+' · '+dateFmt(r.at),false,r.av)).join(''):'<li class="lbempty">No games here yet. Finish one to set a score.</li>';
    return;
  }
  $('#lbSrc').textContent='Everyone · best score per cook';$('#lbNote').textContent=lb.period==='day'?'Last 24 hours':'';
  list.innerHTML='<li class="lbempty">Loading…</li>';
  try{
    const rows=await SCORES.board(lbKey(),lb.d,lb.period,deviceId,50);
    if(req!==lb.req)return;
    let html='',prev=0;
    rows.forEach(r=>{if(r.rank>prev+1&&prev)html+='<li class="gap">⋯</li>';prev=r.rank;html+=row(r.rank,r.name,r.score,meta(r)+' · '+dateFmt(r.created_at),r.mine,r.avatar)});
    list.innerHTML=html||'<li class="lbempty">No scores yet. Be the first!</li>';
  }catch(e){
    if(req!==lb.req)return;
    list.innerHTML='<li class="lbempty">Couldn\'t load the leaderboard. Check your connection and try again.</li>';
  }
}
['#lbVar','#lbMode','#lbDiff','#lbPeriod'].forEach(id=>$$(id+' button').forEach(b=>b.addEventListener('click',()=>{
  const v=b.dataset.v;if(id==='#lbVar')lb.variant=v;else if(id==='#lbMode')lb.mode=v;else if(id==='#lbDiff')lb.d=+v;else lb.period=v;loadBoard();
})));
$('#bBoard').addEventListener('click',()=>openBoard());
$('#bBoardEnd').addEventListener('click',()=>openBoard(lastBoard.mode,lastBoard.d));

/* ---------- practice ---------- */
function startPractice(d,mode,size){
  wakeAudio();
  lastDiff=d;lastMode=mode;lastSize=size;
  G=new Game(mode,d,baseHooks,false,{av:prefs.av,name:ME.name,size,variant:prefs.variant});
  G.paused=true;G.waiting=true;
  rackIds='~';trayKey='~';plating=null;
  buildOpps();renderRack();resize();
  showMatchup(1,()=>{if(G){G.paused=false;G.waiting=false}});
}
let pickMode='duel',pickSize=2,lastSize=2;
$$('#mode button').forEach(b=>b.addEventListener('click',()=>{
  pickMode=b.dataset.m;pickSize=+b.dataset.size;$$('#mode button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));
$$('.diff [data-d]').forEach(b=>b.addEventListener('click',()=>startPractice(+b.dataset.d,pickMode,pickSize)));
/* match-up screen: duel = face-off, more cooks = line-up; then a count-in */
let vsTimer=null;
const champTag=b=>G&&G.champId&&b.id===G.champId?'<div class="champ">Champ</div>':'';
function showMatchup(seconds,go){
  clearInterval(vsTimer);
  const st=$('#vsStage'),me=G.player,others=G.boards.filter(b=>b!==me);
  const vi=VARIANT_INFO[G.variant]||VARIANT_INFO.classic,banner=G.variant==='classic'?'':`<div class="vmode">${vi.name} · ${{order:`first to ${ORDER_GOAL} orders`,stack:'connect 4, chain for pies',shot:'aim, pop 3, drop the rest',boss:'everyone vs. the boss'}[G.variant]}</div>`;
  if(G.boss){
    st.innerHTML=banner+`<div class="crowd">${G.boards.map((b,i)=>`<div class="fighter${b===me?' me':''}" style="animation-delay:${i*.06}s"><img src="${body(b.av)}" alt=""><div class="chunky">${esc(b.name)}</div></div>`).join('')}</div><div class="chunky vsword" style="font-size:44px">VS</div><div class="fighter boss"><img src="${body(G.boss.av)}" alt=""><div class="chunky">${esc(G.boss.name)}</div></div>`;
  }else if(others.length===1){
    const o=others[0];
    st.innerHTML=banner+`<div class="duelvs"><div class="fighter l"><img src="${body(me.av)}" alt=""><div class="chunky">${esc(me.name)}</div>${champTag(me)}</div><div class="chunky vsword">VS</div><div class="fighter r"><img src="${body(o.av)}" alt=""><div class="chunky">${esc(o.name)}</div>${champTag(o)}</div></div>`;
  }else{
    st.innerHTML=banner+`<div class="chunky" style="font-size:40px;margin-bottom:10px">${G.variant==='order'?`${G.boards.length}-kitchen race!`:`${G.boards.length}-cook brawl!`}</div><div class="crowd">${G.boards.map((b,i)=>`<div class="fighter${b===me?' me':''}" style="animation-delay:${i*.06}s"><img src="${body(b.av)}" alt="" style="animation-delay:${i*.06}s"><div class="chunky">${esc(b.name)}</div>${champTag(b)}</div>`).join('')}</div>`;
  }
  let n=seconds;
  $('#countNum').textContent=seconds>1?n:'';show('#ovVs');sfx('slam');
  vsTimer=setInterval(()=>{
    n--;
    if(n>0){$('#countNum').textContent=n;sfx('count')}
    else if(n===0){$('#countNum').textContent='Fight!';sfx('fight')}
    else{clearInterval(vsTimer);hideAll();go()}
  },seconds>1?1000:900);
}
function openPause(){
  if(!G||G.over)return;
  const on=G.online;
  if(!on)G.paused=true;
  $('#pTitle').textContent=on?'Leave match?':'Paused';$('#pSub').hidden=!on;
  $('#bQuit').textContent=on?'Leave room':'Quit';
  if(G.player)G.player.raising=false;drag=null;
  show('#ovPause');
}
function closePause(){if(G&&!G.online&&!G.waiting)G.paused=false;hideAll()}
$('#bPause').addEventListener('click',()=>{if(!$('#ovPause').hidden)closePause();else if(!anyOverlay())openPause()});
$('#bResume').addEventListener('click',closePause);
$('#bQuit').addEventListener('click',()=>{if(G&&G.online){leaveRoom()}else{if(G)G.over=true;toMenu()}});
$('#bAgain').addEventListener('click',()=>{if(G&&G.online){if(lastMatch)joinGrudge(gmState(lastMatch.mid,lastMatch.bots,lastMatch.diff,lastMatch.variant))}else startPractice(lastDiff,lastMode,lastSize)});
$('#bLobby').addEventListener('click',backToLobby);
$('#bMenu').addEventListener('click',()=>{if(G&&G.online)leaveRoom();else toMenu()});
$('#bSound').addEventListener('click',()=>{prefs.muted=!prefs.muted;savePrefs();wakeAudio();showMute()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&G&&!G.over&&!G.online&&!G.paused&&!anyOverlay())openPause()});
function toMenu(){showBest();demo();show('#ovStart')}
function demo(){G=new Game('duel',1,baseHooks,false,{av:prefs.av,name:ME.name});G.paused=true;rackIds='~';trayKey='~';plating=null;buildOpps();renderRack()}

/* ---------- profile ---------- */
const ME={id:(crypto.randomUUID?crypto.randomUUID():'u'+Math.random().toString(36).slice(2)+Date.now().toString(36)),name:''};
const nameIn=$('#nameIn');
ME.name=prefs.name||('Cook '+(100+Math.floor(Math.random()*900)));
nameIn.value=prefs.name||'';nameIn.placeholder=ME.name;
function setMyName(raw,from){
  const v=String(raw).trim().slice(0,14);prefs.name=v;savePrefs();ME.name=v||nameIn.placeholder;
  if(from!==nameIn)nameIn.value=v;
  const ln=$('#lobbyName');if(ln&&from!==ln)ln.value=v;
  if(NET&&inRoom){clearTimeout(setMyName.t);setMyName.t=setTimeout(()=>{NET.setProfile({name:ME.name});renderLobby()},400)}
}
nameIn.addEventListener('input',()=>setMyName(nameIn.value,nameIn));
/* lobby: invitees skip the menu, so they can set their name and fighter right here */
const lobbyName=$('#lobbyName');
lobbyName.placeholder=ME.name;
lobbyName.addEventListener('input',()=>setMyName(lobbyName.value,lobbyName));
lobbyName.addEventListener('keydown',e=>{if(e.key==='Enter')lobbyName.blur()});
function toggleLobbyPicker(open){
  const lp=$('#lobbyPicker'),on=open==null?lp.hidden:open;
  lp.hidden=!on;$('#bMeEdit').setAttribute('aria-expanded',String(on));$('#meAv').setAttribute('aria-expanded',String(on));
  $('#bMeEdit').textContent=on?'Done':'Fighter';
}
$('#meAv').addEventListener('click',()=>{toggleLobbyPicker();sfx('tap')});
$('#bMeEdit').addEventListener('click',()=>{toggleLobbyPicker();sfx('tap')});
$('#lobbyPicker').addEventListener('click',e=>{if(e.target.closest('.pick'))setTimeout(()=>toggleLobbyPicker(false),250)});
function renderPicker(){
  ['#picker','#lobbyPicker'].forEach(sel=>{const box=$(sel);if(box)fillPicker(box)});
  $$('.pick').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.av===prefs.av)));
  const mi=$('#meAvImg');if(mi){mi.src=body(prefs.av);mi.alt=FIGHTER_INFO[prefs.av]?FIGHTER_INFO[prefs.av].name:''}
}
function fillPicker(box){
  if(!box.children.length)FIGHTERS.forEach(av=>{
    const b=document.createElement('button');b.type='button';b.className='pick';b.dataset.av=av;
    b.innerHTML=`<img src="${body(av)}" alt="" width="120" height="120"><span>${FIGHTER_INFO[av].name}</span>`;
    b.setAttribute('aria-label',`${FIGHTER_INFO[av].name}, ${FIGHTER_INFO[av].tag}`);
    b.addEventListener('click',()=>{prefs.av=av;savePrefs();renderPicker();wakeAudio();sfx('tap');if(NET&&inRoom){NET.setProfile({av});renderLobby()}if(G&&G.paused&&!G.online&&G.player)G.player.av=av});
    box.appendChild(b);
  });
}

/* ---------- game mode picker (start screen + lobby) ---------- */
function variantIcon(v){
  const c=document.createElement('canvas');c.width=112;c.height=80;const x=c.getContext('2d'),s=36;
  if(v==='classic'){drawTile(x,{t:0,clr:0},14,22,s,1,0);drawTile(x,{t:1,clr:0},62,22,s,1,0);x.strokeStyle='#F7C548';x.lineWidth=4;x.lineCap='round';x.beginPath();x.moveTo(44,14);x.lineTo(68,14);x.moveTo(62,8);x.lineTo(68,14);x.lineTo(62,20);x.stroke()}
  else if(v==='order'){x.fillStyle='#FFFDF6';x.beginPath();x.roundRect?x.roundRect(22,6,68,68,8):x.rect(22,6,68,68);x.fill();drawTile(x,{t:0,clr:0},28,14,24,1,0);drawTile(x,{t:3,clr:0},28,44,24,1,0);x.fillStyle='#16A34A';x.fillRect(56,24,28,5);x.fillStyle='#E8DCC6';x.fillRect(56,54,28,5);x.fillStyle='#16A34A';x.fillRect(56,54,12,5)}
  else if(v==='stack'){drawTile(x,{t:2,clr:0},38,2,s,1,0);drawTile(x,{t:4,clr:0},38,40,s,1,0);x.fillStyle='#F7C548';x.font='bold 22px sans-serif';x.fillText('↻',80,30)}
  else if(v==='shot'){[[18,16,0],[50,16,2],[34,40,2],[66,40,2]].forEach(([a,b,t])=>drawTile(x,{t,clr:0},a,b,28,1,0));x.strokeStyle='#F7C548';x.lineWidth=3;x.setLineDash([2,6]);x.beginPath();x.moveTo(56,80);x.lineTo(80,48);x.stroke()}
  else{const im=new Image();im.src=body('fudge');im.onload=()=>{x.drawImage(im,24,0,64,80)};x.fillStyle='#F7C548';x.beginPath();x.moveTo(30,14);x.lineTo(38,2);x.lineTo(46,12);x.lineTo(56,0);x.lineTo(66,12);x.lineTo(74,2);x.lineTo(82,14);x.closePath();x.fill()}
  return c;
}
function buildVariants(box,current,onPick){
  box.innerHTML='';
  VARIANT_KEYS.forEach(v=>{
    const b=document.createElement('button');b.type='button';b.className='vcard';b.dataset.v=v;b.setAttribute('role','radio');
    b.appendChild(variantIcon(v));
    b.insertAdjacentHTML('beforeend',`<b>${VARIANT_INFO[v].name}</b><span>${VARIANT_INFO[v].tag}</span>${v==='classic'?'':'<span class="new">NEW</span>'}`);
    b.addEventListener('click',()=>{onPick(v);sfx('tap')});
    box.appendChild(b);
  });
  markVariants(box,current);
}
function markVariants(box,v){box.querySelectorAll('.vcard').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.v===v)))}
function labelSizes(){
  const names=VARIANT_INFO[prefs.variant].sizes;
  $$('#mode button').forEach((b,i)=>{b.firstChild.textContent=names[i]});
}
buildVariants($('#variants'),prefs.variant,v=>{prefs.variant=v;savePrefs();markVariants($('#variants'),v);labelSizes();if(NET&&inRoom&&isHost())setRoomMode(v)});
labelSizes();
let roomMode=prefs.variant;
function setRoomMode(v){roomMode=v;markVariants($('#lobbyVariants'),v);if(NET&&inRoom)NET.setProfile({mode:v});renderLobby()}
buildVariants($('#lobbyVariants'),roomMode,v=>{if(isHost())setRoomMode(v)});

/* ---------- online ---------- */
let lobbyMembers=[],fillTo=4,botSkill=1,inRoom=false;
const onlineMsg=t=>{$('#onlineMsg').textContent=t||''};
const lobbyMsg=t=>{$('#lobbyMsg').textContent=t||''};
if(!NET){
  $('#onlineNote').textContent=typeof window.FFNet==='undefined'?'Online play runs at foodfight.grudgematchgames.com':'Online play is not set up yet';
  $('#bOnline').disabled=true;
}
$('#bOnline').addEventListener('click',()=>{if(!NET)return;wakeAudio();onlineMsg('');openSub('#ovOnline')});
async function enterRoom(code,invite,retry){
  onlineMsg(invite?`Joining room ${code}…`:'Connecting…');$('#bCreate').disabled=$('#bJoin').disabled=true;
  try{
    roomMode=prefs.variant;markVariants($('#lobbyVariants'),roomMode);
    await NET.join(code,{id:ME.id,name:ME.name,av:prefs.av,mode:roomMode});
    inRoom=true;
    try{history.replaceState(null,'','?room='+code)}catch(e){}
    $('#roomCode').textContent=code;lobbyMsg('');
    lobbyName.value=prefs.name||'';lobbyName.placeholder=ME.name;
    const fresh=!prefs.name;toggleLobbyPicker(fresh);
    $('#meLab').textContent=fresh?'You · pick a name and fighter':'You';
    show('#ovLobby');renderLobby();
  }catch(e){
    if(invite&&!retry){setTimeout(()=>enterRoom(code,true,true),1500);return}   // phones waking up from a link often need a second try
    onlineMsg("Couldn't reach the game server. Check your connection and try again.");
  }finally{$('#bCreate').disabled=$('#bJoin').disabled=false}
}
$('#bCreate').addEventListener('click',()=>enterRoom(NET.makeCode()));
const codeIn=$('#codeIn');
codeIn.addEventListener('input',()=>{codeIn.value=codeIn.value.replace(/\D/g,'').slice(0,5);if(codeIn.value.length===5)onlineMsg('')});
function tryJoin(){const c=codeIn.value;if(!/^\d{5}$/.test(c)){onlineMsg('Room codes are 5 numbers.');return}enterRoom(c)}
$('#bJoin').addEventListener('click',tryJoin);
codeIn.addEventListener('keydown',e=>{if(e.key==='Enter')tryJoin()});
async function leaveRoom(){
  inRoom=false;clearInterval(vsTimer);cancelGrudge();
  if(NET)await NET.leave();
  try{history.replaceState(null,'',location.pathname)}catch(e){}
  toMenu();
}
$('#bLeave').addEventListener('click',leaveRoom);
$('#bOutLeave').addEventListener('click',backToLobby);
$('#bFF').addEventListener('click',()=>{
  if(!G||!G.onlyBotsLeft())return;
  if(G.online)NET.send({t:'ff',mid:G.mid});
  startFF();
});
function startFF(){if(!G||G.ffMode||!G.onlyBotsLeft())return;G.ffMode=true;G.ffStart=G.frame;$('#bFF').hidden=true;setOut(true);sfx('throw')}
/* ---------- knocked out: who did it, spectating, and "someone is watching you" ---------- */
let outHTML='';
function setOut(force){
  if(!G)return;
  const B=G.player,k=B.killedBy,can=G.playerOut&&G.onlyBotsLeft();
  const who=k?`${avImg(k.av)}<b>${esc(k.name)}</b> knocked you out!`:'Your stack hit the top!';
  const sub=G.ffMode&&!G.over?'Fast-forwarding to the final standings…'
    :`You placed ${placeName(B.place)}. ${can?'Only bots are left.':spec?`Watching ${esc(spec.name)}. Tap another board to switch.`:'Tap any board to watch it.'}`;
  const html=`${who}<small>${sub}</small>`;
  if(force||html!==outHTML){outHTML=html;$('#outText').innerHTML=html}
}
function watchBoard(b){
  if(!G||!G.playerOut||G.over||!b||b===G.player)return;
  spec=spec===b?null:b;
  sendWatch();updateSpec();sfx('tap');
}
function stopWatching(){if(spec){spec=null;sendWatch()}updateSpec()}
function sendWatch(){if(G&&G.online&&NET)NET.send({t:'watch',mid:G.mid,id:spec?spec.id:null,by:ME.id,name:ME.name})}
function updateSpec(){
  const on=!!(spec&&G&&!G.over);
  $('#specBar').hidden=!on;
  if(on)$('#specName').textContent=`Watching ${spec.name}`;
  if(G&&G.playerOut)setOut();
  updateOpps&&minis.length&&updateOpps();
}
$('#bSpecOff').addEventListener('click',()=>{stopWatching();sfx('tap')});
// who is watching which board: {boardId:{watcherId:{name,until}}}. Watchers re-announce every 3s; entries expire after 7s.
let watchers={};
function onWatch(m){
  const by=String(m.by||'');if(!by||by===ME.id)return;
  for(const id in watchers)delete watchers[id][by];
  if(m.id&&G.byId(m.id)){(watchers[m.id]=watchers[m.id]||{})[by]={name:String(m.name||'Someone').slice(0,14),until:Date.now()+7000}}
  refreshWatched();
}
function refreshWatched(){
  if(!G)return;
  const now=Date.now(),set=new Set();
  for(const id in watchers){for(const w in watchers[id])if(watchers[id][w].until<now)delete watchers[id][w];if(Object.keys(watchers[id]).length)set.add(id)}
  G.watched=new Set([...set].filter(id=>{const b=G.byId(id);return b&&!b.remote}));
  const mine=Object.values(watchers[G.player.id]||{}).map(w=>w.name);
  const show=!!(mine.length&&!G.over&&!G.player.dead&&!spec);
  $('#watchPill').hidden=!show;
  if(show)$('#watchText').textContent=mine.length===1?`${mine[0]} is watching you`:`${mine.length} cooks are watching you`;
}
function backToLobby(){
  if(!inRoom){toMenu();return}
  cancelGrudge();NET.setState('lobby');$('#outToast').hidden=true;
  show('#ovLobby');renderLobby();
}
$('#bInvite').addEventListener('click',async()=>{
  const url=location.origin+location.pathname+'?room='+NET.code;
  const text=`Join my Food Fight room: ${NET.code}`;
  try{if(navigator.share){await navigator.share({title:'Food Fight',text,url});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(url);lobbyMsg('Invite link copied.')}catch(e){lobbyMsg(url)}
});
$$('#fill button').forEach(b=>b.addEventListener('click',()=>{fillTo=+b.dataset.f;$$('#fill button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderLobby()}));
$$('#botSkill button').forEach(b=>b.addEventListener('click',()=>{botSkill=+b.dataset.d;$$('#botSkill button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}));
function isHost(){return lobbyMembers.length&&lobbyMembers[0].id===ME.id}
function renderLobby(){
  if(!inRoom)return;
  const me=lobbyMembers.findIndex(m=>m.id===ME.id),host=lobbyMembers[0];
  const playing=lobbyMembers.filter(m=>m.state==='playing');
  const seated=lobbyMembers.slice(0,MAX_PLAYERS);
  const ul=$('#seats');ul.innerHTML='';
  seated.forEach((m,i)=>{
    const li=document.createElement('li');
    const tag=m.state==='playing'?'In a match':i===0?'Host':m.id===ME.id?'You':'';
    li.innerHTML=`${avImg(m.id===ME.id?prefs.av:m.av)}${esc(m.name)}${m.id===ME.id&&i===0?' (you)':''}<span>${tag}</span>`;
    ul.appendChild(li);
  });
  const hostView=isHost(),target=Math.max(4,seated.length);
  const bots=hostView&&fillTo>seated.length?pickBots(fillTo-seated.length,null,[]):[];
  bots.forEach(bt=>{const li=document.createElement('li');li.className='bot';li.innerHTML=`${avImg(bt.av)}${bt.name}<span>Bot</span>`;ul.appendChild(li)});
  for(let i=seated.length+bots.length;i<target;i++){const li=document.createElement('li');li.className='empty';li.textContent='Open seat';ul.appendChild(li)}
  $('#seatCount').textContent=`· ${seated.length} of ${MAX_PLAYERS}`;
  $('#hostBox').hidden=!hostView;$('#bStart').hidden=!hostView;
  const hostMode=host&&VARIANT_INFO[host.id===ME.id?roomMode:host.mode]?(host.id===ME.id?roomMode:host.mode):'classic';
  $('#lobbyVariants').hidden=!hostView;$('#lobbyVarLab').textContent=hostView?'Game mode':'Next game';
  const vn=$('#lobbyVarNote');vn.hidden=hostView;vn.innerHTML=`<b>${VARIANT_INFO[hostMode].name}</b> · ${VARIANT_INFO[hostMode].tag}. ${esc(host?host.name:'The host')} picks the mode.`;
  if(me>=MAX_PLAYERS)lobbyMsg('This room is full. You can wait here for an open seat.');
  else if(playing.length)lobbyMsg(playing.some(m=>m.id===ME.id)?'':'A match is in progress. You will be in the next one.');
  else if(!hostView&&host)lobbyMsg(`Waiting for ${host.name} to start.`);
  else if(hostView&&seated.length<2&&fillTo<2)lobbyMsg('Share the code, or add bots to play now.');
  else lobbyMsg('');
  $('#bStart').disabled=!!playing.length||(seated.length<2&&fillTo<2);
  const forming=lobbyMembers.filter(m=>m.state.startsWith('gm:')&&m.id!==ME.id);
  const gj=$('#gmJoin');gj.hidden=!forming.length&&!gmMid;gj.disabled=!!gmMid;
  if(gmMid)gj.innerHTML=`You're in!<small>${esc($('#gmMsg').textContent||'Waiting for the grudge match')}</small>`;
  else if(forming.length){gj.innerHTML=`Join the grudge match<small>${forming.length} cook${forming.length>1?'s':''} in · ${esc(forming.map(m=>m.name).join(', '))}</small>`;gj.dataset.state=forming[0].state}
}
$('#gmJoin').addEventListener('click',e=>{const st=e.currentTarget.dataset.state;if(st&&!gmMid)joinGrudge(st)});
$('#bStart').addEventListener('click',()=>{
  if(!isHost())return;
  const humans=lobbyMembers.filter(m=>m.state!=='playing').slice(0,MAX_PLAYERS);
  const roster=humans.map(h=>({id:h.id,name:h.name,av:h.id===ME.id?prefs.av:h.av}));
  if(fillTo>roster.length)pickBots(fillTo-roster.length,null,[]).forEach((bt,i)=>roster.push({id:`bot:${ME.id}:${i}`,name:bt.name,av:bt.av,bot:true,owner:ME.id}));
  if(roster.length<2){lobbyMsg('Need at least one more cook. Share the code or turn on bots.');return}
  const m={t:'start',mid:Math.random().toString(36).slice(2,10),seed:Math.floor(Math.random()*2**31),roster,diff:botSkill,delay:3000,variant:roomMode,host:ME.id,boss:pickBoss(roster)};
  NET.send(m);onStart(m);
});
function pickBoss(roster){const used=new Set(roster.map(r=>r.av));const free=FIGHTERS.filter(a=>!used.has(a));const pool=free.length?free:FIGHTERS;return {av:pool[Math.floor(Math.random()*pool.length)]}}
function onStart(m){
  if(!inRoom||!m||!Array.isArray(m.roster)||m.roster.length<2||m.roster.length>MAX_PLAYERS)return;
  if(!m.roster.some(r=>r.id===ME.id)){if(!$('#ovLobby').hidden)lobbyMsg('A match just started. You will be in the next one.');return}
  wakeAudio();cancelGrudge();NET.setState('playing');spec=null;watchers={};
  const variant=VARIANT_INFO[m.variant]?m.variant:'classic';
  lastMatch={mid:m.mid,roster:m.roster,bots:m.roster.filter(r=>r.bot).length,diff:Math.max(0,Math.min(2,m.diff|0)),champ:null,variant};
  // build the match now so everyone sees boards during the countdown
  G=new Game('online',Math.max(0,Math.min(2,m.diff|0)),Object.assign({},baseHooks,{
    send:x=>{x.mid=m.mid;NET.send(x)}
  }),false,{roster:m.roster.map(r=>({id:String(r.id),name:String(r.name||'Cook').slice(0,14),av:String(r.av||''),bot:!!r.bot,owner:r.owner?String(r.owner):undefined})),myId:ME.id,seed:m.seed>>>0,variant,hostId:m.host?String(m.host):null,boss:m.boss&&FIGHTERS.includes(m.boss.av)?{av:m.boss.av}:null});
  G.mid=m.mid;G.champId=m.champ||null;G.paused=true;G.waiting=true;
  rackIds='~';trayKey='~';plating=null;buildOpps();renderRack();resize();
  showMatchup(Math.max(1,Math.round((m.delay||3000)/1000)),()=>{if(G&&G.mid===m.mid){G.paused=false;G.waiting=false}});
}
/* ---------- Grudge Match: rematch whoever taps in, with the same number of bots ---------- */
// presence state while waiting: "gm:<last match id>:<bots>:<bot skill>"
let lastMatch=null,gmMid=null,gmTimer=null,gmDeadline=0,gmTick=null;
const gmState=(mid,bots,diff,v)=>`gm:${mid}:${bots|0}:${diff|0}:${VARIANT_INFO[v]?v:'classic'}`;
const gmKey=st=>st.split(':').slice(0,2).join(':');
function setAgain(title,sub,disabled){$('#bAgain').innerHTML=`${esc(title)}<small id="againSub">${esc(sub)}</small>`;$('#bAgain').disabled=!!disabled}
function joinGrudge(state){
  if(!inRoom||!NET)return;
  gmMid=gmKey(state);myGm=state;NET.setState(state);
  setAgain("You're in!",'Waiting for at least one more cook',true);
  $('#gmPanel').hidden=false;clearInterval(gmTick);gmTick=setInterval(renderGm,250);
  wakeAudio();sfx('tap');renderGm();setTimeout(gmCheck,300);
}
let myGm='';
function cancelGrudge(){clearTimeout(gmTimer);gmTimer=null;clearInterval(gmTick);gmTick=null;gmMid=null;myGm='';gmDeadline=0;$('#gmPanel').hidden=true}
const gmIns=()=>gmMid?lobbyMembers.filter(m=>gmKey(m.state)===gmMid):[];
function renderGm(){
  if(!gmMid)return;
  const ins=gmIns(),inIds=new Set(ins.map(m=>m.id));
  const prev=lastMatch&&('gm:'+lastMatch.mid)===gmMid?lastMatch.roster.filter(r=>!r.bot):[];
  const people=prev.concat(ins.filter(m=>!prev.some(p=>p.id===m.id)));
  $('#gmList').innerHTML=people.map(p=>{
    const here=lobbyMembers.some(m=>m.id===p.id),isIn=inIds.has(p.id);
    return `<li class="${isIn?'in':here?'':'gone'}">${avImg(p.id===ME.id?prefs.av:p.av)}${esc(p.id===ME.id?'You':p.name)} <span>${isIn?'In':here?'Deciding…':'Left'}</span></li>`;
  }).join('');
  const bots=+(myGm.split(':')[2]||0);
  const secs=gmDeadline?Math.max(0,Math.ceil((gmDeadline-Date.now())/1000)):0;
  $('#gmMsg').textContent=ins.length<2?'Waiting for at least one more cook to tap Grudge Match…'
    :gmDeadline?`Grudge match in ${secs}…${bots?` (+${bots} bot${bots>1?'s':''})`:''}`:`${ins.length} cooks in. Starting…`;
  if(!$('#ovLobby').hidden){const gj=$('#gmJoin');gj.hidden=false;gj.disabled=true;gj.innerHTML=`You're in!<small>${esc($('#gmMsg').textContent)}</small>`}
}
function gmCheck(){
  if(!gmMid||!NET)return;
  renderGm();
  const ins=gmIns(),leader=ins[0];
  if(!leader||leader.id!==ME.id||ins.length<2){
    if(gmTimer){clearTimeout(gmTimer);gmTimer=null;gmDeadline=0;NET.send({t:'gmsoon',gm:gmMid,ms:0})}
    return;
  }
  // everyone from last round who is still in the room is in -> go now; otherwise give stragglers 8 seconds
  const prevHumans=lastMatch&&('gm:'+lastMatch.mid)===gmMid?lastMatch.roster.filter(r=>!r.bot&&lobbyMembers.some(m=>m.id===r.id)).map(r=>r.id):[];
  const allIn=prevHumans.length>0&&prevHumans.every(id=>ins.some(m=>m.id===id));
  const ms=allIn?1500:8000,at=Date.now()+ms;
  if(gmTimer&&gmDeadline<=at)return;
  clearTimeout(gmTimer);gmDeadline=at;NET.send({t:'gmsoon',gm:gmMid,ms});
  gmTimer=setTimeout(startGrudge,ms);
}
function startGrudge(){
  gmTimer=null;
  const ins=gmIns();
  if(ins.length<2||!gmMid||ins[0].id!==ME.id){gmDeadline=0;renderGm();return}
  const [,,b,d,gv]=(ins[0].state||myGm).split(':');
  const humans=ins.slice(0,MAX_PLAYERS);
  const roster=humans.map(h=>({id:h.id,name:h.name,av:h.id===ME.id?prefs.av:h.av}));
  const used=new Set(roster.map(r=>r.av));
  const want=Math.min(+b||0,MAX_PLAYERS-roster.length);
  BOTS.filter(x=>!used.has(x.av)).concat(BOTS.filter(x=>used.has(x.av))).slice(0,want)
    .forEach((bt,i)=>roster.push({id:`bot:${ME.id}:${i}`,name:bt.name,av:bt.av,bot:true,owner:ME.id}));
  const champ=lastMatch&&('gm:'+lastMatch.mid)===gmMid?lastMatch.champ:null;
  const m={t:'start',mid:Math.random().toString(36).slice(2,10),seed:Math.floor(Math.random()*2**31),roster,diff:+d||1,delay:3000,champ,grudge:true,variant:VARIANT_INFO[gv]?gv:'classic',host:ME.id,boss:pickBoss(roster)};
  NET.send(m);onStart(m);
}

const goneTimers={};
function maybeGone(id){
  if(goneTimers[id])return;
  goneTimers[id]=setTimeout(()=>{
    delete goneTimers[id];
    if(!G||!G.online||G.over)return;
    if(NET.members.some(x=>x.id===id))return; // still here: it was only a status update
    G.netLeave(id);
  },4000);
}
if(NET){
  NET.on({
    message(m){
      if(m.t==='start'){onStart(m);return}
      if(m.t==='gmsoon'){if(gmMid&&m.gm===gmMid){gmDeadline=m.ms>0?Date.now()+m.ms:0;renderGm()}return}
      if(!G||!G.online||m.mid!==G.mid)return;
      if(m.t==='snaps')G.netSnaps(m.list);
      else if(m.t==='atk')G.netAttack(m);
      else if(m.t==='ko')G.netKO(m.id,m.by);
      else if(m.t==='steal')G.netSteal(m);
      else if(m.t==='ff')startFF();
      else if(m.t==='watch')onWatch(m);
      else if(m.t==='owin')G.finishOrders(G.byId(m.id));
      else if(m.t==='odone')G.netOrderDone(m.id);
      else if(m.t==='boss')G.netBoss(m);
      else if(m.t==='dmg')G.netDamage(m);
      else if(m.t==='batk')G.netBossAttack(m);
      else if(m.t==='swapg')G.netSwapGrid(m);
      else if(m.t==='give')G.netGive(m);
    },
    members(list){
      lobbyMembers=list;renderLobby();gmCheck();
      if(G&&G.online&&!G.over)G.boards.forEach(b=>{if(b.remote&&!b.dead&&!list.some(x=>x.id===b.owner))maybeGone(b.owner)});
    },
    // Supabase also reports a 'leave' when someone merely updates their status (lobby -> playing),
    // so a player only counts as gone if they are still missing from the room a few seconds later
    left(id){maybeGone(id)}
  });
}
function afterLoad(){
  const q=NET?new URLSearchParams(location.search).get('room'):null;
  // invite link: skip the menu and go straight into the room (older 4-letter links still work)
  if(q&&(/^\d{5}$/.test(q)||/^[A-Za-z]{4}$/.test(q))){
    const code=/^\d+$/.test(q)?q:q.toUpperCase();
    backTo='#ovStart';codeIn.value=code;show('#ovOnline');enterRoom(code,true);
  }
  else show('#ovStart');
}
function preload(){
  const urls=Object.values(ART),bar=$('#loadBar'),lines=['Heating up the kitchen…','Sharpening the spatulas…','Lacing up the sneakers…','Whipping the cream…'];
  let done=0;$('#loadText').textContent=lines[Math.floor(Math.random()*lines.length)];
  const one=u=>new Promise(res=>{const im=new Image();im.onload=im.onerror=()=>{done++;bar.style.width=(done/urls.length*100)+'%';res()};im.src=u});
  const min=new Promise(r=>setTimeout(r,900)),cap=new Promise(r=>setTimeout(r,2000)); // slow network: carry on, art keeps loading
  Promise.all([Promise.race([Promise.all(urls.map(one)),cap]),min]).then(()=>{bar.style.width='100%';setTimeout(afterLoad,150)});
}

/* ---------- no zooming: iOS ignores user-scalable=no, so block its zoom gestures directly ---------- */
['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
let lastTouchEnd=0;
document.addEventListener('touchend',e=>{
  const now=Date.now(),tag=e.target&&e.target.tagName;
  if(now-lastTouchEnd<350&&tag!=='INPUT'&&tag!=='TEXTAREA'&&tag!=='SELECT'){
    e.preventDefault();   // second tap of a double tap: no zoom...
    const b=e.target.closest&&e.target.closest('button,a,.vcard,.foe');if(b)b.click();   // ...but a quick second tap on a button still counts
  }
  lastTouchEnd=now;
},{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});   // pinch

/* ---------- boot ---------- */
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=ICONS[e.dataset.icon]);
try{$('#year').textContent=new Date().getFullYear()}catch(e){}
showMute();showBest();renderPicker();
demo();applyLook();show('#ovLoad');preload();
window.__ff={get game(){return G}}; // handy for debugging in the console

let acc=0,last=performance.now(),hf=0,lastMargin=1,lastG=null;
function loop(now){
  acc+=Math.min(100,now-last);last=now;
  while(acc>=1000/60){if(G)G.step();acc-=1000/60}
  if(G&&G.ffMode&&!G.over&&G.local().some(b=>b.isBot&&!b.dead)){
    for(let i=0;i<60&&!G.over;i++)G.step();
    if(!G.over&&G.frame-G.ffStart>60*600)G.resolveByHeight();
  }
  if(G!==lastG){lastG=G;lastMargin=1}
  if(G&&!G.over&&!G.paused&&!G.player.dead){const m=G.margin();if(m>lastMargin){lastMargin=m;G.player.pops.push({text:`Overtime · throws ×${m.toFixed(1)}`,x:3,y:4,col:'#F7C548',size:.85,life:90});sfx('overtime')}}
  if(G&&!G.over&&!G.paused&&!G.player.dead&&hf%48===0&&(G.player.g[0].some(Boolean)||G.player.g[1].some(Boolean)))sfx('heart');
  render();
  if(++hf%3===0&&G){updateOpps();renderTray();hud();updateAim();if(G.variant==='order')renderRail();if(G.boss)renderBoss()}
  if(hf%15===0&&G&&!$('#outToast').hidden){
    const can=G.playerOut&&G.onlyBotsLeft();
    $('#bFF').hidden=!can||!!G.ffMode;
    setOut();
  }
  if(hf%15===0&&G){
    // the board you're watching got knocked out: after a beat, follow whoever did it (or anyone still cooking)
    if(spec&&spec.dead&&!G.over&&G.frame-(spec.diedAt||0)>100){
      const k=spec.killedBy,next=k&&!k.dead&&k!==G.player?k:G.alive().find(b=>b!==G.player);
      if(next&&next!==spec){spec=next;sendWatch();updateSpec()}
    }
    if(G.online)refreshWatched();
  }
  if(hf%180===0&&spec&&G&&G.online&&!G.over)sendWatch();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
