import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const BASE = 'https://jx3.unua.top';
const OUTPUT = new URL('../jx3-top1000.json', import.meta.url);
const USER_AGENT = 'Mozilla/5.0 (compatible; qdby-chinese-data-sync/1.1)';
const HEALERS = ['奶花', '奶毒', '奶秀', '奶药', '奶歌'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function createSession() {
  const headers = { Accept: 'application/json', 'User-Agent': USER_AGENT, Referer: `${BASE}/jjc-stats/` };
  const startedAt = Date.now();
  const response = await fetch(`${BASE}/api/client-proof`, { headers });
  if (!response.ok) throw new Error(`client proof failed: ${response.status}`);
  const finishedAt = Date.now();
  const proof = await response.json();
  return { headers, proof, cookie: response.headers.get('set-cookie') || '', clockOffset: Number(proof.serverTimeMs || Date.now()) - (startedAt + finishedAt) / 2 };
}

async function signedGet(path) {
  const session = await createSession();
  const { proof, clockOffset } = session;
  const aliases = proof.headerAliases || {};
  const timestamp = String(Math.floor((Date.now() + clockOffset) / 1000));
  const nonce = randomBytes(12).toString('hex');
  const bodyHash = sha256('');
  const suffix = proof.kid && proof.dailySalt ? `:${proof.kid}:${proof.dailySalt}` : '';
  const signature = sha256(`GET:${path}:${timestamp}:${nonce}:${proof.token}:${bodyHash}${suffix}`);
  const headers = { ...session.headers, [aliases.token]: proof.token, [aliases.timestamp]: timestamp, [aliases.nonce]: nonce, [aliases.proof]: signature, [aliases.bodyHash]: bodyHash };
  if (proof.kid && proof.dailySalt && aliases.kid && aliases.daily) { headers[aliases.kid] = proof.kid; headers[aliases.daily] = proof.dailySalt; }
  if (session.cookie) headers.Cookie = session.cookie;
  const response = await fetch(`${BASE}${path}`, { headers });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

async function main() {
  const summary = await signedGet('/api/rank/builds?mode=summary&scope=top1000');
  if (!Array.isArray(summary?.stats)) throw new Error('Top1000 response has no stats');
  const details = [];
  for (const healer of HEALERS) {
    const data = await signedGet(`/api/rank/builds?mode=detail&scope=top1000&kungfu=${encodeURIComponent(healer)}`);
    const comps = data?.stats?.[0]?.top_comps;
    if (Array.isArray(comps)) details.push(...comps.map(({ comp_key, schools, count, rate, win_rate }) => ({ comp_key, schools, count, rate, win_rate })));
  }
  const unique = new Map();
  for (const comp of details) { const old = unique.get(comp.comp_key); if (!old || Number(comp.count) > Number(old.count)) unique.set(comp.comp_key, comp); }
  const output = { ...summary, config_stats: [...unique.values()], synced_at: new Date().toISOString() };
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Saved ${summary.stats.length} heart methods and ${output.config_stats.length} configurations.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
