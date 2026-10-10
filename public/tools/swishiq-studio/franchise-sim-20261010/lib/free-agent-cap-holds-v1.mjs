import {
  CAP_ACCOUNTING_RULE_SOURCE,
  CAP_BASE_FIELDS,
  CAP_COMPONENT_KINDS,
} from './cap-accounting-v1.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const FREE_AGENT_CAP_HOLDS_FORMAT = 'djhc-free-agent-cap-holds-v1';
export const FREE_AGENT_CAP_HOLD_CLASSES = Object.freeze(['bird', 'early-bird', 'non-bird']);
export const FREE_AGENT_RENUNCIATION_STATES = Object.freeze([
  'rights-active',
  'early-bird-exception-renounced',
  'full-veteran-rights-renounced',
  'signed-with-prior-team',
  'signed-elsewhere',
  'unknown',
]);
export const FREE_AGENT_RFA_STATES = Object.freeze(['restricted', 'unrestricted', 'unknown']);
export const FREE_AGENT_OFFER_SHEET_STATES = Object.freeze(['known-none', 'known-outstanding', 'unknown']);
export const FIRST_ROUND_RIGHTS_STATES = Object.freeze(['held', 'signed', 'assigned-away', 'renounced', 'excluded-non-nba', 'unknown']);

const BASES = Object.keys(CAP_BASE_FIELDS);
const OPTIONAL_BASES = Object.freeze([
  'taxTeamSalaryUsd',
  'mtsCapHoldTeamSalaryUsd',
  'mtsPaymentTeamSalaryUsd',
]);
const UNKNOWN_STATUSES = new Set(['', 'unknown', 'unreported', 'unresolved', 'not-reported', 'missing', 'conflict', 'disputed']);
const RESOLVED_STATUSES = new Set(['observed', 'verified', 'resolved', 'reconciled', 'component-calculated']);
const clone = value => structuredClone(value);

function unique(values) { return [...new Set(values)]; }
function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function hasValue(value) { return value !== undefined && value !== null; }
function centsToUsd(value) { return value === null ? null : Math.round(value) / 100; }
function roundedCents(value) { return Math.round(value * 100); }
function divideRound(numerator, denominator) { return Math.floor((numerator + denominator / 2) / denominator); }
function normalizedStatus(value) { return String(value ?? '').trim().toLowerCase(); }
function validDateEvidence(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$)/);
  if (!match || !Number.isFinite(Date.parse(text))) return false;
  const day = new Date(`${match[1]}T00:00:00.000Z`);
  return day.toISOString().slice(0, 10) === match[1];
}
function evidenceSources(...sources) {
  const candidates = sources.flatMap(source => Array.isArray(source) ? source : [source]).filter(Boolean);
  return [...new Map(candidates.map(source => [JSON.stringify(source), clone(source)])).values()];
}

function createIssues() { return { missingInputs: [], conflicts: [] }; }
function appendMissing(issues, message) { issues.missingInputs.push(message); }
function appendConflict(issues, message) { issues.conflicts.push(message); }

function rawValueAndStatus(raw, parent, field) {
  const evidence = isRecord(raw) && Object.hasOwn(raw, 'value');
  const value = evidence ? raw.value : raw;
  const source = evidence ? raw.source : null;
  const fieldSource = parent?.fieldProvenance?.[field];
  const selectedSource = source ?? fieldSource ?? parent?.source ?? null;
  const explicitStatus = evidence ? raw.valueStatus ?? raw.status : undefined;
  const status = explicitStatus ?? (selectedSource?.sourceClass === 'generated-scenario' ? 'generated-scenario' : hasValue(value) ? 'resolved' : 'unknown');
  const unit = evidence ? raw.unit : null;
  return {
    value,
    status: normalizedStatus(status),
    source: selectedSource,
    unit,
    evidenceField: evidence ? raw.field : undefined,
    evidenceSeasonStartYear: evidence ? raw.seasonStartYear : undefined,
    seasonStartYear: parent?.seasonStartYear,
  };
}

function validateSource(status, source, field, parsed, issues) {
  if (!source || (isRecord(source) && !Object.keys(source).length)) {
    appendMissing(issues, `${field} lacks source provenance.`);
    return false;
  }
  if (!String(source.sourceSystem ?? '').trim()) {
    appendMissing(issues, `${field} source lacks sourceSystem.`);
    return false;
  }
  if (!String(source.sourceVersion ?? '').trim()) {
    appendMissing(issues, `${field} source lacks sourceVersion.`);
    return false;
  }
  const dateEvidence = source.sourceClass === 'generated-scenario'
    ? (validDateEvidence(source.retrievedAt) || validDateEvidence(source.generatedAt))
    : validDateEvidence(source.retrievedAt);
  if (!dateEvidence) {
    appendMissing(issues, `${field} source needs a valid retrievedAt${source.sourceClass === 'generated-scenario' ? ' or generatedAt' : ''} date.`);
    return false;
  }
  if (parsed?.evidenceField !== undefined && parsed.evidenceField !== null && String(parsed.evidenceField).trim() &&
      ![field, field.split('.').at(-1)].includes(String(parsed.evidenceField).trim())) {
    appendConflict(issues, `${field} evidence declares a different field (${parsed.evidenceField}).`);
    return false;
  }
  if (Number.isInteger(parsed?.evidenceSeasonStartYear) && Number.isInteger(parsed?.seasonStartYear) &&
      parsed.evidenceSeasonStartYear !== parsed.seasonStartYear) {
    appendConflict(issues, `${field} evidence season ${parsed.evidenceSeasonStartYear} conflicts with ${parsed.seasonStartYear}.`);
    return false;
  }
  if (status === 'generated-scenario' && source?.sourceClass !== 'generated-scenario') {
    appendConflict(issues, `${field} is marked generated-scenario without generated-scenario source metadata.`);
    return false;
  }
  if (source?.sourceClass === 'generated-scenario' && status && status !== 'generated-scenario') {
    appendConflict(issues, `${field} status conflicts with its generated-scenario source class.`);
    return false;
  }
  return true;
}

function readAmount(raw, field, parent, issues, { optional = false } = {}) {
  if (raw === undefined || raw === null) {
    if (!optional) appendMissing(issues, `${field} is unresolved.`);
    return { cents: null, valueStatus: 'unknown', sources: [], field };
  }
  const parsed = rawValueAndStatus(raw, parent, field);
  if (parsed.status === 'conflict' || parsed.status === 'disputed') {
    appendConflict(issues, `${field} has conflicting evidence.`);
    return { cents: null, valueStatus: 'conflict', sources: evidenceSources(parsed.source), field };
  }
  if (UNKNOWN_STATUSES.has(parsed.status) || !hasValue(parsed.value)) {
    if (!optional) appendMissing(issues, `${field} is unresolved.`);
    return { cents: null, valueStatus: 'unknown', sources: evidenceSources(parsed.source), field };
  }
  if (parsed.unit && parsed.unit !== 'USD') {
    appendConflict(issues, `${field} must use USD, received ${parsed.unit}.`);
    return { cents: null, valueStatus: 'conflict', sources: evidenceSources(parsed.source), field };
  }
  const amount = Number(parsed.value);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(roundedCents(amount))) {
    appendConflict(issues, `${field} must be a finite non-negative USD amount.`);
    return { cents: null, valueStatus: 'conflict', sources: evidenceSources(parsed.source), field };
  }
  if (!validateSource(parsed.status, parsed.source, field, parsed, issues)) {
    return { cents: null, valueStatus: issues.conflicts.length ? 'conflict' : 'unknown', sources: evidenceSources(parsed.source), field };
  }
  let valueStatus = parsed.status;
  if (RESOLVED_STATUSES.has(valueStatus)) valueStatus = 'resolved';
  else if (valueStatus !== 'source-candidate' && valueStatus !== 'generated-scenario') valueStatus = 'unannotated';
  return { cents: roundedCents(amount), valueStatus, sources: evidenceSources(parsed.source), field, seasonStartYear: parent?.seasonStartYear ?? null };
}

