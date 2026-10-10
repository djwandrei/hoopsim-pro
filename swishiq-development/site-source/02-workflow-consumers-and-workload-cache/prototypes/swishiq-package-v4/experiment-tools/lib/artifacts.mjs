import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { threadId } from 'node:worker_threads';

export const ARTIFACT_FORMAT = 'swishiq-experiment-cache-v1';
export function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Nonfinite cache-signature value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + Array.from(value, stable).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  throw Error('Cache signatures require finite JSON values');
}
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stable(value)).digest('hex');
export function pin(file) {
  const absolute = path.resolve(file);
  const bytes = fs.readFileSync(absolute);
  return { path: absolute, bytes: bytes.length, sha256: hash(bytes) };
}
export function loadPinnedJson(file) {
  const absolute = path.resolve(file), buffer = fs.readFileSync(absolute);
  return { value: JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')),
    inputPin: { path: absolute, bytes: buffer.length, sha256: hash(buffer) } };
}
export function readJson(file) { return loadPinnedJson(file).value; }
export function loadPinnedBytes(file) {
  const absolute = path.resolve(file), buffer = fs.readFileSync(absolute);
  return { buffer, inputPin: { path: absolute, bytes: buffer.length, sha256: hash(buffer) } };
}
export function parseJsonlBytes(buffer, file = 'JSONL input') {
  const data = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!data) throw Error('Empty JSONL: ' + file);
  return data.split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw Error(`${file}:${index + 1}: ${error.message}`); }
  });
}
export function loadPinnedJsonl(file) {
  const { buffer, inputPin } = loadPinnedBytes(file);
  return { rows: parseJsonlBytes(buffer, file), inputPin };
}
export function readJsonl(file) { return loadPinnedJsonl(file).rows; }
export function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) throw Error('Preserve existing artifact: ' + file);
  const temporary = file + '.tmp-' + process.pid + '-' + randomUUID();
  try { fs.writeFileSync(temporary, bytes, { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function writeJson(file, value) { atomicWrite(file, JSON.stringify(value, null, 2) + '\n'); }
export function writeJsonl(file, rows) { atomicWrite(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n'); }

// Only literal local imports and Node built-ins are supported by these diagnostic modules.
export function pinModuleClosure(entryFiles) {
  const imports = /(?:\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["'])/g;
  const pending = entryFiles.map(file => path.resolve(file)), found = new Map();
  while (pending.length) {
    const file = pending.pop();
    if (found.has(file)) continue;
    found.set(file, pin(file));
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(imports)) {
      const specifier = match[1] || match[2];
      if (specifier.startsWith('.')) pending.push(path.resolve(path.dirname(file), specifier));
      else if (!specifier.startsWith('node:')) throw Error('Unpinned external dependency: ' + specifier);
    }
  }
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function verifyManifest(file, { pathMap = {}, strict = true, seen = new Set() } = {}) {
  const manifestPath = path.resolve(file);
  if (seen.has(manifestPath)) throw Error('Upstream manifest cycle: ' + manifestPath);
  const visited = new Set(seen); visited.add(manifestPath);
  const { value: manifest, inputPin: manifestPin } = loadPinnedJson(file), checked = [], failures = [];
  const savedPathMap = manifest.signature?.sourcePathMap ?? {};
  if (!savedPathMap || typeof savedPathMap !== 'object' || Array.isArray(savedPathMap)
    || Object.values(savedPathMap).some(value => typeof value !== 'string' || !value.length)) throw Error('Invalid recorded source relocation map');
  const effectivePathMap = { ...savedPathMap, ...pathMap };
  const descriptors = [...(manifest.sourcePins ?? []), ...(manifest.artifactPins ?? []), ...(manifest.files ?? [])];
  const upstream = [];
  if (manifest.format === ARTIFACT_FORMAT) {
    if (hash(manifest.signature) !== manifest.key || !Array.isArray(manifest.files) || !manifest.files.length) failures.push({ reason: 'Invalid cache receipt signature/output list' });
    const collect = (value, key = '') => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.path === 'string' && typeof value.sha256 === 'string' && Number.isSafeInteger(value.bytes)) {
        descriptors.push(value);
        if (/(?:Manifest|Receipt)Pin$/.test(key)) upstream.push(value);
      } else for (const [name, item] of Object.entries(value)) collect(item, name);
    };
    collect(manifest.signature);
  }
  if (!descriptors.length) failures.push({ reason: 'Manifest has no source/artifact pins' });
  for (const descriptor of descriptors) {
    const original = descriptor.path;
    let actualPath;
    try {
      if (typeof original !== 'string' || !original.length) throw Error('Invalid manifest path');
      actualPath = effectivePathMap[original] ?? (path.isAbsolute(original) ? original : path.resolve(path.dirname(file), original));
      const actual = pin(actualPath);
      if (!/^[a-f0-9]{64}$/.test(descriptor.sha256) || actual.sha256 !== descriptor.sha256
        || actual.bytes !== (descriptor.bytes ?? descriptor.byteLength)) throw Error('Hash or byte-length mismatch');
      checked.push({ original, ...actual });
    } catch (error) { failures.push({ path: original, actualPath, reason: error.message }); }
  }
  for (const descriptor of upstream) {
    const upstreamPath = effectivePathMap[descriptor.path] ?? (path.isAbsolute(descriptor.path) ? descriptor.path : path.resolve(path.dirname(file), descriptor.path));
    try {
      const verified = verifyManifest(upstreamPath, { pathMap: effectivePathMap, strict: false, seen: visited });
      checked.push(...verified.checked);
      failures.push(...verified.failures.map(failure => ({ upstreamManifest: upstreamPath, ...failure })));
    } catch (error) { failures.push({ upstreamManifest: upstreamPath, reason: error.message }); }
  }
  if (strict && failures.length) throw Error('Source manifest cannot be reused: ' + JSON.stringify(failures));
  return { manifestPin, verified: !failures.length, checked, failures, manifest };
}

export function lookupArtifactCache(cacheRoot, stage, signature) {
  if (!/^[a-z0-9-]+$/.test(stage)) throw Error('Invalid cache stage');
  const key = hash(signature), directory = path.resolve(cacheRoot, stage, key), receiptPath = path.join(directory, 'receipt.json');
  if (fs.existsSync(receiptPath)) {
    const receipt = readJson(receiptPath);
    if (receipt.format !== ARTIFACT_FORMAT || receipt.key !== key || stable(receipt.signature) !== stable(signature)
      || !Array.isArray(receipt.files) || !receipt.files.length) throw Error('Cache signature mismatch/output list absent');
    for (const item of receipt.files) {
      const location = path.resolve(directory, item.path), relative = path.relative(directory, location);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Cached artifact escaped its output directory');
      const actual = pin(location);
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) throw Error('Cached artifact changed: ' + item.path);
    }
    return { directory, key, cacheHit: true, receipt };
  }
  return null;
}

export function withArtifactCache(cacheRoot, stage, signature, compute) {
  const cached = lookupArtifactCache(cacheRoot, stage, signature);
  if (cached) return cached;
  const key = hash(signature), directory = path.resolve(cacheRoot, stage, key);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const lock = directory + '.lock';
  let handle;
  try { handle = fs.openSync(lock, 'wx'); }
  catch { throw Error('Cache key is already locked; inspect the owning process before removing a stale lock: ' + lock); }
  const temporary = directory + '.pending-' + process.pid + '-' + randomUUID();
  try {
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, threadId, key, startedAt: new Date().toISOString() }));
    if (fs.existsSync(directory)) throw Error('Incomplete unreviewed cache directory: ' + directory);
    fs.mkdirSync(temporary);
    const metadata = compute(temporary) ?? {};
    const files = [];
    const visit = dir => {
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        if (fs.statSync(file).isDirectory()) visit(file);
        else { const p = pin(file); files.push({ path: path.relative(temporary, file).replaceAll('\\', '/'), bytes: p.bytes, sha256: p.sha256 }); }
      }
    };
    visit(temporary);
    const receipt = { format: ARTIFACT_FORMAT, key, stage, signature, metadata, files, createdAt: new Date().toISOString(),
      status: 'experiment-infrastructure; canonical-parity-not-established' };
    writeJson(path.join(temporary, 'receipt.json'), receipt);
    fs.renameSync(temporary, directory);
    return { directory, key, cacheHit: false, receipt };
  } catch (error) {
    // Retain any partial stage for diagnosis. Never delete an unknown directory.
    error.message += '\nPartial stage retained at: ' + temporary;
    throw error;
  } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}
