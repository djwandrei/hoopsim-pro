import { evaluateFranchiseAutomationPermission } from './franchise-automation-v1.mjs';

const clone = value => structuredClone(value);
const FORMAT = 'djhc-franchise-coaching-plan-v1';
const VIEW_FORMAT = 'djhc-franchise-coaching-plan-view-v1';
const RECEIPT_FORMAT = 'djhc-franchise-coaching-receipt-v1';
const SOURCE_SYSTEM = 'djhc-franchise-coaching';
const SOURCE_VERSION = 'djhc-franchise-coaching-v1';
const CONTROL_FIELDS = Object.freeze([
  'paceMultiplier',
  'threePointAttemptMultiplier',
  'offensiveReboundMultiplier',
]);
const DEFAULT_CONTROLS = Object.freeze({
  paceMultiplier: 1,
  threePointAttemptMultiplier: 1,
  offensiveReboundMultiplier: 1,
});
const RANGES = Object.freeze({
  paceMultiplier: [0.85, 1.15],
  threePointAttemptMultiplier: [0.5, 1.5],
  offensiveReboundMultiplier: [0.75, 1.25],
});
const DISCLOSURE = 'These are explicit scenario multipliers. They are not learned coaching effects or causal estimates.';

function asTeamCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function teamMatches(state, teamCode) {
  return (Array.isArray(state?.teams) ? state.teams : [])
    .filter(team => asTeamCode(team?.teamCode) === teamCode);
}

function validObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeControls(plan) {
  const violations = [];
  const controls = { ...DEFAULT_CONTROLS };
  if (!validObject(plan)) {
    violations.push('A coaching plan must be a plain object with only the three supported multipliers.');
    return { status: 'requires-review', controls, violations };
  }

  const allowed = new Set(CONTROL_FIELDS);
  for (const key of Reflect.ownKeys(plan)) {
    if (typeof key !== 'string' || !allowed.has(key)) violations.push(`Unsupported coaching control: ${String(key)}.`);
  }
  for (const field of CONTROL_FIELDS) {
    if (!Object.hasOwn(plan, field)) continue;
    const value = plan[field];
    const [minimum, maximum] = RANGES[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      violations.push(`${field} must be a finite number.`);
    } else if (value < minimum || value > maximum) {
      violations.push(`${field} must be from ${minimum} through ${maximum}.`);
    } else {
      controls[field] = value;
    }
  }
  return { status: violations.length ? 'requires-review' : 'pass', controls, violations: [...new Set(violations)] };
}

/** Normalize the three explicit coaching scenario controls. Omitted controls use neutral multipliers. */
export function normalizeGameCoachingPlan({ plan } = {}) {
  const result = normalizeControls(plan === undefined ? {} : plan);
  return {
    format: 'djhc-game-coaching-controls-v1',
    version: 1,
    ...result,
  };
}

function sourceFor(actor) {
  return {
    sourceSystem: SOURCE_SYSTEM,
    sourceVersion: SOURCE_VERSION,
    sourceClass: actor === 'cpu' ? 'generated-scenario' : 'user-scenario',
  };
}

function defaultSource() {
  return {
    sourceSystem: SOURCE_SYSTEM,
    sourceVersion: SOURCE_VERSION,
    sourceClass: 'neutral-default',
  };
}

function exactPayload(teamCode, seasonStartYear, controls) {
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    teamCode,
    seasonStartYear,
    controls: Object.fromEntries(CONTROL_FIELDS.map(field => [field, controls[field]])),
  });
}

