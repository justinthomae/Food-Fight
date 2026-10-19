// Food Fight sound: every effect is synthesized live with Web Audio (no files to download).
// FFSound.play(name, arg) for effects, FFSound.ambience(true/false) for the cafeteria bed in the lobby.
window.FFSound=(function(){
  let AC=null,master=null,echo=null,noiseBuf=null,muted=false,amb=null,ambWanted=false;
  const lastAt={};

  function wake(){
    if(!AC){
      try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return}
      const comp=AC.createDynamicsCompressor();
      comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=5;comp.attack.value=.003;comp.release.value=.2;
      master=AC.createGain();master.gain.value=muted?0:.8;
      master.connect(comp);comp.connect(AC.destination);
      // short slap-back echo bus: makes pops and fanfares feel bigger
      echo=AC.createDelay(.5);echo.delayTime.value=.13;
      const fb=AC.createGain();fb.gain.value=.28;
      const wet=AC.createGain();wet.gain.value=.35;
      const tone=AC.createBiquadFilter();tone.type='lowpass';tone.frequency.value=3500;
      echo.connect(tone);tone.connect(fb);fb.connect(echo);tone.connect(wet);wet.connect(master);
      noiseBuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);
      const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    }
    if(AC.state==='suspended')AC.resume();
    if(ambWanted&&!amb)startAmbience();
  }
  const ok=()=>AC&&!muted&&AC.state!=='closed';
  const T=()=>AC.currentTime;

  function env(g,s,a,d,peak){g.gain.setValueAtTime(.0001,s);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),s+a);g.gain.exponentialRampToValueAtTime(.0001,s+a+d)}
  function out(node,wet){node.connect(master);if(wet){const w=AC.createGain();w.gain.value=wet;node.connect(w);w.connect(echo)}}
  function tone(o){
    const s=T()+(o.t||0),a=o.a||.004,d=o.d||.15;
    const osc=AC.createOscillator(),g=AC.createGain();
    osc.type=o.type||'sine';osc.frequency.setValueAtTime(o.f,s);
    if(o.to)osc.frequency.exponentialRampToValueAtTime(o.to,s+a+d*(o.sweep||1));
    if(o.detune)osc.detune.value=o.detune;
    env(g,s,a,d,o.v||.2);
    let n=osc;
    if(o.lp){const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=o.lp;osc.connect(f);n=f}
    n.connect(g);out(g,o.wet);
    osc.start(s);osc.stop(s+a+d+.05);
  }
  function noise(o){
    const s=T()+(o.t||0),a=o.a||.002,d=o.d||.2;
    const src=AC.createBufferSource();src.buffer=noiseBuf;
    const f=AC.createBiquadFilter();f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.f||1000,s);
    if(o.to)f.frequency.exponentialRampToValueAtTime(o.to,s+a+d);
    f.Q.value=o.q||1;
    const g=AC.createGain();env(g,s,a,d,o.v||.2);
    src.connect(f);f.connect(g);out(g,o.wet);
    src.start(s,Math.random()*1.5);src.stop(s+a+d+.05);
  }
  const semis=(base,n)=>base*Math.pow(2,n/12);
  const PENTA=[0,2,4,7,9,12,14,16,19,21,24];

  // ---- the effects ----
  const FX={
    tap(){tone({type:'triangle',f:900,to:1300,d:.04,v:.08});noise({type:'highpass',f:4000,d:.02,v:.04})},
    swap(){tone({type:'triangle',f:620,to:980,d:.05,v:.09});noise({type:'highpass',f:3500,d:.03,v:.05})},
    match(n=3){ // bubbly pop, brighter for bigger matches
      const b=520+(n-3)*70;
      tone({type:'sine',f:b,to:b*2.4,d:.09,v:.32});
      tone({type:'triangle',f:b*1.5,to:b*3,d:.07,v:.12,t:.02});
      noise({type:'bandpass',f:2400,q:2,d:.05,v:.12});
      if(n>=4)FX.combo(n);
    },
    combo(n=4){ // chord stab on top of a big match
      const r=semis(392,(n-4)*2);
      [0,4,7].forEach((i,k)=>tone({type:'square',f:semis(r,i),d:.18,v:.06,lp:2400,t:.03+k*.01,wet:.4}));
    },
    chain(c=2){ // rising arpeggio: one more note per chain step
      const steps=Math.min(10,c+2),base=semis(392,Math.min(12,(c-2)*2));
      for(let i=0;i<steps;i++)tone({type:i%2?'triangle':'square',f:semis(base,PENTA[i]),d:.11,v:.11,lp:3200,t:i*.055,wet:.45});
      noise({type:'bandpass',f:500,to:5000,q:1.5,d:.35,v:.12});
      tone({type:'sine',f:180,to:90,d:.2,v:.35});
      if(c>=4)for(let i=0;i<6;i++)tone({type:'sine',f:2000+Math.random()*2500,d:.12,v:.05,t:.2+i*.05,wet:.6});
    },
    break(){ // junk crumbles back into food
      noise({type:'lowpass',f:1400,to:300,d:.28,v:.35});
      tone({type:'sine',f:160,to:60,d:.22,v:.4});
      for(let i=0;i<3;i++)noise({type:'bandpass',f:1800+Math.random()*1500,q:4,d:.04,v:.12,t:.04+i*.05});
    },
    earn(special){ // sparkle
      const ns=special?[1047,1319,1568,2093,2637]:[1319,1568,2093];
      ns.forEach((f,i)=>tone({type:'sine',f,d:.14,v:.12,t:i*.045,wet:.6}));
      if(special)noise({type:'highpass',f:6000,d:.35,v:.06,a:.05});
    },
    throw(){ // whoosh
      noise({type:'bandpass',f:400,to:3200,q:1.2,d:.32,v:.55,a:.03});
      tone({type:'sine',f:260,to:900,d:.25,v:.08});
    },
    incoming(){ // something's coming your way
      tone({type:'triangle',f:330,to:160,d:.28,v:.2,wet:.3});
      tone({type:'triangle',f:440,to:220,d:.2,v:.1,t:.08});
    },
    junk(){ // splat + thud
      noise({type:'lowpass',f:2500,to:220,d:.35,v:.4,q:.8});
      tone({type:'sine',f:150,to:42,d:.32,v:.62});
      noise({type:'bandpass',f:900,q:6,d:.08,v:.25,t:.03});
    },
    block(){ // shield clang
      tone({type:'square',f:880,d:.08,v:.08,lp:4000});
      tone({type:'triangle',f:1320,d:.3,v:.12,wet:.5});
      tone({type:'sine',f:2637,d:.5,v:.06,wet:.7});
      noise({type:'highpass',f:5000,d:.06,v:.12});
    },
    ko(){ // big hit, then a little victory flourish
      tone({type:'sine',f:110,to:30,d:.55,v:.72});
      noise({type:'lowpass',f:1800,to:150,d:.5,v:.5});
      [523,659,784,1047].forEach((f,i)=>tone({type:'square',f,d:.16,v:.07,lp:3000,t:.12+i*.07,wet:.5}));
    },
    sauce(){ // sizzle
      noise({type:'highpass',f:3500,d:.9,v:.18,a:.05});
      for(let i=0;i<10;i++)noise({type:'bandpass',f:5000+Math.random()*3000,q:8,d:.02,v:.12,t:Math.random()*.8});
      tone({type:'sawtooth',f:220,to:120,d:.4,v:.05,lp:900});
    },
    cream(){ // squish
      noise({type:'lowpass',f:900,to:180,d:.4,v:.45,q:3});
      tone({type:'sine',f:240,to:110,d:.3,v:.25});
      tone({type:'sine',f:180,to:300,d:.15,v:.12,t:.25});
    },
    freeze(){ // icy shimmer
      for(let i=0;i<9;i++)tone({type:'sine',f:1800+Math.random()*3500,d:.35,v:.05,t:i*.035,wet:.7});
      noise({type:'highpass',f:7000,d:.6,v:.08,a:.05});
      tone({type:'triangle',f:1568,to:3136,d:.4,v:.06});
    },
    blender(){ // motor whirr
      tone({type:'sawtooth',f:70,to:240,d:.7,v:.1,lp:1400,sweep:.6});
      tone({type:'square',f:72,to:250,d:.7,v:.05,lp:900,detune:15});
      noise({type:'bandpass',f:800,to:2400,q:2,d:.7,v:.15});
    },
    pin(){ // rolling-pin flatten
      noise({type:'lowpass',f:300,d:.55,v:.4});
      for(let i=0;i<4;i++)tone({type:'sine',f:90,to:60,d:.1,v:.35,t:i*.11});
      tone({type:'triangle',f:523,to:1047,d:.25,v:.08,t:.45,wet:.5});
    },
    helping(){ // ka-ching
      tone({type:'square',f:1319,d:.06,v:.06,lp:4000});tone({type:'square',f:1760,d:.25,v:.07,lp:4000,t:.06,wet:.5});
      noise({type:'highpass',f:6000,d:.15,v:.08,t:.06});
    },
    snack(){ // chomp chomp + swipe
      for(let i=0;i<2;i++){noise({type:'lowpass',f:1500,to:400,d:.08,v:.4,t:i*.14});tone({type:'sine',f:180,to:90,d:.08,v:.3,t:i*.14})}
      noise({type:'bandpass',f:3000,to:600,q:2,d:.25,v:.2,t:.3});
      tone({type:'triangle',f:659,to:1319,d:.15,v:.08,t:.3,wet:.4});
    },
    feast(){ // everything pops at once
      tone({type:'sawtooth',f:110,to:880,d:.6,v:.08,lp:3000,sweep:.8});
      for(let i=0;i<12;i++)tone({type:'sine',f:500+Math.random()*900,to:1400+Math.random()*1400,d:.08,v:.12,t:.25+i*.035});
      [523,659,784,1047,1319].forEach((f,i)=>tone({type:'square',f,d:.3,v:.05,lp:3500,t:.5+i*.04,wet:.6}));
      tone({type:'sine',f:130,to:40,d:.4,v:.5,t:.45});
    },
    stolen(){ // hey!
      tone({type:'triangle',f:880,to:330,d:.3,v:.12,wet:.3});noise({type:'bandpass',f:2500,to:500,q:2,d:.2,v:.12});
    },
    wipe(){ // finger squeaking through cream
      noise({type:'bandpass',f:900+Math.random()*700,q:3,d:.09,v:.12,a:.02});
    },
    heart(){ // danger: your stack is near the top
      tone({type:'sine',f:70,to:45,d:.12,v:.5});
      tone({type:'sine',f:65,to:42,d:.14,v:.4,t:.18});
    },
    overtime(){ for(let i=0;i<3;i++){tone({type:'square',f:880,d:.09,v:.06,lp:2500,t:i*.24});tone({type:'square',f:660,d:.09,v:.06,lp:2500,t:i*.24+.12})} },
    count(){tone({type:'square',f:660,d:.1,v:.08,lp:2500});tone({type:'sine',f:1320,d:.08,v:.05})},
    slam(){ // VS screen hit
      tone({type:'sine',f:120,to:35,d:.5,v:.65});
      noise({type:'lowpass',f:4000,to:200,d:.45,v:.28});
      tone({type:'sawtooth',f:98,d:.35,v:.06,lp:800,wet:.4});
    },
    fight(){ // go!
      [392,494,587,784].forEach((f,i)=>tone({type:'square',f,d:.35,v:.06,lp:3500,t:i*.015,wet:.5}));
      noise({type:'highpass',f:2500,to:9000,d:.4,v:.18});
      tone({type:'sine',f:150,to:50,d:.3,v:.48});
    },
    win(){ // fanfare
      const seq=[[523,0],[659,.12],[784,.24],[1047,.36],[784,.52],[1047,.64]];
      seq.forEach(([f,t])=>{tone({type:'square',f,d:.14,v:.07,lp:3500,t,wet:.5});tone({type:'triangle',f:f/2,d:.16,v:.08,t})});
      [523,659,784,1047].forEach(f=>tone({type:'triangle',f,d:.9,v:.06,t:.8,wet:.6}));
      for(let i=0;i<8;i++)tone({type:'sine',f:2000+Math.random()*3000,d:.1,v:.04,t:.8+i*.06,wet:.6});
    },
    lose(){ // sad trombone
      [[392,0],[370,.28],[349,.56]].forEach(([f,t])=>tone({type:'sawtooth',f,d:.24,v:.13,lp:1100,t}));
      tone({type:'sawtooth',f:330,to:300,d:.9,v:.14,lp:1000,t:.84});
    },
  };

  // ---- harp: a plucked string (Karplus-Strong), cached per pitch ----
  const pluckCache={};
  function pluck(f,t,v){
    const key=Math.round(f);let buf=pluckCache[key];
    if(!buf){
      const sr=AC.sampleRate,len=Math.floor(sr*1.8),N=Math.max(2,Math.round(sr/f));buf=AC.createBuffer(1,len,sr);
      const d=buf.getChannelData(0),ring=new Float32Array(N);for(let i=0;i<N;i++)ring[i]=Math.random()*2-1;
      let p=0;for(let i=0;i<len;i++){const nx=(p+1)%N,y=(ring[p]+ring[nx])*.4985;d[i]=ring[p];ring[p]=y;p=nx}
      pluckCache[key]=buf;
    }
    const s=AC.createBufferSource(),g=AC.createGain(),lp=AC.createBiquadFilter();s.buffer=buf;
    lp.type='lowpass';lp.frequency.value=Math.min(9000,f*7);
    const st=T()+(t||0);g.gain.setValueAtTime(v,st);g.gain.exponentialRampToValueAtTime(.0001,st+1.7);
    s.connect(lp);lp.connect(g);out(g,.5);s.start(st);s.stop(st+1.8);
  }
  // C major scale up from C5: each back-to-back clear plays the next note up
  const HARP=[523.25,587.33,659.25,698.46,783.99,880,987.77,1046.5,1174.66,1318.51,1396.91,1567.98,1760,1975.53,2093];
  FX.harp=n=>{const i=Math.max(0,Math.min(HARP.length-1,(n|0)-1));
    // a quick glissando into the note, the way a harp is swept
    if(i>0)pluck(HARP[i-1],0,.22);pluck(HARP[i],.045,.5);pluck(HARP[i]/2,.045,.18)};
  FX.tetris=()=>{[523.25,659.25,783.99,1046.5,1318.51].forEach((f,i)=>pluck(f,i*.045,.4));
    tone({type:'triangle',f:1046.5,d:.5,v:.08,t:.22,wet:.4});tone({type:'triangle',f:1568,d:.6,v:.06,t:.26,wet:.4})};
  FX.b2btetris=()=>{FX.tetris();[1046.5,1318.51,1567.98,2093].forEach((f,i)=>pluck(f,.3+i*.05,.35));speak('Back to back Tetris!')};
  // ---- affirmations: a quick musical "yes!" or "uh-oh" layered on top of the effect itself ----
  const MAJ=[523.25,659.25,783.99,1046.5,1318.51,1567.98,2093];
  FX.yay=()=>{pluck(783.99,0,.32);pluck(1046.5,.07,.38);tone({type:'sine',f:2093,d:.18,v:.05,t:.12,wet:.5})};
  FX.great=(n=3)=>{const k=Math.max(3,Math.min(7,n|0));for(let i=0;i<k;i++)pluck(MAJ[i],i*.055,.34+i*.02);
    tone({type:'triangle',f:MAJ[k-1]*2,d:.4,v:.06,t:k*.055,wet:.6});noise({type:'highpass',f:6000,d:.25,v:.04,t:k*.055})};
  FX.saved=()=>{tone({type:'triangle',f:880,to:1760,d:.12,v:.1,wet:.4});pluck(1318.51,.08,.3);pluck(1760,.13,.25)};
  FX.oof=()=>{tone({type:'sine',f:180,to:70,d:.22,v:.32});tone({type:'sawtooth',f:233,to:207,d:.28,v:.06,lp:900,t:.02});tone({type:'sawtooth',f:220,to:185,d:.34,v:.05,lp:800,t:.14})};
  FX.uhoh=()=>{tone({type:'triangle',f:659.25,d:.12,v:.1});tone({type:'triangle',f:466.16,d:.2,v:.1,t:.13})};
  FX.knocked=()=>{[392,349.23,311.13,261.63].forEach((f,i)=>tone({type:'triangle',f,d:.22,v:.11,t:i*.13,lp:2400}));tone({type:'sine',f:130.81,to:65,d:.6,v:.22,t:.52})};
  FX.kod=()=>{FX.great(6);tone({type:'square',f:1046.5,d:.08,v:.05,lp:3000,t:.36});tone({type:'square',f:1568,d:.25,v:.05,lp:3000,t:.44});speak('K.O.!')};
  // ---- announcer: the device's own voice (Web Speech) ----
  let voice=null;
  function pickVoice(){try{const vs=speechSynthesis.getVoices();voice=vs.find(v=>/en[-_]US/i.test(v.lang)&&/Samantha|Google US|Aaron|Alex|Jenny|Aria|Guy/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null}catch(e){}}
  try{if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}}catch(e){}
  function speak(text){
    if(muted||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
    try{const u=new SpeechSynthesisUtterance(text);if(voice)u.voice=voice;u.lang='en-US';u.rate=1.08;u.pitch=1.15;u.volume=1;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}
  }
  function play(name,arg){
    if(!ok()||!FX[name])return;
    // never stack the same sound in the same frame (8 junk tiles landing = one splat)
    const now=performance.now();if(lastAt[name]&&now-lastAt[name]<40)return;lastAt[name]=now;
    try{FX[name](arg)}catch(e){}
  }

  // ---- cafeteria ambience: babbling crowd + cutlery clinks + the odd tray clatter ----
  function startAmbience(){
    if(!AC||muted||amb)return;
    const bus=AC.createGain();bus.gain.setValueAtTime(.0001,T());bus.gain.exponentialRampToValueAtTime(.55,T()+1.5);bus.connect(master);
    const src=AC.createBufferSource();src.buffer=noiseBuf;src.loop=true;
    // three voice-like bands whose loudness wanders like overlapping conversations
    const bands=[[320,1.2,.5],[650,1.6,.35],[1300,2.2,.16]].map(([f,q,v])=>{
      const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
      const g=AC.createGain();g.gain.value=v*.5;src.connect(bp);bp.connect(g);g.connect(bus);return{bp,g,f,v};
    });
    // room rumble
    const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;const rg=AC.createGain();rg.gain.value=.25;src.connect(lp);lp.connect(rg);rg.connect(bus);
    src.start();
    const babble=setInterval(()=>{
      const t=T();
      bands.forEach(b=>{
        b.g.gain.setTargetAtTime(b.v*(.25+Math.random()*.9),t,.06+Math.random()*.08);
        b.bp.frequency.setTargetAtTime(b.f*(.8+Math.random()*.45),t,.08);
      });
    },110);
    let clinkTimer=null;
    const clink=()=>{
      if(!amb)return;
      const t=T(),r=Math.random();
      if(r<.7){ // fork on plate
        const f=2400+Math.random()*2200,g=AC.createGain(),o=AC.createOscillator(),o2=AC.createOscillator();
        o.type='sine';o.frequency.value=f;o2.type='sine';o2.frequency.value=f*2.76;
        const v=.03+Math.random()*.05;env(g,t,.002,.25+Math.random()*.3,v);
        o.connect(g);o2.connect(g);g.connect(bus);const w=AC.createGain();w.gain.value=.5;g.connect(w);w.connect(echo);
        o.start(t);o2.start(t);o.stop(t+.7);o2.stop(t+.7);
      }else{ // tray / cutlery clatter
        for(let i=0;i<3+Math.floor(Math.random()*4);i++){
          const s=AC.createBufferSource();s.buffer=noiseBuf;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=2500+Math.random()*3000;f.Q.value=6;
          const g=AC.createGain();const st=t+i*(.03+Math.random()*.05);env(g,st,.001,.05,.05+Math.random()*.05);
          s.connect(f);f.connect(g);g.connect(bus);s.start(st,Math.random());s.stop(st+.1);
        }
      }
      clinkTimer=setTimeout(clink,350+Math.random()*1800);
    };
    amb={bus,src,babble,stop(){
      clearInterval(babble);clearTimeout(clinkTimer);
      const t=T();bus.gain.cancelScheduledValues(t);bus.gain.setValueAtTime(Math.max(.0001,bus.gain.value),t);bus.gain.exponentialRampToValueAtTime(.0001,t+.8);
      setTimeout(()=>{try{src.stop()}catch(e){}bus.disconnect()},900);
    }};
    clinkTimer=setTimeout(clink,600);
  }
  function ambience(on){
    on=false;   // the cafeteria bed is switched off; game sound effects stay
    ambWanted=!!on;
    if(on){if(AC&&!muted)startAmbience()}
    else if(amb){amb.stop();amb=null}
  }
  function setMuted(m){
    muted=!!m;
    if(master)master.gain.setTargetAtTime(muted?0:.8,AC.currentTime,.05);
    if(muted&&amb){amb.stop();amb=null}else if(!muted&&ambWanted)startAmbience();
  }
  return {wake,play,ambience,setMuted,say:t=>speak(t),get names(){return Object.keys(FX)}};
})();
