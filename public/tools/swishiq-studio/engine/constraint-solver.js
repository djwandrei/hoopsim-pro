// Small deterministic feasibility solver shared by Studio scenario consumers.
//
// This is a constraint witness, not a universal player rating.  It searches
// bounded combinations/slot assignments, keeps missing evidence distinct from
// hard ineligibility, and never reports a partial search as proven feasible.

import {
  assertSeed,
  boundedText,
  finite,
  isObject,
  safeInteger,
  stableHash,
  unavailable,
} from './scenario-contract.js?v=20260920c&rev=swishiq-engine-v1';
import {
  ROLE_TAXONOMY_VERSION,
  compileRoleEligibilityRule,
  evaluateRoleEligibility,
  normalizePosition,
  normalizeRole,
  resolveProfileRoles,
} from './role-taxonomy.js?v=20260920c&rev=swishiq-engine-v1';

export const CONSTRAINT_SOLVER_VERSION = 'swishiq-constraint-solver-v1';
export const CONSTRAINT_SOLVER_LIMITS = Object.freeze({ maxCandidates: 1000, maxSelectionSize: 30, maxSlots: 30, maxNodes: 250000 });

const clone = value => Array.isArray(value) ? value.map(clone) : isObject(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;

function keyFor(candidate, index, identityKey = null) {
  if (!isObject(candidate)) return null;
  const raw = identityKey && candidate[identityKey] != null
    ? candidate[identityKey]
    : candidate.id ?? candidate.key ?? candidate.playerSeasonRef ?? candidate.playerRef ?? candidate.playerId;
  if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim();
  const name = candidate.player || candidate.playerName || candidate.displayName;
  if (name && candidate.seasonStartYear != null && (candidate.team || candidate.teamCode)) {
    return `${String(name).trim()}|${candidate.seasonStartYear}|${candidate.team || candidate.teamCode}`;
  }
  return `candidate-${index}`;
}

function playerIdentity(candidate, identityKey = 'playerRef') {
  const raw = candidate?.[identityKey] ?? candidate?.playerRef ?? candidate?.playerId ?? candidate?.id ?? candidate?.key;
  return raw == null ? null : String(raw).trim() || null;
}

function metricValue(candidate, key) {
  const values = [candidate?.metrics?.[key], candidate?.components?.[key], candidate?.[key]];
  for (const value of values) {
    if (finite(value)) return value;
    if (isObject(value) && finite(value.value)) return value.value;
  }
  return null;
}

function normalizeThresholdMap(value, label) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error(`${label} must be a metric-to-threshold object.`);
  const normalized = {};
  for (const [key, raw] of Object.entries(value)) {
    const config = finite(raw) ? { minimum: raw } : isObject(raw) ? raw : null;
    if (!config) throw new Error(`${label}.${key} must be a finite threshold or bounds object.`);
    const minimum = config.minimum === undefined ? null : Number(config.minimum);
    const maximum = config.maximum === undefined ? null : Number(config.maximum);
    if (minimum === null && maximum === null || minimum !== null && !finite(minimum) || maximum !== null && !finite(maximum)
      || minimum !== null && maximum !== null && minimum > maximum) throw new Error(`${label}.${key} has invalid bounds.`);
    normalized[key] = { minimum, maximum, requireObserved: config.requireObserved === true };
  }
  return normalized;
}

function normalizeCountMap(value, label, normalizer) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizer(rawKey);
    const count = Number(rawValue);
    if (!key || !Number.isSafeInteger(count) || count < 0 || count > CONSTRAINT_SOLVER_LIMITS.maxSelectionSize) {
      throw new Error(`${label} contains an invalid role/position count.`);
    }
    result[key] = count;
  }
  return result;
}

