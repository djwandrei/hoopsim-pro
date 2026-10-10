/**
 * Offline, reproducible rate backtest; raw licensed game files never leave disk.
 * Split whole games chronologically into train/tune/test. Choose parameters on
 * tuning games ONLY; refit player means on train+tune, then evaluate once on
 * untouched test games. Observed test minutes define the requested exposure,
 * not a target minute plan. This is predictive evidence, never a causal claim.
 *
 * node scripts/benchmark-lineup-workload.mjs --archive <data/2025> --out <report>
 * Add --appearance-cache <cache-directory> to use source/code-verified cached rows.
 * Add --write-runtime to generate the reviewed scalar-only runtime parameters.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { workloadRate } from '../prototypes/basketball-lineup-optimizer/workload-model.js';
import { chronologicalSplit, validateGames, pairedGameBootstrap, relativeImprovement } from './lib/lineup-workload-validation.mjs';

export const METRICS = Object.freeze({ points: 'minutes', assists: 'minutes', rebounds: 'minutes', steals: 'minutes', blocks: 'minutes', ballSecurity: 'minutes', efgPct: 'fga', threePct: 'tpa' });
const blank = () => ({ minutes: 0, games: 0, fga: 0, tpa: 0, fta: 0, ftm: 0, points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, ballSecurity: 0, efgPct: 0, threePct: 0 });
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = value => nonnegative(value) && value > 0;
const evidence = () => Object.fromEntries(Object.keys(METRICS).map(metric => [metric, { numerator: 0, exposure: 0, games: 0 }]));
const OFFICIAL_WORKLOAD_FIELDS = Object.freeze([
  'points', 'fieldGoalsMade', 'fieldGoalAttempts', 'threePointersMade', 'threePointAttempts',
  'freeThrowsMade', 'freeThrowAttempts', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
]);
const WORKLOAD_CACHE_FORMAT = 'lineup-workload-appearance-cache-v1';
const WORKLOAD_CACHE_CODE_PATHS = Object.freeze([
  'prototypes/lineup-experiment-tools/workload-cache/extract.mjs',
  'scripts/benchmark-lineup-workload.mjs',
  'scripts/lib/lineup-workload-validation.mjs',
  'scripts/download-nba-sportradar-weekly.mjs',
  'scripts/lib/nba-sportradar-pbp.mjs',
  'scripts/lib/nba-lineup-reconstruction.mjs',
  'scripts/lib/nba-summary-completeness.mjs',
]);
const WORKLOAD_CACHE_LIMITS = Object.freeze({
  manifestBytes: 32 * 1024 * 1024,
  manifestEntries: 10_000,
  eligibleGames: 1_600,
  compressedGameBytes: 32 * 1024 * 1024,
  totalCompressedBytes: 2 * 1024 * 1024 * 1024,
  cacheBytes: 512 * 1024 * 1024,
});

// These descriptive slices are fixed before looking at held-out outcomes.
// They diagnose a model; they do NOT cap players' minutes in the optimizer.
export const SUBGROUPS = Object.freeze({
  lowSample: { definition: '5-19 valid training appearances for this metric', matches: (p, e) => e.games < 20 },
  establishedSample: { definition: '20+ valid training appearances for this metric', matches: (p, e) => e.games >= 20 },
  lowMinutes: { definition: 'Training observed MPG below 16', matches: p => p.minutes / p.games < 16 },
  rotationMinutes: { definition: 'Training observed MPG from 16 to below 28', matches: p => p.minutes / p.games >= 16 && p.minutes / p.games < 28 },
  highMinutes: { definition: 'Training observed MPG at least 28', matches: p => p.minutes / p.games >= 28 },
});

function activePlayerRows(archive) {
  // A Map would silently keep only the last duplicate player. Reject the
  // entire ambiguous game before constructing benchmark ground truth.
  const active = Array.isArray(archive?.players) ? archive.players.filter(p => p.minutesPlayed > 0) : [];
  if (!active.length || new Set(active.map(p => p.id)).size !== active.length || active.some(p => typeof p.id !== 'string' || !p.id)) return null;
  return active;
}

function scoreRowsReconcile(rows, archive) {
  for (const [team, points] of [[archive?.game?.homeProviderTeamId, archive?.game?.homePoints], [archive?.game?.awayProviderTeamId, archive?.game?.awayPoints]]) {
    if (!Number.isInteger(points) || points < 0
      || rows.filter(row => row.team === team).reduce((sum, row) => sum + row.points, 0) !== points) return false;
  }
  return true;
}

function pbpRows(archive, active) {
  const rows = new Map(active.map(p => [p.id, { ...blank(), id: p.id, team: p.providerTeamId, minutes: p.minutesPlayed, games: 1 }]));
  const seen = new Set();
  for (const event of archive.events || []) {
    if (event.isRescinded || seen.has(event.id)) continue;
    seen.add(event.id);
    for (const stat of event.statistics || []) {
      const row = rows.get(stat.player?.id);
      if (!row) continue;
      if (stat.type === 'fieldgoal') {
        if (typeof stat.made !== 'boolean') return [];
        const three = typeof stat.three_point_shot === 'boolean' ? stat.three_point_shot : event.eventType?.includes('threepoint') || Number(stat.points) === 3;
        row.fga++;
        if (three) row.tpa++;
        if (stat.made) { row.points += three ? 3 : 2; row.efgPct += three ? 1.5 : 1; if (three) row.threePct++; }
      } else if (stat.type === 'freethrow') {
        if (typeof stat.made !== 'boolean') return [];
        // Keep attempts as evidence for future offensive-load work. They do
        // not become a fitted usage variable or reveal future shot allocation.
        row.fta++;
        if (stat.made) { row.points++; row.ftm++; }
      } else if (['assist', 'rebound', 'steal', 'block', 'turnover'].includes(stat.type)) {
        row[({ assist: 'assists', rebound: 'rebounds', steal: 'steals', block: 'blocks', turnover: 'ballSecurity' })[stat.type]]++;
      }
    }
  }
  // Incomplete or inconsistent event scoring is unsuitable ground truth.
  const output = [...rows.values()];
  if (!scoreRowsReconcile(output, archive)) return [];
  return output.map(row => ({ ...row, gameId: archive.game.providerGameId, date: archive.game.scheduledAt }));
}

function officialBoxScoreRow(player) {
  const source = player?.officialBoxScore;
  const fields = source?.fields;
  if (source?.source !== 'summary_endpoint' || !fields || typeof fields !== 'object') return null;
  if (!OFFICIAL_WORKLOAD_FIELDS.every(field => source.availableFields?.includes(field) && Number.isInteger(fields[field]) && fields[field] >= 0)) return null;
  if (fields.rebounds !== (fields.offensiveRebounds ?? 0) + (fields.defensiveRebounds ?? 0)
    && (Number.isInteger(fields.offensiveRebounds) || Number.isInteger(fields.defensiveRebounds))) return null;
  const madeTwoPointers = fields.fieldGoalsMade - fields.threePointersMade;
  if (madeTwoPointers < 0
    || fields.points !== (2 * madeTwoPointers) + (3 * fields.threePointersMade) + fields.freeThrowsMade) return null;
  return {
    ...blank(),
    id: player.id,
    team: player.providerTeamId,
    minutes: player.minutesPlayed,
    games: 1,
    fga: fields.fieldGoalAttempts,
    tpa: fields.threePointAttempts,
    fta: fields.freeThrowAttempts,
    ftm: fields.freeThrowsMade,
    points: fields.points,
    assists: fields.assists,
    rebounds: fields.rebounds,
    steals: fields.steals,
    blocks: fields.blocks,
    ballSecurity: fields.turnovers,
    efgPct: fields.fieldGoalsMade + (0.5 * fields.threePointersMade),
    threePct: fields.threePointersMade,
  };
}

function rowsReconcileWithOfficialBoxScore(pbp, official) {
  if (pbp.length !== official.length) return false;
  const officialByPlayerId = new Map(official.map(row => [row.id, row]));
  for (const row of pbp) {
    const expected = officialByPlayerId.get(row.id);
    if (!expected || expected.team !== row.team) return false;
    for (const field of ['points', 'fga', 'tpa', 'fta', 'ftm', 'assists', 'rebounds', 'steals', 'blocks', 'ballSecurity', 'efgPct', 'threePct']) {
      if (row[field] !== expected[field]) return false;
    }
  }
  return true;
}

/**
 * Use retained Summary player totals only when they are complete for every
 * active player and exactly reconcile with independently parsed PBP.  Legacy
 * archives without any retained official fields retain their existing PBP
 * score gate; mixed/partial Summary retention fails closed.
 */
