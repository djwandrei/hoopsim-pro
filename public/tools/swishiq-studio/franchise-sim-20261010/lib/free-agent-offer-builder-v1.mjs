import { normalizeCanonicalPlayerName, resolvePlayerByCanonicalName, validateLeagueState } from './simulation-contracts-v1.mjs';
import { SIGNING_MECHANISMS } from './cba-signing-mechanisms-v1.mjs';
import { buildMinimumSalarySchedule, minimumSalaryForContractYear } from './cba-salary-scales-v1.mjs';
import { buildStandardScenarioContractAccounting, calculateTeamCapAccounting } from './cap-accounting-v1.mjs';
import { evaluateFreeAgentTeamFit } from './free-agent-team-targeting-v1.mjs';
import { createFreeAgencyProposal, evaluateFreeAgencySigning } from './free-agency-v1.mjs';

export const FREE_AGENT_PRICING_POLICY = Object.freeze({ desiredYears: 2, maximumCapShare: 0.35,
  capFractionPerWin: 0.035, roundDiscount: 0.08, minimumCoverage: 0.25, minimumFitScore: 0 });
const BAD_STATUS = /unknown|candidate|conflict|unresolved|missing|disputed|invalid|unreported/i;
const clone = value => structuredClone(value);
const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value));
function usable(value) { return ![value?.status, value?.valueStatus].some(status => BAD_STATUS.test(String(status ?? ''))); }
function numeric(raw, parent = null) {
  const value = raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw;
  if (!usable(raw) || !usable(parent) || value == null || value === '' || typeof value === 'boolean') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function atSeason(raw, parent, year) {
  const season = raw?.targetSeasonStartYear ?? raw?.seasonStartYear ?? parent?.targetSeasonStartYear ?? parent?.seasonStartYear;
  return season != null && season !== year || raw?.source?.seasonStartYear != null && raw.source.seasonStartYear !== year
    ? null : numeric(raw, parent);
}
function sourceValid(source) {
  const date = String(source?.retrievedAt ?? source?.generatedAt ?? '').slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  return Boolean(source?.sourceSystem && source?.sourceVersion && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date);
}
function seasonConflict(raw, expected) {
  return [raw?.seasonStartYear, raw?.source?.seasonStartYear].some(year => year != null && year !== expected);
}
export function canonicalNameMapValue(map, canonicalName) {
  const key = normalizeCanonicalPlayerName(canonicalName);
  const matches = Object.entries(map ?? {}).filter(([name]) => normalizeCanonicalPlayerName(name) === key);
  if (matches.length > 1) throw new Error(`Ambiguous canonical-name map for ${canonicalName}.`);
  return matches[0]?.[1];
}

/** Recompute arithmetic only with an explicit complete list of applicable
 * exceptions. Eligibility and continuity still come from supplied evidence. */
export function refreshSigningExceptionEntitlement(state, teamCode, signingRuleInput) {
  const input = clone(signingRuleInput ?? {}), entitlement = input.exceptionEntitlement;
  if (!entitlement?.applicableExceptionIds) return input;
  const ids = entitlement.applicableExceptionIds;
  const team = state.teams.find(row => row.teamCode === teamCode);
  if (!team || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      !ids.includes(input.exceptionId) || entitlement.coverageStatus !== 'complete' ||
      !usable(entitlement) || !sourceValid(entitlement.source) || seasonConflict(entitlement, state.seasonStartYear)) throw new Error('Exception entitlement requires a complete sourced unique applicable-ID list.');
  const balances = ids.map(id => {
    const matches = (team.signingExceptionLedger ?? []).filter(entry => entry.exceptionId === id && entry.seasonStartYear === state.seasonStartYear);
    const entry = matches.length === 1 ? matches[0] : null;
    const remaining = numeric(entry?.remainingAmountAtWindowUsd, entry);
    if (!entry || entry.status !== 'active' || entry.entitlementStatus !== 'eligible' ||
        entry.timingStatus !== 'usable-at-current-window' || remaining === null || remaining < 0 || !sourceValid(entry.source)) {
      throw new Error(`Applicable exception ${id} has unresolved current entitlement/balance.`);
    }
    return { exceptionId: id, remainingAmountUsd: remaining, source: clone(entry.source) };
  });
  const accounting = calculateTeamCapAccounting(state, teamCode);
  const salary = accounting.totals?.teamSalaryUsd;
  const holdValues = (accounting.entries ?? []).filter(entry => entry.kind === 'exception-hold').map(entry => numeric(entry.values?.teamSalaryUsd, entry));
  if (!Number.isFinite(salary) || holdValues.some(value => value === null)) throw new Error('Exception entitlement requires current resolved component Team Salary and exception holds.');
  input.exceptionEntitlement = { ...entitlement,
    salaryExcludingDeemedExceptionsUsd: salary - holdValues.reduce((sum, value) => sum + value, 0),
    applicableExceptionTotalUsd: balances.reduce((sum, value) => sum + value.remainingAmountUsd, 0),
    source: { ...entitlement.source, sourceSystem: 'djhc-current-exception-entitlement',
      sourceVersion: 'djhc-free-agent-offer-builder-v1', sourceClass: 'generated-scenario', seasonStartYear: state.seasonStartYear },
    derivedFromStateRevision: state.revision, balances,
    suppliedArithmetic: { salaryExcludingDeemedExceptionsUsd: entitlement.salaryExcludingDeemedExceptionsUsd ?? null,
      applicableExceptionTotalUsd: entitlement.applicableExceptionTotalUsd ?? null, source: clone(entitlement.source) },
    disclosure: 'Current amounts are regenerated from component state and the explicit applicable-ID list. Supplied eligibility/continuity and list coverage are not inferred.' };
  return input;
}

function pricingFor(player, state, cap, policy, marketRound) {
  const year = state.seasonStartYear, forecast = player.projection ?? player.playerForecast ?? {};
  const explicit = atSeason(player.marketSalaryExpectationUsd, player, year);
  const wins = atSeason(forecast.projectedWins ?? forecast.winsAdded, forecast, year);
  const ratingSeason = player.ratingSeasonStartYear ?? player.completedSeasonStartYear ?? year;
  const rating = ratingSeason === year || ratingSeason === year - 1 ? numeric(player.overallRating, player) : null;
  const basis = explicit !== null ? 'supplied-market-expectation' : wins !== null ? 'contribution-forecast-policy' : rating !== null ? 'provisional-rating-policy' : null;
  let desiredSalaryUsd = explicit ?? (wins !== null ? cap * policy.capFractionPerWin * Math.max(0, wins)
    : rating !== null ? cap * policy.maximumCapShare * clamp((rating - 60) / 35, 0, 1) ** 2 : null);
  if (desiredSalaryUsd !== null) desiredSalaryUsd = Math.min(cap * policy.maximumCapShare,
    Math.max(0, desiredSalaryUsd) * (1 - policy.roundDiscount) ** (marketRound - 1));
  return { basis, desiredSalaryUsd, projectedWins: wins, overallRating: rating,
    source: explicit !== null ? player.marketSalaryExpectationUsd?.source ?? player.source ?? null : forecast.source ?? player.ratingSource ?? null,
    policyVersion: 'djhc-free-agent-pricing-policy-v1', policy: clone(policy), marketRound,
    disclosure: 'Contract prices are editable simulation policy estimates, not calibrated NBA market prices or known player reservation salaries. Later-round discounts represent revised asking prices; explicit reservation utility still governs player choice.' };
}

/** Generate base-compensation contracts using current supplied rights/scales.
 * Contract prices are policy estimates; legal facts are never generated here. */
export function buildFreeAgentOffers({ state, player, team, contexts = [], policy: suppliedPolicy = {}, marketRound = 1, strategyProfile = null } = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'free-agency') throw new Error('Automatic offers require the free-agency window.');
  const policy = { ...FREE_AGENT_PRICING_POLICY, ...suppliedPolicy };
  if (!Number.isInteger(marketRound) || marketRound < 1 || !Number.isInteger(policy.desiredYears) || policy.desiredYears < 1 || policy.desiredYears > 5 ||
      !Number.isFinite(policy.maximumCapShare) || policy.maximumCapShare <= 0 || policy.maximumCapShare > 1 ||
      !Number.isFinite(policy.capFractionPerWin) || policy.capFractionPerWin < 0 ||
      !Number.isFinite(policy.roundDiscount) || policy.roundDiscount < 0 || policy.roundDiscount >= 1 ||
      !Number.isFinite(policy.minimumCoverage) || policy.minimumCoverage < 0 || policy.minimumCoverage > 1 ||
      !Number.isFinite(policy.minimumFitScore) || policy.minimumFitScore < -1 || policy.minimumFitScore > 1) throw new Error('Invalid free-agent pricing policy.');
  if (!Array.isArray(contexts)) throw new Error('Signing contexts must be an array.');
  const identity = resolvePlayerByCanonicalName(state.players, player?.canonicalName ?? player?.name);
  const currentTeam = state.teams.find(row => row.teamCode === String(team?.teamCode ?? '').toUpperCase());
  if (identity.status !== 'resolved' || !currentTeam) throw new Error('Automatic offers require resolved current player and team identity.');
  // The authoritative roster and player snapshot always wins over a stale callback argument.
  player = identity.matches[0]; team = currentTeam;
  if (player.teamCode || player.retired === true || player.rosterStatus === 'retired') throw new Error('Automatic offers require an active unattached player.');
  const cap = numeric(state.rulesReference?.thresholds?.salaryCap, state.rulesReference);
  const missingInputs = [], assessments = [], offers = [];
  const output = pricing => ({ format: 'djhc-free-agent-offer-construction-v1', canonicalName: player.canonicalName,
    teamCode: team.teamCode, status: offers.length ? 'offers-built' : 'no-supported-offer', offers, assessments,
    pricing, missingInputs: [...new Set(missingInputs)], legalReady: false });
  if (!(cap > 0)) { missingInputs.push('current-season salary cap'); return output(null); }
  if (state.rulesReference?.seasonStartYear !== state.seasonStartYear || state.rulesReference?.ruleVersionId !== 'nba-nbpa-cba-2023') {
    missingInputs.push('supported current-season rule reference'); return output(null);
  }
  const pricing = pricingFor(player, state, cap, policy, marketRound);
  if (!usable(player) || BAD_STATUS.test(String(player.identityStatus ?? '')) || pricing.desiredSalaryUsd === null) {
    missingInputs.push('resolved current forecast, market expectation, or rating'); return output(pricing);
  }
  if (!contexts.length) missingInputs.push('supported signing contexts with player salary scales and sourced rule inputs');
  for (const [contextIndex, context] of contexts.entries()) {
    const reject = (reason, details = null) => { assessments.push({ contextIndex, mechanism: context?.mechanism,
      status: 'withheld', reason, ...(details ? { details } : {}) }); };
    const definition = SIGNING_MECHANISMS[context?.mechanism];
    const scaleInput = context?.contractScaleInput, suppliedInput = context?.signingRuleInput ?? {};
    if (!definition || !usable(context) || !usable(suppliedInput) || !sourceValid(suppliedInput.source) ||
        scaleInput?.contractType !== 'full-season' || scaleInput.scale?.seasonStartYear !== state.seasonStartYear ||
        !Array.isArray(scaleInput.yearsOfServiceByContractYear)) { reject('Missing, disputed, or unsupported signing context/scale/source.'); continue; }
    if (suppliedInput.seasonStartYear != null && suppliedInput.seasonStartYear !== state.seasonStartYear ||
        suppliedInput.teamCode && String(suppliedInput.teamCode).toUpperCase() !== team.teamCode ||
        suppliedInput.canonicalName && normalizeCanonicalPlayerName(suppliedInput.canonicalName) !== normalizeCanonicalPlayerName(player.canonicalName)) {
      reject('Signing context identity/team/season conflicts with current state.'); continue;
    }
    const currentFields = ['maximumPlayerSalaryUsd', 'currentMinimumAnnualSalaryUsd', 'qualifyingOfferSalaryPlusUnlikelyBonusUsd', 'exceptionEntitlement'];
    const priorFields = ['priorRegularSalaryUsd', 'priorLikelyBonusUsd', 'priorUnlikelyBonusUsd', 'priorAveragePlayerSalaryUsd'];
    const entitlement = suppliedInput.exceptionEntitlement;
    if (seasonConflict(suppliedInput, state.seasonStartYear) ||
        currentFields.some(field => seasonConflict(suppliedInput[field], state.seasonStartYear) ||
          suppliedInput[field]?.source && !sourceValid(suppliedInput[field].source)) ||
        priorFields.some(field => seasonConflict(suppliedInput[field], state.seasonStartYear - 1)) ||
        ['salaryExcludingDeemedExceptionsUsd', 'applicableExceptionTotalUsd', 'continuousEligibilityStatus'].some(field => seasonConflict(entitlement?.[field], state.seasonStartYear))) {
      reject('Nested signing evidence has conflicting season/source metadata.'); continue;
    }
    const desiredYears = context.contractYears ?? policy.desiredYears;
    if (!Number.isInteger(desiredYears) || desiredYears < 1 || desiredYears > 5) throw new Error('Requested contract years must be 1–5.');
    const years = Math.min(desiredYears, definition.maximumYears, scaleInput.yearsOfServiceByContractYear.length);
    if (!years || definition.minimumNonOptionYears && years < definition.minimumNonOptionYears) { reject('Insufficient supported non-option contract years.'); continue; }
    let schedule;
    const contractScaleInput = { ...clone(scaleInput), yearsOfServiceByContractYear: scaleInput.yearsOfServiceByContractYear.slice(0, years) };
    try { schedule = buildMinimumSalarySchedule(contractScaleInput.scale, contractScaleInput); }
    catch (error) { reject('Minimum salary schedule is unavailable.', error.message); continue; }
    const maximum = numeric(suppliedInput.maximumPlayerSalaryUsd, suppliedInput);
    if (context.mechanism !== 'minimum' && !(maximum >= 0)) { reject('Player-specific maximum salary is unresolved.'); continue; }
    const willingness = context.maximumFirstYearSalaryUsd == null ? Infinity : numeric(context.maximumFirstYearSalaryUsd, context);
    if (willingness === null || willingness < 0) { reject('Team salary willingness is unresolved.'); continue; }
    const source = { ...clone(suppliedInput.source), sourceSystem: 'djhc-free-agent-market',
      sourceVersion: 'djhc-free-agent-offer-builder-v1', sourceClass: 'generated-scenario', seasonStartYear: state.seasonStartYear };
    let currentInput;
    try { currentInput = refreshSigningExceptionEntitlement(state, team.teamCode, suppliedInput); }
    catch (error) { reject('Current exception entitlement cannot be reconciled.', error.message); continue; }
    const signingRuleInput = { ...currentInput, canonicalName: player.canonicalName,
      teamCode: team.teamCode, seasonStartYear: state.seasonStartYear, contractProfile: 'simple-zero-bonus-full-season' };
    const floor = context.mechanism === 'minimum' ? schedule.seasons[0].salaryFloorUsd
      : Math.max(...schedule.seasons.map(row => row.salaryFloorUsd));
    const makeOffer = salary => {
      const contractSeasons = schedule.seasons.map((row, index) => {
        const baseSalary = context.mechanism === 'minimum' ? row.salaryFloorUsd : salary;
        const yearsOfService = contractScaleInput.yearsOfServiceByContractYear[index];
        const topUp = yearsOfService < 2 ? { applicable: true, yearsOfServiceAtSigning: yearsOfService,
          signedAsFreeAgent: true, twoYearsMinimumSalaryUsd: minimumSalaryForContractYear(contractScaleInput.scale,
            { yearsOfService: 2, contractYear: index + 1 }).unroundedAmountUsd } : { applicable: false };
        return buildStandardScenarioContractAccounting({ seasonStartYear: row.seasonStartYear, status: 'generated-scenario',
          salary: baseSalary, guaranteedCash: baseSalary, likelyBonus: 0, unlikelyBonus: 0, earnedBonusUsd: 0,
          twoWay: false, teamOption: false, playerOption: false, accountingProfile: 'standard-guaranteed-no-adjustments',
          minimumFreeAgentTopUp: topUp, source }).term;
      });
      const forecast = player.projection ?? player.playerForecast ?? {};
      const fit = evaluateFreeAgentTeamFit({ state, teamCode: team.teamCode, candidate: { ...player, contractSeasons }, profile: strategyProfile });
      const roleValue = fit.components?.nearTermFit?.value;
      const roleMinutes = fit.components?.nearTermFit?.evidence?.map(row => row.vacancyMinutes).filter(Number.isFinite);
      const projected = atSeason(forecast.projectedMinutes, forecast, state.seasonStartYear);
      const projectedMinutes = projected === null ? null : roleMinutes?.length
        ? Math.min(projected, roleMinutes.reduce((sum, value) => sum + value, 0)) : null;
      const totalVacancy = roleMinutes?.reduce((sum, value) => sum + value, 0) ?? 0;
      const projectedMinutesByPosition = projectedMinutes === null ? null : Object.fromEntries(
        (fit.components?.nearTermFit?.evidence ?? []).filter(row => row.group && Number.isFinite(row.vacancyMinutes))
          .map(row => [row.group, totalVacancy > 0 ? projectedMinutes * row.vacancyMinutes / totalVacancy : 0]));
      return { offerId: `auto-${state.seasonStartYear}-${state.revision}-${marketRound}-${contextIndex}-${team.teamCode}-${normalizeCanonicalPlayerName(player.canonicalName)}-${salary}`,
        teamCode: team.teamCode, salaryCapUsd: cap, contractSeasons, contractScaleInput,
        signingMechanism: context.mechanism, signingRuleInput, projectedMinutes, projectedMinutesByPosition,
        teamProjectedWins: atSeason(team.projection?.projectedWins, team.projection, state.seasonStartYear),
        teamScheduledGames: team.scheduledGames ?? 82, playerRoleFit: roleValue == null ? null : clamp((roleValue + 1) / 2, 0, 1),
        pricing: clone(pricing), sourceRefs: [source, clone(suppliedInput.source)],
        assumptions: ['Generated, fully guaranteed, zero-bonus, no-option base-compensation offer.',
          'Contract price, term length, and role estimates are configurable simulator policies. Signing rights are supplied and checked separately.',
          'Special minimum reimbursements and complete signing-calendar/roster restrictions remain outside this accounting profile.'],
        teamTargeting: fit };
    };
    // The shared preview handles replaced cap holds, incomplete-roster charges,
    // exception holds and hard caps; do not duplicate those formulas here.
    const probe = makeOffer(floor);
    const probeEvaluation = evaluateFreeAgencySigning(state, createFreeAgencyProposal({ state, player, offer: probe }));
    const screen = probeEvaluation.capCalculations?.signingMechanismEvaluations?.[0];
    let capacity = Math.min(willingness, maximum ?? Infinity);
    if (context.mechanism === 'minimum') capacity = Math.min(capacity, floor);
    else if (Number.isFinite(screen?.calculations?.firstYearCeilingUsd)) capacity = Math.min(capacity, screen.calculations.firstYearCeilingUsd);
    const after = probeEvaluation.capCalculations?.componentAccounting?.afterByTeam?.[team.teamCode]?.totals;
    if (context.mechanism === 'cap-room') {
      if (!Number.isFinite(after?.teamSalaryUsd)) { reject('Cap room requires complete current component payroll.', probeEvaluation.missingInputs); continue; }
      capacity = Math.min(capacity, cap - after.teamSalaryUsd + floor);
    }
    if (definition.apron) {
      const apron = numeric(state.rulesReference.thresholds[definition.apron === 'first-apron' ? 'firstApron' : 'secondApron']);
      if (apron !== null && Number.isFinite(after?.apronTeamSalaryUsd)) capacity = Math.min(capacity, apron - after.apronTeamSalaryUsd + floor);
    }
    if (!Number.isFinite(capacity) || capacity < floor || screen?.status === 'fail') {
      reject('No affordable supported salary at the minimum contract floor.', probeEvaluation); continue;
    }
    const fit = probe.teamTargeting;
    if (fit.status === 'excluded' || fit.score === null || fit.score < policy.minimumFitScore || fit.coverage < policy.minimumCoverage) {
      reject('Insufficient team contribution/fit evidence.', fit); continue;
    }
    const fitAdjustment = clamp(1 + 0.2 * fit.score, 0.8, 1.2);
    const salary = Math.floor(clamp(pricing.desiredSalaryUsd * fitAdjustment, floor, capacity));
    const offer = makeOffer(salary);
    const evaluation = evaluateFreeAgencySigning(state, createFreeAgencyProposal({ state, player, offer }));
    const executable = evaluation.status === 'confirmed-legal' || evaluation.status === 'provisional' && state.mode === 'provisional-sandbox';
    assessments.push({ contextIndex, mechanism: context.mechanism, status: executable ? 'supported-offer' : 'blocked-rules',
      floorUsd: floor, capacityUsd: capacity, firstYearSalaryUsd: salary, evaluation });
    if (executable) offers.push({ ...offer, legalityStatus: evaluation.status });
  }
  return output(pricing);
}

/** Rebuild each offer from current state on every invocation; no balance cache. */
export function createAutomaticFreeAgentOfferBuilder({ contextProvider, policy = {} } = {}) {
  if (contextProvider != null && typeof contextProvider !== 'function') throw new Error('Signing context provider must be a function.');
  return ({ state, player, team, marketRound = 1, strategyProfile = team?.strategyProfile ?? 'balanced' }) => {
    const contexts = contextProvider ? contextProvider({ state: clone(state), player: clone(player), team: clone(team), marketRound,
      strategyProfile: clone(strategyProfile) })
      : canonicalNameMapValue(team.freeAgentSigningContextsByPlayer, player.canonicalName) ?? [];
    return buildFreeAgentOffers({ state, player, team, contexts, policy, marketRound, strategyProfile }).offers;
  };
}
