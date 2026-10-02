// Build per-season D-Zone monster intent data (skills, action patterns, per-threat-level stats, Chinese names)
// from the Morimenz-kr/Morimens.Info.kr community data (CC BY-NC-SA 4.0), joined to the SKeyDB dzone index.
// MORIMENZ_SOURCE points at a local checkout; otherwise files are fetched from raw.githubusercontent.com.
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

const OWNER='Morimenz-kr', REPO='Morimens.Info.kr', REF='main';
const RAW=`https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}`;
const SOURCE_ROOT=process.env.MORIMENZ_SOURCE||'.morimenz';
const OUT='data/morimens/dzone-info';
const SKEYDB_SEASONS='data/morimens/skeydb/dzone/seasons';
const FILES={67:'dzone_season67.json',68:'dzone_season68.json',69:'dzone_season69.json',70:'dzone_current.json'};
const exists=async f=>{try{await stat(f);return true}catch{return false}};
const local=await exists(path.join(SOURCE_ROOT,'data'));
async function readSource(rel){
  if(local) return JSON.parse(await readFile(path.join(SOURCE_ROOT,rel),'utf8'));
  const r=await fetch(`${RAW}/${rel}`,{headers:{'User-Agent':'qdby-chinese-dzone-intents'}});
  if(!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.json();
}
const cjk=/[一-鿿]/;
const display=a=>a?.value?.display??a?.value?.raw??null;

// only the files this script owns are replaced (huiji-monsters.json is built by parse_huiji_monsters.mjs)
await mkdir(OUT,{recursive:true});
for(const f of await readdir(OUT)) if(/^(\d+|by-monster|index)\.json$/.test(f)) await rm(path.join(OUT,f));
const seasons=[];const docs=[];
for(const [periodStr,file] of Object.entries(FILES)){
  const period=Number(periodStr);
  let src;try{src=await readSource(`data/${file}`)}catch(e){console.warn('skip',period,e.message);continue}
  let sk=null;try{sk=JSON.parse(await readFile(`${SKEYDB_SEASONS}/${period}.json`,'utf8'))}catch{}
  const monsters={};let joined=0,total=0;
  const waves=src.waves.map((w,wi)=>{
    for(const m of w.monsters){
      if(monsters[m.tid]) continue;
      const zh=String(m.nameSource||'').split('|').pop();
      const states=(m.states||[]).filter(s=>s.descriptionTemplate).map(s=>({id:s.id,n:s.name||'',d:s.descriptionTemplate,v:s.visible?1:0}));
      monsters[m.tid]={
        zh:cjk.test(zh)?zh:'',ko:m.nameKo||'',img:String(m.image||'').split('/').pop().replace(/\.\w+$/,''),cls:m.monsterClass||'',desc:m.description||'',
        sk:(m.skills||[]).map(s=>({id:s.id,t:s.type,g:s.target,n:s.hasOfficialName===false?'':s.name,d:s.descriptionTemplate})),
        pat:(m.patterns||[]).map(p=>({id:p.id,s:p.skillIds})),
        st:states,
        cond:(m.conditionalActions||[]).map(c=>({t:c.conditionText||'',e:(c.transitionEffects||[]).map(x=>({y:x.type,n:x.stateName||''}))})),
        ph:(m.phaseTransitions||[]).map(c=>({t:c.conditionText||''}))
      };
    }
    const sw=sk?.waves?.[wi];
    return {
      group:w.stageGroupId,
      alerts:(w.alerts||[]).map((a,ai)=>{
        const sa=sw?.alerts?.[ai];const pool=new Map();
        for(const sm of sa?.monsters||[]){const k=sm.level+':'+sm.hp;if(!pool.has(k))pool.set(k,[]);pool.get(k).push(sm.monsterId)}
        return {
          stage:a.stageId,
          ms:(a.monsters||[]).map(m=>{
            total++;
            const own=monsters[m.tid];const args={};
            for(const [id,r] of Object.entries(m.resolvedSkills||{})){
              const vals=(r.args||[]).map(display);args[id]=vals;
            }
            const key=m.level+':'+m.hp,list=pool.get(key);let skId=null;
            if(list?.length){skId=list.shift();joined++}
            const sa={};
            for(const st of m.resolvedStates||[]){
              const da=(st.descArgs||[]).map(display),sg=(st.stateArgs||[]).map(display),la=display(st.initialLayer);
              if(da.length||sg.length||la!=null)sa[st.id]={...(da.length?{da}:{}),...(sg.length?{sg}:{}),...(la!=null?{la}:{})};
            }
            const out={tid:m.tid,lv:m.level,hp:m.hp,atk:m.attack,def:m.defense,a:args};
            if(Object.keys(sa).length)out.sa=sa;
            if(skId)out.sk=skId;
            if((m.phases||[]).length>1)out.ph=m.phases.map(p=>p.hp);
            return out;
          })
        };
      })
    };
  });
  docs.push({period,monsters,waves});
  await writeFile(path.join(OUT,`${period}.json`),JSON.stringify({period,generatedAt:src.generatedAt,monsters,waves})+'\n');
  seasons.push({period,generatedAt:src.generatedAt,waves:waves.length,monsters:Object.keys(monsters).length});
  console.log(`season ${period}: ${Object.keys(monsters).length} monsters, ${joined}/${total} joined to SKeyDB`);
}
// Static intent data per SKeyDB monster id, taken from the latest season in which the monster was seen, so seasons
// without their own intent data can still show a monster's skills / action pattern (numbers come from the closest level).
const byMonster={};
for(const doc of docs.sort((a,b)=>a.period-b.period)){
  const rows={};
  for(const w of doc.waves)for(const a of w.alerts)for(const m of a.ms)if(m.sk)(rows[m.sk]||(rows[m.sk]=[])).push({tid:m.tid,lv:m.lv,hp:m.hp,atk:m.atk,def:m.def,a:m.a,...(m.sa?{sa:m.sa}:{}),...(m.ph?{ph:m.ph}:{})});
  for(const [sk,list] of Object.entries(rows)){
    const st=doc.monsters[list[0].tid];
    byMonster[sk]={period:doc.period,tid:list[0].tid,...st,rows:list.map(({tid,...r})=>r)};
  }
}
await writeFile(path.join(OUT,'by-monster.json'),JSON.stringify(byMonster)+'\n');
console.log(`by-monster: ${Object.keys(byMonster).length} SKeyDB monsters with intent data`);
// intent icons (game art, same treatment as the SKeyDB assets)
if(local&&await exists(path.join(SOURCE_ROOT,'images/dzone/intent'))){
  await mkdir('assets/morimens/dzone-intent',{recursive:true});
  for(const f of await readdir(path.join(SOURCE_ROOT,'images/dzone/intent'))) if(f.endsWith('.png')) await cp(path.join(SOURCE_ROOT,'images/dzone/intent',f),path.join('assets/morimens/dzone-intent',f));
}
await writeFile(path.join(OUT,'index.json'),JSON.stringify({
  schemaVersion:1,
  source:{repository:`${OWNER}/${REPO}`,ref:REF,syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 (Morimens.Info.kr contributors); game-owned text excluded',language:'ko (skill/state text), zh (monster names)'},
  seasons
})+'\n');