function readState(raw, field, parent, issues, allowedStates) {
  if (raw === undefined || raw === null) {
    appendMissing(issues, `${field} is unresolved.`);
    return { value: null, valueStatus: 'unknown', sources: [], field };
  }
  const parsed = rawValueAndStatus(raw, parent, field);
  if (parsed.status === 'conflict' || parsed.status === 'disputed') {
    appendConflict(issues, `${field} has conflicting evidence.`);
    return { value: null, valueStatus: 'conflict', sources: evidenceSources(parsed.source), field };
  }
  const value = String(parsed.value ?? '').trim().toLowerCase();
  if (UNKNOWN_STATUSES.has(parsed.status) || !value || value === 'unknown') {
    appendMissing(issues, `${field} is unresolved.`);
    return { value: null, valueStatus: 'unknown', sources: evidenceSources(parsed.source), field };
  }
  if (!allowedStates.includes(value)) {
    appendConflict(issues, `${field} must be one of ${allowedStates.join(', ')}.`);
    return { value: null, valueStatus: 'conflict', sources: evidenceSources(parsed.source), field };
  }
  if (!validateSource(parsed.status, parsed.source, field, parsed, issues)) {
    return { value: null, valueStatus: issues.conflicts.length ? 'conflict' : 'unknown', sources: evidenceSources(parsed.source), field };
  }
  let valueStatus = parsed.status;
  if (RESOLVED_STATUSES.has(valueStatus)) valueStatus = 'resolved';
  else if (valueStatus !== 'source-candidate' && valueStatus !== 'generated-scenario') valueStatus = 'unannotated';
  return { value, valueStatus, sources: evidenceSources(parsed.source), field, seasonStartYear: parent?.seasonStartYear ?? null };
}

function readBoolean(raw, field, parent, issues) {
  if (raw === undefined || raw === null) {
    appendMissing(issues, `${field} is unresolved.`);
    return { value: null, valueStatus: 'unknown', sources: [], field };
  }
  const parsed = rawValueAndStatus(raw, parent, field);
  if (parsed.status === 'conflict' || parsed.status === 'disputed') {
    appendConflict(issues, `${field} has conflicting evidence.`);
    return { value: null, valueStatus: 'conflict', sources: evidenceSources(parsed.source), field };
  }
  if (UNKNOWN_STATUSES.has(parsed.status) || typeof parsed.value !== 'boolean') {
    if (typeof parsed.value !== 'boolean') appendConflict(issues, `${field} must be an explicit boolean.`);
    else appendMissing(issues, `${field} is unresolved.`);
    return { value: null, valueStatus: typeof parsed.value !== 'boolean' ? 'conflict' : 'unknown', sources: evidenceSources(parsed.source), field };
  }
  if (!validateSource(parsed.status, parsed.source, field, parsed, issues)) {
    return { value: null, valueStatus: issues.conflicts.length ? 'conflict' : 'unknown', sources: evidenceSources(parsed.source), field };
  }
  let valueStatus = parsed.status;
  if (RESOLVED_STATUSES.has(valueStatus)) valueStatus = 'resolved';
  else if (valueStatus !== 'source-candidate' && valueStatus !== 'generated-scenario') valueStatus = 'unannotated';
  return { value: parsed.value, valueStatus, sources: evidenceSources(parsed.source), field, seasonStartYear: parent?.seasonStartYear ?? null };
}

function outputStatus(facts, issues) {
  if (issues.conflicts.length || facts.some(fact => fact?.valueStatus === 'conflict')) return 'conflict';
  if (facts.some(fact => !fact || fact.valueStatus === 'unknown')) return 'unknown';
  if (facts.some(fact => fact.valueStatus === 'generated-scenario')) return 'generated-scenario';
  if (facts.some(fact => fact.valueStatus === 'source-candidate')) return 'source-candidate';
  if (facts.length && facts.every(fact => fact.valueStatus === 'resolved')) return 'resolved';
  return 'unannotated';
}

function factsSources(facts) {
  return evidenceSources(...facts.map(fact => fact?.sources ?? []), CAP_ACCOUNTING_RULE_SOURCE);
}

function makeEntry({
  entryId,
  kind,
  canonicalName,
  teamCode,
  seasonStartYear,
  amountsCents,
  factsByBase,
  missingByBase = {},
  conflictsByBase = {},
  issues,
  countsTowardIncompleteRoster = null,
  ruleRefs,
  assumptions = [],
  metadata = {},
}) {
  if (!CAP_COMPONENT_KINDS.includes(kind)) throw new Error(`Unsupported cap component kind ${kind}.`);
  const values = {};
  const statuses = {};
  const missingInputs = [];
  const conflicts = [];
  const sourceRefs = evidenceSources(CAP_ACCOUNTING_RULE_SOURCE);
  const identityInvalid = !normalizeCanonicalPlayerName(canonicalName) || !teamCode || !Number.isInteger(seasonStartYear);
  for (const base of BASES) {
    const amountCents = amountsCents[base] ?? null;
    const facts = factsByBase[base] ?? [];
    const localIssues = { missingInputs: [...(missingByBase[base] ?? [])], conflicts: [...(conflictsByBase[base] ?? [])] };
    localIssues.conflicts.push(...(issues?.conflicts ?? []));
    const valueStatus = identityInvalid || amountCents === null
      ? (localIssues.conflicts.length ? 'conflict' : 'unknown')
      : outputStatus(facts, localIssues);
    const valueCents = ['conflict', 'unknown'].includes(valueStatus) ? null : amountCents;
    const references = factsSources(facts);
    sourceRefs.push(...references);
    if (valueCents === null && localIssues.missingInputs.length) missingInputs.push(...localIssues.missingInputs);
    if (localIssues.conflicts.length) conflicts.push(...localIssues.conflicts);
    values[base] = {
      value: centsToUsd(valueCents),
      field: base,
      seasonStartYear,
      unit: 'USD',
      valueStatus,
      source: references.length === 1 ? references[0] : references,
      ...(valueCents === null ? { notes: localIssues.conflicts.length ? [...localIssues.conflicts] : [...localIssues.missingInputs] } : {}),
    };
    statuses[base] = valueStatus;
  }
  const flatIssues = {
    missingInputs: unique([...(issues?.missingInputs ?? []), ...missingInputs]),
    conflicts: unique([...(issues?.conflicts ?? []), ...conflicts]),
  };
  const distinctSources = evidenceSources(...sourceRefs);
  const complete = BASES.every(base => values[base].value !== null);
  const targetKnown = values.teamSalaryUsd.value !== null && values.apronTeamSalaryUsd.value !== null;
  return {
    entry: {
      entryId,
      kind,
      canonicalName,
      teamCode,
      seasonStartYear,
      values,
      statuses,
      sourceRefs: distinctSources,
      countsTowardIncompleteRoster,
      active: true,
      ruleRefs: [...ruleRefs],
      assumptions: [...assumptions],
      missingInputs: flatIssues.missingInputs,
      conflicts: flatIssues.conflicts,
      metadata: {
        ...clone(metadata),
        inputFactsByBase: Object.fromEntries(BASES.map(base => [base, (factsByBase[base] ?? []).map(fact => ({
          field: fact?.field ?? null,
          seasonStartYear: fact?.seasonStartYear ?? seasonStartYear,
          valueStatus: fact?.valueStatus ?? 'unknown',
          ...(Number.isInteger(fact?.cents) ? { amountUsd: centsToUsd(fact.cents) } : {}),
          ...(hasValue(fact?.value) ? { state: fact.value } : {}),
          sourceRefs: evidenceSources(fact?.sources ?? []),
        }))])),
      },
    },
    status: flatIssues.conflicts.length ? 'conflict' : targetKnown ? 'calculated' : 'incomplete',
    entryCompleteness: complete ? 'complete' : 'incomplete',
    missingInputs: flatIssues.missingInputs,
    conflicts: flatIssues.conflicts,
  };
}

