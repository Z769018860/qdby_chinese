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
// character / wheel / skin events (story events of each character, wheel archives, skins)
const outEvents=events.filter(e=>/^event-(story|skin|wheel|preorder)/.test(e.id)&&!/^event-preorder/.test(e.id)).map(e=>({
  id:e.id,kind:e.id.startsWith('event-story-rerun')?'story-rerun':e.id.startsWith('event-story')?'story':e.id.startsWith('event-skin')?'skin':'wheel',
  title:title(e.title),start:iso(e.startDate),end:iso(e.endDate),featured:featuredList(e.featured).map(f=>ref(f.name,f.kind&&f.kind!=='other'?f.kind:undefined))
}));
// monthly history (Info.kr): chars with the n-th appearance (1 = first release) of that month
const history=rerun.history.map(h=>({month:h.month,chars:h.characters.map(c=>({...charOf(c.id),n:c.appearance}))}));
const periods=Object.fromEntries(Object.entries(rerun.verified_periods).map(([id,p])=>[charOf(id).id||id,{start:p.start_date+(p.start_time?` ${p.start_time}`:''),end:p.end_date+(p.end_time?` ${p.end_time}`:''),tz:p.timezone||'',src:p.source_url||p.source_note||''}]));
const out={version:1,generatedAt:new Date().toISOString(),sources:{skeydb:'dansa/SKeyDB timeline (banners.json, events.json); dates are game server time UTC+8',morimenz:'Morimenz-kr/Morimens.Info.kr rerun_schedule.json (monthly history, verified periods; Korean server schedule)',summon:'Z769018860/morimens-summon web/catalog.json (zh featured names)'},updatedAtInfoKr:rerun.updated_at,banners:outBanners,events:outEvents,history,periods};
await writeFile('data/morimens/game/summon-calendar.json',JSON.stringify(out)+'\n');
console.log('banners',outBanners.length,'events',outEvents.length,'history months',history.length,'unresolved:',[...new Set([...outBanners,...outEvents].flatMap(x=>x.featured).filter(f=>!f.id).map(f=>f.en))].join(', ')||'-');
