import { evaluateContractSalaryScale } from './cba-salary-scales-v1.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const SIGNING_MECHANISM_FORMAT = 'djhc-cba-signing-mechanism-evaluation-v1';
export const SIGNING_EXCEPTION_FORMAT = 'djhc-signing-exception-budget-v1';
export const SIGNING_MECHANISMS = Object.freeze({
  'cap-room': { maximumYears: 4, annualChangeRate: 0.05, ruleRef: 'VII-2b' },
  minimum: { maximumYears: 2, annualChangeRate: null, ruleRef: 'VII-6i' },
  bird: { maximumYears: 5, annualChangeRate: 0.08, ruleRef: 'VII-6b1' },
  'early-bird': { maximumYears: 4, minimumNonOptionYears: 2, annualChangeRate: 0.08, ruleRef: 'VII-6b3' },
  'non-bird': { maximumYears: 4, annualChangeRate: 0.05, ruleRef: 'VII-6b2' },
  'non-taxpayer-mle': { maximumYears: 4, annualChangeRate: 0.05, apron: 'first-apron', ruleRef: 'VII-6e' },
  'taxpayer-mle': { maximumYears: 2, annualChangeRate: 0.05, apron: 'second-apron', ruleRef: 'VII-6f' },
  'room-mle': { maximumYears: 3, annualChangeRate: 0.05, ruleRef: 'VII-6g' },
  biannual: { maximumYears: 2, annualChangeRate: 0.05, apron: 'first-apron', ruleRef: 'VII-6d' },
});

const clone = value => structuredClone(value);
function valueOf(raw) { return raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw; }
function usable(raw, parent = null) {
  return ![raw?.valueStatus, raw?.status, parent?.valueStatus, parent?.status]
    .some(status => /unknown|candidate|conflict|unresolved|unreported|missing|disputed|invalid/i.test(String(status ?? '')));
}
function amount(raw, parent = null) {
  const value = valueOf(raw);
  return !usable(raw, parent) || value === null || value === undefined || typeof value === 'boolean' ||
    typeof value === 'string' && !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
}
function boolean(raw, parent = null) { return usable(raw, parent) && typeof valueOf(raw) === 'boolean' ? valueOf(raw) : null; }
function dateValid(raw) {
  const value = String(raw ?? '').slice(0, 10), date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function sourceValid(source) { return Boolean(source?.sourceSystem && source?.sourceVersion && dateValid(source.retrievedAt ?? source.generatedAt)); }
function seasonConflict(raw, expectedYear) {
  return [raw?.seasonStartYear, raw?.source?.seasonStartYear].some(year => year != null && year !== expectedYear);
}
const cents = value => Math.round(value * 100);

/** Nominal annual limits; actual availability also needs usage, timing and
 * entitlement. Existing official threshold values can be used separately. */
export function deriveNominalSigningExceptionAmount({ mechanism, seasonStartYear, salaryCapUsd } = {}) {
  const cap = amount(salaryCapUsd);
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < 2023 || cap === null || cap <= 0) return null;
  const ratios = { 'non-taxpayer-mle': 0.0912, 'room-mle': 0.05678, biannual: 0.0332 };
  const result = mechanism === 'taxpayer-mle' ? 5e6 * cap / 136021000 : ratios[mechanism] ? cap * ratios[mechanism] : null;
  return result === null ? null : { amountUsd: Math.round(result), unroundedAmountUsd: result, unit: 'USD', ruleRef: SIGNING_MECHANISMS[mechanism].ruleRef,
    disclosure: 'Nominal formula amount with nearest-dollar display; not an available or legally confirmed exception.' };
}