function recordIdentity(input, seasonStartYear, issues) {
  const canonicalName = String(input?.canonicalName ?? '').trim();
  const normalizedName = normalizeCanonicalPlayerName(canonicalName);
  if (!normalizedName) appendConflict(issues, 'A non-empty exact canonicalName is required.');
  const teamCode = String(input?.teamCode ?? input?.priorTeamCode ?? '').trim().toUpperCase();
  if (!teamCode) appendMissing(issues, 'A teamCode is required for the cap entry.');
  if (!Number.isInteger(seasonStartYear)) appendConflict(issues, 'seasonStartYear must be an integer.');
  return { canonicalName, normalizedName, teamCode, seasonStartYear };
}

function entryId(prefix, year, normalizedName, suffix = '') {
  const safeName = normalizedName.replace(/\s+/g, '-');
  return `${prefix}-${year}-${safeName}${suffix ? `-${suffix}` : ''}`;
}

function readOptionalBaseContributions(input, seasonStartYear) {
  const amountsCents = {};
  const factsByBase = {};
  const missingByBase = {};
  const conflictsByBase = {};
  const basisByBase = {};
  const issues = createIssues();
  for (const base of OPTIONAL_BASES) {
    const contribution = input?.baseContributions?.[base];
    if (!contribution) {
      amountsCents[base] = null;
      factsByBase[base] = [];
      missingByBase[base] = [`${base} requires a caller-supplied amount and a justified basis; left unknown.`];
      basisByBase[base] = null;
      continue;
    }
    const basis = String(contribution.basis ?? '').trim();
    basisByBase[base] = basis || null;
    const fact = readAmount(contribution, `${base} contribution`, input, issues);
    if (!basis) {
      appendMissing(issues, `${base} contribution requires a non-empty basis.`);
      amountsCents[base] = null;
      factsByBase[base] = [fact];
      missingByBase[base] = [`${base} contribution lacks a justified basis.`];
      continue;
    }
    amountsCents[base] = fact.cents;
    factsByBase[base] = [fact];
    if (fact.cents === null) missingByBase[base] = [`${base} contribution is unresolved.`];
    if (fact.valueStatus === 'conflict') conflictsByBase[base] = [`${base} contribution conflicts.`];
  }
  return { amountsCents, factsByBase, missingByBase, conflictsByBase, basisByBase, issues };
}

function standardAssumptions(inputAssumptions = []) {
  return unique([
    'Inputs and outputs use USD with cent precision; percentage calculations round once to the nearest cent.',
    'CBA Salary and cap holds are distinct from cash payroll and from any revised payment schedule.',
    'Tax and MTS bases remain unknown unless a caller supplies a sourced amount with a non-empty basis.',
    ...(Array.isArray(inputAssumptions) ? inputAssumptions : []),
  ]);
}

function calculatedFreeAgentAmount(input, effectiveClass, issues) {
  const parts = input?.priorSalaryParts ?? {};
  const partFacts = [
    readAmount(parts.regularSalaryUsd, 'priorSalaryParts.regularSalaryUsd', input, issues),
    readAmount(parts.signingBonusAllocationUsd, 'priorSalaryParts.signingBonusAllocationUsd', input, issues),
    readAmount(parts.earnedIncentiveUsd, 'priorSalaryParts.earnedIncentiveUsd', input, issues),
  ];
  const threshold = input?.thresholds ?? {};
  const priorMinimum = readAmount(threshold.priorApplicableMinimumSalaryUsd, 'thresholds.priorApplicableMinimumSalaryUsd', input, issues);
  const currentMinimum = readAmount(threshold.currentMinimumNotReimbursedUsd, 'thresholds.currentMinimumNotReimbursedUsd', input, issues);
  const maximum = readAmount(threshold.maximumPlayerSalaryUsd, 'thresholds.maximumPlayerSalaryUsd', input, issues);
  const salaryFacts = [...partFacts, priorMinimum, currentMinimum, maximum];
  const totalPriorSalary = partFacts.every(fact => fact.cents !== null)
    ? partFacts.reduce((total, fact) => total + fact.cents, 0)
    : null;

  if (hasValue(input?.priorSalaryUsd)) {
    const suppliedPriorSalary = readAmount(input.priorSalaryUsd, 'priorSalaryUsd', input, issues);
    salaryFacts.push(suppliedPriorSalary);
    if (totalPriorSalary !== null && suppliedPriorSalary.cents !== null && suppliedPriorSalary.cents !== totalPriorSalary) {
      appendConflict(issues, `priorSalaryUsd conflicts with the sum of priorSalaryParts (${centsToUsd(totalPriorSalary)} vs ${centsToUsd(suppliedPriorSalary.cents)}).`);
    }
  }

  let followingSecondOption = null;
  if (effectiveClass === 'bird') {
    followingSecondOption = readBoolean(input?.followingSecondRookieScaleOptionYear,
      'followingSecondRookieScaleOptionYear', input, issues);
    salaryFacts.push(followingSecondOption);
  }

  const specialLimitStatus = readState(input?.thresholds?.rookieSecondOrThirdSeasonLimitStatus,
    'thresholds.rookieSecondOrThirdSeasonLimitStatus', input, issues, ['applicable', 'not-applicable']);
  salaryFacts.push(specialLimitStatus);
  let specialLimit = { cents: null, valueStatus: 'unknown', sources: [], field: 'thresholds.rookieSecondOrThirdSeasonMaximumUsd' };
  if (specialLimitStatus.value === 'applicable') {
    specialLimit = readAmount(threshold.rookieSecondOrThirdSeasonMaximumUsd,
      'thresholds.rookieSecondOrThirdSeasonMaximumUsd', input, issues);
    salaryFacts.push(specialLimit);
  }

  const enoughBaseInputs = salaryFacts.slice(0, 6).every(fact => fact.cents !== null);
  const neededClassInputsKnown = specialLimitStatus.value !== null &&
    (effectiveClass !== 'bird' || followingSecondOption?.value !== null);
  if (!enoughBaseInputs || !neededClassInputsKnown || totalPriorSalary === null || issues.conflicts.length) {
    return { amountCents: null, priorSalaryCents: totalPriorSalary, facts: salaryFacts, missing: [], conflicts: [...issues.conflicts] };
  }
  if (currentMinimum.cents > maximum.cents) {
    appendConflict(issues, 'Current minimum not reimbursed exceeds the maximum player salary threshold.');
    return { amountCents: null, priorSalaryCents: totalPriorSalary, facts: salaryFacts, missing: [], conflicts: [...issues.conflicts] };
  }

  let calculated;
  if (totalPriorSalary <= priorMinimum.cents) {
    calculated = currentMinimum.cents;
  } else {
    let rateBasisPoints;
    if (effectiveClass === 'bird') {
      const average = readAmount(threshold.estimatedAveragePlayerSalaryUsd,
        'thresholds.estimatedAveragePlayerSalaryUsd', input, issues);
      salaryFacts.push(average);
      if (average.cents === null) return { amountCents: null, priorSalaryCents: totalPriorSalary, facts: salaryFacts, missing: [...issues.missingInputs], conflicts: [...issues.conflicts] };
      const highPriorSalary = totalPriorSalary >= average.cents;
      rateBasisPoints = followingSecondOption.value
        ? (highPriorSalary ? 25_000 : 30_000)
        : (highPriorSalary ? 15_000 : 19_000);
    } else if (effectiveClass === 'early-bird') rateBasisPoints = 13_000;
    else rateBasisPoints = 12_000;
    calculated = divideRound(totalPriorSalary * rateBasisPoints, 10_000);
  }

  calculated = Math.min(maximum.cents, Math.max(currentMinimum.cents, calculated));
  if (specialLimitStatus.value === 'applicable') {
    if (specialLimit.cents === null) return { amountCents: null, priorSalaryCents: totalPriorSalary, facts: salaryFacts, missing: [...issues.missingInputs], conflicts: [...issues.conflicts] };
    if (specialLimit.cents < currentMinimum.cents) {
      appendConflict(issues, 'The supplied rookie-season limit is below the minimum free-agent amount floor.');
      return { amountCents: null, priorSalaryCents: totalPriorSalary, facts: salaryFacts, missing: [], conflicts: [...issues.conflicts] };
    }
    calculated = Math.min(calculated, specialLimit.cents);
  }
  return {
    amountCents: issues.conflicts.length ? null : calculated,
    priorSalaryCents: totalPriorSalary,
    facts: salaryFacts,
    missing: [...issues.missingInputs],
    conflicts: [...issues.conflicts],
  };
}

