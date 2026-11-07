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

// ---- v2 migration: avatars, Big Brawl board, 8-player limits; existing rows keep working
const v2=fs.readFileSync(new URL('../supabase/migrations/20261016000002_ff_leaderboard_v2.sql',import.meta.url),'utf8');
const before=(await db.query('select count(*)::int n from ff_scores')).rows[0].n;
await db.exec(v2);await db.exec(v2);
ok((await db.query('select count(*)::int n from ff_scores')).rows[0].n===before,'v2 applies twice and keeps existing scores');
denied=false;try{await asAnon('select * from ff_scores')}catch(e){denied=true}
ok(denied,'table still locked after v2');
const submit2=(dev,name,mode,diff,score,av,kos=0,place=1)=>asAnon(`select ff_submit_score(p_device_id=>$1,p_name=>$2,p_mode=>$3,p_difficulty=>$4,p_score=>$5,p_max_chain=>2,p_kos=>$7,p_won=>false,p_place=>$8,p_duration_s=>200,p_version=>'0.4.0',p_avatar=>$6) r`,[dev,name,mode,diff,score,av,kos,place]).then(x=>x.rows[0].r);
r=await submit2('device-big1','Brawler','brawl8',1,7000,'crunch',7,8);
ok(r.ok&&r.rank_all===1,'Big Brawl score with 7 KOs and 8th place accepted');
r=await submit2('device-av02','Hacker','duel',1,200,'<script>');
lb=(await asAnon(`select * from ff_leaderboard('duel',1,'all','device-av02',50)`)).rows;
ok(lb.find(x=>x.mine).avatar==='','unknown avatar stored as blank');
lb=(await asAnon(`select * from ff_leaderboard('brawl8',1,'all',null,50)`)).rows;
ok(lb.length===1&&lb[0].avatar==='crunch','board returns the avatar');
// an old client (no p_avatar) still works
r=await asAnon(`select ff_submit_score(p_device_id=>'device-old1',p_name=>'Old',p_mode=>'duel',p_difficulty=>1,p_score=>100,p_max_chain=>1,p_kos=>0,p_won=>false,p_place=>2,p_duration_s=>60,p_version=>'0.3.1') r`).then(x=>x.rows[0].r);
ok(r.ok,'v0.3 call shape without avatar still accepted');
console.log('v2 done');

// ---- v3: any fighter id
const v3=fs.readFileSync(new URL('../supabase/migrations/20261016000003_ff_leaderboard_v3.sql',import.meta.url),'utf8');
await db.exec(v3);await db.exec(v3);
r=await submit2('device-v3a1','Guacamole','duel',1,300,'guac');
lb=(await asAnon(`select * from ff_leaderboard('duel',1,'all','device-v3a1',50)`)).rows;
ok(lb.find(x=>x.mine).avatar==='guac','new fighter avatar stored after v3');
r=await submit2('device-v3a2','Bad','duel',1,300,"x'; drop table ff_scores;--");
ok(r.ok&&(await asAnon(`select * from ff_leaderboard('duel',1,'all','device-v3a2',50)`)).rows.find(x=>x.mine).avatar==='','junk avatar stored as blank');
console.log('v3 done');

// ---- v4: game modes get their own boards
const v4=fs.readFileSync(new URL('../supabase/migrations/20261017000004_ff_leaderboard_v4.sql',import.meta.url),'utf8');
await db.exec(v4);await db.exec(v4);
const nBefore=(await db.query('select count(*)::int n from ff_scores')).rows[0].n;
ok(nBefore>0,'v4 applies twice and keeps existing scores');
r=await submit2('device-v4a1','Stacker','stack-duel',2,5000,'guac');
ok(r.ok&&r.rank_all===1,'stack-duel score accepted');
r=await submit2('device-v4a2','Boss Fan','boss-online',0,2000,'fudge');
ok(r.ok,'boss-online score accepted');
lb=(await asAnon(`select * from ff_leaderboard('boss-online',2,'all','device-v4a2',50)`)).rows;
ok(lb.length===1&&lb[0].mine,'online mode boards ignore difficulty');
lb=(await asAnon(`select * from ff_leaderboard('stack-duel',2,'all',null,50)`)).rows;
ok(lb.length===1&&lb[0].name==='Stacker','each mode has its own board');
ok((await asAnon(`select * from ff_leaderboard('duel',1,'all',null,50)`)).rows.every(x=>x.name!=='Stacker'),'classic board unaffected');
r=await submit2('device-v4a3','Hack','stack-mega',1,100,'guac');
ok(r.ok===false&&r.reason==='mode','unknown mode rejected');
r=await submit2('device-v4a4','Hack','duel; drop',1,100,'guac');
ok(r.ok===false,'junk mode string rejected');
let bad=false;try{await db.query(`insert into ff_scores(device_id,name,mode,difficulty,score,duration_s) values('device-v4zz','x','pizza',1,1,60)`)}catch(e){bad=true}
ok(bad,'table constraint blocks unknown modes');
console.log('v4 done');
// ---- v5: the seven newer modes get boards too
const v5=fs.readFileSync(new URL('../supabase/migrations/20261019000005_ff_leaderboard_v5.sql',import.meta.url),'utf8');
await db.exec(v5);await db.exec(v5);
ok((await db.query('select count(*)::int n from ff_scores')).rows[0].n>=nBefore,'v5 applies twice and keeps existing scores');
let k=0;for(const m of ['slurp','buffet','mold','pancake','merge','conveyor','pest']){r=await submit2('device-v5m'+(k++),'New '+m,m+'-brawl',1,3000,'bun');ok(r.ok,m+'-brawl score accepted')}
ok((await asAnon(`select * from ff_leaderboard('merge-brawl',1,'all',null,50)`)).rows.length===1,'new mode has its own board');
r=await submit2('device-v5zz','Hack','blocks-duel',1,100,'guac');ok(r.ok===false&&r.reason==='mode','the secret mode still has no board');
console.log('v5 done');

