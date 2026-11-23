// Copies the website (the repo root) into app/www for the Capacitor shell. The app is the same game as
// foodfight.grudgematchgames.com: same files, same Supabase project. Tests, tools and store files stay out.
import {cpSync,rmSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=join(dirname(fileURLToPath(import.meta.url)),'..'),root=join(app,'..'),www=join(app,'www');
rmSync(www,{recursive:true,force:true});mkdirSync(www,{recursive:true});
for(const p of ['index.html','manifest.webmanifest','js','assets','icons']){
  if(!existsSync(join(root,p)))throw new Error('missing '+p);
  cpSync(join(root,p),join(www,p),{recursive:true});
}
// the app version follows the game's VERSION in js/app.js
const v=(readFileSync(join(root,'js/app.js'),'utf8').match(/const VERSION='([\d.]+)'/)||[])[1];
if(v){const pj=JSON.parse(readFileSync(join(app,'package.json'),'utf8'));if(pj.version!==v){pj.version=v;writeFileSync(join(app,'package.json'),JSON.stringify(pj,null,2)+'\n')}}
console.log('www ready',v?'(version '+v+')':'');
