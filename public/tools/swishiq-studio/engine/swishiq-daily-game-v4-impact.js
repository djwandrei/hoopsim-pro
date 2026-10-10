/* Historical contest scoring from the immutable, separately verified Impact companion. */
import { canonicalV4IdentityJson } from './canonical-v4-identity.js';
import { normalizeCanonicalV4PlayerNameKey } from './canonical-v4-player-name-identity.js';
import { CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN as MODEL_PIN } from './canonical-v4-impact-model-release-pin.js';
import { resolveCanonicalV4ImpactModel } from './canonical-v4-impact-model-resolver.js';

export const DAILY_IMPACT_SCORING_CONTRACT = 'swishiq-impact-combined-source-ranking-v1';
const resolvedModels = new WeakSet();
const REF_KEYS = ['releaseId', 'modelId', 'modelVersion', 'manifestPath', 'manifestSha256', 'manifestBytes'];
const MANIFEST_PATH = `tools/swishiq-studio/data/v4/impact-models/${MODEL_PIN.releaseId}/manifest.json`;
function fail(code, message) { throw Object.assign(new Error(message), { code }); }

export function normalizeDailyImpactModelRef(value) {
  const expected = { releaseId: MODEL_PIN.releaseId, modelId: MODEL_PIN.modelId,
    modelVersion: MODEL_PIN.modelVersion, manifestPath: MANIFEST_PATH,
    manifestSha256: MODEL_PIN.manifestSha256, manifestBytes: MODEL_PIN.manifestBytes };
  if (!value || Object.keys(value).sort().join(',') !== [...REF_KEYS].sort().join(',')
    || REF_KEYS.some(key => value[key] !== expected[key])) {
    fail('v4-daily-impact-ref-invalid', 'The contest must use the frozen native Impact companion.');
  }
  return Object.freeze(expected);
}

