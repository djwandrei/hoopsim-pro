import { readPlayerUsage } from "./player-projection.js?v=20261002c";

/**
 * Soft lineup-composition model.
 *
 * Hard G/F/C rules prove that a group can take the floor. They do not prove
 * that it has a creator, shooting, rim protection, or connective passing. This
 * module adds a deliberately small, auditable role-complementarity adjustment
 * after the user's direct statistical priorities. Duplicate skills have
 * diminishing value; no role is a new hard constraint.
 */

export const LINEUP_ROLE_MODEL_VERSION = "role-complementarity-v5-missing-profile-neutral";
// Raw compatibility callers do not have the optimizer's posterior map. Keep
// their per-36 role signals conservative by anchoring short samples to the
// cohort median with the same minute-scale used by the projection model.
export const ROLE_SAMPLE_PRIOR_MINUTES = 720;
// Direct API callers retain the historical no-composition default for backward
// compatibility. The Lineup Lab UI deliberately sends `recommended`, making
// the small complementarity preference visible and shareable rather than a
// hidden change to an older integration's objective.
export const DEFAULT_ROLE_BALANCE = "off";
export const ROLE_BALANCE_LEVELS = Object.freeze({
  off: Object.freeze({ key: "off", label: "Off", maximumAdjustmentPoints: 0 }),
  recommended: Object.freeze({
    key: "recommended",
    label: "Recommended",
    maximumAdjustmentPoints: 5,
  }),
  emphasized: Object.freeze({
    key: "emphasized",
    label: "Emphasized",
    maximumAdjustmentPoints: 8,
  }),
});
export const ROLE_BALANCE_KEYS = Object.freeze(Object.keys(ROLE_BALANCE_LEVELS));

