const FORMAT = 'djhc-franchise-automation-v1';
const SOURCE = Object.freeze({
  sourceSystem: 'djhc-franchise-automation',
  sourceVersion: 'djhc-franchise-automation-v1',
  sourceClass: 'user-scenario',
});

const USER_DOMAINS = Object.freeze(['lineup', 'coaching', 'training', 'scouting', 'transactions', 'draft']);
const CPU_CONFIGURABLE_DOMAINS = Object.freeze(['lineup', 'coaching', 'training', 'scouting']);
const USER_MODE_DOMAINS = Object.freeze(['transactions', 'draft']);
const NONFINANCIAL_MODES = Object.freeze(['manual', 'advice', 'cpu']);
const USER_APPROVAL_MODES = Object.freeze(['manual', 'advice']);
const FINANCIAL_DOMAINS = new Set(USER_MODE_DOMAINS);

const clone = value => structuredClone(value);

function asTeamCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function userTeamCodes(state) {
  return new Set((Array.isArray(state?.userControlledTeamCodes) ? state.userControlledTeamCodes : []).map(asTeamCode).filter(Boolean));
}

function teamRows(state, teamCode) {
  return (Array.isArray(state?.teams) ? state.teams : []).filter(team => asTeamCode(team?.teamCode) === teamCode);
}

function baseSettings(isUserTeam) {
  const mode = isUserTeam ? 'manual' : 'cpu';
  return Object.fromEntries(USER_DOMAINS.map(domain => [domain, mode]));
}

function recordAt(team, seasonStartYear) {
  const bySeason = team?.franchiseAutomationBySeason;
  return bySeason && typeof bySeason === 'object' && !Array.isArray(bySeason)
    ? bySeason[String(seasonStartYear)] ?? null
    : null;
}

function validateRecord(record, { teamCode, seasonStartYear, isUserTeam, stateRevision }) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['Automation record must be an object.'];
  if (record.format !== FORMAT) errors.push('Unsupported automation record format.');
  if (record.version !== 1) errors.push('Unsupported automation record version.');
  if (asTeamCode(record.teamCode) !== teamCode) errors.push('Automation record teamCode does not match its team.');
  if (record.seasonStartYear !== seasonStartYear) errors.push('Automation record season does not match the current LeagueState season.');
  if (!Number.isInteger(record.revision) || record.revision < 1) errors.push('Automation record revision is invalid.');
  if (!Number.isInteger(record.stateRevision) || record.stateRevision < 0) errors.push('Automation record stateRevision is invalid.');
  if (record.resultingStateRevision !== record.stateRevision + 1) errors.push('Automation record resultingStateRevision is invalid.');
  if (!Number.isInteger(stateRevision) || record.resultingStateRevision > stateRevision) errors.push('Automation record has a future or unresolved LeagueState revision.');
  if (record.expectedStateRevision !== record.stateRevision) errors.push('Automation record expectedStateRevision does not match its action.');
  if (!['user', 'commissioner'].includes(record.actor) || (!isUserTeam && record.actor !== 'commissioner')) errors.push('Automation record actor is invalid for this team.');
  if (!record.source || Object.entries(SOURCE).some(([field, value]) => record.source[field] !== value)) errors.push('Automation record source system, version and user-scenario evidence must match.');
  if (!record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings)) {
    errors.push('Automation record settings must be an object.');
    return errors;
  }
  if (record.exactSettingsPayload !== JSON.stringify(record.settings)) errors.push('Automation settings changed after the recorded action.');
  for (const [domain, mode] of Object.entries(record.settings)) {
    if (!USER_DOMAINS.includes(domain)) {
      errors.push(`Unsupported automation domain: ${domain}.`);
      continue;
    }
    if (FINANCIAL_DOMAINS.has(domain)) {
      const validMode = isUserTeam ? USER_APPROVAL_MODES.includes(mode) : mode === 'cpu';
      if (!validMode) errors.push(`${domain} may use manual or advice only on a user-controlled team; CPU teams retain their operational cpu default.`);
    } else if (!NONFINANCIAL_MODES.includes(mode)) {
      errors.push(`Unsupported ${domain} mode: ${mode}.`);
    }
  }
  return errors;
}

