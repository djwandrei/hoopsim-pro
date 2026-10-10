import {
  buildExactNameIndex,
  normalizeCanonicalPlayerName,
  resolvePlayerByCanonicalName,
} from './simulation-contracts-v1.mjs';
import { deriveExpandedTpeFixedAllowance, evaluateCbaSalaryMatching } from './cba-salary-matching-v1.mjs';

export const CBA_TRADE_RULE_ENGINE_FORMAT = 'djhc-cba-trade-rule-engine-v1';

const NBA_2023_CBA_SOURCE = Object.freeze({
  sourceId: 'nba-nbpa-signed-2023-cba',
  sourceVersion: '2023 signed CBA; Article VII Sections 2(e), 6(j), and 8',
  sourceClass: 'official-nbpa-cba',
  sourceUrl: 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf',
});

export const CBA_TRADE_RULE_COVERAGE_V1 = Object.freeze({
  ruleVersionId: 'nba-nbpa-cba-2023',
  supportedPaths: Object.freeze(['cap-room', 'standard-tpe', 'expanded-tpe', 'stored-standard-tpe']),
  conditionallySupportedPaths: Object.freeze(['aggregated-standard-tpe', 'transition-tpe']),
  unsupportedPaths: Object.freeze(['legacy-pre-2023', 'sign-and-trade', 'multi-year-apron-projection', 'draft-pick-rights']),
  source: NBA_2023_CBA_SOURCE,
  rules: Object.freeze({
    salaryMatching: 'VII-6(j)(1)-(4)',
    apronRestrictions: 'VII-2(e)(2)-(5)',
    playerTradeRestrictions: 'VII-8(b)-(e)',
    draftPickPenalty: 'VII-2(f)',
  }),
});

const clone = value => structuredClone(value);
const isFiniteAmount = value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' &&
  Number.isFinite(Number(value)) && Number(value) >= 0;

function evidenceValue(value) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value ?? null;
}

function usableAmount(term, field, override = undefined) {
  const raw = override === undefined ? term?.[field] : override;
  const value = evidenceValue(raw);
  const status = override === undefined ? fieldStatus(term, field) : raw?.valueStatus ?? 'scenario-supplied';
  if (value === null || value === undefined || value === '' || typeof value === 'boolean' ||
      ['conflict', 'unreported'].includes(status) || String(status).startsWith('unknown')) return null;
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

function fieldStatus(term, field) {
  const value = term?.[field];
  return value && typeof value === 'object' ? value.valueStatus ?? value.status ?? term?.status ?? 'unknown' : term?.status ?? (term ? 'unannotated' : 'unknown');
}

function fieldSource(term, field) {
  const value = term?.[field];
  return (value && typeof value === 'object' ? value.source : null) ?? term?.fieldProvenance?.[field] ?? term?.source ?? null;
}

function isVersionedAndDated(source) {
  const retrievedAt = source?.retrievedAt ?? source?.retrievalDate;
  return Boolean(String(source?.sourceSystem ?? '').trim() && String(source?.sourceVersion ?? '').trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(retrievedAt ?? '')) && Number.isFinite(Date.parse(String(retrievedAt))));
}

function isVersionedScenarioSource(source, seasonStartYear) {
  return source?.sourceClass === 'generated-scenario' &&
    Boolean(String(source.sourceSystem ?? source.sourceId ?? '').trim()) &&
    Boolean(String(source.sourceVersion ?? '').trim()) &&
    Number(source.seasonStartYear) === seasonStartYear;
}

function evidenceForField(term, field, override = undefined, seasonStartYear = null) {
  const raw = override === undefined ? term?.[field] : override;
  const value = evidenceValue(raw);
  const status = String(raw && typeof raw === 'object'
    ? raw.valueStatus ?? raw.status ?? term?.status
    : override === undefined ? fieldStatus(term, field) : 'scenario-supplied').toLowerCase();
  const source = (raw && typeof raw === 'object' ? raw.source : null) ??
    (override === undefined ? fieldSource(term, field) : null);
  const scenario = status === 'generated-scenario' || status === 'scenario-supplied' ||
    source?.sourceClass === 'generated-scenario';
  const resolvedStatus = ['observed', 'verified', 'resolved', 'reconciled'].includes(status) ||
    ['verified-absent', 'resolved-absent', 'not-applicable'].includes(status);
  const valid = scenario
    ? isVersionedScenarioSource(source, seasonStartYear)
    : resolvedStatus && isVersionedAndDated(source);
  return { value, status, source, scenario, valid };
}

