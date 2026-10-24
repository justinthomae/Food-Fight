// Cross-game invites: which card and buttons show for pending vs later invites, in a match or not.
const X=require('../js/gm-cross-invites.js');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};
const now=Date.now(),soon=new Date(now+600000).toISOString(),gone=new Date(now-1000).toISOString();
const inv=o=>Object.assign({id:'i1',app:'lostempires',app_name:'Lost Empires',from_name:'Ann',join_url:'https://lost-empires.onrender.com/?room=AB12',
  status:'pending',created_at:new Date(now-5000).toISOString(),expires_at:soon},o);
const acts=c=>c?c.buttons.map(b=>b.a).join(','):'none';

let c=X.card(inv(),false);
ok(c.kind==='invite'&&c.text==='Ann invites you to Lost Empires','pending, not in a match: "Ann invites you to Lost Empires"');
ok(acts(c)==='now,decline'&&c.buttons.map(b=>b.label).join('|')==='Join|No thanks','  ...with Join and No thanks only');
c=X.card(inv(),true);
ok(c.kind==='invite'&&acts(c)==='now,later,decline','pending, mid-match: Join now, After this game, and x');
ok(c.buttons[0].label==='Join now'&&c.buttons[1].label==='After this game'&&c.buttons[2].x,'  ...labelled Join now / After this game / x');
ok(X.card(inv({status:'later'}),true)===null,'later, still mid-match: nothing shows');
c=X.card(inv({status:'later'}),false);
ok(c.kind==='waiting'&&c.text==='Ann is waiting for you in Lost Empires'&&acts(c)==='now,decline','later, match over: "Ann is waiting for you in Lost Empires" with Join and No thanks');
ok(X.card(inv({status:'accepted'}),false)===null&&X.card(inv({status:'declined'}),true)===null,'answered invites never show');
ok(X.card(inv({from_name:'',app_name:''}),false).text==='A friend invites you to lostempires','missing names fall back');

const opts={app:'foodfight',now};
ok(X.pick([inv({app:'foodfight'})],opts)===null,'an invite to this game itself is ignored');
ok(X.pick([inv({expires_at:gone})],opts)===null,'expired invites are ignored');
ok(X.pick([inv({join_url:'http://lost-empires.onrender.com/'})],opts)===null&&X.pick([inv({join_url:'javascript:alert(1)'})],opts)===null,'only https join links are offered');
ok(X.pick([inv()],Object.assign({skip:new Set(['i1'])},opts))===null,'an invite being answered is skipped');
const rows=[inv({id:'late',status:'later',created_at:new Date(now-90000).toISOString()}),inv({id:'new2',from_name:'Bo',created_at:new Date(now-1000).toISOString()}),inv({id:'new1',app:'silentdepths',app_name:'Silent Depths',created_at:new Date(now-3000).toISOString()})];
let p=X.pick(rows,opts);
ok(p&&p.inv.id==='new1'&&p.card.kind==='invite','new invites come before "waiting" ones, oldest first');
p=X.pick([rows[0]],Object.assign({inMatch:true},opts));
ok(p===null,'mid-match, a "later" invite waits');
p=X.pick([rows[0]],opts);
ok(p&&p.card.kind==='waiting','after the match, the "later" invite comes back');
ok(X.httpsUrl('https://lost-empires.onrender.com/r?x=1')==='https://lost-empires.onrender.com/r?x=1'&&X.httpsUrl('ftp://x')===''&&X.httpsUrl(null)==='','httpsUrl keeps https links only');