function readTenderState(rfa, key, fieldPrefix, input, issues, { twoWayQO = false } = {}) {
  const node = rfa?.[key] ?? {};
  const status = readState(node.status, `${fieldPrefix}.status`, input, issues, ['outstanding', 'not-outstanding']);
  if (status.value === 'not-outstanding') return { cents: null, apronCents: null, status: 'not-outstanding',
    facts: [status], teamSalaryFacts: [status], apronFacts: [status], amountFact: null };
  if (status.value !== 'outstanding') return { cents: null, apronCents: null, status: 'unknown',
    facts: [status], teamSalaryFacts: [status], apronFacts: [status], amountFact: null };
  if (twoWayQO) {
    const type = readState(node.type, `${fieldPrefix}.type`, input, issues, ['standard', 'two-way']);
    if (type.value === 'two-way') return { cents: null, apronCents: null, status: 'excluded-two-way',
      facts: [status, type], teamSalaryFacts: [status, type], apronFacts: [status, type], amountFact: null };
    if (type.value !== 'standard') return { cents: null, apronCents: null, status: 'unknown',
      facts: [status, type], teamSalaryFacts: [status, type], apronFacts: [status, type], amountFact: null };
    const amountFact = readAmount(node.salaryUsd, `${fieldPrefix}.salaryUsd`, input, issues);
    const unlikelyBonusFact = readAmount(node.unlikelyBonusesUsd,
      `${fieldPrefix}.unlikelyBonusesUsd`, input, issues);
    const apronCents = amountFact.cents === null || unlikelyBonusFact.cents === null
      ? null : amountFact.cents + unlikelyBonusFact.cents;
    return { cents: amountFact.cents, apronCents, status: amountFact.cents === null ? 'unknown' : 'outstanding',
      facts: [status, type, amountFact, unlikelyBonusFact], teamSalaryFacts: [status, type, amountFact],
      apronFacts: [status, type, amountFact, unlikelyBonusFact], amountFact, unlikelyBonusFact };
  }
  const amountFact = readAmount(node.salaryUsd, `${fieldPrefix}.salaryUsd`, input, issues);
  const unlikelyBonusFact = readAmount(node.unlikelyBonusesUsd,
    `${fieldPrefix}.unlikelyBonusesUsd`, input, issues);
  const apronCents = amountFact.cents === null || unlikelyBonusFact.cents === null
    ? null : amountFact.cents + unlikelyBonusFact.cents;
  return { cents: amountFact.cents, apronCents, status: amountFact.cents === null ? 'unknown' : 'outstanding',
    facts: [status, amountFact, unlikelyBonusFact], teamSalaryFacts: [status, amountFact],
    apronFacts: [status, amountFact, unlikelyBonusFact], amountFact, unlikelyBonusFact };
}

function rfaHoldAmounts(input, freeAgentAmountCents, issues) {
  const rfa = input?.restrictedFreeAgent;
  const rfaStatus = readState(rfa?.status, 'restrictedFreeAgent.status', input, issues, ['restricted', 'unrestricted']);
  const offerSheets = Array.isArray(rfa?.offerSheets?.items) ? rfa.offerSheets.items : [];
  const sheetIssues = createIssues();
  const offerSheetStatus = rfaStatus.value === 'unrestricted'
    ? { value: 'known-none', valueStatus: 'resolved', sources: [], field: 'restrictedFreeAgent.offerSheets.status' }
    : readState(rfa?.offerSheets?.status, 'restrictedFreeAgent.offerSheets.status', input,
      sheetIssues, FREE_AGENT_OFFER_SHEET_STATES);
  const facts = [rfaStatus];
  const sheetEntries = [];
  const sheetResults = [];

  if (rfaStatus.value === 'unrestricted' && offerSheets.length) {
    appendConflict(sheetIssues, 'Outstanding offer-sheet items conflict with unrestricted free-agent status.');
  } else if (offerSheetStatus.value === 'known-none' && offerSheets.length) {
    appendConflict(sheetIssues, 'Offer-sheet state is known-none but outstanding offer-sheet items were supplied.');
  }
  if (offerSheetStatus.value === 'known-outstanding' && !offerSheets.length) {
    appendConflict(sheetIssues, 'Offer-sheet state is known-outstanding but no offer-sheet item was supplied.');
  }
  if (offerSheetStatus.value === 'known-outstanding' && rfaStatus.value === 'unrestricted') {
    appendConflict(sheetIssues, 'An outstanding RFA offer sheet conflicts with unrestricted free-agent status.');
  }
  if (offerSheetStatus.value === 'unknown' && offerSheets.length) {
    appendConflict(sheetIssues, 'Offer-sheet items were supplied without a known outstanding-sheet status.');
  }

  for (const [index, offer] of offerSheetStatus.value === 'known-outstanding' ? offerSheets.entries() : []) {
    const result = calculateOutstandingOfferSheetCapEntry({
      ...offer,
      canonicalName: input.canonicalName,
      seasonStartYear: input.seasonStartYear,
      source: offer.source ?? input.source,
      fieldProvenance: { ...(input.fieldProvenance ?? {}), ...(offer.fieldProvenance ?? {}) },
      offerSheetOrdinal: index + 1,
    });
    sheetResults.push(result);
    if (result.entry) sheetEntries.push(result.entry);
    sheetIssues.missingInputs.push(...result.missingInputs);
    sheetIssues.conflicts.push(...result.conflicts);
  }

  if (rfaStatus.value === 'unrestricted') {
    for (const [key, label] of [['qualifyingOffer', 'Qualifying offer'], ['maximumQualifyingOffer', 'Maximum qualifying offer'], ['firstRefusalExerciseNotice', 'First-refusal exercise notice']]) {
      const status = rfa?.[key]?.status;
      if (isRecord(status) && status.value === 'outstanding' || typeof status === 'string' && status === 'outstanding') {
        appendConflict(issues, `${label} is outstanding for a player declared unrestricted.`);
      }
    }
    return {
      teamSalaryCents: freeAgentAmountCents,
      apronCents: 0,
      teamSalaryFacts: [rfaStatus],
      apronFacts: [rfaStatus],
      sheetEntries,
      sheetResults,
      conflicts: [...issues.conflicts],
      sheetMissing: [...sheetIssues.missingInputs],
      sheetConflicts: [...sheetIssues.conflicts],
      tenderCents: null,
      status: rfaStatus.value === 'unrestricted' ? 'resolved' : 'unknown',
    };
  }
  if (rfaStatus.value !== 'restricted') {
    return { teamSalaryCents: null, apronCents: null, teamSalaryFacts: [rfaStatus], apronFacts: [rfaStatus],
      teamSalaryMissing: ['Restricted/unrestricted status is unresolved.'], apronMissing: ['Restricted/unrestricted status is unresolved.'],
      sheetEntries, sheetResults, sheetMissing: [...sheetIssues.missingInputs], sheetConflicts: [...sheetIssues.conflicts],
      conflicts: [...issues.conflicts], tenderCents: null, status: 'unknown' };
  }

  const qo = readTenderState(rfa, 'qualifyingOffer', 'restrictedFreeAgent.qualifyingOffer', input, issues, { twoWayQO: true });
  const maxQO = readTenderState(rfa, 'maximumQualifyingOffer', 'restrictedFreeAgent.maximumQualifyingOffer', input, issues);
  const firstRefusal = readTenderState(rfa, 'firstRefusalExerciseNotice', 'restrictedFreeAgent.firstRefusalExerciseNotice', input, issues);
  const tenderRows = [qo, maxQO, firstRefusal];
  const teamSalaryTenderFacts = tenderRows.flatMap(row => row.teamSalaryFacts);
  const apronTenderFacts = tenderRows.flatMap(row => row.apronFacts);
  const teamSalaryTenderCandidates = tenderRows.map(row => row.cents).filter(value => value !== null);
  const apronTenderCandidates = tenderRows.map(row => row.apronCents).filter(value => value !== null);
  const tenderStatesKnown = tenderRows.every(row => row.status !== 'unknown');
  const tenderSalaryAmountsKnown = tenderRows.every(row => row.status !== 'outstanding' || row.cents !== null);
  const apronTenderAmountsKnown = tenderRows.every(row => row.status !== 'outstanding' || row.apronCents !== null);
  const tenderCents = tenderStatesKnown && tenderSalaryAmountsKnown && teamSalaryTenderCandidates.length
    ? Math.max(...teamSalaryTenderCandidates) : null;
  const apronTenderCents = tenderStatesKnown && apronTenderAmountsKnown && apronTenderCandidates.length
    ? Math.max(...apronTenderCandidates) : null;
  if (tenderStatesKnown && !teamSalaryTenderCandidates.length) {
    appendConflict(issues, 'Restricted free-agent status requires an outstanding standard QO, maximum QO, or first-refusal exercise notice.');
  }
  const teamSalaryCents = freeAgentAmountCents !== null && tenderCents !== null
    ? Math.max(freeAgentAmountCents, tenderCents)
    : null;
  return {
    teamSalaryCents,
    apronCents: apronTenderCents,
    tenderCents,
    teamSalaryFacts: [rfaStatus, ...teamSalaryTenderFacts],
    apronFacts: [rfaStatus, ...apronTenderFacts],
    sheetEntries,
    sheetResults,
    teamSalaryMissing: tenderStatesKnown && tenderSalaryAmountsKnown ? [] : ['One or more RFA tender/notice salary states or amounts are unresolved.'],
    apronMissing: tenderStatesKnown && apronTenderAmountsKnown ? [] : ['One or more RFA tender/notice apron salaries are unresolved; supply Salary plus Unlikely Bonuses.'],
    sheetMissing: [...sheetIssues.missingInputs],
    sheetConflicts: [...sheetIssues.conflicts],
    conflicts: [...issues.conflicts],
    status: tenderCents !== null && teamSalaryCents !== null ? 'resolved' : 'unknown',
  };
}