function payrollEvidence(team, seasonStartYear, ruleVersionId) {
  const payroll = team?.payrollState ?? {};
  const refs = payroll.sourceRefs ?? [];
  const scenarioRefs = [payroll.source, ...(Array.isArray(refs) ? refs : [])];
  const scenario = ['generated-scenario', 'scenario-calculated', 'provisional-scenario'].includes(String(payroll.status ?? '').toLowerCase()) ||
    scenarioRefs.some(source => source?.sourceClass === 'generated-scenario');
  const scenarioEvidenceComplete = !scenario || scenarioRefs.some(source => isVersionedScenarioSource(source, seasonStartYear));
  const valid = Number(payroll.seasonStartYear) === seasonStartYear &&
    payroll.rulesVersionId === ruleVersionId && Array.isArray(refs) && refs.length > 0 &&
    (payroll.status === 'reconciled' || scenario) && scenarioEvidenceComplete;
  return { valid, scenario, sourceRefs: refs };
}

function termForSeason(player, seasonStartYear) {
  return (player?.contractSeasons ?? player?.contract?.seasons ?? [])
    .find(term => Number(term.seasonStartYear ?? term.fromYear) === seasonStartYear) ?? null;
}

function teamByCode(state, code) {
  return (state?.teams ?? []).find(team => String(team.teamCode ?? '').toUpperCase() === String(code ?? '').toUpperCase()) ?? null;
}

function playerByName(state, name) {
  const resolution = resolvePlayerByCanonicalName(buildExactNameIndex(state?.players ?? []), name);
  return resolution.status === 'resolved' ? resolution.matches[0] : null;
}

