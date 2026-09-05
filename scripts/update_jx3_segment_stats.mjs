import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const url = 'https://jx3.unua.top/jjc-stats/';
const ranges = Array.from({length: 11}, (_, i) => [1000 + i * 200, 1200 + i * 200]);
const parseRows = texts => texts.flatMap(text => {
  const m = text.trim().match(/^#\s*(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  return m ? [{rank:Number(m[1]), kungfu:m[2].trim(), win_rate:Number(m[3])/100, pick_rate:Number(m[4])/100}] : [];
});
const fallback = async reason => {
  const top = JSON.parse(await fs.readFile('jx3-top1000.json', 'utf8'));
  const stats = (top.stats || []).map((x, i) => ({rank:i + 1, kungfu:x.kungfu, win_rate:x.win_rate, pick_rate:x.rate || 0, sample_count:x.sample_count, player_count:x.player_count}));
  const out = {schema_version:1, source:url, updated_at:new Date().toISOString(), mode:'3v3', sample:'solo', period:'1d', fallback:true, fallback_reason:String(reason), ranges:{}};
  for (const [min,max] of ranges) out.ranges[`${min}-${max}`] = {min_score:min, max_score:max, dps:stats, healer:stats};
  await fs.writeFile('jx3-segment-stats.json', JSON.stringify(out, null, 2) + '\\n');
};
let browser;
try {
  browser = await chromium.launch({headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
  const page = await browser.newPage({viewport:{width:1440,height:1200}});
  await page.goto(url, {waitUntil:'domcontentloaded', timeout:60000});
  await page.getByText('单排', {exact:true}).first().click();
  const out = {schema_version:1, source:url, updated_at:new Date().toISOString(), mode:'3v3', sample:'solo', period:'1d', ranges:{}};
  for (const [min,max] of ranges) {
    const result = {min_score:min, max_score:max, dps:[], healer:[]};
    for (const role of ['输出','治疗']) {
      await page.getByText(role, {exact:true}).first().click();
      const sliders = page.locator('[role="slider"]');
      for (const [index,value] of [[0,min],[1,max]]) {
        const slider = sliders.nth(index);
        await slider.focus(); await slider.press('Home');
        for (let v=1000; v<value; v+=100) await slider.press('ArrowRight');
      }
      const query = page.getByText('查询', {exact:true}).first();
      if (await query.count()) await query.click();
      await page.waitForTimeout(1000);
      const stats = parseRows(await page.locator('[role="row"]').allTextContents());
      result[role === '输出' ? 'dps' : 'healer'] = stats;
    }
    out.ranges[`${min}-${max}`] = result;
  }
  await fs.writeFile('jx3-segment-stats.json', JSON.stringify(out, null, 2) + '\\n');
} catch (error) {
  console.warn('segment source unavailable; using Top1000 fallback:', error?.stack || error);
  await fallback(error?.message || error);
} finally {
  if (browser) await browser.close();
}
