// 把 browser_cookies.py 导出的 cookie JSON 注入到指定端口的 CDP 浏览器里。
//
// 用途：360 极速浏览器的 cookie 库被独占锁定、又没开调试端口，所以先快照解密，
// 再把需要的域灌进我们自己开的 headless Edge（profile 独立、可随时重置），
// 后续所有同源请求就用这份登录态跑。
//
// 用法：
//   node scripts/common/inject_cookies.mjs --port 9231 --file ck360_all.json \
//        --domain weibo.cn --domain weibo.com --domain bilibili.com
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d = '') => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const PORT = Number(arg('--port', '9231'));
const FILE = arg('--file', '');
const DOMAINS = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--domain') DOMAINS.push(argv[i + 1]);

if (!FILE) { console.error('缺少 --file'); process.exit(1); }
const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const pick = all.filter((c) => {
  const h = c.host.replace(/^\./, '');
  return DOMAINS.some((d) => h === d || h.endsWith('.' + d));
});

const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

// 浏览器级 endpoint 不支持 Network.setCookies，要用 Storage.setCookies
// expires_utc 是 1601 起的微秒；-1 表示 session cookie
const cookies = pick.map((c) => ({
  name: c.name,
  value: c.value,
  domain: c.host,
  path: c.path || '/',
  secure: !!c.secure,
  httpOnly: !!c.httpOnly,
  sameSite: 'Lax',
  ...(c.expires > 0 ? { expires: c.expires / 1e6 - 11644473600 } : {}),
}));
const r = await send('Storage.setCookies', { cookies });
console.log(`注入 ${cookies.length} 条 cookie（${DOMAINS.join(', ')}）`, r.error ? r.error.message : 'ok');
ws.close();
