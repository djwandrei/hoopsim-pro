// Pure, browser-safe analysis over the compact SwishIQ presentation contract.
// No fitted effects, inferred skills, synthetic observations, or network access.
export const BLUEPRINT_MODEL_VERSION = 'swishiq-player-blueprint-v3';
export const REVIEW_POLICY = Object.freeze({ minAttempts: 25, minPossessions: 200, minPeers: 3 });
export const METRIC_SPECS = Object.freeze([
  ['threePointAccuracy', 'Three-point accuracy', 'percent'],
  ['threePointFrequency', 'Three-point frequency', 'percent'],
  ['freeThrowAccuracy', 'Free-throw accuracy', 'percent'],
  ['points', 'Scoring production', 'per100'], ['assists', 'Recorded assists', 'per100'],
  ['turnovers', 'Recorded turnovers', 'per100'], ['rebounds', 'Recorded rebounds', 'per100'],
  ['steals', 'Recorded steals', 'per100'], ['blocks', 'Recorded blocks', 'per100'],
  ['foulsDrawn', 'Recorded fouls drawn', 'per100'],
].map(([key, label, unit]) => Object.freeze({ key, label, unit })));
export const FORGE_BLOCKS = Object.freeze([
  ['shooting', 'Shooting', ['threePointAccuracy', 'threePointFrequency', 'freeThrowAccuracy']],
  ['scoring', 'Scoring & foul pressure', ['points', 'foulsDrawn']],
  ['creation', 'Creation & ball security', ['assists', 'turnovers']],
  ['rebounding', 'Rebounding', ['rebounds']],
  ['disruption', 'Recorded disruption', ['steals', 'blocks']],
].map(([key, label, metrics]) => Object.freeze({ key, label, metrics: Object.freeze(metrics) })));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const round = value => Math.round(value * 10000) / 10000;
const playerId = value => typeof value === 'string' && /^p\d{1,4}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const ROLE_ALIASES = Object.freeze({
  pg: 'guard', point_guard: 'guard', pointguard: 'guard', g: 'guard',
  sg: 'guard', shooting_guard: 'guard', shootingguard: 'guard', combo_guard: 'guard',
  sf: 'forward', small_forward: 'forward', smallforward: 'forward', f: 'forward',
  pf: 'forward', power_forward: 'forward', powerforward: 'forward', forward: 'forward',
  c: 'center', center: 'center', center_big: 'center', centerbig: 'center',
  wing: 'wing', wing_forward: 'wing', wingforward: 'wing',
});
function playerRole(player) {
  const value = [player?.role, player?.position, player?.primaryPosition, player?.archetype]
    .find(candidate => typeof candidate === 'string' && candidate.trim());
  if (!value) return null;
  const label = value.trim().slice(0, 80);
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key ? { label, key: ROLE_ALIASES[key] || key } : null;
}
export function validStudioScope(scope) {
  return /^s[a-f0-9]{24}$/.test(scope?.snapshot) && /^t\d{1,2}$/.test(scope?.team);
}
export function validateAnalysisRoster(roster) {
  if (!validStudioScope(roster) || !Array.isArray(roster.players) || !roster.players.length || roster.players.length > 1000
    || new Set(roster.players.map(player => player?.id)).size !== roster.players.length
    || roster.players.some(player => !playerId(player?.id) || typeof player.name !== 'string' || !player.name.trim()
      || player.name.length > 160 || !Array.isArray(player.metrics) || player.metrics.length > 50)) {
    throw new Error('Load a valid, single-team SwishIQ roster before using this workbench.');
  }
  return roster;
}
function requirePlayer(roster, id) {
  validateAnalysisRoster(roster);
  const player = roster.players.find(player => player.id === id);
  if (!player) throw new Error('Choose a player from this team and snapshot.');
  return player;
}