function validateSavedRecord(record, { teamCode, seasonStartYear, stateRevision }) {
  const violations = [];
  if (!validObject(record)) {
    return { status: 'requires-review', controls: null, violations: ['Current-season coaching record must be a plain object.'] };
  }
  if (record.format !== FORMAT) violations.push('Unsupported coaching plan format.');
  if (record.version !== 1) violations.push('Unsupported coaching plan version.');
  if (asTeamCode(record.teamCode) !== teamCode) violations.push('Coaching plan team identity conflicts with its team entry.');
  if (record.seasonStartYear !== seasonStartYear) violations.push('Coaching plan season conflicts with the current LeagueState season.');
  if (!Number.isInteger(record.revision) || record.revision < 1) violations.push('Coaching plan revision must be a positive integer.');

  const normalized = normalizeControls(record.controls);
  violations.push(...normalized.violations);

  const receipt = record.actionReceipt;
  if (!validObject(receipt) || receipt.format !== RECEIPT_FORMAT) {
    violations.push('Coaching plan action receipt is missing or unsupported.');
  } else {
    const expectedSource = sourceFor(receipt.actor);
    if (!['user', 'commissioner', 'cpu'].includes(receipt.actor) || record.actor !== receipt.actor) {
      violations.push('Coaching plan receipt actor is invalid or conflicts with its record.');
    }
    if (receipt.action !== 'create' && receipt.action !== 'update') violations.push('Coaching plan receipt action is unsupported.');
    if (asTeamCode(receipt.teamCode) !== teamCode || receipt.seasonStartYear !== seasonStartYear || receipt.controlRevision !== record.revision) {
      violations.push('Coaching plan receipt team, season or control revision conflicts.');
    }
    if (!Number.isInteger(receipt.priorControlRevision) || receipt.priorControlRevision < 0 ||
        receipt.priorControlRevision + 1 !== record.revision) {
      violations.push('Coaching plan prior control revision is invalid.');
    }
    if ((receipt.action === 'create' && receipt.priorControlRevision !== 0) ||
        (receipt.action === 'update' && receipt.priorControlRevision < 1)) {
      violations.push('Coaching plan receipt action and revision sequence conflict.');
    }
    if (!Number.isInteger(receipt.stateRevision) || receipt.stateRevision < 0 ||
        receipt.expectedStateRevision !== receipt.stateRevision ||
        receipt.resultingStateRevision !== receipt.stateRevision + 1 ||
        receipt.resultingStateRevision > stateRevision) {
      violations.push('Coaching plan receipt has an invalid or future LeagueState revision.');
    }
    if (!validObject(receipt.source) || receipt.source.sourceSystem !== expectedSource.sourceSystem ||
        receipt.source.sourceVersion !== expectedSource.sourceVersion || receipt.source.sourceClass !== expectedSource.sourceClass) {
      violations.push('Coaching plan receipt source evidence is invalid.');
    }
    if (!validObject(record.source) || record.source.sourceSystem !== expectedSource.sourceSystem ||
        record.source.sourceVersion !== expectedSource.sourceVersion || record.source.sourceClass !== expectedSource.sourceClass) {
      violations.push('Coaching plan record source evidence is invalid.');
    }
    if (normalized.status === 'pass' && receipt.exactPayload !== exactPayload(teamCode, seasonStartYear, normalized.controls)) {
      violations.push('Coaching plan terms changed after the recorded action.');
    }
  }

  return {
    status: violations.length ? 'requires-review' : 'saved',
    controls: violations.length ? null : normalized.controls,
    violations: [...new Set(violations)],
  };
}

/** Read a validated current-season plan or disclose neutral defaults. */
export function getFranchiseCoachingPlan(state, teamCodeInput) {
  const teamCode = asTeamCode(teamCodeInput);
  const seasonStartYear = Number.isInteger(state?.seasonStartYear) ? state.seasonStartYear : null;
  const stateRevision = Number.isInteger(state?.revision) ? state.revision : null;
  const matches = teamMatches(state, teamCode);
  const base = {
    format: VIEW_FORMAT,
    teamCode: teamCode || null,
    seasonStartYear,
    stateRevision,
    controls: null,
    record: null,
    violations: [],
    source: null,
    disclosure: DISCLOSURE,
  };
  if (!teamCode) return { ...base, status: 'requires-review', violations: ['A teamCode is required.'] };
  if (matches.length !== 1) return { ...base, status: 'requires-review', violations: [
    matches.length ? 'Team identity is ambiguous in LeagueState.' : `Team ${teamCode} is absent from LeagueState.`,
  ] };
  if (!Number.isInteger(seasonStartYear) || !Number.isInteger(stateRevision) || stateRevision < 0) {
    return { ...base, status: 'requires-review', violations: ['Current LeagueState season and revision are required.'] };
  }

  const team = matches[0];
  const bySeason = team.coachingPlansBySeason;
  if (bySeason !== undefined && !validObject(bySeason)) {
    return { ...base, status: 'requires-review', violations: ['coachingPlansBySeason must be a plain season-keyed object.'] };
  }
  const seasonKey = String(seasonStartYear);
  if (bySeason && Object.hasOwn(bySeason, seasonKey)) {
    const record = bySeason[seasonKey];
    const validation = validateSavedRecord(record, { teamCode, seasonStartYear, stateRevision });
    return {
      ...base,
      status: validation.status,
      controls: validation.controls,
      record: clone(record),
      violations: validation.violations,
      source: validObject(record?.source) ? clone(record.source) : null,
      disclosure: validation.status === 'saved' ? DISCLOSURE : `${DISCLOSURE} The current saved plan requires review and is not applied.`,
    };
  }

  const otherSeasonKeys = bySeason ? Object.keys(bySeason).filter(key => key !== seasonKey) : [];
  return {
    ...base,
    status: 'defaulted',
    controls: { ...DEFAULT_CONTROLS },
    source: defaultSource(),
    disclosure: otherSeasonKeys.length
      ? `${DISCLOSURE} No current-season plan exists; plans from other seasons are ignored.`
      : `${DISCLOSURE} No current-season plan exists; neutral multipliers are used.`,
  };
}