function normalizeIds(value, label) {
  if (value === undefined || value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  const ids = values.map(item => String(item ?? '').trim()).filter(Boolean);
  if (ids.length !== values.length || new Set(ids).size !== ids.length) throw new Error(`${label} must contain unique IDs.`);
  return ids.sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
}

function normalizeSlots(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > CONSTRAINT_SOLVER_LIMITS.maxSlots) throw new Error('Constraint slots must be a bounded array.');
  const normalized = value.map((slot, index) => {
    if (typeof slot === 'string') {
      const role = normalizeRole(slot);
      const position = role ? null : normalizePosition(slot);
      if (!role && !position) throw new Error(`Constraint slot ${index + 1} is not a recognized role or position.`);
      return { id: `slot-${index + 1}`, role, position };
    }
    if (!isObject(slot)) throw new Error(`Constraint slot ${index + 1} is invalid.`);
    const role = slot.role ? normalizeRole(slot.role) : null;
    const position = slot.position ? normalizePosition(slot.position) : null;
    if (!role && !position) throw new Error(`Constraint slot ${index + 1} needs a recognized role or position.`);
    return { id: boundedText(slot.id, 80) || `slot-${index + 1}`, role, position };
  });
  if (new Set(normalized.map(slot => slot.id)).size !== normalized.length) throw new Error('Constraint slot IDs must be unique.');
  return normalized;
}

/** Normalize public constraint controls before a search starts. */
export function normalizeConstraintSpec(input = {}) {
  if (!isObject(input)) throw new Error('Solver constraints must be an object.');
  const slots = normalizeSlots(input.slots || input.positionSlots || input.roleSlots);
  const requestedSize = input.size ?? input.targetSize ?? (slots.length ? slots.length : null);
  const size = requestedSize === null ? null : Number(requestedSize);
  if (size !== null && (!Number.isSafeInteger(size) || size < 1 || size > CONSTRAINT_SOLVER_LIMITS.maxSelectionSize)) throw new Error('Solver selection size is out of bounds.');
  if (slots.length && size !== slots.length) throw new Error('Solver selection size must equal the declared slot count.');
  if (size === null) throw new Error('Solver requires a selection size or slots.');
  const requiredRolesInput = input.requiredRoles;
  if (Array.isArray(requiredRolesInput) && new Set(requiredRolesInput.map(value => String(value).trim().toLowerCase())).size !== requiredRolesInput.length) {
    throw new Error('Required roles must be unique.');
  }
  const requiredRoleMap = Array.isArray(requiredRolesInput)
    ? Object.fromEntries(requiredRolesInput.map(role => [role, 1]))
    : requiredRolesInput;
  const roleMinimums = normalizeCountMap(input.minByRole ?? input.roleMinimums ?? requiredRoleMap, 'Role minimums', normalizeRole);
  const roleMaximums = normalizeCountMap(input.maxByRole ?? input.roleMaximums, 'Role maximums', normalizeRole);
  const requiredPositionsInput = input.requiredPositions;
  if (Array.isArray(requiredPositionsInput) && new Set(requiredPositionsInput.map(value => String(value).trim().toUpperCase())).size !== requiredPositionsInput.length) {
    throw new Error('Required positions must be unique.');
  }
  const requiredPositionMap = Array.isArray(requiredPositionsInput)
    ? Object.fromEntries(requiredPositionsInput.map(position => [position, 1]))
    : requiredPositionsInput;
  const positionMinimums = normalizeCountMap(input.minByPosition ?? input.positionMinimums ?? requiredPositionMap, 'Position minimums', normalizePosition);
  const positionMaximums = normalizeCountMap(input.maxByPosition ?? input.positionMaximums, 'Position maximums', normalizePosition);
  for (const [key, minimum] of Object.entries(roleMinimums)) if (roleMaximums[key] !== undefined && minimum > roleMaximums[key]) throw new Error(`Role ${key} has reversed bounds.`);
  for (const [key, minimum] of Object.entries(positionMinimums)) if (positionMaximums[key] !== undefined && minimum > positionMaximums[key]) throw new Error(`Position ${key} has reversed bounds.`);
  const teamMinimums = normalizeCountMap(input.minByTeam ?? input.teamMinimums, 'Team minimums', value => boundedText(value, 40)?.toUpperCase());
  const teamMaximums = normalizeCountMap(input.maxByTeam ?? input.teamMaximums, 'Team maximums', value => boundedText(value, 40)?.toUpperCase());
  const teamsRaw = input.teams ?? input.team;
  const teams = teamsRaw === undefined || teamsRaw === null ? [] : (Array.isArray(teamsRaw) ? teamsRaw : [teamsRaw]).map(value => boundedText(value, 40)?.toUpperCase()).filter(Boolean);
  if (teamsRaw !== undefined && teams.length !== (Array.isArray(teamsRaw) ? teamsRaw.length : 1)) throw new Error('Solver team scope contains an invalid team.');
  const identityKey = input.uniquePlayerKey === false ? false : (boundedText(input.uniquePlayerKey, 80) || 'playerRef');
  const maxNodes = input.maxNodes === undefined ? 100000 : Number(input.maxNodes);
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > CONSTRAINT_SOLVER_LIMITS.maxNodes) throw new Error('Solver node budget is out of bounds.');
  const minTotals = normalizeThresholdMap(input.minTotals ?? input.minimumTotals, 'Minimum totals');
  const maxTotals = normalizeThresholdMap(input.maxTotals ?? input.maximumTotals, 'Maximum totals');
  return Object.freeze({
    version: CONSTRAINT_SOLVER_VERSION,
    size,
    slots,
    roleMinimums,
    roleMaximums,
    positionMinimums,
    positionMaximums,
    teamMinimums,
    teamMaximums,
    teams: [...new Set(teams)],
    lockedIds: normalizeIds(input.lockedIds ?? input.requiredIds ?? input.locked, 'Locked IDs'),
    excludedIds: normalizeIds(input.excludedIds ?? input.excluded, 'Excluded IDs'),
    uniquePlayers: input.uniquePlayers !== false,
    uniquePlayerKey: identityKey,
    minTotals,
    maxTotals,
    requireObserved: input.requireObserved === true,
    eligibility: input.eligibility?.version === ROLE_TAXONOMY_VERSION ? input.eligibility : compileRoleEligibilityRule(input.eligibility || {}),
    objective: isObject(input.objective) ? clone(input.objective) : null,
    maxNodes,
  });
}