export function gameRows(archive) {
  const active = activePlayerRows(archive);
  if (!active) return [];
  const hasAnyOfficialBoxScore = active.some(player => player?.officialBoxScore?.availableFields?.length > 0);
  if (!hasAnyOfficialBoxScore) return pbpRows(archive, active);
  const official = active.map(officialBoxScoreRow);
  if (official.some(row => row === null) || !scoreRowsReconcile(official, archive)) return [];
  const fromPbp = pbpRows(archive, active);
  if (!fromPbp.length || !rowsReconcileWithOfficialBoxScore(fromPbp, official)) return [];
  return official.map(row => ({ ...row, gameId: archive.game.providerGameId, date: archive.game.scheduledAt }));
}

export function fitProfiles(games) {
  validateGames(games);
  const players = new Map(), league = blank();
  const metricEvidence = { players: new Map(), league: evidence() };
  for (const game of games) for (const row of game.rows) {
    const player = players.get(row.id) || blank();
    // Do not turn null into zero or add a missing metric's minutes to its
    // denominator. Every metric gets its own paired numerator/exposure bank.
    if (!positive(row.minutes)) continue;
    for (const field of Object.keys(league)) {
      const value = field === 'games' ? 1 : row[field];
      if (nonnegative(value)) { player[field] += value; league[field] += value; }
    }
    const sample = metricEvidence.players.get(row.id) || evidence();
    for (const [metric, denominator] of Object.entries(METRICS)) {
      if (!nonnegative(row[metric]) || !positive(row[denominator])) continue;
      for (const bank of [sample, metricEvidence.league]) {
        bank[metric].numerator += row[metric]; bank[metric].exposure += row[denominator]; bank[metric].games++;
      }
    }
    metricEvidence.players.set(row.id, sample);
    players.set(row.id, player);
  }
  return { players, league, metricEvidence, sourceGameIds: new Set(games.map(game => game.id)),
    trainingThroughUtcDay: games.length ? games.map(game => new Date(game.date).toISOString().slice(0, 10)).sort().at(-1) : null };
}

