import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { projectFranchiseRotationToLiveGameTeam } from './franchise-controls-v1.mjs';

/** Preserve finite rate/percentage supplements when state lacks that statistic.
 * This cannot override membership, ratings, availability, contracts or minutes.
 * Unprovenanced supplements remain explicitly supplied scenario evidence. */
export function mergePlayerGameStatEvidence(statePlayer, suppliedPlayer = {}) {
  const merged = { ...structuredClone(suppliedPlayer), ...structuredClone(statePlayer) };
  const evidence = { ...(statePlayer.gameInputStatEvidence ?? {}) };
  for (const [field, value] of Object.entries(suppliedPlayer)) {
    if (!/(?:Per36|Percentage|Pct)$/.test(field) || !Number.isFinite(value) || statePlayer[field] !== null && statePlayer[field] !== undefined) continue;
    merged[field] = value;
    const claimed = suppliedPlayer.gameInputStatEvidence?.[field];
    evidence[field] = {
      value, sourceSystem: 'exact-name-game-input', sourceClass: 'supplied-scenario',
      stateValueStatus: statePlayer[field] === null ? 'unknown-null' : 'not-provided',
      sourceClaim: structuredClone(claimed && Object.hasOwn(claimed, 'sourceClaim') ? claimed.sourceClaim : claimed ?? suppliedPlayer.source ?? null),
      suppliedMetadataStatus: claimed?.value !== undefined && claimed.value !== value ? 'value-conflict' : 'unverified-or-scenario-claim',
      disclosure: 'Supplied statistical supplement; source claims are retained separately and not promoted to reconciled state facts.' };
  }
  if (Object.keys(evidence).length) merged.gameInputStatEvidence = evidence;
  return merged;
}

/** Apply current saved user rotations at the model input boundary. Existing
 * exact-name player evidence can supplement state fields, never roster identity.
 * Stale plans fail for review instead of being silently repaired by the CPU. */
export function applyFranchiseControlsToGameInput(state, input, { commissionerMode = false } = {}) {
  const next = structuredClone(input), applied = [];
  for (const side of ['home', 'away']) {
    const code = String(next[side]?.teamCode ?? next[`${side}TeamCode`] ?? next[`${side}Team`] ?? '').trim().toUpperCase();
    const team = state.teams.find(row => row.teamCode === code);
    const controls = team?.franchiseControlsBySeason?.[String(state.seasonStartYear)];
    if (!controls) continue;
    if (next[side]?.teamCode && next[`${side}TeamCode`] && String(next[side].teamCode).trim().toUpperCase() !== String(next[`${side}TeamCode`]).trim().toUpperCase()) throw new Error('Game input has conflicting controlled-team identities.');
    const projection = projectFranchiseRotationToLiveGameTeam({ state, teamCode: code, controls, commissionerMode });
    if (projection.status !== 'pass') throw Object.assign(new Error(`Saved rotation for ${code} requires review before this game.`), { projection });
    const oldPlayers = new Map();
    for (const player of next[side]?.players ?? []) {
      const key = normalizeCanonicalPlayerName(player.canonicalName ?? player.displayName ?? player.name);
      if (!key) continue;
      if (oldPlayers.has(key)) throw new Error('Game input has ambiguous canonical player evidence.');
      oldPlayers.set(key, player);
    }
    const players = projection.liveGameTeam.players.map(player => mergePlayerGameStatEvidence(player, oldPlayers.get(normalizeCanonicalPlayerName(player.canonicalName))));
    next[side] = { ...(next[side] ?? {}), teamCode: code, players,
      rotationControls: structuredClone(projection.liveGameTeam.rotationControls) };
    // The existing model gives explicit team ratings precedence over its roster
    // summary. Those cached ratings cannot override a newly chosen rotation.
    for (const field of ['overallRating', 'attackRating', 'offenseRating', 'defenseRating']) delete next[side][field];
    applied.push({ side, teamCode: code, controlRevision: controls.revision,
      starters: projection.storedStarters, minuteAssignments: players.map(player => ({ canonicalName: player.canonicalName, minutes: player.projectedMinutes })),
      shotUsageMultipliers: structuredClone(projection.liveGameTeam.rotationControls.shotUsageMultipliers),
      availabilityDisclosures: projection.availabilityDisclosures,
      starterBehavior: 'Saved starters open the live possession game; aggregate score/box engines use rotation minute weights.',
      minuteBehavior: 'Targets enter roster ratings and planned live stints; eligible stoppages, conditional substitutions and overtime can change actual minutes.',
      shotUsageBehavior: 'Shot-usage multipliers reweight field-goal attempt recipients only; team possession budget and assist/turnover actor weights are unchanged. This is a scenario assumption, not a measured efficiency effect.' });
  }
  if (applied.length) {
    for (const field of ['overallRatingDiff', 'offenseDefenseMatchupDiff', 'defenseRatingDiff', 'playerProductionDiff', 'playerProductionTotal']) {
      if (next.features) delete next.features[field];
    }
    next.franchiseControlReceipt = { format: 'djhc-franchise-game-input-v1', seasonStartYear: state.seasonStartYear,
      stateRevision: state.revision, teams: applied, disclosure: 'User rotation scenario; other supplied team-history inputs remain separate model covariates.' };
  }
  return next;
}