export function metricEvidence(player, key) {
  const spec = METRIC_SPECS.find(spec => spec.key === key);
  if (!spec) throw new Error('Unsupported SwishIQ component.');
  const matches = player?.metrics?.filter(metric => metric?.key === key) || [];
  const metric = matches.length === 1 ? matches[0] : null;
  const denominator = finite(metric?.denominator) && metric.denominator > 0 ? metric.denominator : null;
  const numerator = count(metric?.numerator) ? metric.numerator : null;
  const computed = numerator !== null && denominator !== null ? numerator / denominator * (spec.unit === 'per100' ? 100 : 1) : null;
  const valid = metric?.status === 'observed' && metric.unit === spec.unit && finite(metric.value)
    && finite(computed) && Math.abs(computed - metric.value) <= 0.000051
    && (spec.unit !== 'per100' || (count(denominator) && count(player?.estimatedTeamPossessions)
      && denominator === player.estimatedTeamPossessions))
    && (spec.unit !== 'percent' || (count(denominator) && numerator <= denominator));
  const minimum = spec.unit === 'percent' ? REVIEW_POLICY.minAttempts : REVIEW_POLICY.minPossessions;
  const status = !valid ? 'unavailable' : denominator < minimum ? 'limited_sample' : 'reviewable';
  return { ...spec, value: valid ? round(computed) : null, numerator, denominator, minimum, status,
    reconciled: player?.coverage?.independentBoxScore === 'complete_and_reconciled',
    reason: !valid ? 'Missing, duplicated, or inconsistent evidence.' : status === 'limited_sample'
      ? `Below the workbench review threshold of ${minimum} ${spec.unit === 'percent' ? 'attempts' : 'estimated possessions'}.`
      : 'Enough exposure for this descriptive comparison; not proof of completeness or predictive reliability.' };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b), center = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
}
function blueprintCohort(roster, player, id) {
  const peers = roster.players.filter(peer => peer.id !== id);
  const role = playerRole(player);
  const labeledPeers = peers.filter(peer => playerRole(peer));
  const roleScoped = Boolean(role && labeledPeers.length);
  const candidates = roleScoped ? peers.filter(peer => playerRole(peer)?.key === role.key) : peers;
  const fallback = !role ? null : !labeledPeers.length ? 'peer-role-labels-missing' : !candidates.length ? 'no-same-role-peers' : null;
  return { role, scope: roleScoped ? 'same-role' : 'team', fallback,
    peers: candidates, rosterCandidates: peers.length };
}
export function buildBlueprint(roster, id) {
  const player = requirePlayer(roster, id);
  const cohort = blueprintCohort(roster, player, id);
  const components = METRIC_SPECS.map(spec => {
    const component = metricEvidence(player, spec.key);
    // Comparison population is other profiles in this roster, not the league.
    const peers = cohort.peers.map(peer => metricEvidence(peer, spec.key))
      .filter(metric => metric.status === 'reviewable');
    const peerMedian = peers.length >= REVIEW_POLICY.minPeers ? round(median(peers.map(metric => metric.value))) : null;
    return { ...component, cohort: { eligible: peers.length, candidates: cohort.peers.length,
      median: peerMedian, difference: component.status === 'reviewable' && peerMedian !== null ? round(component.value - peerMedian) : null,
      scope: cohort.scope, role: cohort.role?.label || null, fallback: cohort.fallback } };
  });
  return { modelVersion: BLUEPRINT_MODEL_VERSION, snapshot: roster.snapshot, team: roster.team, player: { id, name: player.name, role: cohort.role?.label || null }, components,
    policy: REVIEW_POLICY,
    summary: { reviewableComponents: components.filter(component => component.status === 'reviewable').length,
      limitedSampleComponents: components.filter(component => component.status === 'limited_sample').length,
      unavailableComponents: components.filter(component => component.status === 'unavailable').length,
      cohort: { scope: cohort.scope, role: cohort.role?.label || null, candidates: cohort.peers.length,
        rosterCandidates: cohort.rosterCandidates, fallback: cohort.fallback } },
    note: 'Other-player medians use this team’s pooled-window profiles and exclude low-exposure or unavailable values. When roles are labeled, medians use same-role peers only; common position aliases (for example PG/G and C/Center) are canonicalized, while incomplete labels or a missing same-role peer set are disclosed rather than silently replaced with cross-role values. Peers may not be independently box-score reconciled. These are descriptive review thresholds, not validated talent cutoffs or league rankings.' };
}

