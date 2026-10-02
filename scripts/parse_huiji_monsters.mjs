// Parse data/morimens/huiji/monsters.json (raw wikitext from the HuijiWiki API) into compact per-monster records:
// data/morimens/dzone-info/huiji-monsters.json  (CC BY-NC-SA, HuijiWiki community content)
import {readFile, writeFile} from 'node:fs/promises';
const src=JSON.parse(await readFile('data/morimens/huiji/monsters.json','utf8'));
const clean=s=>String(s||'')
  .replace(/<!--[\s\S]*?-->/g,'')
  .replace(/\{\{词条\|([^}|]*)(?:\|[^}]*)?\}\}/g,'$1')
  .replace(/\{\{PAGENAME\}\}/g,'')
  .replace(/\[\[(?:文件|File):[^\]]*\]\]/gi,'')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1')
  .replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')
  .replace(/'''?/g,'').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
export const norm=s=>String(s).replace(/[「」『』\s]/g,'');
function fields(w){
  const body=w.replace(/<!--[\s\S]*?-->/g,'');
  const start=body.indexOf('{{怪物');if(start<0)return null;
  let depth=0,i=start,end=-1;
  for(;i<body.length-1;i++){
    if(body[i]==='{'&&body[i+1]==='{'){depth++;i++}
    else if(body[i]==='}'&&body[i+1]==='}'){depth--;i++;if(depth===0){end=i-1;break}}
  }
  if(end<0)return null;
  const inner=body.slice(start+4,end);
  const f={};
  // split on "|key=" at template depth 1 only (ignore pipes inside nested {{ }} / [[ ]])
  let d=0,cur='',parts=[];
  for(let k=0;k<inner.length;k++){
    const two=inner.slice(k,k+2);
    if(two==='{{'||two==='[['){d++;cur+=two;k++;continue}
    if(two==='}}'||two===']]'){d--;cur+=two;k++;continue}
    if(inner[k]==='|'&&d===0){parts.push(cur);cur='';continue}
    cur+=inner[k];
  }
  parts.push(cur);
  for(const part of parts){const e=part.indexOf('=');if(e<0)continue;f[part.slice(0,e).trim()]=part.slice(e+1).trim()}
  return f;
}
const out={};let withSkills=0,withDesc=0;
for(const r of src.records){
  const f=fields(r.wikitext);if(!f)continue;
  const rec={};
  const desc=clean(f['描述']);if(desc)rec.desc=desc;
  if(clean(f['种类']))rec.kind=clean(f['种类']);
  if(clean(f['地位']))rec.rank=clean(f['地位']);
  const traits=[];
  for(const k of Object.keys(f)){
    const m=/^特性名称(\d*)$/.exec(k);if(!m)continue;
    const n=clean(f[k]),d=clean(f['特性'+m[1]]);
    if(n&&n!=='无')traits.push({n,d});
  }
  if(traits.length)rec.traits=traits;
  const skills=[];
  for(const k of Object.keys(f)){
    const m=/^技能名称(\d*)$/.exec(k);if(!m)continue;
    const n=clean(f[k]),e=clean(f['效果'+m[1]]);
    if(n||e)skills.push({n,e});
  }
  if(skills.length){rec.skills=skills;withSkills++}
  const pattern=clean(f['出招']);if(pattern)rec.pattern=pattern;
  const note=clean(f['注意']);if(note)rec.note=note;
  if(Object.keys(rec).length){out[norm(r.title)]={title:r.title,...rec};if(rec.desc)withDesc++}
}
await writeFile('data/morimens/dzone-info/huiji-monsters.json',JSON.stringify({source:{site:'https://morimens.huijiwiki.com/',license:'CC BY-NC-SA (HuijiWiki community content)',retrievedAt:src.source?.retrievedAt||null},monsters:out})+'\n');
console.log(`huiji monsters: ${Object.keys(out).length} records, ${withDesc} descriptions, ${withSkills} with skills`);
