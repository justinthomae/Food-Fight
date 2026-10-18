// Food Fight cuisines: five foods per kitchen, drawn in code so they stay crisp at any size.
// Every food in a set has its own silhouette (long, round, triangle, ring, tall...) so the game still plays by shape
// for colour-blind players, whatever the palette. Index order matches the palette plates: 0..4.
// draw(c,t,x,y,s,ol): c = canvas ctx, t = food 0..4, (x,y,s) = tile box, ol() = outline the current path.
(function(){
const TAU=Math.PI*2;
function kit(c,x,y,s,ol){
  const X=v=>x+v*s,Y=v=>y+v*s,L=v=>v*s;
  return {X,Y,L,
    ell(cx,cy,rx,ry,rot){c.beginPath();c.ellipse(X(cx),Y(cy),L(rx),L(ry),rot||0,0,TAU)},
    circ(cx,cy,r){c.beginPath();c.arc(X(cx),Y(cy),L(r),0,TAU)},
    poly(P){c.beginPath();P.forEach(([a,b],i)=>i?c.lineTo(X(a),Y(b)):c.moveTo(X(a),Y(b)));c.closePath()},
    rect(a,b,w,h,r){const R=L(r||0),xx=X(a),yy=Y(b),W=L(w),H=L(h);c.beginPath();c.moveTo(xx+R,yy);c.arcTo(xx+W,yy,xx+W,yy+H,R);c.arcTo(xx+W,yy+H,xx,yy+H,R);c.arcTo(xx,yy+H,xx,yy,R);c.arcTo(xx,yy,xx+W,yy,R);c.closePath()},
    fill(col,o){c.fillStyle=col;c.fill();if(o!==false)ol()},
    shine(cx,cy,rx,ry,rot){c.beginPath();c.ellipse(X(cx),Y(cy),L(rx),L(ry),rot||0,0,TAU);c.fillStyle='rgba(255,255,255,.5)';c.fill()},
    line(P,col,w){c.beginPath();P.forEach(([a,b],i)=>i?c.lineTo(X(a),Y(b)):c.moveTo(X(a),Y(b)));c.lineWidth=Math.max(1.2,L(w));c.lineCap='round';c.lineJoin='round';c.strokeStyle=col;c.stroke()},
    dots(P,col,r){c.fillStyle=col;P.forEach(([a,b])=>{c.beginPath();c.arc(X(a),Y(b),L(r),0,TAU);c.fill()})}};
}

const CUISINES={
  // ---------------- American diner ----------------
  american:{name:'American Diner',note:'Hot dog, fries, shake, pickle, burger',foods:['Hot dog','Fries','Milkshake','Pickle','Burger'],
    draw(c,t,x,y,s,ol){const k=kit(c,x,y,s,ol);
      if(t===0){ // hot dog: long bun across, sausage, mustard zigzag
        k.rect(.1,.42,.8,.26,.13);k.fill('#E8B36A');
        k.rect(.06,.38,.88,.16,.08);k.fill('#C9492E');
        k.line([[.18,.46],[.28,.42],[.38,.48],[.48,.42],[.58,.48],[.68,.42],[.78,.47]],'#F7D23E',.045);
        k.rect(.12,.55,.76,.1,.05);c.fillStyle='rgba(0,0,0,.08)';c.fill();
      }else if(t===1){ // fries: red box, golden sticks
        [[.3,.14,-.08],[.4,.1,0],[.5,.12,.05],[.6,.1,.1],[.68,.16,.16],[.35,.2,-.12],[.55,.18,.02]].forEach(([a,b,r])=>{c.save();c.translate(k.X(a+.03),k.Y(.5));c.rotate(r);c.beginPath();c.rect(-k.L(.035),k.L(b-.5),k.L(.07),k.L(.42));c.fillStyle='#F7C548';c.fill();ol();c.restore()});
        k.poly([[.22,.44],[.78,.44],[.7,.88],[.3,.88]]);k.fill('#D83A2E');
        k.poly([[.36,.44],[.5,.56],[.64,.44]]);k.fill('#F7F2E8',false);
      }else if(t===2){ // milkshake: tall glass, pink top, cherry and straw
        k.line([[.6,.08],[.52,.36]],'#5BC0EB',.06);
        k.poly([[.3,.36],[.7,.36],[.62,.88],[.38,.88]]);k.fill('#F4E3EC');
        k.poly([[.32,.48],[.68,.48],[.62,.88],[.38,.88]]);k.fill('#F48FB1',false);
        k.ell(.5,.34,.24,.1);k.fill('#FFFFFF');
        k.circ(.5,.22,.07);k.fill('#D7263D');k.shine(.48,.2,.025,.015);
        k.poly([[.3,.36],[.7,.36],[.62,.88],[.38,.88]]);ol();
      }else if(t===3){ // pickle: green bumpy diagonal
        c.save();c.translate(k.X(.5),k.Y(.52));c.rotate(-.7);
        c.beginPath();c.ellipse(0,0,k.L(.36),k.L(.16),0,0,TAU);c.fillStyle='#5C9E31';c.fill();ol();
        c.fillStyle='#86C24E';[[-.2,-.05],[-.05,.06],[.1,-.06],[.24,.04],[-.28,.06],[.02,-.09]].forEach(([a,b])=>{c.beginPath();c.arc(k.L(a),k.L(b),k.L(.03),0,TAU);c.fill()});
        c.beginPath();c.ellipse(-k.L(.06),-k.L(.08),k.L(.16),k.L(.035),0,0,TAU);c.fillStyle='rgba(255,255,255,.35)';c.fill();
        c.restore();
      }else{ // burger: stacked round
        k.poly([[.16,.52],[.84,.52],[.8,.6],[.2,.6]]);k.fill('#5BB84A');
        k.rect(.16,.6,.68,.1,.04);k.fill('#7A3E1D');
        k.poly([[.2,.6],[.8,.6],[.74,.66],[.5,.6],[.3,.67]]);k.fill('#F7C548',false);
        c.beginPath();c.moveTo(k.X(.14),k.Y(.52));c.bezierCurveTo(k.X(.14),k.Y(.18),k.X(.86),k.Y(.18),k.X(.86),k.Y(.52));c.closePath();k.fill('#E2A04F');
        k.dots([[.36,.36],[.5,.3],[.62,.38],[.44,.42]],'#FFF4D6',.022);
        k.rect(.18,.7,.64,.12,.06);k.fill('#E2A04F');
      }}},
  // ---------------- Mexican ----------------
  mexican:{name:'Mexican Cantina',note:'Chili, taco, burrito, lime, nacho',foods:['Chili','Taco','Burrito','Lime','Nacho'],
    draw(c,t,x,y,s,ol){const k=kit(c,x,y,s,ol);
      if(t===0){ // chili pepper: curved red pod with green stem
        c.beginPath();c.moveTo(k.X(.32),k.Y(.24));c.bezierCurveTo(k.X(.66),k.Y(.2),k.X(.86),k.Y(.5),k.X(.62),k.Y(.86));c.bezierCurveTo(k.X(.66),k.Y(.56),k.X(.5),k.Y(.4),k.X(.26),k.Y(.4));c.closePath();k.fill('#D7263D');
        k.shine(.5,.3,.1,.03,.2);
        k.poly([[.2,.24],[.34,.2],[.36,.4],[.22,.42]]);k.fill('#3E8E2F');
        k.line([[.26,.22],[.2,.12]],'#2F6B2A',.05);
      }else if(t===1){ // taco: half-moon shell with lettuce, meat, tomato
        c.beginPath();c.arc(k.X(.5),k.Y(.72),k.L(.38),Math.PI,0);c.closePath();k.fill('#F2C14E');
        c.beginPath();for(let i=0;i<=10;i++){const a=Math.PI+i/10*Math.PI;c.lineTo(k.X(.5+Math.cos(a)*.3),k.Y(.7+Math.sin(a)*.3-(i%2?.05:0)))}c.closePath();k.fill('#6DBE45');
        k.dots([[.36,.5],[.5,.44],[.64,.52]],'#D7263D',.05);
        c.beginPath();c.arc(k.X(.5),k.Y(.72),k.L(.38),Math.PI,0);c.lineTo(k.X(.78),k.Y(.72));c.arc(k.X(.5),k.Y(.72),k.L(.28),0,Math.PI,true);c.closePath();k.fill('#E8A93A');
      }else if(t===2){ // burrito: fat foil-wrapped capsule
        c.save();c.translate(k.X(.5),k.Y(.52));c.rotate(-.6);
        const w=k.L(.68),h=k.L(.3);c.beginPath();c.ellipse(0,0,w/2,h/2,0,0,TAU);c.fillStyle='#E9D2A6';c.fill();ol();
        c.beginPath();c.rect(-w*.05,-h/2,w*.55,h);c.save();c.clip();c.beginPath();c.ellipse(0,0,w/2,h/2,0,0,TAU);c.fillStyle='#C9D3DE';c.fill();c.restore();
        c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=Math.max(1,k.L(.02));for(let i=0;i<3;i++){c.beginPath();c.moveTo(w*(.02+i*.15),-h*.4);c.lineTo(w*(.06+i*.15),h*.4);c.stroke()}
        c.beginPath();c.ellipse(-w*.32,0,h*.3,h*.42,0,0,TAU);c.fillStyle='#B5652D';c.fill();
        c.beginPath();c.ellipse(-w*.32,-h*.08,h*.12,h*.1,0,0,TAU);c.fillStyle='#6DBE45';c.fill();
        c.beginPath();c.ellipse(0,0,w/2,h/2,0,0,TAU);ol();
        c.restore();
      }else if(t===3){ // lime slice: round with segments
        k.circ(.5,.52,.34);k.fill('#4E9A2A');
        k.circ(.5,.52,.28);k.fill('#E6F5B0',false);
        c.fillStyle='#A6D65A';for(let i=0;i<8;i++){const a=i/8*TAU;c.beginPath();c.moveTo(k.X(.5),k.Y(.52));c.arc(k.X(.5),k.Y(.52),k.L(.24),a+.08,a+TAU/8-.08);c.closePath();c.fill()}
        k.circ(.5,.52,.04);k.fill('#E6F5B0',false);
      }else{ // nacho: triangle chip with cheese drip
        k.poly([[.5,.12],[.88,.8],[.12,.8]]);k.fill('#E8B64A');
        c.beginPath();c.moveTo(k.X(.32),k.Y(.44));c.lineTo(k.X(.68),k.Y(.44));c.lineTo(k.X(.66),k.Y(.6));c.quadraticCurveTo(k.X(.6),k.Y(.7),k.X(.56),k.Y(.58));c.quadraticCurveTo(k.X(.48),k.Y(.68),k.X(.42),k.Y(.56));c.quadraticCurveTo(k.X(.36),k.Y(.64),k.X(.33),k.Y(.54));c.closePath();k.fill('#FFA41B',false);
        k.dots([[.44,.68],[.6,.72],[.5,.3]],'#C98A2C',.025);
        k.poly([[.5,.12],[.88,.8],[.12,.8]]);ol();
      }}},
  // ---------------- Italian ----------------
  italian:{name:'Italian Trattoria',note:'Pizza, spaghetti, gelato, olives, cannoli',foods:['Pizza','Spaghetti','Gelato','Olives','Cannoli'],
    draw(c,t,x,y,s,ol){const k=kit(c,x,y,s,ol);
      if(t===0){ // pizza slice: point down, pepperoni
        k.poly([[.14,.2],[.86,.2],[.5,.9]]);k.fill('#F6CF5A');
        k.rect(.1,.13,.8,.12,.06);k.fill('#C9822F');
        k.dots([[.36,.36],[.62,.34],[.5,.56]],'#C0392B',.07);
        k.dots([[.34,.34],[.6,.32],[.48,.54]],'rgba(255,255,255,.35)',.02);
      }else if(t===1){ // spaghetti: round nest twirled on a fork, meatball
        k.circ(.5,.58,.3);k.fill('#F3D27A');
        c.strokeStyle='#D9AE45';c.lineWidth=Math.max(1,k.L(.025));for(let i=0;i<4;i++){c.beginPath();c.ellipse(k.X(.5),k.Y(.58),k.L(.24-i*.05),k.L(.16-i*.03),.3*i,0,TAU);c.stroke()}
        k.circ(.6,.5,.09);k.fill('#8B3A1E');
        k.line([[.36,.48],[.24,.1]],'#B9C2D8',.05);k.line([[.2,.1],[.21,.2]],'#B9C2D8',.025);k.line([[.27,.08],[.28,.18]],'#B9C2D8',.025);
      }else if(t===2){ // gelato: tall cone with scoop
        k.poly([[.32,.48],[.68,.48],[.5,.92]]);k.fill('#D99A4E');
        c.strokeStyle='rgba(120,70,20,.5)';c.lineWidth=Math.max(1,k.L(.02));[[.36,.56,.6,.72],[.42,.7,.64,.54],[.4,.62,.56,.84]].forEach(([a,b,e,f])=>{c.beginPath();c.moveTo(k.X(a),k.Y(b));c.lineTo(k.X(e),k.Y(f));c.stroke()});
        k.circ(.5,.36,.2);k.fill('#7FD1B9');
        c.beginPath();for(let i=0;i<=8;i++)c.lineTo(k.X(.3+i*.05),k.Y(.48+(i%2?.04:0)));c.lineTo(k.X(.7),k.Y(.42));c.lineTo(k.X(.3),k.Y(.42));c.closePath();k.fill('#7FD1B9',false);
        k.shine(.44,.3,.06,.03,-.5);
      }else if(t===3){ // olives: two on a little branch
        k.line([[.2,.24],[.8,.3]],'#6B4423',.04);
        k.ell(.66,.2,.1,.04,.3);k.fill('#5C8A2E');
        k.ell(.36,.52,.17,.21,-.2);k.fill('#4F6B23');k.circ(.38,.42,.05);k.fill('#D7263D',false);
        k.ell(.64,.6,.17,.21,.2);k.fill('#4F6B23');k.circ(.62,.5,.05);k.fill('#D7263D',false);
        k.shine(.3,.56,.04,.07,-.2);k.shine(.58,.64,.04,.07,.2);
      }else{ // cannoli: tube with cream ends
        c.save();c.translate(k.X(.5),k.Y(.5));c.rotate(-.5);
        const rr=(a,b,w,h,r,col,o)=>{c.beginPath();c.moveTo(a+r,b);c.arcTo(a+w,b,a+w,b+h,r);c.arcTo(a+w,b+h,a,b+h,r);c.arcTo(a,b+h,a,b,r);c.arcTo(a,b,a+w,b,r);c.closePath();c.fillStyle=col;c.fill();if(o)ol()};
        c.beginPath();c.ellipse(-k.L(.32),0,k.L(.1),k.L(.14),0,0,TAU);c.fillStyle='#FFF6E8';c.fill();ol();
        c.beginPath();c.ellipse(k.L(.32),0,k.L(.1),k.L(.14),0,0,TAU);c.fillStyle='#FFF6E8';c.fill();ol();
        rr(-k.L(.3),-k.L(.15),k.L(.6),k.L(.3),k.L(.08),'#C9822F',true);
        c.strokeStyle='rgba(90,50,10,.4)';c.lineWidth=Math.max(1,k.L(.02));for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(k.L(i*.1),-k.L(.14));c.lineTo(k.L(i*.1+.04),k.L(.14));c.stroke()}
        c.fillStyle='#3E8E2F';[[-.36,-.04],[.36,.04]].forEach(([a,b])=>{c.beginPath();c.arc(k.L(a),k.L(b),k.L(.025),0,TAU);c.fill()});
        c.restore();
      }}},
  // ---------------- Japanese ----------------
  japanese:{name:'Japanese Izakaya',note:'Nigiri, onigiri, dango, maki, tempura',foods:['Nigiri','Onigiri','Dango','Maki','Tempura'],
    draw(c,t,x,y,s,ol){const k=kit(c,x,y,s,ol);
      if(t===0){ // salmon nigiri: rice block with salmon drape
        k.rect(.16,.5,.68,.26,.12);k.fill('#FBFBF5');
        c.beginPath();c.moveTo(k.X(.1),k.Y(.6));c.bezierCurveTo(k.X(.2),k.Y(.2),k.X(.8),k.Y(.2),k.X(.9),k.Y(.58));c.quadraticCurveTo(k.X(.5),k.Y(.66),k.X(.1),k.Y(.6));c.closePath();k.fill('#F58A5B');
        c.strokeStyle='rgba(255,240,230,.85)';c.lineWidth=Math.max(1,k.L(.025));[[.26,.42,.32,.56],[.42,.33,.47,.56],[.58,.33,.62,.56],[.74,.4,.76,.55]].forEach(([a,b,e,f])=>{c.beginPath();c.moveTo(k.X(a),k.Y(b));c.lineTo(k.X(e),k.Y(f));c.stroke()});
      }else if(t===1){ // onigiri: rounded rice triangle with nori band
        c.beginPath();c.moveTo(k.X(.5),k.Y(.14));c.quadraticCurveTo(k.X(.62),k.Y(.18),k.X(.86),k.Y(.68));c.quadraticCurveTo(k.X(.9),k.Y(.84),k.X(.72),k.Y(.84));c.lineTo(k.X(.28),k.Y(.84));c.quadraticCurveTo(k.X(.1),k.Y(.84),k.X(.14),k.Y(.68));c.quadraticCurveTo(k.X(.38),k.Y(.18),k.X(.5),k.Y(.14));c.closePath();k.fill('#FBFBF5');
        k.rect(.36,.58,.28,.27,.03);k.fill('#1F3B2C');
        k.dots([[.4,.4],[.56,.34],[.62,.48]],'#E6E6DA',.018);
      }else if(t===2){ // dango: three balls on a skewer
        k.line([[.5,.06],[.5,.94]],'#C49A6C',.05);
        k.circ(.5,.26,.14);k.fill('#F5A3C0');k.circ(.5,.5,.14);k.fill('#FBFBF5');k.circ(.5,.74,.14);k.fill('#8CC763');
        k.shine(.45,.22,.04,.025);k.shine(.45,.46,.04,.025);k.shine(.45,.7,.04,.025);
      }else if(t===3){ // maki roll: nori ring, rice, cucumber + salmon centre
        k.circ(.5,.52,.34);k.fill('#1F3B2C');
        k.circ(.5,.52,.27);k.fill('#FBFBF5',false);
        k.circ(.45,.52,.09);k.fill('#5FB34A',false);k.circ(.58,.48,.07);k.fill('#F58A5B',false);
        k.dots([[.36,.36],[.62,.66],[.34,.62],[.66,.36]],'#E6E6DA',.02);
      }else{ // tempura shrimp: curved golden body with red tail
        c.beginPath();c.moveTo(k.X(.24),k.Y(.76));c.bezierCurveTo(k.X(.1),k.Y(.4),k.X(.42),k.Y(.14),k.X(.72),k.Y(.24));c.bezierCurveTo(k.X(.6),k.Y(.36),k.X(.4),k.Y(.44),k.X(.4),k.Y(.7));c.closePath();k.fill('#F2B843');
        k.dots([[.24,.5],[.34,.32],[.5,.24],[.3,.62],[.42,.38]],'#FFE08A',.035);
        k.poly([[.7,.22],[.88,.1],[.84,.3]]);k.fill('#E2392B');
      }}},
  // ---------------- Indian ----------------
  indian:{name:'Indian Dhaba',note:'Samosa, naan, ladoo, curry, jalebi',foods:['Samosa','Naan','Ladoo','Curry','Jalebi'],
    draw(c,t,x,y,s,ol){const k=kit(c,x,y,s,ol);
      if(t===0){ // samosa: fat golden pyramid
        c.beginPath();c.moveTo(k.X(.5),k.Y(.14));c.quadraticCurveTo(k.X(.64),k.Y(.3),k.X(.88),k.Y(.76));c.quadraticCurveTo(k.X(.5),k.Y(.88),k.X(.12),k.Y(.76));c.quadraticCurveTo(k.X(.36),k.Y(.3),k.X(.5),k.Y(.14));c.closePath();k.fill('#D9973A');
        k.line([[.5,.18],[.5,.82]],'rgba(130,70,20,.5)',.025);
        k.dots([[.36,.6],[.62,.52],[.56,.7],[.42,.42]],'#F2C26B',.025);
      }else if(t===1){ // naan: teardrop flatbread with char spots
        c.beginPath();c.moveTo(k.X(.5),k.Y(.1));c.bezierCurveTo(k.X(.86),k.Y(.3),k.X(.84),k.Y(.86),k.X(.5),k.Y(.88));c.bezierCurveTo(k.X(.16),k.Y(.86),k.X(.14),k.Y(.3),k.X(.5),k.Y(.1));c.closePath();k.fill('#F1D9A5');
        k.dots([[.42,.4],[.6,.48],[.48,.66],[.36,.6],[.58,.72],[.54,.3]],'#A86B2D',.03);
        k.line([[.52,.5],[.6,.56]],'#3E8E2F',.03);k.line([[.4,.72],[.46,.74]],'#3E8E2F',.03);
      }else if(t===2){ // ladoo: orange sphere with sesame bumps
        k.circ(.5,.54,.3);k.fill('#F29B2E');
        c.fillStyle='#FCD27A';for(let i=0;i<14;i++){const a=i*2.4,d=.06+(i%5)*.045;c.beginPath();c.ellipse(k.X(.5+Math.cos(a)*d),k.Y(.54+Math.sin(a)*d),k.L(.022),k.L(.013),a,0,TAU);c.fill()}
        k.shine(.4,.42,.07,.04,-.6);
        k.dots([[.5,.27]],'#9AC94C',.035);
      }else if(t===3){ // curry: wide bowl of green palak with cream swirl
        c.beginPath();c.moveTo(k.X(.12),k.Y(.48));c.quadraticCurveTo(k.X(.5),k.Y(1.02),k.X(.88),k.Y(.48));c.closePath();k.fill('#B9C2D8');
        k.ell(.5,.48,.38,.12);k.fill('#4F8A2B');
        k.line([[.38,.48],[.46,.44],[.54,.5],[.62,.46]],'#FFF6E8',.035);
        k.rect(.4,.84,.2,.06,.02);k.fill('#9AA3BC');
      }else{ // jalebi: bright orange spiral
        c.beginPath();for(let i=0;i<=120;i++){const a=i/120*TAU*2.6,r=.04+i/120*.28;c.lineTo(k.X(.5+Math.cos(a)*r),k.Y(.52+Math.sin(a)*r))}
        c.lineWidth=Math.max(3,k.L(.11));c.lineCap='round';c.strokeStyle='#2A1A12';c.stroke();c.lineWidth=Math.max(2,k.L(.075));c.strokeStyle='#FF8C1A';c.stroke();
        c.lineWidth=Math.max(1,k.L(.02));c.strokeStyle='rgba(255,230,150,.8)';c.stroke();
      }}},
  // ---------------- Chinese / dim sum ----------------
  asian:{name:'Dim Sum House',note:'Dumpling, fortune cookie, bao, bok choy, takeout',foods:['Dumpling','Fortune cookie','Bao','Bok choy','Takeout'],
    draw(c,t,x,y,s,ol){const k=kit(c,x,y,s,ol);
      if(t===0){ // dumpling: crescent with pleats
        c.beginPath();c.moveTo(k.X(.12),k.Y(.66));c.quadraticCurveTo(k.X(.5),k.Y(.06),k.X(.88),k.Y(.66));c.quadraticCurveTo(k.X(.5),k.Y(.86),k.X(.12),k.Y(.66));c.closePath();k.fill('#F6EBD9');
        c.strokeStyle='rgba(150,120,90,.6)';c.lineWidth=Math.max(1,k.L(.025));for(let i=0;i<5;i++){const a=.28+i*.11;c.beginPath();c.moveTo(k.X(a),k.Y(.4-Math.sin((a-.12)/.76*Math.PI)*.04));c.quadraticCurveTo(k.X(a+.03),k.Y(.5),k.X(a),k.Y(.6));c.stroke()}
        k.dots([[.3,.7],[.7,.7]],'rgba(255,170,150,.6)',.04);
      }else if(t===1){ // fortune cookie: folded yellow with paper slip
        c.beginPath();c.moveTo(k.X(.1),k.Y(.6));c.quadraticCurveTo(k.X(.3),k.Y(.2),k.X(.5),k.Y(.5));c.quadraticCurveTo(k.X(.7),k.Y(.2),k.X(.9),k.Y(.6));c.quadraticCurveTo(k.X(.5),k.Y(.92),k.X(.1),k.Y(.6));c.closePath();k.fill('#F2C14E');
        k.line([[.5,.5],[.5,.78]],'rgba(160,100,20,.6)',.03);
        k.poly([[.56,.56],[.86,.42],[.88,.5],[.58,.64]]);k.fill('#FFFFFF');
        k.line([[.64,.55],[.8,.48]],'#D7263D',.015);
      }else if(t===2){ // bao: round white bun with fold and pink dot
        c.beginPath();c.moveTo(k.X(.14),k.Y(.68));c.bezierCurveTo(k.X(.14),k.Y(.22),k.X(.86),k.Y(.22),k.X(.86),k.Y(.68));c.quadraticCurveTo(k.X(.5),k.Y(.84),k.X(.14),k.Y(.68));c.closePath();k.fill('#FBF7EF');
        c.strokeStyle='rgba(150,130,110,.5)';c.lineWidth=Math.max(1,k.L(.025));[[.4,.28,.46,.4],[.5,.24,.5,.38],[.6,.28,.54,.4]].forEach(([a,b,e,f])=>{c.beginPath();c.moveTo(k.X(a),k.Y(b));c.lineTo(k.X(e),k.Y(f));c.stroke()});
        k.circ(.5,.42,.04);k.fill('#E85B7A',false);
      }else if(t===3){ // bok choy: tall leaves on pale stems
        [[-.7,.62,'#4FA845'],[.7,.62,'#4FA845'],[0,.74,'#3E9A3A']].forEach(([rot,len,col])=>{c.save();c.translate(k.X(.5),k.Y(.9));c.rotate(rot*.5);
          c.beginPath();c.ellipse(0,-k.L(len*.62),k.L(.17),k.L(len*.36),0,0,TAU);c.fillStyle=col;c.fill();ol();
          c.beginPath();c.moveTo(-k.L(.07),0);c.quadraticCurveTo(-k.L(.06),-k.L(len*.5),-k.L(.02),-k.L(len*.72));c.lineTo(k.L(.02),-k.L(len*.72));c.quadraticCurveTo(k.L(.06),-k.L(len*.5),k.L(.07),0);c.closePath();c.fillStyle='#E4F2C9';c.fill();ol();
          c.restore()});
      }else{ // takeout box: white trapezoid with red pagoda mark and wire handle
        k.line([[.3,.3],[.5,.1],[.7,.3]],'#9AA3BC',.035);
        k.poly([[.22,.3],[.78,.3],[.7,.86],[.3,.86]]);k.fill('#FBFBF5');
        k.poly([[.22,.3],[.5,.42],[.78,.3]]);k.fill('#E6E6DA');
        k.poly([[.42,.56],[.58,.56],[.62,.62],[.38,.62]]);k.fill('#D7263D',false);k.rect(.44,.62,.12,.12,0);k.fill('#D7263D',false);
        k.poly([[.22,.3],[.78,.3],[.7,.86],[.3,.86]]);ol();
      }}}
};
const CUISINE_ORDER=['market','american','mexican','italian','japanese','indian','asian'];
window.FFCuisines={CUISINES,CUISINE_ORDER};
})();