/**
 * Compute a veteran free-agent hold from explicit CBA salary and rights facts.
 * Amount evidence uses `{ value, unit: 'USD', valueStatus, source }`; a root
 * `source` can be used when a batch of same-source facts comes from one record.
 * `restrictedFreeAgent.offerSheets.items` contain outstanding offers for the
 * offering teams, not the prior team whose RFA hold is being calculated.
 */
export function calculateFreeAgentCapHold(input = {}) {
  const seasonStartYear = input.seasonStartYear;
  const identityIssues = createIssues();
  const identity = recordIdentity(input, seasonStartYear, identityIssues);
  const issues = createIssues();
  const renunciation = readState(input.renunciationStatus, 'renunciationStatus', input, issues, FREE_AGENT_RENUNCIATION_STATES.filter(value => value !== 'unknown'));
  const extraBases = readOptionalBaseContributions(input, seasonStartYear);
  const assumptions = standardAssumptions(input.assumptions);
  const ruleRefs = ['VII-4a(2)-(3)', 'VII-4d(1)-(8)', 'VII-4g(1)', 'VII-2e(1)(iv)-(v)'];
  let values = Object.fromEntries(BASES.map(base => [base, null]));
  let factsByBase = Object.fromEntries(BASES.map(base => [base, []]));
  let missingByBase = Object.fromEntries(BASES.map(base => [base, []]));
  const metadata = {
    component: 'veteran-free-agent-hold',
    freeAgentClass: null,
    effectiveFreeAgentClass: null,
    renunciationStatus: renunciation.value,
    restrictedFreeAgentStatus: null,
    freeAgentAmountUsd: null,
    restrictedTenderAmountUsd: null,
    allowedReSigningMechanisms: null,
  };

  if (renunciation.value === 'full-veteran-rights-renounced') {
    values.teamSalaryUsd = 0;
    values.apronTeamSalaryUsd = 0;
    factsByBase.teamSalaryUsd = [renunciation];
    factsByBase.apronTeamSalaryUsd = [renunciation];
    metadata.allowedReSigningMechanisms = ['room', 'minimum-player-salary-exception', 'two-way-contract'];
    metadata.fullVeteranRightsRenounced = true;
    metadata.renunciationRestrictions = {
      restrictedFreeAgentMayBeRenounced: false,
      fullRenunciationAllowedReSigningMechanisms: ['room', 'minimum-player-salary-exception', 'two-way-contract'],
      rescission: {
        onlyAfterRenunciationToCreateRoomForOfferSheetAndPriorTeamMatches: true,
        deadlineBusinessDaysAfterMatchOrPassedPhysical: 2,
        salaryCapLimitsApply: true,
      },
    };
    assumptions.push('Full veteran renunciation removes the free-agent amount and permits re-signing only with Room, the Minimum Player Salary Exception, or a Two-Way Contract.');
  } else if (['signed-with-prior-team', 'signed-elsewhere'].includes(renunciation.value)) {
    values.teamSalaryUsd = 0;
    values.apronTeamSalaryUsd = 0;
    factsByBase.teamSalaryUsd = [renunciation];
    factsByBase.apronTeamSalaryUsd = [renunciation];
    metadata.holdRemovedByStatus = renunciation.value;
    metadata.allowedReSigningMechanisms = [];
  } else if (renunciation.value === 'rights-active' || renunciation.value === 'early-bird-exception-renounced') {
    const classIssues = createIssues();
    const suppliedClass = readState(input.freeAgentClass, 'freeAgentClass', input, classIssues, FREE_AGENT_CAP_HOLD_CLASSES);
    const effectiveClass = renunciation.value === 'early-bird-exception-renounced' && suppliedClass.value === 'early-bird'
      ? 'non-bird'
      : suppliedClass.value;
    metadata.freeAgentClass = suppliedClass.value;
    metadata.effectiveFreeAgentClass = effectiveClass;
    if (renunciation.value === 'early-bird-exception-renounced' && suppliedClass.value !== 'early-bird') {
      appendConflict(classIssues, 'Early Bird exception renunciation requires early-bird free-agent classification.');
    }
    const hold = effectiveClass ? calculatedFreeAgentAmount(input, effectiveClass, classIssues) : { amountCents: null, priorSalaryCents: null, facts: [], missing: [], conflicts: [] };
    issues.missingInputs.push(...classIssues.missingInputs, ...hold.missing);
    issues.conflicts.push(...classIssues.conflicts, ...hold.conflicts);
    const rfaIssues = createIssues();
    const rfa = rfaHoldAmounts(input, hold.amountCents, rfaIssues);
    issues.missingInputs.push(...rfaIssues.missingInputs);
    issues.conflicts.push(...rfaIssues.conflicts, ...rfa.conflicts);
    const holdFacts = [renunciation, suppliedClass, ...(hold.facts ?? []), ...(rfa.teamSalaryFacts ?? [])];
    const apronFacts = [renunciation, ...(rfa.apronFacts ?? [])];
    values.teamSalaryUsd = issues.conflicts.length ? null : rfa.teamSalaryCents;
    values.apronTeamSalaryUsd = issues.conflicts.length ? null : rfa.apronCents;
    factsByBase.teamSalaryUsd = holdFacts;
    factsByBase.apronTeamSalaryUsd = apronFacts;
    missingByBase.teamSalaryUsd = [...classIssues.missingInputs, ...(hold.missing ?? []), ...(rfa.teamSalaryMissing ?? [])];
    missingByBase.apronTeamSalaryUsd = [...(rfa.apronMissing ?? [])];
    metadata.restrictedFreeAgentStatus = input.restrictedFreeAgent?.status?.value ?? input.restrictedFreeAgent?.status ?? null;
    metadata.freeAgentAmountUsd = centsToUsd(hold.amountCents);
    metadata.priorSalaryUsd = centsToUsd(hold.priorSalaryCents);
    metadata.restrictedTenderAmountUsd = centsToUsd(rfa.tenderCents);
    metadata.offerSheetEntryIds = (rfa.sheetEntries ?? []).map(entry => entry.entryId);
    metadata.fullVeteranRightsRenounced = false;
    metadata.renunciationRestrictions = {
      restrictedFreeAgentMayBeRenounced: false,
      earlyBirdExceptionRenunciationIsNotFullVeteranRenunciation: renunciation.value === 'early-bird-exception-renounced',
    };
    if (renunciation.value === 'early-bird-exception-renounced') {
      metadata.earlyBirdExceptionRenounced = true;
      metadata.allowedReSigningMechanisms = ['non-bird-exception', 'room', 'minimum-player-salary-exception', 'two-way-contract'];
      assumptions.push('Early Bird exception renunciation reclassifies the hold as Non-Bird; it is not full veteran-rights renunciation.');
    }
    assumptions.push('Team Salary uses the applicable Free Agent Amount; the Apron ledger removes that amount and substitutes only the applicable outstanding RFA tender/first-refusal amount.');
    const offerRows = rfa.sheetEntries ?? [];
    const holdResult = makeEntry({
      entryId: entryId('free-agent-hold', seasonStartYear, identity.normalizedName),
      kind: 'free-agent-hold',
      canonicalName: identity.canonicalName,
      teamCode: identity.teamCode,
      seasonStartYear,
      amountsCents: { teamSalaryUsd: values.teamSalaryUsd,
        apronTeamSalaryUsd: values.apronTeamSalaryUsd,
        ...extraBases.amountsCents },
      factsByBase: { ...factsByBase, ...extraBases.factsByBase },
      missingByBase: { ...missingByBase, ...extraBases.missingByBase },
      conflictsByBase: extraBases.conflictsByBase,
      issues: { missingInputs: [...identityIssues.missingInputs, ...issues.missingInputs],
        conflicts: [...identityIssues.conflicts, ...issues.conflicts] },
      countsTowardIncompleteRoster: ['rights-active', 'early-bird-exception-renounced'].includes(renunciation.value) ? true : false,
      ruleRefs,
      assumptions,
      metadata: { ...metadata, baseContributionBases: extraBases.basisByBase },
    });
    const entries = [holdResult.entry, ...offerRows];
    const allConflicts = unique([...identityIssues.conflicts, ...issues.conflicts, ...extraBases.issues.conflicts,
      ...holdResult.conflicts, ...(rfa.sheetConflicts ?? []), ...(rfa.sheetResults ?? []).flatMap(row => row.conflicts)]);
    const allMissing = unique([...identityIssues.missingInputs, ...issues.missingInputs, ...rfa.sheetMissing,
      ...extraBases.issues.missingInputs,
      ...holdResult.missingInputs, ...(rfa.sheetResults ?? []).flatMap(row => row.missingInputs)]);
    const targetComplete = entries.every(entry => entry.values.teamSalaryUsd.value !== null && entry.values.apronTeamSalaryUsd.value !== null);
    return {
      format: FREE_AGENT_CAP_HOLDS_FORMAT,
      schemaVersion: '1.0.0',
      status: allConflicts.length ? 'conflict' : targetComplete && !(rfa.sheetMissing ?? []).length ? 'calculated' : 'incomplete',
      entryCompleteness: entries.every(entry => BASES.every(base => entry.values[base].value !== null)) ? 'complete' : 'incomplete',
      seasonStartYear,
      canonicalName: identity.canonicalName,
      normalizedCanonicalName: identity.normalizedName,
      teamCode: identity.teamCode,
      freeAgent: { ...metadata },
      entries,
      missingInputs: allMissing,
      conflicts: allConflicts,
      assumptions: unique(assumptions),
      ruleRefs,
      ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
      targetBases: ['teamSalaryUsd', 'apronTeamSalaryUsd'],
      legalReady: false,
      note: 'A component calculation does not establish official league approval or complete team accounting.',
    };
  }

  if (['full-veteran-rights-renounced', 'signed-with-prior-team', 'signed-elsewhere'].includes(renunciation.value)) {
    if (input.restrictedFreeAgent?.status !== undefined && input.restrictedFreeAgent?.status !== null) {
      const rfaStatus = readState(input.restrictedFreeAgent.status, 'restrictedFreeAgent.status', input, issues,
        ['restricted', 'unrestricted']);
      if (rfaStatus.value === 'restricted' && renunciation.value === 'full-veteran-rights-renounced') {
        appendConflict(issues, 'A Restricted Free Agent cannot be fully renounced.');
      }
    }
    const knownResult = makeEntry({
      entryId: entryId('free-agent-hold', seasonStartYear, identity.normalizedName),
      kind: 'free-agent-hold', canonicalName: identity.canonicalName, teamCode: identity.teamCode, seasonStartYear,
      amountsCents: { teamSalaryUsd: values.teamSalaryUsd, apronTeamSalaryUsd: values.apronTeamSalaryUsd,
        ...extraBases.amountsCents },
      factsByBase: { ...factsByBase, ...extraBases.factsByBase },
      missingByBase: { ...missingByBase, ...extraBases.missingByBase },
      conflictsByBase: extraBases.conflictsByBase,
      issues: { missingInputs: [...identityIssues.missingInputs, ...issues.missingInputs],
        conflicts: [...identityIssues.conflicts, ...issues.conflicts] },
      countsTowardIncompleteRoster: false,
      ruleRefs,
      assumptions,
      metadata: { ...metadata, baseContributionBases: extraBases.basisByBase },
    });
    const allConflicts = unique([...identityIssues.conflicts, ...issues.conflicts, ...extraBases.issues.conflicts,
      ...knownResult.conflicts]);
    const allMissing = unique([...identityIssues.missingInputs, ...issues.missingInputs, ...extraBases.issues.missingInputs,
      ...knownResult.missingInputs]);
    return {
      format: FREE_AGENT_CAP_HOLDS_FORMAT,
      schemaVersion: '1.0.0',
      status: allConflicts.length ? 'conflict' : values.teamSalaryUsd !== null && values.apronTeamSalaryUsd !== null ? 'calculated' : 'incomplete',
      entryCompleteness: BASES.every(base => knownResult.entry.values[base].value !== null) ? 'complete' : 'incomplete',
      seasonStartYear,
      canonicalName: identity.canonicalName,
      normalizedCanonicalName: identity.normalizedName,
      teamCode: identity.teamCode,
      freeAgent: { ...metadata },
      entries: [knownResult.entry],
      missingInputs: allMissing,
      conflicts: allConflicts,
      assumptions: unique(assumptions),
      ruleRefs,
      ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
      targetBases: ['teamSalaryUsd', 'apronTeamSalaryUsd'],
      legalReady: false,
      note: 'A component calculation does not establish official league approval or complete team accounting.',
    };
  }

  // An unresolved rights state blocks both salary bases instead of assuming an active or renounced hold.
  issues.missingInputs.push(...identityIssues.missingInputs);
  issues.conflicts.push(...identityIssues.conflicts);
  issues.missingInputs.push('Free-agent rights state does not support a determinable hold.');
  missingByBase.teamSalaryUsd = [...issues.missingInputs];
  missingByBase.apronTeamSalaryUsd = [...issues.missingInputs];
  const unresolved = makeEntry({
    entryId: entryId('free-agent-hold', seasonStartYear, identity.normalizedName),
    kind: 'free-agent-hold', canonicalName: identity.canonicalName, teamCode: identity.teamCode, seasonStartYear,
    amountsCents: { teamSalaryUsd: null, apronTeamSalaryUsd: null, ...extraBases.amountsCents },
    factsByBase: { teamSalaryUsd: [renunciation], apronTeamSalaryUsd: [renunciation], ...extraBases.factsByBase },
    missingByBase: { ...missingByBase, ...extraBases.missingByBase },
    conflictsByBase: extraBases.conflictsByBase,
    issues: { missingInputs: [...identityIssues.missingInputs, ...issues.missingInputs, ...extraBases.issues.missingInputs],
      conflicts: [...identityIssues.conflicts, ...issues.conflicts, ...extraBases.issues.conflicts] },
    countsTowardIncompleteRoster: null, ruleRefs, assumptions, metadata,
  });
  return {
    format: FREE_AGENT_CAP_HOLDS_FORMAT,
    schemaVersion: '1.0.0',
    status: unresolved.conflicts.length ? 'conflict' : 'incomplete',
    entryCompleteness: 'incomplete',
    seasonStartYear,
    canonicalName: identity.canonicalName,
    normalizedCanonicalName: identity.normalizedName,
    teamCode: identity.teamCode,
    freeAgent: metadata,
    entries: [unresolved.entry],
    missingInputs: unresolved.missingInputs,
    conflicts: unresolved.conflicts,
    assumptions,
    ruleRefs,
    ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
    targetBases: ['teamSalaryUsd', 'apronTeamSalaryUsd'],
    legalReady: false,
    note: 'A component calculation does not establish official league approval or complete team accounting.',
  };
}

