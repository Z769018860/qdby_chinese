// Build data/morimens/game/summon-calendar.json for the "卡池活动复刻日历" tab.
// Sources (all public GitHub raw files):
//  - dansa/SKeyDB  src/data/timeline/banners.json + events.json  (exact banner / event dates, UTC+8, 2026-02 onwards)
//  - Morimenz-kr/Morimens.Info.kr  data/rerun_schedule.json + character_manifest.json  (monthly rerun history since 2023-11, verified periods)
//  - Z769018860/morimens-summon  web/catalog.json  (zh names of banner featured units, from the SKeyDB catalog)
// Names / images are joined to data/morimens/game/tier-pool.json; zh titles come from scripts/data/calendar_titles_zh.json
// (game localization table where available, otherwise AI-assisted - flagged in the file).
import {readFile, writeFile} from 'node:fs/promises';

const raw=(o,r,p)=>`https://raw.githubusercontent.com/${o}/${r}/main/${p}`;
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'qdby-chinese-summon-calendar'}});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json()}
const [banners,events,rerun,manifest,catalog]=await Promise.all([
  get(raw('dansa','SKeyDB','src/data/timeline/banners.json')),
  get(raw('dansa','SKeyDB','src/data/timeline/events.json')),
  get(raw('Morimenz-kr','Morimens.Info.kr','data/rerun_schedule.json')),
  get(raw('Morimenz-kr','Morimens.Info.kr','data/character_manifest.json')),
  get(raw('Z769018860','morimens-summon','web/catalog.json')).catch(()=>({banners:[]}))
]);
const pool=JSON.parse(await readFile('data/morimens/game/tier-pool.json','utf8')).kinds;
const titles=JSON.parse(await readFile('scripts/data/calendar_titles_zh.json','utf8'));
const awakeners=JSON.parse(await readFile('data/morimens/skeydb/awakeners.json','utf8')).records;

const nk=s=>String(s||'').toLowerCase().replace(/^"|"$/g,'').replace(/[^a-z0-9]/g,'');
const byEn={awakener:new Map(),wheel:new Map()};
for(const k of ['awakener','wheel'])for(const it of pool[k])byEn[k].set(nk(it.en),it);
const ref=(en,hint)=>{
  for(const k of hint?[hint]:['awakener','wheel']){const it=byEn[k].get(nk(en));if(it)return {k,id:it.id,en:it.en.replace(/^"|"$/g,''),zh:it.zh||''}}
  return {k:hint||'other',id:'',en:String(en).replace(/^"|"$/g,''),zh:''};
};
// Info.kr character id -> SKeyDB awakener
const slugMap=new Map();
for(const a of awakeners)for(const k of [a.slug,a.assetSlug,a.name,...(a.aliases||[])])slugMap.set(nk(k),a);
const fix={coporsant:'corposant',dafoodil:'daffodil'};
const charOf=id=>{const a=slugMap.get(nk(fix[id]||id));if(!a)return {k:'awakener',id:'',en:id,zh:''};const it=pool.awakener.find(x=>x.id===a.id);return {k:'awakener',id:a.id,en:a.name.replace(/^"|"$/g,''),zh:it?.zh||''}};
const iso=s=>String(s).replace(/^(\d{4})\/(\d\d)\/(\d\d) (\d\d:\d\d)$/,'$1-$2-$3T$4+08:00');
const title=t=>({en:t,zh:titles[t]?.zh||'',zs:titles[t]?.s||''});
const featuredList=f=>(f==null?[]:Array.isArray(f)?f:[f]).map(x=>typeof x==='string'?{name:x}:x);