function roleCountMap(rows) {
  const counts = {};
  rows.forEach(row => row.roles.forEach(role => { counts[role] = (counts[role] || 0) + 1; }));
  return counts;
}

function positionCountMap(rows) {
  const counts = {};
  rows.forEach(row => row.positions.forEach(position => { counts[position] = (counts[position] || 0) + 1; }));
  return counts;
}

function teamCountMap(rows) {
  const counts = {};
  rows.forEach(row => { if (row.team) counts[row.team] = (counts[row.team] || 0) + 1; });
  return counts;
}

function thresholdChecks(rows, thresholds, kind) {
  const checks = [];
  for (const [key, bounds] of Object.entries(thresholds)) {
    let total = 0;
    let missing = false;
    for (const row of rows) {
      const value = metricValue(row.candidate, key);
      if (!finite(value)) missing = true;
      else total += value;
    }
    const passed = !missing && (bounds.minimum === null || total >= bounds.minimum) && (bounds.maximum === null || total <= bounds.maximum);
    checks.push({ key, kind, total: missing ? null : total, minimum: bounds.minimum, maximum: bounds.maximum, status: missing ? 'unavailable' : passed ? 'passed' : 'failed' });
  }
  return checks;
}

function candidateRows(candidates, constraints) {
  const seen = new Set();
  const rows = [];
  const invalid = [];
  const unavailableRows = [];
  for (const [index, candidate] of candidates.entries()) {
    const id = keyFor(candidate, index, null);
    if (!id || seen.has(id)) { invalid.push({ candidate, id, reason: 'duplicate-or-missing-id' }); continue; }
    seen.add(id);
    const team = String(candidate?.team || candidate?.teamCode || '').trim().toUpperCase() || null;
    if (constraints.teams.length && !constraints.teams.includes(team)) continue;
    if (constraints.excludedIds.includes(id)) continue;
    const roleCheck = evaluateRoleEligibility(candidate, constraints.eligibility);
    if (roleCheck.status === 'unavailable') {
      unavailableRows.push({ id, candidate, reasons: roleCheck.reasons || [roleCheck.reason] });
      // With no role/metric requirement, an unlabeled candidate can still be
      // selected.  Hard role requirements must fail closed instead.
      if (constraints.eligibility.requireRoleEvidence || Object.keys(constraints.roleMinimums).length || constraints.slots.some(slot => slot.role)) continue;
    }
    if (roleCheck.status === 'ineligible') continue;
    if (constraints.requireObserved && candidate?.observed !== true && candidate?.sourceStatus !== 'observed') {
      unavailableRows.push({ id, candidate, reasons: ['candidate is not observed evidence'] });
      continue;
    }
    const roles = resolveProfileRoles(candidate);
    const positions = roles.positions;
    rows.push({ id, candidate, roles: roles.roles, positions, team, identity: playerIdentity(candidate, constraints.uniquePlayerKey || 'playerRef'), score: objectiveScore(candidate, constraints.objective) });
    const requiredTotalMetrics = new Set([...Object.keys(constraints.minTotals), ...Object.keys(constraints.maxTotals)]);
    for (const metric of requiredTotalMetrics) {
      if (!finite(metricValue(candidate, metric))) {
        unavailableRows.push({ id, candidate, reasons: [`metric ${metric} is unavailable for a declared total constraint`] });
        break;
      }
    }
  }
  return { rows: rows.sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true })), invalid, unavailableRows };
}

