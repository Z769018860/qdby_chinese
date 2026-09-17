import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'..');
const CATALOG=path.join(ROOT,'data/morimens/skeydb/public-v3/catalogs/wheels.json');
const OUTPUT=path.join(ROOT,'data/morimens/huiji/wheels.zh-CN.json');
const SOURCE='https://morimens.huijiwiki.com/wiki/%E5%91%BD%E8%BD%AE';
const READER=`https://r.jina.ai/${SOURCE}`;
const input=process.argv[2];
const overrides={
  'wheel-0049':'踏过泥泞的玫瑰',
  'wheel-0124':'纯银的初心',
  'wheel-0166':'致群星'
};

const markdown=input
  ?await fs.readFile(path.resolve(input),'utf8')
  :await fetch(READER,{headers:{accept:'text/plain'}}).then(async response=>{
    if(!response.ok)throw new Error(`Huiji reader HTTP ${response.status}`);
    return response.text();
  });
const catalog=JSON.parse(await fs.readFile(CATALOG,'utf8'));
const links=[...markdown.matchAll(/^\[([^\]\n]+)\]\(https:\/\/morimens\.huijiwiki\.com\/(?:wiki\/|index\.php\?title=)[^\n]+/gm)]
  .map(match=>({name:match[1],index:match.index}))
  .filter(item=>/[\u3400-\u9fff]/.test(item.name));

function findChineseName(record){
  if(overrides[record.id])return overrides[record.id];
  const escaped=record.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[’‘]/g,"['’‘]");
  const match=new RegExp(escaped,'i').exec(markdown);
  if(!match)return null;
  return links.filter(link=>link.index<match.index&&match.index-link.index<700).pop()?.name||null;
}

const records=catalog.records.map(record=>({
  skeydbId:record.id,
  englishName:record.name,
  name:findChineseName(record),
  ownerAwakenerId:record.ownerAwakenerId||null,
  sourceUrl:`https://morimens.huijiwiki.com/wiki/${encodeURIComponent(findChineseName(record)||'命轮')}`
}));
const missing=records.filter(record=>!record.name);
if(missing.length)throw new Error(`Missing wheel translations: ${missing.map(x=>`${x.skeydbId}:${x.englishName}`).join(', ')}`);

const output={
  source:{wiki:SOURCE,skeydb:'dansa/SKeyDB public-v3',syncedAt:new Date().toISOString()},
  count:records.length,
  records,
  bySkeydbId:Object.fromEntries(records.map(record=>[record.skeydbId,record])),
  byEnglishName:Object.fromEntries(records.map(record=>[record.englishName,record]))
};
await fs.writeFile(OUTPUT,`${JSON.stringify(output,null,2)}\n`);
console.log(`Wrote ${records.length} wheel translations to ${path.relative(ROOT,OUTPUT)}`);
