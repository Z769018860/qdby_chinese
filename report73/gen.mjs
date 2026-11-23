// Generate the Season 73 特刊 (6 spreads, 1000x1800 CSS px each) from report73/report.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'report73/pages');
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'report73/report.json'), 'utf8'));
const cur = data.current, prev = data.previous;

// awakener name -> portrait image, wheel name -> icon
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/morimens/game/tier-pool.json'), 'utf8')).kinds;
const awImg = new Map(pool.awakener.map(x => [x.en, x.img]));
const wheelImg = new Map(pool.wheel.map(x => [x.en, x.img]));
const relicImg = new Map(pool.relic.map(x => [x.en, x.img]));
const tokenImg = new Map(pool.posse.map(x => [x.en, x.img]));
const imgPath = p => p ? path.join(ROOT, p).replace(/\\/g, '/') : '';

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const n0 = v => Number(v ?? 0).toLocaleString('en-US');
const pct = v => (Math.round(v * 10) / 10).toFixed(1);
const WAVE_NAME = { 1: '第一禁区', 2: '第二禁区', 3: '第三禁区', 4: '第四禁区', 5: '第五禁区' };

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1000px;height:1800px;overflow:hidden}
body{background:#f5efdf;color:#2b2118;font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  -webkit-font-smoothing:antialiased}
.page{position:relative;width:1000px;height:1800px;padding:26px 34px 20px;}
.serif{font-family:"Source Han Serif SC","Noto Serif SC","SimSun",serif}
.head{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#5d4b34;
  border-bottom:1px solid #b9a884;padding-bottom:7px;letter-spacing:.5px}
.head b{font-weight:700;color:#3c2c1c}
.mast{margin:14px 0 0;text-align:center}
.mast .latin{font-size:11.5px;letter-spacing:3.6px;color:#7c6444}
.mast h1{font-family:"Source Han Serif SC","SimSun",serif;font-size:74px;font-weight:900;letter-spacing:8px;
  line-height:1.05;color:#211a12;margin-top:2px;text-shadow:0 1px 0 #fff}
.mast .rule{height:3px;background:#3c2c1c;margin:9px 62px 6px;position:relative}
.mast .rule:after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:1px;background:#3c2c1c}
.kicker{font-size:14px;letter-spacing:1px;color:#4b3a28;padding:7px 0 0}
h2.lead{font-family:"Source Han Serif SC","SimSun",serif;font-size:44px;line-height:1.22;font-weight:900;
  color:#a1281b;text-align:center;margin:24px 0 10px;letter-spacing:1px}
h2.lead small{display:block;font-size:44px}
.sub{text-align:center;font-size:13px;color:#4c3b29;line-height:1.6;margin-bottom:16px}
.sub b{color:#a1281b}
.hr{height:1px;background:#c3b393;margin:12px 0}
.hr2{height:2px;background:#3c2c1c;margin:10px 0 8px}
.grid-stats{display:grid;grid-template-columns:repeat(6,1fr);border-top:2px solid #3c2c1c;border-bottom:2px solid #3c2c1c}
.stat{padding:10px 8px;text-align:center;border-right:1px solid #c3b393}
.stat:last-child{border-right:0}
.stat span{display:block;font-size:10.5px;color:#6a5740;letter-spacing:.5px;margin-bottom:3px}
.stat b{font-size:26px;font-weight:800;font-family:"Source Han Serif SC","SimSun",serif}
.stat.hot b{color:#a1281b}
.stat i{display:block;font-size:10px;color:#8b765c;font-style:normal}
.cols3{display:grid;grid-template-columns:1.05fr .95fr 1fr;gap:0}
.col{padding:0 12px}
.col+.col{border-left:1px solid #c3b393}
.h{font-size:15px;font-weight:800;letter-spacing:.6px;margin-bottom:8px;border-bottom:2px solid #3c2c1c;
  padding-bottom:4px;display:flex;justify-content:space-between;align-items:flex-end}
.h em{font-style:normal;font-size:10px;color:#7b6750;font-weight:400}
.bars{display:flex;align-items:flex-end;gap:2.5px;height:272px;padding-top:8px}
.bars .b{flex:1;background:#2c2318;position:relative;min-height:1px}
.bars .b i{position:absolute;left:0;right:0;bottom:-14px;font-style:normal;font-size:7.5px;color:#6f5c45;
  text-align:center;transform:rotate(-90deg);transform-origin:center}
.bars .b em{position:absolute;top:-11px;left:50%;transform:translateX(-50%);font-style:normal;font-size:7.5px;color:#4b3a28}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th,td{padding:4px 3px;text-align:right;border-bottom:1px solid #d8ccb4}
th:first-child,td:first-child{text-align:left}
thead th{font-size:10.5px;color:#6a5740;font-weight:600;background:#eee5d2}
.ladder td:nth-child(2){width:70px}
.ladder .track{height:9px;background:#e6dcc6;position:relative;border-radius:1px}
.ladder .track b{position:absolute;left:0;top:0;bottom:0;background:#3a2c1d}
.ladder td.n{font-weight:700;font-size:11px;white-space:nowrap}
.hall{font-size:12px}
.hall td{none}
.hall .item{display:flex;justify-content:space-between;padding:3.5px 0;border-bottom:1px dotted #cfc0a4;font-size:11.5px}
.hall .item b{color:#a1281b}
.zone{margin-top:4px}
.zonerow{display:grid;grid-template-columns:64px 150px 1fr 210px;align-items:center;gap:8px;
  padding:5px 0;border-bottom:1px solid #ddd0b6;font-size:11px}
.zonerow .nm{font-weight:800;font-size:12.5px}
.zonerow .num b{color:#a1281b;font-size:13px}
.zonerow .track{height:14px;background:#e9dfc8;display:flex;overflow:hidden}
.zonerow .track i{display:block;height:100%}
.zonerow .legend{font-size:9.5px;color:#6a5740;display:flex;gap:7px;justify-content:flex-end}
.tag{display:inline-block;padding:0 4px;border-radius:2px;font-size:9px;color:#fff;margin-right:2px}
.two{display:grid;grid-template-columns:1.35fr 1fr;gap:18px}
.note{font-size:9.5px;color:#6d5a43;line-height:1.55;margin-top:6px}
.foot{position:absolute;left:34px;right:34px;bottom:14px;border-top:1px solid #b9a884;padding-top:6px;
  font-size:9px;color:#6d5a43;line-height:1.5}
.obs{font-size:12px;line-height:1.85}
.obs li{margin-left:15px;margin-bottom:2px}
.obs b{color:#a1281b}
.guide{font-size:11.5px;line-height:1.75}
.guide div{margin-bottom:3px}
.guide b{color:#3c2c1c}
/* spread 2 */
.zblock{border:1px solid #c3b393;margin-bottom:9px;background:#f8f3e6}
.zblock .zt{display:flex;align-items:center;gap:10px;padding:5px 10px;background:#ece2cc;border-bottom:1px solid #c3b393}
.zblock .zt h3{font-family:"Source Han Serif SC","SimSun",serif;font-size:19px;color:#a1281b;font-weight:900}
.zblock .zt span{font-size:10.5px;color:#5f4c36}
.zbody{display:grid;grid-template-columns:1.35fr 1.2fr 1.25fr .95fr .95fr;gap:9px;padding:7px 9px}
.zbody .ttl{font-size:10.5px;font-weight:700;color:#4b3a28;margin-bottom:4px;border-bottom:1px solid #d6c8ac;padding-bottom:2px}
.mem{display:flex;gap:3px}
.mem .m{text-align:center;width:38px}
.mem .m img{width:36px;height:36px;border-radius:3px;object-fit:cover;border:1px solid #b7a685;background:#ddd}
.mem .m small{display:block;font-size:7.5px;line-height:1.15;color:#3a2c1d;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mem .m u{display:block;font-size:7px;color:#8a6a3a;text-decoration:none}
.hotline{display:flex;align-items:center;gap:5px;margin-bottom:3px;font-size:10px}
.hotline .rk{width:12px;font-weight:800;color:#a1281b}
.hotline .cnt{font-size:9px;color:#5f4c36;white-space:nowrap}
.mini{font-size:9.5px;line-height:1.5;color:#3a2c1d}
.mini b{color:#a1281b}
.rank1{font-size:10px;line-height:1.45}
.rank1 li{list-style:none;display:flex;justify-content:space-between;gap:4px;padding:1.5px 0;border-bottom:1px dotted #d3c4a6}
.rank1 li span:last-child{color:#a1281b;font-weight:700}
/* spread 3/4 */
.recs{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
.rec{padding:9px 12px;border-right:1px solid #c3b393;border-bottom:1px solid #c3b393}
.rec:nth-child(3n){border-right:0}
.rec .k{font-size:11px;color:#6a5740;letter-spacing:.4px}
.rec .v{font-family:"Source Han Serif SC","SimSun",serif;font-size:29px;font-weight:900;color:#a1281b;line-height:1.15}
.rec .d{font-size:10px;color:#4b3a28;line-height:1.45}
.rec .mem{margin-top:4px}
.tbl-people td{font-size:10.5px}
.ftbl th,.ftbl td{font-size:10.5px;padding:3.5px 3px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rankbox .h{margin-bottom:6px}
.rankrow{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px dotted #d3c4a6;font-size:11px}
.rankrow .p{width:16px;font-weight:800;color:#a1281b;font-size:11px}
.rankrow .n{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rankrow .track{width:92px;height:10px;background:#e9dfc8;position:relative}
.rankrow .track b{position:absolute;left:0;top:0;bottom:0;background:#2c2318}
.rankrow .v{width:48px;text-align:right;font-weight:700;font-size:10.5px}
.rankrow .v em{font-style:normal;font-size:8.5px;color:#8a7458}
/* enlight */
.enl{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
.enlrow{display:grid;grid-template-columns:18px 132px 1fr 44px;align-items:center;gap:5px;font-size:10.5px;padding:2.6px 0;
  border-bottom:1px dotted #d6c8ac}
.enlrow .p{font-weight:800;color:#a1281b;text-align:right}
.enlrow .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.enlrow .nm em{font-style:normal;color:#8a7458;font-size:9px}
.enlrow .track{display:flex;height:12px;background:#e9dfc8;overflow:hidden}
.enlrow .track i{display:block;height:100%}
.enlrow .pc{text-align:right;font-weight:700}
.enl1 .enlrow{grid-template-columns:20px 146px 1fr 66px 46px;gap:6px;font-size:10.6px;padding:1.9px 0}
.enl1 .enlrow .track{height:12.5px}
.enl1 .enlrow .pc{font-size:11.5px}
.enl1 .enlrow .nn{text-align:right;font-size:9.5px;color:#7b6750}
.ovw{margin-bottom:10px}
.ovwbar{display:flex;height:38px;border:1.5px solid #3c2c1c;background:#e9dfc8}
.ovwbar i{display:flex;align-items:center;justify-content:center;color:#fff;font-style:normal;
  font-size:11px;font-weight:700;letter-spacing:.5px;overflow:hidden}
.ovwnums{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1.5px solid #3c2c1c}
.ovwnums div{text-align:center;padding:5px 2px;border-right:1px dotted #c3b393}
.ovwnums div:last-child{border-right:0}
.ovwnums b{display:block;font-size:15px;font-family:"Source Han Serif SC","SimSun",serif}
.ovwnums span{font-size:9.5px;color:#6a5740}
.zavg{display:grid;grid-template-columns:74px 1fr 62px;align-items:center;gap:7px;font-size:11px;
  padding:4px 0;border-bottom:1px dotted #d3c4a6}
.zavg .track{height:13px;background:#e9dfc8;position:relative}
.zavg .track b{position:absolute;left:0;top:0;bottom:0;background:#2c2318}
.zavg .track i{position:absolute;top:-2px;bottom:-2px;width:1px;background:#a1281b}
.zavg .v{text-align:right;font-weight:700;font-size:11.5px}
.zavg .v em{font-style:normal;font-size:9px;color:#8a7458}
.zavg.zv2{grid-template-columns:74px 1fr 122px;padding:5.5px 0}
.thcmp{margin-top:4px}
.thcmp .row{display:grid;grid-template-columns:38px 1fr 74px;align-items:center;gap:6px;font-size:11px;margin-bottom:5px}
.thcmp .bar{display:flex;height:15px;background:#e9dfc8}
.thcmp .bar i{display:block;height:100%}
.thcmp .row>span:first-child{font-weight:800;color:#a1281b;font-size:12px}
.thcmp .row>span:last-child{text-align:right;font-size:10.5px;color:#4b3a28}
/* compare */
.cmp{display:grid;grid-template-columns:repeat(6,1fr);border-top:2px solid #3c2c1c;border-bottom:2px solid #3c2c1c}
.cmp .c{padding:8px 6px;text-align:center;border-right:1px solid #c3b393}
.cmp .c:last-child{border-right:0}
.cmp .c span{display:block;font-size:10px;color:#6a5740}
.cmp .c b{display:block;font-size:15px;font-weight:800;font-family:"Source Han Serif SC","SimSun",serif;line-height:1.5}
.cmp .c b u{text-decoration:none;color:#2c2318}
.cmp .c b s{text-decoration:none;color:#a1281b}
.cmp .c i{font-style:normal;font-size:9.5px;color:#7b6750}
.up{color:#a1281b}.down{color:#3d6b46}
.hz{display:grid;grid-template-columns:150px 1fr 70px;align-items:center;gap:6px;font-size:11px;padding:3.5px 0;
  border-bottom:1px solid #ddd0b6}
.hz .track{height:13px;display:flex;align-items:center;gap:2px}
.hz .bar{height:11px;background:#3d6b46}
.hz .bar2{height:11px;background:#a1281b}
.close{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:2px solid #3c2c1c;margin-top:12px}
.close>div{padding:8px 12px;border-right:1px solid #c3b393}
.close>div:last-child{border-right:0}
.close .k{font-size:10.5px;color:#6a5740;letter-spacing:.3px}
.close .v{font-size:17px;font-family:"Source Han Serif SC","SimSun",serif;font-weight:900;line-height:1.35}
.close .v b{color:#a1281b}
.close .d{font-size:9.6px;color:#4b3a28;line-height:1.55;margin-top:3px}
`;

function head(spread, total, stamp) {
  return `<div class="head"><div>忘忘看报 · 融灾特刊</div><div>第 ${spread} 版 / 共 ${total} 版</div><div>熔铸快讯 ${stamp}（北京时间）</div></div>`;
}

function mast(kicker) {
  return `<div class="mast"><div class="latin">T H E &nbsp; M O R I M E N S &nbsp; D A I L Y &nbsp; · &nbsp; D I S S O L U T E D &nbsp; A B Y S S &nbsp; S P E C I A L</div>
  <h1>忘忘看报</h1><div class="rule"></div><div class="kicker">${kicker}</div></div>`;
}

const stamp = '2026-11-23 09:18';
const kicker = '融灾第 73 期 ·「超维戒指」· 2026 年 11 月 9 日 — 11 月 22 日 · 终核特刊';

// ---------------------------------------------------------------- spread 1
const distEntries = Object.entries(cur.dist).map(([k, v]) => [Number(k), v]).sort((a, b) => b[0] - a[0]);
const buckets = [];
for (let hi = 525; hi >= 385; hi -= 10) {
  const n = distEntries.filter(([s]) => s > hi - 10 && s <= hi).reduce((a, [, v]) => a + v, 0);
  buckets.push([hi, n]);
}
const maxBucket = Math.max(...buckets.map(b => b[1]));
const ladderSteps = [525, 510, 500, 490, 480, 470, 460, 450, 425, 400];
const ladderMax = cur.count;
const zoneColors = { '▼': '#2c2318', SSS: '#7a5a3a', SS: '#a08a63', S: '#b8a586', A: '#c9bb9e', B: '#dad0b8', C: '#e8e0cc' };

const zoneFullDown = { 1: 95, 2: 100, 3: 105, 4: 110, 5: 115 };
const zrow = z => `<div class="zavg zv2"><span>${z.name}</span>
  <span class="track"><b style="width:${z.downFull / z.down * 100}%"></b></span>
  <span class="v">${z.downFull} / ${z.down}<em> · ${pct(z.downFull / z.down * 100)}%</em></span></div>`;

const s1 = `<div class="page">${head(1, 6, stamp)}${mast(kicker)}
<h2 class="lead">8 人登顶 525 满分，<br><small>611 位玩家站上 450 分线</small></h2>
<div class="sub">本刊统计终极 Top 2000（上榜门槛 <b>385</b> 分）：<b>36</b> 人 ≥500 分，<b>611</b> 人 ≥450 分，满分 525 仅 <b>8</b> 人，占统计样本的 0.4%。</div>
<div class="grid-stats">
  <div class="stat"><span>上榜门槛 · 第 2000 名</span><b>385</b><i>分</i></div>
  <div class="stat"><span>统计样本 · Top</span><b>2,000</b></div>
  <div class="stat hot"><span>525 满分</span><b>8</b></div>
  <div class="stat"><span>≥ 500 分</span><b>36</b></div>
  <div class="stat"><span>≥ 450 分</span><b>611</b></div>
  <div class="stat"><span>平均 / 中位</span><b>422 / 415</b></div>
</div>
<div class="cols3" style="margin-top:16px">
  <div class="col"><div class="h">分数分布 <em>每 10 分一档，共 2,000 人</em></div>
    <div class="bars">${buckets.map(([hi, n]) => `<div class="b" style="height:${Math.max(1, n / maxBucket * 150)}px"><em>${n}</em><i>${hi}</i></div>`).join('')}</div>
  </div>
  <div class="col"><div class="h">分数阶梯 <em>累计人数</em></div>
    <table class="ladder">${ladderSteps.map(t => {
      const n = distEntries.filter(([s]) => s >= t).reduce((a, [, v]) => a + v, 0);
      return `<tr><td class="n">≥ ${t}</td><td><div class="track"><b style="width:${n / ladderMax * 100}%"></b></div></td><td class="n">${n0(n)} 人</td></tr>`;
    }).join('')}</table>
  </div>
  <div class="col"><div class="h">排名分数线 <em>各名次对应分数</em></div>
    <table>${cur.lines.map(l => `<tr><td>第 ${n0(l.rank)} 名</td><td style="font-weight:700">${l.score}</td></tr>`).join('')}</table>
    <div class="h" style="margin-top:10px">525 名人堂 <em>${cur.perfect.length} 人</em></div>
    <div class="hall">${cur.perfect.map((p, i) => `<div class="item"><span><b>${i + 1}</b> ${esc(p.name)}</span><span>#${p.rank}</span></div>`).join('')}</div>
  </div>
</div>
<div class="hr2" style="margin-top:14px"></div>
<div class="h">各禁区通关难度分布 <em>Top 2000 · 每名玩家在各自禁区留下的最好难度</em></div>
<div class="zone">${cur.zones.map(z => {
  const total = Object.values(z.threats).reduce((a, b) => a + b, 0);
  const seg = ['▼', 'SSS', 'SS', 'S', 'A', 'B', 'C'].map(t => z.threats[t] / total * 100);
  return `<div class="zonerow">
    <div class="nm">${z.name}</div>
    <div class="num">▼ 通关 <b>${z.down}</b> 人<br><em style="font-style:normal;font-size:9.5px;color:#7b6750">占该区 ${pct(z.downRate)}%</em></div>
    <div class="track">${seg.map((w, i) => `<i style="width:${w}%;background:${zoneColors[['▼', 'SSS', 'SS', 'S', 'A', 'B', 'C'][i]]}"></i>`).join('')}</div>
    <div class="legend"><span>SSS ${z.threats.SSS}</span><span>SS ${z.threats.SS}</span><span>S ${z.threats.S}</span><span>best ${z.best}</span></div>
  </div>`;
}).join('')}</div>
<div class="two" style="margin-top:16px">
  <div><div class="h">头版观察</div><ul class="obs">
    <li>满分 525 只有 <b>8</b> 人，五个禁区全取 ▼ 通关（95+100+105+110+115），是本期唯一的完美解法。</li>
    <li><b>450 分</b>是本期最明显的一道分水岭：611 人站上，占总样本 30.6%；从 460 到 450 一口气挤进 337 人。</li>
    <li>第三禁区是全局的「送分区」：<b>667</b> 人拿下 ▼，通关率 33.5%，是第二禁区（48 人）的 13.9 倍。</li>
    <li>第四、第五禁区的 ▼ 最难：各只有 <b>36</b> 人，通关率 1.8%，且最快也要 11 / 16 回合。</li>
    <li>整体节奏明显变快：▼ + SSS 战斗平均 <b>${cur.avgRounds.hard}</b> 回合就结束，比上期少 ${(prev.avgRounds.hard - cur.avgRounds.hard).toFixed(2)} 回合；最快的 ▼ 通关只要 <b>4</b> 回合（第一禁区）。</li>
  </ul></div>
  <div><div class="h">读报指南</div><div class="guide">
    <div><b>第 2 版</b> · 各禁区的配队榜——冠军配队、最热门配队、最快通关、出场与常用造物。</div>
    <div><b>第 3 版</b> · 数据之最——单回合最高伤害、单场总伤害、死扛之王，以及命轮、密契、造物与钥令出场榜。</div>
    <div><b>第 4 版</b> · 小众数据——▼ 零出场、神秘配队、最长鏖战与平均死扛。</div>
    <div><b>第 5 版</b> · 启灵特刊——▼ 与 SSS 难度下各唤醒体的启灵分布。</div>
    <div><b>第 6 版</b> · 对比特刊——第 73 期与第 72 期的全部主指标对照。</div>
  </div></div>
</div>
<div class="hr2" style="margin-top:14px"></div>
<div class="h">▼ 通关的两张脸 <em>该区 ▼ 通关队里「打满」的人数与比例 · 各区满分 95/100/105/110/115</em></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 26px">
  <div>${cur.zones.slice(0, 3).map(z => zrow(z)).join('')}</div>
  <div>${cur.zones.slice(3).map(z => zrow(z)).join('')}</div>
</div>
<div class="note" style="margin-top:8px;font-size:9.6px;line-height:1.6">
  525 满分要求五个禁区<b style="color:#a1281b">全部打满</b>（95+100+105+110+115）；而 ▼ 只要拿到各区最低档（90/95/100/105/110）就算通关，两者之间往往只差 5 分。
  于是 ▼ 通关队天然分成「打满」和「擦线」两类：第四、第五禁区能过的人里近三成打满，第一、第三这两个送分区却只有一成出头——人多的地方，大家只求过线。
</div>
<div class="foot">数据来源：官方 Rank.QueryRank / Facade.QueryFacadeFields 接口抓取（season_83326，2026-11-23 09:18 快照，团队明细截至 09:41）；唤醒体 / 命轮 / 造物 / 钥令中文名参考 SKeyDB、灰机维基与官方公告。统计口径：每名玩家在五个禁区各自的队伍记录合并计算，同阵容（不计站位）计一次。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 2
function memChips(members, n = 4) {
  return `<div class="mem">${members.slice(0, n).map(m => {
    const img = imgPath(awImg.get(m.en));
    return `<div class="m">${img ? `<img src="file:///${img}">` : '<div style="width:36px;height:36px;background:#ddd"></div>'}
      <small>${esc(m.zh)}</small><u>${m.potency != null ? '+' + m.potency : ''}</u></div>`;
  }).join('')}</div>`;
}
const tokenZh = new Map();
for (const z of cur.zoneTop) tokenZh.set(z.champion.token, '');
const tokenName = (id) => {
  const hit = cur.top.tokens.find(t => t.id === id);
  return hit ? hit.zh : (cur.tokenTable?.[id] || '');
};

const s2 = `<div class="page">${head(2, 6, stamp)}${mast(kicker)}
<h2 class="lead">五大禁区，五种打法：<br><small>谁是 ▼ 难度的通关密码？</small></h2>
<div class="sub">统计各禁区「通关队伍」中达成最高难度（▼）的队伍：第一禁区 ${cur.zones[0].down} 队、第二禁区 ${cur.zones[1].down} 队、第三禁区 ${cur.zones[2].down} 队、第四禁区 ${cur.zones[3].down} 队、第五禁区 ${cur.zones[4].down} 队。同阵容（不计站位）合并计数，「出场」为该禁区全部队伍中的占比。</div>
${cur.zoneTop.map(z => {
  const zone = cur.zones[z.wave - 1];
  return `<div class="zblock">
  <div class="zt"><h3>${zone.name}</h3><span>▼ 通关 ${zone.down} 人 · 该区共 ${n0(zone.teams)} 队 · 最高分 ${zone.best} · 中位 ${zone.median}</span></div>
  <div class="zbody">
    <div><div class="ttl">冠军配队 · 第 ${z.champion.rank} 名 · ${z.champion.score} 分</div>
      ${memChips(z.champion.members)}
      <div class="mini" style="margin-top:5px">钥令：<b>${esc(tokenName(z.champion.token) || '—')}</b></div>
    </div>
    <div><div class="ttl">最热门配队 Top 3</div>
      ${z.hot.map((h, i) => `<div class="hotline"><span class="rk">${i + 1}</span>${memChips(h.members).replace('class="mem"', 'class="mem" style="display:inline-flex"')}<span class="cnt">${h.count} 队</span></div>`).join('')}
    </div>
    <div><div class="ttl">最快通关 ▼ ${z.fastest ? '(' + z.fastest.rounds + ' 回合)' : ''}</div>
      ${z.fastest ? `<div class="mini">${esc(z.fastest.name)} · 第 ${z.fastest.rank} 名</div>${memChips(z.fastest.members)}<div class="mini" style="margin-top:4px">钥令：${esc(tokenName(z.fastest.token) || '—')}</div>` : '<div class="mini">无</div>'}
    </div>
    <div><div class="ttl">出场 Top 6 唤醒体</div>
      <ul class="rank1">${z.chars.map(c => `<li><span>${esc(c.zh)}</span><span>${pct(c.n / zone.teams * 100)}%</span></li>`).join('')}</ul>
    </div>
    <div><div class="ttl">常用造物</div>
      <ul class="rank1">${z.creations.filter(c => c.zh !== '超维戒指' && c.n / zone.teams < 0.99).slice(0, 6).map(c => `<li><span>${esc(c.zh)}</span><span>${pct(c.n / zone.teams * 100)}%</span></li>`).join('')}</ul>
      <div class="ttl" style="margin-top:6px">常用钥令</div>
      <ul class="rank1">${z.tokens.slice(0, 3).map(c => `<li><span>${esc(c.zh)}</span><span>${pct(c.n / zone.teams * 100)}%</span></li>`).join('')}</ul>
    </div>
  </div></div>`;
}).join('')}
<div class="foot">口径：出场率 = 该禁区队伍中携带该唤醒体 / 造物 / 钥令的比例（同队去重）；最热门配队按「同阵容队伍数」排序，分数取该阵容最高。冠军配队为该禁区分数最高的队伍。造物榜已略去本季人人必备的「超维戒指」及其固定配件（携带率 ≥ 99%），否则五区清一色 100% 没有信息量。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 3
const rec = cur.records;
const recCell = (k, label, r, extra = '') => `<div class="rec"><div class="k">${label}</div><div class="v">${r ? (k === 'maxTotal' || k === 'maxHit' || k === 'counter' || k === 'tentacle' || k === 'poison' ? n0(r.value) : n0(r.value)) : '—'}</div>
  <div class="d">${r ? `第 ${r.rank} 名 · ${esc(r.name)} · ${r.wave ? '第' + ['一', '二', '三', '四', '五'][r.wave - 1] + '禁区' : ''}` : ''}</div>
  ${r && r.chars ? memChips(r.chars.map(c => ({ zh: c.zh, en: c.en })), 4) : ''}
  ${extra}</div>`;

const s3 = `<div class="page">${head(3, 6, stamp)}${mast(kicker)}
<h2 class="lead">4,676 万单回合伤害，<br><small>9 次死扛：本期的极限数据</small></h2>
<div class="sub">从 ${n0(rec.totalBattles)} 场战斗记录里按字段排出「全场最高」的九项，并统计 Top 2000 的唤醒体、命轮、密契、造物与钥令出场率。</div>
<div class="recs">
  <div class="rec"><div class="k">单回合最高伤害</div><div class="v">${n0(rec.maxHit.value)}</div><div class="d">第 ${rec.maxHit.rank} 名 · ${esc(rec.maxHit.name)} · 第${['一', '二', '三', '四', '五'][rec.maxHit.wave - 1]}禁区</div>${memChips(rec.maxHit.chars.map(c => ({ zh: c.zh, en: c.en })), 4)}</div>
  <div class="rec"><div class="k">单场总伤害之王</div><div class="v">${n0(rec.maxTotal.value)}</div><div class="d">第 ${rec.maxTotal.rank} 名 · ${esc(rec.maxTotal.name)} · 第${['一', '二', '三', '四', '五'][rec.maxTotal.wave - 1]}禁区</div>${memChips(rec.maxTotal.chars.map(c => ({ zh: c.zh, en: c.en })), 4)}</div>
  <div class="rec"><div class="k">单角色最高伤害</div><div class="v">${n0(rec.maxChar.value)}</div><div class="d">${esc(rec.maxChar.char.zh)} · 第 ${rec.maxChar.rank} 名 · 第${['一', '二', '三', '四', '五'][rec.maxChar.wave - 1]}禁区</div></div>
  ${recCell('', '死扛之王', rec.deathResist)}
  ${recCell('', '反击之王', rec.counter)}
  ${recCell('', '触手之王', rec.tentacle)}
  ${recCell('', '力量之王', rec.strength)}
  ${recCell('', '毒伤之王', rec.poison)}
  ${recCell('', '生命之王', rec.hp)}
</div>
<div class="hr2" style="margin-top:14px"></div>
<div class="h">最快通关榜 <em>▼ 难度，最少回合</em></div>
<table class="ftbl"><thead><tr><th>禁区</th><th>回合数</th><th>玩家</th><th style="text-align:left">配队</th></tr></thead><tbody>
${cur.fastest.map(f => `<tr><td>第${['一', '二', '三', '四', '五'][f.wave - 1]}禁区</td><td><b>${f.rounds}</b></td><td>${esc(f.name)}</td><td><div class="mem" style="display:flex">${f.chars.map(c => { const img = imgPath(awImg.get(c.en)); return `<div class="m"><img src="file:///${img}"><small>${esc(c.zh)}</small></div>`; }).join('')}</div></td></tr>`).join('')}
</tbody></table>
<div class="hr" style="margin-top:12px"></div>
<div class="pair">
  <div class="rankbox"><div class="h">出场榜 Top 10 <em>全部禁区 · 队伍占比</em></div>
    ${cur.top.chars.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.rate / cur.top.chars[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
  </div>
  <div class="rankbox"><div class="h">命轮 Top 6 <em>携带该命轮的队伍占比</em></div>
    ${cur.top.wheels.slice(0, 6).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.rate / cur.top.wheels[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
    <div class="h" style="margin-top:10px">密契 Top 6 <em>按队伍携带件数</em></div>
    ${cur.top.covs.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.n / cur.top.covs[0].n * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
  </div>
</div>
<div class="two" style="margin-top:10px">
  <div><div class="h">造物 Top 8 <em>队伍携带率</em></div>
    ${cur.top.creations.filter(c => c.zh !== '超维戒指').slice(0, 8).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.rate / 40 * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
  </div>
  <div><div class="h">钥令 Top 6 <em>队伍携带率</em></div>
    ${cur.top.tokens.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.rate / cur.top.tokens[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
    <div class="h" style="margin-top:8px">借用助战 Top 6 <em>被借次数</em></div>
    <div class="mini">${cur.top.assists.map((a, i) => `${i + 1}. ${esc(a.zh)} ${a.n}`).join('　')}</div>
  </div>
</div>
<div class="foot">口径：「单回合最高伤害」「死扛」「反击」「触手」「力量」「毒伤」「生命」取 ${n0(rec.totalBattles)} 场战斗记录里的单场最大值，玩家名后标注其当期名次；出场率按队伍去重统计（2000 名玩家 × 五个禁区共 ${n0(cur.top.teamN)} 支队伍）。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 4
const nch = cur.niche, mys = cur.mystery, dA = cur.deathAvg;
const s4 = `<div class="page">${head(4, 6, stamp)}${mast(kicker)}
<h2 class="lead">狂癫难度里，${nch.zeroDown.length} 位唤醒体<br><small>一次都没出场</small></h2>
<div class="sub">本版统计「狂癫」（▼）与 SSS 难度的队伍（含通关队与额外队）：共 ${n0(cur.zones.reduce((a, z) => a + z.down, 0))} 队 ▼、${n0(cur.zones.reduce((a, z) => a + z.threats.SSS, 0))} 队 SSS 通关队，${cur.top.chars.length ? cur.enlight.length : 0} 个出场过的唤醒体里只有 ${cur.enlight.length} 个在 ▼ 与 SSS 里留下记录。</div>
<div class="hr2"></div>
<div class="h">狂癫（▼）零出场 <em>本期有出场但 ▼ 队里一次未出现</em></div>
<div style="display:flex;align-items:center;gap:16px;margin:6px 0 12px">
  <div class="mem">${nch.zeroDown.map(c => { const img = imgPath(awImg.get(c.en)); return `<div class="m" style="width:52px"><img style="width:50px;height:50px" src="file:///${img}"><small>${esc(c.zh)}</small></div>`; }).join('') || '<span class="mini">无</span>'}</div>
  <div class="mini" style="flex:1;border-left:1px solid #c3b393;padding-left:14px">
    ${nch.leastDown.filter(c => c.n === 0).map(c => `<b>${esc(c.zh)}</b>：全部 ${c.all} 支队伍里，▼ 队 0 支——它在 SSS 及以下都有人用，唯独没人拿它打狂癫。`).join('<br>')}
    ${nch.zeroBoth.length ? `<br><b>${nch.zeroBoth.map(c => esc(c.zh)).join('、')}</b>更极端：▼ 与 SSS 两档加起来一次都没出现，只出现在 SS 及以下。` : ''}
  </div>
</div>
<div class="h">狂癫（▼）出场最少 Top 8 <em>括号内为全部禁区的出场队伍数</em></div>
<table class="ftbl" style="margin-bottom:12px"><thead><tr><th>唤醒体</th><th>▼ 出场队伍</th><th>全部出场</th><th>▼ 占比</th></tr></thead><tbody>
${nch.leastDown.map(c => `<tr><td>${esc(c.zh)}</td><td>${c.n}</td><td>${c.all}</td><td>${pct(c.all ? c.n / c.all * 100 : 0)}%</td></tr>`).join('')}
</tbody></table>
<div class="h">神秘配队 Top 5 <em>▼ + SSS 难度里只有一队使用的阵容</em></div>
${cur.mysteryLineups.map((m, i) => `<div class="zblock" style="margin-bottom:6px"><div class="zt"><h3 style="font-size:15px">${i + 1}. ${esc(m.members[0].zh)} 队</h3><span>第 ${m.rank} 名 · ${m.score} 分 · 全服仅 ${m.count} 队</span></div><div class="zbody" style="grid-template-columns:1fr"><div style="display:flex;align-items:center;gap:22px">
  ${memChips(m.members)}
  <div class="mini" style="text-align:right;white-space:nowrap">${WAVE_NAME[m.wave] || ''} · ${m.threat} 通关<br>钥令：<b>${esc(tokenName(m.token) || '—')}</b></div>
</div></div></div>`).join('')}
<div class="hr2" style="margin-top:8px"></div>
<div class="h">神秘数据 <em>▼ + SSS 通关战斗之最</em></div>
<div class="recs" style="grid-template-columns:repeat(4,1fr)">
  <div class="rec"><div class="k">最长鏖战</div><div class="v">${mys.maxRounds.value} 回合</div><div class="d">第 ${mys.maxRounds.rank} 名 · ${esc(mys.maxRounds.name)}</div></div>
  <div class="rec"><div class="k">出牌最多</div><div class="v">${n0(mys.maxCard.value)}</div><div class="d">第 ${mys.maxCard.rank} 名 · ${esc(mys.maxCard.name)}</div></div>
  <div class="rec"><div class="k">耗能最多</div><div class="v">${n0(mys.maxEnergy.value)}</div><div class="d">第 ${mys.maxEnergy.rank} 名 · ${esc(mys.maxEnergy.name)}</div></div>
  <div class="rec"><div class="k">单回合出牌最多</div><div class="v">${mys.maxBoutCard.value}</div><div class="d">第 ${mys.maxBoutCard.rank} 名 · ${esc(mys.maxBoutCard.name)}</div></div>
  <div class="rec"><div class="k">最少出牌通关（▼）</div><div class="v">${mys.minCardDown ? mys.minCardDown.value : '—'}</div><div class="d">${mys.minCardDown ? `第 ${mys.minCardDown.rank} 名 · ${esc(mys.minCardDown.name)}` : ''}</div></div>
  <div class="rec"><div class="k">首领战最长</div><div class="v">${mys.firstRound.value} 回合</div><div class="d">第 ${mys.firstRound.rank} 名 · ${esc(mys.firstRound.name)}</div></div>
  <div class="rec"><div class="k">全局战斗场次</div><div class="v">${n0(rec.totalBattles)}</div><div class="d">通关 + 额外队，逐场归档</div></div>
  <div class="rec"><div class="k">平均死扛（▼+SSS）</div><div class="v">${dA.all.toFixed(2)} 次</div><div class="d">共 ${n0(dA.allBattles)} 场 ▼+SSS 战斗的均值</div></div>
</div>
<div class="pair" style="margin-top:10px">
  <div class="rankbox"><div class="h">平均死扛最高的唤醒体 Top 5 <em>▼+SSS，至少 15 场</em></div>
    ${dA.chars.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.avg / dA.chars[0].avg * 100}%"></b></span><span class="v">${c.avg}<em> ${c.n} 场</em></span></div>`).join('')}
  </div>
  <div class="rankbox"><div class="h">平均死扛最高的玩家 Top 5 <em>▼+SSS，至少 5 场</em></div>
    ${dA.players.map((p, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(p.name)}</span><span class="track"><b style="width:${p.avg / dA.players[0].avg * 100}%"></b></span><span class="v">${p.avg}<em> #${p.rank}</em></span></div>`).join('')}
  </div>
</div>
<div class="foot">口径：「出场」按队伍去重，一支队伍带两名同名唤醒体的只算一次；▼ 与 SSS 分别统计该难度的通关队。平均死扛 = 该唤醒体 / 玩家在 ▼+SSS 战斗里的死扛触发次数均值。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 5
const enl = cur.enlight;
const eS = cur.enlightSummary;
const enlColor = { '0-2': '#3d6b46', '3-5': '#d9c06a', '6-8': '#c98f4a', '9-11': '#a1281b', '12+': '#6d1a12' };
const BK = ['0-2', '3-5', '6-8', '9-11', '12+'];

const s5 = `<div class="page">${head(5, 6, stamp)}${mast(kicker)}
<h2 class="lead">▼ 与 SSS 难度里，<br><small>${Math.round(cur.enlight12)}% 的唤醒体已经 +12</small></h2>
<div class="sub">统计 ▼ + SSS 难度的通关队伍（含额外队），共 ${n0(cur.enlightTotal)} 个唤醒体出场位，按启灵档位分段统计；下表按「+12 启灵」占比降序排列，样本低于 20 场的已略去（共 ${enl.length} 个唤醒体入选）。</div>
<div class="hr2"></div>
<div class="h">全样本启灵分布 <em>▼ + SSS 通关队 · ${n0(eS.n)} 个出场位 · 平均启灵 ${eS.avgPotency}</em></div>
<div class="ovw">
  <div class="ovwbar">${BK.map(k => `<i style="width:${eS.dist[k] / eS.n * 100}%;background:${enlColor[k]}">${eS.dist[k] / eS.n >= 0.06 ? pct(eS.dist[k] / eS.n * 100) + '%' : ''}</i>`).join('')}</div>
  <div class="ovwnums">${BK.map(k => `<div><b>${n0(eS.dist[k])}</b><span>${k} 启 · ${pct(eS.dist[k] / eS.n * 100)}%</span></div>`).join('')}</div>
</div>
<div class="h" style="margin-top:12px">逐觉醒体启灵分布 <em>右侧为 +12 占比，末尾为出场位</em></div>
<div class="enl1">
  ${enl.map((r, i) => `<div class="enlrow"><span class="p">${i + 1}</span><span class="nm">${esc(r.zh)}</span>
    <span class="track">${BK.map(k => `<i style="width:${r.dist[k] / r.n * 100}%;background:${enlColor[k]}"></i>`).join('')}</span>
    <span class="pc">${pct(r.p12)}%</span><span class="nn">${r.n} 场</span></div>`).join('')}
</div>
<div class="pair" style="margin-top:11px">
  <div><div class="h">各禁区出场的平均启灵 <em>▼ + SSS，红虚线为全样本 ${eS.avgPotency}</em></div>
    ${eS.byZone.map(z => `<div class="zavg"><span>${WAVE_NAME[z.wave]}</span>
      <span class="track"><b style="width:${z.avg / 15 * 100}%"></b><i style="left:${eS.avgPotency / 15 * 100}%"></i></span>
      <span class="v">${z.avg}<em> / ${n0(z.n)}</em></span></div>`).join('')}
  </div>
  <div><div class="h">▼ 与 SSS 的启灵结构对照 <em>同一套五档配色</em></div>
    <div class="thcmp">
      ${['▼', 'SSS'].map(t => `<div class="row"><span>${t}</span><span class="bar">${BK.map(k => `<i style="width:${eS.byThreat[t].dist[k] / eS.byThreat[t].n * 100}%;background:${enlColor[k]}"></i>`).join('')}</span><span>+12 ${pct(eS.byThreat[t].p12)}%<br><em style="font-style:normal;color:#8a7458">${n0(eS.byThreat[t].n)} 位</em></span></div>`).join('')}
    </div>
    <div class="note" style="margin-top:2px">▼ 通关队的 +12 比例比 SSS 高 ${pct(eS.byThreat['▼'].p12 - eS.byThreat.SSS.p12)} 个百分点：打得动最难的一档，多半靠把启灵堆满；而 SSS 里仍有 ${n0(eS.byThreat.SSS.dist['0-2'] + eS.byThreat.SSS.dist['3-5'])} 位（${pct((eS.byThreat.SSS.dist['0-2'] + eS.byThreat.SSS.dist['3-5']) / eS.byThreat.SSS.n * 100)}%）是 5 启以下。</div>
  </div>
</div>
<div class="note" style="margin-top:8px;font-size:9.6px;line-height:1.6">
  <b style="color:#a1281b">满启与低启</b>：全场唯一「全员 +12」的唤醒体是 <b>${eS.full.join('、') || '—'}</b>${eS.full.length ? `（${enl.find(r => r.zh === eS.full[0])?.n || 0} 个出场位，100% 满启）` : ''}。反面是一批纯机制位——上场不少、却几乎不带启灵：${eS.low.map(x => `${esc(x.zh)} ${n0(x.n)} 场仅 ${pct(x.p12)}%`).join('、')}。
  这些角色靠机制（护盾、减伤、控场）站住位置，启灵堆不堆影响很小；主力输出则几乎必然满启。
  <b style="color:#a1281b">读表提示</b>：横向条是构成，五段之和为 100%，条长不代表强弱；出场位只有二三十场的角色波动极大，一两个满启玩家就能把 +12 占比推到 50% 以上。
</div>
<div class="foot">口径：启灵 = 唤醒体的潜能等级（0-15，图中分 0-2 / 3-5 / 6-8 / 9-11 / 12+ 五段，+12 以上为满启）；同一队伍里同一唤醒体只计一次。「全样本」为样本 ≥ 20 场的 ${enl.length} 个唤醒体合计（${n0(eS.n)} 位），▼ / SSS 结构对照含样本不足 20 场的唤醒体（${n0(eS.byThreat['▼'].n + eS.byThreat.SSS.n)} 位），故略多于全样本。出场数少的唤醒体波动大，仅供参考。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 6
const zc = cur.zones, zp = prev.zones;
const downTotal = zc.reduce((a, z) => a + z.down, 0);
const downPrev = zp.reduce((a, z) => a + z.down, 0);
const dlt = (now, before, unit = '') => {
  const d = now - before;
  if (!d) return `<i>${now}${unit}</i>`;
  return `<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}${unit}</i>`;
};
const cmpCell = (label, a, b, unit = '') => `<div class="c"><span>${label}</span><b>${a}</b><b style="font-size:13px;color:#6a5740">${b}</b>${dlt(a, b, unit)}</div>`;

// top char deltas
const prevChars = new Map(prev.top.chars.map(c => [c.zh, c.rate]));
const charDelta = cur.top.chars.map(c => ({ ...c, d: c.rate - (prevChars.get(c.zh) ?? 0) }));
const risers = [...charDelta].sort((a, b) => b.d - a.d).slice(0, 4);
const fallers = [...charDelta].sort((a, b) => a.d - b.d).slice(0, 4);
const prevToken = new Map(prev.top.tokens.map(t => [t.zh, t.rate]));
const prevWheel = new Map(prev.top.wheels.map(t => [t.zh, t.rate]));

const s6 = `<div class="page">${head(6, 6, stamp)}${mast(kicker)}
<h2 class="lead">超维戒指对比血肉戒指：<br><small>▼ 通关 ${downPrev} → ${downTotal}（${downTotal >= downPrev ? '+' : ''}${Math.round((downTotal / downPrev - 1) * 100)}%）</small></h2>
<div class="sub">同样统计终榜 Top 2000：第 73 期上榜门槛 ${cur.threshold} 分（上期 ${prev.threshold}），满分人数 ${prev.ge['525']} 人变为 ${cur.ge['525']} 人，各禁区的 ▼ 通关总数合计 ${downPrev} → ${downTotal}，▼+SSS 战斗的平均回合从 ${prev.avgRounds.hard} 回合降到 <b>${cur.avgRounds.hard}</b> 回合（${Math.round((cur.avgRounds.hard / prev.avgRounds.hard - 1) * 100)}%）。</div>
<div class="cmp">
  ${cmpCell('525 满分', cur.ge['525'], prev.ge['525'])}
  ${cmpCell('≥ 500 分', cur.ge['500'], prev.ge['500'])}
  ${cmpCell('≥ 450 分', cur.ge['450'], prev.ge['450'])}
  ${cmpCell('平均分', cur.mean, prev.mean)}
  ${cmpCell('中位分', cur.median, prev.median)}
  <div class="c"><span>▽ 通关总数</span><b>${downTotal}</b><b style="font-size:13px;color:#6a5740">${downPrev}</b><i class="up">+${Math.round((downTotal / downPrev - 1) * 100)}%</i></div>
</div>
<div class="hr2" style="margin-top:12px"></div>
<div class="pair">
  <div><div class="h">排名分数线 <em>同一名次的两期分数</em></div>
    <table class="ftbl"><thead><tr><th>名次</th><th>第 73 期</th><th>第 72 期</th><th>变化</th></tr></thead><tbody>
    ${cur.lines.map(l => { const p = prev.lines.find(x => x.rank === l.rank); const d = p ? l.score - p.score : null; return `<tr><td>第 ${n0(l.rank)} 名</td><td><b>${l.score}</b></td><td>${p ? p.score : '—'}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? '' : (d > 0 ? '+' : '') + d}</td></tr>`; }).join('')}
    </tbody></table>
  </div>
  <div><div class="h">分数阶梯 <em>累计人数</em></div>
    <table class="ftbl"><thead><tr><th>分数线</th><th>第 73 期</th><th>第 72 期</th><th>变化</th></tr></thead><tbody>
    ${ladderSteps.map(t => {
      const a = distEntries.filter(([s]) => s >= t).reduce((x, [, v]) => x + v, 0);
      const pv = Object.entries(prev.dist).map(([k, v]) => [Number(k), v]).filter(([s]) => s >= t).reduce((x, [, v]) => x + v, 0);
      const d = a - pv;
      return `<tr><td>≥ ${t}</td><td><b>${n0(a)}</b></td><td>${n0(pv)}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? (d > 0 ? '+' : '') + n0(d) : '—'}</td></tr>`;
    }).join('')}
    </tbody></table>
  </div>
</div>
<div class="hr" style="margin-top:10px"></div>
<div class="two">
  <div><div class="h">各禁区 ▼ 通关人数 <em>73 期（红）对 72 期（绿）</em></div>
    ${zc.map((z, i) => {
      const p = zp[i];
      const max = Math.max(...zc.map(x => x.down), ...zp.map(x => x.down));
      return `<div class="hz"><span>${z.name}</span><span class="track">
        <span class="bar2" style="width:${z.down / max * 100}%"></span>
        <span style="font-size:9.5px;color:#6a5740;margin-left:4px">${z.down}</span>
        <span class="bar" style="width:${p.down / max * 100}%"></span>
        <span style="font-size:9.5px;color:#6a5740;margin-left:4px">${p.down}</span>
      </span><span style="text-align:right;font-size:10px;color:#a1281b">${p.down ? '+' + Math.round((z.down / p.down - 1) * 100) + '%' : ''}</span></div>`;
    }).join('')}
  </div>
  <div><div class="h">最快 ▼ 通关 <em>回合数</em></div>
    <table class="ftbl"><thead><tr><th>禁区</th><th>73 期</th><th>72 期</th></tr></thead><tbody>
    ${cur.fastest.map(f => { const p = prev.fastest.find(x => x.wave === f.wave); return `<tr><td>第${['一', '二', '三', '四', '五'][f.wave - 1]}禁区</td><td><b>${f.rounds}</b></td><td>${p ? p.rounds : '—'}</td></tr>`; }).join('')}
    </tbody></table>
    <div class="h" style="margin-top:10px">极限数据对照</div>
    <table class="ftbl"><thead><tr><th>项目</th><th>73 期</th><th>72 期</th></tr></thead><tbody>
      <tr><td>单回合最高伤害</td><td>${n0(rec.maxHit.value)}</td><td>${n0(prev.records.maxHit.value)}</td></tr>
      <tr><td>单场总伤害</td><td>${n0(rec.maxTotal.value)}</td><td>${n0(prev.records.maxTotal.value)}</td></tr>
      <tr><td>单场死扛最多</td><td>${rec.deathResist.value}</td><td>${prev.records.deathResist.value}</td></tr>
    </tbody></table>
  </div>
</div>
<div class="hr" style="margin-top:8px"></div>
<div class="pair">
  <div><div class="h">唤醒体出场 Top 8 <em>73 期，括号内为上期</em></div>
    ${cur.top.chars.slice(0, 8).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="track"><b style="width:${c.rate / cur.top.chars[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%<em> (${pct(prevChars.get(c.zh) ?? 0)})</em></span></div>`).join('')}
  </div>
  <div><div class="h">出场率上升最多 <em>百分点</em></div>
    ${risers.map(c => `<div class="rankrow"><span class="p">▲</span><span class="n">${esc(c.zh)}</span><span class="v" style="width:auto">+${pct(c.d)}</span></div>`).join('')}
    <div class="h" style="margin-top:8px">出场率下降最多</div>
    ${fallers.map(c => `<div class="rankrow"><span class="p">▼</span><span class="n">${esc(c.zh)}</span><span class="v" style="width:auto">${pct(c.d)}</span></div>`).join('')}
  </div>
</div>
<div class="pair" style="margin-top:8px">
  <div><div class="h">钥令 Top 4</div>${cur.top.tokens.slice(0, 4).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="v" style="width:auto">${pct(c.rate)}%<em> (${pct(prevToken.get(c.zh) ?? 0)})</em></span></div>`).join('')}</div>
  <div><div class="h">命轮 Top 4</div>${cur.top.wheels.slice(0, 4).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(c.zh)}</span><span class="v" style="width:auto">${pct(c.rate)}%<em> (${pct(prevWheel.get(c.zh) ?? 0)})</em></div>`).join('')}</div>
</div>
<div class="close">
  <div><div class="k">涨得最猛</div><div class="v">第一禁区 <b>+65%</b></div>
    <div class="d">▼ 通关 130 → 215 人，是五个禁区里唯一翻倍级的增长；第四、第五禁区各只有 +31% / +32%。</div></div>
  <div><div class="k">分数整体上移，高分段反而变薄</div><div class="v">中位 <b>405 → 415</b></div>
    <div class="d">平均分 413.3 → 422.1、中位分 405 → 415，但 ≥450 分的人数从 649 掉到 611，≥500 分从 42 掉到 36。</div></div>
  <div><div class="k">极限被抬高</div><div class="v">单场 <b>5,556 万 → 8,262 万</b></div>
    <div class="d">单回合最高伤害 4,101 万 → 4,676 万，单场总伤害 +49%；死扛纪录仍是 9 次，两期持平。</div></div>
</div>
<div class="foot">口径：两期均按各自终榜 Top 2000 统计；▼ 通关数为五个禁区 ▼ 难度通关队伍之和；出场率括号内为第 72 期同口径数据。制图：忘忘看报。</div>
</div>`;

const pages = [s1, s2, s3, s4, s5, s6];
pages.forEach((html, i) => {
  const doc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>融灾第73期特刊-第${i + 1}版</title><style>${CSS}</style></head><body>${html}</body></html>`;
  fs.writeFileSync(path.join(OUT, `s${i + 1}.html`), doc, 'utf8');
});
console.log('wrote', pages.length, 'pages to', OUT);