function objectiveScore(candidate, objective) {
  if (!objective || !isObject(objective.metricWeights)) return 0;
  let score = 0;
  for (const [key, weight] of Object.entries(objective.metricWeights)) {
    const value = metricValue(candidate, key);
    const numericWeight = Number(weight);
    if (finite(value) && finite(numericWeight)) score += value * numericWeight;
  }
  return finite(score) ? score : 0;
}

function slotMatches(row, slot) {
  return (!slot.role || row.roles.includes(slot.role)) && (!slot.position || row.positions.includes(slot.position));
}

function evaluateRows(rows, constraints, { allowPartial = false } = {}) {
  const roleCounts = roleCountMap(rows), positionCounts = positionCountMap(rows), teamCounts = teamCountMap(rows);
  const checks = [];
  const fail = (kind, key, expected, actual, status = 'failed') => checks.push({ kind, key, expected, actual, status });
  for (const [key, minimum] of Object.entries(constraints.roleMinimums)) fail('role-minimum', key, minimum, roleCounts[key] || 0, (roleCounts[key] || 0) >= minimum ? 'passed' : 'failed');
  for (const [key, maximum] of Object.entries(constraints.roleMaximums)) fail('role-maximum', key, maximum, roleCounts[key] || 0, (roleCounts[key] || 0) <= maximum ? 'passed' : 'failed');
  for (const [key, minimum] of Object.entries(constraints.positionMinimums)) fail('position-minimum', key, minimum, positionCounts[key] || 0, (positionCounts[key] || 0) >= minimum ? 'passed' : 'failed');
  for (const [key, maximum] of Object.entries(constraints.positionMaximums)) fail('position-maximum', key, maximum, positionCounts[key] || 0, (positionCounts[key] || 0) <= maximum ? 'passed' : 'failed');
  for (const [key, minimum] of Object.entries(constraints.teamMinimums)) fail('team-minimum', key, minimum, teamCounts[key] || 0, (teamCounts[key] || 0) >= minimum ? 'passed' : 'failed');
  for (const [key, maximum] of Object.entries(constraints.teamMaximums)) fail('team-maximum', key, maximum, teamCounts[key] || 0, (teamCounts[key] || 0) <= maximum ? 'passed' : 'failed');
  checks.push(...thresholdChecks(rows, constraints.minTotals, 'metric-minimum'));
  checks.push(...thresholdChecks(rows, constraints.maxTotals, 'metric-maximum'));
  if (!allowPartial) checks.push({ kind: 'size', key: 'size', expected: constraints.size, actual: rows.length, status: rows.length === constraints.size ? 'passed' : 'failed' });
  const unavailableChecks = checks.filter(check => check.status === 'unavailable');
  const failedChecks = checks.filter(check => check.status === 'failed');
  const status = unavailableChecks.length ? 'unavailable' : failedChecks.length ? 'infeasible' : 'feasible';
  return { status, checks, roleCounts, positionCounts, teamCounts };
}