function hasStaleRecord(team, seasonStartYear) {
  const bySeason = team?.franchiseAutomationBySeason;
  if (!bySeason || typeof bySeason !== 'object' || Array.isArray(bySeason)) return false;
  return Object.entries(bySeason).some(([key, record]) => {
    const recordedYear = Number(record?.seasonStartYear ?? key);
    return Number.isInteger(recordedYear) && recordedYear !== seasonStartYear;
  });
}

function automationView(state, teamCodeInput) {
  const teamCode = asTeamCode(teamCodeInput);
  const seasonStartYear = Number.isInteger(state?.seasonStartYear) ? state.seasonStartYear : null;
  const stateRevision = Number.isInteger(state?.revision) ? state.revision : null;
  const matches = teamRows(state, teamCode);
  const team = matches.length === 1 ? matches[0] : null;
  const isUserTeam = Boolean(teamCode && userTeamCodes(state).has(teamCode));
  const settings = baseSettings(isUserTeam);
  const currentRecord = team && seasonStartYear !== null ? recordAt(team, seasonStartYear) : null;
  const recordErrors = currentRecord
    ? validateRecord(currentRecord, { teamCode, seasonStartYear, isUserTeam, stateRevision })
    : [];
  let status = 'defaulted';
  let staleReason = null;
  let automationRevision = 0;
  let configuredStateRevision = null;
  let source = { sourceSystem: 'djhc-franchise-automation', sourceVersion: 'djhc-franchise-automation-v1', sourceClass: 'default' };

  if (!teamCode || !team) {
    status = matches.length > 1 ? 'ambiguous-team' : 'team-unresolved';
  } else if (currentRecord && !recordErrors.length) {
    Object.assign(settings, clone(currentRecord.settings));
    status = 'saved';
    automationRevision = currentRecord.revision;
    configuredStateRevision = currentRecord.stateRevision;
    source = clone(currentRecord.source);
  } else if (currentRecord) {
    status = isUserTeam ? 'invalid-record-fallback-manual' : 'invalid-record-fallback-cpu-operational-default';
    staleReason = recordErrors.join(' ');
  } else if (seasonStartYear !== null && hasStaleRecord(team, seasonStartYear)) {
    status = isUserTeam ? 'stale-record-fallback-manual' : 'stale-record-fallback-cpu-operational-default';
    staleReason = isUserTeam
      ? 'Only automation settings from another season are present; manual season-specific defaults apply.'
      : 'Only automation settings from another season are present; CPU-team operational defaults apply.';
  }

  const operatingDefaults = {
    transactionApprovalExplicitUser: isUserTeam,
    draftAuto: !isUserTeam,
  };
  return {
    format: FORMAT,
    version: 1,
    status,
    teamCode: teamCode || null,
    seasonStartYear,
    stateRevision,
    automationRevision,
    configuredStateRevision,
    settings,
    ...operatingDefaults,
    source,
    ...(staleReason ? { fallbackReason: staleReason } : {}),
  };
}

function rejection(state, action, status, violations, metadata = {}) {
  return {
    format: 'djhc-franchise-automation-action-result-v1',
    status,
    action,
    state: clone(state),
    record: null,
    violations: [...new Set(violations)],
    ...metadata,
  };
}

/** Read current team/season settings. Stale or invalid records fail back to safe defaults. */
export function getFranchiseAutomation(state, teamCodeInput) {
  return automationView(state, teamCodeInput);
}