export async function loadDailyImpactModel({ board, fetchImpl, baseUrl } = {}) {
  const ref = normalizeDailyImpactModelRef(board?.impactModelRef);
  const packageRef = board?.packageRef;
  const year = packageRef?.scope?.seasonStartYear;
  if (board?.contractVersion !== 3 || board.scoringContract !== DAILY_IMPACT_SCORING_CONTRACT
    || !Number.isInteger(year) || year < 2017 || year > 2025 || packageRef.phase !== 'regular') {
    fail('v4-daily-impact-scope-invalid', 'Impact contests require one completed historical regular season.');
  }
  const root = new URL(baseUrl || globalThis.location?.origin || 'https://www.djshouseofcards-comics.com/');
  const manifestUrl = new URL(ref.manifestPath, root);
  const model = await resolveCanonicalV4ImpactModel({
    baseUrl: new URL('./', manifestUrl).href, manifestPath: 'manifest.json',
    expectedManifestSha256: ref.manifestSha256, expectedManifestBytes: ref.manifestBytes,
    expectedReleaseId: ref.releaseId, seasonStartYear: year, phase: 'regular',
    packageId: packageRef.packageId, packageVersion: packageRef.packageVersion,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const passport = model.v4Context.sourcePassport;
  if (passport.model.modelVersion !== ref.modelVersion
    || passport.sourceRelease.releaseId !== packageRef.releaseId
    || passport.sourceRelease.indexSha256 !== packageRef.indexSha256
    || passport.sourceRelease.sourceLockSha256 !== packageRef.sourceLockSha256) {
    fail('v4-daily-impact-package-mismatch', 'The companion is not bound to this exact board package.');
  }
  resolvedModels.add(model);
  return model;
}

export function evaluateV4ImpactCompanionSelection({ request, board, impactModel, playerGamesPart } = {}) {
  if (!resolvedModels.has(impactModel) || playerGamesPart?.status !== 'verified'
    || playerGamesPart.artifactId !== 'player-games'
    || playerGamesPart.package?.packageId !== board.packageRef.packageId
    || playerGamesPart.package?.packageVersion !== board.packageRef.packageVersion
    || !Array.isArray(playerGamesPart.records)) {
    fail('v4-daily-evaluator-input-unverified', 'Verified companion and player-game membership are required.');
  }
  const rows = board.gameKind === 'fix-the-five'
    ? (() => { const c = board.challenges.find(x => x.challengeId === request.selection.challengeId);
      if (!c) fail('v4-daily-selection-invalid', 'Challenge is not on this board.'); return [...c.lineup, ...c.candidates]; })()
    : board.deck.rounds.flatMap(x => x.candidates);
  const byName = new Map(impactModel.records.map(row => [row.player.playerNameKey, row]));
  const memberships = new Map(rows.map(row => [JSON.stringify([row.normalizedPlayerNameKey, row.teamCode]), new Set()]));
  for (const row of playerGamesPart.records) {
    const key = JSON.stringify([normalizeCanonicalV4PlayerNameKey(row.values?.displayName || ''), row.entities?.teamCode]);
    if (memberships.has(key) && row.time?.seasonStartYear === board.packageRef.scope.seasonStartYear
      && row.time.phase === 'regular' && row.evidence?.status === 'available'
      && Number.isFinite(row.values?.minutes) && row.values.minutes > 0 && row.entities?.gameRef) {
      memberships.get(key).add(row.entities.gameRef);
    }
  }
  const used = new Set();
  for (const row of rows) {
    const key = row.normalizedPlayerNameKey;
    const estimate = byName.get(key);
    if (used.has(key) || !estimate || !Number.isFinite(estimate.values.combined.value)
      || estimate.availability?.displayEligible !== true) {
      fail('v4-daily-impact-row-unavailable', 'Board identities must be distinct eligible fitted estimates.');
    }
    used.add(key);
    if (!memberships.get(JSON.stringify([key, row.teamCode]))?.size) {
      fail('v4-daily-box-score-context-unavailable', 'A player has no observed membership for the historical team.');
    }
  }
  const mean = keys => keys.reduce((sum, key) => sum + byName.get(key).values.combined.value, 0) / keys.length;
  let ranked, selectedKeys;
  if (board.gameKind === 'fix-the-five') {
    const c = board.challenges.find(x => x.challengeId === request.selection.challengeId);
    const retained = c.lineup.filter(x => x.normalizedPlayerNameKey !== c.removeNormalizedPlayerNameKey).map(x => x.normalizedPlayerNameKey);
    if (retained.length !== 4) fail('v4-daily-board-invalid', 'A replacement must retain four baseline players.');
    ranked = c.candidates.map(x => ({ keys: [x.normalizedPlayerNameKey], value: mean([...retained, x.normalizedPlayerNameKey]) }));
    selectedKeys = [request.selection.normalizedPlayerNameKey];
  } else {
    ranked = [];
    const visit = (i, keys) => {
      if (i === 5) { ranked.push({ keys, value: mean(keys) }); return; }
      for (const row of board.deck.rounds[i].candidates) visit(i + 1, [...keys, row.normalizedPlayerNameKey]);
    };
    visit(0, []);
    selectedKeys = request.selection.map(x => x.normalizedPlayerNameKey);
  }
  // ASCII ordering of canonical keys is stable across host locales and matches the generator.
  ranked.sort((a, b) => b.value - a.value || (a.keys.join('|') < b.keys.join('|') ? -1 : a.keys.join('|') > b.keys.join('|') ? 1 : 0));
  const selected = ranked.findIndex(x => canonicalV4IdentityJson(x.keys) === canonicalV4IdentityJson(selectedKeys));
  if (selected < 0) fail('v4-daily-selection-invalid', 'Selection is not a legal complete board choice.');
  return Object.freeze({ format: 'djhc-swishiq-v4-daily-game-evaluator-v3',
    version: 'swishiq-v4-daily-native-companion-rank-v1', status: 'complete',
    evaluationKind: 'descriptive-source-impact-ranking',
    scope: { kind: 'exact-season', seasonStartYear: board.packageRef.scope.seasonStartYear, phase: 'regular' },
    decision: { rank: selected + 1, optionCount: ranked.length, countComplete: true },
    bestSelection: board.gameKind === 'fix-the-five' ? ranked[0].keys[0] : ranked[0].keys,
    estimatedImpact: { value: ranked[selected].value, bestValue: ranked[0].value,
      gapToBest: Math.max(0, ranked[0].value - ranked[selected].value), unit: 'points-per-100-possessions',
      comparison: 'selected five-player mean combined Impact among all legal choices' },
    evidence: { impactRows: used.size, sameTeamPhaseBoxScorePlayers: used.size,
      sameTeamPhaseBoxScoreGames: [...memberships.values()].reduce((sum, games) => sum + games.size, 0),
      attributionScope: 'season-coefficients-with-observed-team-membership', predictiveEligibility: false,
      calibrationStatus: 'historical-conditional-lineup-recipe-accepted', uncertainty: 'not-estimated' },
  });
}
