// Read the Steam community announcements of Morimens (app 3052450, public ISteamNews API) and extract the event schedule of
// every version ("V2.x Maintenance Announcement" posts list each event with its start / end in UTC+8).
// Output: data/morimens/steam/events.json (+ the raw post list without bodies). Used by scripts/sync_summon_calendar.mjs.
import {mkdir, writeFile} from 'node:fs/promises';

const URL='https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=3052450&count=500&maxlength=0&format=json';
const r=await fetch(URL,{headers:{'User-Agent':'qdby-chinese-steam-events'}});
if(!r.ok)throw new Error('Steam news HTTP '+r.status);
const items=(await r.json()).appnews.newsitems;
const TAG=/\[\/?(?:p|b|i|u|h\d|url(?:=[^\]]*)?|list|\*|img|strike|spoiler|quote|code|table|tr|td|th|olist|hr)\]/g;
const MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const DATE=/(?:(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d\d))|(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?,?\s*(?:at\s*)?(\d{1,2}):(\d\d)\s*(AM|PM)?)/gi;
const p2=n=>String(n).padStart(2,'0');
function dates(line,postTs){
  const py=new Date(postTs*1000),out=[];
  for(const m of line.matchAll(DATE)){
    let y,mo,d,h,mi;
    if(m[1]){[y,mo,d,h,mi]=[+m[1],+m[2],+m[3],+m[4],+m[5]]}
    else{
      mo=MON.indexOf(m[6].toLowerCase().slice(0,3))+1;d=+m[7];y=m[8]?+m[8]:null;h=+m[9];mi=+m[10];const ap=(m[11]||'').toUpperCase();
      if(ap==='PM'&&h<12)h+=12;if(ap==='AM'&&h===12)h=0;
      if(y==null){y=py.getUTCFullYear();const pm=py.getUTCMonth()+1;if(mo<pm-6)y++;else if(mo>pm+6)y--}
    }
    out.push(`${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}+08:00`);
  }
  return out;
}
const CHAR=/character|awakener event|recurrence|reprint|reenact/i;
const RERUN=/rerun|reprint|reenact|recurrence/i;
const SKIP=/^rerun$|issue \d+|school activity|pre-?purchase|pre-?sale|mythag|curriculum|awakening event|awaken|compensation|pre-?order|selected gift|gift box|chronicle: holiday|dreamscape|update|adjust|fix|optimi/i;
const events=[],seen=new Set();
for(const it of items){
  if(!/Maintenance|Notice|Announcement/i.test(it.title))continue;
  const lines=it.contents.replace(/\[\/p\]/g,'\n').replace(TAG,'\n').split('\n').map(l=>l.trim()).filter(Boolean);
  let head=null,sec=null;const sections=[];
  for(const l of lines){const m=/^\\\[(.+?)\]/.exec(l);if(m){head=m[1].trim();sec={head,lines:[]};sections.push(sec);continue}if(sec)sec.lines.push(l)}
  for(const s of sections){
    if(SKIP.test(s.head)&&!CHAR.test(s.head))continue;
    const dl=s.lines.map(l=>({l,d:dates(l,it.date)})).filter(x=>x.d.length>=2);
    if(!dl.length)continue;
    const [start,end]=dl[0].d;
    const colon=s.head.indexOf(':');const sub=colon>=0?s.head.slice(colon+1).trim():s.head;
    const q=re=>s.lines.map(l=>re.exec(l)).filter(Boolean).map(m=>m[1])[0]||'';
    const gameplay=q(/gameplay event\s+"([^"]+)"/i),anyQuoted=q(/(?:special|costume|phantom \w+|pre-?\w+)?\s*event\s+"([^"]+)"/i);
    let kind,name,featured=[];
    if(CHAR.test(s.head)){kind=RERUN.test(s.head)?'story-rerun':'story';featured=sub.split(/[,&]| and /).map(x=>x.trim().replace(/^"|"$/g,'')).filter(Boolean);name=gameplay||`${sub} event`}
    else if(/phantom|attire|garment|costume|skin/i.test(s.head)){kind='skin';name=sub}
    else{kind='special';name=anyQuoted&&!/trial/i.test(anyQuoted)?anyQuoted:sub}
    const key=`${kind}|${name}|${start}`;if(seen.has(key))continue;seen.add(key);
    events.push({kind,title:name,section:s.head,start,end,featured,post:it.title,postDate:new Date(it.date*1000).toISOString().slice(0,10),url:it.url});
  }
}
events.sort((a,b)=>b.start.localeCompare(a.start));
await mkdir('data/morimens/steam',{recursive:true});
await writeFile('data/morimens/steam/events.json',JSON.stringify({source:'Steam community announcements (ISteamNews GetNewsForApp, app 3052450); times are UTC+8 as stated in the announcements',fetchedAt:new Date().toISOString(),posts:items.map(i=>({title:i.title,date:new Date(i.date*1000).toISOString().slice(0,10),url:i.url})),events},null,1)+'\n');
console.log('posts',items.length,'events',events.length);
