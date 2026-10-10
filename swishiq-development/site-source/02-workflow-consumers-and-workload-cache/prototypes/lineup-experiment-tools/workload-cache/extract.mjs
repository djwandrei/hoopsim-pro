#!/usr/bin/env node

/**
 * Prototype-only, source-bound cache for reconciled workload appearances.
 *
 * Extraction and reconciliation stay in scripts/benchmark-lineup-workload.mjs
 * via its exported gameRows() function. This module only owns bounded archive
 * traversal, cache identity/integrity, and optional reference-parity receipts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { gameRows, runBenchmark } from '../../../scripts/benchmark-lineup-workload.mjs';
import { validateGames } from '../../../scripts/lib/lineup-workload-validation.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WORKLOAD_CACHE_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(WORKLOAD_CACHE_DIR, '../../..');
const RUNS_DIR = path.join(WORKLOAD_CACHE_DIR, 'runs');
const CACHE_DIR = path.join(RUNS_DIR, 'cache');
const RUN_RECEIPTS_DIR = path.join(RUNS_DIR, 'receipts');
const CACHE_FORMAT = 'lineup-workload-appearance-cache-v1';
const RUN_FORMAT = 'lineup-workload-appearance-cache-run-v1';
const CACHE_CODE_PATHS = Object.freeze([
  'prototypes/lineup-experiment-tools/workload-cache/extract.mjs',
  'scripts/benchmark-lineup-workload.mjs',
  'scripts/lib/lineup-workload-validation.mjs',
  'scripts/download-nba-sportradar-weekly.mjs',
  'scripts/lib/nba-sportradar-pbp.mjs',
  'scripts/lib/nba-lineup-reconstruction.mjs',
  'scripts/lib/nba-summary-completeness.mjs',
]);

const LIMITS = Object.freeze({
  manifestBytes: 32 * 1024 * 1024,
  manifestEntries: 10_000,
  eligibleGames: 1_600,
  compressedGameBytes: 32 * 1024 * 1024,
  totalCompressedBytes: 2 * 1024 * 1024 * 1024,
  decompressedGameBytes: 256 * 1024 * 1024,
  totalDecompressedBytes: 8 * 1024 * 1024 * 1024,
  cacheBytes: 512 * 1024 * 1024,
  bootstrapIterations: 200,
});

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError('Unsupported undefined value in cache identity.');
    return encoded;
  }
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function isWithin(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function assertWithin(parent, child, label) {
  if (!isWithin(parent, child)) throw new Error(label + ' resolves outside its allowed directory.');
}

function parsePositiveInteger(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(label + ' must be an integer from 1 through ' + maximum + '.');
  }
  return parsed;
}

function parseArguments(argv) {
  const options = { archive: null, maxGames: null, verifyReference: false, bootstrapIterations: 50, bootstrapSeed: 20261009 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const readValue = name => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(name + ' requires a value.');
      index += 1;
      return value;
    };
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--archive') options.archive = readValue(token);
    else if (token === '--max-games') options.maxGames = parsePositiveInteger(readValue(token), token, LIMITS.eligibleGames);
    else if (token === '--bootstrap-iterations') options.bootstrapIterations = parsePositiveInteger(readValue(token), token, LIMITS.bootstrapIterations);
    else if (token === '--bootstrap-seed') {
      const seed = Number(readValue(token));
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error(token + ' must be an unsigned 32-bit integer.');
      options.bootstrapSeed = seed;
    } else if (token === '--verify-reference') options.verifyReference = true;
    else throw new Error('Unknown option: ' + token);
  }
  return options;
}

function usage() {
  return [
    'Prepare a private, prototype-only workload appearance cache from a local archive.',
    '',
    'Usage:',
    '  node prototypes/lineup-experiment-tools/workload-cache/extract.mjs --archive <archive-directory> [--max-games <count>] [--verify-reference]',
    '',
    'The default prepares every completed, publication-eligible regular-season game, up to the hard cap of ' + LIMITS.eligibleGames + '.',
    'Use --max-games to prepare a deliberate prefix. --verify-reference re-extracts that prefix through the existing benchmark path,',
    'compares appearance rows and benchmark outcomes exactly, and writes a local receipt. It is intended for bounded parity smokes.',
    'Cache and receipt files stay below prototypes/lineup-experiment-tools/workload-cache/runs/.',
  ].join('\n');
}

async function getCodeIdentity() {
  const files = [];
  for (const relativePath of CACHE_CODE_PATHS) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    const bytes = await fs.readFile(absolutePath);
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return files;
}

function selectEligibleEntries(manifest, requestedMaxGames) {
  if (!manifest || typeof manifest !== 'object' || !manifest.games || typeof manifest.games !== 'object' || Array.isArray(manifest.games)) {
    throw new Error('Archive manifest must contain a games object.');
  }
  const entries = Object.entries(manifest.games);
  if (entries.length > LIMITS.manifestEntries) throw new Error('Archive manifest exceeds the entry-count limit.');
  const eligible = entries.filter(([, entry]) => entry?.status === 'completed'
    && entry.primaryPhase === 'regular'
    && entry.eligibleForPublication === true);
  if (!eligible.length) throw new Error('Archive manifest contains no completed, publication-eligible regular-season games.');
  if (requestedMaxGames === null && eligible.length > LIMITS.eligibleGames) {
    throw new Error('Archive has ' + eligible.length + ' eligible games; use --max-games with an intentional bounded prefix (hard limit ' + LIMITS.eligibleGames + ').');
  }
  const maximum = requestedMaxGames ?? eligible.length;
  return {
    eligibleCount: eligible.length,
    selected: eligible.slice(0, maximum),
    partial: eligible.length > maximum,
    maximum,
  };
}

async function resolveArchiveFile(root, entry) {
  if (typeof entry?.gameFile !== 'string' || !entry.gameFile.trim() || entry.gameFile.includes('\0')) {
    throw new Error('Selected archive manifest entry has no safe gameFile path.');
  }
  if (path.isAbsolute(entry.gameFile) || path.win32.isAbsolute(entry.gameFile)) {
    throw new Error('Archive gameFile paths must be relative.');
  }
  const candidate = path.resolve(root, entry.gameFile);
  assertWithin(root, candidate, 'Archive gameFile');
  const real = await fs.realpath(candidate);
  assertWithin(root, real, 'Archive gameFile');
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error('Selected archive gameFile is not a regular file.');
  if (stat.size > LIMITS.compressedGameBytes) throw new Error('Selected archive gameFile exceeds the per-file byte limit.');
  return { absolutePath: real, stat };
}

async function loadArchiveContext(archiveDirectory, requestedMaxGames) {
  if (typeof archiveDirectory !== 'string' || !archiveDirectory.trim()) throw new Error('--archive is required.');
  const root = await fs.realpath(path.resolve(archiveDirectory));
  const manifestPath = path.join(root, 'manifest.json');
  const manifestStat = await fs.stat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > LIMITS.manifestBytes) throw new Error('Archive manifest is missing or exceeds the manifest byte limit.');
  const manifestBytes = await fs.readFile(manifestPath);
  if (manifestBytes.length !== manifestStat.size) throw new Error('Archive manifest changed while it was read.');
  const manifestSha256 = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const selection = selectEligibleEntries(manifest, requestedMaxGames);
  if (selection.selected.length > LIMITS.eligibleGames) throw new Error('Selected archive game count exceeds the hard limit.');
  const codeIdentity = await getCodeIdentity();
  const seenPaths = new Set();
  let totalCompressedBytes = 0;
  const selectedSources = [];
  for (const [manifestGameId, entry] of selection.selected) {
    const resolved = await resolveArchiveFile(root, entry);
    const relativePath = path.relative(root, resolved.absolutePath).split(path.sep).join('/');
    if (seenPaths.has(relativePath.toLowerCase())) throw new Error('Archive manifest reuses a gameFile path.');
    seenPaths.add(relativePath.toLowerCase());
    totalCompressedBytes += resolved.stat.size;
    if (totalCompressedBytes > LIMITS.totalCompressedBytes) throw new Error('Selected archive exceeds the aggregate compressed-byte limit.');
    const bytes = await fs.readFile(resolved.absolutePath);
    const afterReadStat = await fs.stat(resolved.absolutePath);
    if (bytes.length !== resolved.stat.size || afterReadStat.size !== bytes.length) {
      throw new Error('Archive gameFile changed while its source hash was computed.');
    }
    selectedSources.push({
      manifestGameId,
      relativePath,
      absolutePath: resolved.absolutePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const manifestAfterHash = await fs.readFile(manifestPath);
  if (sha256(manifestAfterHash) !== manifestSha256) throw new Error('Archive manifest changed while cache identity was computed.');
  const inputIdentity = {
    format: CACHE_FORMAT,
    sourceManifestSha256: manifestSha256,
    selectedSourceFiles: selectedSources.map(({ manifestGameId, relativePath, bytes, sha256: sourceSha256 }) => ({
      manifestGameId, relativePath, bytes, sha256: sourceSha256,
    })),
    selection: {
      status: 'completed',
      primaryPhase: 'regular',
      eligibleForPublication: true,
      manifestOrder: true,
      maxGames: selection.maximum,
      selectedEligibleGames: selectedSources.length,
      totalEligibleGames: selection.eligibleCount,
      partial: selection.partial,
    },
    codeIdentity,
  };
  const cacheKey = sha256(stableJson(inputIdentity));
  return {
    root,
    manifestPath,
    manifest,
    manifestSha256,
    selection,
    selectedSources,
    totalCompressedBytes,
    codeIdentity,
    inputIdentity,
    cacheKey,
  };
}

async function assertManifestUnchanged(context) {
  const bytes = await fs.readFile(context.manifestPath);
  if (sha256(bytes) !== context.manifestSha256) throw new Error('Archive manifest changed during workload cache preparation.');
}

async function readAndDecodeSource(context, source) {
  const bytes = await fs.readFile(source.absolutePath);
  if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) {
    throw new Error('Archive gameFile changed after cache identity was computed: ' + source.relativePath);
  }
  let decoded;
  try {
    decoded = gunzipSync(bytes, { maxOutputLength: LIMITS.decompressedGameBytes });
  } catch (error) {
    throw new Error('Could not safely decompress ' + source.relativePath + ': ' + String(error?.message ?? error));
  }
  if (decoded.length > LIMITS.decompressedGameBytes) throw new Error('Archive game exceeds the decompressed per-file byte limit.');
  return { archive: JSON.parse(decoded.toString('utf8')), decompressedBytes: decoded.length };
}

function metadataMismatches(archive, source, manifest) {
  const mismatches = [];
  if (archive?.game?.providerGameId !== source.manifestGameId) mismatches.push('provider-game-id');
  if (typeof archive?.game?.primaryPhase === 'string' && archive.game.primaryPhase !== 'regular') mismatches.push('primary-phase');
  if (Number.isInteger(archive?.game?.seasonStartYear) && Number.isInteger(manifest.seasonStartYear)
    && archive.game.seasonStartYear !== manifest.seasonStartYear) mismatches.push('season-start-year');
  if (Object.hasOwn(archive?.analytics ?? {}, 'eligibleForPublication')
    && archive.analytics.eligibleForPublication !== true) mismatches.push('publication-eligibility');
  return mismatches;
}

function hasDuplicateActivePlayers(archive) {
  const active = Array.isArray(archive?.players) ? archive.players.filter(player => player?.minutesPlayed > 0) : [];
  const ids = active.map(player => player?.id);
  return ids.length !== new Set(ids).size;
}

function hasAnyOfficialBoxScore(archive) {
  const active = Array.isArray(archive?.players) ? archive.players.filter(player => player?.minutesPlayed > 0) : [];
  return active.some(player => player?.officialBoxScore?.availableFields?.length > 0);
}

async function extractAppearanceRows(context) {
  const stats = {
    selectedEligibleGames: context.selectedSources.length,
    includedGames: 0,
    rejectedMetadataMismatch: 0,
    rejectedDuplicatePlayerGames: 0,
    rejectedReconciliation: 0,
    acceptedOfficialPlayerReconciliation: 0,
    acceptedLegacyPbpTeamScoreGate: 0,
    activePlayerRows: 0,
    decompressedBytes: 0,
  };
  const games = [];
  for (const source of context.selectedSources) {
    const decoded = await readAndDecodeSource(context, source);
    const archive = decoded.archive;
    stats.decompressedBytes += decoded.decompressedBytes;
    if (stats.decompressedBytes > LIMITS.totalDecompressedBytes) throw new Error('Selected archive exceeds the aggregate decompressed-byte limit.');
    if (hasDuplicateActivePlayers(archive)) stats.rejectedDuplicatePlayerGames += 1;
    const mismatches = metadataMismatches(archive, source, context.manifest);
    if (mismatches.length) {
      stats.rejectedMetadataMismatch += 1;
      continue;
    }
    const official = hasAnyOfficialBoxScore(archive);
    const rows = gameRows(archive);
    if (!rows.length) {
      stats.rejectedReconciliation += 1;
      continue;
    }
    const game = { id: archive.game.providerGameId, date: archive.game.scheduledAt, rows };
    validateGames([game]);
    stats.includedGames += 1;
    stats.activePlayerRows += rows.length;
    if (official) stats.acceptedOfficialPlayerReconciliation += 1;
    else stats.acceptedLegacyPbpTeamScoreGate += 1;
    games.push(game);
  }
  validateGames(games);
  const manifestAfterExtraction = await fs.readFile(context.manifestPath);
  if (sha256(manifestAfterExtraction) !== context.manifestSha256) throw new Error('Archive manifest changed during extraction.');
  const codeAfterExtraction = await getCodeIdentity();
  if (stableJson(codeAfterExtraction) !== stableJson(context.codeIdentity)) throw new Error('Extraction or reconciliation code changed during cache preparation.');
  return { games, stats };
}

async function extractReferenceRows(context) {
  const games = [];
  let rejected = 0;
  for (const source of context.selectedSources) {
    const { archive } = await readAndDecodeSource(context, source);
    const rows = gameRows(archive);
    if (!rows.length) {
      rejected += 1;
      continue;
    }
    games.push({ id: archive.game.providerGameId, date: archive.game.scheduledAt, rows });
  }
  validateGames(games);
  await assertManifestUnchanged(context);
  return { games, rejected };
}

function cacheDirectoryFor(cacheKey) {
  return path.join(CACHE_DIR, cacheKey);
}

async function ensurePrototypeRunsDirectory() {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const realRuns = await fs.realpath(RUNS_DIR);
  assertWithin(WORKLOAD_CACHE_DIR, realRuns, 'Prototype workload-cache runs directory');
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const realCache = await fs.realpath(CACHE_DIR);
  assertWithin(realRuns, realCache, 'Prototype workload-cache cache directory');
  await fs.mkdir(RUN_RECEIPTS_DIR, { recursive: true });
  const realReceipts = await fs.realpath(RUN_RECEIPTS_DIR);
  assertWithin(realRuns, realReceipts, 'Prototype workload-cache receipts directory');
}

async function readVerifiedCache(context) {
  const directory = cacheDirectoryFor(context.cacheKey);
  let directoryStat;
  try {
    directoryStat = await fs.stat(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!directoryStat.isDirectory()) throw new Error('Cache key path exists but is not a directory.');
  const resolvedDirectory = await fs.realpath(directory);
  assertWithin(CACHE_DIR, resolvedDirectory, 'Workload cache entry');
  let receiptBytes;
  let appearanceBytes;
  try {
    receiptBytes = await fs.readFile(path.join(resolvedDirectory, 'receipt.json'));
    appearanceBytes = await fs.readFile(path.join(resolvedDirectory, 'appearances.json'));
  } catch (error) {
    throw new Error('Existing cache entry is incomplete; refusing to overwrite it: ' + String(error?.message ?? error));
  }
  if (appearanceBytes.length > LIMITS.cacheBytes) throw new Error('Cached appearance data exceeds the cache byte limit.');
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  if (receipt?.format !== CACHE_FORMAT
    || receipt.cacheKey !== context.cacheKey
    || receipt.appearancesSha256 !== sha256(appearanceBytes)
    || stableJson(receipt.inputIdentity) !== stableJson(context.inputIdentity)) {
    throw new Error('Existing cache receipt or appearance bytes failed integrity checks.');
  }
  const payload = JSON.parse(appearanceBytes.toString('utf8'));
  if (payload?.format !== CACHE_FORMAT || payload.cacheKey !== context.cacheKey || !Array.isArray(payload.games)) {
    throw new Error('Cached appearance payload has an unsupported shape.');
  }
  validateGames(payload.games);
  if (payload.games.length !== receipt.stats?.includedGames) throw new Error('Cached game count disagrees with its receipt.');
  return { games: payload.games, stats: receipt.stats, receipt, status: 'hit', directory };
}

async function removeOwnedStagingDirectory(stagingDirectory) {
  if (!stagingDirectory) return;
  const resolved = path.resolve(stagingDirectory);
  assertWithin(CACHE_DIR, resolved, 'Cache staging directory');
  if (!path.basename(resolved).startsWith('.stage-')) throw new Error('Refusing to remove a path not created as a cache staging directory.');
  await fs.rm(resolved, { recursive: true, force: true });
}

async function writeCache(context, extracted) {
  const directory = cacheDirectoryFor(context.cacheKey);
  const payload = { format: CACHE_FORMAT, cacheKey: context.cacheKey, games: extracted.games };
  const appearanceBytes = Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8');
  if (appearanceBytes.length > LIMITS.cacheBytes) throw new Error('Prepared appearance cache exceeds the output byte limit.');
  const receipt = {
    format: CACHE_FORMAT,
    cacheKey: context.cacheKey,
    createdAt: new Date().toISOString(),
    inputIdentity: context.inputIdentity,
    source: {
      sourceManifestSha256: context.manifestSha256,
      sourceSeasonStartYear: Number.isInteger(context.manifest.seasonStartYear) ? context.manifest.seasonStartYear : null,
      sourceSeasonEndYear: Number.isInteger(context.manifest.seasonEndYear) ? context.manifest.seasonEndYear : null,
      selectedEligibleGames: context.selection.selected.length,
      totalEligibleGames: context.selection.eligibleCount,
      partial: context.selection.partial,
      totalCompressedBytes: context.totalCompressedBytes,
    },
    codeIdentity: context.codeIdentity,
    stats: extracted.stats,
    appearancesSha256: sha256(appearanceBytes),
  };
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  const staging = path.join(CACHE_DIR, '.stage-' + context.cacheKey.slice(0, 16) + '-' + process.pid + '-' + crypto.randomBytes(5).toString('hex'));
  let renamed = false;
  let stagingCreated = false;
  try {
    await fs.mkdir(staging);
    stagingCreated = true;
    assertWithin(CACHE_DIR, staging, 'Cache staging directory');
    await fs.writeFile(path.join(staging, 'appearances.json'), appearanceBytes, { flag: 'wx' });
    await fs.writeFile(path.join(staging, 'receipt.json'), receiptBytes, { flag: 'wx' });
    await fs.rename(staging, directory);
    renamed = true;
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
      const concurrent = await readVerifiedCache(context);
      if (!concurrent) throw error;
      return concurrent;
    }
    throw error;
  } finally {
    if (!renamed && stagingCreated) await removeOwnedStagingDirectory(staging);
  }
  return { games: extracted.games, stats: extracted.stats, receipt, status: 'miss', directory };
}

async function obtainCache(context) {
  await ensurePrototypeRunsDirectory();
  const cached = await readVerifiedCache(context);
  if (cached) return cached;
  const extracted = await extractAppearanceRows(context);
  const codeAfterExtraction = await getCodeIdentity();
  if (stableJson(codeAfterExtraction) !== stableJson(context.codeIdentity)) throw new Error('Code identity changed before cache commit.');
  return writeCache(context, extracted);
}

function summarizeBenchmark(result) {
  const metrics = Object.fromEntries(Object.entries(result.metrics).map(([metric, row]) => [metric, {
    parameters: row.parameters,
    projectedTestMse: row.test?.projected?.mse ?? null,
    rawTestMse: row.test?.raw?.mse ?? null,
    projectedTestExposure: row.test?.projected?.exposure ?? null,
    rawTestExposure: row.test?.raw?.exposure ?? null,
  }]));
  return {
    version: result.version,
    split: result.split,
    sourceGameIdsSha256: result.sourceGameIdsSha256,
    metrics,
    benchmarkSha256: sha256(stableJson(result)),
  };
}

async function verifyReferenceParity(context, cached, options) {
  const reference = await extractReferenceRows(context);
  const referenceRowsSha256 = sha256(stableJson(reference.games));
  const cachedRowsSha256 = sha256(stableJson(cached.games));
  const rowsMatch = referenceRowsSha256 === cachedRowsSha256;
  if (!rowsMatch) throw new Error('Cached appearance rows differ from the unchanged benchmark archive-extraction path.');
  const benchmarkOptions = { bootstrapIterations: options.bootstrapIterations, bootstrapSeed: options.bootstrapSeed };
  const referenceResult = runBenchmark(reference.games, benchmarkOptions);
  const cachedResult = runBenchmark(cached.games, benchmarkOptions);
  const referenceOutcomesSha256 = sha256(stableJson(referenceResult));
  const cachedOutcomesSha256 = sha256(stableJson(cachedResult));
  const outcomesMatch = referenceOutcomesSha256 === cachedOutcomesSha256;
  if (!outcomesMatch) throw new Error('Cached benchmark outcomes differ from the unchanged reference workload benchmark.');
  const codeAfterVerification = await getCodeIdentity();
  if (stableJson(codeAfterVerification) !== stableJson(context.codeIdentity)) throw new Error('Extraction or reconciliation code changed during parity verification.');
  await assertManifestUnchanged(context);
  return {
    status: 'reference-row-and-outcome-parity-passed',
    referenceRowsSha256,
    cachedRowsSha256,
    referenceOutcomesSha256,
    cachedOutcomesSha256,
    referenceRejectedIncompleteGames: reference.rejected,
    benchmark: summarizeBenchmark(referenceResult),
    bootstrap: { iterations: options.bootstrapIterations, seed: options.bootstrapSeed },
  };
}

function relativePath(value) {
  return path.relative(REPO_ROOT, value).split(path.sep).join('/');
}

async function writeRunReceipt(receipt) {
  await ensurePrototypeRunsDirectory();
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const filename = stamp + '-' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.json';
  const output = path.join(RUN_RECEIPTS_DIR, filename);
  assertWithin(RUNS_DIR, output, 'Run receipt output');
  await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return output;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage() + '\n');
    return;
  }
  if (!options.archive) throw new Error(usage());
  const context = await loadArchiveContext(options.archive, options.maxGames);
  const cached = await obtainCache(context);
  const verification = options.verifyReference ? await verifyReferenceParity(context, cached, options) : null;
  const codeAfterRun = await getCodeIdentity();
  if (stableJson(codeAfterRun) !== stableJson(context.codeIdentity)) throw new Error('Extraction or reconciliation code changed during cache use.');
  const runReceipt = {
    format: RUN_FORMAT,
    createdAt: new Date().toISOString(),
    status: verification ? verification.status : 'cache-prepared',
    cacheStatus: cached.status,
    cacheKey: context.cacheKey,
    cacheDirectory: relativePath(cached.directory),
    cacheReceiptSha256: sha256(Buffer.from(JSON.stringify(cached.receipt, null, 2) + '\n')),
    source: {
      sourceManifestSha256: context.manifestSha256,
      sourceSeasonStartYear: Number.isInteger(context.manifest.seasonStartYear) ? context.manifest.seasonStartYear : null,
      sourceSeasonEndYear: Number.isInteger(context.manifest.seasonEndYear) ? context.manifest.seasonEndYear : null,
      selectedEligibleGames: context.selectedSources.length,
      totalEligibleGames: context.selection.eligibleCount,
      partial: context.selection.partial,
      totalCompressedBytes: context.totalCompressedBytes,
      selectedGameFileSha256Count: context.selectedSources.length,
    },
    codeIdentity: context.codeIdentity,
    cacheStats: cached.stats,
    reconciliationScope: {
      officialBoxScoreGamesAccepted: cached.stats.acceptedOfficialPlayerReconciliation,
      legacyPbpTeamScoreGateGamesAccepted: cached.stats.acceptedLegacyPbpTeamScoreGate,
      officialPlayerLevelReconciliationAvailableForEveryActivePlayer: cached.stats.acceptedOfficialPlayerReconciliation > 0
        && cached.stats.acceptedLegacyPbpTeamScoreGate === 0,
      duplicatePlayerGamesRejected: cached.stats.rejectedDuplicatePlayerGames,
      metadataMismatchGamesExcluded: cached.stats.rejectedMetadataMismatch,
      note: 'Uses the existing exported gameRows() contract. Legacy archives without retained official player fields use only the existing PBP-to-final-team-score gate; this does not establish complete player-level official-stat reconciliation.',
    },
    verification,
  };
  const receiptPath = await writeRunReceipt(runReceipt);
  process.stdout.write(JSON.stringify({
    status: runReceipt.status,
    cacheStatus: cached.status,
    cacheKey: context.cacheKey,
    selectedEligibleGames: context.selectedSources.length,
    includedGames: cached.stats.includedGames,
    rejectedReconciliation: cached.stats.rejectedReconciliation,
    rejectedMetadataMismatch: cached.stats.rejectedMetadataMismatch,
    acceptedLegacyPbpTeamScoreGate: cached.stats.acceptedLegacyPbpTeamScoreGate,
    acceptedOfficialPlayerReconciliation: cached.stats.acceptedOfficialPlayerReconciliation,
    cacheDirectory: relativePath(cached.directory),
    runReceipt: relativePath(receiptPath),
    verification: verification ? {
      status: verification.status,
      benchmarkSha256: verification.benchmark.benchmarkSha256,
      split: verification.benchmark.split,
    } : null,
  }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch(error => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
  });
}
