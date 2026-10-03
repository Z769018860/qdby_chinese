// Build data/morimens/game/birthdays.json (Awakener birthdays) from the SKeyDB awakener profiles (profile.birthday, e.g. "19-Jul")
// joined to the tier-list image pool (zh names from the Huiji Wiki, portraits).
import {readFile, writeFile} from 'node:fs/promises';
const MON={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const aw=JSON.parse(await readFile('data/morimens/skeydb/awakeners.json','utf8')).records;
const pool=new Map(JSON.parse(await readFile('data/morimens/game/tier-pool.json','utf8')).kinds.awakener.map(x=>[x.id,x]));
const out=[],unknown=[];
for(const a of aw){
  const m=/^(\d{1,2})-(\w{3})/.exec(a.profile?.birthday||'');
  const it=pool.get(a.id);
  if(!m||!MON[m[2]]){unknown.push(a.name);continue}
  out.push({id:a.id,en:a.name.replace(/^"|"$/g,''),zh:it?.zh||'',m:MON[m[2]],d:+m[1],img:it?.img||'',realm:a.realm,rarity:a.rarity});
}
out.sort((x,y)=>x.m-y.m||x.d-y.d||x.en.localeCompare(y.en));
await writeFile('data/morimens/game/birthdays.json',JSON.stringify({source:'SKeyDB awakener profiles (profile.birthday)',unknown,awakeners:out})+'\n');
console.log(out.length,'birthdays; unknown:',unknown.join(', '));