export function comparePlayerEvidence(roster, firstId, secondId) {
  const first = requirePlayer(roster, firstId), second = requirePlayer(roster, secondId);
  if (firstId === secondId) return [];
  const firstRole = playerRole(first), secondRole = playerRole(second);
  const comparability = firstRole && secondRole ? (firstRole.key === secondRole.key ? 'same-role' : 'cross-role') : 'unlabeled';
  return METRIC_SPECS.map(spec => {
    const a = metricEvidence(first, spec.key), b = metricEvidence(second, spec.key);
    return { ...spec, first: a, second: b,
      difference: a.status === 'reviewable' && b.status === 'reviewable' ? round(a.value - b.value) : null,
      comparability, firstRole: firstRole?.label || null, secondRole: secondRole?.label || null };
  });
}

export function sampleEvidence(sample) {
  const exposure = count(sample?.offensePossessions) && sample.offensePossessions > 0
    && count(sample?.defensePossessions) && sample.defensePossessions > 0
    && count(sample?.minimumCombinedPossessions) && sample.minimumCombinedPossessions > 0
    && sample.offensePossessions + sample.defensePossessions >= sample.minimumCombinedPossessions;
  const rates = ['offensiveRating', 'defensiveRating', 'netRating'];
  const valid = sample?.status === 'observed' && exposure && rates.every(key => finite(sample[key]))
    && sample.offensiveRating >= 0 && sample.offensiveRating <= 300
    && sample.defensiveRating >= 0 && sample.defensiveRating <= 300
    && sample.netRating >= -300 && sample.netRating <= 300
    && Math.abs(sample.offensiveRating - sample.defensiveRating - sample.netRating) <= 0.011;
  const interval = valid && finite(sample.interval?.lower) && finite(sample.interval?.upper)
    && sample.interval.lower <= sample.netRating && sample.interval.upper >= sample.netRating
    ? { lower: sample.interval.lower, upper: sample.interval.upper } : null;
  return { status: valid ? 'observed' : !sample ? 'unavailable' : !exposure ? 'insufficient_sample' : 'unavailable',
    games: count(sample?.games) ? sample.games : null,
    offensePossessions: count(sample?.offensePossessions) ? sample.offensePossessions : null,
    defensePossessions: count(sample?.defensePossessions) ? sample.defensePossessions : null,
    minimumCombinedPossessions: count(sample?.minimumCombinedPossessions) ? sample.minimumCombinedPossessions : null,
    offensiveRating: valid ? sample.offensiveRating : null, defensiveRating: valid ? sample.defensiveRating : null,
    netRating: valid ? sample.netRating : null, interval };
}
export function analyzeChemistry(roster, result, selection) {
  validateAnalysisRoster(roster);
  if (!Array.isArray(selection) || selection.length < 2 || selection.length > 5 || new Set(selection).size !== selection.length
    || selection.some(id => !roster.players.some(player => player.id === id)) || result?.snapshot !== roster.snapshot
    || result?.team !== roster.team || JSON.stringify(selection) !== JSON.stringify(result.selection)) {
    throw new Error('Chemistry evidence does not match the selected team, snapshot, and players.');
  }
  const kind = selection.length === 5 ? 'exact_five' : 'shared_floor';
  if ((result.pairs != null && (!Array.isArray(result.pairs) || result.pairs.length > 10))
    || (result.wowy != null && (!Array.isArray(result.wowy) || result.wowy.length > 4))) throw new Error('Chemistry evidence exceeds its bounded contract.');
  if (result.combination && result.combination.kind !== kind) throw new Error('The shared-floor sample has the wrong group size.');
  const keys = ['a_on_b_on', 'a_on_b_off', 'a_off_b_on', 'a_off_b_off'];
  const cells = selection.length === 2 ? keys.map(key => {
    const rows = Array.isArray(result.wowy) ? result.wowy.filter(row => row.key === key) : [];
    const row = rows.length === 1 ? rows[0] : null;
    return { key, label: typeof row?.label === 'string' && row.label.length <= 170 ? row.label : key, ...sampleEvidence(row) };
  }) : [];
  const contrasts = cells.slice(1).map(cell => ({ label: `Together minus ${cell.label}`,
    offensiveDifference: cells[0].status === 'observed' && cell.status === 'observed' ? round(cells[0].offensiveRating - cell.offensiveRating) : null,
    defensiveDifference: cells[0].status === 'observed' && cell.status === 'observed' ? round(cells[0].defensiveRating - cell.defensiveRating) : null,
    netDifference: cells[0].status === 'observed' && cell.status === 'observed' ? round(cells[0].netRating - cell.netRating) : null }));
  const pairs = [];
  if (selection.length > 2) for (let a = 0; a < selection.length; a++) for (let b = a + 1; b < selection.length; b++) {
    const ids = [selection[a], selection[b]];
    const matches = Array.isArray(result.pairs) ? result.pairs.filter(pair => Array.isArray(pair.selection)
      && pair.selection.length === 2 && ids.every(id => pair.selection.includes(id))) : [];
    const row = matches.length === 1 ? matches[0] : null;
    pairs.push({ selection: ids, label: ids.map(id => roster.players.find(player => player.id === id).name).join(' + '),
      ...sampleEvidence(row?.combination?.kind === 'shared_floor' ? row.combination.sample : null) });
  }
  return { kind, observedGroup: Boolean(result.combination), sample: sampleEvidence(result.combination?.sample), cells, contrasts, pairs,
    note: 'Differences are descriptive, not causal effects. Lower defensive rating means fewer points allowed. Pair samples overlap and are never added into a group score. No confidence interval for a difference is inferred from overlapping samples.' };
}