const zhBanner=new Map((catalog.banners||[]).map(b=>[b.id,b]));
const outBanners=banners.map(b=>{
  const cz=zhBanner.get(b.id);
  const feat=featuredList(b.featured).map((f,i)=>{const r=ref(f.name,f.kind);if(!r.zh&&cz?.featuredZh?.[i]&&cz.featured?.length===featuredList(b.featured).length)r.zh=cz.featuredZh[i];return r});
  return {id:b.id,type:b.type,title:title(b.title),start:iso(b.startDate),end:iso(b.endDate),featured:feat,desc:b.description||''};
});
// ---------- normalized wiki history (data/morimens/huiji/summon-rerun/): day-level appearances for the gap leaderboards ----------
// The wiki module has year typos in a few end dates (e.g. 2024-06-17 ~ 2025-07-15); they are clamped to the next launch banner.
const END_FIX={'2024-06-17':'2024-07-15','2024-07-15':'2024-08-12','2024-08-05':'2024-08-12','2024-08-12':'2024-09-09','2024-11-18':'2024-12-16'};
const fixEnd=(start,end)=>{const d=start.slice(0,10);return END_FIX[d]&&end.slice(0,10)>END_FIX[d]?END_FIX[d]+end.slice(10):end};
// ---------- HuijiWiki 唤醒 page (data/morimens/huiji/summon.json, from scripts/huiji_summon_console.js) ----------
const poolNames=JSON.parse(await readFile('scripts/data/summon_pool_names.json','utf8'));
let wikiPages={};
try{wikiPages=JSON.parse(await readFile('data/morimens/huiji/summon.json','utf8')).pages||{}}catch{}
const zhKey=s=>String(s||'').replace(/[「」\s]/g,'');
const byZh={awakener:new Map(),wheel:new Map()};
for(const k of ['awakener','wheel'])for(const it of pool[k])if(it.zh)byZh[k].set(zhKey(it.zh),it);
const refZh=(name,kind)=>{
  const it=byZh[kind].get(zhKey(name));
  return it?{k:kind,id:it.id,en:it.en.replace(/^"|"$/g,''),zh:it.zh}:{k:kind,id:'',en:'',zh:String(name).replace(/[「」]/g,'')};
};
const list=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
const parseLua=text=>{
  const body=text.replace(/--[^\n]*/g,'');
  return [...body.matchAll(/\{([^{}]*)\}/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)\s*=\s*"([^"]*)"/g)].map(x=>[x[1],x[2]])));
};
const T=/(\d{4}-\d\d-\d\d \d\d:\d\d)\s*(?:~|至)\s*(?:<br>)?\s*(\d{4}-\d\d-\d\d \d\d:\d\d)?/;
const parseTime=t=>{const m=T.exec(String(t||''));return m?{start:m[1].replace(' ','T')+'+08:00',end:m[2]?m[2].replace(' ','T')+'+08:00':''}:null};
const pn=zh=>({zh,en:poolNames[zh]||'',zs:poolNames[zh]?'game':'',});
const lastSeg=l=>String(l||'').split('/').pop();
const OTHER={'命轨合契':'walks','循序命理':'fated','界域锚定':'anchor','众生百相':'novice','百相自选1':'select','角色自选':'select','缚誓之谕':'oath'};
const wikiBanners=[];
for(const [title,text] of Object.entries(wikiPages)){
  const m=/^模块:SummonAwkTable\/(\w+)\/[Dd]ata$/.exec(title);if(!m)continue;
  for(const e of parseLua(text)){
    const t=parseTime(e.time);if(!t)continue;
    const chars=list(e.chars).map(c=>refZh(c,'awakener')),gears=list(e.gears).map(g=>refZh(g,'wheel'));
    if(/^\d{4}$/.test(m[1])){
      if(e.type!=='活动唤醒')continue;
      const body=lastSeg(e.bodyLink),gear=lastSeg(e.gearLink);
      if(e.tag==='复刻'){
        const tri=/^三相衡生/.test(e.bodyImg||''),syl=/^因果苗圃/.test(e.gearImg||'');
        if(chars.length)wikiBanners.push({id:`wiki-${t.start.slice(0,10)}-rerun-c`,type:'rerun',cat:'triune',title:tri?{zh:'三相衡生',en:'Triune Verdant',zs:'game'}:{zh:'角色复刻唤醒',en:'Character rerun banner',zs:'ai'},...t,featured:chars,src:'wiki'});
        if(gears.length)wikiBanners.push({id:`wiki-${t.start.slice(0,10)}-rerun-w`,type:'rerun',cat:'sylvan',title:syl?{zh:'因果苗圃',en:'Sylvan Omen',zs:'game'}:{zh:'命轮复刻唤醒',en:'Wheel rerun banner',zs:'ai'},...t,featured:gears,src:'wiki'});
      }else{
        const names=[body,gear].filter(x=>x&&x!=='港澳台新马公测');
        wikiBanners.push({id:`wiki-${t.start.slice(0,10)}-awaken`,type:'awaken',cat:'limited',title:{zh:names.join(' / '),en:names.map(x=>poolNames[x]||'').filter(Boolean).join(' / '),zs:'game'},...t,featured:[...chars,...gears],src:'wiki'});
      }
    }else if(OTHER[e.type]){
      const g=e.group||e.type,sub=e.subType||e.realm||'';
      wikiBanners.push({id:`wiki-${t.start.slice(0,10)}-${OTHER[e.type]}-${sub||g}`,type:OTHER[e.type],cat:'premium',title:{zh:sub?`${g} · ${sub}`:g,en:(poolNames[g]||'')+(sub?` · ${sub}`:''),zs:poolNames[g]?'game':'ai'},sub,...t,featured:[...chars,...gears],src:'wiki'});
    }
  }
}
// forecast table
const forecast=[];
for(const text of [wikiPages['唤醒/未来唤醒预测']||'']){
  for(const row of text.split('|-').slice(2)){
    const cells=row.split('||');if(cells.length<2)continue;
    const t=parseTime(cells[0].replace(/^[^\d]*/,''));
    const label=cells[1].replace(/<br>/g,' ').replace(/\{\{唤醒体头像\|([^}]*)\}\}/g,'$1').replace(/\|\}.*$/s,'').trim();
    if(t||label)forecast.push({start:t?.start||'',end:t?.end||'',text:label});
  }
}
let rerunIndex={launchPairs:[]};const history0=[];
try{
  rerunIndex=JSON.parse(await readFile('data/morimens/huiji/summon-rerun/index.json','utf8'));
  for(const f of rerunIndex.historyFiles||[])history0.push(...JSON.parse(await readFile(`data/morimens/huiji/summon-rerun/${f}`,'utf8')));
}catch{}
const DAYMS=86400000;
const appearances=[];
for(const r of history0){
  const end0=fixEnd(r.start,r.end),rerun=/复刻/.test(r.tag);
  const push=(c,w,start,end)=>{
    const ch=c?refZh(c,'awakener'):null,wh=w?refZh(w,'wheel'):null;
    appearances.push({c:ch?.id||'',w:wh?.id||'',cz:ch?.zh||c||'',wz:wh?.zh||w||'',s:start,e:end,r:rerun?1:0,id:r.id});
  };
  if(r.dailyRotation?.slots?.length){
    const slots=r.dailyRotation.slots,reps=+r.dailyRotation.repeats||1,t0=Date.parse(r.start);
    for(let k=0;k<reps;k++)slots.forEach((slot,si)=>{
      const st=new Date(t0+(k*slots.length+si)*DAYMS),en=new Date(st.getTime()+DAYMS);
      const iso=d=>d.toISOString().replace('.000Z','').replace(/Z$/,'');   // keep +08:00 instants
      const n=Math.max(slot.characters?.length||0,slot.wheels?.length||0);
      for(let i=0;i<n;i++)push(slot.characters?.[i],slot.wheels?.[i],new Date(st).toISOString(),new Date(en).toISOString());
    });
  }else{
    const n=Math.max(r.characters?.length||0,r.wheels?.length||0);
    for(let i=0;i<n;i++)push(r.characters?.[i],r.wheels?.[i],new Date(Date.parse(r.start)).toISOString(),new Date(Date.parse(end0)).toISOString());
  }
}
const launchPairs=(rerunIndex.launchPairs||[]).map(p=>({c:refZh(p.character,'awakener').id,w:refZh(p.wheel,'wheel').id,cz:p.character,wz:p.wheel,cb:p.characterBanner||'',wb:p.wheelBanner||''}));
// fix the clamped end dates on the calendar banners as well
for(const b of wikiBanners)if(['awaken','rerun'].includes(b.type))b.end=fixEnd(b.start,b.end);
// merge: SKeyDB is authoritative from its first banner on (has English titles); the wiki fills everything before and the pool types SKeyDB lacks
const skMin=outBanners.reduce((m,b)=>b.start<m?b.start:m,'9999');
const skDays=new Set(outBanners.filter(b=>['premium','combo','selector','daily'].includes(b.type)).map(b=>b.start.slice(0,10)));
const wikiKeep=wikiBanners.filter(b=>['awaken','rerun'].includes(b.type)?b.start<skMin:(b.start<skMin||!(b.type==='walks'&&skDays.has(b.start.slice(0,10)))));
const mergedBanners=[...outBanners,...wikiKeep].sort((a,b)=>b.start.localeCompare(a.start));
// character / wheel / skin events (story events of each character, wheel archives, skins)
const outEvents=events.filter(e=>/^event-(story|skin|wheel|preorder)/.test(e.id)&&!/^event-preorder/.test(e.id)).map(e=>({
  id:e.id,kind:e.id.startsWith('event-story-rerun')?'story-rerun':e.id.startsWith('event-story')?'story':e.id.startsWith('event-skin')?'skin':'wheel',
  title:title(e.title),start:iso(e.startDate),end:iso(e.endDate),featured:featuredList(e.featured).map(f=>ref(f.name,f.kind&&f.kind!=='other'?f.kind:undefined))
}));
// ---------- Huiji wiki story events (data/morimens/huiji/events.json, from scripts/huiji_events_console.js): 2023-12 .. 2024-11 ----------
let wikiEv={pages:{},eventChars:{},eventEn:{}};
try{wikiEv=JSON.parse(await readFile('data/morimens/huiji/events.json','utf8'))}catch{}
const DT=/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d\d)/g;
const pad=n=>String(n).padStart(2,'0');
function eventPeriod(text){
  const sec=/==\s*活动时间\s*==\s*([\s\S]*?)(?:\n==|$)/.exec(text)?.[1]||'';
  const lines=sec.replace(/<br\s*\/?>/g,'\n').split('\n').map(l=>l.replace(/<s>.*?<\/s>/g,'').trim()).filter(l=>/\d\s*日/.test(l));
  const parse=line=>{let year=null,out=[];for(const m of line.matchAll(DT)){year=m[1]?+m[1]:year;if(year==null)return null;out.push(`${year}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${m[5]}+08:00`)}return out};
  const l1=parse(lines[0]||'');if(!l1||!l1.length)return null;
  let [start,end]=l1;
  if(/延期/.test(lines[0]||'')&&l1.length>2)end=l1[l1.length-1];       // "(延期至 …)": the extended end wins
  if(!end||end<=start){const l2=parse(lines[1]||'');end=l2?.[1]||l2?.[0]||start}
  return {start,end};
}
const wikiEvents=[];
for(const [title,text] of Object.entries(wikiEv.pages)){
  const nm=/^限时活动「(.+?)」(.*)$/.exec(title);if(!nm)continue;
  const per=eventPeriod(text);if(!per)continue;
  const rerun=/复刻/.test(nm[2]);
  const en=wikiEv.eventEn[nm[1]]||'';
  wikiEvents.push({id:`wiki-event-${per.start.slice(0,10)}`,kind:rerun?'story-rerun':'story',title:{en:en+(rerun?(/轻量/.test(nm[2])?' (light rerun)':' (rerun)'):''),zh:nm[1]+(rerun?(/轻量/.test(nm[2])?'·轻量复刻':'·复刻'):''),zs:'game'},...per,featured:(wikiEv.eventChars[nm[1]]||[]).map(c=>refZh(c,'awakener')),src:'wiki'});
}
// ---------- Steam announcements (data/morimens/steam/events.json, scripts/sync_steam_events.mjs): fills the gap after the wiki pages ----------
let steam={events:[]};
try{steam=JSON.parse(await readFile('data/morimens/steam/events.json','utf8'))}catch{}
const evMin=outEvents.reduce((m,e)=>e.start<m?e.start:m,'9999');
const wikiMax=wikiEvents.reduce((m,e)=>e.end>m?e.end:m,'0');
const steamEvents=steam.events.filter(e=>e.start<evMin&&e.start>wikiMax&&e.kind!=='special'||(e.kind==='special'&&e.start<evMin&&e.start>wikiMax)).map(e=>({
  id:`steam-${e.start.slice(0,10)}-${nk(e.title).slice(0,24)}`,kind:e.kind==='special'?'special':e.kind,title:{en:e.title,zh:titles[e.title]?.zh||'',zs:titles[e.title]?.s||''},start:e.start,end:e.end,
  featured:e.featured.map(f=>ref(f,'awakener')).filter(f=>f.id),src:'steam'
}));
// monthly history (Info.kr): chars with the n-th appearance (1 = first release) of that month
const history=rerun.history.map(h=>({month:h.month,chars:h.characters.map(c=>({...charOf(c.id),n:c.appearance}))}));
const periods=Object.fromEntries(Object.entries(rerun.verified_periods).map(([id,p])=>[charOf(id).id||id,{start:p.start_date+(p.start_time?` ${p.start_time}`:''),end:p.end_date+(p.end_time?` ${p.end_time}`:''),tz:p.timezone||'',src:p.source_url||p.source_note||''}]));
// ---------- Weibo 忘却前夜记录局 (data/morimens/weibo/events.json): official Chinese names + events missing elsewhere ----------
let weibo={events:[]};
try{weibo=JSON.parse(await readFile('data/morimens/weibo/events.json','utf8'))}catch{}
const weiboFrom=weibo.events.reduce((m,w)=>w.start<m?w.start:m,'9999');   // Weibo announcements are the authority from their first post on (wiki event pages have a few wrong start dates)
const allEvents=[...outEvents,...wikiEvents.filter(e=>e.start<weiboFrom),...steamEvents];
const dayOf=x=>x.start.slice(0,10);
const used=new Set();
const matchEv=(w,kinds)=>{
  const c=allEvents.filter(e=>dayOf(e)===dayOf(w)&&kinds.includes(e.kind)&&!used.has(e));
  if(!c.length)return null;
  return c.find(e=>(w.rerun?e.kind==='story-rerun':e.kind==='story'))||c[0];
};
const addedEvents=[];
const zhEn=JSON.parse(await readFile('scripts/data/calendar_titles_en.json','utf8'));
const baseName=n=>n.replace(/\s*·\s*(轻量)?复刻$/,'');
const enOf=w=>zhEn[w.name]||((zhEn[baseName(w.name)]||'')+(zhEn[baseName(w.name)]&&/复刻/.test(w.name)?' (rerun)':''));
for(const w of weibo.events.filter(w=>w.type==='gameplay')){
  const e=matchEv(w,['story','story-rerun','special']);
  if(e){used.add(e);e.title={...e.title,en:e.title.en||enOf(w),zh:w.name,zs:'weibo'}}
  else addedEvents.push({id:`weibo-${dayOf(w)}-${nk(w.name)}`,kind:w.rerun?'story-rerun':'story',title:{en:enOf(w),zh:w.name,zs:'weibo'},start:w.start,end:w.end,featured:[],src:'weibo'});
}
for(const w of weibo.events.filter(w=>['chronicle','special','recharge','login'].includes(w.type))){
  const e=matchEv(w,w.type==='chronicle'?['wheel','special','skin']:['special','skin']);
  if(e){used.add(e);e.title={...e.title,en:e.title.en||enOf(w),zh:w.name,zs:'weibo'}}
  else addedEvents.push({id:`weibo-${dayOf(w)}-${nk(w.name)}`,kind:w.type==='chronicle'?'chronicle':'special',title:{en:enOf(w),zh:w.name,zs:'weibo'},start:w.start,end:w.end,featured:[],src:'weibo'});
}
// banners: official pair / pool names
for(const b of [...mergedBanners]){
  const cand=weibo.events.filter(w=>dayOf(w)===dayOf(b));
  if(b.type==='awaken'){const w=cand.find(x=>x.type==='banner-pair');if(w)b.title={...b.title,zh:w.name,zs:'weibo'}}
  else if(['premium','combo','selector','daily'].includes(b.type)&&b.title.zs!=='game'){
    const pools=cand.filter(x=>x.type==='pool');const sameKind=mergedBanners.filter(x=>dayOf(x)===dayOf(b)&&['premium','combo','selector','daily'].includes(x.type)&&x.title.zs!=='game');
    if(pools.length===1&&sameKind.length===1)b.title={...b.title,zh:pools[0].name,zs:'weibo'};
  }
}
// generic early rerun banners (before Triune Verdant / Sylvan Omen existed): name them after the launch pool of the Awakener / wheel,
// confirmed by the Weibo banner-pair announcement of the same day when there is one
for(const b of mergedBanners){
  if(b.type!=='rerun'||b.title.zs!=='ai'||!/复刻唤醒/.test(b.title.zh))continue;
  const f=b.featured[0];if(!f?.id)continue;
  const pair=launchPairs.find(p=>b.cat==='sylvan'?p.w===f.id:p.c===f.id);if(!pair)continue;
  const name=b.cat==='sylvan'?pair.wb:pair.cb;if(!name)continue;
  const day=b.start.slice(0,10),pairs=weibo.events.filter(w=>w.type==='banner-pair'&&w.start.slice(0,10)===day).map(w=>w.name);
  const confirmed=pairs.includes(`${pair.cb} / ${pair.wb}`);
  b.title={zh:name,en:poolNames[name]||'',zs:confirmed?'weibo':'game'};
}
// ---------- character events: reclassify reruns by name, attach the Awakener of every event ----------
const finalEvents=[...allEvents,...addedEvents].sort((a,b)=>a.start.localeCompare(b.start));
const seenBase=new Map(),nameChar=new Map();
// base name -> Awakener: from events that already name one, then from the launch banner that starts the same day
for(const e of finalEvents)if(['story','story-rerun'].includes(e.kind)){
  const b=baseName(e.title.zh||e.title.en);
  const f=e.featured.find(x=>x.k==='awakener'&&x.id);if(f&&!nameChar.has(b))nameChar.set(b,f);
}
const launchByDay=new Map();for(const a of appearances)if(!a.r&&a.c){const k=a.s.slice(0,10);(launchByDay.get(k)||launchByDay.set(k,[]).get(k)).push(a)}
for(const e of finalEvents)if(['story','story-rerun'].includes(e.kind)){
  const b=baseName(e.title.zh||e.title.en);
  if(!nameChar.has(b)){
    const day=new Date(Date.parse(e.start)).toISOString().slice(0,10),cands=[...(launchByDay.get(day)||[]),...(launchByDay.get(new Date(Date.parse(e.start)-DAYMS).toISOString().slice(0,10))||[])];
    if(cands.length===1){const c=refZh(cands[0].cz,'awakener');if(c.id)nameChar.set(b,c)}
  }
}
for(const [n,cs] of Object.entries(wikiEv.eventChars||{}))if(cs[0]&&!nameChar.has(n)){const r=refZh(cs[0],'awakener');if(r.id)nameChar.set(n,r)}
const CHAR_OVERRIDE={'万象门扉':'塔薇'};   // launch day coincides with a rotation of all Awakeners, the event belongs to Tawil (Steam: Character Event Reprint: Tawil)
for(const [n,c] of Object.entries(CHAR_OVERRIDE))nameChar.set(n,refZh(c,'awakener'));
for(const e of finalEvents)if(['story','story-rerun'].includes(e.kind)){
  const b=baseName(e.title.zh||e.title.en);
  if(CHAR_OVERRIDE[b])e.featured=[];
  if(seenBase.has(b)&&e.kind==='story'){e.kind='story-rerun'}
  seenBase.set(b,true);
  if(e.kind==='story-rerun'&&e.title.zh&&!/复刻/.test(e.title.zh)&&e.title.zs==='weibo')e.title={...e.title,zh:e.title.zh+'·复刻',en:e.title.en&&!/rerun/.test(e.title.en)?e.title.en+' (rerun)':e.title.en};
  if(!e.featured.some(x=>x.id)&&nameChar.has(b))e.featured=[nameChar.get(b)];
  if(!e.featured.some(x=>x.id)&&e.src==='weibo')e.kind='special';   // gameplay events without a featured Awakener are special events
}
const out={version:1,generatedAt:new Date().toISOString(),sources:{skeydb:'dansa/SKeyDB timeline (banners.json, events.json); dates are game server time UTC+8',morimenz:'Morimenz-kr/Morimens.Info.kr rerun_schedule.json (monthly history, verified periods; Korean server schedule)',summon:'Z769018860/morimens-summon web/catalog.json (zh featured names)',steam:'Steam community announcements (ISteamNews, app 3052450): event schedule 2025-09 onwards',weibo:'Weibo 忘却前夜记录局 announcement posts (official Chinese event / banner names, 2025-12 onwards)',huiji:'morimens.huijiwiki.com 唤醒 (Module:SummonAwkTable data modules; dates before the SKeyDB timeline, other pool types, forecast)'},updatedAtInfoKr:rerun.updated_at,banners:mergedBanners,appearances,launchPairs,forecast,events:finalEvents.slice().sort((a,b)=>b.start.localeCompare(a.start)),history,periods};
await writeFile('data/morimens/game/summon-calendar.json',JSON.stringify(out)+'\n');
console.log('banners',outBanners.length,'+wiki',wikiKeep.length,'forecast',forecast.length,'wiki events',wikiEvents.length,'steam events',steamEvents.length,'weibo added',addedEvents.length,'events',outEvents.length,'history months',history.length,'unresolved:',[...new Set([...outBanners,...outEvents].flatMap(x=>x.featured).filter(f=>!f.id).map(f=>f.en))].join(', ')||'-');
