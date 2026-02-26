import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const DB_DIR = join(ROOT, '.data');
const DB_FILE = join(DB_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4173);

const RATE_WINDOW_MS = 60_000;
const MAX_REQ_PER_WINDOW = 240;
const MAX_WRITE_REQ_PER_WINDOW = 60;
const MAX_BODY_BYTES = 16 * 1024;
const BLOCKED_UA_RE = /(bot|spider|crawler|scrapy|python-requests|wget|curl|httpclient)/i;
const rateMap = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

async function ensureDb() {
  await mkdir(DB_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    await writeFile(DB_FILE, JSON.stringify({ likes: {}, messages: [] }, null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDb();
  try {
    const raw = await readFile(DB_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      likes: data && typeof data.likes === 'object' && data.likes ? data.likes : {},
      messages: Array.isArray(data?.messages) ? data.messages : [],
    };
  } catch {
    return { likes: {}, messages: [] };
  }
}

async function writeDb(db) {
  await writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}


function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function isBlockedUa(req) {
  const ua = String(req.headers['user-agent'] || '');
  return BLOCKED_UA_RE.test(ua);
}

function isRateLimited(req, isWrite) {
  const ip = getClientIp(req);
  const now = Date.now();
  const item = rateMap.get(ip) || { start: now, count: 0, writes: 0 };
  if (now - item.start > RATE_WINDOW_MS) {
    item.start = now;
    item.count = 0;
    item.writes = 0;
  }
  item.count += 1;
  if (isWrite) { item.writes += 1; }
  rateMap.set(ip, item);

  if (item.count > MAX_REQ_PER_WINDOW) { return true; }
  if (isWrite && item.writes > MAX_WRITE_REQ_PER_WINDOW) { return true; }
  return false;
}

function setSecurityHeaders(headers = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow',
    ...headers,
  };
}

function sendJson(res, code, obj) {
  res.writeHead(code, setSecurityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }));
  res.end(JSON.stringify(obj));
}

function sendText(res, code, text) {
  res.writeHead(code, setSecurityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > MAX_BODY_BYTES) { return {}; }
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) { return {}; }
  try { return JSON.parse(raw); } catch { return {}; }
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, setSecurityHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }));
    res.end();
    return true;
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    const db = await readDb();
    return sendJson(res, 200, db), true;
  }

  if (url.pathname === '/api/like' && req.method === 'POST') {
    const body = await readBody(req);
    const id = String(body?.id || '').trim();
    if (!id) {
      return sendJson(res, 400, { ok: false, message: 'id required' }), true;
    }
    const db = await readDb();
    const prev = Number(db.likes[id] || 0);
    db.likes[id] = Number.isFinite(prev) && prev > 0 ? prev + 1 : 1;
    await writeDb(db);
    return sendJson(res, 200, { ok: true, id, count: db.likes[id], likes: db.likes }), true;
  }

  if (url.pathname === '/api/messages' && req.method === 'GET') {
    const db = await readDb();
    return sendJson(res, 200, { messages: db.messages }), true;
  }

  if (url.pathname === '/api/messages' && req.method === 'POST') {
    const body = await readBody(req);
    const author = String(body?.author || '').trim().slice(0, 20);
    const text = String(body?.text || '').trim().slice(0, 300);
    if (!text) {
      return sendJson(res, 400, { ok: false, message: 'text required' }), true;
    }

    const db = await readDb();
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author,
      text,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);
    if (db.messages.length > 200) { db.messages = db.messages.slice(-200); }
    await writeDb(db);
    return sendJson(res, 200, { ok: true, message: msg, messages: db.messages }), true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  let path = decodeURIComponent(url.pathname);
  if (path === '/') { path = '/index.html'; }

  const safePath = normalize(path).replace(/^\.+/, '');
  const filePath = join(ROOT, safePath);

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, setSecurityHeaders({ 'Content-Type': MIME[ext] || 'application/octet-stream' }));
    res.end(content);
  } catch {
    try {
      const html = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, setSecurityHeaders({ 'Content-Type': 'text/html; charset=utf-8' }));
      res.end(html);
    } catch {
      sendText(res, 404, 'Not Found');
    }
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (isBlockedUa(req)) {
      sendJson(res, 403, { ok: false, message: 'Forbidden' });
      return;
    }

    const isWrite = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
    if (isRateLimited(req, isWrite)) {
      sendJson(res, 429, { ok: false, message: 'Too Many Requests' });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) { sendJson(res, 404, { ok: false, message: 'Not Found' }); }
      return;
    }
    await serveStatic(req, res, url);
  } catch (err) {
    sendJson(res, 500, { ok: false, message: 'Server Error', error: String(err) });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
