// Runs the leaderboard migration in an in-process Postgres (PGlite) and checks access rules + behaviour.
// Usage: NODE_PATH=<dir with @electric-sql/pglite> node test/sql-test.mjs
import {createRequire} from 'module';
import fs from 'fs';
const require=createRequire(process.env.NODE_PATH+'/');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
// Supabase roles
await db.exec(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261016000001_ff_leaderboard.sql',import.meta.url),'utf8'));
// re-running must be safe
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261016000001_ff_leaderboard.sql',import.meta.url),'utf8'));
ok(true,'migration applies twice');

const asAnon=async(sql,params)=>{await db.exec('set role anon');try{return await db.query(sql,params)}finally{await db.exec('reset role')}};
const submit=(dev,name,mode,diff,score,dur=120,chain=2)=>asAnon(`select ff_submit_score($1,$2,$3,$4,$5,$6,0,true,1,$7,'0.3.0') r`,[dev,name,mode,diff,score,chain,dur]).then(x=>x.rows[0].r);
const age=(dev,secs)=>db.query(`update ff_scores set created_at=created_at-make_interval(secs=>$2) where device_id=$1`,[dev,secs]);

// anon cannot touch the table directly
let denied=false;try{await asAnon('select * from ff_scores')}catch(e){denied=true}
ok(denied,'anon cannot read the table directly');
denied=false;try{await asAnon(`insert into ff_scores(device_id,name,mode,difficulty,score,duration_s) values('xxxxxxxx','x','duel',1,999999,60)`)}catch(e){denied=true}
ok(denied,'anon cannot insert directly');

let r=await submit('device-aaa1','Justin','duel',1,4000);
ok(r.ok&&r.rank_all===1&&r.rank_day===1&&r.personal_best===true,'first score ranks #1 and is a personal best');
r=await submit('device-aaa1','Justin','duel',1,3000);
ok(r.ok===false&&r.reason==='too_fast','rate limit blocks a second submit within 15s');
await age('device-aaa1',20);
r=await submit('device-aaa1','Justin','duel',1,3000);
ok(r.ok&&r.personal_best===false&&r.rank_all===1,'lower score saved, not a PB, still #1 by best');
r=await submit('device-bbb2','Sam','duel',1,5000);
ok(r.ok&&r.rank_all===1,'new top score takes #1');
r=await submit('device-ccc3','Cheat','duel',1,999999,60);
ok(r.ok===false&&r.reason==='implausible','impossible score rejected');
r=await submit('device-ddd4','x'.repeat(40)+'​','duel',1,100,30);
ok(r.ok,'long name accepted and trimmed');
r=await submit('device-eee5','  ','brawl',2,2500);
ok(r.ok,'blank name becomes Cook');
r=await submit('device-fff6','Hardy','duel',2,9000);
ok(r.ok&&r.rank_all===1,'hard board ranks separately from normal');

let lb=(await asAnon(`select * from ff_leaderboard('duel',1,'all','device-aaa1',50)`)).rows;
ok(lb.length===3&&lb[0].name==='Sam'&&lb[1].name==='Justin'&&lb[1].score===4000&&lb[1].mine===true,'board shows best per player with mine flag');
ok(lb.find(x=>x.score===100).name==='x'.repeat(14),'names trimmed to 14 chars');
lb=(await asAnon(`select * from ff_leaderboard('brawl',2,'all',null,50)`)).rows;
ok(lb[0].name==='Cook','blank name stored as Cook');
// time windows
await age('device-bbb2',3*86400);
lb=(await asAnon(`select * from ff_leaderboard('duel',1,'day',null,50)`)).rows;
ok(!lb.some(x=>x.name==='Sam'),'3-day-old score drops off Today');
lb=(await asAnon(`select * from ff_leaderboard('duel',1,'week',null,50)`)).rows;
ok(lb.some(x=>x.name==='Sam'),'but stays on This week');
// limit + your own row outside the top
for(let i=0;i<12;i++)await submit('device-lim'+String(i).padStart(3,'0'),'P'+i,'online',0,6000+i*10);
await submit('device-zzz9','Me','online',2,50,30);
lb=(await asAnon(`select * from ff_leaderboard('online',0,'all','device-zzz9',5)`)).rows;
ok(lb.length===6&&lb[5].mine&&lb[5].rank===13,'top 5 plus your own row at #13');
ok((await asAnon(`select * from ff_leaderboard('online',2,'all',null,5)`)).rows.length===5,'online ignores difficulty');
console.log('done');