export function evaluate(games, fit, metric, parameters, expandedOnly = false) {
  validateGames(games);
  // Protect direct callers as well as runBenchmark's split. Reusing an
  // appearance, or evaluating on a day already used to fit means, leaks data.
  if (games.some(game => fit.sourceGameIds.has(game.id) || (fit.trainingThroughUtcDay && new Date(game.date).toISOString().slice(0, 10) <= fit.trainingThroughUtcDay))) throw new Error('Held-out games must be strictly after all training UTC dates and absent from training identities.');
  const denominator = METRICS[metric];
  if (!denominator) throw new Error(`Unknown metric: ${metric}`);
  const options = typeof expandedOnly === 'object' && expandedOnly !== null ? expandedOnly : { expandedOnly };
  if (options.subgroup && !SUBGROUPS[options.subgroup]) throw new Error(`Unknown subgroup: ${options.subgroup}`);
  const league = fit.metricEvidence.league[metric];
  const baseline = positive(league.exposure) ? league.numerator / league.exposure : null;
  let squared = 0, absolute = 0, weight = 0, rows = 0;
  const exclusions = { missingLeagueBaseline: 0, unknownPlayer: 0, missingTrainingDenominator: 0, insufficientTrainingGames: 0, missingTargetDenominator: 0, missingTargetNumerator: 0, invalidMinutes: 0, outsideSubgroup: 0, invalidPrediction: 0 };
  const gameLosses = [];
  let considered = 0;
  for (const game of games) {
    const loss = { gameId: game.id, squared: 0, exposure: 0, playerGames: 0 };
    for (const row of game.rows) {
      considered++;
      if (baseline === null) { exclusions.missingLeagueBaseline++; continue; }
      const p = fit.players.get(row.id);
      if (!p) { exclusions.unknownPlayer++; continue; }
      const sample = fit.metricEvidence.players.get(row.id)[metric];
      if (!positive(sample.exposure)) { exclusions.missingTrainingDenominator++; continue; }
      if (sample.games < 5) { exclusions.insufficientTrainingGames++; continue; }
      if (!positive(row[denominator])) { exclusions.missingTargetDenominator++; continue; }
      if (!nonnegative(row[metric])) { exclusions.missingTargetNumerator++; continue; }
      if (!positive(row.minutes)) { exclusions.invalidMinutes++; continue; }
      const sourceMinutes = p.minutes / p.games;
      if ((options.expandedOnly && !(row.minutes >= sourceMinutes + 8 && sourceMinutes < 24)) || (options.subgroup && !SUBGROUPS[options.subgroup].matches(p, sample))) { exclusions.outsideSubgroup++; continue; }
      const prediction = workloadRate({ value: sample.numerator / sample.exposure, baseline, sample: sample.exposure, ...parameters, sourceMinutes, targetMinutes: row.minutes, lowerIsBetter: metric === 'ballSecurity' });
      if (!nonnegative(prediction)) { exclusions.invalidPrediction++; continue; }
      const error = prediction - row[metric] / row[denominator];
      squared += row[denominator] * error * error;
      absolute += row[denominator] * Math.abs(error);
      weight += row[denominator]; rows++;
      loss.squared += row[denominator] * error * error; loss.exposure += row[denominator]; loss.playerGames++;
    }
    gameLosses.push(loss);
  }
  const result = { mse: weight ? squared / weight : null, mae: weight ? absolute / weight : null, exposure: weight, playerGames: rows,
    eligibility: { consideredPlayerGames: considered, minimumTrainingAppearances: 5, exclusions } };
  // Per-game sufficient statistics are optional and stay in memory for paired
  // resampling. The persisted report contains only aggregated evaluations.
  if (options.includeGameLosses) result.gameLosses = gameLosses;
  return result;
}

