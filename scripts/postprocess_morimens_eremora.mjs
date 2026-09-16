import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const ROOT='data/morimens/eremora';
const SEASON_DIR=path.join(ROOT,'seasons');
const STATS_DIR=path.join(ROOT,'stats');
const MANIFEST=path.join(ROOT,'manifest.json');
const RANK_CAPS=[50,200,500,1000];
const DIFFICULTIES=['normal','hard','nightmare','madness'];
const DIFFICULTY_ZH={normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
const ENLIGHT_ZH={e3:'最高三启',overlimit:'最高超限',law12:'最高+12法则'};

async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
function keyOf(m){return String(m?.skeydbId||m?.ingameId||m?.id||m?.name||'')}
function difficultyOf(team={}){
  const raw=String(team.difficulty||team.stageName||'').toLowerCase();
  if(/nightmare/.test(raw))return 'nightmare';
  if(/madness/.test(raw))return 'madness';
  if(/hard/.test(raw))return 'hard';
  if(/normal/.test(raw))return 'normal';
  return 'unknown';
}
function enlightTier(member={}){
  const m=String(member.enlightenMilestone||member.progression||'').toUpperCase();
  if(m==='AA')return 'law12';
  if(m==='OE')return 'overlimit';
  return 'e3';
}
function add(map,key,meta={}){if(key==null||key==='')return;const k=String(key),v=map.get(k)||{key:k,count:0,...meta};v.count++;map.set(k,v)}
function flatten(records=[]){
  const rows=[];
  for(const record of records)for(const wave of record.waves||[])for(const team of wave.teams||[])rows.push({record,wave,team});
  return rows;
}
function usage(rows=[]){
  const chars=new Map(),wheels=new Map(),covenants=new Map(),enlight=new Map();let memberSlots=0,wheelSlots=0,covenantSlots=0;
  for(const {team} of rows){
    const seenChars=new Set(),seenWheels=new Set(),seenCov=new Set();
    for(const m of team.members||[]){
      memberSlots++;const ck=keyOf(m);if(ck&&!seenChars.has(ck)){seenChars.add(ck);add(chars,ck,{id:m.skeydbId||null,ingameId:m.ingameId||null,name:m.canonicalName||m.name||ck,image:m.image||null})}
      const et=m.enlightTier||enlightTier(m);add(enlight,et,{name:ENLIGHT_ZH[et]||et});
      for(const w of m.wheels||[]){wheelSlots++;const wk=w.id??w.name;if(wk==null)continue;if(!seenWheels.has(String(wk))){seenWheels.add(String(wk));add(wheels,wk,{id:w.id??null,name:w.name||String(wk),image:w.image||null})}}
      for(const c of m.covenants||((m.covenant)?[m.covenant]:[])){covenantSlots++;const ck2=c.id??c.name;if(ck2==null)continue;if(!seenCov.has(String(ck2))){seenCov.add(String(ck2));add(covenants,ck2,{id:c.id??null,name:c.name||String(ck2),image:c.image||null})}}
    }
  }
  const teamCount=rows.length,finish=map=>[...map.values()].map(x=>({...x,teamRatePct:teamCount?Number((x.count/teamCount*100).toFixed(2)):0})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN'));
  return {teamCount,memberSlots,wheelSlots,covenantSlots,characters:finish(chars),wheels:finish(wheels),covenants:finish(covenants),enlightenment:finish(enlight)};
}
function groupRows(rows,filter){return rows.filter(filter)}
function buildStats(doc){
  const rows=flatten(doc.records||[]),ranks=(doc.records||[]).map(r=>Number(r.rank)).filter(Number.isFinite),maxRank=ranks.length?Math.max(...ranks):0;
  const byWave={};for(const w of [...new Set(rows.map(x=>Number(x.wave.wave)).filter(Number.isFinite))].sort((a,b)=>a-b)){
    const wr=rows.filter(x=>Number(x.wave.wave)===w);byWave[w]={all:usage(wr),clear:usage(wr.filter(x=>x.team.clearType!=='extra')),extra:usage(wr.filter(x=>x.team.clearType==='extra')),difficulties:Object.fromEntries(DIFFICULTIES.map(d=>[d,usage(wr.filter(x=>x.team.difficulty===d))]))};
  }
  const difficulties=Object.fromEntries(DIFFICULTIES.map(d=>[d,usage(rows.filter(x=>x.team.difficulty===d))]));
  const rankTiers=Object.fromEntries(RANK_CAPS.map(cap=>{
    const rr=rows.filter(x=>Number.isFinite(Number(x.record.rank))&&Number(x.record.rank)<=cap);
    return [String(cap),{cap,complete:maxRank>=cap,recordCount:(doc.records||[]).filter(r=>Number.isFinite(Number(r.rank))&&Number(r.rank)<=cap).length,maxRankAvailable:maxRank,all:usage(rr),difficulties:Object.fromEntries(DIFFICULTIES.map(d=>[d,usage(rr.filter(x=>x.team.difficulty===d))]))}];
  }));
  const recognized=rows.filter(x=>DIFFICULTIES.includes(x.team.difficulty)).length;
  return {seasonId:doc.seasonId,generatedAt:new Date().toISOString(),recordCount:doc.records?.length||0,maxRankAvailable:maxRank,all:usage(rows),waves:byWave,difficulties,rankTiers,coverage:{difficulty:{recognizedTeams:recognized,totalTeams:rows.length,complete:rows.length>0&&recognized===rows.length},rankScopes:Object.fromEntries(RANK_CAPS.map(x=>[String(x),maxRank>=x])),enlightenment:true}};
}

const files=(await readdir(SEASON_DIR)).filter(x=>/^\d+\.json$/.test(x));
const coverage=[];
for(const file of files){
  const p=path.join(SEASON_DIR,file),doc=await readJson(p);if(!doc)continue;
  let changed=false;
  for(const record of doc.records||[])for(const wave of record.waves||[])for(const team of wave.teams||[]){
    const difficulty=difficultyOf(team);if(team.difficulty!==difficulty){team.difficulty=difficulty;changed=true}const label=DIFFICULTY_ZH[difficulty];if(team.difficultyLabel!==label){team.difficultyLabel=label;changed=true}
    for(const m of team.members||[]){const tier=enlightTier(m),label2=ENLIGHT_ZH[tier];if(m.enlightTier!==tier){m.enlightTier=tier;changed=true}if(m.enlightTierLabel!==label2){m.enlightTierLabel=label2;changed=true}}
  }
  if(changed)await saveJson(p,doc);
  const stats=buildStats(doc);await saveJson(path.join(STATS_DIR,file),stats);coverage.push({seasonId:doc.seasonId,maxRankAvailable:stats.maxRankAvailable,difficulty:stats.coverage.difficulty,rankScopes:stats.coverage.rankScopes});
}
const manifest=await readJson(MANIFEST,{});manifest.analytics={...(manifest.analytics||{}),generatedAt:new Date().toISOString(),rankScopes:RANK_CAPS,difficulties:DIFFICULTIES.map(id=>({id,label:DIFFICULTY_ZH[id]})),enlightenmentGroups:Object.entries(ENLIGHT_ZH).map(([id,label])=>({id,label})),coverage:coverage.sort((a,b)=>Number(b.seasonId)-Number(a.seasonId))};manifest.fieldCoverage={...(manifest.fieldCoverage||{}),difficulty:coverage.some(x=>x.difficulty?.recognizedTeams>0)};manifest.notes=[...(manifest.notes||[]).filter(x=>!String(x).startsWith('出场率分层：')&&!String(x).startsWith('启灵分组：')),'启灵分组：E0/E1/E2/E3 统一归为“最高三启”，OE 归为“最高超限”，AA 归为“最高+12法则”。','出场率分层：预计算 Top50 / Top200 / Top500 / Top1000 与普通 / 困难 / 噩梦 / 癫狂；只有 maxRankAvailable 达到对应榜单范围时才标记该 Top 口径完整。'];await saveJson(MANIFEST,manifest);
console.log(`Postprocessed ${coverage.length} Eremora seasons: ${coverage.map(x=>`${x.seasonId}#${x.maxRankAvailable}`).join(', ')}`);
