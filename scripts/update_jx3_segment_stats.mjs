import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const url = 'https://jx3.unua.top/jjc-stats/';
const ranges = [];
for (let min = 1000; min < 3200; min += 200) ranges.push([min, min + 200]);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const out = {
  schema_version: 1,
  source: url,
  updated_at: new Date().toISOString(),
  mode: '3v3',
  sample: 'solo',
  period: '1d',
  ranges: {}
};

function parseRows(texts) {
  const stats = [];
  for (const text of texts) {
    const m = text.trim().match(/^#\s*(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
    if (m) stats.push({
      rank: Number(m[1]),
      kungfu: m[2].trim(),
      win_rate: Number(m[3]) / 100,
      pick_rate: Number(m[4]) / 100
    });
  }
  return stats;
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('tab', { name: '单排' }).click();

  for (const [min, max] of ranges) {
    const result = { min_score: min, max_score: max, dps: [], healer: [] };
    const sliders = page.locator('[role="slider"]');

    for (const role of ['输出', '治疗']) {
      await page.getByRole('tab', { name: role }).click();
      for (const [index, value] of [[0, min], [1, max]]) {
        const slider = sliders.nth(index);
        await slider.focus();
        await slider.press('Home');
        for (let v = 1000; v < value; v += 100) await slider.press('ArrowRight');
      }
      const query = page.getByRole('button', { name: '查询' });
      if (await query.count()) await query.click();
      await page.waitForTimeout(1200);
      const rows = await page.locator('[role="row"][title*="热门队伍配置"]').allTextContents();
      result[role === '输出' ? 'dps' : 'healer'] = parseRows(rows);
    }
    out.ranges[`${min}-${max}`] = result;
  }
} finally {
  await browser.close();
}

await fs.writeFile('jx3-segment-stats.json', JSON.stringify(out, null, 2) + '\n');
