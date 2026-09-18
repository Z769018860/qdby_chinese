import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const root = process.argv[2] || 'data/morimens/eremora';
const seasons = process.argv.slice(3).length ? process.argv.slice(3) : ['68'];
const json = async file => JSON.parse(await readFile(file, 'utf8'));

for (const season of seasons) {
  const dir = path.join(root, `usage/${season}-local-gzip`);
  const index = await json(path.join(dir, 'index.json'));
  // Each chunk is independently Base64-encoded; decode first, then restore
  // the original gzip byte stream. Concatenating the Base64 text is invalid
  // when a chunk boundary is not aligned to a 4-character block.
  const encodedChunks = await Promise.all(index.chunks.map(file => readFile(path.join(root, '..', '..', '..', file), 'utf8')));
  const compressed = Buffer.concat(encodedChunks.map(value => Buffer.from(value.replace(/\s+/g, ''), 'base64')));
  const decoded = JSON.parse(gunzipSync(compressed).toString('utf8'));
  const records = Array.isArray(decoded) ? decoded : decoded.records || [];
  const uids = records.map(row => String(row?.uid || '')).filter(Boolean);
  const unique = new Set(uids);
  const expected = Number(index.recordCount || 0);
  const missing = records.filter(row => !row?.uid).length;
  const duplicates = uids.length - unique.size;
  const ok = records.length === expected && missing === 0 && duplicates === 0;
  console.log(JSON.stringify({ season, expected, records: records.length, uniqueUids: unique.size, missing, duplicates, ok }));
  if (!ok) process.exitCode = 1;
}