export function runBenchmark(games, { bootstrapIterations = 1000, bootstrapSeed = 20260905 } = {}) {
  const { ordered, train, tune, test } = chronologicalSplit(games);
  const trainFit = fitProfiles(train), finalFit = fitProfiles([...train, ...tune]);
  const metrics = {};
  const compare = (metric, chosen, selection = {}) => {
    const options = { ...selection, includeGameLosses: true };
    const projected = evaluate(test, finalFit, metric, chosen, options);
    const raw = evaluate(test, finalFit, metric, { prior: 0, strength: 0 }, options);
    const shrinkOnly = evaluate(test, finalFit, metric, { ...chosen, strength: 0 }, options);
    const bootstrap = { iterations: bootstrapIterations, seed: bootstrapSeed };
    const uncertainty = { vsRaw: pairedGameBootstrap(projected, raw, bootstrap), vsShrinkOnly: pairedGameBootstrap(projected, shrinkOnly, bootstrap) };
    for (const row of [projected, raw, shrinkOnly]) delete row.gameLosses;
    return { projected, raw, shrinkOnly, improvementVsRaw: relativeImprovement(projected.mse, raw.mse), improvementVsShrinkOnly: relativeImprovement(projected.mse, shrinkOnly.mse), uncertainty };
  };
  for (const [metric, denominator] of Object.entries(METRICS)) {
    const priors = denominator === 'minutes' ? [0, 100, 250, 500, 750, 1500] : [0, 20, 50, 100, 180, 350];
    const candidates = priors.flatMap(prior => [0, .25, .5, 1, 2].map(strength => ({ prior, strength })));
    const scored = candidates.map(parameters => ({ parameters, evaluation: evaluate(tune, trainFit, metric, parameters) }));
    // Null MSE means no evaluation, never a perfect zero-error candidate.
    scored.sort((a, b) => (a.evaluation.mse ?? Infinity) - (b.evaluation.mse ?? Infinity) || a.parameters.strength - b.parameters.strength || a.parameters.prior - b.parameters.prior);
    if (scored[0].evaluation.mse === null) {
      metrics[metric] = { status: 'unavailable-no-eligible-tuning-rows', parameters: null, tuning: scored[0].evaluation, test: null, raw: null, shrinkOnly: null, improvementVsRaw: null, improvementVsShrinkOnly: null, expandedRole: null, subgroups: null, uncertainty: null };
      continue;
    }
    const chosen = scored[0].parameters;
    const { projected, ...comparison } = compare(metric, chosen);
    metrics[metric] = { status: projected.exposure ? 'evaluated' : 'unavailable-no-eligible-test-rows', parameters: chosen, tuning: scored[0].evaluation, test: projected, ...comparison,
      expandedRole: { definition: 'Descriptive, outcome-conditioned slice: supplied test MPG at least 8 above training MPG, with training MPG below 24; not a pre-outcome subgroup.', ...compare(metric, chosen, { expandedOnly: true }) },
      subgroups: Object.fromEntries(Object.entries(SUBGROUPS).map(([key, group]) => [key, { definition: group.definition, ...compare(metric, chosen, { subgroup: key }) }])) };
  }
  return { version: 'chronological-workload-v3', evaluation: 'conditional production at supplied minutes; not predicted minutes or causal fatigue',
    validation: { grain: 'one player appearance per game', metricWeighting: METRICS, subgroupEvidence: 'train+tune appearances only; independent of held-out outcomes except the explicitly labeled legacy expandedRole slice', bootstrap: 'paired whole-game percentile intervals conditional on fitted parameters; exploratory subgroup intervals are not multiplicity-adjusted', missingEvidence: 'excluded explicitly per metric; missing numerators never become zeros',
      sourceCoverage: 'Eligible archived games only; accumulated exposure is not a verified complete NBA season.',
      sourceReconciliation: 'When complete Summary-endpoint officialBoxScore fields are retained for every active player, the adapter requires player-level reconciliation with independently parsed PBP before using those official totals. Legacy archives without retained official fields use the existing PBP-to-final-team-score gate only; mixed or partial official retention is rejected. Team-only rebounds and turnovers are not assigned to players.' },
    split: { method: 'nearest-60-20-20-whole-UTC-calendar-days', timezone: 'UTC', trainGames: train.length, tuningGames: tune.length, testGames: test.length, trainingEnds: train.at(-1).date, tuningEnds: tune.at(-1).date, testStarts: test[0].date, testEnds: test.at(-1).date },
    sourceGameIdsSha256: crypto.createHash('sha256').update(ordered.map(g => g.id).join('\n')).digest('hex'), metrics };
}

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

