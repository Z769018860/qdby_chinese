import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://jx3.unua.top';
const API_PATH = '/api/rank/jjc-stats';
const USER_AGENT = 'Mozilla/5.0 (compatible; qdby-chinese-segment-sync/3.0)';
const ranges = [
  [2100, 2300],
  [2200, 2400],
  [2400, 2600],
  [2600, 2800],
  [2800, 3000],
  [3000, 3200],
];
const periods = ['last1d', 'last7d'];
const maxResponseBytes = 4 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function getClientSession() {
  const headers = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    Referer: `${BASE}/jjc-stats/`,
  };
  const started = Date.now();
  const response = await fetch(`${BASE}/api/client-proof`, { headers });
  const finished = Date.now();
  if (!response.ok) {
    throw new Error(`client-proof HTTP ${response.status}`);
  }
  const proof = await response.json();
  return {
    headers,
    proof,
    cookie: response.headers.get('set-cookie') || '',
    offset: Number(proof.serverTimeMs || Date.now()) - (started + finished) / 2,
  };
}

async function readResponseText(response, path) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxResponseBytes) {
    throw new Error(`${path} response exceeds 4 MB`);
  }
  if (!response.body) {
    throw new Error(`${path} response has no body`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      throw new Error(`${path} response exceeds 4 MB`);
    }
    chunks.push(Buffer.from(part.value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function signedGet(path) {
  const session = await getClientSession();
  const proof = session.proof;
  const aliases = proof.headerAliases || {};
  const timestamp = String(Math.floor((Date.now() + session.offset) / 1000));
  const nonce = randomBytes(12).toString('hex');
  const bodyHash = sha256('');
  const suffix = proof.kid && proof.dailySalt
    ? `:${proof.kid}:${proof.dailySalt}`
    : '';
  const signature = sha256(
    `GET:${path}:${timestamp}:${nonce}:${proof.token}:${bodyHash}${suffix}`,
  );
  const headers = {
    ...session.headers,
    [aliases.token]: proof.token,
    [aliases.timestamp]: timestamp,
    [aliases.nonce]: nonce,
    [aliases.proof]: signature,
    [aliases.bodyHash]: bodyHash,
  };
  if (session.cookie) headers.Cookie = session.cookie;
  if (proof.kid && proof.dailySalt && aliases.kid && aliases.daily) {
    headers[aliases.kid] = proof.kid;
    headers[aliases.daily] = proof.dailySalt;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${path} HTTP ${response.status}: ${errorText.slice(0, 300)}`);
    }
    const responseText = await readResponseText(response, path);
    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error(`${path} returned non-JSON: ${responseText.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(data) {
  const list = data?.rank?.data;
  if (!Array.isArray(list)) return [];
  return list
    .map((item, index) => ({
      rank: Number(item.strengthRank ?? item.rank ?? index + 1),
      kungfu: item.kungfuName || item.kungfu || item.name || '',
      win_rate: Number(item.winRate ?? item.win_rate),
      pick_rate: Number(item.appearRate ?? item.pickRate ?? item.pick_rate ?? 0),
      sample_count: Number(item.sampleCount ?? item.sample_count ?? 0),
      player_count: Number(item.playerCount ?? item.player_count ?? 0),
    }))
    .filter(item => item.kungfu && Number.isFinite(item.win_rate));
}

async function fetchSegment(min, max, role, periodType) {
  const kungfuType = role === 'healer' ? 'tps' : 'dps';
  const query = new URLSearchParams({
    kungfuType,
    matchMode: 'solo',
    periodType,
    scoreStart: String(min),
    scoreEnd: String(max),
  });
  const path = `${API_PATH}?${query.toString()}`;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await signedGet(path);
      const stats = normalize(data);
      if (!stats.length) {
        console.warn(`${min}-${max} ${role} ${periodType}: API returned no records`);
      }
      return stats;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(1200);
    }
  }
  throw lastError;
}

function emptyRange(min, max) {
  return { min_score: min, max_score: max, dps: [], healer: [] };
}

async function readExistingSnapshot() {
  try {
    return JSON.parse(await readFile('jx3-segment-stats.json', 'utf8'));
  } catch {
    return null;
  }
}

async function buildPeriod(periodType, previousRanges) {
  const result = {};
  for (const [min, max] of ranges) {
    const key = `${min}-${max}`;
    const current = emptyRange(min, max);
    for (const role of ['dps', 'healer']) {
      try {
        current[role] = await fetchSegment(min, max, role, periodType);
      } catch (error) {
        console.warn(`${key} ${role} ${periodType} failed: ${error.message}`);
        current[role] = previousRanges?.[key]?.[role] || [];
      }
    }
    result[key] = current;
  }
  return result;
}

const previous = await readExistingSnapshot();
const snapshot = {
  schema_version: 2,
  source: `${BASE}${API_PATH}`,
  updated_at: new Date().toISOString(),
  mode: '3v3',
  sample: 'solo',
  periods: {},
};

for (const periodType of periods) {
  const previousRanges =
    previous?.periods?.[periodType]?.ranges ||
    (periodType === 'last1d' ? previous?.ranges : null);
  snapshot.periods[periodType] = {
    ranges: await buildPeriod(periodType, previousRanges),
  };
}
snapshot.ranges = snapshot.periods.last1d.ranges;

const recordCount = Object.values(snapshot.ranges).reduce(
  (total, range) => total + range.dps.length + range.healer.length,
  0,
);
if (!recordCount && previous) {
  console.warn('No fresh segment records were returned; preserving the previous snapshot.');
  process.exit(0);
}

await writeFile('jx3-segment-stats.json', `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote JJC segment snapshot: ${recordCount} last1d records`);
