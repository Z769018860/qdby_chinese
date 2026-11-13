#!/usr/bin/env node
/* 字形模板生成器 —— 产出 morimens-box-ocr.js 里的 DIGIT_PROTO_B64
 *
 * 为什么需要它：等级 / 启灵 / 叠位这些数字用的是游戏自己那套像素衬线字，通用 OCR 在上面
 * 会稳定地认错（80→30、空槽位→+1）。改成模板分类器后，模板必须从**真实截图**里取，
 * 不能手画。这个脚本负责把人工标注过的样本变成源码里的那张表。
 *
 * 三步：
 *   1. 采样本：打开仓库页面，控制台执行（或在测试页里跑）
 *        window.MorimensBoxOCR.collect(file, 'char')   // 角色页
 *        window.MorimensBoxOCR.collect(file, 'wheel')  // 命轮页
 *      每格会带 lvG / enG（切出来的字形 + 14x18 归一化位图的 4 级量化串 q）和 lvBoxes。
 *      把返回的 {files:[...]} 存成一份 JSON。
 *   2. 标注：把每格真实的等级 / 启灵数字填进下面的 LABELS（key = 文件名 tag，
 *      值按 r*4+j 顺序排）。看不清或本来就是空的写 null / ''。
 *   3. node scripts/gen-glyph-proto.mjs samples.json
 *      会打印新的 DIGIT_PROTO_B64，粘回 morimens-box-ocr.js 即可；同时给出
 *      「留一图」和「留一类」两组准确率，用来确认模板够用。
 *
 * 模板编码：GW*GH = 14*18 = 252 个像素，每个 2bit（0=背景 … 3=墨），
 * 打包成 63 字节再 base64，一张模板 84 个字符。每类留 6 张（贪心挑最不一样的那几张）。
 *
 * 关于「模板侧再模糊一遍」（下面 blur3(q2v(x.q))）：q 里存的已经过 normGlyph 的 blur3，
 * 所以这是第二遍。看着像 bug，但实测分离度略好（留一图 p10 0.867 vs 0.849，
 * 留一类上限 0.620 vs 0.610，都是 K=6 贪心）——等于把模板做成更平滑的泛化版本。
 * 改它之前先跑 H:/work/tmp/boxrec/eval.mjs 量一下，别凭直觉删。
 *
 * 注意：samples.json（十几 MB）和那几张回归截图都是游戏画面，**不入库**，
 * 只在本地跑；仓库里只有这个脚本和最终那张表。缺样本时按上面第 1 步重新采。
 */
import fs from 'fs';

const GW = 14, GH = 18, N = GW * GH;

/* ---------------- 人工标注（改这里） ---------------- */
// 等级：按 r*4+j 排；null = 这一格没读出/被裁掉
const LABELS_LV = {
  u1: [80, 80, 80, 80, 80, 70, 70, 70, 70, 70, 70, 70],
  u2: [70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70],
  u3: [70, 70, 70, 70, 70, 65, 65, 65, 65, 60, 60, 60],
  'box-1': [74, 60, 80, 70, 68, 64, 64, 64, 62, 62, 60, 60],
  'box-2': [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60],
};
// 启灵：星标行末尾那个「+N」的数字（不是总启灵数）；'' = 那一格没有数字
const LABELS_EN = {
  u1: ['4', '5', '12', '4', '4', '12', '4', '4', '4', '12', '12', '4'],
  u2: ['', '4', '4', '12', '4', '4', '12', '2', '4', '4', '4', '4'],
  u3: ['4', '', '12', '12', '12', '11', '8', '8', '8', '', '9', '6'],
  'box-1': ['1', '4', '12', '', '', '', '', '', '', '', '6', ''],
  'box-2': ['', '', '', '', '4', '9', '1', '4', '', '', '4', ''],
};
/* ---------------------------------------------------- */

const input = process.argv[2] || 'samples.json';
const data = JSON.parse(fs.readFileSync(input, 'utf8'));

