// check_spa.mjs —— 通过 CDP 驱动无头浏览器渲染 SPA 页面，用于核验迅雷/城通/微云等网盘分享状态
//
// 用法：
//   1) 启动带调试端口的浏览器（端口需与 CDP_PORT 一致，默认 9223）
//      Windows: "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
//                 --headless=new --remote-debugging-port=9223 --user-data-dir=%TEMP%\edgeprof about:blank
//      macOS:   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//                 --headless=new --remote-debugging-port=9223 --user-data-dir=/tmp/edgeprof about:blank
//   2) node check_spa.mjs input.json output.json
//
// input.json:  [{ "key": "...", "platform": "xunlei", "url": "https://...", "pwd": "abcd" }]
// output.json: [{ "key": ..., "platform": ..., "url": ..., "title": ..., "text": ... }]
import fs from 'node:fs';

const [inputFile, outputFile] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || '9223';
const items = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const results = [];

class Tab {
  constructor(sock, id) { this.sock = sock; this.id = id; this.seq = 0; this.pending = new Map(); }

  static async open() {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
    if (!r.ok) throw new Error('new tab failed: ' + r.status);
    const t = await r.json();
    const sock = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${t.id}`);
    await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
    const tab = new Tab(sock, t.id);
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && tab.pending.has(m.id)) {
        const { res, rej } = tab.pending.get(m.id);
        tab.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return tab;
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.sock.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); }
      }, 30000);
    });
  }

  async evalJs(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result ? r.result.value : null;
  }

  async close() {
    try { this.sock.close(); } catch {}
    try { await fetch(`http://127.0.0.1:${PORT}/json/close/${this.id}`); } catch {}
  }
}

// 需要在页面中出现的“已渲染”标志
const MARKERS = ['全部文件', '已失效', '已被取消', '不存在', '提取码', '访问密码',
                 '文件大小', '保存到', '下载', '该分享', '违规'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function check(item, tries = 2) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    let tab;
    try {
      tab = await Tab.open();
      await tab.send('Page.enable');
      await tab.send('Runtime.enable');

      // 有提取码但链接里没带，则拼到 URL 上（迅雷/UC/夸克风格 ?pwd=，城通用 ?p=）
      let target = item.url;
      if (item.pwd && !/[?&](pwd|p)=/.test(target)) {
        const base = target.replace(/#.*$/, '');
        target = base + (base.includes('?') ? '&' : '?') + (item.platform === 'ctfile' ? 'p=' : 'pwd=') + item.pwd;
      }
      await tab.send('Page.navigate', { url: target });

      let text = '', title = '', stable = 0, last = '';
      const deadline = Date.now() + 26000;
      while (Date.now() < deadline) {
        await sleep(800);
        try {
          text = (await tab.evalJs('document.body ? document.body.innerText : ""')) || '';
          title = (await tab.evalJs('document.title')) || '';
        } catch { continue; }
        if (MARKERS.some(m => text.includes(m)) && text.length > 120) break;
        if (text === last && text.length > 300) { if (++stable >= 3) break; } else { stable = 0; }
        last = text;
      }

      // 迅雷：拼了提取码却跳到搜索结果页（说明提取码不对）或仍要求输入提取码，
      // 则用不带提取码的原始地址再判定一次，避免把有效分享误判为失效
      let pwdInvalid = false;
      if (item.platform === 'xunlei' && (/的结果/.test(text) || /请输入提取码/.test(text))) {
        pwdInvalid = true;
        try {
          await tab.send('Page.navigate', { url: item.url.replace(/#.*$/, '') });
          let t2 = '';
          const dl = Date.now() + 15000;
          while (Date.now() < dl) {
            await sleep(900);
            try { t2 = (await tab.evalJs('document.body ? document.body.innerText : ""')) || ''; } catch { continue; }
            if (MARKERS.some(m => t2.includes(m)) && t2.length > 120) break;
          }
          if (t2 && !/的结果/.test(t2)) text = t2;
        } catch {}
      }

      // 城通等平台首屏是过渡态，再等最终渲染
      if (item.platform === 'ctfile' && !/文件不存在|已失效|已被删除/.test(text)) {
        await sleep(7000);
        try {
          text = (await tab.evalJs('document.body ? document.body.innerText : ""')) || text;
          title = (await tab.evalJs('document.title')) || title;
        } catch {}
      }

      // 需要提取码/访问密码的页面：尝试自动填入并提交
      if (item.pwd && /提取码|访问密码|密码/.test(text) && /请|输入/.test(text)) {
        const js = `(function(){
          const pw = ${JSON.stringify(String(item.pwd))};
          const inputs = [...document.querySelectorAll('input')]
            .filter(el => el.type !== 'hidden' && el.offsetParent !== null);
          if (!inputs.length) return 'no_input';
          const inp = inputs[0];
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(inp, pw);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          const btns = [...document.querySelectorAll('button, .btn, a, div, span')]
            .filter(el => /^(确定|确认|提交|进入|访问)$/.test((el.innerText || '').trim()) && el.offsetParent !== null);
          if (btns.length) { btns[0].click(); return 'submitted'; }
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          return 'enter';
        })()`;
        try { await tab.evalJs(js); } catch {}
        await sleep(4500);
        try {
          text = (await tab.evalJs('document.body ? document.body.innerText : ""')) || text;
        } catch {}
      }

      await tab.close();
      return { key: item.key, platform: item.platform, url: item.url, title,
               text: text.slice(0, 6000), pwdInvalid, attempt };
    } catch (e) {
      if (tab) await tab.close();
      if (attempt === tries) {
        return { key: item.key, platform: item.platform, url: item.url, error: String(e.message || e) };
      }
      await sleep(1500);
    }
  }
}

// 顺序执行，避免并发过高触发风控
for (const it of items) {
  const r = await check(it);
  results.push(r);
  const brief = r.error ? 'ERR ' + r.error : (r.text || '').replace(/\s+/g, ' ').slice(0, 70);
  console.log(`[${results.length}/${items.length}] ${r.platform} ${r.url} -> ${brief}`);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 1), 'utf8');
}
console.log('done', results.length);