function currentWorkloadCodeIdentity() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return WORKLOAD_CACHE_CODE_PATHS.map(relativePath => {
    const absolutePath = path.resolve(repoRoot, relativePath);
    assertWithin(repoRoot, absolutePath, 'Workload cache code path');
    const resolvedPath = fs.realpathSync(absolutePath);
    assertWithin(repoRoot, resolvedPath, 'Workload cache code path');
    const bytes = fs.readFileSync(resolvedPath);
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
  });
}

function readRegularFileWithin(parent, filename, label, maximumBytes) {
  const resolved = fs.realpathSync(path.join(parent, filename));
  assertWithin(parent, resolved, label);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > maximumBytes) throw new Error(label + ' is not a regular file or exceeds its byte limit.');
  const bytes = fs.readFileSync(resolved);
  if (bytes.length !== stat.size) throw new Error(label + ' changed while it was read.');
  return bytes;
}

function cacheSourceFile(root, entry) {
  if (typeof entry?.gameFile !== 'string' || !entry.gameFile.trim() || entry.gameFile.includes('\0')) {
    throw new Error('Selected archive manifest entry has no safe gameFile path.');
  }
  if (path.isAbsolute(entry.gameFile) || path.win32.isAbsolute(entry.gameFile)) throw new Error('Archive gameFile paths must be relative.');
  const candidate = path.resolve(root, entry.gameFile);
  assertWithin(root, candidate, 'Archive gameFile');
  const resolved = fs.realpathSync(candidate);
  assertWithin(root, resolved, 'Archive gameFile');
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > WORKLOAD_CACHE_LIMITS.compressedGameBytes) throw new Error('Selected archive gameFile is not a regular file or exceeds the per-file byte limit.');
  const bytes = fs.readFileSync(resolved);
  const afterRead = fs.statSync(resolved);
  if (bytes.length !== stat.size || afterRead.size !== bytes.length) throw new Error('Archive gameFile changed while its source hash was computed.');
  return {
    relativePath: path.relative(root, resolved).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function loadVerifiedAppearanceCache(cacheDirectory, archiveDirectory) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workloadCacheRuns = path.join(repoRoot, 'prototypes', 'lineup-experiment-tools', 'workload-cache', 'runs');
  const workloadCacheRoot = fs.realpathSync(path.join(workloadCacheRuns, 'cache'));
  const resolvedDirectory = fs.realpathSync(path.resolve(cacheDirectory));
  assertWithin(workloadCacheRoot, resolvedDirectory, 'Workload appearance cache');

  const receiptBytes = readRegularFileWithin(resolvedDirectory, 'receipt.json', 'Workload cache receipt', 4 * 1024 * 1024);
  const appearanceBytes = readRegularFileWithin(resolvedDirectory, 'appearances.json', 'Workload cache appearances', WORKLOAD_CACHE_LIMITS.cacheBytes);
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const inputIdentity = receipt?.inputIdentity;
  const selectedFiles = inputIdentity?.selectedSourceFiles;
  const selection = inputIdentity?.selection;
  if (receipt?.format !== WORKLOAD_CACHE_FORMAT || !/^[a-f0-9]{64}$/.test(receipt.cacheKey ?? '')
    || receipt.cacheKey !== path.basename(resolvedDirectory)
    || receipt.appearancesSha256 !== sha256(appearanceBytes)
    || !Array.isArray(selectedFiles) || !selection || typeof selection !== 'object') {
    throw new Error('Workload appearance cache receipt failed format or integrity checks.');
  }
  if (sha256(Buffer.from(stableJson(inputIdentity))) !== receipt.cacheKey) throw new Error('Workload appearance cache key does not match its input identity.');

  const archiveRoot = fs.realpathSync(path.resolve(archiveDirectory));
  const manifestPath = path.join(archiveRoot, 'manifest.json');
  const manifestStat = fs.statSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > WORKLOAD_CACHE_LIMITS.manifestBytes) throw new Error('Archive manifest is missing or exceeds the manifest byte limit.');
  const manifestBytes = fs.readFileSync(manifestPath);
  if (manifestBytes.length !== manifestStat.size) throw new Error('Archive manifest changed while it was read.');
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== inputIdentity.sourceManifestSha256) throw new Error('Appearance cache source manifest hash does not match the supplied archive.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest || typeof manifest.games !== 'object' || manifest.games === null || Array.isArray(manifest.games)) throw new Error('Archive manifest must contain a games object.');
  const entries = Object.entries(manifest.games);
  if (entries.length > WORKLOAD_CACHE_LIMITS.manifestEntries) throw new Error('Archive manifest exceeds the entry-count limit.');
  const eligible = entries.filter(([, entry]) => entry?.status === 'completed'
    && entry.primaryPhase === 'regular'
    && entry.eligibleForPublication === true);
  if (!eligible.length) throw new Error('Archive manifest contains no completed, publication-eligible regular-season games.');

  const selectedCount = selection.selectedEligibleGames;
  const maximum = selection.maxGames;
  if (!Number.isSafeInteger(selectedCount) || selectedCount < 1 || selectedCount > WORKLOAD_CACHE_LIMITS.eligibleGames
    || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > WORKLOAD_CACHE_LIMITS.eligibleGames
    || selectedCount !== Math.min(maximum, eligible.length)
    || selection.status !== 'completed' || selection.primaryPhase !== 'regular'
    || selection.eligibleForPublication !== true || selection.manifestOrder !== true
    || selection.totalEligibleGames !== eligible.length || selection.partial !== (eligible.length > maximum)
    || selectedFiles.length !== selectedCount) {
    throw new Error('Appearance cache selection does not match the supplied archive manifest.');
  }

  const codeIdentity = currentWorkloadCodeIdentity();
  if (stableJson(receipt.codeIdentity) !== stableJson(codeIdentity)
    || stableJson(inputIdentity.codeIdentity) !== stableJson(codeIdentity)) {
    throw new Error('Appearance cache code hashes are stale or do not match the current benchmark and extraction code.');
  }

  const sourceFiles = [];
  const seenPaths = new Set();
  let totalCompressedBytes = 0;
  for (let index = 0; index < selectedCount; index += 1) {
    const [manifestGameId, entry] = eligible[index];
    const current = cacheSourceFile(archiveRoot, entry);
    if (seenPaths.has(current.relativePath.toLowerCase())) throw new Error('Archive manifest reuses a gameFile path.');
    seenPaths.add(current.relativePath.toLowerCase());
    totalCompressedBytes += current.bytes;
    if (totalCompressedBytes > WORKLOAD_CACHE_LIMITS.totalCompressedBytes) throw new Error('Selected archive exceeds the aggregate compressed-byte limit.');
    sourceFiles.push({ manifestGameId, ...current });
  }

  const expectedIdentity = {
    format: WORKLOAD_CACHE_FORMAT,
    sourceManifestSha256: manifestSha256,
    selectedSourceFiles: sourceFiles,
    selection: {
      status: 'completed',
      primaryPhase: 'regular',
      eligibleForPublication: true,
      manifestOrder: true,
      maxGames: maximum,
      selectedEligibleGames: selectedCount,
      totalEligibleGames: eligible.length,
      partial: eligible.length > maximum,
    },
    codeIdentity,
  };
  if (stableJson(expectedIdentity) !== stableJson(inputIdentity)) throw new Error('Appearance cache source file hashes or selection do not match the supplied archive.');
  if (receipt.source?.sourceManifestSha256 !== manifestSha256
    || receipt.source.selectedEligibleGames !== selectedCount
    || receipt.source.totalEligibleGames !== eligible.length
    || receipt.source.partial !== (eligible.length > maximum)
    || receipt.source.totalCompressedBytes !== totalCompressedBytes) {
    throw new Error('Appearance cache source summary does not match the verified source identity.');
  }

  const payload = JSON.parse(appearanceBytes.toString('utf8'));
  const games = payload?.games;
  const stats = receipt.stats;
  if (payload?.format !== WORKLOAD_CACHE_FORMAT || payload.cacheKey !== receipt.cacheKey || !Array.isArray(games)) {
    throw new Error('Cached appearance payload has an unsupported shape.');
  }
  validateGames(games);
  const integerStats = ['selectedEligibleGames', 'includedGames', 'rejectedMetadataMismatch', 'rejectedDuplicatePlayerGames',
    'rejectedReconciliation', 'acceptedOfficialPlayerReconciliation', 'acceptedLegacyPbpTeamScoreGate', 'activePlayerRows', 'decompressedBytes'];
  if (!stats || integerStats.some(key => !Number.isSafeInteger(stats[key]) || stats[key] < 0)
    || stats.selectedEligibleGames !== selectedCount || stats.includedGames !== games.length
    || stats.includedGames !== stats.acceptedOfficialPlayerReconciliation + stats.acceptedLegacyPbpTeamScoreGate
    || stats.activePlayerRows !== games.reduce((sum, game) => sum + game.rows.length, 0)) {
    throw new Error('Cached appearance rows disagree with their reconciliation receipt.');
  }

  if (sha256(fs.readFileSync(manifestPath)) !== manifestSha256
    || stableJson(currentWorkloadCodeIdentity()) !== stableJson(codeIdentity)) {
    throw new Error('Archive manifest or workload code changed while the appearance cache was verified.');
  }
  return {
    games,
    manifest,
    stats,
    cacheKey: receipt.cacheKey,
    cacheReceiptSha256: sha256(receiptBytes),
    sourceManifestSha256: manifestSha256,
    selectedEligibleGames: selectedCount,
    totalEligibleGames: eligible.length,
    partial: eligible.length > maximum,
  };
}