/** Evaluate one already-selected set without searching alternatives. */
export function evaluateSelectionConstraints(selection, rawConstraints = {}) {
  let constraints;
  try { constraints = rawConstraints?.version === CONSTRAINT_SOLVER_VERSION ? rawConstraints : normalizeConstraintSpec(rawConstraints); }
  catch (error) { return { status: 'invalid', reason: error.message, checks: [] }; }
  if (!Array.isArray(selection)) return { status: 'invalid', reason: 'A selected candidate array is required.', checks: [] };
  const selectedIds = selection.map((candidate, index) => keyFor(candidate, index, null));
  if (constraints.excludedIds.some(id => selectedIds.includes(id))) return { status: 'infeasible', reason: 'Selected candidates include an excluded ID.', checks: [] };
  if (constraints.lockedIds.some(id => !selectedIds.includes(id))) return { status: 'infeasible', reason: 'Selected candidates omit a locked ID.', checks: [] };
  const rows = candidateRows(selection, constraints).rows;
  if (rows.length !== selection.length) return { status: 'unavailable', reason: 'One or more selected candidates lack usable identity or evidence.', checks: [] };
  const duplicateIdentity = constraints.uniquePlayers && new Set(rows.map(row => row.identity).filter(Boolean)).size !== rows.length;
  if (duplicateIdentity) return { status: 'infeasible', reason: 'Selected candidates repeat a player identity.', checks: [] };
  const result = evaluateRows(rows, constraints);
  if (constraints.slots.length) {
    const unmatched = constraints.slots.filter(slot => !rows.some(row => slotMatches(row, slot)));
    if (unmatched.length) result.checks.push({ kind: 'slots', key: 'slots', expected: constraints.slots.length, actual: constraints.slots.length - unmatched.length, status: 'failed' });
  }
  return { ...result, selection: rows.map(row => clone(row.candidate)) };
}

function candidateCanHelpMinimum(rows, remaining, key, minimum, accessor) {
  const current = rows.reduce((count, row) => count + (accessor(row).includes(key) ? 1 : 0), 0);
  const possible = current + remaining.reduce((count, row) => count + (accessor(row).includes(key) ? 1 : 0), 0);
  return possible >= minimum;
}

function compareSolutions(left, right, objectiveDirection = 'max') {
  if (!right) return 1;
  if (left.score !== right.score) return objectiveDirection === 'min' ? right.score - left.score : left.score - right.score;
  const leftIds = left.rows.map(row => row.id).join('|');
  const rightIds = right.rows.map(row => row.id).join('|');
  return leftIds.localeCompare(rightIds, 'en', { numeric: true }) < 0 ? 1 : -1;
}

/**
 * Search exact combinations or role/position slots.  `status: incomplete`
 * means a bounded search budget was reached; callers must not treat it as a
 * proven feasible result.
 */
