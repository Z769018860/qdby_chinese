import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--allow-file-access-from-files']});
for(const n of [1,2,3,4,5,6]){
 const p=await b.newPage({viewport:{width:2000,height:2830},deviceScaleFactor:1});
 await p.goto('file:///tmp/s71rep/p'+n+'.html',{waitUntil:'networkidle'});
 await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 const h=await p.evaluate(()=>{const f=document.querySelector('.foot').getBoundingClientRect().top;const els=[...document.querySelectorAll('.paper > *:not(.foot)')];return [document.getElementById('paper').offsetHeight,Math.round(f),Math.round(Math.max(...els.map(e=>e.getBoundingClientRect().bottom)))]});
 console.log(n,'height',h);
 await p.locator('#paper').screenshot({path:'/tmp/s71rep/page'+n+'.png'});
 await p.close();
}
await b.close();