function parseArguments(argv) {
  const options = { archive: null, out: null, appearanceCache: null, writeRuntime: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(token + ' requires a value.');
      index += 1;
      return value;
    };
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--archive') options.archive = readValue();
    else if (token === '--out') options.out = readValue();
    else if (token === '--appearance-cache') options.appearanceCache = readValue();
    else if (token === '--write-runtime') options.writeRuntime = true;
    else throw new Error('Unknown option: ' + token);
  }
  if (!options.help && (!options.archive || !options.out)) throw new Error('--archive and --out are required.');
  return options;
}

function usage() {
  return [
    'Offline workload benchmark from an archived season.',
    '',
    'Usage:',
    '  node scripts/benchmark-lineup-workload.mjs --archive <archive-directory> --out <report>',
    '  node scripts/benchmark-lineup-workload.mjs --archive <archive-directory> --appearance-cache <cache-directory> --out <report>',
    '',
    'Without --appearance-cache, archive extraction follows the existing benchmark path.',
    'A supplied cache is used only after its code closure, source manifest, selected source-file hashes, and cached rows pass validation.',
    'Add --write-runtime to generate scalar-only runtime parameters from a complete eligible archive.',
  ].join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage() + '\n');
    return;
  }
  const root = path.resolve(options.archive);
  let manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const games = [];
  let rejected = 0;
  let appearanceCache = null;
  if (options.appearanceCache) {
    appearanceCache = loadVerifiedAppearanceCache(options.appearanceCache, root);
    manifest = appearanceCache.manifest;
    games.push(...appearanceCache.games);
    rejected = appearanceCache.stats.selectedEligibleGames - appearanceCache.stats.includedGames;
  } else {
    for (const entry of Object.values(manifest.games)) {
      if (entry.status !== 'completed' || entry.primaryPhase !== 'regular' || !entry.eligibleForPublication) continue;
      const filename = path.resolve(root, entry.gameFile);
      if (!filename.startsWith(root + path.sep)) throw new Error('Archive traversal refused.');
      const game = JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));
      const rows = gameRows(game);
      if (!rows.length) { rejected++; continue; }
      games.push({ id: game.game.providerGameId, date: game.game.scheduledAt, rows });
    }
  }
  if (options.writeRuntime && appearanceCache?.partial) throw new Error('Cannot write runtime calibration from a partial appearance cache.');
  const report = {
    ...runBenchmark(games),
    seasonEndYear: manifest.seasonEndYear,
    phase: 'regular',
    rejectedIncompleteGames: rejected,
    ...(appearanceCache ? { appearanceCache: {
      cacheKey: appearanceCache.cacheKey,
      cacheReceiptSha256: appearanceCache.cacheReceiptSha256,
      sourceManifestSha256: appearanceCache.sourceManifestSha256,
      selectedEligibleGames: appearanceCache.selectedEligibleGames,
      totalEligibleGames: appearanceCache.totalEligibleGames,
      partial: appearanceCache.partial,
      includedGames: games.length,
    } } : {}),
  };
  const out = path.resolve(options.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  if (options.writeRuntime) {
    if (Object.values(report.metrics).some(row => !row.parameters || row.test?.mse === null)) throw new Error('Incomplete metric validation cannot be published as runtime calibration.');
    // Publish only scalar fitted assumptions and aggregated error metrics.
    // Retain the untouched holdout results even when they are disappointing.
    const runtime = { version: report.version, seasonEndYear: report.seasonEndYear, phase: report.phase, sourceGameIdsSha256: report.sourceGameIdsSha256, split: report.split,
      metrics: Object.fromEntries(Object.entries(report.metrics).map(([metric, row]) => [metric, { ...row.parameters, testImprovementVsRaw: row.improvementVsRaw }])) };
    fs.writeFileSync('prototypes/basketball-lineup-optimizer/workload-calibration.js', '// Generated by benchmark-lineup-workload.mjs. No player rows or private source data.\nexport const WORKLOAD_CALIBRATION = Object.freeze(' + JSON.stringify(runtime, null, 2) + ');\n');
  }
  process.stdout.write(JSON.stringify({
    games: games.length,
    rejected,
    ...(appearanceCache ? { appearanceCache: { cacheKey: appearanceCache.cacheKey, sourceManifestSha256: appearanceCache.sourceManifestSha256, partial: appearanceCache.partial } } : {}),
    split: report.split,
    metrics: Object.fromEntries(Object.entries(report.metrics).map(([key, value]) => [key, { ...value.parameters, improvement: value.improvementVsRaw }])),
  }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
  });
}