export function createSigningExceptionBudget({ exceptionId, teamCode, mechanism, seasonStartYear, originalAmountUsd,
  usedAmountUsd = 0, remainingAmountAtWindowUsd, entitlementStatus, timingStatus, source } = {}) {
  if (!exceptionId || !teamCode || !['non-taxpayer-mle', 'taxpayer-mle', 'room-mle', 'biannual'].includes(mechanism) || !Number.isInteger(seasonStartYear)) throw new Error('Signing budget requires ID, team, mechanism and season.');
  const original = amount(originalAmountUsd), used = amount(usedAmountUsd), remaining = amount(remainingAmountAtWindowUsd);
  if ([original, used, remaining].some(value => value === null) || used > original || remaining > original - used) throw new Error('Signing budget original, used and window-adjusted remaining amounts are inconsistent.');
  if (!sourceValid(source)) throw new Error('Signing budget needs versioned dated provenance.');
  return { format: SIGNING_EXCEPTION_FORMAT, exceptionId, teamCode: String(teamCode).toUpperCase(), mechanism, seasonStartYear,
    originalAmountUsd: original, usedAmountUsd: used, remainingAmountAtWindowUsd: remaining, entitlementStatus, timingStatus,
    status: 'active', source: clone(source), usageHistory: [], legalReady: false,
    assumptions: ['Window-adjusted balance is supplied explicitly; daily January-10 reduction and offer-sheet exceptions require their own calendar calculation.'] };
}

/** Standard full-season, no-incentive, no-signing-bonus new contracts only.
 * The output is a bounded rule screen; roster rules, moratorium, special max,
 * next-year apron and all other signing constraints remain separate. */