function payrollAmount(payroll) {
  if (Object.hasOwn(payroll ?? {}, 'totalTeamSalaryUsd')) return usableAmount(payroll, 'totalTeamSalaryUsd');
  const component = payroll?.components ?? {};
  for (const value of [
    payroll?.totalTeamSalaryUsd,
    payroll?.teamSalaryUsd,
    payroll?.teamSalary,
    payroll?.totalSalaryUsd,
    component.totalTeamSalaryUsd,
    component.teamSalaryUsd,
    component.teamSalary,
    component.totalSalary,
    component.payroll,
  ]) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function capHitForLeg(state, proposal, leg) {
  if (leg.assetType && leg.assetType !== 'player') return { value: 0, status: 'not-applicable', source: null };
  const player = playerByName(state, leg.canonicalName ?? leg.playerName);
  const term = leg.contractTerms ?? proposal.contractTerms ?? termForSeason(player, proposal.seasonStartYear);
  if (!term) return { value: null, status: 'missing-term', source: null };
  const raw = term.capHit ?? term.capHitUsd;
  const value = evidenceValue(raw);
  const status = fieldStatus(term, 'capHit');
  const usable = value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' &&
    !['conflict', 'unreported'].includes(status) && !status.startsWith('unknown');
  return {
    value: usable && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null,
    status,
    source: fieldSource(term, 'capHit'),
  };
}

function sourceRefsFromState(state, profile) {
  return [
    ...(profile?.sourceRefs ?? []),
    ...(state?.rulesReference?.sourceRefs ?? []),
  ].filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeProfile(profile, state) {
  if (profile?.format === 'djhc-cba-rule-profile-v1') return profile;
  const reference = state?.rulesReference ?? {};
  return {
    format: 'djhc-cba-rule-profile-v1',
    status: reference.status === 'complete' ? 'bounded-screen' : reference.status ?? 'unknown',
    legalDecisionStatus: reference.legalDecisionStatus ?? 'incomplete',
    seasonStartYear: reference.seasonStartYear ?? state?.seasonStartYear ?? null,
    ruleVersionId: reference.ruleVersionId ?? null,
    sourceRefs: reference.sourceRefs ?? [],
    ruleRefs: reference.ruleRefs ?? [],
    thresholds: reference.thresholds ?? null,
    missingInputs: reference.missingInputs ?? [],
  };
}

/**
 * A conservative, deterministic screen for the transaction engine. It can
 * reject direct contradictions and calculate cap-hit movement when fields are
 * present, but it never labels a move legally confirmed without a complete
 * salary-matching, exception, restriction, and reconciled simulation-state ruleset.
 */
export function createCbaTradeRuleEngine({ profile = null, allowScenarioProvenance = false } = {}) {
  return {
    format: CBA_TRADE_RULE_ENGINE_FORMAT,
    evaluate({ state, proposal, capAccountingPreview = null, storedTpeEvaluations = {} }) {
      const selected = normalizeProfile(profile, state);
      const violations = [];
      const missingInputs = [...(selected.missingInputs ?? [])];
      const evaluatedRuleRefs = [...(selected.ruleRefs ?? []), 'VII-2(e)(2)-(5)', 'VII-6(j)(1)-(4)', 'VII-8(b)-(e)'];
      const touchedTeams = new Set();
      const teamMovement = new Map();
      const legCalculations = [];
      const playerKeys = new Set();
      let capHitInputsComplete = true;
      let tradeSalaryInputsComplete = true;
      let apronInputsComplete = true;
      const scenarioInputNames = [];
      const scenarioAllowed = allowScenarioProvenance && state?.mode === 'provisional-sandbox';

      if (selected.seasonStartYear !== proposal.seasonStartYear) {
        violations.push(`CBA profile season ${selected.seasonStartYear ?? 'unknown'} does not match transaction season ${proposal.seasonStartYear}.`);
      }
      if (!selected.ruleVersionId) missingInputs.push('No season-specific CBA rule version is selected.');
      if (!selected.thresholds) missingInputs.push('No official league threshold row is selected for this season.');
      if (!selected.sourceRefs?.length) missingInputs.push('CBA profile has no source references.');

      const addTeamMovement = (code, direction, amount) => {
        if (!code) return;
        const normalized = String(code).toUpperCase();
        touchedTeams.add(normalized);
        const row = teamMovement.get(normalized) ?? { outgoingCapHitUsd: 0, incomingCapHitUsd: 0, outgoingAssets: 0, incomingAssets: 0,
          outgoingTradeSalaryUsd: 0, incomingTradeSalaryUsd: 0, outgoingApronCapHitUsd: 0, incomingApronCapHitUsd: 0,
          outgoingPlayerCount: 0, incomingPlayerCount: 0 };
        row[direction === 'outgoing' ? 'outgoingCapHitUsd' : 'incomingCapHitUsd'] += amount;
        row[direction === 'outgoing' ? 'outgoingAssets' : 'incomingAssets'] += 1;
        teamMovement.set(normalized, row);
      };

      for (const leg of proposal.legs ?? []) {
        const from = leg.fromTeamCode ? String(leg.fromTeamCode).toUpperCase() : null;
        const to = leg.toTeamCode ? String(leg.toTeamCode).toUpperCase() : null;
        if (from) touchedTeams.add(from);
        if (to) touchedTeams.add(to);
        if (proposal.kind === 'trade' && from && to && from === to) violations.push(`Trade leg sends and receives from the same team ${from}.`);
        if ((proposal.kind === 'trade' && !from) || (proposal.kind === 'trade' && !to)) {
          missingInputs.push('Trade player/pick legs require both sending and receiving teams.');
        }
        if ((leg.assetType ?? 'player') === 'player') {
          const player = playerByName(state, leg.canonicalName ?? leg.playerName);
          const key = normalizeCanonicalPlayerName(player?.canonicalName ?? leg.canonicalName ?? leg.playerName);
          if (key && playerKeys.has(key)) violations.push(`Player ${player?.canonicalName ?? leg.canonicalName ?? leg.playerName} appears more than once in the proposal.`);
          if (key) playerKeys.add(key);
          if (!player) {
            missingInputs.push(`No exact player state is available for ${leg.canonicalName ?? leg.playerName ?? '(unnamed)'}.`);
            capHitInputsComplete = false;
            continue;
          }
          const term = leg.contractTerms ?? proposal.contractTerms ?? termForSeason(player, proposal.seasonStartYear);
          if (!term) {
            missingInputs.push(`${player.canonicalName} has no contract term for ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
            capHitInputsComplete = false;
            continue;
          }
          const requiredEvidenceFields = ['capHit', 'tradeSalaryOutgoing', 'tradeSalaryIncoming', 'apronCapHit',
            'tradeEligibility', 'tradeRestriction', 'noTradeClause'];
          const tradeEvidence = Object.fromEntries(requiredEvidenceFields.map(field => [field,
            evidenceForField(term, field, Object.hasOwn(leg, field) ? leg[field] : undefined, proposal.seasonStartYear)]));
          for (const field of requiredEvidenceFields) {
            const evidence = tradeEvidence[field];
            const booleanField = ['tradeEligibility', 'tradeRestriction', 'noTradeClause'].includes(field);
            const validValue = booleanField
              ? typeof evidence.value === 'boolean' || evidence.value === null && ['verified-absent', 'resolved-absent', 'not-applicable'].includes(evidence.status)
              : isFiniteAmount(evidence.value);
            if (!evidence.valid || !validValue || evidence.scenario && !scenarioAllowed) {
              missingInputs.push(`${player.canonicalName} ${field} is not resolved with season-matched, versioned provenance.`);
            }
            if (evidence.scenario) scenarioInputNames.push(`${player.canonicalName}.${field}`);
          }
          const eligibility = tradeEvidence.tradeEligibility;
          const restriction = tradeEvidence.tradeRestriction;
          const noTradeClause = tradeEvidence.noTradeClause;
          if (proposal.kind === 'trade' && eligibility.valid && eligibility.value === false) violations.push(`${player.canonicalName} is explicitly marked trade-ineligible.`);
          if (proposal.kind === 'trade' && (restriction.value === true || noTradeClause.value === true)) {
            const consentRaw = term.tradeConsentStatus ?? leg.tradeConsentStatus;
            const consentTerm = { ...term, tradeConsentStatus: consentRaw,
              fieldProvenance: { ...(term.fieldProvenance ?? {}),
                tradeConsentStatus: fieldSource(term, 'tradeConsentStatus') ?? leg.tradeConsentSource ?? null } };
            const consentEvidence = evidenceForField(consentTerm, 'tradeConsentStatus', undefined, proposal.seasonStartYear);
            const consentValue = String(consentEvidence.value ?? '').toLowerCase();
            if (!consentEvidence.valid || !['approved', 'waived', 'not-required'].includes(consentValue) ||
                consentEvidence.scenario && !scenarioAllowed) {
              missingInputs.push(`${player.canonicalName} trade restriction or no-trade clause requires sourced, resolved consent.`);
            }
            if (consentEvidence.scenario) scenarioInputNames.push(`${player.canonicalName}.tradeConsentStatus`);
          }
          const capHit = capHitForLeg(state, proposal, leg);
          if (capHit.value === null) {
            capHitInputsComplete = false;
            missingInputs.push(`${player.canonicalName} has no usable season cap-hit value; source salary cannot be silently substituted.`);
          } else {
            if (from) addTeamMovement(from, 'outgoing', capHit.value);
            if (to) addTeamMovement(to, 'incoming', capHit.value);
          }
          const outgoingTradeSalaryUsd = usableAmount(term, 'tradeSalaryOutgoing', leg.tradeSalaryOutgoing);
          const incomingTradeSalaryUsd = usableAmount(term, 'tradeSalaryIncoming', leg.tradeSalaryIncoming);
          const apronCapHitUsd = usableAmount(term, 'apronCapHit', leg.apronCapHit);
          for (const [code, direction, tradeSalary] of [[from, 'outgoing', outgoingTradeSalaryUsd], [to, 'incoming', incomingTradeSalaryUsd]]) {
            if (!code) continue;
            if (!teamMovement.has(code)) addTeamMovement(code, direction, 0);
            const movement = teamMovement.get(code);
            movement[`${direction}PlayerCount`] += 1;
            if (tradeSalary === null) tradeSalaryInputsComplete = false;
            else movement[`${direction}TradeSalaryUsd`] += tradeSalary;
            if (apronCapHitUsd === null) apronInputsComplete = false;
            else movement[`${direction}ApronCapHitUsd`] += apronCapHitUsd;
          }
          legCalculations.push({ canonicalName: player.canonicalName, fromTeamCode: from, toTeamCode: to, capHitUsd: capHit.value, capHitStatus: capHit.status, capHitSource: capHit.source,
            outgoingTradeSalaryUsd, incomingTradeSalaryUsd, apronCapHitUsd });
        } else {
          if (from) addTeamMovement(from, 'outgoing', 0);
          if (to) addTeamMovement(to, 'incoming', 0);
        }
      }

      if (!['trade', 'free-agent-signing', 'roster-move', 'draft-selection'].includes(proposal.kind)) {
        violations.push(`Unsupported proposal kind ${proposal.kind}.`);
      }
      if (proposal.kind === 'trade' && teamMovement.size < 2) violations.push('A trade must touch at least two distinct teams.');

      const resultingPayrollByTeam = {};
      const teamCalculations = {};
      const salaryMatchingByTeam = {};
      for (const teamCode of touchedTeams) {
        const team = teamByCode(state, teamCode);
        if (!team) {
          violations.push(`Team ${teamCode} is absent from LeagueState.`);
          continue;
        }
        const payrollEvidenceStatus = payrollEvidence(team, proposal.seasonStartYear, selected.ruleVersionId);
        if (!payrollEvidenceStatus.valid || payrollEvidenceStatus.scenario && !scenarioAllowed) {
          missingInputs.push(`${teamCode} requires reconciled, season-matched payroll provenance for the selected rule version.`);
        }
        if (payrollEvidenceStatus.scenario) scenarioInputNames.push(`${teamCode}.payrollState`);
        const componentBefore = capAccountingPreview?.beforeByTeam?.[teamCode];
        const componentAfter = capAccountingPreview?.afterByTeam?.[teamCode];
        const componentOutgoing = capAccountingPreview?.afterOutgoingByTeam?.[teamCode];
        const currentPayrollUsd = componentBefore ? componentBefore.totals.teamSalaryUsd : payrollAmount(team.payrollState);
        const movement = teamMovement.get(teamCode) ?? { outgoingCapHitUsd: 0, incomingCapHitUsd: 0, outgoingAssets: 0, incomingAssets: 0 };
        const postPayrollUsd = componentAfter ? componentAfter.totals.teamSalaryUsd : currentPayrollUsd === null || !capHitInputsComplete ? null : currentPayrollUsd - movement.outgoingCapHitUsd + movement.incomingCapHitUsd;
        const currentApronSalaryUsd = componentBefore ? componentBefore.totals.apronTeamSalaryUsd : usableAmount(team.payrollState, 'apronTeamSalaryUsd');
        const postApronSalaryUsd = componentAfter ? componentAfter.totals.apronTeamSalaryUsd : currentApronSalaryUsd === null || !apronInputsComplete ? null
          : currentApronSalaryUsd - movement.outgoingApronCapHitUsd + movement.incomingApronCapHitUsd;
        if (postPayrollUsd !== null && postPayrollUsd < 0) violations.push(`${teamCode} resulting team salary would be negative.`);
        teamCalculations[teamCode] = {
          currentPayrollUsd,
          outgoingCapHitUsd: movement.outgoingCapHitUsd,
          incomingCapHitUsd: movement.incomingCapHitUsd,
          resultingPayrollUsd: postPayrollUsd,
          currentApronSalaryUsd,
          resultingApronSalaryUsd: postApronSalaryUsd,
          resultingTaxSalaryUsd: componentAfter?.totals.taxTeamSalaryUsd ?? null,
          thresholdDistances: selected.thresholds && postPayrollUsd !== null ? {
            salaryCap: selected.thresholds.salaryCap == null ? null : postPayrollUsd - Number(selected.thresholds.salaryCap),
            taxLevel: selected.thresholds.taxLevel == null || componentAfter?.totals.taxTeamSalaryUsd == null ? null : componentAfter.totals.taxTeamSalaryUsd - Number(selected.thresholds.taxLevel),
            firstApron: selected.thresholds.firstApron == null || postApronSalaryUsd === null ? null : postApronSalaryUsd - Number(selected.thresholds.firstApron),
            secondApron: selected.thresholds.secondApron == null || postApronSalaryUsd === null ? null : postApronSalaryUsd - Number(selected.thresholds.secondApron),
          } : null,
          status: postPayrollUsd === null ? 'missing-current-payroll' : 'screen-calculated',
        };
        if (proposal.kind === 'trade') {
          const matchingPath = proposal.salaryMatchingPathsByTeam?.[teamCode] ?? proposal.salaryMatchingPath ?? team.payrollState?.salaryMatchingPath ?? null;
          const allowance = deriveExpandedTpeFixedAllowance({
            seasonStartYear: proposal.seasonStartYear,
            salaryCapUsd: selected.thresholds?.salaryCap,
          });
          const matching = matchingPath === 'stored-standard-tpe' ? storedTpeEvaluations[teamCode] ?? {
            status: 'unknown', violations: [], missingInputs: ['No stored TPE ledger use was supplied.'], hardCapTriggers: [] } : evaluateCbaSalaryMatching({
            seasonStartYear: proposal.seasonStartYear,
            ruleVersionId: selected.ruleVersionId,
            outgoingSalaryUsd: tradeSalaryInputsComplete ? movement.outgoingTradeSalaryUsd : null,
            incomingSalaryUsd: tradeSalaryInputsComplete ? movement.incomingTradeSalaryUsd : null,
            preTradeTeamSalaryUsd: currentPayrollUsd,
            postTradeTeamSalaryUsd: postPayrollUsd,
            postTradeApronTeamSalaryUsd: postApronSalaryUsd,
            outgoingPlayerCount: movement.outgoingPlayerCount,
            isSimultaneous: proposal.isSimultaneous ?? true,
            capRoomAfterOutgoingUsd: componentOutgoing ? componentOutgoing.totals.teamSalaryUsd === null || selected.thresholds?.salaryCap == null ? null
              : Number(selected.thresholds.salaryCap) - componentOutgoing.totals.teamSalaryUsd
              : currentPayrollUsd === null || !capHitInputsComplete || selected.thresholds?.salaryCap == null ? null
              : Number(selected.thresholds.salaryCap) - currentPayrollUsd + movement.outgoingCapHitUsd,
            salaryCapUsd: selected.thresholds?.salaryCap,
            firstApronUsd: selected.thresholds?.firstApron,
            secondApronUsd: selected.thresholds?.secondApron,
            transactionPath: matchingPath,
            fixedAllowanceUsd: allowance.value,
          });
          salaryMatchingByTeam[teamCode] = matching;
          evaluatedRuleRefs.push(...(matching.ruleRefs ?? []));
          teamCalculations[teamCode].salaryMatching = matching;
          if (matching.status === 'fail') violations.push(...matching.violations);
          if (matching.status === 'unknown') missingInputs.push(...matching.missingInputs);
          if (matchingPath === 'stored-standard-tpe' && matching.status === 'pass') {
            if (matching.evidenceBasis === 'generated-scenario') scenarioInputNames.push(`${teamCode}.storedStandardTpe`);
            else if (matching.evidenceBasis !== 'resolved-source-evidence' || matching.legalReady !== true) {
              missingInputs.push(`${teamCode} stored TPE passed its arithmetic screen without complete source-evidence readiness.`);
            }
          }
          const aggregationRequired = ['aggregated-standard-tpe', 'transition-tpe'].includes(matchingPath) ||
            ['expanded-tpe'].includes(matchingPath) && movement.outgoingPlayerCount > 1;
          if (aggregationRequired) {
            const assessment = proposal.aggregateRuleAssessment;
            if (assessment?.status === 'fail') violations.push(...(assessment.violations ?? ['CBA aggregation rule assessment failed.']));
            else if (assessment?.status !== 'pass' || Number(assessment.seasonStartYear) !== proposal.seasonStartYear ||
                !assessment.ruleVersionId || assessment.ruleVersionId !== selected.ruleVersionId ||
                !Array.isArray(assessment.ruleRefs) || assessment.ruleRefs.length === 0 ||
                !Array.isArray(assessment.sourceRefs) || assessment.sourceRefs.length === 0) {
              missingInputs.push(`${teamCode} salary aggregation requires a sourced, season-matched Article VII §6(j)(4) eligibility assessment.`);
            } else if (assessment.evidenceBasis === 'generated-scenario') scenarioInputNames.push(`${teamCode}.aggregateRuleAssessment`);
          }
          if (matchingPath === 'transition-tpe') {
            const timing = proposal.tradeTimingContext;
            if (!timing || !['regular-season', 'offseason'].includes(timing.period) ||
                Number(timing.seasonStartYear) !== proposal.seasonStartYear ||
                !['verified', 'generated-scenario'].includes(timing.status)) {
              missingInputs.push(`${teamCode} Transition TPE requires a sourced regular-season/offseason timing context for the 2023-24 rule.`);
            } else if (timing.status === 'generated-scenario' && !scenarioAllowed) {
              missingInputs.push(`${teamCode} Transition TPE timing is generated scenario input and requires Provisional Sandbox opt-in.`);
            } else if (timing.status === 'generated-scenario') {
              scenarioInputNames.push(`${teamCode}.tradeTimingContext`);
            }
            if (timing?.period === 'offseason') {
              const successor = proposal.successorApronStateByTeam?.[teamCode];
              if (successor?.status === 'fail') violations.push(...(successor.violations ?? [`${teamCode} exceeds the 2024-25 successor-year First Apron limit.`]));
              else if (successor?.status !== 'pass' || Number(successor.seasonStartYear) !== proposal.seasonStartYear + 1 ||
                  !Number.isFinite(Number(successor.apronTeamSalaryUsd)) || !Number.isFinite(Number(successor.firstApronUsd)) ||
                  Number(successor.apronTeamSalaryUsd) > Number(successor.firstApronUsd) ||
                  !Array.isArray(successor.sourceRefs) || successor.sourceRefs.length === 0) {
                missingInputs.push(`${teamCode} Transition TPE offseason use requires the successor-season Apron Team Salary projection and First Apron limit.`);
              } else if (successor.evidenceBasis === 'generated-scenario') scenarioInputNames.push(`${teamCode}.successorApronState`);
            }
          }
        }
        resultingPayrollByTeam[teamCode] = {
          ...clone(team.payrollState ?? {}),
          status: postPayrollUsd === null ? 'unknown' : 'reconciled',
          seasonStartYear: proposal.seasonStartYear,
          rulesVersionId: selected.ruleVersionId,
          sourceRefs: unique([...(team.payrollState?.sourceRefs ?? []), ...sourceRefsFromState(state, selected), NBA_2023_CBA_SOURCE]),
          totalTeamSalaryUsd: postPayrollUsd,
          apronTeamSalaryUsd: postApronSalaryUsd,
          hardCapTriggers: [...(team.payrollState?.hardCapTriggers ?? []), ...(salaryMatchingByTeam[teamCode]?.hardCapTriggers ?? []).map(trigger => ({ ...trigger, seasonStartYear: proposal.seasonStartYear, proposalId: proposal.proposalId }))],
          components: { ...(team.payrollState?.components ?? {}), totalTeamSalaryUsd: postPayrollUsd },
          provisionalReasons: [],
        };
        if (currentPayrollUsd === null) missingInputs.push(`${teamCode} has no resolved current team payroll total.`);
        for (const trigger of team.payrollState?.hardCapTriggers ?? []) {
          if (trigger.seasonStartYear !== proposal.seasonStartYear) continue;
          if (postApronSalaryUsd === null) missingInputs.push(`${teamCode} existing hard cap cannot be checked without Apron Team Salary.`);
          else if (trigger.thresholdUsd === null || trigger.thresholdUsd === undefined || !Number.isFinite(Number(trigger.thresholdUsd))) missingInputs.push(`${teamCode} existing hard-cap threshold is unresolved.`);
          else if (postApronSalaryUsd > Number(trigger.thresholdUsd)) violations.push(`${teamCode} exceeds its existing ${trigger.level} hard cap.`);
        }
      }

      if (proposal.kind !== 'trade') {
        missingInputs.push(`The ${proposal.kind} path is not yet covered by the bounded trade CBA evaluator.`);
      }
      if (proposal.kind === 'trade' && (proposal.legs ?? []).some(leg => leg.assetType === 'draft-pick')) {
        missingInputs.push('Draft-pick rights, protections, swap priority, Stepien compliance, and second-apron frozen-pick status require the draft-rights evaluator.');
      }
      if (proposal.kind === 'trade' && (proposal.legs ?? []).some(leg => leg.assetType === 'cash')) {
        missingInputs.push('Cash-for-trade Apron hard-cap treatment is evaluated by the cash ledger and is outside this team-salary matching result.');
      }
      if (proposal.kind === 'trade' && !capHitInputsComplete) missingInputs.push('Trade cap-hit movement is incomplete.');
      if (proposal.kind === 'trade' && !tradeSalaryInputsComplete) missingInputs.push('CBA trade-salary basis is incomplete; cap hit or base salary is not substituted.');
      if (proposal.kind === 'trade' && !apronInputsComplete) missingInputs.push('Apron cap-hit movement is incomplete; Team Salary is not substituted.');
      if (scenarioInputNames.length && !scenarioAllowed) missingInputs.push('Generated-scenario CBA evidence requires explicit opt-in while state.mode is provisional-sandbox.');

      const uniqueMissing = unique(missingInputs);
      const status = violations.length ? 'fail' : uniqueMissing.length ? 'unknown' : 'pass';
      const evidenceBasis = uniqueMissing.length ? 'incomplete-evidence'
        : scenarioInputNames.length ? 'generated-scenario' : 'resolved-source-evidence';
      const outcomeStatus = status === 'fail' ? 'illegal'
        : status === 'unknown' ? 'unknown'
          : evidenceBasis === 'generated-scenario' ? 'scenario-compliant' : 'confirmed-legal';
      const resultingPayrollStatus = status === 'unknown' ? 'unknown'
        : evidenceBasis === 'generated-scenario' ? 'provisional-scenario' : 'reconciled';
      for (const teamPayroll of Object.values(resultingPayrollByTeam)) teamPayroll.status = resultingPayrollStatus;
      return {
        status,
        outcomeStatus,
        evidenceBasis,
        legalReady: status === 'pass' && evidenceBasis === 'resolved-source-evidence',
        screenStatus: status === 'fail' ? 'screen-fail' : status === 'unknown' ? 'screen-incomplete' : 'screen-pass',
        ruleVersionId: selected.ruleVersionId,
        ruleRefs: unique(evaluatedRuleRefs),
        missingInputs: uniqueMissing,
        violations: unique(violations),
        calculations: {
          format: CBA_TRADE_RULE_ENGINE_FORMAT,
          basis: 'season-cap-hit-screen',
          seasonStartYear: proposal.seasonStartYear,
          thresholds: clone(selected.thresholds),
          ruleCoverage: clone(CBA_TRADE_RULE_COVERAGE_V1),
          capHitLegs: legCalculations,
          teamCalculations,
          salaryMatchingByTeam,
          resultingPayrollByTeam,
          sourceRefs: sourceRefsFromState(state, selected),
          evidenceBasis,
          outcomeStatus,
          legalReady: status === 'pass' && evidenceBasis === 'resolved-source-evidence',
        },
        resultingPayrollByTeam,
      };
    },
  };
}
