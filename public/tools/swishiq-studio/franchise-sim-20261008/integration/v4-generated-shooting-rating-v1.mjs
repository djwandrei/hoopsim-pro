import { normalizeCanonicalPlayerName } from '../lib/simulation-contracts-v1.mjs';

export const V4_GENERATED_SHOOTING_RATING_POLICY = 'generated-exposure-shrunk-snapshot-v1';
const clamp = value => Math.max(0, Math.min(100, value));
const definitions = [
  { id: 'effectiveFieldGoalPercentage', weight: 0.5, priorAttempts: 100, minimumPeerAttempts: 100 },
  { id: 'threePointPercentage', weight: 0.3, priorAttempts: 50, minimumPeerAttempts: 50 },
  { id: 'freeThrowPercentage', weight: 0.2, priorAttempts: 30, minimumPeerAttempts: 30 },
];
const count = value => Number.isSafeInteger(value) && value >= 0;

function shootingEvidence(player) {
  const b = player.box ?? {};
  if (!['fieldGoalsMade', 'fieldGoalAttempts', 'threePointersMade', 'threePointAttempts', 'freeThrowsMade', 'freeThrowAttempts']
    .every(field => count(b[field])) || b.fieldGoalsMade > b.fieldGoalAttempts || b.threePointersMade > b.threePointAttempts ||
    b.threePointAttempts > b.fieldGoalAttempts || b.threePointersMade > b.fieldGoalsMade || b.freeThrowsMade > b.freeThrowAttempts ||
    b.fieldGoalsMade - b.threePointersMade > b.fieldGoalAttempts - b.threePointAttempts) return null;
  return {
    effectiveFieldGoalPercentage: { value: b.fieldGoalAttempts ? (b.fieldGoalsMade + 0.5 * b.threePointersMade) / b.fieldGoalAttempts : null, attempts: b.fieldGoalAttempts },
    threePointPercentage: { value: b.threePointAttempts ? b.threePointersMade / b.threePointAttempts : null, attempts: b.threePointAttempts },
    freeThrowPercentage: { value: b.freeThrowAttempts ? b.freeThrowsMade / b.freeThrowAttempts : null, attempts: b.freeThrowAttempts },
  };
}

function percentile(value, peers) {
  const below = peers.filter(peer => peer < value - 1e-12).length;
  const equal = peers.filter(peer => Math.abs(peer - value) <= 1e-12).length;
  return 100 * (below + 0.5 * equal) / peers.length;
}

/** Explicit scenario proxy for missing shooting components only. Prespecified
 * weights and sample shrinkage are heuristics, not a trained skill forecast.
 * Observed ratings are never replaced; raw source values remain in the intake. */
export function buildV4GeneratedShootingRatingsV1(players) {
  if (!Array.isArray(players)) throw new Error('A resolved snapshot player array is required.');
  const rows = players.map(player => ({ player, key: normalizeCanonicalPlayerName(player.canonicalName), evidence: shootingEvidence(player) }));
  const seen = new Set();
  for (const row of rows) {
    if (!row.key || seen.has(row.key)) throw new Error('Generated shooting ratings require unique exact canonical player names.');
    seen.add(row.key);
  }
  const peers = Object.fromEntries(definitions.map(definition => [definition.id, rows
    .filter(row => row.evidence?.[definition.id]?.attempts >= definition.minimumPeerAttempts)
    .map(row => row.evidence[definition.id].value)]));
  const result = new Map();
  for (const row of rows) {
    if (row.player.shootingRating !== null && row.player.shootingRating !== undefined) continue;
    if (!row.evidence) {
      result.set(row.key, { status: 'requires-review', canonicalName: row.player.canonicalName,
        reason: 'Missing or inconsistent integer shooting counts.' });
      continue;
    }
    const components = definitions.map(definition => {
      const evidence = row.evidence[definition.id], distribution = peers[definition.id];
      // An empty shooting domain contributes its declared center, with zero
      // reliability, rather than asserting that the player is a 0% shooter.
      const reliability = evidence.attempts && distribution.length >= 10
        ? evidence.attempts / (evidence.attempts + definition.priorAttempts) : 0;
      const rank = reliability ? percentile(evidence.value, distribution) : null;
      return { ...definition, observedValue: evidence.value, attempts: evidence.attempts,
        peerCount: distribution.length, percentile: rank, reliability,
        shrunkValue: rank === null ? 50 : 50 + reliability * (rank - 50),
        assumption: reliability ? null : 'Neutral scenario center 50; zero attempts or fewer than ten qualifying peers.' };
    });
    const value = clamp(components.reduce((sum, component) => sum + component.weight * component.shrunkValue, 0));
    const reliability = components.reduce((sum, component) => sum + component.weight * component.reliability, 0);
    const halfWidth = 10 + 40 * (1 - reliability);
    result.set(row.key, { status: 'generated-scenario', canonicalName: row.player.canonicalName,
      value, method: V4_GENERATED_SHOOTING_RATING_POLICY,
      source: { kind: 'generated-from-exact-season-snapshot-counts', originalShootingRating: row.player.shootingRating ?? null,
        playerSource: structuredClone(row.player.sourceEvidence ?? null), peerPopulation: 'resolved same-snapshot roster',
        peerPlayerCount: rows.length, forecastingEligible: false },
      components, uncertainty: { kind: 'scenario-sensitivity-range', calibrated: false,
        lower: clamp(value - halfWidth), upper: clamp(value + halfWidth), exposureReliability: reliability },
      disclosure: 'Generated shooting proxy from exact-season efficiency percentiles with prespecified exposure shrinkage. Not an observed DJHC rating, calibrated forecast, or confidence interval.' });
  }
  return result;
}
