import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const url='https://jx3.unua.top/jjc-stats/';
const ranges=[];for(let min=1000;min<3200;min+=200)ranges.push([min,min+200]);
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1200}});
const out={schema_version:1,source:url,updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',period:'1d',ranges:{}};
try{await page.goto(url,{waitUntil:'networkidle',timeout:60000});await page.getByRole('tab',{name:'单排'}).click();
for(const pair of ranges){const min=pair[0],max=pair[1],result={min_score:min,max_score:max,dps:[],healer:[]},sliders=page.locator('[role="slider"]');
for(const role of ['输出','治疗']){await page.getByRole('tab',{name:role}).click();for(const item of [[0,min],[1,max]]){const s=sliders.nth(item[0]);await s.focus();await s.press('Home');for(let v=1000;v<item[1];v+=100)await s.press('ArrowRight');}const query=page.getByRole('button',{name:'查询'});if(await query.count())await query.click();await page.waitForTimeout(1200);const rows=await page.locator('[role="row"][title*="热门队伍配置"]').allTextContents(),stats=[];for(const text of rows){const m=text.match(/#\\s*(\\d+)\\s+(.+?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%/);if(m)stats.push({rank:Number(m[1]),kungfu:m[2].trim(),win_rate:Number(m[3])/100,pick_rate:Number(m[4])/100});}result[role==='输出'?'dps':'healer']=stats;}out.ranges[String(min)+'-'+String(max)]=result;}}finally{await browser.close();}
await fs.writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\\n');