export function createForgeRecipe(roster, donors = {}) {
  validateAnalysisRoster(roster);
  if (!object(donors) || Object.keys(donors).some(key => !FORGE_BLOCKS.some(block => block.key === key))) throw new Error('Unknown composite component.');
  const chosen = Object.fromEntries(FORGE_BLOCKS.map(block => {
    const id = donors[block.key] ?? '';
    if (id !== '') requirePlayer(roster, id);
    return [block.key, id];
  }));
  return { version: 1, snapshot: roster.snapshot, team: roster.team, donors: chosen };
}
export function buildComposite(roster, recipe, baselineId = '') {
  if (recipe?.version !== 1 || recipe.snapshot !== roster?.snapshot || recipe.team !== roster?.team) {
    throw new Error('This recipe belongs to a different SwishIQ snapshot or team.');
  }
  const clean = createForgeRecipe(roster, recipe.donors);
  const baseline = baselineId ? requirePlayer(roster, baselineId) : null;
  const blocks = FORGE_BLOCKS.map(block => {
    const donor = roster.players.find(player => player.id === clean.donors[block.key]);
    const components = block.metrics.map(key => {
      const evidence = metricEvidence(donor, key), reference = baseline ? metricEvidence(baseline, key) : null;
      return { ...evidence, baseline: reference?.value ?? null,
        difference: evidence.status === 'reviewable' && reference?.status === 'reviewable' ? round(evidence.value - reference.value) : null };
    });
    return { key: block.key, label: block.label, donor: donor ? { id: donor.id, name: donor.name } : null, components };
  });
  const all = blocks.flatMap(block => block.components), assigned = blocks.filter(block => block.donor).length;
  return { recipe: clean, blocks, assigned, totalBlocks: FORGE_BLOCKS.length,
    status: assigned < FORGE_BLOCKS.length ? 'incomplete' : all.some(metric => metric.status !== 'reviewable' || !metric.reconciled) ? 'complete_with_caveats' : 'complete',
    note: 'Hypothetical component recipe, not an observed player or forecast. Donor rates retain their own samples. Shooting does not recalculate scoring; creation keeps assists and turnovers together. No combined RAPM, points total, physical feasibility, or chemistry is inferred.' };
}

export function explainForgeChange(roster, before, after) {
  const previous = buildComposite(roster, before), next = buildComposite(roster, after);
  const changed = next.blocks.filter(block => before.donors[block.key] !== after.donors[block.key]);
  return { changedBlocks: changed.length, changes: changed.map(block => {
    const old = previous.blocks.find(candidate => candidate.key === block.key);
    return { block: block.label, from: old.donor?.name || 'Unassigned', to: block.donor?.name || 'Unassigned',
      metrics: block.components.map(metric => {
        const earlier = old.components.find(candidate => candidate.key === metric.key);
        return { key: metric.key, label: metric.label, unit: metric.unit, before: earlier.value, after: metric.value,
          difference: earlier.status === 'reviewable' && metric.status === 'reviewable' ? round(metric.value - earlier.value) : null };
      }) };
  }), note: 'Only the changed donor blocks are affected. This is a difference between recorded component samples, not a simulated outcome or proof of improved player ability.' };
}
