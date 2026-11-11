// Announcer: which pop-up says which line, one line at a time, and clips fall back cleanly when missing.
const fs=require('fs'),path=require('path'),vm=require('vm');
let fails=0;const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const played=[];let now=0;
function Node(){return {connect(){},disconnect(){},gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}},
  frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},Q:{value:0},type:'',detune:{value:0},delayTime:{value:0},
  threshold:{value:0},knee:{value:0},ratio:{value:0},attack:{value:0},release:{value:0},playbackRate:{value:1},start(){},stop(){}}}
class AC{constructor(){this.state='running';this.sampleRate=8000;this.destination=Node()}get currentTime(){return now}
  createGain(){return Node()}createOscillator(){return Node()}createBiquadFilter(){return Node()}createDelay(){return Node()}createDynamicsCompressor(){return Node()}
  createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)}}
  createBufferSource(){const n=Node();n.start=()=>played.push(n.buffer.name);n.stop=()=>played.push('stop:'+n.buffer.name);return n}
  decodeAudioData(b,res){res({name:b.name,duration:1.2})}resume(){}}
const have=new Set(['v-hotdog','v-b2bhotdog','v-chain2','v-chain3','v-megachain','v-feast','v-ko','v-orderup','v-slurp','s-throw','s-win','v-win','f-hotdog','f-double','f-base','f-sizzlin','f-topdog']);
const fetch=async u=>{const n=path.basename(u,'.mp3');return have.has(n)?{ok:true,arrayBuffer:async()=>({name:n})}:{ok:false,status:404}};
const spoken=[];
const ctx={window:{AudioContext:AC,speechSynthesis:{getVoices:()=>[],cancel(){},speak:u=>spoken.push(u.text)},SpeechSynthesisUtterance:function(t){this.text=t}},fetch,performance:{now:()=>now*1000},setTimeout:(f)=>f(),setInterval(){},clearInterval(){},clearTimeout(){},Math,Promise,console};
ctx.window.window=ctx.window;vm.createContext(ctx);
vm.runInContext('var window=this.window;var speechSynthesis=window.speechSynthesis,SpeechSynthesisUtterance=window.SpeechSynthesisUtterance;'+fs.readFileSync(path.join(__dirname,'../js/sfx.js'),'utf8'),ctx);
const S=ctx.window.FFSound;
(async()=>{
  S.wake();for(let i=0;i<40;i++)await new Promise(r=>setImmediate(r));
  const K=S.voiceKey;
  check(K('Hot dog!')==='hotdog'&&K('Back-to-back hot dog!')==='b2bhotdog','Packed Lunch: hot dog and back-to-back hot dog');
  check(K('2 chain!')==='chain2'&&K('5 chain!')==='chain5'&&K('7 chain!')==='megachain'&&K('1 chain!')===null,'chains 2-5 by number, 6+ is a mega chain');
  check(K('FEAST!')==='feast'&&K('Order up! #3')==='orderup'&&K('Rush order #4! Tip +50')==='rush','Feast, Order up, Rush order');
  check(K('SLUUURP! 9')==='slurp'&&K('ALL YOU CAN EAT! 11')==='allyoucaneat'&&K('Big plate! 7')==='bigplate'&&K('Slurp! 5')===null,'Noodle Slurp / Buffet Grab: only the big ones');
  check(K('Spotless!')==='spotless'&&K('KABOOM! 9')==='kaboom'&&K("Kitchen's closing!")==='closing'&&K('Hissss! Not the cat!')==='notthecat','Mold, Splat Shot bomb, Merge, Pest cat');
  check(K('Pop 3 + drop 5!')==='splatattack'&&K('Pop 3 + drop 2!')===null&&K('6 in a row!')==='cooking'&&K('4 in a row!')===null,'big drops and long rows only');
  check(K('Bob lost connection')===null&&K('Blocked 3')===null&&K('+120')===null,'ordinary pop-ups stay quiet');
  played.length=0;S.callout('Hot dog!');check(played.includes('v-hotdog'),'a pop-up plays its recorded line');
  now=.2;S.callout('2 chain!');check(!played.includes('v-chain2'),'a smaller line waits its turn (skipped while a bigger one plays)');
  now=.4;S.callout('9 chain!');check(played.includes('stop:v-hotdog')&&played.includes('v-megachain'),'a bigger moment cuts in');
  now=5;played.length=0;S.say('Hot dog!');check(played.includes('v-hotdog')&&!spoken.includes('Hot dog!'),'say() uses the recorded line when there is one');
  now=10;S.say('Perfect clear!');check(spoken.includes('Perfect clear!'),'no clip yet: falls back to the device voice');
  played.length=0;now=20;S.play('throw');check(played.includes('s-throw'),'recorded effect replaces the synthesized one');
  played.length=0;S.play('junk');check(!played.some(n=>/^s-/.test(n)),'missing effect: synthesized sound still plays (no clip)');
  played.length=0;now=30;S.setMuted(true);S.callout('Hot dog!');S.play('throw');check(played.length===0,'mute silences callouts and clips');
  // Packed Lunch: her voice for her lines, his for the rest
  check(K('Double')==='double'&&K('Triple')==='triple'&&K('Grill spin double')==='grillmaster'&&K('Fully loaded!')==='loaded','Packed Lunch: Double, Triple, Grill spin, Fully loaded');
  check(K('3 combo')==='sizzlin'&&K('5 combo')==='roll'&&K('7 combo')==='diggity'&&K('4 combo')===null,'combos 3, 5 and 7 get praise, others stay quiet');
  S.setMuted(false);S.setVoice('blocks');played.length=0;now=40;S.callout('Hot dog!');check(played.includes('f-hotdog')&&!played.includes('v-hotdog'),'Packed Lunch: hot dog in her voice');
  now=45;S.callout('Perfect clear!');check(played.includes('f-base'),'Packed Lunch: a perfect clear is "Base!"');
  now=50;played.length=0;S.callout('9 chain!');check(played.includes('v-megachain'),'a line she doesn\'t have falls back to his');
  S.setVoice('classic');now=55;played.length=0;S.callout('Hot dog!');check(played.includes('v-hotdog'),'other modes keep his voice');
  now=60;played.length=0;S.callout('Double');check(played.length===0,'other modes: no "Double" callout');
  console.log(fails?`${fails} FAILED`:'all voice checks passed');process.exit(fails?1:0);
})();
