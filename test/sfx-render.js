// Renders every sound effect offline and checks it is audible and not clipping.
// Usage: NODE_PATH=<dir with node-web-audio-api> node test/sfx-render.js
const {OfflineAudioContext}=require('node-web-audio-api');
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'../js/sfx.js'),'utf8');
function load(){
  const ctx=new OfflineAudioContext(2,44100*3,44100);
  ctx.resume=()=>Promise.resolve();
  const win={AudioContext:function(){return ctx}};
  vm.runInNewContext(code,{window:win,performance,Math,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){}});
  return {S:win.FFSound,ctx};
}
(async()=>{
  const names=load().S.names;let bad=0;
  for(const n of names){
    const {S,ctx}=load();S.wake();
    S.play(n,n==='chain'?5:n==='match'?5:n==='earn'?true:undefined);
    const buf=await ctx.startRendering();const d=buf.getChannelData(0);
    let peak=0,sum=0;for(const x of d){const a=Math.abs(x);if(a>peak)peak=a;sum+=x*x}
    const rms=Math.sqrt(sum/d.length),okk=peak>0.02&&peak<=1.0;
    if(!okk)bad++;
    console.log((okk?'PASS ':'FAIL ')+n.padEnd(9)+' peak '+peak.toFixed(2)+' rms '+rms.toFixed(3));
  }
  {const {S}=load();S.wake();S.ambience(true);S.ambience(false);S.setMuted(true);S.play('match',3);console.log('PASS ambience start/stop + mute without errors')}
  process.exitCode=bad?1:0;
})();