/** Save a partial, versioned settings patch for exactly one team in the current season. */
export function configureFranchiseAutomation({ state, teamCode: teamCodeInput, settings: patch,
  expectedStateRevision, commissionerMode = false } = {}) {
  const action = 'configure';
  const teamCode = asTeamCode(teamCodeInput);
  const violations = [];
  const seasonStartYear = Number.isInteger(state?.seasonStartYear) ? state.seasonStartYear : null;
  const currentRevision = Number.isInteger(state?.revision) ? state.revision : null;
  const matches = teamRows(state, teamCode);
  const isUserTeam = userTeamCodes(state).has(teamCode);

  if (!state || typeof state !== 'object' || Array.isArray(state)) violations.push('LeagueState is required.');
  if (!Number.isInteger(seasonStartYear)) violations.push('LeagueState current seasonStartYear is required.');
  if (!Number.isInteger(currentRevision) || currentRevision < 0) violations.push('A nonnegative LeagueState revision is required.');
  if (!teamCode) violations.push('A teamCode is required.');
  if (teamCode && matches.length !== 1) violations.push(matches.length ? `Team ${teamCode} is ambiguous.` : `Team ${teamCode} is absent from LeagueState.`);
  if (!isUserTeam && commissionerMode !== true) violations.push(`Team ${teamCode} is not user-controlled; commissionerMode:true is required.`);
  if (!Number.isInteger(expectedStateRevision) || expectedStateRevision !== currentRevision) {
    violations.push('Franchise automation was prepared against a different or missing LeagueState revision.');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    violations.push('settings must be a partial object keyed by supported automation domain.');
  } else {
    for (const [domain, mode] of Object.entries(patch)) {
      if (!USER_DOMAINS.includes(domain)) {
        violations.push(`Unsupported automation setting: ${domain}.`);
        continue;
      }
      if (FINANCIAL_DOMAINS.has(domain)) {
        if (!isUserTeam) violations.push(`${domain} user settings are available only on user-controlled teams.`);
        if (!USER_APPROVAL_MODES.includes(mode)) {
          violations.push(`${domain} supports manual or advice only; user approval is always required to execute.`);
        }
      } else if (!NONFINANCIAL_MODES.includes(mode)) {
        violations.push(`Unsupported ${domain} mode: ${mode}.`);
      }
    }
  }

  const metadata = { teamCode: teamCode || null, seasonStartYear, stateRevision: currentRevision };
  if (violations.length) return rejection(state, action, 'rejected', violations, metadata);

  const team = matches[0];
  const existing = recordAt(team, seasonStartYear);
  const existingErrors = existing ? validateRecord(existing, { teamCode, seasonStartYear, isUserTeam, stateRevision: currentRevision }) : [];
  if (existing && existingErrors.length) {
    return rejection(state, action, 'rejected', ['Current-season saved automation record is invalid and must be resolved before it can be updated.', ...existingErrors], metadata);
  }

  const effective = existing ? clone(existing.settings) : baseSettings(isUserTeam);
  Object.assign(effective, clone(patch));
  const next = clone(state);
  const nextTeam = teamRows(next, teamCode)[0];
  nextTeam.franchiseAutomationBySeason ??= {};
  const nextRecord = {
    format: FORMAT,
    version: 1,
    teamCode,
    seasonStartYear,
    revision: (existing?.revision ?? 0) + 1,
    stateRevision: currentRevision,
    resultingStateRevision: currentRevision + 1,
    expectedStateRevision,
    actor: isUserTeam ? 'user' : 'commissioner',
    settings: effective,
    exactSettingsPayload: JSON.stringify(effective),
    transactionApprovalExplicitUser: isUserTeam,
    draftAuto: !isUserTeam,
    source: clone(SOURCE),
  };
  nextTeam.franchiseAutomationBySeason[String(seasonStartYear)] = nextRecord;
  next.revision = currentRevision + 1;
  return {
    format: 'djhc-franchise-automation-action-result-v1',
    status: existing ? 'updated' : 'configured',
    action,
    state: next,
    record: clone(nextRecord),
    violations: [],
    teamCode,
    seasonStartYear,
    stateRevision: currentRevision,
    resultingStateRevision: next.revision,
  };
}

