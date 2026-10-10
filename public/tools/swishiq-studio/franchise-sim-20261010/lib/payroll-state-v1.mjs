import {
  buildExactNameIndex,
  resolvePlayerByCanonicalName,
  validateLeagueState,
} from './simulation-contracts-v1.mjs';
import { applyCapAccountingToLeague } from './cap-accounting-v1.mjs';

export const PAYROLL_STATE_FORMAT = 'djhc-roster-derived-payroll-state-v1';

const clone = value => structuredClone(value);

function evidenceValue(value) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value ?? null;
}

function evidenceStatus(value, term) {
  return value && typeof value === 'object' ? value.valueStatus ?? value.status ?? term?.status ?? 'unknown' : term?.status ?? (value === null || value === undefined ? 'unknown' : 'unannotated');
}

function amount(value) {
  const raw = evidenceValue(value);
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function termForSeason(player, seasonStartYear) {
  return (player?.contractSeasons ?? player?.contract?.seasons ?? [])
    .find(term => Number(term.seasonStartYear ?? term.fromYear) === seasonStartYear) ?? null;
}

function sourceForField(term, field) {
  const raw = term?.[field];
  return (raw && typeof raw === 'object' ? raw.source : null) ?? term?.fieldProvenance?.[field] ?? term?.source ?? null;
}

function uniqueSourceRefs(refs) {
  return [...new Map(refs.filter(Boolean).map(ref => [JSON.stringify(ref), clone(ref)])).values()];
}

function playerForRosterName(index, name) {
  const resolution = resolvePlayerByCanonicalName(index, name);
  return { resolution, player: resolution.status === 'resolved' ? resolution.matches[0] : null };
}

/**
 * Derive a transparent roster payroll screen from season contract terms. This
 * uses only cap-hit fields that are present and non-conflicting. It never
 * substitutes base salary for cap hit and never treats an absent term as zero.
 */
export function derivePayrollStateForLeague(state, {
  seasonStartYear = state?.seasonStartYear,
  sourcePolicy = 'historical-or-explicit-scenario-cap-hit-only',
  teamCodes = null,
} = {}) {
  if (!Number.isInteger(seasonStartYear)) throw new Error('Payroll derivation requires seasonStartYear.');
  const next = clone(state);
  const playerIndex = buildExactNameIndex(next.players ?? []);
  const selectedTeams = teamCodes ? new Set(teamCodes.map(code => String(code).toUpperCase())) : null;
  const report = {
    format: PAYROLL_STATE_FORMAT,
    seasonStartYear,
    sourcePolicy,
    teams: {},
    unresolvedTeamCount: 0,
  };

  for (const team of next.teams ?? []) {
    if (selectedTeams && !selectedTeams.has(team.teamCode)) continue;
    const existing = clone(team.payrollState ?? {});
    const sameSeason = Number(existing.seasonStartYear) === seasonStartYear;
    let resolvedCapHitUsd = 0;
    let resolvedCount = 0;
    let candidateCount = 0;
    const unresolvedContractNames = [];
    const ambiguousRosterNames = [];
    const sourceRefs = [];
    const contractRows = [];
    for (const rosterName of team.rosterNames ?? []) {
      const { resolution, player } = playerForRosterName(playerIndex, rosterName);
      if (resolution.status !== 'resolved') {
        if (resolution.status === 'ambiguous') ambiguousRosterNames.push(rosterName);
        else unresolvedContractNames.push(rosterName);
        continue;
      }
      const term = termForSeason(player, seasonStartYear);
      const rawCapHit = term?.capHit;
      const capHitUsd = amount(rawCapHit);
      const status = evidenceStatus(rawCapHit, term);
      const usable = capHitUsd !== null && !['conflict', 'unknown', 'unreported', 'missing-term'].includes(status) && !status.startsWith('unknown');
      const validCapHit = usable && ['resolved', 'verified', 'observed', 'reconciled'].includes(status);
      const candidateCapHit = usable && !validCapHit;
      if (validCapHit) {
        resolvedCapHitUsd += capHitUsd;
        resolvedCount += 1;
      } else if (candidateCapHit) {
        // Source candidates are useful for a screen, but remain visibly
        // provisional and are excluded from a reconciled payroll total.
        resolvedCapHitUsd += capHitUsd;
        candidateCount += 1;
      } else {
        unresolvedContractNames.push(player.canonicalName);
      }
      const source = sourceForField(term, 'capHit');
      if (source) sourceRefs.push(source);
      contractRows.push({
        canonicalName: player.canonicalName,
        capHitUsd: usable ? capHitUsd : null,
        capHitStatus: status,
        salaryUsd: evidenceValue(term?.salary),
        source,
      });
    }
    const completeRoster = unresolvedContractNames.length === 0 && ambiguousRosterNames.length === 0 && (team.rosterNames ?? []).length === resolvedCount + candidateCount;
    const components = sameSeason ? clone(existing.components ?? {}) : {};
    const explicitNonRoster = amount(components.nonRosterCapHitUsd);
    const componentAmounts = ['deadMoneyUsd', 'capHoldsUsd', 'incompleteRosterChargesUsd'].map(field => amount(components[field]));
    const nonRosterCapHitUsd = explicitNonRoster ?? (componentAmounts.every(value => value !== null)
      ? componentAmounts.reduce((sum, value) => sum + value, 0) : null);
    const existingTotal = sameSeason ? amount(existing.totalTeamSalaryUsd ?? components.totalTeamSalaryUsd) : null;
    const oldRoster = sameSeason ? amount(components.rosterCapHitUsd) : null;
    const oldUnknownNames = [...(existing.unresolvedContractNames ?? []), ...(existing.ambiguousRosterNames ?? [])].sort();
    const newUnknownNames = [...unresolvedContractNames, ...ambiguousRosterNames].sort();
    const unknownMembershipChanged = oldRoster !== null && JSON.stringify(oldUnknownNames) !== JSON.stringify(newUnknownNames);
    let anchor = sameSeason ? amount(components.unitemizedPayrollAnchorUsd) : null;
    if (anchor === null && nonRosterCapHitUsd === null && existingTotal !== null) {
      const priorRoster = oldRoster ?? resolvedCapHitUsd;
      if (existingTotal >= priorRoster) anchor = existingTotal - priorRoster;
    }
    if (unknownMembershipChanged) anchor = null;
    const anchorInvalidated = nonRosterCapHitUsd === null && (unknownMembershipChanged || components.unitemizedPayrollAnchorInvalidated === true);
    const unresolvedLiabilities = (existing.unresolvedLiabilities ?? []).some(row => row.seasonStartYear === undefined || Number(row.seasonStartYear) === seasonStartYear);
    let totalTeamSalaryUsd = null;
    let totalBasis = 'unknown';
    if (!unresolvedLiabilities && !anchorInvalidated) {
      if (completeRoster && nonRosterCapHitUsd !== null) {
        totalTeamSalaryUsd = resolvedCapHitUsd + nonRosterCapHitUsd;
        totalBasis = 'roster-and-explicit-components';
      } else if (anchor !== null) {
        totalTeamSalaryUsd = resolvedCapHitUsd + anchor;
        totalBasis = 'roster-and-unitemized-candidate-anchor';
      } else if (completeRoster) {
        totalTeamSalaryUsd = resolvedCapHitUsd;
        totalBasis = 'roster-only-screen';
      }
    }
    const status = totalTeamSalaryUsd === null ? 'unknown' : completeRoster && candidateCount === 0 && totalBasis !== 'roster-and-unitemized-candidate-anchor' ? 'screen-calculated' : 'candidate';
    if (status !== 'screen-calculated') report.unresolvedTeamCount += 1;
    const reasons = [
      'Derived from exact roster names and season cap-hit fields.',
      'Base salary is never substituted for missing cap hit.',
      ...(candidateCount ? [`${candidateCount} source-candidate or generated cap-hit value(s) remain provisional.`] : []),
      ...(unresolvedContractNames.length ? [`${unresolvedContractNames.length} roster contract term(s) lack a usable cap hit.`] : []),
      ...(ambiguousRosterNames.length ? [`${ambiguousRosterNames.length} roster name(s) are ambiguous.`] : []),
      ...(anchor !== null ? ['The unitemized payroll anchor is a candidate adjustment, not verified non-roster liabilities.'] : []),
      ...(unknownMembershipChanged ? ['A player with an unknown cap hit entered or left; the previous payroll total cannot be carried forward.'] : []),
      ...(unresolvedLiabilities ? ['Unresolved contract liabilities prevent a complete payroll total.'] : []),
      ...(totalBasis === 'roster-only-screen' ? ['The roster-only screen excludes non-roster components that have not been supplied.'] : []),
    ];
    team.payrollState = {
      ...existing,
      format: PAYROLL_STATE_FORMAT,
      status,
      seasonStartYear,
      totalTeamSalaryUsd,
      totalBasis,
      components: {
        ...components,
        rosterCapHitUsd: resolvedCapHitUsd,
        nonRosterCapHitUsd,
        unitemizedPayrollAnchorUsd: anchor,
        unitemizedPayrollAnchorInvalidated: anchorInvalidated,
        totalTeamSalaryUsd,
      },
      sourcePolicy,
      sourceRefs: uniqueSourceRefs([...(sameSeason ? existing.sourceRefs ?? [] : []), ...sourceRefs]),
      unresolvedContractNames: [...new Set(unresolvedContractNames)],
      ambiguousRosterNames: [...new Set(ambiguousRosterNames)],
      contractRows,
      provisionalReasons: [...new Set([...(existing.provisionalReasons ?? []), ...reasons])],
    };
    report.teams[team.teamCode] = {
      status,
      totalTeamSalaryUsd,
      totalBasis,
      rosterCapHitUsd: resolvedCapHitUsd,
      resolvedCount,
      candidateCount,
      unresolvedContractNames: [...new Set(unresolvedContractNames)],
      ambiguousRosterNames: [...new Set(ambiguousRosterNames)],
    };
  }
  const accounting = applyCapAccountingToLeague(next, { seasonStartYear, teamCodes });
  for (const [teamCode, result] of Object.entries(accounting.reports)) {
    const row = report.teams[teamCode];
    if (row.status !== 'screen-calculated') report.unresolvedTeamCount -= 1;
    row.totalTeamSalaryUsd = result.totals.teamSalaryUsd;
    row.totalBasis = 'explicit-cap-component-ledger';
    row.status = result.status === 'calculated' ? 'component-calculated' : 'unknown';
    row.capAccounting = result;
    // Sourced/generated component arithmetic remains separate from a complete
    // CBA legality certification, even when every amount can be calculated.
    report.unresolvedTeamCount += 1;
  }
  accounting.state.payrollDerivation = report;
  validateLeagueState(accounting.state);
  return { state: accounting.state, report };
}

export function derivePayrollStateForTeam(state, teamCode, options = {}) {
  const result = derivePayrollStateForLeague(state, { ...options, teamCodes: [teamCode] });
  const team = result.state.teams.find(row => String(row.teamCode).toUpperCase() === String(teamCode).toUpperCase());
  if (!team) throw new Error(`Unknown team ${teamCode}.`);
  return { state: result.state, report: result.report, payrollState: team.payrollState };
}
