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
 * 打包成 63 字节再 base64，一张模板 84 个字符。每类最多留 3 张（跨图取样）。
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

/* 切样本：一格里切出的字形个数必须和标注长度一致，否则说明框切歪了，丢掉 */
const samples = [];
for (const f of data.files || []) {
  if (f.kind !== 'char') continue;
  const tag = f.tag;
  for (const c of f.cells || []) {
    const idx = c.cell.r * 4 + c.cell.j;
    const lv = (LABELS_LV[tag] || [])[idx];
    const g = (c.lvG && c.lvG.glyphs) || [];
    if (lv && String(lv).length === g.length) {
      const s = String(lv);
      g.forEach((x, i) => {
        const bm = blur3(q2v(x.q));
        let fill = 0;
        for (const t of bm) fill += t;
        samples.push({ digit: s[i], img: tag, src: 'lv', bm: zeroMean(bm), fill: fill / N, q: x.q });
      });
    }
    const en = (LABELS_EN[tag] || [])[idx];
    const eg = (c.enG && c.enG.glyphs) || [];
    if (en && en.length === eg.length) {
      [...en].forEach((ch, i) => {
        const bm = blur3(q2v(eg[i].q));
        let fill = 0;
        for (const t of bm) fill += t;
        samples.push({ digit: ch, img: tag, src: 'en', bm: zeroMean(bm), fill: fill / N, q: eg[i].q });
      });
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
function build(list) {
  const P = {};
  for (const s of list) {
    const arr = P[s.digit] || (P[s.digit] = []);
    if (arr.some((p) => ncc(p.bm, s.bm) > 0.97)) continue; // 近似重复的丢掉
    arr.push({ bm: s.bm, fill: s.fill });
  }
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
    const r = classify(P, s.bm, s.fill);
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
  const rows = samples.filter((s) => s.digit === hold).map((s) => classify(Q, s.bm, s.fill));
  if (!rows.length) continue;
  const sc = rows.map((r) => r.score).sort((a, b) => a - b);
  console.log(`  抽掉 ${hold} (n=${rows.length}) → 错认成 ${[...new Set(rows.map((r) => r.digit))].join(',')}`,
    '分数中位', sc[sc.length >> 1].toFixed(3), '最高', sc[sc.length - 1].toFixed(3));
}

/* 输出模板表：每类最多 3 张，先跨图各取一张，再补同图 */
function packQ(q) {
  const bytes = new Uint8Array(Math.ceil(N / 4));
  for (let i = 0; i < N; i++) bytes[i >> 2] |= (Number(q[i]) & 3) << ((i & 3) * 2);
  return Buffer.from(bytes).toString('base64');
}
const byDigit = {};
for (const s of samples) (byDigit[s.digit] = byDigit[s.digit] || []).push(s);
const out = {};
for (const d of Object.keys(byDigit).sort()) {
  const list = byDigit[d];
  const picked = [];
  const seen = new Set();
  for (const it of list) {
    if (picked.length >= 3) break;
    if (seen.has(it.img)) continue;
    seen.add(it.img);
    picked.push(it);
  }
  for (const it of list) {
    if (picked.length >= 3) break;
    if (!picked.includes(it)) picked.push(it);
  }
  out[d] = picked.map((it) => packQ(it.q));
}
/* 输出成品一整行，避免「只换半个对象」把后面的 b64Bytes / decodeProto 吞掉。
   用法：在 morimens-box-ocr.js 里定位到 `const DIGIT_PROTO_B64=` 开头的那一行
   （整张表就是一行，以 `};` 结尾），整行替换成下面打印的内容，然后务必
   `node --check morimens-box-ocr.js` 过一遍语法。 */
const line = '  const DIGIT_PROTO_B64=' + JSON.stringify(out) + ';';
console.log('\n把 morimens-box-ocr.js 里以 `  const DIGIT_PROTO_B64=` 开头、以 `};` 结尾的**那一整行**换成：');
console.log(line);
console.log('\n（换完执行 node --check morimens-box-ocr.js）');