/** Calculate one current-season outstanding offer sheet for the offering team. */
export function calculateOutstandingOfferSheetCapEntry(input = {}) {
  const issues = createIssues();
  const seasonStartYear = input.seasonStartYear;
  const identity = recordIdentity({ ...input, teamCode: input.offerTeamCode ?? input.teamCode }, seasonStartYear, issues);
  const ordinal = Number.isInteger(input.offerSheetOrdinal) ? input.offerSheetOrdinal : 1;
  const offerSheetId = String(input.offerSheetId ?? `offer-${ordinal}`).trim();
  if (!offerSheetId) appendConflict(issues, 'An offerSheetId is required to create a stable cap entry.');
  const salary = readAmount(input.currentSeasonSalaryUsd, 'currentSeasonSalaryUsd', input, issues);
  const apronSalary = hasValue(input.currentSeasonApronSalaryUsd)
    ? readAmount(input.currentSeasonApronSalaryUsd, 'currentSeasonApronSalaryUsd', input, issues)
    : null;
  const sameApronSalary = hasValue(input.apronSalarySameAsTeamSalary)
    ? readBoolean(input.apronSalarySameAsTeamSalary, 'apronSalarySameAsTeamSalary', input, issues)
    : null;
  let apronSalaryCents = apronSalary?.cents ?? null;
  let apronSalaryFact = apronSalary;
  if (apronSalary) {
    if (sameApronSalary?.value === true && apronSalary.cents !== salary.cents) {
      appendConflict(issues, 'apronSalarySameAsTeamSalary conflicts with the supplied current-season apron salary.');
    }
  } else if (sameApronSalary?.value === true) {
    apronSalaryCents = salary.cents;
    apronSalaryFact = sameApronSalary;
  } else {
    appendMissing(issues, 'Current-season Apron Salary requires an explicit amount or a sourced apronSalarySameAsTeamSalary=true declaration.');
    apronSalaryFact = { field: 'currentSeasonApronSalaryUsd', seasonStartYear, valueStatus: 'unknown', sources: [] };
  }
  const extraBases = readOptionalBaseContributions(input, seasonStartYear);
  const amountsCents = {
    teamSalaryUsd: salary.cents,
    apronTeamSalaryUsd: apronSalaryCents,
    ...extraBases.amountsCents,
  };
  const missingByBase = {
    teamSalaryUsd: salary.cents === null ? ['Current-season offer-sheet salary is unresolved.'] : [],
    apronTeamSalaryUsd: apronSalaryCents === null ? ['Current-season Apron Salary is unresolved.'] : [],
    ...extraBases.missingByBase,
  };
  const factsByBase = {
    teamSalaryUsd: [salary],
    apronTeamSalaryUsd: [salary, apronSalaryFact].filter(Boolean),
    ...extraBases.factsByBase,
  };
  const row = makeEntry({
    entryId: entryId('rfa-offer-sheet', seasonStartYear, identity.normalizedName, offerSheetId.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()),
    kind: 'free-agent-hold', canonicalName: identity.canonicalName, teamCode: identity.teamCode, seasonStartYear,
    amountsCents, factsByBase, missingByBase, conflictsByBase: extraBases.conflictsByBase,
    issues: { missingInputs: [...issues.missingInputs, ...extraBases.issues.missingInputs],
      conflicts: [...issues.conflicts, ...extraBases.issues.conflicts] },
    countsTowardIncompleteRoster: true,
    ruleRefs: ['VII-4a(3)', 'VII-2e(1)'],
    assumptions: [
      'This entry belongs to the team that submitted the outstanding offer sheet.',
      'The supplied current-season Team Salary and Apron Salary are independently sourced; multi-season terms must be evaluated season by season.',
      ...(sameApronSalary?.value === true ? ['The caller explicitly states that Apron Salary equals Team Salary for this offer-sheet season.'] : []),
      ...standardAssumptions(input.assumptions),
    ],
    metadata: {
      component: 'outstanding-rfa-offer-sheet',
      offerSheetId,
      priorTeamCode: input.priorTeamCode ?? null,
      currentSeasonTeamSalaryUsd: centsToUsd(salary.cents),
      currentSeasonApronSalaryUsd: centsToUsd(apronSalaryCents),
      baseContributionBases: extraBases.basisByBase,
    },
  });
  return {
    format: FREE_AGENT_CAP_HOLDS_FORMAT,
    status: row.status,
    entryCompleteness: row.entryCompleteness,
    entry: row.entry,
    missingInputs: row.missingInputs,
    conflicts: row.conflicts,
    ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
  };
}