const q2v = (s) => [...s].map((c) => Number(c) / 3);
function zeroMean(v) {
  let mu = 0;
  for (const x of v) mu += x;
  mu /= v.length;
  const o = v.map((x) => x - mu);
  let s = 0;
  for (const x of o) s += x * x;
  const n = Math.sqrt(s) || 1;
  return o.map((x) => x / n);
}
// 和源码里的 blur3 一致：3x3 高斯，让匹配对 ±1px 定位误差不敏感
function blur3(v) {
  const o = new Array(N).fill(0);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= GH || xx < 0 || xx >= GW) continue;
          const k = (dy ? 1 : 2) * (dx ? 1 : 2);
          s += v[yy * GW + xx] * k;
          n += k;
        }
      }
      o[y * GW + x] = s / n;
    }
  }
  return o;
}

const fillOf = (v) => {
  let f = 0;
  for (const t of v) f += t;
  return f / N;
};
/* 切样本：一格里切出的字形个数必须和标注长度一致，否则说明框切歪了，丢掉。
   每张样本存两套位图，因为**模板侧和查询侧不是同一个口径**：
     q    = collect() 导出的 4 级量化位图，等于运行时 normGlyph 的输出（已模糊一遍）
     bmQ/fillQ = 查询侧：直接用 q，和运行时拿到的完全一致 → 验证用这一套
     bm /fill  = 模板侧：再平滑一遍（实测分离度略好）→ 真正写进表里的是这一套
   混用会导致「验证的配置」和「发货的配置」不一致，之前就吃过这个亏。 */
const samples = [];
const addSample = (digit, tag, src, q) => {
  const v = q2v(q);
  const bt = blur3(v);
  samples.push({
    digit: digit, img: tag, src: src, q: q,
    bm: zeroMean(bt), fill: fillOf(bt),        // 模板侧
    bmQ: zeroMean(v), fillQ: fillOf(v),        // 查询侧（= 运行时）
  });
};
for (const f of data.files || []) {
  if (f.kind !== 'char') continue;
  const tag = f.tag;
  for (const c of f.cells || []) {
    const idx = c.cell.r * 4 + c.cell.j;
    const lv = (LABELS_LV[tag] || [])[idx];
    const g = (c.lvG && c.lvG.glyphs) || [];
    if (lv && String(lv).length === g.length) {
      const s = String(lv);
      g.forEach((x, i) => addSample(s[i], tag, 'lv', x.q));
    }
    const en = (LABELS_EN[tag] || [])[idx];
    const eg = (c.enG && c.enG.glyphs) || [];
    if (en && en.length === eg.length) {
      [...en].forEach((ch, i) => addSample(ch, tag, 'en', eg[i].q));
    }
  }
}
const counts = {};
for (const s of samples) counts[s.digit] = (counts[s.digit] || 0) + 1;
console.log('样本', samples.length, JSON.stringify(counts));

const ncc = (a, b) => {
  let s = 0;
  for (let i = 0; i < N; i++) s += a[i] * b[i];
  return s;
};
/* 每类模板张数。**验证和输出共用这一个 K**，否则「验证过的」和「发出去的」不是同一份，
   留一类上限就会报得比实际安全（曾经报 0.651、实际只有 0.620）。 */
const K = 6;
const DEDUPE = 0.995;
/* 同类里按「与已选集合最不相似」贪心挑：种子取离类内均值最近（最典型）的那张，
   之后每次补最不像已选的 —— 同样张数下覆盖面最大 */
function pickK(list) {
  if (list.length <= K) return list;
  const mean = new Array(N).fill(0);
  for (const it of list) for (let i = 0; i < N; i++) mean[i] += it.bm[i] / list.length;
  let seed = 0, bestSim = -9;
  list.forEach((it, i) => {
    const sc = ncc(it.bm, mean);
    if (sc > bestSim) { bestSim = sc; seed = i; }
  });
  const picked = [list[seed]];
  const rest = list.filter((_, i) => i !== seed);
  while (picked.length < K && rest.length) {
    let pick = -1, worst = 9;
    for (let i = 0; i < rest.length; i++) {
      let mx = -9;
      for (const p of picked) { const sc = ncc(rest[i].bm, p.bm); if (sc > mx) mx = sc; }
      if (mx < worst) { worst = mx; pick = i; }
    }
    picked.push(rest[pick]);
    rest.splice(pick, 1);
  }
  return picked;
}
function build(list) {
  const dedup = {};
  for (const s of list) {
    const arr = dedup[s.digit] || (dedup[s.digit] = []);
    if (arr.some((p) => ncc(p.bm, s.bm) > DEDUPE)) continue; // 近似重复只留一张
    arr.push(s);
  }
  const P = {};
  for (const d of Object.keys(dedup)) P[d] = pickK(dedup[d]);
  return P;
}
function classify(P, v, fill) {
  let best = { digit: '', score: -9 };
  const per = {};
  for (const d of Object.keys(P)) {
    let top = -9;
    for (const p of P[d]) {
      const sc = ncc(v, p.bm) - Math.abs(fill - p.fill) * 0.6;
      if (sc > top) top = sc;
    }
    per[d] = top;
    if (top > best.score) best = { digit: d, score: top };
  }
  let second = -9;
  for (const d of Object.keys(per)) if (d !== best.digit && per[d] > second) second = per[d];
  return { digit: best.digit, score: best.score, margin: best.score - second };
}

