import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const BASE = 'https://jx3.unua.top';
const OUTPUT = new URL('../jx3-top1000.json', import.meta.url);
const USER_AGENT = 'Mozilla/5.0 (compatible; qdby-chinese-data-sync/1.0)';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function main() {
  const commonHeaders = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    Referer: `${BASE}/jjc-stats/`,
  };
  const startedAt = Date.now();
  const proofResponse = await fetch(`${BASE}/api/client-proof`, { headers: commonHeaders });
  if (!proofResponse.ok) throw new Error(`client proof failed: ${proofResponse.status}`);

  const finishedAt = Date.now();
  const proofData = await proofResponse.json();
  const aliases = proofData.headerAliases || {};
  const path = '/api/rank/builds?mode=summary&scope=top1000';
  const clockOffset = Number(proofData.serverTimeMs || Date.now()) - (startedAt + finishedAt) / 2;
  const timestamp = String(Math.floor((Date.now() + clockOffset) / 1000));
  const nonce = randomBytes(12).toString('hex');
  const bodyHash = sha256('');
  const dailySuffix = proofData.kid && proofData.dailySalt
    ? `:${proofData.kid}:${proofData.dailySalt}`
    : '';
  const signature = sha256(`GET:${path}:${timestamp}:${nonce}:${proofData.token}:${bodyHash}${dailySuffix}`);
  const headers = {
    ...commonHeaders,
    [aliases.token]: proofData.token,
    [aliases.timestamp]: timestamp,
    [aliases.nonce]: nonce,
    [aliases.proof]: signature,
    [aliases.bodyHash]: bodyHash,
  };
  if (proofData.kid && proofData.dailySalt && aliases.kid && aliases.daily) {
    headers[aliases.kid] = proofData.kid;
    headers[aliases.daily] = proofData.dailySalt;
  }
  const cookie = proofResponse.headers.get('set-cookie');
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${BASE}${path}`, { headers });
  if (!response.ok) throw new Error(`Top1000 request failed: ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data?.stats)) throw new Error('Top1000 response has no stats');

  await writeFile(OUTPUT, `${JSON.stringify({ ...data, synced_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  console.log(`Saved ${data.stats.length} heart-method records.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