// ---- v6: tighter limits, and suspicious scores are held back (only their sender sees them)
const v6=fs.readFileSync(new URL('../supabase/migrations/20261107000008_ff_leaderboard_v6.sql',import.meta.url),'utf8');
const n5=(await db.query('select count(*)::int n from ff_scores')).rows[0].n;
await db.exec(v6);await db.exec(v6);
ok((await db.query('select count(*)::int n from ff_scores')).rows[0].n===n5,'v6 applies twice and keeps existing scores');
ok((await db.query('select count(*)::int n from ff_scores where held')).rows[0].n===0,'existing scores stay published');
const sub6=(dev,mode,score,dur,name='Cook')=>asAnon(`select ff_submit_score($1,$2,$3,1,$4,2,0,true,1,$5,'0.5.0','bun') r`,[dev,name,mode,score,dur]).then(x=>x.rows[0].r);
const board=(mode,dev=null)=>asAnon(`select * from ff_leaderboard($1,1,'all',$2,50)`,[mode,dev]).then(x=>x.rows);
const heldOf=dev=>db.query(`select held,held_reason from ff_scores where device_id=$1 order by id desc limit 1`,[dev]).then(x=>x.rows[0]);
r=await sub6('device-v6long','order-duel',5000,1300);ok(r.ok===false&&r.reason==='duration','matches over 20 minutes are rejected');
r=await sub6('device-v6fast','order-duel',130000,1000);ok(r.ok===false&&r.reason==='implausible','over 120 points a second is rejected');
// a family with 10 real scores: best rate 30/s, longest match 300 s
for(let i=0;i<10;i++){r=await sub6('device-v6r'+String(i).padStart(2,'0'),'order-duel',[3000,4000,6000,9000,4500,3500,5000,2500,7000,8000][i],300);if(!r.ok)console.log(r)}
ok((await board('order-duel')).length>=10,'ten normal scores published');
r=await sub6('device-v6good','order-duel',13000,300);let h=await heldOf('device-v6good');
ok(r.ok&&!h.held,'a strong but believable score (43/s vs best 30/s) is published');
r=await sub6('device-v6rate','order-duel',30000,400);h=await heldOf('device-v6rate');
ok(r.ok&&h.held&&h.held_reason==='rate','a score far above the best rate is held');
ok(r.rank_all===1,'the sender is told their rank as usual');
let b=await board('order-duel');ok(!b.some(x=>x.score===30000),'held score is hidden from everyone else');
b=await board('order-duel','device-v6rate');ok(b.some(x=>x.score===30000&&x.mine&&x.rank===1n||x.score===30000&&x.mine&&Number(x.rank)===1),'held score still shows for its sender, at #1');
r=await sub6('device-v6dur','order-duel',9000,700);h=await heldOf('device-v6dur');
ok(r.ok&&h.held&&h.held_reason==='duration','a match more than twice the longest is held');
// a young board: holds a score more than 3x the current #1
for(let i=0;i<3;i++)await sub6('device-v6y'+i,'pest-duel',[1000,1500,2000][i],120);
r=await sub6('device-v6jump','pest-duel',6500,120);h=await heldOf('device-v6jump');
ok(r.ok&&h.held&&h.held_reason==='jump','beating #1 by more than 3x on a young board is held');
r=await sub6('device-v6ok','pest-duel',5800,120);h=await heldOf('device-v6ok');
ok(r.ok&&!h.held,'beating #1 by less than 3x is published');
r=await sub6('device-v6new','mold-duel',9000,100);h=await heldOf('device-v6new');
ok(r.ok&&h.held&&h.held_reason==='rate','on a family with few scores, over 80 points a second is held');
// reviewing
let denied6=false;try{await asAnon('select * from ff_held_scores')}catch(e){denied6=true}
ok(denied6,'players cannot read the held list');
const held=(await db.query('select * from ff_held_scores')).rows;
ok(held.length===4&&held.every(x=>x.held_reason),'owner sees every held score with its reason');
await db.query(`update ff_scores set held=false where device_id='device-v6rate'`);
ok((await board('order-duel')).some(x=>x.score===30000),'releasing a held score publishes it');
console.log('v6 done');
