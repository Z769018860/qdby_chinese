// Parse the Weibo posts of 忘却前夜记录局 (data/morimens/weibo/posts.json, from scripts/weibo_console.js) into official-Chinese
// event / banner names with dates: data/morimens/weibo/events.json. Covers every announcement post that lists "◆ ...「name」" blocks
// with "活动时间 / 唤醒时间: M月D日 HH:MM - M月D日 HH:MM" (post year is used to resolve the year).
import {readFile, writeFile} from 'node:fs/promises';

const posts=JSON.parse(await readFile('data/morimens/weibo/posts.json','utf8')).posts;
const MON={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const pub=s=>{const m=/(\w{3}) (\w{3}) (\d+) [\d:]+ \+0800 (\d{4})/.exec(s);return {y:+m[4],mo:MON[m[2]],d:+m[3]}};
const p2=n=>String(n).padStart(2,'0');
const TIME=/(?:活动时间|唤醒时间|开启时间)[：:]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d\d)\s*[-~至—]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d\d)/;
const TYPES=[['限时玩法活动','gameplay'],['限时纪行活动','chronicle'],['限时累充活动','recharge'],['限时签到活动','login'],['限时活动唤醒','pool'],['限时活动','special'],['唤醒活动','pool']];
const out=[],seen=new Set();
for(const post of posts){
  const text=post.text.replace(/&amp;/g,'&'),pd=pub(post.created);
  for(const blk of text.split('◆').slice(1)){
    const head=blk.trim().split('\n')[0].trim();
    const tm=TIME.exec(blk);if(!tm)continue;
    let sy=tm[1]?+tm[1]:pd.y;const sm=+tm[2];
    if(!tm[1]){if(sm<pd.mo-6)sy++;else if(sm>pd.mo+6)sy--}
    let ey=tm[6]?+tm[6]:sy;if(!tm[6]&&(+tm[7]<sm||(+tm[7]===sm&&+tm[8]<+tm[3])))ey++;
    const start=`${sy}-${p2(sm)}-${p2(tm[3])}T${p2(tm[4])}:${tm[5]}+08:00`,end=`${ey}-${p2(tm[7])}-${p2(tm[8])}T${p2(tm[9])}:${tm[10]}+08:00`;
    let e=null;
    let m;
    if((m=/^角色活动唤醒「(.+?)」\s*&\s*命轮活动唤醒「(.+?)」/.exec(head)))e={type:'banner-pair',name:`${m[1]} / ${m[2]}`,names:[m[1],m[2]]};
    else if(/^「三相衡生」角色活动唤醒/.test(head))e={type:'triune',name:'三相衡生 / 因果苗圃'};
    else if(/角色试玩|课题记录|联动特别邀约/.test(head))continue;
    else{
      for(const [label,type] of TYPES){
        const r=new RegExp('^'+label+'「(.+?)」\\s*·?\\s*(复刻|轻量复刻)?').exec(head);
        if(r){e={type,name:r[1].trim()+(/·\s*(\S+)/.exec(head.slice(head.indexOf('」')))?.[1]?'·'+/·\s*(\S+)/.exec(head.slice(head.indexOf('」')))[1]:''),rerun:/复刻/.test(head)};break}
      }
    }
    if(!e)continue;
    const key=`${e.type}|${e.name}|${start}`;if(seen.has(key))continue;seen.add(key);
    out.push({...e,start,end,post:post.created,id:post.id});
  }
}
out.sort((a,b)=>b.start.localeCompare(a.start));
await writeFile('data/morimens/weibo/events.json',JSON.stringify({source:'Weibo 忘却前夜记录局 (https://weibo.com/u/7899814735) announcement posts',events:out},null,1)+'\n');
console.log('events',out.length,'range',out[out.length-1]?.start.slice(0,10),out[0]?.start.slice(0,10));