export function solveFeasibleSelection({ candidates, constraints = {}, seed = 'constraint-solver', scenario = null } = {}) {
  let normalized;
  try { normalized = constraints?.version === CONSTRAINT_SOLVER_VERSION ? constraints : normalizeConstraintSpec(constraints); }
  catch (error) { return { status: 'invalid', reason: error.message, solverVersion: CONSTRAINT_SOLVER_VERSION }; }
  if (!Array.isArray(candidates)) return { status: 'invalid', reason: 'A candidate array is required.', solverVersion: CONSTRAINT_SOLVER_VERSION };
  if (candidates.length > CONSTRAINT_SOLVER_LIMITS.maxCandidates) return unavailable('Candidate pool exceeds the bounded solver limit.', { solverVersion: CONSTRAINT_SOLVER_VERSION });
  let replaySeed;
  try { replaySeed = assertSeed(seed, 'solver seed'); }
  catch (error) { return { status: 'invalid', reason: error.message, solverVersion: CONSTRAINT_SOLVER_VERSION }; }
  const prepared = candidateRows(candidates, normalized);
  if (prepared.invalid.length) return { status: 'invalid', reason: 'Candidate identities are missing or duplicated.', invalid: prepared.invalid, solverVersion: CONSTRAINT_SOLVER_VERSION };
  const byId = new Map(prepared.rows.map(row => [row.id, row]));
  const excludedLocked = normalized.lockedIds.filter(id => normalized.excludedIds.includes(id));
  if (excludedLocked.length) return { status: 'infeasible', reason: 'A locked candidate is also excluded.', lockedIds: normalized.lockedIds, solverVersion: CONSTRAINT_SOLVER_VERSION };
  const missingLocked = normalized.lockedIds.filter(id => !byId.has(id));
  if (missingLocked.length) {
    const unavailableLocked = prepared.unavailableRows.filter(row => missingLocked.includes(row.id));
    return unavailableLocked.length
      ? unavailable('A locked candidate lacks usable eligibility evidence.', { missingLocked, solverVersion: CONSTRAINT_SOLVER_VERSION })
      : { status: 'infeasible', reason: 'A locked candidate is not in the eligible pool.', missingLocked, solverVersion: CONSTRAINT_SOLVER_VERSION };
  }
  const locked = normalized.lockedIds.map(id => byId.get(id));
  if (locked.length > normalized.size) return { status: 'infeasible', reason: 'Locked candidates exceed the requested selection size.', solverVersion: CONSTRAINT_SOLVER_VERSION };
  if (normalized.uniquePlayers && new Set(locked.map(row => row.identity).filter(Boolean)).size !== locked.length) return { status: 'infeasible', reason: 'Locked candidates repeat a player identity.', solverVersion: CONSTRAINT_SOLVER_VERSION };
  const lockedCheck = evaluateRows(locked, normalized, { allowPartial: true });
  if (lockedCheck.status === 'unavailable') return unavailable('Locked candidates lack metric evidence required by the scenario.', { solverVersion: CONSTRAINT_SOLVER_VERSION, checks: lockedCheck.checks });
  if (Object.entries(normalized.roleMaximums).some(([key, maximum]) => (lockedCheck.roleCounts[key] || 0) > maximum)
    || Object.entries(normalized.positionMaximums).some(([key, maximum]) => (lockedCheck.positionCounts[key] || 0) > maximum)
    || Object.entries(normalized.teamMaximums).some(([key, maximum]) => (lockedCheck.teamCounts[key] || 0) > maximum)) {
    return { status: 'infeasible', reason: 'Locked candidates already exceed a hard maximum.', solverVersion: CONSTRAINT_SOLVER_VERSION, checks: lockedCheck.checks };
  }
  const available = prepared.rows.filter(row => !normalized.lockedIds.includes(row.id));
  let nodes = 0;
  let best = null;
  let aborted = false;
  const objectiveDirection = normalized.objective?.direction === 'min' ? 'min' : 'max';
  const usedIdentities = new Set(locked.map(row => row.identity).filter(Boolean));

  function consider(rows, assignments = []) {
    const check = evaluateRows(rows, normalized);
    if (check.status !== 'feasible') return;
    if (normalized.slots.length && assignments.length !== normalized.slots.length) return;
    const score = rows.reduce((sum, row) => sum + row.score, 0);
    const candidate = { rows: [...rows], assignments: assignments.map(item => ({ slot: item.slot, id: item.row.id })), score, check };
    if (compareSolutions(candidate, best, objectiveDirection) > 0) best = candidate;
  }

  function searchCombination(start, rows) {
    if (aborted) return;
    nodes += 1;
    if (nodes > normalized.maxNodes) { aborted = true; return; }
    if (rows.length === normalized.size) { consider(rows); return; }
    const slotsLeft = normalized.size - rows.length;
    if (available.length - start < slotsLeft) return;
    for (let index = start; index < available.length; index += 1) {
      const row = available[index];
      if (normalized.uniquePlayers && row.identity && usedIdentities.has(row.identity)) continue;
      const next = [...rows, row];
      const remaining = available.slice(index + 1);
      let pruned = false;
      for (const [key, minimum] of Object.entries(normalized.roleMinimums)) if (!candidateCanHelpMinimum(next, remaining, key, minimum, item => item.roles)) pruned = true;
      for (const [key, minimum] of Object.entries(normalized.positionMinimums)) if (!candidateCanHelpMinimum(next, remaining, key, minimum, item => item.positions)) pruned = true;
      if (!pruned) {
        if (normalized.uniquePlayers && row.identity) usedIdentities.add(row.identity);
        searchCombination(index + 1, next);
        if (normalized.uniquePlayers && row.identity) usedIdentities.delete(row.identity);
      }
      if (aborted) return;
    }
  }

  function searchSlots(slotsToFill, rows, assignments) {
    if (aborted) return;
    nodes += 1;
    if (nodes > normalized.maxNodes) { aborted = true; return; }
    if (slotsToFill.length === 0) { consider(rows, assignments); return; }
    const [slot, ...restSlots] = slotsToFill;
    for (const row of available) {
      if (!slotMatches(row, slot)) continue;
      if (rows.some(existing => existing.id === row.id)) continue;
      if (normalized.uniquePlayers && row.identity && usedIdentities.has(row.identity)) continue;
      if (normalized.uniquePlayers && row.identity) usedIdentities.add(row.identity);
      searchSlots(restSlots, [...rows, row], [...assignments, { slot: slot.id, row }]);
      if (normalized.uniquePlayers && row.identity) usedIdentities.delete(row.identity);
      if (aborted) return;
    }
  }

  if (normalized.slots.length) {
    // Assign locked rows to distinct compatible slots first.  This backtracks
    // broad role matches so a locked guard cannot consume the only PG slot
    // when another locked row needs it.
    function assignLocked(index, usedSlots, assignments) {
      nodes += 1;
      if (nodes > normalized.maxNodes) { aborted = true; return; }
      if (index === locked.length) {
        const remainingSlots = normalized.slots.filter((slot, slotIndex) => !usedSlots.has(slotIndex));
        searchSlots(remainingSlots, locked, assignments);
        return;
      }
      const row = locked[index];
      normalized.slots.forEach((slot, slotIndex) => {
        if (aborted || usedSlots.has(slotIndex) || !slotMatches(row, slot)) return;
        usedSlots.add(slotIndex);
        assignLocked(index + 1, usedSlots, [...assignments, { slot: slot.id, row }]);
        usedSlots.delete(slotIndex);
      });
    }
    assignLocked(0, new Set(), []);
  } else {
    searchCombination(0, locked);
  }
  const audit = {
    candidates: candidates.length,
    eligibleCandidates: prepared.rows.length,
    unavailableCandidates: prepared.unavailableRows.length,
    nodes,
    maxNodes: normalized.maxNodes,
    complete: !aborted,
    constraints: normalized,
  };
  const replay = {
    deterministic: true,
    seed: replaySeed,
    solverVersion: CONSTRAINT_SOLVER_VERSION,
    scenarioHash: scenario?.scenarioHash || null,
    selectionHash: best ? stableHash(best.rows.map(row => row.id)) : null,
  };
  if (aborted) return { status: 'incomplete', reason: 'The bounded feasibility search reached its node budget.', solverVersion: CONSTRAINT_SOLVER_VERSION, audit, replay, selection: best?.rows.map(row => clone(row.candidate)) || [] };
  if (!best) {
    const hardEvidenceRequired = prepared.unavailableRows.length > 0 && (normalized.requireObserved || normalized.eligibility.requireRoleEvidence
      || Object.keys(normalized.minTotals).length || Object.keys(normalized.maxTotals).length);
    return hardEvidenceRequired
      ? unavailable('No feasible witness can be proven because required candidate evidence is unavailable.', { solverVersion: CONSTRAINT_SOLVER_VERSION, audit, replay })
      : { status: 'infeasible', reason: 'No candidate combination satisfies every hard constraint.', solverVersion: CONSTRAINT_SOLVER_VERSION, audit, replay };
  }
  return {
    status: 'feasible',
    solverVersion: CONSTRAINT_SOLVER_VERSION,
    selection: best.rows.map(row => clone(row.candidate)),
    assignments: best.assignments,
    score: best.score,
    constraintAudit: best.check,
    audit,
    replay,
    note: 'This is a deterministic feasibility witness under the declared constraints, not a universal player grade or forecast.',
  };
}

export const solveConstraints = solveFeasibleSelection;

export function checkFeasibility(input = {}) {
  const result = solveFeasibleSelection(input);
  return {
    status: result.status,
    feasible: result.status === 'feasible',
    reason: result.reason || null,
    selectionHash: result.replay?.selectionHash || null,
    audit: result.audit || null,
    constraintAudit: result.constraintAudit || null,
  };
}