/**
 * Calculate an unsigned first-round pick's 120% rookie-scale Team Salary hold.
 * Apron Team Salary uses the explicit outstanding Required Tender instead of
 * the rookie-scale cap hold; an unknown tender remains null.
 */
export function calculateFirstRoundPickCapHold(input = {}) {
  const seasonStartYear = input.seasonStartYear;
  const identityIssues = createIssues();
  const identity = recordIdentity(input, seasonStartYear, identityIssues);
  const issues = createIssues();
  const rights = readState(input.rightsStatus, 'rightsStatus', input, issues, FIRST_ROUND_RIGHTS_STATES.filter(value => value !== 'unknown'));
  const extraBases = readOptionalBaseContributions(input, seasonStartYear);
  const assumptions = standardAssumptions(input.assumptions);
  let teamSalaryCents = null;
  let apronCents = null;
  let rookieScaleAmountCents = null;
  let teamSalaryFacts = [rights];
  let apronFacts = [rights];
  const missingByBase = { teamSalaryUsd: [], apronTeamSalaryUsd: [] };
  let requiredTenderCents = null;

  if (rights.value === 'held') {
    const rookieScale = readAmount(input.rookieScaleAmountUsd, 'rookieScaleAmountUsd', input, issues);
    rookieScaleAmountCents = rookieScale.cents;
    const tenderStatus = readState(input.requiredTender?.status, 'requiredTender.status', input, issues, ['outstanding', 'not-outstanding']);
    teamSalaryFacts = [rights, rookieScale];
    apronFacts = [rights, tenderStatus];
    if (rookieScale.cents !== null) teamSalaryCents = divideRound(rookieScale.cents * 12_000, 10_000);
    if (tenderStatus.value === 'outstanding') {
      const tender = readAmount(input.requiredTender?.salaryUsd, 'requiredTender.salaryUsd', input, issues);
      const basis = String(input.requiredTender?.basis ?? '').trim();
      if (!basis) {
        appendMissing(issues, 'An outstanding Required Tender needs an explicit calculation/source basis.');
        missingByBase.apronTeamSalaryUsd.push('Outstanding Required Tender basis is unresolved.');
      }
      apronFacts.push(tender);
      requiredTenderCents = tender.cents;
      apronCents = basis ? tender.cents : null;
    } else if (tenderStatus.value === 'not-outstanding') {
      apronCents = 0;
    }
    if (rookieScale.cents === null) missingByBase.teamSalaryUsd.push('Rookie-scale amount is unresolved.');
    if (apronCents === null) missingByBase.apronTeamSalaryUsd.push('Required Tender status/amount is unresolved.');
    assumptions.push('Unsigned first-round pick Team Salary hold equals 120% of the supplied applicable Rookie Scale Amount.');
    assumptions.push('Apron Team Salary removes the unsigned-pick hold and adds only the supplied outstanding Required Tender amount.');
  } else if (['signed', 'assigned-away', 'renounced', 'excluded-non-nba'].includes(rights.value)) {
    teamSalaryCents = 0;
    apronCents = 0;
    const tenderStatus = input.requiredTender?.status;
    const tenderState = isRecord(tenderStatus) ? tenderStatus.value : tenderStatus;
    if (tenderState === 'outstanding') appendConflict(issues, 'An outstanding first-round Required Tender conflicts with inactive draft rights.');
    teamSalaryFacts = [rights];
    apronFacts = [rights];
    assumptions.push(`Draft-right status ${rights.value} means no active rookie-scale cap hold or outstanding tender contribution was supplied.`);
  } else {
    missingByBase.teamSalaryUsd.push('First-round draft-right status is unresolved.');
    missingByBase.apronTeamSalaryUsd.push('First-round draft-right status is unresolved.');
  }

  const amountsCents = {
    teamSalaryUsd: issues.conflicts.length ? null : teamSalaryCents,
    apronTeamSalaryUsd: issues.conflicts.length ? null : apronCents,
    ...extraBases.amountsCents,
  };
  const factsByBase = {
    teamSalaryUsd: teamSalaryFacts,
    apronTeamSalaryUsd: apronFacts,
    ...extraBases.factsByBase,
  };
  const entryResult = makeEntry({
    entryId: entryId('first-round-pick-hold', seasonStartYear, identity.normalizedName),
    kind: 'draft-hold', canonicalName: identity.canonicalName, teamCode: identity.teamCode, seasonStartYear,
    amountsCents, factsByBase,
    missingByBase: { ...missingByBase, ...extraBases.missingByBase },
    conflictsByBase: extraBases.conflictsByBase,
    issues: { missingInputs: [...identityIssues.missingInputs, ...issues.missingInputs, ...extraBases.issues.missingInputs],
      conflicts: [...identityIssues.conflicts, ...issues.conflicts, ...extraBases.issues.conflicts] },
    countsTowardIncompleteRoster: rights.value === 'held' ? true : rights.value ? false : null,
    ruleRefs: ['VII-4e(1)-(4)', 'VII-2e(1)(vi)-(vii)'],
    assumptions,
    metadata: {
      component: 'unsigned-first-round-pick-hold',
      rightsStatus: rights.value,
      rookieScaleAmountUsd: centsToUsd(rookieScaleAmountCents),
      teamSalaryHoldUsd: centsToUsd(teamSalaryCents),
      requiredTenderStatus: input.requiredTender?.status?.value ?? input.requiredTender?.status ?? null,
      requiredTenderAmountUsd: centsToUsd(requiredTenderCents),
      requiredTenderBasis: input.requiredTender?.basis ?? null,
      baseContributionBases: extraBases.basisByBase,
    },
  });
  return {
    format: FREE_AGENT_CAP_HOLDS_FORMAT,
    schemaVersion: '1.0.0',
    status: entryResult.conflicts.length ? 'conflict' : amountsCents.teamSalaryUsd !== null && amountsCents.apronTeamSalaryUsd !== null ? 'calculated' : 'incomplete',
    entryCompleteness: entryResult.entryCompleteness,
    seasonStartYear,
    canonicalName: identity.canonicalName,
    normalizedCanonicalName: identity.normalizedName,
    teamCode: identity.teamCode,
    entry: entryResult.entry,
    entries: [entryResult.entry],
    missingInputs: entryResult.missingInputs,
    conflicts: entryResult.conflicts,
    assumptions: unique(assumptions),
    ruleRefs: ['VII-4e(1)-(4)', 'VII-2e(1)(vi)-(vii)'],
    ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
    targetBases: ['teamSalaryUsd', 'apronTeamSalaryUsd'],
    legalReady: false,
    note: 'A component calculation does not establish official league approval or complete team accounting.',
  };
}