function rejected(state, teamCode, seasonStartYear, violations, permission) {
  return {
    format: 'djhc-franchise-coaching-action-result-v1',
    status: 'rejected',
    action: 'configure',
    teamCode: teamCode || null,
    seasonStartYear,
    state: clone(state),
    controls: null,
    record: null,
    receipt: null,
    permission,
    violations: [...new Set(violations)],
    disclosure: DISCLOSURE,
  };
}

/** Save one explicit current-season coaching plan with optimistic revision and actor checks. */
export function configureFranchiseCoachingPlan({ state, teamCode: teamCodeInput, plan,
  expectedStateRevision, actor = 'user', commissionerMode = false } = {}) {
  const teamCode = asTeamCode(teamCodeInput);
  const seasonStartYear = Number.isInteger(state?.seasonStartYear) ? state.seasonStartYear : null;
  const violations = [];
  const permission = evaluateFranchiseAutomationPermission({ state, teamCode, domain: 'coaching', action: 'execute', actor, commissionerMode });
  const matches = teamMatches(state, teamCode);
  if (!state || typeof state !== 'object' || Array.isArray(state)) violations.push('LeagueState is required.');
  if (!Number.isInteger(seasonStartYear)) violations.push('LeagueState current seasonStartYear is required.');
  if (!Number.isInteger(state?.revision) || state.revision < 0) violations.push('LeagueState revision is required.');
  if (!teamCode) violations.push('A teamCode is required.');
  if (teamCode && matches.length !== 1) violations.push(matches.length > 1
    ? `Team ${teamCode} is ambiguous.` : `Team ${teamCode} is absent from LeagueState.`);
  if (!Number.isInteger(expectedStateRevision) || expectedStateRevision !== state?.revision) {
    violations.push('Coaching plan was prepared against a different or missing LeagueState revision.');
  }
  if (!permission.allowed) violations.push(permission.reason);

  const normalized = normalizeControls(plan);
  violations.push(...normalized.violations);

  const currentView = teamCode && matches.length === 1 ? getFranchiseCoachingPlan(state, teamCode) : null;
  if (currentView?.status === 'requires-review') {
    violations.push('Current-season coaching plan requires review before it can be replaced.', ...currentView.violations);
  }
  if (violations.length) return rejected(state, teamCode, seasonStartYear, violations, permission);

  const team = matches[0];
  const existing = currentView.status === 'saved' ? currentView.record : null;
  const action = existing ? 'update' : 'create';
  const priorControlRevision = existing?.revision ?? 0;
  const controlRevision = priorControlRevision + 1;
  const controls = { ...normalized.controls };
  const source = sourceFor(actor);
  const next = clone(state);
  const nextTeam = teamMatches(next, teamCode)[0];
  nextTeam.coachingPlansBySeason ??= {};
  const receipt = {
    format: RECEIPT_FORMAT,
    action,
    actor,
    teamCode,
    seasonStartYear,
    stateRevision: state.revision,
    expectedStateRevision,
    resultingStateRevision: state.revision + 1,
    priorControlRevision,
    controlRevision,
    exactPayload: exactPayload(teamCode, seasonStartYear, controls),
    source: clone(source),
  };
  const record = {
    format: FORMAT,
    version: 1,
    teamCode,
    seasonStartYear,
    revision: controlRevision,
    actor,
    controls,
    source: clone(source),
    actionReceipt: clone(receipt),
  };
  nextTeam.coachingPlansBySeason[String(seasonStartYear)] = clone(record);
  next.revision = state.revision + 1;
  return {
    format: 'djhc-franchise-coaching-action-result-v1',
    status: action === 'create' ? 'configured' : 'updated',
    action,
    teamCode,
    seasonStartYear,
    state: next,
    controls: clone(controls),
    record: clone(record),
    receipt: clone(receipt),
    permission,
    violations: [],
    disclosure: DISCLOSURE,
  };
}