/* 留一图：用「其它截图」的模板认这张图，检验跨分辨率泛化 */
const imgs = [...new Set(samples.map((s) => s.img))];
let tot = 0, bad = 0;
const miss = {};
for (const img of imgs) {
  const P = build(samples.filter((s) => s.img !== img));
  for (const s of samples.filter((s) => s.img === img)) {
    const r = classify(P, s.bmQ, s.fillQ);   // 查询侧口径
    tot++;
    if (r.digit !== s.digit) {
      bad++;
      miss[s.digit + '->' + r.digit] = (miss[s.digit + '->' + r.digit] || 0) + 1;
      console.log('  MISS', s.img, s.src, 'want', s.digit, 'got', r.digit, r.score.toFixed(3));
    }
  }
}
console.log(`留一图验证: ${tot - bad}/${tot} 正确`, JSON.stringify(miss));

/* 留一类：模拟「某一类模板缺失」时会不会被认成别的数字。认不准就必须被分数门槛挡住 */
console.log('留一类验证（缺类时会错认成什么、分数多高）：');
for (const hold of Object.keys(build(samples))) {
  const Q = build(samples.filter((s) => s.digit !== hold));
  const rows = samples.filter((s) => s.digit === hold).map((s) => classify(Q, s.bmQ, s.fillQ));
  if (!rows.length) continue;
  const sc = rows.map((r) => r.score).sort((a, b) => a - b);
  console.log(`  抽掉 ${hold} (n=${rows.length}) → 错认成 ${[...new Set(rows.map((r) => r.digit))].join(',')}`,
    '分数中位', sc[sc.length >> 1].toFixed(3), '最高', sc[sc.length - 1].toFixed(3));
}

/* 输出模板表：每类 K 张，按「与已选集合最不相似」贪心挑 —— 同样张数下覆盖面最大。
   实测（H:/work/tmp/boxrec/eval.mjs，留一图）：
     顺序取 3 张 156/159，得分 p10 0.727
     贪心 4 张 159/159；贪心 6 张 p10 0.849（不限量的上限只有 0.860）
   代价只是表从约 2.3KB 变约 4KB，匹配耗时忽略不计。 */
function packQ(q) {
  const bytes = new Uint8Array(Math.ceil(N / 4));
  for (let i = 0; i < N; i++) bytes[i >> 2] |= (Number(q[i]) & 3) << ((i & 3) * 2);
  return Buffer.from(bytes).toString('base64');
}
const PICKED = build(samples); // 与上面两组验证用的是同一批（同 K、同去重）
const out = {};
for (const d of Object.keys(PICKED).sort()) out[d] = PICKED[d].map((it) => packQ(it.q));
console.log('每类模板数', Object.keys(out).sort().map((d) => d + ':' + out[d].length).join(' '));
/* 输出成品一整行，避免「只换半个对象」把后面的 b64Bytes / decodeProto 吞掉。
   用法：在 morimens-box-ocr.js 里定位到 `const DIGIT_PROTO_B64=` 开头的那一行
   （整张表就是一行，以 `};` 结尾），整行替换成下面打印的内容，然后务必
   `node --check morimens-box-ocr.js` 过一遍语法。 */
const line = '  const DIGIT_PROTO_B64=' + JSON.stringify(out) + ';';
console.log('\n把 morimens-box-ocr.js 里以 `  const DIGIT_PROTO_B64=` 开头、以 `};` 结尾的**那一整行**换成：');
console.log(line);
console.log('\n（换完执行 node --check morimens-box-ocr.js）');
