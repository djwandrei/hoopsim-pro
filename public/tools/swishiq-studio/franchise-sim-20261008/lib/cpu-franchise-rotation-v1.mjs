import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { evaluateFranchiseAutomationPermission } from './franchise-automation-v1.mjs';
import { createFranchiseRotationState, updateFranchiseRotationState, validateFranchiseRotationState,
  getFranchiseRotationRoster } from './franchise-controls-v1.mjs';

const FORMAT = 'djhc-cpu-rotation-proposal-v1';
const clone = structuredClone;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const payload = proposal => JSON.stringify({ format: FORMAT, teamCode: proposal.teamCode,
  seasonStartYear: proposal.seasonStartYear, stateRevision: proposal.stateRevision,
  maxRotationPlayers: proposal.maxRotationPlayers, controls: proposal.controls });

function allocate(rows) {
  const assignments = new Map(rows.map(row => [row.canonicalName, 0]));
  let open = [...rows], remaining = 240;
  while (open.length && remaining > 1e-8) {
    const totalWeight = open.reduce((sum, row) => sum + row.weight, 0);
    const capped = open.filter(row => remaining * row.weight / totalWeight > row.limit);
    if (!capped.length) { for (const row of open) assignments.set(row.canonicalName, remaining * row.weight / totalWeight); remaining = 0; break; }
    for (const row of capped) { assignments.set(row.canonicalName, row.limit); remaining -= row.limit; }
    open = open.filter(row => !capped.includes(row));
  }
  return remaining > 1e-7 ? null : assignments;
}

/** A transparent initial planning heuristic. This is not a newly fitted player
 * minutes or lineup-value model, and does not infer injuries from absent boxes. */
export function prepareCpuFranchiseRotation({ state, teamCode, actor = 'cpu', commissionerMode = false,
  maxRotationPlayers = 10 } = {}) {
  const code = String(teamCode ?? '').trim().toUpperCase();
  const permission = evaluateFranchiseAutomationPermission({ state, teamCode: code, domain: 'lineup', action: 'advise', actor, commissionerMode });
  const roster = getFranchiseRotationRoster({ state, teamCode: code });
  const violations = [...roster.violations, ...roster.missingInputs];
  if (!permission.allowed) violations.push(permission.reason);
  if (!Number.isInteger(maxRotationPlayers) || maxRotationPlayers < 5 || maxRotationPlayers > 15) violations.push('maxRotationPlayers must be an integer from 5 through 15.');
  const planRows = roster.players.filter(player => player.rotationAvailability.status !== 'unavailable').map(player => {
    const historyMinutes = player.projectedMinutes ?? player.priorMinutesPerGame;
    const rating = finite(player.overallRating) ? Math.max(0, Math.min(99, player.overallRating)) : 75;
    return { canonicalName: player.canonicalName, playerRef: player.playerRef ?? player.canonicalName,
      weight: finite(historyMinutes) && historyMinutes > 0 ? historyMinutes : Math.max(8, Math.min(40, 8 + (rating - 50) * 0.6)),
      source: finite(historyMinutes) && historyMinutes > 0 ? 'supplied-projected-or-prior-minutes' : finite(player.overallRating) ? 'generated-rating-planning-weight' : 'generated-neutral-planning-weight',
      rating, limit: player.rotationAvailability.minutesLimit ?? 48 };
  }).sort((a, b) => b.weight - a.weight || b.rating - a.rating || a.canonicalName.localeCompare(b.canonicalName));
  if (planRows.length < 5) violations.push('At least five available planning players are required.');
  let selected = planRows.slice(0, maxRotationPlayers);
  while (selected.length < planRows.length && selected.reduce((sum, row) => sum + row.limit, 0) < 240 - 1e-7) selected.push(planRows[selected.length]);
  if (selected.reduce((sum, row) => sum + row.limit, 0) < 240 - 1e-7) violations.push('Available minutes limits cannot cover 240 team minutes.');
  const minutes = violations.length ? null : allocate(selected);
  if (!minutes && !violations.length) violations.push('Rotation minute allocation could not cover the game.');
  const allNames = roster.players.map(player => player.canonicalName);
  const active = minutes ? selected.filter(row => minutes.get(row.canonicalName) > 0) : [];
  // Every full-game player must start, or there is no feasible opening five.
  const fullGame = active.filter(row => minutes.get(row.canonicalName) >= 48 - 1e-7);
  const starters = [...fullGame, ...active.filter(row => !fullGame.includes(row))].slice(0, 5).map(row => row.canonicalName);
  const controls = minutes ? { seasonStartYear: state.seasonStartYear, gameDurationMinutes: 48,
    starters, activeRotation: active.map(row => row.canonicalName),
    inactiveRotation: allNames.filter(name => !active.some(row => normalizeCanonicalPlayerName(row.canonicalName) === normalizeCanonicalPlayerName(name))),
    minuteAssignments: allNames.map(canonicalName => ({ canonicalName, minutes: minutes.get(canonicalName) ?? 0 })),
    rotationControls: { benchOrder: active.filter(row => !starters.includes(row.canonicalName)).map(row => row.canonicalName) } } : null;
  if (controls) {
    const validation = validateFranchiseRotationState({ state, teamCode: code, controls });
    violations.push(...validation.violations, ...validation.missingInputs);
  }
  const result = { format: FORMAT, status: violations.length ? 'requires-review' : 'prepared', teamCode: code,
    seasonStartYear: state?.seasonStartYear, stateRevision: state?.revision, maxRotationPlayers, controls: violations.length ? null : controls,
    permission, violations, availabilityDisclosures: roster.availabilityDisclosures,
    allocationEvidence: active.map(row => ({ canonicalName: row.canonicalName, source: row.source, weight: row.weight, minutesLimit: row.limit })),
    disclosure: 'Initial rotation planning uses supplied minute estimates first, then explicitly generated rating-based weights. Role fit and lineup performance are not empirically selected here.' };
  if (result.status === 'prepared') result.exactProposalPayload = payload(result);
  return result;
}

/** Apply an unchanged, current proposal only under an allowed actor/mode.
 * Advice is a preview; financial/draft authority is never part of this action. */
export function applyCpuFranchiseRotation({ state, proposal, actor = 'cpu', commissionerMode = false } = {}) {
  const permission = evaluateFranchiseAutomationPermission({ state, teamCode: proposal?.teamCode, domain: 'lineup', action: 'execute', actor, commissionerMode });
  const violations = [];
  if (!permission.allowed) violations.push(permission.reason);
  if (proposal?.format !== FORMAT || proposal.status !== 'prepared' || !proposal.controls) violations.push('A prepared rotation proposal is required.');
  if (proposal?.stateRevision !== state?.revision || proposal?.seasonStartYear !== state?.seasonStartYear) violations.push('Rotation proposal is stale.');
  if (proposal?.exactProposalPayload !== payload(proposal ?? {})) violations.push('Rotation proposal terms changed after preparation.');
  if (violations.length) return { status: 'rejected', state: clone(state), permission, violations };
  const team = state.teams.find(row => row.teamCode === proposal.teamCode);
  const operation = team?.franchiseControlsBySeason?.[String(state.seasonStartYear)] ? updateFranchiseRotationState : createFranchiseRotationState;
  const result = operation({ state, teamCode: proposal.teamCode, controls: proposal.controls,
    expectedStateRevision: state.revision, actor, commissionerMode });
  return { ...result, permission, planningEvidence: clone(proposal.allocationEvidence),
    disclosure: proposal.disclosure };
}
