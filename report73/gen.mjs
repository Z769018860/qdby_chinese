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
const covImg = new Map(pool.covenant.map(x => [x.en, x.img]));
const imgPath = p => p ? path.join(ROOT, p).replace(/\\/g, '/') : '';
// 造物同名有 +1/+2 后缀（缠丝玛瑙+），SKeyDB 目录里只有基名
const stripPlus = s => String(s || '').replace(/\++$/, '').trim();
const lookup = (map, en) => map.get(en) || map.get(stripPlus(en)) || map.get(String(en || '').replace(/^"|"$/g, ''));
const iconOf = {
  char: en => lookup(awImg, en),
  relic: en => lookup(relicImg, en),
  token: en => lookup(tokenImg, en),
  wheel: en => lookup(wheelImg, en),
  cov: en => lookup(covImg, en),
};
// 小图标；取不到时返回空串（版面留空，不画灰块）
const ic = (kind, en, size = 15) => {
  const src = iconOf[kind](en);
  return src ? `<img class="ico ico-${kind}" src="file:///${imgPath(src)}" style="width:${size}px;height:${size}px">` : '';
};
// 唤醒体名字前面带小头像
const awico = (en, size = 18) => ic('char', en, size);
// 造物里不属于「可选造物」的条目：本季人人必备的环 + 锈蚀钥匙（货币类，不是配装选择）
const CREATION_SKIP = new Set(['超维戒指', '血肉戒指', '混沌戒指', '锈蚀钥匙']);

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
.bars{display:flex;align-items:flex-end;gap:2.5px;height:392px;padding-top:10px}
.bars .b{flex:1;background:#2c2318;position:relative;min-height:1px}
.axis{display:flex;gap:2.5px;margin-top:3px;border-top:1px solid #c3b393;padding-top:2px}
.axis span{flex:1;text-align:center;font-size:7.5px;color:#6f5c45;line-height:1.1}
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
  padding:6.5px 0;border-bottom:1px solid #ddd0b6;font-size:11px}
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
.rec{padding:8px 12px;border-right:1px solid #c3b393;border-bottom:1px solid #c3b393}
.rec:nth-child(3n){border-right:0}
.rec .k{font-size:11px;color:#6a5740;letter-spacing:.4px}
.rec .v{font-family:"Source Han Serif SC","SimSun",serif;font-size:29px;font-weight:900;color:#a1281b;line-height:1.15}
.rec .d{font-size:10px;color:#4b3a28;line-height:1.45}
.rec .mem{margin-top:4px}
.tbl-people td{font-size:10.5px}
.ftbl th,.ftbl td{font-size:10.5px;padding:3.5px 3px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rankbox .h{margin-bottom:6px}
.rankrow{display:flex;align-items:center;gap:6px;padding:2.1px 0;border-bottom:1px dotted #d3c4a6;font-size:11px}
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
.legend5{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:10.5px;color:#4b3a28;padding:2px 0 8px}
.legend5 span{display:inline-flex;align-items:center;gap:4px}
.legend5 i{width:11px;height:11px;display:inline-block}
.legend5 .rt{margin-left:auto;color:#7b6750;font-size:9.5px}
.enlw{display:grid;grid-template-columns:1fr 1fr;gap:0 26px}
.enlw .enlrow{grid-template-columns:20px 26px 104px 1fr 50px;gap:7px;font-size:12.5px;padding:6.65px 0;
  border-bottom:1px dotted #d6c8ac}
.enlw .enlrow .p{font-size:12px}
.enlw .enlrow .nm{white-space:normal;line-height:1.15;overflow:visible}
.enlw .enlrow .nm em{display:block;font-size:9.5px;color:#8a7458;font-style:normal}
.enlw .enlrow .track{height:17px}
.enlw .enlrow .pc{font-size:13px}
.myinfo{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:10.5px;white-space:nowrap;
  border-left:1px solid #c3b393;padding-left:16px}
.myinfo span{color:#7b6750}
.myinfo b{color:#a1281b}
.myinfo i{font-style:normal;color:#c3b393;margin:0 3px}
.subh{display:flex;align-items:baseline;gap:8px;font-size:11.5px;font-weight:800;color:#3c2c1c;
  border-bottom:2px solid #3c2c1c;padding:9px 0 3px;margin-bottom:2px}
.subh em{font-style:normal;font-size:9.5px;font-weight:400;color:#7b6750}
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
.zavg.zv2{grid-template-columns:74px 1fr 122px;padding:8px 0}
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
.hz{display:grid;grid-template-columns:66px 1fr 46px;align-items:center;gap:8px;font-size:11px;padding:6px 0;
  border-bottom:1px solid #ddd0b6}
.hz .zl{font-weight:700}
.hz .vstack{display:flex;flex-direction:column;gap:3px}
.hz .line{display:grid;grid-template-columns:1fr 34px;align-items:center;gap:5px}
.hz .line i{display:block;height:10px}
.hz .line em{font-style:normal;font-size:9.5px;color:#6a5740;text-align:right}
.hz .bar{background:#3d6b46}
.hz .bar2{background:#a1281b}
.hz .dl{text-align:right;font-size:10.5px;color:#a1281b;font-weight:700}
.hz .dl.down{color:#3d6b46}
.assist{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 10px;font-size:10.5px}
.assist span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.assist b{color:#a1281b;margin-right:2px}
.assist em{font-style:normal;color:#7b6750;font-size:9.5px}
.close{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:2px solid #3c2c1c;margin-top:12px}
.close>div{padding:8px 12px;border-right:1px solid #c3b393}
.close>div:last-child{border-right:0}
.close .k{font-size:10.5px;color:#6a5740;letter-spacing:.3px}
.close .v{font-size:17px;font-family:"Source Han Serif SC","SimSun",serif;font-weight:900;line-height:1.35}
.close .v b{color:#a1281b}
.close .d{font-size:9.6px;color:#4b3a28;line-height:1.55;margin-top:3px}
/* icons inside rank rows and lists */
.ico{object-fit:cover;border-radius:2px;border:1px solid #b7a685;background:#e6dcc6;vertical-align:-2px;margin-right:4px;flex:none}
.ico-token{background:transparent;filter:brightness(.42) contrast(1.3)}
.ico-relic,.ico-cov{background:#f0e8d4}
.rankrow .n{display:flex;align-items:center;gap:4px;min-width:0}
.rankrow .n i{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank1 li span:first-child{display:flex;align-items:center;gap:4px;min-width:0}
.rank1 li span:first-child i{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nmico{display:inline-flex;align-items:center;gap:4px;vertical-align:-3px}
/* spread 7 low-cost */
.zblk{border:1px solid #c3b393;background:#f8f3e6;margin-bottom:8px}
.zh{display:flex;align-items:baseline;gap:10px;padding:4px 9px;background:#ece2cc;border-bottom:1px solid #c3b393}
.zh b{font-family:"Source Han Serif SC","SimSun",serif;font-size:14px;letter-spacing:.6px;color:#3c2c1c}
.zh em{font-style:normal;font-size:9px;color:#6a5740}
.zh .rt{margin-left:auto;font-size:9px;color:#4b3a28}
.zh .rt b{color:#a1281b}
.zcols{display:grid;grid-template-columns:1fr 1fr}
.zcol{padding:2px 9px 3px;border-right:1px solid #d6c8ac;min-width:0}
.zcol:last-child{border-right:0}
.zt{display:flex;align-items:baseline;gap:6px;font-size:9px;font-weight:800;letter-spacing:.4px;color:#4b3a28;padding-bottom:1px;border-bottom:1px solid #ddd0b4}
.zt b{color:#a1281b;font-size:11px;font-family:"Source Han Serif SC","SimSun",serif}
.zt em{font-style:normal;font-weight:400;font-size:8.6px;color:#7b6750;margin-left:auto}
.lrow{display:flex;align-items:center;gap:5px;padding:2.9px 0;border-bottom:1px dotted #d6c8ac;min-width:0}
.lrow:last-child{border-bottom:0}
.mb{display:inline-flex;align-items:center;gap:2px;font-size:9px;white-space:nowrap}
.mb img{width:15px;height:15px;border-radius:2px;border:1px solid #b7a685;object-fit:cover;flex:none}
.mb span{max-width:52px;overflow:hidden;text-overflow:ellipsis}
.mb i{font-style:normal;font-size:8px;font-weight:700;color:#a1281b}
.lrow .lm{margin-left:auto;font-size:8.6px;color:#6a5740;white-space:nowrap}
.lrow .lm b{color:#a1281b;font-size:12.5px;font-family:"Source Han Serif SC","SimSun",serif;font-weight:900}
.bband{border:1px solid #c3b393;background:#f8f3e6;margin-bottom:7px}
.bhead{display:flex;align-items:baseline;gap:10px;padding:3px 10px;background:#ece2cc;border-bottom:1px solid #c3b393}
.bhead h3{font-family:"Source Han Serif SC","SimSun",serif;font-size:15px;color:#a1281b;font-weight:900;letter-spacing:.6px}
.bhead em{font-style:normal;font-size:9px;color:#5f4c36}
.bhead .rt{margin-left:auto;font-size:9px;color:#4b3a28}
.bhead .rt b{color:#a1281b}
.bwho{display:flex;align-items:baseline;gap:10px;padding:3px 10px;font-size:10px;color:#3c2c1c;border-bottom:1px solid #e2d7bd;background:#fbf7ec}
.bwho .rt{margin-left:auto;white-space:nowrap;font-size:9px;color:#6a5740}
.bwho .rt i{font-style:normal;color:#a1281b;font-weight:800}
.bwho b{font-size:12px;font-family:"Source Han Serif SC","SimSun",serif}
.bwho i{font-style:normal;color:#a1281b;font-weight:800}
.bwho em{font-style:normal;font-size:9px;color:#7b6750}
.bcols{display:grid;grid-template-columns:repeat(5,1fr)}
.bcol{padding:3px 8px 4px;border-right:1px solid #d6c8ac;min-width:0}
.bcol:last-child{border-right:0}
.bch{font-size:9px;font-weight:800;color:#3c2c1c;border-bottom:1px solid #ddd0b4;padding-bottom:1px;margin-bottom:2px}
.bch b{color:#a1281b}
.bch span{float:right;font-weight:400;color:#7b6750;font-size:8.4px}
.bm{display:flex;align-items:center;gap:3px;font-size:8.8px;line-height:1.5;white-space:nowrap;min-width:0}
.bm img{width:14px;height:14px;border-radius:2px;border:1px solid #b7a685;object-fit:cover;flex:none}
.bm span{overflow:hidden;text-overflow:ellipsis}
.bm i{font-style:normal;font-size:8px;font-weight:700;color:#a1281b;margin-left:auto}
.bcf{font-size:8.6px;color:#6a5740;margin-top:1px;border-top:1px dotted #d6c8ac;padding-top:2px}
.bcf b{color:#a1281b;font-size:12px;font-family:"Source Han Serif SC","SimSun",serif;font-weight:900}
.btot{display:flex;gap:14px;align-items:baseline;font-size:9px;color:#4b3a28;margin:0 0 6px}
.btot b{color:#a1281b}
`;

function head(spread, total, stamp) {
  return `<div class="head"><div>忘忘看报 · 融灾特刊</div><div>第 ${spread} 版 / 共 ${total} 版</div><div>融灾快报 ${stamp}（北京时间）</div></div>`;
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

const s1 = `<div class="page">${head(1, 7, stamp)}${mast(kicker)}
<h2 class="lead">${cur.ge['525']} 人登顶 525 满分，<br><small>${cur.ge['450']} 位玩家站上 450 分线</small></h2>
<div class="sub">本刊统计终极 Top 2000（上榜门槛 <b>${cur.threshold}</b> 分）：<b>${cur.ge['500']}</b> 人 ≥500 分，<b>${cur.ge['450']}</b> 人 ≥450 分，满分 525 仅 <b>${cur.ge['525']}</b> 人，占统计样本的 ${pct(cur.ge['525'] / cur.count * 100)}%。</div>
<div class="grid-stats">
  <div class="stat"><span>上榜门槛 · 第 2000 名</span><b>${cur.threshold}</b><i>分</i></div>
  <div class="stat"><span>统计样本 · Top</span><b>${n0(cur.count)}</b></div>
  <div class="stat hot"><span>525 满分</span><b>${cur.ge['525']}</b></div>
  <div class="stat"><span>≥ 500 分</span><b>${cur.ge['500']}</b></div>
  <div class="stat"><span>≥ 450 分</span><b>${cur.ge['450']}</b></div>
  <div class="stat"><span>平均 / 中位</span><b>${Math.round(cur.mean)} / ${Math.round(cur.median)}</b></div>
</div>
<div class="cols3" style="margin-top:16px">
  <div class="col"><div class="h">分数分布 <em>每 10 分一档，共 2,000 人</em></div>
    <div class="bars">${buckets.map(([hi, n]) => `<div class="b" style="height:${Math.max(1, n / maxBucket * 368)}px"><em>${n}</em></div>`).join('')}</div>
    <div class="axis">${buckets.map(([hi], i) => `<span>${i % 2 === 0 ? hi : ''}</span>`).join('')}</div>
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
    <li>满分 525 只有 <b>${cur.ge['525']}</b> 人，五个禁区全取 ▼ 通关（95+100+105+110+115），是本期唯一的完美解法。</li>
    <li><b>450 分</b>是本期最明显的一道分水岭：${cur.ge['450']} 人站上，占总样本 ${pct(cur.ge['450'] / cur.count * 100)}%；光 450 分这一档就压着 <b>${n0(cur.dist['450'] || 0)}</b> 人。</li>
    <li>第三禁区是全局的「送分区」：<b>${cur.zones[2].down}</b> 人拿下 ▼，通关率 ${pct(cur.zones[2].downRate)}%，是第二禁区（${cur.zones[1].down} 人）的 ${pct(cur.zones[2].down / cur.zones[1].down)} 倍。</li>
    <li>第四、第五禁区的 ▼ 最难：各只有 <b>${cur.zones[3].down}</b> / <b>${cur.zones[4].down}</b> 人，通关率 ${pct(cur.zones[3].downRate)}%，最快也要 ${cur.fastest[3].rounds} / ${cur.fastest[4].rounds} 回合。</li>
    <li>整体节奏明显变快：▼ + SSS 战斗平均 <b>${cur.avgRounds.hard}</b> 回合就结束，比上期少 ${(prev.avgRounds.hard - cur.avgRounds.hard).toFixed(2)} 回合；最快的 ▼ 通关只要 <b>4</b> 回合（第一禁区）。</li>
    <li>分数线整体下移、顶端反而更集中：平均 <b>${pct(cur.mean)}</b>（上期 ${pct(prev.mean)}）、中位 <b>${Math.round(cur.median)}</b>（上期 ${Math.round(prev.median)}），≥450 分人数从 ${prev.ge['450']} 掉到 ${cur.ge['450']}；可 525 满分反从 ${prev.ge['525']} 人增到 ${cur.ge['525']} 人。</li>
  </ul></div>
  <div><div class="h">读报指南</div><div class="guide">
    <div><b>第 2 版</b> · 各禁区的配队榜——冠军配队、最热门配队、最快通关、出场与常用造物。</div>
    <div><b>第 3 版</b> · 数据之最——单回合最高伤害、单场总伤害、死扛之王，以及命轮、密契、造物与钥令出场榜。</div>
    <div><b>第 4 版</b> · 小众数据——▼ 零出场、神秘配队、最长鏖战与平均死扛。</div>
    <div><b>第 5 版</b> · 启灵特刊——▼ 与 SSS 难度下各唤醒体的启灵分布。</div>
    <div><b>第 6 版</b> · 对比特刊——第 73 期与第 72 期的全部主指标对照。</div>
    <div><b>第 7 版</b> · 低配榜——五个禁区的 ▼ 与 SSS 各自最省启灵的三套阵容，以及三档分数段里最省玩家的全部队伍。</div>
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
  于是 ▼ 通关队天然分成「打满」和「擦线」两类：${cur.zones.map(z => `${z.name} ${pct(z.downFull / z.down * 100)}%`).join('、')}（打满人数占该区 ▼ 通关人数的比例）。
  第四、第五禁区能过的人里每四个就有一个打满，第一、第三这两个送分区只有一成出头——人多的地方，大家只求过线。
</div>
<div class="foot">数据来源：官方 Rank.QueryRank / Facade.QueryFacadeFields 接口抓取（season_83326，2026-11-23 09:18 快照，团队明细截至 09:41）；唤醒体 / 命轮 / 造物 / 钥令中文名参考 SKeyDB、灰机维基与官方公告。统计口径：每名玩家在五个禁区各自的队伍记录合并计算，同阵容（不计站位）计一次。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 2
function memChips(members, n = 4, size = 0) {
  const st = size ? ` style="width:${size}px"` : '';
  const im = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<div class="mem">${members.slice(0, n).map(m => {
    const img = imgPath(iconOf.char(m.en));
    return `<div class="m"${st}>${img ? `<img${im} src="file:///${img}">` : `<div style="width:${size || 36}px;height:${size || 36}px;background:#ddd"></div>`}
      <small>${esc(m.zh)}</small><u>${m.potency != null ? '+' + m.potency : ''}</u></div>`;
  }).join('')}</div>`;
}
const tokenZh = new Map();
for (const z of cur.zoneTop) tokenZh.set(z.champion.token, '');
const tokenName = (id) => {
  const hit = cur.top.tokens.find(t => t.id === id);
  return hit ? hit.zh : (cur.tokenTable?.[id] || '');
};
// 钥令名 + 图标（按 id 反查英文名）
const tokenTag = (id) => `<span class="nmico">${ic('token', (cur.tokenEn || {})[id] || '')}${esc(tokenName(id) || '—')}</span>`;

const s2 = `<div class="page">${head(2, 7, stamp)}${mast(kicker)}
<h2 class="lead">五大禁区，五种打法：<br><small>谁是 ▼ 难度的通关密码？</small></h2>
<div class="sub">统计各禁区「通关队伍」中达成最高难度（▼）的队伍：第一禁区 ${cur.zones[0].down} 队、第二禁区 ${cur.zones[1].down} 队、第三禁区 ${cur.zones[2].down} 队、第四禁区 ${cur.zones[3].down} 队、第五禁区 ${cur.zones[4].down} 队。同阵容（不计站位）合并计数，「出场」为该禁区全部队伍中的占比。</div>
${cur.zoneTop.map(z => {
  const zone = cur.zones[z.wave - 1];
  return `<div class="zblock">
  <div class="zt"><h3>${zone.name}</h3><span>▼ 通关 ${zone.down} 人 · 该区共 ${n0(zone.teams)} 队 · 最高分 ${zone.best} · 中位 ${zone.median}</span></div>
  <div class="zbody">
    <div><div class="ttl">冠军配队 · 第 ${z.champion.rank} 名 · ${z.champion.score} 分</div>
      ${memChips(z.champion.members)}
      <div class="mini" style="margin-top:5px">钥令：<b style="color:#3c2c1c">${tokenTag(z.champion.token)}</b></div>
    </div>
    <div><div class="ttl">最热门配队 Top 3</div>
      ${z.hot.map((h, i) => `<div class="hotline"><span class="rk">${i + 1}</span>${memChips(h.members).replace('class="mem"', 'class="mem" style="display:inline-flex"')}<span class="cnt">${h.count} 队</span></div>`).join('')}
    </div>
    <div><div class="ttl">最快通关 ▼ ${z.fastest ? '(' + z.fastest.rounds + ' 回合)' : ''}</div>
      ${z.fastest ? `<div class="mini">${esc(z.fastest.name)} · 第 ${z.fastest.rank} 名</div>${memChips(z.fastest.members)}<div class="mini" style="margin-top:4px">钥令：${tokenTag(z.fastest.token)}</div>` : '<div class="mini">无</div>'}
    </div>
    <div><div class="ttl">出场 Top 6 唤醒体</div>
      <ul class="rank1">${z.chars.map(c => `<li><span>${awico(c.en, 17)}<i>${esc(c.zh)}</i></span><span>${pct(c.n / zone.teams * 100)}%</span></li>`).join('')}</ul>
    </div>
    <div><div class="ttl">常用造物</div>
      <ul class="rank1">${z.creations.filter(c => !CREATION_SKIP.has(c.zh) && c.n / zone.teams < 0.99).slice(0, 6).map(c => `<li><span>${ic('relic', c.en, 16)}<i>${esc(c.zh)}</i></span><span>${pct(c.n / zone.teams * 100)}%</span></li>`).join('')}</ul>
      <div class="ttl" style="margin-top:6px">常用钥令</div>
      <ul class="rank1">${z.tokens.slice(0, 3).map(c => `<li><span>${ic('token', c.en, 17)}<i>${esc(c.zh)}</i></span><span>${pct(c.n / zone.teams * 100)}%</span></li>`).join('')}</ul>
    </div>
  </div></div>`;
}).join('')}
<div class="foot">口径：出场率 = 该禁区队伍中携带该唤醒体 / 造物 / 钥令的比例（同队去重）；最热门配队按「同阵容队伍数」排序，分数取该阵容最高。冠军配队为该禁区分数最高的队伍。造物榜已略去本季人人必备的「超维戒指」及其固定配件（携带率 ≥ 99%），以及不属于配装选择的「锈蚀钥匙」，否则五区清一色 100%、没有信息量。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 3
const rec = cur.records;
const recCell = (k, label, r, extra = '') => `<div class="rec"><div class="k">${label}</div><div class="v">${r ? (k === 'maxTotal' || k === 'maxHit' || k === 'counter' || k === 'tentacle' || k === 'poison' ? n0(r.value) : n0(r.value)) : '—'}</div>
  <div class="d">${r ? `第 ${r.rank} 名 · ${esc(r.name)} · ${r.wave ? '第' + ['一', '二', '三', '四', '五'][r.wave - 1] + '禁区' : ''}` : ''}</div>
  ${r && r.chars ? memChips(r.chars.map(c => ({ zh: c.zh, en: c.en })), 4) : ''}
  ${extra}</div>`;

const s3 = `<div class="page">${head(3, 7, stamp)}${mast(kicker)}
<h2 class="lead">${n0(Math.round(rec.maxHit.value / 1e4))} 万单回合伤害，<br><small>${rec.deathResist.value} 次死扛：本期的极限数据</small></h2>
<div class="sub">从 ${n0(rec.totalBattles)} 场战斗记录里按字段排出「全场最高」的九项，并统计 Top 2000 的唤醒体、命轮、密契、造物与钥令出场率。</div>
<div class="recs">
  <div class="rec"><div class="k">单回合最高伤害</div><div class="v">${n0(rec.maxHit.value)}</div><div class="d">第 ${rec.maxHit.rank} 名 · ${esc(rec.maxHit.name)} · 第${['一', '二', '三', '四', '五'][rec.maxHit.wave - 1]}禁区</div>${memChips(rec.maxHit.chars.map(c => ({ zh: c.zh, en: c.en })), 4)}</div>
  <div class="rec"><div class="k">单场总伤害之王</div><div class="v">${n0(rec.maxTotal.value)}</div><div class="d">第 ${rec.maxTotal.rank} 名 · ${esc(rec.maxTotal.name)} · 第${['一', '二', '三', '四', '五'][rec.maxTotal.wave - 1]}禁区</div>${memChips(rec.maxTotal.chars.map(c => ({ zh: c.zh, en: c.en })), 4)}</div>
  <div class="rec"><div class="k">单角色最高伤害</div><div class="v">${n0(rec.maxChar.value)}</div><div class="d">${esc(rec.maxChar.char.zh)} · 第 ${rec.maxChar.rank} 名 · 第${['一', '二', '三', '四', '五'][rec.maxChar.wave - 1]}禁区</div>${rec.maxChar.chars ? memChips(rec.maxChar.chars.map(c => ({ zh: c.zh, en: c.en })), 4) : ''}</div>
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
${cur.fastest.map(f => `<tr><td>第${['一', '二', '三', '四', '五'][f.wave - 1]}禁区</td><td><b>${f.rounds}</b></td><td>${esc(f.name)}</td><td><div class="mem" style="display:flex">${f.chars.map(c => { const img = imgPath(iconOf.char(c.en)); return `<div class="m">${img ? `<img src="file:///${img}">` : ''}<small>${esc(c.zh)}</small></div>`; }).join('')}</div></td></tr>`).join('')}
</tbody></table>
<div class="hr" style="margin-top:12px"></div>
<div class="pair">
  <div class="rankbox"><div class="h">出场榜 Top 10 <em>全部禁区 · 队伍占比</em></div>
    ${cur.top.chars.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${awico(c.en, 17)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.rate / cur.top.chars[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
  </div>
  <div class="rankbox"><div class="h">命轮 Top 6 <em>携带该命轮的队伍占比</em></div>
    ${cur.top.wheels.slice(0, 6).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${ic('wheel', c.en, 15)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.rate / cur.top.wheels[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
    <div class="h" style="margin-top:10px">密契 Top 6 <em>按队伍携带件数</em></div>
    ${cur.top.covs.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${ic('cov', c.en, 15)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.n / cur.top.covs[0].n * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
  </div>
</div>
<div class="two" style="margin-top:10px">
  <div><div class="h">造物 Top 8 <em>队伍携带率</em></div>
    ${(() => { const list = cur.top.creations.filter(c => !CREATION_SKIP.has(c.zh)).slice(0, 8); const mx = list[0]?.rate || 1; return list.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${ic('relic', c.en, 16)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.rate / mx * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join(''); })()}
  </div>
  <div><div class="h">钥令 Top 6 <em>队伍携带率</em></div>
    ${cur.top.tokens.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${ic('token', c.en, 17)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.rate / cur.top.tokens[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%</span></div>`).join('')}
    <div class="h" style="margin-top:8px">借用助战 Top 6 <em>被借次数</em></div>
    <div class="assist">${cur.top.assists.slice(0, 6).map((a, i) => `<span><b>${i + 1}</b> ${awico(a.en, 15)}${esc(a.zh)} <em>${n0(a.n)}</em></span>`).join('')}</div>
  </div>
</div>
<div class="foot">口径：「单回合最高伤害」「死扛」「反击」「触手」「力量」「毒伤」「生命」取 ${n0(rec.totalBattles)} 场战斗记录里的单场最大值，玩家名后标注其当期名次；出场率按队伍去重统计（2000 名玩家 × 五个禁区共 ${n0(cur.top.teamN)} 支队伍）；造物榜不含本季人人必备的环造物与「锈蚀钥匙」。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 4
const nch = cur.niche, mys = cur.mystery, dA = cur.deathAvg;
const s4 = `<div class="page">${head(4, 7, stamp)}${mast(kicker)}
<h2 class="lead">癫狂难度里，${nch.zeroDown.length} 位唤醒体<br><small>一次都没出场</small></h2>
<div class="sub">本版统计「癫狂」（▼）与 SSS 难度的队伍（含通关队与额外队）：共 <b>${n0(cur.zones.reduce((a, z) => a + z.down, 0))}</b> 队 ▼、<b>${n0(cur.zones.reduce((a, z) => a + z.threats.SSS, 0))}</b> 队 SSS 通关队。全部 ${nch.allChars} 个出场过的唤醒体里，只有 ${nch.hardChars} 个在 ▼ / SSS 露过面，其中又有 <b>${nch.zeroDown.length}</b> 个一次 ▼ 都没打。</div>
<div class="hr2"></div>
<div class="h">癫狂（▼）零出场 <em>本期有出场但 ▼ 队里一次未出现</em></div>
<div style="display:flex;align-items:center;gap:16px;margin:6px 0 12px">
  <div class="mem">${nch.zeroDown.map(c => { const img = imgPath(iconOf.char(c.en)); return `<div class="m" style="width:52px">${img ? `<img style="width:50px;height:50px" src="file:///${img}">` : ''}<small>${esc(c.zh)}</small></div>`; }).join('') || '<span class="mini">无</span>'}</div>
  <div class="mini" style="flex:1;border-left:1px solid #c3b393;padding-left:14px">
    ${nch.leastDown.filter(c => c.n === 0).map(c => `<b>${esc(c.zh)}</b>：全部 ${c.all} 支队伍里，▼ 队 0 支——它在 SSS 及以下都有人用，唯独没人拿它打癫狂。`).join('<br>')}
    ${nch.zeroBoth.length ? `<br><b>${nch.zeroBoth.map(c => esc(c.zh)).join('、')}</b>更极端：▼ 与 SSS 两档加起来一次都没出现，只出现在 SS 及以下。` : ''}
  </div>
</div>
<div class="h">癫狂（▼）出场最少 Top 8 <em>括号内为全部禁区的出场队伍数</em></div>
<table class="ftbl" style="margin-bottom:12px"><thead><tr><th>唤醒体</th><th>▼ 出场队伍</th><th>全部出场</th><th>▼ 占比</th></tr></thead><tbody>
${nch.leastDown.map(c => `<tr><td><span class="nmico">${awico(c.en, 18)}${esc(c.zh)}</span></td><td>${c.n}</td><td>${c.all}</td><td>${pct(c.all ? c.n / c.all * 100 : 0)}%</td></tr>`).join('')}
</tbody></table>
<div class="h">神秘配队 Top 5 <em>▼ + SSS 难度里只有一队使用的阵容</em></div>
${cur.mysteryLineups.map((m, i) => `<div class="zblock" style="margin-bottom:4px"><div class="zt" style="padding:3px 10px"><h3 style="font-size:14px">${i + 1}. ${esc(m.members[0].zh)} 队</h3><span>第 ${m.rank} 名 · ${m.score} 分 · 全服仅 ${m.count} 队</span></div><div class="zbody" style="grid-template-columns:1fr;padding:4px 10px"><div style="display:flex;align-items:center;gap:18px">
  ${memChips(m.members, 4, 42)}
  <div class="myinfo">
    <span>禁区</span><b>${WAVE_NAME[m.wave] || '—'}</b><i>|</i>
    <span>难度</span><b>${m.threat} 通关</b><i>|</i>
    <span>钥令</span><b>${tokenTag(m.token)}</b>
  </div>
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
    ${dA.chars.map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${awico(c.en, 16)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.avg / dA.chars[0].avg * 100}%"></b></span><span class="v">${c.avg}<em> ${c.n} 场</em></span></div>`).join('')}
  </div>
  <div class="rankbox"><div class="h">平均死扛最高的玩家 Top 5 <em>▼+SSS，至少 5 场</em></div>
    ${dA.players.map((p, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${esc(p.name)}</span><span class="track"><b style="width:${p.avg / dA.players[0].avg * 100}%"></b></span><span class="v">${p.avg}<em> #${p.rank}</em></span></div>`).join('')}
  </div>
</div>
<div class="foot">口径：「出场」按队伍去重，一支队伍带两名同名唤醒体的只算一次；▼ 与 SSS 分别统计该难度的通关队。平均死扛 = 该唤醒体 / 玩家在 ▼+SSS 战斗里的死扛触发次数均值。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 5
const enl = cur.enlight;                 // every awakener seen in a ▼/SSS team
const eS = cur.enlightSummary;
const enlColor = { '0-2': '#3d6b46', '3-5': '#d9c06a', '6-8': '#c98f4a', '9-11': '#a1281b', '12+': '#6d1a12' };
const BK = ['0-2', '3-5', '6-8', '9-11', '12+'];
const big5 = enl.filter(r => !r.small);      // 20 场以上：主榜
const small5 = enl.filter(r => r.small);     // 不足 20 场：附在主榜之后
const halfBig = Math.ceil(big5.length / 2);
const halfSmall = Math.ceil(small5.length / 2);
const top3big = enl.filter(r => r.n >= 20).slice(0, 3);
const hardTeams = cur.zones.reduce((a, z) => a + z.down, 0);
const sssTeams = cur.zones.reduce((a, z) => a + z.threats.SSS, 0);
const row5 = (r, i) => `<div class="enlrow"><span class="p">${i + 1}</span>
  <span class="av">${ic('char', r.en, 22)}</span>
  <span class="nm">${esc(r.zh)}<em>${r.n} 场${r.small ? ' ※' : ''}</em></span>
  <span class="track">${BK.map(k => `<i style="width:${r.dist[k] / r.n * 100}%;background:${enlColor[k]}"></i>`).join('')}</span>
  <span class="pc">${pct(r.p12)}%</span></div>`;

const s5 = `<div class="page">${head(5, 7, stamp)}${mast(kicker)}
<h2 class="lead">▼ 与 SSS 难度里，<br><small>${pct(cur.enlight12)}% 的出场位已经 +12</small></h2>
<div class="sub">统计 ▼ 与 SSS 难度的 ${n0(hardTeams + sssTeams)} 支队伍（含通关队与额外队），共 ${n0(eS.n)} 个唤醒体出场位，按各唤醒体「+12」占比从高到低排序——在 ▼ / SSS 出场过的 <b>${enl.length}</b> 个唤醒体全部列入（出场位不足 20 场的另列在末尾）。主榜里 +12 占比最高的是：${top3big.map(r => `<b>${esc(r.zh)}</b> ${pct(r.p12)}%`).join('、')}。</div>
<div class="legend5">
  ${BK.map(k => `<span><i style="background:${enlColor[k]}"></i>${k} 启 · ${n0(eS.dist[k])} 个出场位（${pct(eS.dist[k] / eS.n * 100)}%）</span>`).join('')}
  <span class="rt">条 = 启灵构成 · 右侧数字 = +12 占比 · 小字 = 出场位，※ 为不足 20 场</span>
</div>
<div class="hr2"></div>
<div class="enlw">
  <div>${big5.slice(0, halfBig).map((r, i) => row5(r, i)).join('')}</div>
  <div>${big5.slice(halfBig).map((r, i) => row5(r, i + halfBig)).join('')}</div>
</div>
<div class="subh">出场位不足 20 场 <em>※ 一两个满启玩家就能把比例推满，排在后面仅供参考</em></div>
<div class="enlw">
  <div>${small5.slice(0, halfSmall).map((r, i) => row5(r, i + big5.length)).join('')}</div>
  <div>${small5.slice(halfSmall).map((r, i) => row5(r, i + big5.length + halfSmall)).join('')}</div>
</div>
<div class="foot">口径：启灵 = 唤醒体的潜能等级（0-15，本版分 0-2 / 3-5 / 6-8 / 9-11 / 12+ 五段，+12 及以上为满启）；同一队伍里同一唤醒体只计一次，出场位 = 该唤醒体在 ▼ / SSS 队伍中的出场次数。<b>※ 标记的唤醒体出场位不足 20 场</b>，一两个满启玩家就能把比例推到 100%，排序看看即可。全场平均启灵 ${eS.avgPotency}：▼ 通关队 ${pct(eS.byThreat['▼'].p12)}% 的出场位满启，SSS 通关队 ${pct(eS.byThreat.SSS.p12)}%；按部分段看，队伍平均启灵 0-2 时平均 ${eS.roundsByBucket[0].avg} 回合收工、12 以上 ${eS.roundsByBucket[4].avg} 回合。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 6
const zc = cur.zones, zp = prev.zones;
const chg = (a, b) => (b.down ? (a.down >= b.down ? '+' : '') + Math.round((a.down / b.down - 1) * 100) + '%' : '—');
const downTotal = zc.reduce((a, z) => a + z.down, 0);
const downPrev = zp.reduce((a, z) => a + z.down, 0);
const dlt = (now, before, unit = '') => {
  const d = Math.round((now - before) * 10) / 10;
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

const s6 = `<div class="page">${head(6, 7, stamp)}${mast(kicker)}
<h2 class="lead">超维戒指对比血肉戒指：<br><small>▼ 通关 ${downPrev} → ${downTotal}（${downTotal >= downPrev ? '+' : ''}${Math.round((downTotal / downPrev - 1) * 100)}%）</small></h2>
<div class="sub">同样统计终榜 Top 2000：第 73 期上榜门槛 ${cur.threshold} 分（上期 ${prev.threshold}），满分人数 ${prev.ge['525']} 人变为 ${cur.ge['525']} 人，各禁区的 ▼ 通关总数合计 ${downPrev} → ${downTotal}，▼+SSS 战斗的平均回合从 ${prev.avgRounds.hard} 回合降到 <b>${cur.avgRounds.hard}</b> 回合（${Math.round((cur.avgRounds.hard / prev.avgRounds.hard - 1) * 100)}%）。</div>
<div class="cmp">
  ${cmpCell('525 满分', cur.ge['525'], prev.ge['525'])}
  ${cmpCell('≥ 500 分', cur.ge['500'], prev.ge['500'])}
  ${cmpCell('≥ 450 分', cur.ge['450'], prev.ge['450'])}
  ${cmpCell('平均分', cur.mean, prev.mean)}
  ${cmpCell('中位分', cur.median, prev.median)}
  <div class="c"><span>▼ 通关总数</span><b>${downTotal}</b><b style="font-size:13px;color:#6a5740">${downPrev}</b><i class="up">+${Math.round((downTotal / downPrev - 1) * 100)}%</i></div>
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
      return `<div class="hz"><span class="zl">${z.name}</span><span class="vstack">
        <span class="line"><i class="bar2" style="width:${z.down / max * 100}%"></i><em>${z.down}</em></span>
        <span class="line"><i class="bar" style="width:${p.down / max * 100}%"></i><em>${p.down}</em></span>
      </span><span class="dl ${z.down >= p.down ? 'up' : 'down'}">${p.down ? chg(z, p) : ''}</span></div>`;
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
    ${cur.top.chars.slice(0, 8).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${awico(c.en, 16)}<i>${esc(c.zh)}</i></span><span class="track"><b style="width:${c.rate / cur.top.chars[0].rate * 100}%"></b></span><span class="v">${pct(c.rate)}%<em> (${pct(prevChars.get(c.zh) ?? 0)})</em></span></div>`).join('')}
  </div>
  <div><div class="h">出场率上升最多 <em>百分点</em></div>
    ${risers.map(c => `<div class="rankrow"><span class="p">▲</span><span class="n">${awico(c.en, 16)}<i>${esc(c.zh)}</i></span><span class="v" style="width:auto">+${pct(c.d)}</span></div>`).join('')}
    <div class="h" style="margin-top:8px">出场率下降最多</div>
    ${fallers.map(c => `<div class="rankrow"><span class="p">▼</span><span class="n">${awico(c.en, 16)}<i>${esc(c.zh)}</i></span><span class="v" style="width:auto">${pct(c.d)}</span></div>`).join('')}
  </div>
</div>
<div class="pair" style="margin-top:8px">
  <div><div class="h">钥令 Top 4</div>${cur.top.tokens.slice(0, 4).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${ic('token', c.en, 17)}<i>${esc(c.zh)}</i></span><span class="v" style="width:auto">${pct(c.rate)}%<em> (${pct(prevToken.get(c.zh) ?? 0)})</em></span></div>`).join('')}</div>
  <div><div class="h">命轮 Top 4</div>${cur.top.wheels.slice(0, 4).map((c, i) => `<div class="rankrow"><span class="p">${i + 1}</span><span class="n">${ic('wheel', c.en, 15)}<i>${esc(c.zh)}</i></span><span class="v" style="width:auto">${pct(c.rate)}%<em> (${pct(prevWheel.get(c.zh) ?? 0)})</em></div>`).join('')}</div>
</div>
<div class="h" style="margin-top:8px">装备变化速记 <em>括号内为该装备上期的携带率</em></div>
<div class="mini" style="font-size:9.8px;line-height:1.85">
  造物：${(() => { const m = new Map(prev.top.creations.map(c => [c.zh, c.rate])); return cur.top.creations.filter(c => !CREATION_SKIP.has(c.zh)).slice(0, 3).map(c => `${ic('relic', c.en, 14)}${esc(c.zh)} ${pct(c.rate)}%（${pct(m.get(c.zh) ?? 0)}%）`).join('　'); })()}<br>
  密契：${(() => { const m = new Map(prev.top.covs.map(c => [c.zh, c.rate])); return cur.top.covs.slice(0, 3).map(c => `${ic('cov', c.en, 14)}${esc(c.zh)} ${pct(c.rate)}%（${pct(m.get(c.zh) ?? 0)}%）`).join('　'); })()}
</div>
<div class="close">
  <div><div class="k">涨得最猛</div><div class="v">第一禁区 <b>${chg(zc[0], zp[0])}</b></div>
    <div class="d">▼ 通关 ${zp[0].down} → ${zc[0].down} 人；第三禁区同样从 ${zp[2].down} 涨到 ${zc[2].down}（${chg(zc[2], zp[2])}）。反过来第二、四、五禁区各退了 ${chg(zc[1], zp[1]).replace(/[+-]/g, '')} / ${chg(zc[3], zp[3]).replace(/[+-]/g, '')} / ${chg(zc[4], zp[4]).replace(/[+-]/g, '')}，五区合计 ${downPrev} → ${downTotal}。</div></div>
  <div><div class="k">分数线整体下移，顶端更集中</div><div class="v">中位 <b>${Math.round(prev.median)} → ${Math.round(cur.median)}</b></div>
    <div class="d">平均 ${pct(prev.mean)} → ${pct(cur.mean)}，≥450 分从 ${prev.ge['450']} 掉到 ${cur.ge['450']}；但 525 满分反从 ${prev.ge['525']} 人增到 ${cur.ge['525']} 人，500 分以上却从 ${prev.ge['500']} 降到 ${cur.ge['500']}。</div></div>
  <div><div class="k">极限被抬高</div><div class="v">单场 <b>${n0(Math.round(prev.records.maxTotal.value / 1e4))} 万 → ${n0(Math.round(rec.maxTotal.value / 1e4))} 万</b></div>
    <div class="d">单回合最高伤害 ${n0(Math.round(prev.records.maxHit.value / 1e4))} 万 → ${n0(Math.round(rec.maxHit.value / 1e4))} 万（+${Math.round((rec.maxHit.value / prev.records.maxHit.value - 1) * 100)}%），单场总伤害 +${Math.round((rec.maxTotal.value / prev.records.maxTotal.value - 1) * 100)}%；死扛纪录仍是 ${rec.deathResist.value} 次。</div></div>
</div>
<div class="foot">口径：两期均按各自终榜 Top 2000 统计；▼ 通关数为五个禁区 ▼ 难度通关队伍之和；出场率括号内为第 72 期同口径数据。制图：忘忘看报。</div>
</div>`;

// ---------------------------------------------------------------- spread 7（低配榜）
const LC = cur.lowcost;
const memInline = (members, size = 15) => members.map(m => {
  const img = imgPath(iconOf.char(m.en));
  return `<span class="mb">${img ? `<img style="width:${size}px;height:${size}px" src="file:///${img}">` : ''}<span>${esc(m.zh)}</span><i>+${m.potency ?? 0}</i></span>`;
}).join('');
const memStack = (members) => members.map(m => {
  const img = imgPath(iconOf.char(m.en));
  return `<div class="bm">${img ? `<img src="file:///${img}">` : ''}<span>${esc(m.zh)}</span><i>+${m.potency ?? 0}</i></div>`;
}).join('');

// A. 每个禁区 × ▼ / SSS 的最低配三套
const lr = (p) => `<div class="lrow">${memInline(p.members)}<span class="lm"><b>${p.potSum}</b> /60 · 第 ${p.rank} 名 · ${p.total} 分 · ${p.rounds} 回合</span></div>`;
const zblock = (z) => `<div class="zblk">
  <div class="zh"><b>${WAVE_NAME[z.wave]}</b><em>▼ 队伍 ${z.down.teams} 支 · SSS ${z.sss.teams} 支</em>
    <span class="rt">该区 ▼ 通关率 <b>${pct(cur.zones[z.wave - 1].downRate)}</b></span></div>
  <div class="zcols">
    <div class="zcol"><div class="zt">▼ 癫狂<b>最低 ${z.down.potMin}</b><em>中位 ${Math.round(z.down.potMedian)} / 60</em></div>${z.down.picks.map(lr).join('')}</div>
    <div class="zcol"><div class="zt">SSS<b>最低 ${z.sss.potMin}</b><em>中位 ${Math.round(z.sss.potMedian)} / 60</em></div>${z.sss.picks.map(lr).join('')}</div>
  </div>
</div>`;

// B. 每个分数段里「五队均启灵」最低的玩家，列出他全部队伍
const bband = (b) => {
  const p = b.best;
  return `<div class="bband">
  <div class="bhead"><h3>${b.label} 分</h3><em>${b.players} 位玩家 · 队伍 ${b.teams} 支（▼ ${b.downTeams} 支）</em>
    <span class="rt">该档 ▼ 启灵中位 <b>${Math.round(b.potMedian)}</b> · 最省 <b>${b.potMin}</b></span></div>
  <div class="bwho"><span>最省玩家 <b>${esc(p.name)}</b>　第 ${p.rank} 名 · 总分 <i>${p.score}</i>　<em>全部 ${p.teams} 支队伍平均启灵</em> <i>${p.avgPot}</i> <em>· 合计 ${p.sumPot} / ${p.teams * 60}</em></span>
    ${p.top3 && p.top3[1] ? `<span class="rt">该档次省 ${esc(p.top3[1].name)} <i>${p.top3[1].avgPot}</i>　第三 ${esc(p.top3[2] ? p.top3[2].name : '—')} <i>${p.top3[2] ? p.top3[2].avgPot : ''}</i></span>` : ''}</div>
  <div class="bcols" style="grid-template-columns:repeat(${p.items.length},1fr)">${p.items.map(it => `<div class="bcol">
    <div class="bch">${WAVE_NAME[it.wave]} <b>${it.threat}</b><span>${it.zoneScore} 分</span></div>
    ${memStack(it.members)}
    <div class="bcf">启灵 <b>${it.potSum}</b> · ${it.rounds} 回合</div>
  </div>`).join('')}</div>
</div>`;
};

const s7 = `<div class="page">${head(7, 7, stamp)}${mast(kicker)}
<h2 class="lead">同样的分数，<br><small>只用别人一半的启灵就打下来</small></h2>
<div class="sub">「启灵总和」把一支队伍四名唤醒体的启灵（潜能等级 0-15）相加，满配 60，是配装成本最直观的近似。上半是<b>每个禁区、▼ 与 SSS 两个难度各自启灵总和最低的三套阵容</b>；下半从三档分数段里各挑出「全部队伍平均启灵」最低的那位玩家，把他的全部队伍摊开。全服 ${n0(LC.downN)} 支 ▼ 队伍里，最省的一支只要 <b>${LC.potMin}</b> 点启灵；SSS 更极端，${LC.sssN} 支里最低只要 <b>${LC.sssMin}</b>。</div>
<div class="grid-stats">
  <div class="stat"><span>▼ 通关队伍</span><b>${n0(LC.downN)}</b><i>支</i></div>
  <div class="stat"><span>▼ 启灵中位</span><b>${Math.round(LC.potMedian)}</b><i>/ 60</i></div>
  <div class="stat hot"><span>▼ 最低配</span><b>${LC.potMin}</b><i>启灵总和</i></div>
  <div class="stat"><span>SSS 队伍</span><b>${n0(LC.sssN)}</b><i>支</i></div>
  <div class="stat hot"><span>SSS 最低配</span><b>${LC.sssMin}</b><i>启灵总和</i></div>
  <div class="stat"><span>≤ 25 启灵的 ▼ 队</span><b>${n0(LC.le['25'])}</b><i>${pct(LC.le['25'] / LC.downN * 100)}%</i></div>
</div>
<div class="hr2" style="margin-top:10px"></div>
<div class="h">一 · 各禁区的最低配阵容 <em>每格三条：该区该难度下启灵总和最低的三套，同阵容（不计站位）只算一次</em></div>
${LC.zones.map(zblock).join('')}
<div class="hr2"></div>
<div class="h">二 · 三档分数段里最省的玩家 <em>选出条件：该档内「全部队伍的平均启灵」最低，不设队伍数门槛——用总和排会让交得少的玩家天然占便宜</em></div>
<div class="btot"><span>三档共 <b>${n0(LC.bands.reduce((a, b) => a + b.players, 0))}</b> 位玩家参与评比</span>
  <span>三档最省玩家的平均启灵：<b>${LC.bands.map(b => b.best.avgPot).join(' / ')}</b></span>
  <span>每格右上是这支队伍在该区的得分</span></div>
${LC.bands.map(bband).join('')}
<div class="note" style="font-size:9.6px;line-height:1.6;margin-top:2px">
  读法：一律比「平均启灵」——最省的玩家把全部队伍的平均启灵压到该档 ▼ 中位的一半以下（<b>${LC.bands.map(b => b.best.avgPot).join(' / ')}</b> 对 ${LC.bands.map(b => Math.round(b.potMedian)).join(' / ')}）。
  禁区差别更大：第五禁区 ▼ 最省也要 <b>${LC.zones[4].down.potMin}</b> 点（中位 ${Math.round(LC.zones[4].down.potMedian)}），第三禁区只要 <b>${LC.zones[2].down.potMin}</b>，SSS 的极端值在第一禁区（<b>${LC.zones[0].sss.potMin}</b> 点）；第二、四、五禁区 ▼ 只有 ${Math.min(LC.zones[1].down.teams, LC.zones[3].down.teams, LC.zones[4].down.teams)}–${Math.max(LC.zones[1].down.teams, LC.zones[3].down.teams, LC.zones[4].down.teams)} 支，样本小。全服只交三、四支队伍的 49 位玩家总分都在 450 以下，本就不进这三档。
</div>
<div class="foot">口径：「启灵总和」= 队伍四名唤醒体的潜能等级之和（每人 0-15，满配 60）。第一段每格取该禁区该难度（▼ 癫狂 / SSS）全服所有队伍里启灵总和最低的三套，同阵容（不计站位）只取一次，附排名、该玩家总分与该场回合数；第二段按玩家五个禁区的结算总分分档（500–525 / 475–500 / 450–475），按「全部队伍启灵总和 ÷ 队伍数」即平均启灵排序，取该档最低的一位（不设队伍数门槛），列出他提交的全部队伍。只统计终榜 Top 2000 内玩家。制图：忘忘看报。</div>
</div>`;

const pages = [s1, s2, s3, s4, s5, s6, s7];
pages.forEach((html, i) => {
  const doc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>融灾第73期特刊-第${i + 1}版</title><style>${CSS}</style></head><body>${html}</body></html>`;
  fs.writeFileSync(path.join(OUT, `s${i + 1}.html`), doc, 'utf8');
});
console.log('wrote', pages.length, 'pages to', OUT);