/** Build cap-ledger entries for explicitly supplied veteran FAs and FRPs. */
export function buildFreeAgentAndDraftHoldEntries({ seasonStartYear, freeAgents = [], firstRoundPicks = [] } = {}) {
  if (!Number.isInteger(seasonStartYear)) throw new Error('Free-agent/draft holds require seasonStartYear.');
  if (!Array.isArray(freeAgents) || !Array.isArray(firstRoundPicks)) throw new Error('Free-agent and first-round-pick inputs must be arrays.');
  const freeAgentResults = freeAgents.map(input => calculateFreeAgentCapHold({ ...input, seasonStartYear: input.seasonStartYear ?? seasonStartYear }));
  const draftResults = firstRoundPicks.map(input => calculateFirstRoundPickCapHold({ ...input, seasonStartYear: input.seasonStartYear ?? seasonStartYear }));
  const entries = [...freeAgentResults.flatMap(result => result.entries), ...draftResults.flatMap(result => result.entries)];
  const seen = new Map();
  const duplicateConflicts = [];
  for (const entry of entries) {
    const key = `${entry.teamCode}|${entry.seasonStartYear}|${entry.entryId}`;
    const previous = seen.get(key);
    if (previous) {
      duplicateConflicts.push(`Duplicate generated cap-hold entry ${key}.`);
      for (const duplicate of [previous, entry]) {
        duplicate.conflicts = unique([...(duplicate.conflicts ?? []), `Duplicate generated cap-hold entry ${key}.`]);
        for (const base of BASES) {
          duplicate.values[base] = { ...duplicate.values[base], value: null, valueStatus: 'conflict', notes: [`Duplicate generated cap-hold entry ${key}.`] };
          duplicate.statuses[base] = 'conflict';
        }
      }
    } else seen.set(key, entry);
  }
  const conflicts = unique([...duplicateConflicts, ...freeAgentResults.flatMap(result => result.conflicts), ...draftResults.flatMap(result => result.conflicts)]);
  const missingInputs = unique([...freeAgentResults.flatMap(result => result.missingInputs), ...draftResults.flatMap(result => result.missingInputs)]);
  const targetComplete = entries.every(entry => entry.values.teamSalaryUsd.value !== null && entry.values.apronTeamSalaryUsd.value !== null);
  return {
    format: FREE_AGENT_CAP_HOLDS_FORMAT,
    schemaVersion: '1.0.0',
    status: conflicts.length ? 'conflict' : targetComplete ? 'calculated' : 'incomplete',
    entryCompleteness: entries.every(entry => BASES.every(base => entry.values[base].value !== null)) ? 'complete' : 'incomplete',
    seasonStartYear,
    entries,
    freeAgentResults,
    firstRoundPickResults: draftResults,
    missingInputs,
    conflicts,
    ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
    targetBases: ['teamSalaryUsd', 'apronTeamSalaryUsd'],
    legalReady: false,
  };
}
