const ROOT = '/studio-source/';
const requests = new Map();
export async function readArchive(file, expectedHash) {
  const key = `${file}:${expectedHash || ''}`;
  if (requests.has(key)) return requests.get(key);
  const request = (async () => {
    const response = await fetch(`${ROOT}${file}?v=20261002-core1`, { cache:'force-cache' });
    if (!response.ok) throw new Error('The published Studio archive could not be loaded.');
    const bytes = await response.arrayBuffer();
    if (expectedHash) {
      const digest = await crypto.subtle.digest('SHA-256',bytes);
      const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
      if (hash !== expectedHash) throw new Error('The Studio snapshot does not match its published copy receipt.');
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  })();
  requests.set(key,request);
  request.catch(() => requests.delete(key));
  return request;
}
export function normalizePlayerName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[†*]+$/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export async function loadPlayerContext(name) {
  const index = await readArchive('context-index.json');
  const entry = index.records.find(row => row.normalizedName === normalizePlayerName(name));
  return entry ? readArchive(entry.path,entry.sha256) : null;
}
export async function loadCareerArchive() {
  const manifest = await readArchive('snapshot.json');
  const value = await readArchive('career.json',manifest.career.snapshotSha256);
  if (value.entry?.scope?.kind !== 'pooled-window' || !Array.isArray(value.records)) throw new Error('The pooled career archive is not available.');
  return value;
}