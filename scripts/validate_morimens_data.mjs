import {access, readFile} from 'node:fs/promises';

const AWAKENERS='data/morimens/skeydb/awakeners.json';
const ZH='data/morimens/huiji/zh-CN.json';

const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
const exists=async p=>{try{await access(p);return true}catch{return false}};
const aliases={jenkin:'jenkins',jenkins:'jenkin'};

const db=JSON.parse(await readFile(AWAKENERS,'utf8'));
const zh=JSON.parse(await readFile(ZH,'utf8'));
const records=db.records||[];
const byId=zh.bySkeydbId||{};
const errors=[];
const seenIds=new Set(),seenZhNames=new Map();
const identityIndex=new Map();

for(const rec of records){
  if(!rec?.id){errors.push('SKeyDB record without id');continue}
  if(seenIds.has(rec.id))errors.push(`duplicate SKeyDB id: ${rec.id}`);seenIds.add(rec.id);
  for(const key of [rec.name,rec.slug,rec.assetSlug,...(rec.aliases||[])]){const n=normalize(key);if(n)identityIndex.set(n,rec.id)}
}

if(records.length!==Number(db.count))errors.push(`SKeyDB count mismatch: records=${records.length}, count=${db.count}`);
if(Object.keys(byId).length!==records.length)errors.push(`Huiji map coverage mismatch: ${Object.keys(byId).length}/${records.length}`);

for(const rec of records){
  const wiki=byId[rec.id];
  if(!wiki){errors.push(`missing zh mapping: ${rec.id} ${rec.name}`);continue}
  if(wiki.skeydbId!==rec.id)errors.push(`zh key/id mismatch: key=${rec.id}, value=${wiki.skeydbId}`);
  if(!wiki.name)errors.push(`missing Chinese name: ${rec.id} ${rec.name}`);
  if(!wiki.englishName)errors.push(`missing Wiki English name: ${rec.id} ${rec.name}`);
  const english=normalize(wiki.englishName);
  const canonicalId=identityIndex.get(english)||identityIndex.get(aliases[english]||'');
  if(canonicalId&&canonicalId!==rec.id)errors.push(`English identity mismatch: ${wiki.name} / ${wiki.englishName} -> ${canonicalId}, stored at ${rec.id}`);
  if(wiki.name){const n=normalize(wiki.name);const prior=seenZhNames.get(n);if(prior&&prior!==rec.id)errors.push(`duplicate Chinese name: ${wiki.name} -> ${prior}, ${rec.id}`);else seenZhNames.set(n,rec.id)}
  for(const [kind,p] of Object.entries(rec.assets||{})){
    if(!p)errors.push(`missing ${kind} path: ${rec.id} ${rec.name}`);
    else if(!(await exists(p)))errors.push(`missing ${kind} file: ${rec.id} ${rec.name} -> ${p}`);
  }
}

for(const [id,wiki] of Object.entries(byId)){if(!seenIds.has(id))errors.push(`orphan zh mapping: ${id} ${wiki?.name||''}`)}

if(errors.length){
  console.error(`Morimens validation FAILED (${errors.length} issue${errors.length===1?'':'s'}):`);
  for(const e of errors)console.error(`- ${e}`);
  process.exit(1);
}
console.log(`Morimens validation OK: ${records.length} stable ids, ${Object.keys(byId).length} Chinese mappings, portraits/cards present and identity-consistent.`);
