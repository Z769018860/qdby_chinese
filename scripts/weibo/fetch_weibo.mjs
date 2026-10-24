// 抓取微博用户「青灯不弈」全部微博（m.weibo.cn 容器接口，浏览器内同源调用）
// 分页靠 cardlistInfo.since_id 游标，page 参数无效
import fs from 'node:fs';
import path from 'node:path';
import { connect, sleep } from '../../../cdp.mjs';

const PORT = Number(process.env.QD_WB_PORT || 9226);
const WORK = process.env.QD_WORK || path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(WORK, 'raw/weibo_posts.json');
const UID = process.env.QD_WB_UID || '5082872852';
const CONTAINER = '107603' + UID;
const MAX_PAGES = Number(process.env.QD_WB_PAGES || 420);

const c = await connect(PORT);
await c.goto(`https://m.weibo.cn/u/${UID}`, 3500);
console.log('cookies ok:', (await c.ev('document.cookie')).slice(0, 80));

const all = [];
let since = '';
for (let page = 1; page <= MAX_PAGES; page++) {
  const url = `https://m.weibo.cn/api/container/getIndex?type=uid&value=${UID}&containerid=${CONTAINER}${since ? '&since_id=' + encodeURIComponent(since) : ''}`;
  const res = await c.ev(`(async()=>{
    const r=await fetch(${JSON.stringify(url)},{credentials:'include',headers:{'X-Requested-With':'XMLHttpRequest'}});
    if(!r.ok) return {__status:r.status};
    const j=await r.json();
    const d=j.data||{}; const cards=d.cards||[];
    const out=[];
    for(const card of cards){
      if(card.card_type!==9) continue;
      let m=card.mblog; if(!m) continue;
      let text=m.text||'';
      if(m.isLongText && m.longText && m.longText.longTextContent) text=m.longText.longTextContent;
      out.push({
        id: m.id, mid: m.mid, bid: m.bid,
        created: m.created_at, source: m.source || '',
        text: text.replace(/<br\\s*\\/?>/g,'\\n').replace(/<[^>]+>/g,''),
        pics: (m.pics||[]).map(p=>p.large&&p.large.url?p.large.url:(p.url||'')),
        reposts: m.reposts_count, comments: m.comments_count, likes: m.attitudes_count,
        isLong: !!m.isLongText,
        retweeted: m.retweeted_status ? ((m.retweeted_status.text||'').replace(/<[^>]+>/g,'').slice(0,200)) : '',
        hasVideo: !!(m.page_info && m.page_info.type==='video'),
      });
    }
    return {__ok:1, cards:out, since:(d.cardlistInfo&&d.cardlistInfo.since_id)||'', total:(d.cardlistInfo&&d.cardlistInfo.total)||0};
  })()`);
  if (!res || res.__status || !res.__ok) {
    console.log('page', page, 'failed', JSON.stringify(res).slice(0, 100));
    await sleep(5000);
    continue;
  }
  const seen = new Set(all.map((x) => x.id));
  let added = 0;
  for (const x of res.cards) if (!seen.has(x.id)) { all.push(x); added++; }
  console.log(`page ${page} +${res.cards.length}/新${added} total=${res.total} since=${String(res.since).slice(0, 20)}`);
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
  if (!res.since || res.since === since) { console.log('游标到底，停止'); break; }
  since = res.since;
  if (!res.cards.length) break;
  await sleep(1100);
}

fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
console.log('微博合计', all.length, '条 →', OUT);
await c.close();
process.exit(0);