/** Evaluate one advise/execute request without changing settings or LeagueState. */
export function evaluateFranchiseAutomationPermission({ state, teamCode: teamCodeInput, domain,
  action, actor, commissionerMode = false } = {}) {
  const view = automationView(state, teamCodeInput);
  const teamCode = asTeamCode(teamCodeInput);
  const teamMatchCount = teamRows(state, teamCode).length;
  const isUserTeam = userTeamCodes(state).has(teamCode);
  const metadata = {
    teamCode: teamCode || null,
    seasonStartYear: view.seasonStartYear,
    stateRevision: view.stateRevision,
    automationRevision: view.automationRevision,
    configuredStateRevision: view.configuredStateRevision,
  };
  const finish = (allowed, status, requiresUserApproval, reason) => ({
    format: 'djhc-franchise-automation-permission-v1',
    allowed,
    status,
    requiresUserApproval,
    reason,
    domain: domain ?? null,
    action: action ?? null,
    actor: actor ?? null,
    mode: USER_DOMAINS.includes(domain) ? view.settings[domain] : null,
    transactionApprovalExplicitUser: view.transactionApprovalExplicitUser,
    draftAuto: view.draftAuto,
    settingsStatus: view.status,
    ...metadata,
  });

  if (!teamCode || teamMatchCount !== 1) return finish(false, 'team-unresolved', false,
    teamMatchCount > 1 ? 'Team identity is ambiguous.' : 'Team does not resolve in LeagueState.');
  if (!Number.isInteger(view.seasonStartYear) || !Number.isInteger(view.stateRevision) || view.stateRevision < 0) {
    return finish(false, 'invalid-state', false, 'Automation needs a resolved current season and state revision.');
  }
  if (!USER_DOMAINS.includes(domain)) return finish(false, 'invalid-domain', false, `Unsupported automation domain: ${domain}.`);
  if (!['advise', 'execute'].includes(action)) return finish(false, 'invalid-action', false, `Unsupported automation action: ${action}.`);
  if (!['cpu', 'user', 'commissioner'].includes(actor)) return finish(false, 'invalid-actor', false, `Unsupported automation actor: ${actor}.`);

  if (actor === 'user' && !isUserTeam) return finish(false, 'actor-not-authorized', false,
    'A user actor may act only for a user-controlled team.');
  if (actor === 'commissioner' && commissionerMode !== true) return finish(false, 'actor-not-authorized', false,
    'A commissioner actor requires commissionerMode:true.');
  if (!isUserTeam && actor === 'commissioner' && commissionerMode !== true) return finish(false, 'actor-not-authorized', false,
    'Commissioner actions require commissionerMode:true.');

  const mode = view.settings[domain];
  if (action === 'advise') {
    if (actor !== 'cpu') return finish(true, 'allowed', false, 'Human advice/review is allowed for this team.');
    const allowed = mode === 'advice' || mode === 'cpu';
    const requiresUserApproval = allowed && FINANCIAL_DOMAINS.has(domain) && isUserTeam;
    return finish(allowed, allowed ? 'allowed' : 'manual-only', requiresUserApproval,
      allowed
        ? requiresUserApproval
          ? `CPU advice is allowed under ${mode} mode; explicit user action is required before execution.`
          : `CPU advice is allowed under ${mode} mode.`
        : 'Manual mode does not permit CPU advice.');
  }

  if (FINANCIAL_DOMAINS.has(domain) && isUserTeam && actor !== 'user') {
    return finish(false, 'user-approval-required', true,
      `CPU/commissioner ${domain} execution cannot act for a user team; an explicit user action is required.`);
  }
  if (actor === 'cpu') {
    const allowed = mode === 'cpu';
    return finish(allowed, allowed ? 'allowed' : 'automation-disabled', false,
      allowed ? `CPU execution is enabled under ${domain} mode.` : `CPU execution requires ${domain} mode cpu.`);
  }
  return finish(true, 'allowed', false,
    actor === 'user' ? 'The user action itself supplies the required human approval.' : 'Commissioner execution is explicitly authorized.');
}