export function evaluateSigningMechanism({ mechanism, seasonStartYear, teamCode, canonicalName, contractSeasons = [], input = {},
  thresholds = {}, postTeamSalaryUsd = null, postApronTeamSalaryUsd = null, contractScaleInput = null, exceptionBudget = null,
  teamUsage = null, ruleVersionId = 'nba-nbpa-cba-2023' } = {}) {
  const violations = [], missingInputs = [], hardCapTriggers = [], definition = SIGNING_MECHANISMS[mechanism];
  if (!definition) missingInputs.push('A supported signing mechanism is required.');
  if (ruleVersionId !== 'nba-nbpa-cba-2023' || !Number.isInteger(seasonStartYear) || seasonStartYear < 2023) return {
    format: SIGNING_MECHANISM_FORMAT, mechanism, canonicalName, teamCode, seasonStartYear, status: 'unknown', violations: [],
    missingInputs: ['Signing limits currently require the 2023 CBA branch; its restrictions are not applied to an unsupported season/rule version.'],
    hardCapTriggers: [], budgetUse: null, legalReady: false, calculations: null, ruleRefs: [], limitations: ['Historical and other CBA branches require their own signing module.'] };
  if (!sourceValid(input.source)) missingInputs.push('Signing-rule inputs need versioned dated source or generated provenance.');
  const currentFields = ['maximumPlayerSalaryUsd', 'currentMinimumAnnualSalaryUsd', 'qualifyingOfferSalaryPlusUnlikelyBonusUsd', 'exceptionEntitlement'];
  const priorFields = ['priorRegularSalaryUsd', 'priorLikelyBonusUsd', 'priorUnlikelyBonusUsd', 'priorAveragePlayerSalaryUsd'];
  if (seasonConflict(input, seasonStartYear) || currentFields.some(field => seasonConflict(input[field], seasonStartYear)) ||
      priorFields.some(field => seasonConflict(input[field], seasonStartYear - 1)) ||
      ['salaryExcludingDeemedExceptionsUsd', 'applicableExceptionTotalUsd', 'continuousEligibilityStatus']
        .some(field => seasonConflict(input.exceptionEntitlement?.[field], seasonStartYear))) {
    missingInputs.push('Signing-rule field or source season conflicts with its current/prior-season meaning.');
  }
  if (input.canonicalName && normalizeCanonicalPlayerName(input.canonicalName) !== normalizeCanonicalPlayerName(canonicalName) || input.teamCode && String(input.teamCode).toUpperCase() !== String(teamCode).toUpperCase() ||
      input.seasonStartYear !== undefined && input.seasonStartYear !== seasonStartYear) violations.push('Signing-rule input identity/team/season conflicts with the proposal.');
  if (input.contractProfile !== 'simple-zero-bonus-full-season') missingInputs.push('This signing branch needs an explicit simple zero-bonus full-season contract profile.');
  if (!contractSeasons.length) missingInputs.push('Signing requires year-by-year contract terms.');
  const rows = contractSeasons.map((term, index) => {
    const salary = amount(term.salary, term), likely = amount(term.likelyBonus, term), unlikely = amount(term.unlikelyBonus, term);
    const teamOption = boolean(term.teamOption, term), playerOption = boolean(term.playerOption, term);
    if ((term.seasonStartYear ?? term.fromYear) !== seasonStartYear + index) violations.push('Signing term seasons must start now and be consecutive.');
    if ([salary, likely, unlikely].some(value => value === null)) missingInputs.push(`Signing year ${index + 1} salary/bonuses are unresolved.`);
    else if (likely !== 0 || unlikely !== 0) missingInputs.push('Incentive contract criteria and per-bonus change rules require a separate branch.');
    if (teamOption === null || playerOption === null) missingInputs.push(`Signing year ${index + 1} option type is unresolved.`);
    else if (teamOption && playerOption) violations.push('A contract season cannot be both a team and player option.');
    if (mechanism === 'minimum' && (likely !== null && likely > 0 || unlikely !== null && unlikely > 0)) violations.push('Minimum exception contracts cannot include bonuses.');
    if (boolean(term.twoWay, term) !== false) missingInputs.push('Two-way contracts need their own signing branch.');
    return { salary, likely, unlikely, teamOption, playerOption, firstYearCostUsd: salary === null || likely === null || unlikely === null ? null : salary + likely + unlikely };
  });
  const firstCost = rows[0]?.firstYearCostUsd ?? null;
  let minimumCheck = null;
  if (!contractScaleInput) missingInputs.push('All standard signing contracts require a player-specific minimum salary schedule.');
  else {
    minimumCheck = evaluateContractSalaryScale({ scale: contractScaleInput.scale, contractSeasons, input: contractScaleInput });
    violations.push(...minimumCheck.violations); missingInputs.push(...minimumCheck.missingInputs);
  }
  let maximumYears = definition?.maximumYears;
  let annualChangeRate = definition?.annualChangeRate;
  // Article IX's qualifying-veteran prior-team exception also applies when
  // that team has room. Do not reject five years solely because room is used.
  if (mechanism === 'cap-room' && contractSeasons.length > 4) {
    const qualifying = boolean(input.qualifyingVeteranWithPriorTeam, input);
    if (qualifying === true && usable(input.priorTeamCode, input) && String(valueOf(input.priorTeamCode)).toUpperCase() === String(teamCode).toUpperCase()) maximumYears = 5;
    else if (qualifying === null || qualifying === true && (!usable(input.priorTeamCode, input) || !valueOf(input.priorTeamCode))) { maximumYears = 5; missingInputs.push('Five-year room signing needs qualifying-veteran prior-team eligibility.'); }
  }
  if (mechanism === 'cap-room') {
    const priorTeamMatches = usable(input.priorTeamCode, input) && String(valueOf(input.priorTeamCode)).toUpperCase() === String(teamCode).toUpperCase();
    const qualifying = boolean(input.qualifyingVeteranWithPriorTeam, input), early = boolean(input.earlyQualifyingVeteranWithPriorTeam, input);
    if (priorTeamMatches && (qualifying === true || early === true)) annualChangeRate = 0.08;
    else if (qualifying === null || early === null || (qualifying === true || early === true) && (!usable(input.priorTeamCode, input) || !valueOf(input.priorTeamCode))) {
      const exceedsOrdinaryRaise = rows.slice(1).some((row, index) => row.salary !== null && rows[index].salary !== null && rows[0].salary !== null && cents(Math.abs(row.salary - rows[index].salary)) > cents(rows[0].salary * 0.05));
      if (exceedsOrdinaryRaise) { annualChangeRate = 0.08; missingInputs.push('Room raise above 5% needs qualifying/early-qualifying prior-team evidence.'); }
    }
  }
  if (definition && contractSeasons.length > maximumYears) violations.push(`${mechanism} exceeds its maximum ${maximumYears}-season term.`);
  if (definition?.minimumNonOptionYears && rows.filter(row => row.teamOption === false && row.playerOption === false).length < definition.minimumNonOptionYears && rows.every(row => row.teamOption !== null && row.playerOption !== null)) violations.push('Early Bird requires at least two non-option seasons.');
  if (annualChangeRate != null && rows[0]?.salary !== null) for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].salary !== null && rows[index - 1].salary !== null && cents(Math.abs(rows[index].salary - rows[index - 1].salary)) > cents(rows[0].salary * annualChangeRate)) violations.push(`Signing year ${index + 1} exceeds the ${annualChangeRate * 100}% annual change based on first-year salary.`);
  }
  const maxSalary = amount(input.maximumPlayerSalaryUsd, input);
  if (maxSalary === null && mechanism !== 'minimum') missingInputs.push('Player-specific first-year maximum salary is unresolved.');
  if (maxSalary !== null && firstCost !== null && firstCost > maxSalary) violations.push('Signing exceeds the supplied player-specific maximum salary.');
  let firstYearCeilingUsd = maxSalary;
  if (['bird', 'early-bird', 'non-bird'].includes(mechanism)) {
    if (!usable(input.priorTeamCode, input) || !usable(input.rightsClass, input) || !valueOf(input.priorTeamCode) || !valueOf(input.rightsClass)) missingInputs.push('Veteran exception needs resolved prior-team and rights class.');
    else if (String(valueOf(input.priorTeamCode)).toUpperCase() !== String(teamCode).toUpperCase() || valueOf(input.rightsClass) !== mechanism) violations.push('Veteran exception is unavailable to this team or rights class.');
    const renounced = boolean(input.rightsRenounced, input);
    if (renounced === true) violations.push('Renounced veteran rights cannot supply this signing exception.');
    else if (renounced !== false) missingInputs.push('Veteran rights renunciation status is unresolved.');
    if (mechanism !== 'bird') {
      const prior = ['priorRegularSalaryUsd', 'priorLikelyBonusUsd', 'priorUnlikelyBonusUsd'].map(field => amount(input[field], input));
      if (prior.some(value => value === null)) missingInputs.push('Prior regular salary and both prior bonus amounts are required.');
      const priorCeiling = prior.every(value => value !== null) ? prior.reduce((sum, value) => sum + value, 0) * (mechanism === 'early-bird' ? 1.75 : 1.2) : null;
      const comparison = amount(input[mechanism === 'early-bird' ? 'priorAveragePlayerSalaryUsd' : 'currentMinimumAnnualSalaryUsd'], input);
      if (comparison === null) missingInputs.push(`${mechanism} comparison average/minimum salary is unresolved.`);
      let qualifyingOffer = 0;
      if (mechanism === 'non-bird') {
        const restricted = boolean(input.restrictedFreeAgent, input);
        if (restricted === null) { missingInputs.push('Non-Bird restricted-free-agent status is unresolved.'); qualifyingOffer = null; }
        else if (restricted) { qualifyingOffer = amount(input.qualifyingOfferSalaryPlusUnlikelyBonusUsd, input); if (qualifyingOffer === null) missingInputs.push('Restricted Non-Bird required qualifying-offer amount is unresolved.'); }
      }
      firstYearCeilingUsd = priorCeiling === null || comparison === null || qualifyingOffer === null || maxSalary === null ? null
        : Math.min(maxSalary, Math.max(priorCeiling, comparison * (mechanism === 'early-bird' ? 1.05 : 1.2), qualifyingOffer));
    }
  }
  if (mechanism === 'minimum') {
    if (minimumCheck) {
      const check = minimumCheck;
      for (let index = 0; index < rows.length; index += 1) {
        const floor = check.calculations[index]?.salaryFloorUsd;
        if (floor !== undefined && rows[index].salary !== null && rows[index].salary !== floor) violations.push('Minimum exception contracts must equal each applicable minimum, with no bonuses.');
      }
    }
  }
  if (mechanism === 'cap-room') {
    const cap = amount(thresholds.salaryCap), post = amount(postTeamSalaryUsd);
    if (cap === null || post === null) missingInputs.push('Cap-room signing requires resolved post-signing Team Salary and cap.');
    else if (post > cap) violations.push('Cap-room signing would exceed the salary cap.');
  }
  const budgetMechanism = ['non-taxpayer-mle', 'taxpayer-mle', 'room-mle', 'biannual'].includes(mechanism);
  if (!budgetMechanism && input.exceptionId) violations.push('Only a budget-backed signing mechanism may select a signing exception ID.');
  let budgetUse = null;
  if (budgetMechanism) {
    const budget = exceptionBudget, remaining = amount(budget?.remainingAmountAtWindowUsd, budget), used = amount(budget?.usedAmountUsd, budget), original = amount(budget?.originalAmountUsd, budget);
    if (budget?.format !== SIGNING_EXCEPTION_FORMAT || !sourceValid(budget?.source) || budget?.seasonStartYear !== seasonStartYear) missingInputs.push('Signing exception budget/source/season is unresolved.');
    if (budget && (budget.teamCode !== String(teamCode).toUpperCase() || budget.mechanism !== mechanism)) violations.push('Signing exception belongs to another team or mechanism.');
    if (['renounced', 'expired', 'exhausted', 'lost-entitlement'].includes(budget?.status) || budget?.entitlementStatus === 'ineligible' || budget?.timingStatus === 'expired') violations.push('Selected signing exception is unavailable at this window.');
    else if (budget?.status !== 'active' || budget?.entitlementStatus !== 'eligible' || budget?.timingStatus !== 'usable-at-current-window') missingInputs.push('Exception active status, cap entitlement or window-adjusted timing is unresolved.');
    if ([remaining, used, original].some(value => value === null)) missingInputs.push('Signing exception original/used/available amounts are unresolved.');
    else if (used > original || remaining > original - used) violations.push('Signing exception amounts conflict.');
    const thresholdField = { 'non-taxpayer-mle': 'nonTaxpayerMle', 'taxpayer-mle': 'taxpayerMle', 'room-mle': 'roomMle', biannual: 'biannual' }[mechanism];
    const nominal = amount(thresholds[thresholdField]) ?? deriveNominalSigningExceptionAmount({ mechanism, seasonStartYear, salaryCapUsd: thresholds.salaryCap })?.unroundedAmountUsd;
    if (nominal === null || nominal === undefined) missingInputs.push('Selected exception annual ceiling is unresolved.');
    else if (original !== null && original > Math.ceil(nominal)) violations.push('Signing exception original budget exceeds the selected annual ceiling.');
    if (firstCost !== null && remaining !== null && firstCost > remaining) violations.push('Signing exceeds its selected exception remaining balance.');
    if (mechanism !== 'room-mle') {
      const entitlement = input.exceptionEntitlement;
      const excluding = amount(entitlement?.salaryExcludingDeemedExceptionsUsd, entitlement), total = amount(entitlement?.applicableExceptionTotalUsd, entitlement), cap = amount(thresholds.salaryCap);
      if (entitlement?.coverageStatus !== 'complete' || !sourceValid(entitlement?.source) || excluding === null || total === null || cap === null) missingInputs.push('Signing exception requires complete sourced cap-position and aggregate applicable-exception entitlement inputs.');
      else if (excluding < cap && cap - excluding >= total) violations.push('Team has too much cap room to use the selected over-cap signing exception.');
      if (entitlement?.continuousEligibilityStatus === 'ineligible-earlier-in-season') violations.push('Exception lost entitlement earlier in this cap year.');
      else if (entitlement?.continuousEligibilityStatus !== 'resolved-eligible-through-current-window') missingInputs.push('Continuous exception entitlement through the current transaction window is unresolved.');
    }
    firstYearCeilingUsd = remaining === null || maxSalary === null ? null : Math.min(remaining, maxSalary);
    if (teamUsage?.coverageStatus !== 'complete' || !Array.isArray(teamUsage.usedMechanisms)) missingInputs.push('Complete generated or sourced team exception-use state is required.');
    else {
      if (mechanism === 'room-mle' && teamUsage.usedMechanisms.some(value => ['non-taxpayer-mle', 'taxpayer-mle', 'biannual'].includes(value))) violations.push('Room MLE is blocked by earlier use of an incompatible exception.');
      if (mechanism !== 'room-mle' && teamUsage.usedMechanisms.includes('room-mle')) violations.push('Earlier Room MLE use blocks this exception.');
      if (mechanism === 'biannual' && teamUsage.biannualUsedPreviousSeason === true) violations.push('Biannual exception cannot be used in consecutive seasons.');
      else if (mechanism === 'biannual' && teamUsage.biannualUsedPreviousSeason !== false) missingInputs.push('Prior-season biannual usage is unresolved.');
      if (seasonStartYear >= 2024 && ['non-taxpayer-mle', 'biannual'].includes(mechanism) && teamUsage.usedMechanisms.includes('taxpayer-mle')) violations.push('Earlier taxpayer MLE use prohibits this first-apron transaction.');
    }
    budgetUse = { exceptionId: budget?.exceptionId ?? input.exceptionId ?? null, costUsd: firstCost, usedBeforeUsd: used,
      usedAfterUsd: used === null || firstCost === null ? null : used + firstCost, remainingBeforeUsd: remaining,
      remainingAfterUsd: remaining === null || firstCost === null ? null : Math.max(0, remaining - firstCost) };
  }
  if (firstCost !== null && firstYearCeilingUsd !== null && firstCost > firstYearCeilingUsd) violations.push('Signing exceeds its mechanism first-year ceiling.');
  const postApron = amount(postApronTeamSalaryUsd), firstApron = amount(thresholds.firstApron), secondApron = amount(thresholds.secondApron);
  if (definition?.apron) {
    const threshold = definition.apron === 'first-apron' ? firstApron : secondApron;
    if (postApron === null || threshold === null) missingInputs.push('Signing hard-cap check requires post-signing Apron Team Salary and its threshold.');
    else if (postApron > threshold) violations.push(`Signing exceeds its ${definition.apron} hard cap.`);
    hardCapTriggers.push({ level: definition.apron, thresholdUsd: threshold, seasonStartYear, reason: `signing-${mechanism}`, ruleRef: 'VII-2e4' });
  }
  if (mechanism === 'taxpayer-mle') {
    if (firstApron === null || postApron === null) missingInputs.push('Taxpayer MLE use requires first-apron availability check.');
    else if (postApron <= firstApron) violations.push('Taxpayer MLE requires post-use Apron Team Salary above the first apron.');
  }
  return { format: SIGNING_MECHANISM_FORMAT, mechanism, canonicalName, teamCode, seasonStartYear,
    status: violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass',
    violations: [...new Set(violations)], missingInputs: [...new Set(missingInputs)], hardCapTriggers, budgetUse, legalReady: false,
    calculations: { rows, firstYearCostUsd: firstCost, firstYearCeilingUsd, maximumYears: maximumYears ?? null, annualChangeRate: annualChangeRate ?? null, minimumCheck },
    ruleRefs: [definition?.ruleRef, 'VII-5a', 'IX-1', 'VII-2e'].filter(Boolean),
    limitations: ['This bounded zero-bonus full-season screen does not resolve moratorium, roster/consent restrictions, matching offer sheets, daily exception reductions, or next-year apron checks.',
      'NTMLE-to-TPMLE conversion requires an explicit conversion operation; existing first-apron hard caps are not silently removed.'] };
}

export function commitSigningExceptionUse(entry, evaluation, { proposalId } = {}) {
  const use = evaluation?.budgetUse;
  if (evaluation?.status !== 'pass' || entry?.format !== SIGNING_EXCEPTION_FORMAT || !proposalId || use?.exceptionId !== entry.exceptionId) throw new Error('Cannot commit unresolved signing exception use.');
  if ((entry.usageHistory ?? []).some(row => row.proposalId === proposalId)) throw new Error('Signing exception already used for this proposal.');
  if (use.usedBeforeUsd !== entry.usedAmountUsd || use.remainingBeforeUsd !== entry.remainingAmountAtWindowUsd) throw new Error('Signing exception evaluation is stale.');
  return { ...clone(entry), usedAmountUsd: use.usedAfterUsd, remainingAmountAtWindowUsd: use.remainingAfterUsd,
    usageHistory: [...(entry.usageHistory ?? []), { proposalId, mechanism: evaluation.mechanism, canonicalName: evaluation.canonicalName,
      seasonStartYear: evaluation.seasonStartYear, costUsd: use.costUsd, usedAfterUsd: use.usedAfterUsd, remainingAfterUsd: use.remainingAfterUsd }] };
}
