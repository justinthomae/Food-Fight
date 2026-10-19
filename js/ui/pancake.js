// Pancake Tower screen: the falling stack of three, its ghost, the Next stack beside the board,
// and a ◀ ▶ ⇅ Drop row under it on phones (keyboard on desktop)
(function(){
const U=()=>window.FFUI;
let nextKey='',sd=null;
const tileY=t=>t.yo<0?Math.min(0,t.yo+.34*U().ALPHA):(t.yo||0);
(window.FF_MODES=window.FF_MODES||{}).pancake={
  info:{name:'Pancake Tower',tag:'Stack of three',sizes:['Duel','Brawl','Big Brawl'],hidden:true,blurb:'line up 3 in any direction, chain to dump trash'},
  noTray:true,noRaise:true,growSide:true,deskNoFooter:true,footClass:()=>'stackbtn',
  keys:'← → move · ↓ faster · ↑ / X flip order · Z flip back · Space drop',
  side(){return '<div class="nextbox"><span>Next</span><canvas id="pcNextCv"></canvas></div>'},
  sideW(){return 76},
  ctl(){return '<div class="stackrow"><div class="movepad row" id="movePad"><span>◀</span><span>▶</span></div><button class="spin icon" id="bCyc" type="button" aria-label="Flip the order">⇅</button><button class="spin drop" id="bDrop" type="button">Drop</button></div>'},
  bind(){
    nextKey='';const F=U(),P=()=>F.G.player;
    const cy=F.$('#bCyc');if(cy)cy.addEventListener('pointerdown',e=>{e.preventDefault();if(F.canPlay())P().cycle(1)});
    const d=F.$('#bDrop');if(d)d.addEventListener('pointerdown',e=>{e.preventDefault();if(F.canPlay())P().hardDrop()});
    const pad=F.$('#movePad');if(!pad)return;let st=null,rep=null;
    const stop=()=>{clearTimeout(rep);clearInterval(rep);rep=null;st=null};
    pad.addEventListener('pointerdown',e=>{e.preventDefault();if(!F.canPlay())return;try{pad.setPointerCapture(e.pointerId)}catch(_){}
      const r=pad.getBoundingClientRect(),dir=e.clientX<r.left+r.width/2?-1:1;st={x:e.clientX,moved:0,id:e.pointerId};P().move(dir);
      rep=setTimeout(()=>{rep=setInterval(()=>{if(st&&!st.moved&&F.canPlay())P().move(dir)},85)},260)});
    pad.addEventListener('pointermove',e=>{if(!st||e.pointerId!==st.id||!F.canPlay())return;const steps=Math.trunc((e.clientX-st.x)/26);
      if(steps){st.moved=1;st.x+=steps*26;for(let k=0;k<Math.abs(steps);k++)P().move(Math.sign(steps))}});
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>pad.addEventListener(ev,stop));
  },
  icon(x){const F=U(),s=24;[[2,0],[0,1],[4,2]].forEach(([t,i])=>F.drawTile(x,{t,clr:0},34,4+i*(s+1),s,1,0));
    x.strokeStyle='#F7C548';x.lineWidth=4;x.lineCap='round';x.lineJoin='round';x.beginPath();
    x.moveTo(78,18);x.lineTo(78,62);x.moveTo(71,26);x.lineTo(78,18);x.lineTo(85,26);x.moveTo(71,54);x.lineTo(78,62);x.lineTo(85,54);x.stroke()},
  stat(B){return [B.maxChain,'Best chain']},
  drawNext(B){
    const F=U(),c=F.$('#pcNextCv');if(!c||!B.queue)return;
    const want=Math.round(Math.max(22,Math.min(F.S,(F.SIDEW-18)||F.S,F.SIDEZ>1?F.S:64))/F.SIDEZ);
    const key=B.queue[0].join('')+'|'+want+F.prefs.palette+F.prefs.art+F.cuisine();if(key===nextKey)return;nextKey=key;
    c.width=want*F.DPR;c.height=want*3*F.DPR;c.style.width=want+'px';c.style.height=want*3+'px';
    const x=c.getContext('2d'),s=want*F.DPR;x.clearRect(0,0,c.width,c.height);
    B.queue[0].forEach((t,i)=>F.drawTile(x,{t,clr:0},0,i*s,s,1,0));
  },
  render(){
    const F=U(),ctx=F.ctx,S=F.S,G=F.G,B=F.spec||G.player,mine=B===G.player,W=S*F.COLS,H=S*F.ROWS,f=G.frame;
    F.checker(0);
    // the spawn column: if it fills to the top you're out
    ctx.strokeStyle='rgba(204,121,167,.55)';ctx.lineWidth=Math.max(2,S*.06);const xc=2*S+S/2,yc=S/2,k=S*.18;
    ctx.beginPath();ctx.moveTo(xc-k,yc-k);ctx.lineTo(xc+k,yc+k);ctx.moveTo(xc+k,yc-k);ctx.lineTo(xc-k,yc+k);ctx.stroke();
    const sh=B.shake?Math.sin(B.shake*2)*S*.04:0,dim=B.dead?.45:1;
    for(let r=0;r<F.ROWS;r++)for(let c=0;c<F.COLS;c++){const t=B.g[r][c];if(t)F.drawTile(ctx,t,c*S,(r+tileY(t))*S+sh,S,dim,f)}
    const p=!B.remote&&B.piece;
    if(p){
      // ghost where it will land
      const gr=B.landRow(p);for(let i=0;i<3;i++)if(gr+i>=0)F.drawTile(ctx,{t:p.f[i],clr:0},p.c*S,(gr+i)*S,S,.22,f);
      // smooth: the fall carries on between steps, slides glide, and a flip rolls the three round
      let pr=p.r;if(F.ALPHA){const bl=Math.floor(p.r)+1;if(B.fits({c:p.c,r:bl}))pr=Math.min(bl,p.r+B.speed()*F.ALPHA)}
      const v=this.vis||(this.vis={});
      if(v.pid!==B.pid||v.b!==B){v.pid=B.pid;v.b=B;v.c=p.c;v.spin=p.spin;v.k=0;v.dir=1}
      if(p.spin!==v.spin){v.dir=Math.sign(p.spin-v.spin);v.spin=p.spin;v.k=1}
      const e=1-Math.exp(-F.drawDt/28);v.c+=(p.c-v.c)*e;if(Math.abs(p.c-v.c)<.01)v.c=p.c;
      v.k*=Math.exp(-F.drawDt/40);if(v.k<.01)v.k=0;
      for(let i=0;i<3;i++){
        // after a flip, tile 0 rose from the bottom (or tile 2 dropped from the top) and the other two slid one step
        let off=0;if(v.k){if(v.dir>0)off=i===0?2*v.k:-v.k;else off=i===2?-2*v.k:v.k}
        const y=(pr+i+off)*S+sh;if(y<-S)continue;F.drawTile(ctx,{t:p.f[i],clr:0},v.c*S,y,S,1,f);
      }
      if(mine){ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2.5;F.rr(ctx,v.c*S+1.5,pr*S+1.5+sh,S-3,S*3-3,S*.2);ctx.stroke()}
    }
    F.drawEffects(ctx,B,W,H,f);
    if(mine)F.drawIncoming(B);
    F.drawFxLayer(B,0);
    if(B.dead&&G.playerOut&&!G.over)F.drawKO(B,W,H);
    if(mine)this.drawNext(B);
  },
  mini(c,b,w,h,s){
    const F=U();c.fillStyle=F.TOK.well;c.fillRect(0,0,w,h);const simple=s<14,fr=F.G.frame;
    for(let r=0;r<F.ROWS;r++)for(let k=0;k<F.COLS;k++){const t=b.g[r][k];if(t)F.drawTile(c,t,k*s,r*s,s,b.dead?.5:1,fr,simple)}
    if(!b.remote&&b.piece){const p=b.piece,r0=Math.floor(p.r);for(let i=0;i<3;i++)if(r0+i>=0)F.drawTile(c,{t:p.f[i],clr:0},p.c*s,(r0+i)*s,s,1,fr,simple)}
    if(b.g[0].some(Boolean)||b.g[1].some(Boolean)){c.fillStyle='rgba(247,197,72,.55)';c.fillRect(0,0,w,Math.max(2,s*.2))}
    if(b.dead)F.miniKO(c,w,h);
  },
  down(e,p){const B=U().G.player;sd={id:e.pointerId,x0:p.x,y0:p.y,t:performance.now(),c0:B.piece?B.piece.c:2,moved:false}},
  move(e,p){
    if(!sd||e.pointerId!==sd.id)return;const S=U().S,B=U().G.player,dx=p.x-sd.x0,dy=p.y-sd.y0;
    if(Math.abs(dx)>S*.35)sd.moved=true;
    if(sd.moved&&B.piece)B.moveTo(Math.max(0,Math.min(5,sd.c0+Math.round(dx/(S*.85)))));
    if(!sd.moved&&dy>S*1.1)B.soft=true;
  },
  up(e,p){
    if(!sd||(e&&e.pointerId!==sd.id))return;const S=U().S,B=U().G.player,dt=performance.now()-sd.t;
    if(p&&!sd.moved){const dy=p.y-sd.y0;if(dy>S*1.6&&dt<450)B.hardDrop();else if(Math.abs(dy)<S*.5&&dt<350)B.cycle(1)}
    B.soft=false;sd=null;
  },
  key(k,down){
    const B=U().G.player;
    if(k==='ArrowDown'){B.soft=down;return true}
    if(!down)return['ArrowLeft','ArrowRight','ArrowUp',' ','Enter','x','X','z','Z'].includes(k);
    if(k==='ArrowLeft')B.move(-1);else if(k==='ArrowRight')B.move(1);
    else if(k==='ArrowUp'||k==='x'||k==='X')B.cycle(1);else if(k==='z'||k==='Z')B.cycle(-1);
    else if(k===' '||k==='Enter')B.hardDrop();
    else return false;
    return true;
  },
};
})();
