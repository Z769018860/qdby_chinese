import {access, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const AWAKENERS='data/morimens/skeydb/awakeners.json';
const ZH='data/morimens/huiji/zh-CN.json';
const IDENTITY='data/morimens/huiji/identity.zh-CN.json';
const SOURCE_ASSETS='.skeydb/src/assets';

const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
const exists=async p=>{try{await access(p);return true}catch{return false}};
const digest=b=>createHash('sha256').update(b).digest('hex');
const aliases={jenkin:'jenkins',jenkins:'jenkin'};

const db=JSON.parse(await readFile(AWAKENERS,'utf8'));
const zh=JSON.parse(await readFile(ZH,'utf8'));
const identity=JSON.parse(await readFile(IDENTITY,'utf8'));
const records=db.records||[],byId=zh.bySkeydbId||{};
const identityById=Object.fromEntries((identity.records||[]).map(x=>[x.skeydbId,x]));
const errors=[];
const seenIds=new Set(),seenZhNames=new Map();
const identityIndex=new Map();

for(const rec of records){
  if(!rec?.id){errors.push('SKeyDB record without id');continue}
  if(seenIds.has(rec.id))errors.push(`duplicate SKeyDB id: ${rec.id}`);seenIds.add(rec.id);
  for(const key of [rec.name,rec.slug,rec.assetSlug,...(rec.aliases||[])]){const n=normalize(key);if(n)identityIndex.set(n,rec.id)}
}
if(records.length!==Number(db.count))errors.push(`SKeyDB count mismatch: records=${records.length}, count=${db.count}`);
if(Object.keys(identityById).length!==records.length)errors.push(`static identity coverage mismatch: ${Object.keys(identityById).length}/${records.length}`);
if(Object.keys(byId).length!==records.length)errors.push(`Huiji map coverage mismatch: ${Object.keys(byId).length}/${records.length}`);

for(const rec of records){
  const seed=identityById[rec.id],wiki=byId[rec.id];
  if(!seed){errors.push(`missing static identity: ${rec.id} ${rec.name}`);continue}
  if(normalize(seed.englishName)!==normalize(rec.name)&&!(rec.aliases||[]).some(x=>normalize(x)===normalize(seed.englishName)))errors.push(`static English identity mismatch: ${rec.id} SKeyDB=${rec.name} map=${seed.englishName}`);
  if(!seed.name)errors.push(`missing static Chinese name: ${rec.id} ${rec.name}`);
  if(!wiki){errors.push(`missing zh mapping: ${rec.id} ${rec.name}`);continue}
  if(wiki.skeydbId!==rec.id)errors.push(`zh key/id mismatch: key=${rec.id}, value=${wiki.skeydbId}`);
  if(wiki.name!==seed.name)errors.push(`Chinese identity drift: ${rec.id} static=${seed.name}, snapshot=${wiki.name}`);
  if(normalize(wiki.englishName)!==normalize(seed.englishName))errors.push(`English identity drift: ${rec.id} static=${seed.englishName}, snapshot=${wiki.englishName}`);
  const english=normalize(wiki.englishName),canonicalId=identityIndex.get(english)||identityIndex.get(aliases[english]||'');
  if(canonicalId&&canonicalId!==rec.id)errors.push(`English identity mismatch: ${wiki.name} / ${wiki.englishName} -> ${canonicalId}, stored at ${rec.id}`);
  if(wiki.name){const n=normalize(wiki.name),prior=seenZhNames.get(n);if(prior&&prior!==rec.id)errors.push(`duplicate Chinese name: ${wiki.name} -> ${prior}, ${rec.id}`);else seenZhNames.set(n,rec.id)}

  const file=`${rec.assetSlug}.webp`;
  const expected={portrait:`assets/morimens/portraits/${file}`,card:`assets/morimens/cards/${file}`};
  const upstream={portrait:path.join(SOURCE_ASSETS,'awk-portraits',file),card:path.join(SOURCE_ASSETS,'awk-cards',file)};
  for(const kind of ['portrait','card']){
    const p=rec.assets?.[kind];
    if(p!==expected[kind])errors.push(`wrong ${kind} path: ${rec.id} ${rec.name} -> ${p}; expected ${expected[kind]}`);
    if(!p||!(await exists(p))){errors.push(`missing ${kind} file: ${rec.id} ${rec.name} -> ${p}`);continue}
    if(!(await exists(upstream[kind]))){errors.push(`missing upstream ${kind}: ${rec.id} ${rec.name} -> ${upstream[kind]}`);continue}
    const [localBytes,sourceBytes]=await Promise.all([readFile(p),readFile(upstream[kind])]);
    if(digest(localBytes)!==digest(sourceBytes))errors.push(`art byte mismatch: ${rec.id} ${rec.name} ${kind} is not the SKeyDB ${rec.assetSlug} asset`);
  }
}
for(const [id,wiki] of Object.entries(byId)){if(!seenIds.has(id))errors.push(`orphan zh mapping: ${id} ${wiki?.name||''}`)}

const doresain=records.find(x=>x.id==='awakener-0014'),winkle=records.find(x=>x.id==='awakener-0053');
if(doresain&&winkle){
  if(doresain.assets?.card===winkle.assets?.card||doresain.assets?.portrait===winkle.assets?.portrait)errors.push('Doresain and Winkle share an art path');
  if(await exists(doresain.assets?.card||'')&&await exists(winkle.assets?.card||'')){const [a,b]=await Promise.all([readFile(doresain.assets.card),readFile(winkle.assets.card)]);if(digest(a)===digest(b))errors.push('Doresain and Winkle card art bytes are identical')}
}

if(errors.length){console.error(`Morimens validation FAILED (${errors.length} issue${errors.length===1?'':'s'}):`);for(const e of errors)console.error(`- ${e}`);process.exit(1)}
console.log(`Morimens validation OK: ${records.length} stable ids, ${Object.keys(byId).length} Chinese mappings, local portrait/card bytes match their SKeyDB source assets.`);
