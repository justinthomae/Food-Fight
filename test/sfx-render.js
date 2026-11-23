// Renders every sound effect offline and checks it is audible and not clipping.
// Usage: NODE_PATH=<dir with node-web-audio-api> node test/sfx-render.js
const {OfflineAudioContext}=require('node-web-audio-api');
const fs=require('fs'),path=require('path'),vm=require('vm');
const code=fs.readFileSync(path.join(__dirname,'../js/sfx.js'),'utf8');
// a 1-second 440 Hz WAV, served for the music files when a test asks for them
function wav(f){const n=44100,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(44100,24);b.writeUInt32LE(88200,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*f/44100)*12000),44+i*2);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}
function load(withMusic){
  const ctx=new OfflineAudioContext(2,44100*3,44100);
  ctx.resume=()=>Promise.resolve();
  const win={AudioContext:function(){return ctx}};
  const fetch=withMusic?(u=>/m-(main|intense)/.test(u)?Promise.resolve({ok:true,arrayBuffer:async()=>wav(/main/.test(u)?440:660)}):Promise.resolve({ok:false,status:404})):undefined;
  vm.runInNewContext(code,{window:win,performance,Math,fetch,Promise,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){}});
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
  // music: off until a match asks for it, then calm, intense, and off again; mute and the setting silence it
  {const {S,ctx}=load(true);S.wake();const wait=()=>new Promise(r=>setTimeout(r,200));
   const chk=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)bad++};
   chk(S.musicState==='off','music: silent until a match starts');
   S.music('calm');await wait();chk(S.musicState==='calm','music: calm groove during a match');
   S.music('intense');chk(S.musicState==='intense','music: switches to the tense loop');
   S.setMuted(true);chk(S.musicState==='off','music: mute stops it');S.setMuted(false);chk(S.musicState==='intense','music: unmute brings it back');
   S.setMusic(false);chk(S.musicState==='off','music: the Music setting turns it off');S.setMusic(true);
   S.music('off');chk(S.musicState==='off','music: stops when the match ends');
   S.music('calm');await wait();const buf=await ctx.startRendering();let pk=0;for(const x of buf.getChannelData(0))pk=Math.max(pk,Math.abs(x));
   chk(pk>0.01&&pk<=1,'music: audible and not clipping (peak '+pk.toFixed(2)+')');}
  process.exitCode=bad?1:0;
})();
