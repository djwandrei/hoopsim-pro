import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { hash, readJson, writeJson, atomicWrite, pinModuleClosure, withArtifactCache } from './artifacts.mjs';
import { validLocalDate } from './chronology.mjs';

export const CANONICAL_PLAN_VERSION = 'swishiq-calendar-shared-team-draw-plan-v1';
const DAY = 86400000;

function layoutFor(rows) {
  if (!Array.isArray(rows) || !rows.length) throw Error('Nonempty canonical paired rows required');
  const ids = new Set();
  for (const row of rows) {
    if (!row || !(typeof row.gameId === 'string' && row.gameId.length || Number.isSafeInteger(row.gameId))
      || ids.has(row.gameId) || !validLocalDate(row.gameDateLocal) || !Number.isSafeInteger(row.seasonStartYear)
      || row.homeTeamId === undefined || row.awayTeamId === undefined || row.homeTeamId === null || row.awayTeamId === null
      || String(row.homeTeamId) === String(row.awayTeamId)) throw Error('Invalid canonical row identity');
    ids.add(row.gameId);
  }
  const teams = [...new Set(rows.flatMap(row => [String(row.homeTeamId), String(row.awayTeamId)]))].sort();
  const years = [...new Set(rows.map(row => row.seasonStartYear))].sort((a, b) => a - b);
  const seasons = years.map(year => {
    const selected = rows.filter(row => row.seasonStartYear === year), ordinals = selected.map(row => Date.parse(row.gameDateLocal + 'T00:00:00.000Z') / DAY);
    const first = Math.min(...ordinals), last = Math.max(...ordinals), dateClusters = new Set(selected.map(row => row.gameDateLocal)).size;
    if (dateClusters < 2) throw Error('Each canonical fold requires at least two observed dates');
    return { year, firstOrdinal: first, dateSpan: last - first + 1, dateClusters, n: selected.length };
  });
  if (teams.length < 2 || teams.length > 65535 || seasons.some(season => season.dateSpan > 65535)) throw Error('Canonical draw dimensions exceed the uint16 format');
  const identity = rows.map(row => [row.gameId, row.gameDateLocal, row.seasonStartYear, String(row.homeTeamId), String(row.awayTeamId)]);
  return { identitySha256: hash(identity), rows: rows.length, teams, seasons };
}

function randomFor(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Preserve the original RNG order: teams, then every season's calendar blocks.
function drawDates(span, blockLength, random) {
  const counts = new Uint16Array(span);
  for (let remaining = span; remaining > 0;) {
    const block = Math.min(blockLength, remaining);
    const start = Math.floor(random() * (span - block + 1));
    for (let i = start; i < start + block; i += 1) counts[i] += 1;
    remaining -= block;
  }
  return counts;
}

export function prepareCanonicalPlan({ rows, replicates = 10000, seed = 20261005, blockLengths = [7, 14], cacheRoot }) {
  if (!Number.isSafeInteger(replicates) || replicates < 20 || !Number.isSafeInteger(seed)
    || !Array.isArray(blockLengths) || !blockLengths.length || blockLengths.some(n => !Number.isSafeInteger(n) || n < 1)
    || new Set(blockLengths).size !== blockLengths.length) throw Error('Invalid canonical draw settings');
  const layout = layoutFor(rows), options = { replicates, seed, blockLengths };
  const signature = { format: CANONICAL_PLAN_VERSION, layout, options, byteOrder: os.endianness(), codePins: pinModuleClosure([import.meta.filename]) };
  const artifact = withArtifactCache(cacheRoot, 'canonical-draws', signature, directory => {
    const seasonOffsets = [];
    let stride = layout.teams.length;
    for (const season of layout.seasons) { seasonOffsets.push(stride); stride += season.dateSpan; }
    const methods = [];
    for (const blockLength of blockLengths) {
      const random = randomFor(seed + blockLength), counts = new Uint16Array(replicates * stride);
      for (let replicate = 0; replicate < replicates; replicate++) {
        const offset = replicate * stride;
        for (let i = 0; i < layout.teams.length; i++) counts[offset + Math.floor(random() * layout.teams.length)]++;
        layout.seasons.forEach((season, fold) => counts.set(drawDates(season.dateSpan, blockLength, random), offset + seasonOffsets[fold]));
      }
      const file = 'block-' + blockLength + '-counts.u16';
      atomicWrite(path.join(directory, file), Buffer.from(counts.buffer));
      methods.push({ blockLengthDays: blockLength, seed: seed + blockLength, file, stride, seasonOffsets });
    }
    writeJson(path.join(directory, 'plan.json'), { format: CANONICAL_PLAN_VERSION, layout, options, methods, byteOrder: os.endianness(),
      status: 'experimental-factorization; canonical-parity-not-established',
      notes: ['Includes off-days and shared team-node counts; intended to preserve the original random draw order.',
        'No candidate probabilities or losses enter the plan; cohort identity and resampling settings determine its key.'] });
    return { methods: methods.length, replicates, rows: rows.length, layoutIdentitySha256: layout.identitySha256 };
  });
  const plan = readJson(path.join(artifact.directory, 'plan.json'));
  if (plan.byteOrder !== os.endianness()) throw Error('Canonical draw plan byte order differs from the host');
  for (const method of plan.methods) {
    const bytes = fs.readFileSync(path.join(artifact.directory, method.file));
    if (bytes.length !== plan.options.replicates * method.stride * 2) throw Error('Canonical draw count dimensions changed');
    const buffer = new ArrayBuffer(bytes.length); new Uint8Array(buffer).set(bytes);
    method.counts = new Uint16Array(buffer);
  }
  return { ...plan, resultKey: artifact.key, directory: artifact.directory, cacheHit: artifact.cacheHit,
    receiptFile: path.join(artifact.directory, 'receipt.json') };
}

export function verifyCanonicalPlan(plan, rows, { replicates, seed, blockLengths }) {
  const layout = layoutFor(rows);
  if (!plan || plan.format !== CANONICAL_PLAN_VERSION || hash(plan.layout) !== hash(layout)
    || hash(plan.options) !== hash({ replicates, seed, blockLengths }) || plan.byteOrder !== os.endianness()
    || !Array.isArray(plan.methods) || plan.methods.length !== blockLengths.length) throw Error('Canonical plan does not match the paired cohort/options');
  const expectedOffsets = []; let stride = layout.teams.length;
  for (const season of layout.seasons) { expectedOffsets.push(stride); stride += season.dateSpan; }
  plan.methods.forEach((method, i) => {
    if (method.blockLengthDays !== blockLengths[i] || method.seed !== seed + blockLengths[i] || method.stride !== stride
      || hash(method.seasonOffsets) !== hash(expectedOffsets) || !(method.counts instanceof Uint16Array)
      || method.counts.length !== replicates * stride) throw Error('Malformed canonical count layout');
    for (let replicate = 0; replicate < replicates; replicate++) {
      const offset = replicate * stride;
      let teamSum = 0;
      for (let team = 0; team < layout.teams.length; team++) teamSum += method.counts[offset + team];
      if (teamSum !== layout.teams.length) throw Error('Canonical team draw count changed');
      layout.seasons.forEach((season, fold) => {
        let count = 0;
        for (let day = 0; day < season.dateSpan; day++) count += method.counts[offset + expectedOffsets[fold] + day];
        if (count !== season.dateSpan) throw Error('Canonical calendar draw count changed');
      });
    }
  });
}
