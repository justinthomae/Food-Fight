// Recipe Merge screen: the recipe ladder on top, the 5x5 counter at the bottom. Swipe (or arrows / WASD) to slide.
(function(){
const U=()=>window.FFUI;
const K=()=>window.FFEngine&&FFEngine.BOARD_TYPES.merge;
// the dishes come from your kitchen (cuisine): tiers 1-5 are its five foods, 6-10 the golden versions, 10 is the Feast
const foodOf=t=>(t-1)%5,gold=t=>t>5;
function tierName(t){if(!t)return'';if(t<0)return'Trash';const n=(U().names()||[])[foodOf(t)]||'Dish';return t>=10?'Feast':gold(t)?'Golden '+n:n}
const colOf=t=>t<0?'#6B7080':gold(t)?'#F7C548':(U().PAL.c[foodOf(t)]||'#888');
// counter geometry in board units (the board is 6 x 12)
const GW=5.7,GX=.15,GY=12-5.7-.25,CS=GW/5;
const sprites=new Map();
function tierSprite(t,px){
  const F=U(),key=t+'|'+px+'|'+F.prefs.palette+F.prefs.art+F.cuisine();let sp=sprites.get(key);if(sp)return sp;
  if(sprites.size>120)sprites.clear();
  sp=document.createElement('canvas');sp.width=sp.height=px;const c=sp.getContext('2d');
  const p=px*.04,r=px*.2;
  F.drawTile(c,{t:foodOf(t),clr:0},0,0,px,1,0);
  if(gold(t)){   // golden dish: gold rim, shine, and a crown on the Feast
    c.lineWidth=px*.075;c.strokeStyle='#F7C548';F.rr(c,px*.06,px*.06,px*.88,px*.88,px*.2);c.stroke();
    c.lineWidth=px*.025;c.strokeStyle='#FFF3B0';F.rr(c,px*.1,px*.1,px*.8,px*.8,px*.17);c.stroke();
    const st=(x,y,R)=>{c.fillStyle='#FFF6C8';c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr_=i%2?R*.38:R;c.lineTo(x+Math.cos(a)*rr_,y+Math.sin(a)*rr_)}c.closePath();c.fill()};
    st(px*.2,px*.2,px*.09);st(px*.82,px*.3,px*.06);
    if(t>=10){c.fillStyle='#F7C548';c.strokeStyle='#7A4A12';c.lineWidth=px*.02;c.beginPath();const y0=px*.02,w=px*.42,x0=px/2-w/2;
      c.moveTo(x0,y0+px*.17);c.lineTo(x0,y0+px*.04);c.lineTo(x0+w*.25,y0+px*.11);c.lineTo(x0+w/2,y0);c.lineTo(x0+w*.75,y0+px*.11);c.lineTo(x0+w,y0+px*.04);c.lineTo(x0+w,y0+px*.17);c.closePath();c.fill();c.stroke()}
  }
  // tier number, bottom right
  const rr2=px*.15;c.fillStyle='rgba(11,13,27,.72)';c.beginPath();c.arc(px-p-rr2*1.05,px-p-rr2*1.05,rr2,0,Math.PI*2);c.fill();
  c.fillStyle='#FFFFFF';c.font=`800 ${Math.round(px*.19)}px Figtree,sans-serif`;c.fillText(String(t),px-p-rr2*1.05,px-p-rr2*1.05+px*.01);
  sprites.set(key,sp);return sp;
}
function drawTier(c,t,x,y,s,a,sc){
  if(!t)return;const F=U();
  if(a!=null&&a<1)c.globalAlpha=a;
  if(sc&&sc!==1){const m=s*(1-sc)/2;x+=m;y+=m;s*=sc}
  if(t<0)F.drawJunk(c,x,y,s);
  else c.drawImage(tierSprite(t,Math.max(8,Math.round(s*F.DPR))),x,y,s,s);
  c.globalAlpha=1;
}
const gridOf=B=>B.remote?(B.ms?K().decode(B.ms.b):null):B.m;
const bestOf=B=>B.remote?(B.ms?B.ms.bt|0:1):B.best;
const ease=p=>1-(1-p)*(1-p);
let sd=null;
if(K())K().nameOf=tierName;
const MU={
  info:{how:'Swipe to slide everything. Two of the same combine into the next dish. Big dishes dump trash on rivals.',name:'Recipe Merge',tag:'Swipe to cook',sizes:['Duel','Brawl','Big Brawl'],blurb:'swipe to combine ingredients into dishes, big dishes dump trash'},
  noTray:true,noRaise:true,noFooter:true,
  icon(x){
    const s=30;drawTier(x,3,4,30,s);drawTier(x,3,34,30,s);
    x.strokeStyle='#F7C548';x.lineWidth=4;x.lineCap='round';x.beginPath();x.moveTo(67,45);x.lineTo(77,45);x.moveTo(73,40);x.lineTo(78,45);x.lineTo(73,50);x.stroke();
    drawTier(x,4,78,24,34);
    x.fillStyle='#F7C548';x.font=`800 13px Figtree,sans-serif`;x.textAlign='center';x.fillText('+',34,22);
  },
  render(){
    const F=U(),ctx=F.ctx,S=F.S,G=F.G,B=F.spec||G.player,mine=B===G.player,W=S*6,H=S*12,f=G.frame,Mb=K();if(!Mb)return;
    ctx.fillStyle=F.TOK.well;ctx.fillRect(0,0,W,H);
    const m=gridOf(B),best=bestOf(B),sh=B.shake?Math.sin(B.shake*2)*S*.05:0;
    // ---- the recipe ladder: every dish in order, the ones you've made lit up, the next goal ringed in gold ----
    const ls=S*.98,lgap=(W-ls*5)/6;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const top=mine?S*1.05:S*1.55;if(!mine)F.bigText(B.name,W/2,S*.8,S*.5,'#EEF0FA',W*.8);
    for(let t=1;t<=10;t++){
      const row=t<=5?0:1,col=(t-1)%5,x=lgap+col*(ls+lgap),y=top+row*S*1.75;
      const done=t<=best,next=t===Math.min(10,best+1)&&best<10;
      if(next){const pu=.55+.45*Math.sin(f*.12);ctx.strokeStyle=`rgba(247,197,72,${pu})`;ctx.lineWidth=Math.max(2,S*.08);F.rr(ctx,x-S*.07,y-S*.07,ls+S*.14,ls+S*.14,ls*.26);ctx.stroke()}
      drawTier(ctx,t,x,y,ls,done?1:next?.75:.28);
      ctx.fillStyle=done?'#EEF0FA':next?'#F7C548':'rgba(238,240,250,.4)';
      // golden dishes: "Golden" on a small line above the food's name, both shrunk to fit the slot
      const nm=tierName(t),two=nm.startsWith('Golden '),fit=(txt,px,yy)=>{ctx.font=`800 ${Math.round(px)}px Figtree,sans-serif`;const tw=ctx.measureText(txt).width,mx=ls*1.22;if(tw>mx)ctx.font=`800 ${Math.round(px*mx/tw)}px Figtree,sans-serif`;ctx.fillText(txt,x+ls/2,yy)};
      if(two){fit('Golden',S*.17,y+ls+S*.16);fit(nm.slice(7),S*.21,y+ls+S*.36)}else fit(nm,S*.23,y+ls+S*.22);
    }
    {const nx=best<10?tierName(best+1):null,served=B.remote?(B.ms?B.ms.sv|0:0):B.served;
     ctx.font=`800 ${Math.round(S*.3)}px Figtree,sans-serif`;ctx.fillStyle='rgba(238,240,250,.75)';
     ctx.fillText(nx?`Next dish: ${nx}`:`Feasts served: ${served}`,W/2,top+S*3.75);
     if(mine&&F.DESK.matches){ctx.font=`700 ${Math.round(S*.22)}px Figtree,sans-serif`;ctx.fillStyle='rgba(238,240,250,.45)';ctx.fillText('Arrow keys or WASD to slide',W/2,top+S*4.2)}}
    // ---- the counter ----
    const gx=GX*S,gy=GY*S+sh,cs=CS*S,full=m?m.flat().filter(Boolean).length:0;
    F.rr(ctx,gx-S*.08,gy-S*.08,cs*5+S*.16,cs*5+S*.16,S*.28);ctx.fillStyle='#5A3A26';ctx.fill();
    if(full>=21&&!B.dead){ctx.strokeStyle=`rgba(229,72,77,${.5+.4*Math.sin(f*.3)})`;ctx.lineWidth=Math.max(2.5,S*.09);ctx.stroke()}
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){F.rr(ctx,gx+c*cs+cs*.05,gy+r*cs+cs*.05,cs*.9,cs*.9,cs*.18);ctx.fillStyle='rgba(0,0,0,.22)';ctx.fill()}
    if(m){
      const dim=B.dead?.45:1,A=!B.remote&&B.anim,p=A?(f+F.ALPHA-A.f)/6:9;
      if(A&&p<1){
        // sliding: every tile glides from where it was to where it's going (still showing what it was)
        const e=ease(Math.max(0,p));
        for(let r=0;r<5;r++)for(let c=0;c<5;c++)if(m[r][c]<0&&!(A.trash||[]).some(x=>x[0]===r&&x[1]===c))drawTier(ctx,-1,gx+c*cs+cs*.04,gy+r*cs+cs*.04,cs*.92,dim);
        (A.cleared||[]).forEach(([r,c])=>drawTier(ctx,-1,gx+c*cs+cs*.04,gy+r*cs+cs*.04,cs*.92,dim*(1-e),1-e*.4));
        A.moves.forEach(mv=>{const cc=mv.fc+(mv.tc-mv.fc)*e,rr=mv.fr+(mv.tr-mv.fr)*e;drawTier(ctx,mv.t,gx+cc*cs+cs*.04,gy+rr*cs+cs*.04,cs*.92,dim)});
      }else{
        const q=A?p-1:9;
        for(let r=0;r<5;r++)for(let c=0;c<5;c++){const v=m[r][c];if(!v)continue;
          let sc=1,a=dim,yo=0;
          if(A&&q<1.4){
            if(A.merges.some(x=>x.r===r&&x.c===c)&&q<.9)sc=1+.2*Math.sin(Math.PI*q/.9);
            if(A.spawned.some(x=>x[0]===r&&x[1]===c))sc=Math.min(1,Math.max(.05,(q+.4)/1.1));
            if(A.trash&&A.trash.some(x=>x[0]===r&&x[1]===c)){const k=Math.min(1,(f+F.ALPHA-(B.trashAt||A.f))/10);yo=-(1-ease(k))*S*2;a=dim*k}
          }
          drawTier(ctx,v,gx+c*cs+cs*.04,gy+r*cs+cs*.04+yo,cs*.92,a,sc)}
        // a Feast leaves the counter: it rises and fades
        if(A&&A.served&&q<2.5)A.served.forEach(([r,c])=>{const k=Math.max(0,q)/2.5;drawTier(ctx,10,gx+c*cs+cs*.04,gy+r*cs-k*S*2.5,cs*.92,1-k,1+k*.5)});
      }
    }
    if(mine)F.drawIncoming(B);
    else if(B.remote&&(B.minc|0)>0){ctx.fillStyle='#E5484D';F.rr(ctx,S*.12,S*.12,S*1.6,S*.5,S*.25);ctx.fill();ctx.fillStyle='#FFF';ctx.font=`800 ${Math.round(S*.26)}px Figtree,sans-serif`;ctx.fillText(`+${B.minc} trash`,S*.92,S*.38)}
    F.drawFxLayer(B,0);
    if(B.dead&&G.playerOut&&!G.over)F.drawKO(B,W,H);
  },
  mini(c,b,w,h){
    const m=gridOf(b),best=bestOf(b);
    if(best){const z=w*.5;c.drawImage(tierSprite(best,Math.max(8,Math.round(z*U().DPR))),w/2-z/2,h*.22-z/2,z,z)}
    const cs=w/5,y0=h-w;
    c.fillStyle='#5A3A26';c.fillRect(0,y0,w,w);
    if(m)for(let r=0;r<5;r++)for(let k=0;k<5;k++){const v=m[r][k];if(!v)continue;c.fillStyle=colOf(v);c.fillRect(k*cs+.5,y0+r*cs+.5,cs-1,cs-1)}
    const inc=b.remote?(b.minc|0):(b.incoming?b.incoming():0);if(inc>0){c.fillStyle='#E5484D';c.fillRect(0,y0-Math.max(3,cs*.3),Math.min(w,inc*cs*.5),Math.max(3,cs*.3))}
    if(b.dead)U().miniKO(c,w,h);
  },
  stat(B){return [tierName(B.best),'Best dish']},
  meta(b,h){const best=bestOf(b);return [tierName(best)||'Cooking',`${Math.round(h/12*25)}/25 full`]},
  endLine(res,B){return `Best dish: ${tierName(B.best)}${B.served?` · ${B.served} feast${B.served>1?'s':''} served`:''}.`},
  down(e,p){sd={id:e.pointerId,x:p.x,y:p.y,done:false}},
  move(e,p){if(!sd||sd.done||e.pointerId!==sd.id)return;const S=U().S,dx=p.x-sd.x,dy=p.y-sd.y;if(Math.hypot(dx,dy)>S*.55){sd.done=true;U().G.player.swipe(Math.abs(dx)>Math.abs(dy)?(dx<0?'L':'R'):(dy<0?'U':'D'))}},
  up(e,p){if(!sd||(e&&e.pointerId!==sd.id))return;if(!sd.done&&p){const S=U().S,dx=p.x-sd.x,dy=p.y-sd.y;if(Math.hypot(dx,dy)>S*.3&&U().canPlay())U().G.player.swipe(Math.abs(dx)>Math.abs(dy)?(dx<0?'L':'R'):(dy<0?'U':'D'))}sd=null},
  key(k,down){
    const d={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D',a:'L',A:'L',d:'R',D:'R',w:'U',W:'U',s:'D',S:'D'}[k];
    if(!d)return false;if(down)U().G.player.swipe(d);return true;
  },
};
(window.FF_MODES=window.FF_MODES||{}).merge=MU;
})();