export const ROLE_DEFINITIONS = Object.freeze({
  primaryCreator: Object.freeze({ label: "Primary creator", side: "offense" }),
  floorSpacer: Object.freeze({ label: "Floor spacer", side: "offense" }),
  connector: Object.freeze({ label: "Connector", side: "offense" }),
  efficientFinisher: Object.freeze({ label: "Efficient finisher", side: "offense" }),
  pointOfAttack: Object.freeze({ label: "Point-of-attack defender", side: "defense" }),
  rimProtector: Object.freeze({ label: "Rim protector", side: "defense" }),
  rebounder: Object.freeze({ label: "Rebounder", side: "defense" }),
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function observedNumber(value) {
  if (value == null || typeof value === "boolean"
    || (typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function per36(player, field) {
  const minutes = observedNumber(player?.minutes);
  const value = observedNumber(player?.[field]);
  return minutes > 0 && value !== null && value >= 0
    ? (value / minutes) * 36
    : null;
}

function totalMinutes(player) {
  const candidates = [
    player?.totalMinutes,
    player?.minutesPlayed,
    player?.analytics?.totals?.minutes,
    player?.analytics?.totals?.minutesPlayed,
    player?.analytics?.seasonTotals?.minutes,
    player?.analytics?.seasonTotals?.minutesPlayed,
  ];
  for (const candidate of candidates) {
    const value = observedNumber(candidate);
    if (value !== null && value > 0) return value;
  }
  const games = observedNumber(player?.games);
  const minutesPerGame = observedNumber(player?.minutes);
  return Number.isFinite(games) && games > 0 && Number.isFinite(minutesPerGame) && minutesPerGame > 0
    ? games * minutesPerGame
    : null;
}

function sampleReliability(player) {
  const minutes = totalMinutes(player);
  return minutes === null ? null : minutes / (minutes + ROLE_SAMPLE_PRIOR_MINUTES);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stabilizedPer36(roster, field) {
  const raw = roster.map((player) => ({
    id: player.id,
    value: per36(player, field),
    reliability: sampleReliability(player),
  }));
  const prior = median(raw
    .filter((entry) => entry.reliability !== null)
    .map((entry) => entry.value));
  return raw.map((entry) => ({
    id: entry.id,
    value: prior === null || entry.reliability === null
      ? entry.value
      : prior + entry.reliability * (entry.value - prior),
  }));
}

function impact(player, aliases) {
  for (const source of [player?.analytics?.seasonAdvanced, player?.analytics?.advanced]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const alias of aliases) {
      const raw = source[alias];
      if (raw == null || typeof raw === "boolean"
        || (typeof raw !== "number" && typeof raw !== "string")
        || (typeof raw === "string" && raw.trim() === "")) continue;
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function percentiles(entries, lowerIsBetter = false) {
  const sorted = entries.filter((entry) => Number.isFinite(entry?.value)).slice().sort((left, right) => left.value - right.value ||
    String(left.id).localeCompare(String(right.id)));
  const result = new Map();
  // One observed value cannot establish who is better than an unobserved
  // comparison pool. Keep it neutral rather than turning missing rows into
  // implied below-average players or awarding the sole observed row a free
  // maximum role rank.
  if (sorted.length === 1) return new Map([[sorted[0].id, 0.5]]);
  let index = 0;
  while (index < sorted.length) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[index].value) end += 1;
    const rank = (index + end) / 2;
    const value = sorted.length > 1 ? rank / (sorted.length - 1) : 1;
    for (let cursor = index; cursor <= end; cursor += 1) {
      result.set(sorted[cursor].id, lowerIsBetter ? 1 - value : value);
    }
    index = end + 1;
  }
  return result;
}

function weighted(...pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  return total > 0
    ? pairs.reduce((sum, [value, weight]) => sum + (number(value) * weight), 0) / total
    : 0;
}

/** Build role signals once over the full eligible pool so candidates share one scale. */
export function buildLineupRoleModel(players = [], { normalizedMetrics = null } = {}) {
  const roster = Array.isArray(players) ? players : [];
  const measurements = {
    points: stabilizedPer36(roster, "points"),
    rebounds: stabilizedPer36(roster, "rebounds"),
    assists: stabilizedPer36(roster, "assists"),
    steals: stabilizedPer36(roster, "steals"),
    blocks: stabilizedPer36(roster, "blocks"),
    turnovers: stabilizedPer36(roster, "turnovers"),
    efgPct: roster.map((player) => ({ id: player.id, value: observedNumber(player?.efgPct) })),
    threePct: roster.map((player) => ({ id: player.id, value: observedNumber(player?.threePct) })),
    // Keep missing usage out of the percentile sample. Treating an absent
    // rate as a literal 20% observation gives unknown players a made-up rank
    // and can change creator coverage merely because a field was omitted.
    usage: roster.map((player) => ({ id: player.id, value: readPlayerUsage(player) })),
    offensiveImpact: roster.map((player) => ({
      id: player.id,
      value: impact(player, ["offensive_box_plus_minus", "offensiveBoxPlusMinus", "obpm"]),
    })),
    defensiveImpact: roster.map((player) => ({
      id: player.id,
      value: impact(player, ["defensive_box_plus_minus", "defensiveBoxPlusMinus", "dbpm"]),
    })),
  };
  const usagePercentiles = percentiles(
    measurements.usage.filter((entry) => Number.isFinite(entry.value)),
  );
  const metricPercentiles = Object.fromEntries(Object.entries(measurements).map(([key, entries]) => [
    key,
    key === "usage" ? usagePercentiles : percentiles(entries, key === "turnovers"),
  ]));
  const pct = Object.fromEntries(Object.entries(measurements).map(([key, entries]) => [
    key,
    key === "usage"
      ? new Map(roster.map((player) => [player.id, usagePercentiles.get(player.id) ?? .5]))
      : new Map(roster.map((player) => [
        player.id,
        metricPercentiles[key].get(player.id) ?? .5,
      ])),
  ]));
  // Raw compatibility callers may only have BPM for part of the roster.
  // Missing is not a measured league-average zero; rank observed values only,
  // then leave unsupported rows at neutral coverage. Fewer than two observed
  // values cannot establish a relative role ranking, so keep that whole signal
  // neutral until there is an actual comparison cohort.
  for (const key of ["offensiveImpact", "defensiveImpact"]) {
    const observed = pct[key];
    pct[key] = observed.size < 2
      ? new Map(roster.map((player) => [player.id, 0.5]))
      : new Map(roster.map((player) => [player.id, observed.get(player.id) ?? 0.5]));
  }
  if (normalizedMetrics instanceof Map) {
    // A secondary role signal must not sneak raw low-minute spikes back into
    // a sample-adjusted objective. Reuse the exact solver's contributions,
    // including its per-metric raw fallback where evidence is unavailable.
    // This also prevents supported signals from moving with unrelated rows.
    for (const key of Object.keys(pct)) {
      const metric = key === "turnovers" ? "ballSecurity" : key;
      pct[key] = new Map(roster.map(player => {
        if (key === "usage") {
          const usage = readPlayerUsage(player);
          // Missing usage remains neutral, not a made-up 20% observation.
          return [player.id, usage === null ? .5 : Math.max(0, Math.min(1, usage / .4))];
        }
        const value = normalizedMetrics.get(player.id)?.[metric];
        return [player.id, Number.isFinite(value) ? value : .5];
      }));
    }
  }
  const signalsById = new Map();
  const sampleEvidenceById = new Map();
  for (const player of roster) {
    const id = player.id;
    const rawSignals = {
      primaryCreator: weighted(
        [pct.assists.get(id), 0.42],
        [pct.usage.get(id), 0.3],
        [pct.points.get(id), 0.18],
        [pct.offensiveImpact.get(id), 0.1],
      ),
      // Finishing inside the arc is not evidence of floor spacing. The shared
      // three-point signal already includes accuracy and supported frequency.
      floorSpacer: pct.threePct.get(id),
      connector: weighted(
        [pct.assists.get(id), 0.5],
        [pct.turnovers.get(id), 0.35],
        [pct.offensiveImpact.get(id), 0.15],
      ),
      efficientFinisher: weighted(
        [pct.efgPct.get(id), 0.55],
        [pct.points.get(id), 0.3],
        [pct.offensiveImpact.get(id), 0.15],
      ),
      pointOfAttack: weighted(
        [pct.steals.get(id), 0.6],
        [pct.defensiveImpact.get(id), 0.4],
      ),
      rimProtector: weighted(
        [pct.blocks.get(id), 0.6],
        [pct.rebounds.get(id), 0.25],
        [pct.defensiveImpact.get(id), 0.15],
      ),
      rebounder: weighted(
        [pct.rebounds.get(id), 0.8],
        [pct.defensiveImpact.get(id), 0.2],
      ),
    };
    const reliability = sampleReliability(player);
    const signals = normalizedMetrics instanceof Map || reliability === null
      ? rawSignals
      : Object.fromEntries(Object.entries(rawSignals).map(([role, value]) => [
        role,
        0.5 + reliability * (value - 0.5),
      ]));
    signalsById.set(id, signals);
    sampleEvidenceById.set(id, {
      totalMinutes: totalMinutes(player),
      reliability,
      stabilized: normalizedMetrics instanceof Map ? false : reliability !== null,
    });
  }
  return {
    version: LINEUP_ROLE_MODEL_VERSION,
    eligiblePlayerCount: roster.length,
    evidenceBasis: normalizedMetrics instanceof Map ? "optimizer-contributions" : "raw-profile-compatibility",
    sampleStabilization: {
      method: normalizedMetrics instanceof Map
        ? "optimizer-contributions-no-secondary-shrink"
        : "cohort-median-per36-minute-prior-v1",
      priorMinutes: ROLE_SAMPLE_PRIOR_MINUTES,
      caveat: "Raw compatibility role rates are anchored toward the comparison-pool median when source minutes are available; this is not a forecast or confidence interval.",
    },
    sampleEvidenceById: Object.fromEntries(sampleEvidenceById),
    signalsById,
  };
}

function rolePriorityWeights(objectiveWeights = {}) {
  const value = (key) => Math.max(0, number(objectiveWeights[key]));
  const weights = {
    // No all-role intercept: a points-only request must not acquire a hidden
    // defense preference, and blocks-only must not secretly demand creators.
    primaryCreator: value("assists") + value("offensiveImpact") * 0.5,
    floorSpacer: value("threePct"),
    connector: value("assists") * 0.5 + value("ballSecurity") * 0.8,
    efficientFinisher: value("points") * 0.65 + value("efgPct") * 0.7,
    pointOfAttack: value("steals") + value("defensiveImpact") * 0.5,
    rimProtector: value("blocks") + value("defensiveImpact") * 0.4,
    rebounder: value("rebounds"),
  };
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(Object.entries(weights).map(([role, weight]) => [
    role,
    total > 0 ? weight / total : 1 / Object.keys(weights).length,
  ]));
}

/**
 * Coverage uses the two strongest players for each role. The first receives
 * most of the credit; the second supplies redundancy at a diminishing return.
 */
export function scoreLineupRoleFit(
  players,
  roleModel,
  { objectiveWeights = {}, balance = DEFAULT_ROLE_BALANCE } = {},
) {
  const level = ROLE_BALANCE_LEVELS[balance] || ROLE_BALANCE_LEVELS[DEFAULT_ROLE_BALANCE];
  const priorities = rolePriorityWeights(objectiveWeights);
  const coverage = {};
  for (const role of Object.keys(ROLE_DEFINITIONS)) {
    const signals = players
      .map((player) => number(roleModel?.signalsById?.get(player.id)?.[role]))
      .sort((left, right) => right - left);
    coverage[role] = Math.min(1, (signals[0] || 0) * 0.78 + (signals[1] || 0) * 0.22);
  }
  const fitIndex = Object.entries(coverage).reduce(
    (sum, [role, value]) => sum + value * priorities[role] * 100,
    0,
  );
  // Sixty represents adequate broad coverage. The adjustment remains small
  // enough that a merely tidy roster cannot defeat a materially better match
  // to the user's direct priorities.
  const centered = Math.max(-1, Math.min(1, (fitIndex - 60) / 40));
  // Multiplying a negative centered score by zero produces JavaScript's
  // surprising `-0`. Return a literal zero when the model is explanation-only
  // so diagnostics, JSON, and strict tests all report one unambiguous value.
  const adjustmentPoints = level.maximumAdjustmentPoints > 0
    ? centered * level.maximumAdjustmentPoints
    : 0;
  const ordered = Object.entries(coverage)
    .map(([role, value]) => ({ role, label: ROLE_DEFINITIONS[role].label, coverage: value }))
    .sort((left, right) => right.coverage - left.coverage);
  return {
    version: LINEUP_ROLE_MODEL_VERSION,
    balance: level.key,
    applied: level.maximumAdjustmentPoints > 0,
    fitIndex,
    adjustmentPoints,
    coverage,
    strengths: ordered.slice(0, 3),
    needs: ordered.slice().sort((left, right) => left.coverage - right.coverage).slice(0, 3),
    reason: level.maximumAdjustmentPoints > 0
      ? "A small diminishing-return bonus rewards complementary roles without adding a new hard constraint."
      : "Role balance was left as explanation only and did not affect ranking.",
  };
}
