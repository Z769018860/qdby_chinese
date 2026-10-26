const {chromium}=require(require.resolve('playwright',{paths:['/usr/lib/node_modules','/usr/local/lib/node_modules',process.cwd()]}));
// Batch audit of the replay review: decode -> timeline -> computeStats -> dump per-item scores and accounting invariants.
//   node scripts/replay_audit/audit.js <shard> <shards>
// env: REPLAY_DIR  directory holding <battleUuid>.bin (the raw BattleReplay_<uuid>.json from https://z1g-warreport.qookkagames.com/publish/)
//      IDS_FILE    text file, one battleUuid per line (default: <REPLAY_DIR>/ids.txt)
//      BASE_URL    site served locally, e.g. python3 -m http.server 8765 (default http://localhost:8765)
//      OUT_DIR     where audit_<shard>.json is written (default: REPLAY_DIR)
// Needs `playwright` (global or local). Output per replay: aw / wheels / covs / relics (score, grade, cats), totalDmg, awDmg, hitDmg, keEvents vs supKey.
const fs=require('fs');const S=(process.env.REPLAY_DIR||'.').replace(/\/?$/,'/'),BASE=process.env.BASE_URL||'http://localhost:8765',OUT=(process.env.OUT_DIR||S).replace(/\/?$/,'/');const K=+process.argv[2],N=+process.argv[3];
const ids=fs.readFileSync(process.env.IDS_FILE||S+'ids.txt','utf8').split('\n').filter((x,i)=>x&&i%N===K);
(async()=>{let b,pg;const boot=async()=>{b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});pg=await b.newPage();
 await pg.route(/BattleReplay_|\/api\/morimens\/replay\//,r=>{const id=r.request().url().match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)[0].toLowerCase();const f=[S+id+'.bin'].find(x=>fs.existsSync(x));r.fulfill({status:200,contentType:'application/octet-stream',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(f)})});
 await pg.goto(BASE+'/morimens-tools.html',{waitUntil:'load'});await pg.waitForSelector('#morimensReplayTab');await pg.waitForFunction(()=>window.MorimensReplayReview,{timeout:90000})};await boot();
 const out={};
 for(const u of ids){let r=null;try{r=await pg.evaluate(async u=>{try{const R=window.MorimensReplayReview;await R.preloadAssets();const full=await R.fetchReplay(u);const tl=R.buildTimeline(full);try{R.calibrateHits(tl)}catch(e){}const st=R.computeStats(full,tl);const m=st.mvp;const res=tl.res;
   const bad=(o,p,out)=>{for(const [k,v] of Object.entries(o||{})){if(typeof v==='number'&&(!Number.isFinite(v)))out.push(p+k+'=NaN');else if(v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Map)&&!(v instanceof Set)&&p.length<24)bad(v,p+k+'.',out)}};
   const issues=[];const nan=[];for(const x of m.awakeners)bad(x.x,'aw.'+x.r.a.name+'.',nan);for(const x of m.wheels.concat(m.covenants,m.relics))bad(x,'g.',nan);if(nan.length)issues.push('NaN:'+nan.slice(0,4).join(','));
   const hitDmg=tl.hitLog.reduce((n,h)=>n+(h.blind?0:h.dmg),0),awDmg=m.awakeners.reduce((n,x)=>n+x.r.dmg,0);
   const aw=m.awakeners.map(x=>({n:x.r.a.name,sc:Math.round(x.score),g:x.grade,dmg:Math.round(x.r.dmg),outT:Math.round(x.x.outT),sh:Math.round(x.x.sh),plays:x.r.plays,cats:Object.fromEntries(Object.entries(x.cats).map(([k,v])=>[k,v==null?null:Math.round(v)])),sup:Object.fromEntries(Object.entries(x.x.sup).filter(([k,v])=>v>0).map(([k,v])=>[k,Math.round(v)]))}));
   const gear=l=>l.map(x=>({n:(x.g||x.r).name||res.nameRelic((x.r||{}).tid),k:(x.g||{}).kind||'relic',trig:(x.g||x.r).n,val:Math.round(x.val||0),sc:Math.round(x.score),g:x.grade,cats:Object.fromEntries(Object.entries(x.cats||{}).map(([k,v])=>[k,v==null?null:Math.round(v)]))}));
   const keKp=(()=>{let s=0;for(const r of tl.rounds)for(const e of r.events)if(e.eventId===1028&&e.data&&e.data.propertyType==='keeper_energy'&&Number(e.data.changedValue)>0)s+=Number(e.data.changedValue);return s})();
   const supKey=[...tl.supStore.values()].reduce((n,v)=>n+v.key,0);
   const allGear=(window.__allGear=null);
   return {issues,totalDmg:Math.round(st.totalDmg),hitDmg:Math.round(hitDmg),awDmg:Math.round(awDmg),aw,wheels:gear(m.wheels),covs:gear(m.covenants),relics:gear(m.relics),keEvents:Math.round(keKp),supKey:Math.round(supKey),rounds:tl.rounds.length}}catch(e){return {err:String(e.message||e)+' '+(e.stack||'').slice(0,200)}}},u)}catch(e){try{await b.close()}catch{};await boot();r={err:'crash '+e.message}}
  out[u]=r;fs.writeFileSync(OUT+'audit_'+K+'.json',JSON.stringify(out))}
 console.log(K,'done',ids.length);await b.close()})();
