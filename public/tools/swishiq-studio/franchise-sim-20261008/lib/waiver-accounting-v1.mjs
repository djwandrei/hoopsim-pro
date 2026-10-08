import { CAP_ACCOUNTING_RULE_SOURCE, CAP_BASE_FIELDS } from './cap-accounting-v1.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const WAIVER_ACCOUNTING_FORMAT = 'djhc-waiver-cap-accounting-v1';
const bases = Object.keys(CAP_BASE_FIELDS);
const clone = value => structuredClone(value);
const raw = value => value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
const cents = value => Math.round(value * 100);
function amount(value, parent = {}) {
  const number = raw(value);
  const status = value?.valueStatus ?? value?.status ?? parent.status ?? '';
  return number === null || number === undefined || number === '' || typeof number === 'boolean' ||
    ['conflict', 'unresolved', 'unreported', 'missing', 'missing-term'].includes(status) || String(status).startsWith('unknown') ||
    !Number.isFinite(Number(number)) || Number(number) < 0 ? null : Number(number);
}
function versionedSource(source) {
  const date = String(source?.retrievedAt ?? source?.generatedAt ?? '').slice(0, 10);
  return Boolean(source?.sourceSystem && source?.sourceVersion && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date);
}
function splitCents(total, count) {
  const whole = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => whole + (index < total % count ? 1 : 0));
}

/** Ordinary post-termination charges must be supplied, except for an explicitly
 * simple fully guaranteed zero-bonus scenario contract. Protection and cap
 * salary are different concepts for every other contract profile. */
export function buildWaiverCapEntries({ canonicalName, proposalId, seasonStartYear, contractSeasons = [],
  postTerminationSeasons = null, stretch = null, source = null } = {}) {
  if (!normalizeCanonicalPlayerName(canonicalName) || !proposalId || !Number.isInteger(seasonStartYear)) throw new Error('Waiver accounting requires player, proposal, and season.');
  const missingInputs = [];
  const violations = [];
  let inputRows = postTerminationSeasons;
  if (!inputRows) {
    inputRows = contractSeasons.filter(term => Number(term.seasonStartYear ?? term.fromYear) >= seasonStartYear).map(term => {
      const salary = amount(term.salary, term);
      const simple = term.accountingProfile === 'standard-guaranteed-no-adjustments' && salary !== null &&
        amount(term.guaranteedCash, term) === salary && amount(term.likelyBonus, term) === 0 && amount(term.unlikelyBonus, term) === 0 &&
        raw(term.playerOption) === false && raw(term.teamOption) === false;
      return { seasonStartYear: term.seasonStartYear ?? term.fromYear,
        status: simple ? 'generated-scenario' : 'unknown', source: clone(term.source ?? term.accounting?.source ?? source),
        values: Object.fromEntries(Object.entries(CAP_BASE_FIELDS).map(([base, field]) => [base,
          simple && !(term.accounting?.conflicts ?? []).some(conflict => conflict.field === field) ? amount(term[field], term) : null])),
        accountingProfile: simple ? term.accountingProfile : null };
    });
  }
  if (!Array.isArray(inputRows) || !inputRows.length) missingInputs.push('Post-termination salary seasons are missing.');
  const rows = clone(inputRows ?? []).sort((a, b) => a.seasonStartYear - b.seasonStartYear);
  const years = new Set();
  for (const row of rows) {
    if (!Number.isInteger(row.seasonStartYear) || row.seasonStartYear < seasonStartYear || years.has(row.seasonStartYear)) violations.push('Post-termination seasons must be unique integers in the remaining contract horizon.');
    years.add(row.seasonStartYear);
    row.fieldSources = {};
    for (const base of bases) {
      const factSource = row.values?.[base]?.source ?? row.source ?? source;
      row.fieldSources[base] = clone(factSource ?? null);
      if (!versionedSource(factSource)) {
        missingInputs.push(`${row.seasonStartYear} post-termination ${base} lacks versioned and dated input provenance.`);
        row.values ??= {};
        row.values[base] = null;
      }
      if (amount(row.values?.[base], row) === null) missingInputs.push(`${row.seasonStartYear} post-termination ${base} is unresolved.`);
    }
  }
  const originalYears = contractSeasons.map(term => Number(term.seasonStartYear ?? term.fromYear)).filter(year => year >= seasonStartYear);
  for (const year of new Set([seasonStartYear, ...originalYears])) if (!years.has(year)) missingInputs.push(`Post-termination treatment is missing for contract season ${year}.`);
  let entries = rows.map(row => ({ entryId: `waiver-${proposalId}-${normalizeCanonicalPlayerName(canonicalName)}-${row.seasonStartYear}`,
    kind: 'dead-money', canonicalName, proposalId, seasonStartYear: row.seasonStartYear,
    values: Object.fromEntries(bases.map(base => [base, amount(row.values?.[base], row)])), status: row.status ?? 'unannotated',
    source: clone(row.source ?? source), fieldSources: clone(row.fieldSources), originalContractSeason: row.seasonStartYear, ruleRefs: ['VII-4a1i'], active: true }));
  let restriction = null;
  let stretchCalculation = null;
  if (stretch) {
    const electionDate = String(stretch.electionDate ?? '');
    const terminationDate = String(stretch.terminationDate ?? '');
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(electionDate) || !validDate(terminationDate)) missingInputs.push('Stretch requires explicit valid termination and election dates.');
    const cap = amount(stretch.electionYearSalaryCapUsd);
    if (cap === null) missingInputs.push('Stretch requires the election-year Salary Cap.');
    if (stretch.writtenElection !== true) missingInputs.push('A written cap-stretch election is required.');
    if (stretch.reacquiredBeforeElection === true) violations.push('A team cannot stretch after reacquiring the terminated player.');
    else if (stretch.reacquiredBeforeElection !== false) missingInputs.push('Prior reacquisition status is unresolved.');
    const lastYear = Math.max(...years);
    if (validDate(electionDate) && validDate(terminationDate)) {
      const electionYear = Number(electionDate.slice(0, 4)) - (electionDate.slice(5) < '07-01' ? 1 : 0);
      const beforeSeptember = electionDate.slice(5) >= '07-01' && electionDate.slice(5) <= '08-31';
      const branch = beforeSeptember ? 'july-august' : 'september-june';
      if (seasonStartYear < 2023) missingInputs.push('This stretch module covers the 2023 CBA, not earlier contract terminations.');
      if (electionYear !== seasonStartYear || terminationDate > electionDate) violations.push('Stretch election must follow termination and be in the proposed cap year.');
      if (electionDate >= `${lastYear}-09-01` || terminationDate >= `${lastYear}-09-01`) violations.push('Cap-stretch election is after the last-contract-season eligibility deadline.');
      if (stretch.branch !== branch) violations.push('Stretch branch does not match the supplied election window.');
      const stretchedRows = rows.filter(row => beforeSeptember || row.seasonStartYear > seasonStartYear);
      const n = stretchedRows.length;
      if (!n || stretchedRows.some((row, index) => row.seasonStartYear !== (beforeSeptember ? seasonStartYear : seasonStartYear + 1) + index)) missingInputs.push('Stretch requires a consecutive resolved original contract horizon.');
      if (stretch.apronTracksStretchedSalary !== true) missingInputs.push('Apron treatment of the stretched post-termination contract is unresolved.');
      if (stretch.apronTracksStretchedSalary === true && rows.some(row => amount(row.values?.apronTeamSalaryUsd, row) !== amount(row.values?.teamSalaryUsd, row))) {
        missingInputs.push('Additional post-termination apron adjustments require explicit treatment before this simple stretch calculation.');
      }
      if (!missingInputs.length && !violations.length) {
        const duration = 2 * n + 1;
        const firstYear = beforeSeptember ? seasonStartYear : seasonStartYear + 1;
        const allocations = splitCents(stretchedRows.reduce((sum, row) => sum + cents(amount(row.values.teamSalaryUsd, row)), 0), duration);
        const originalByYear = new Map(entries.map(row => [row.seasonStartYear, row]));
        const horizon = new Set([...originalByYear.keys(), ...allocations.map((_, index) => firstYear + index)]);
        entries = [...horizon].sort((a, b) => a - b).map(year => {
          const original = originalByYear.get(year);
          const allocation = year < firstYear ? original?.values.teamSalaryUsd ?? 0 : (allocations[year - firstYear] ?? 0) / 100;
          return { ...clone(original ?? entries[0]), entryId: `waiver-${proposalId}-${normalizeCanonicalPlayerName(canonicalName)}-${year}`,
            seasonStartYear: year, values: { teamSalaryUsd: allocation, apronTeamSalaryUsd: allocation,
              // CBA Total Salaries ignore the cap-stretch election (VII-7d6iv).
              taxTeamSalaryUsd: original?.values.taxTeamSalaryUsd ?? 0,
              mtsCapHoldTeamSalaryUsd: original?.values.mtsCapHoldTeamSalaryUsd ?? 0,
              mtsPaymentTeamSalaryUsd: original?.values.mtsPaymentTeamSalaryUsd ?? 0 },
            stretch: { electionDate, terminationDate, branch, firstYear, duration }, ruleRefs: ['VII-7d6i', 'VII-7d6iii', 'VII-7d6iv'] };
        });
        for (const entry of entries.filter(row => row.seasonStartYear > seasonStartYear)) {
          const existing = amount(stretch.otherFormerPlayerCapSalaryBySeason?.[String(entry.seasonStartYear)]);
          if (existing === null) missingInputs.push(`Existing former-player cap salary coverage is missing for ${entry.seasonStartYear}.`);
          else if (cents(existing) + cents(entry.values.teamSalaryUsd) > cents(cap * 0.15)) violations.push(`Stretch would exceed the 15% former-player cap-salary limit in ${entry.seasonStartYear}.`);
        }
        restriction = { teamCode: stretch.teamCode ?? null, canonicalName, reason: 'cap-stretch-reacquisition-bar',
          earliestReacquisitionDate: `${lastYear + 1}-07-01`, lastOriginalContractSeason: lastYear, ruleRef: 'VII-7d6iii' };
        stretchCalculation = { branch, firstYear, duration, electionYearSalaryCapUsd: cap, originalLastSeason: lastYear };
      }
    }
  }
  return { format: WAIVER_ACCOUNTING_FORMAT, status: violations.length ? 'invalid' : missingInputs.length ? 'incomplete' : 'calculated',
    entries, missingInputs: [...new Set(missingInputs)], violations: [...new Set(violations)], restriction, stretchCalculation,
    ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE), legalReady: false };
}

/** NBA successor-team set-off; liability relief and cap allocation are separate
 * outputs. The caller supplies protected liability and remaining stretch years. */
export function calculateNbaWaiverSetOff({ successorCompensationUsd, minimumSalaryAtTerminationUsd,
  unearnedProtectedBaseUsd, setOffWaived, applicableStretchSeasons = null } = {}) {
  const successor = amount(successorCompensationUsd), minimum = amount(minimumSalaryAtTerminationUsd), protectedBase = amount(unearnedProtectedBaseUsd);
  if ([successor, minimum, protectedBase].some(value => value === null) || typeof setOffWaived !== 'boolean') return { status: 'unknown', liabilityReductionUsd: null, capReductionsBySeason: null };
  const reduction = setOffWaived === true ? 0 : Math.min(cents(protectedBase), Math.round(Math.max(0, cents(successor) - cents(minimum)) * 0.5));
  let capReductionsBySeason = null;
  if (applicableStretchSeasons) {
    if (!applicableStretchSeasons.length || applicableStretchSeasons.some((year, index) => !Number.isInteger(year) || (index && year !== applicableStretchSeasons[index - 1] + 1))) throw new Error('Set-off cap allocation requires unique consecutive applicable stretch seasons.');
    const allocation = splitCents(reduction, applicableStretchSeasons.length);
    capReductionsBySeason = Object.fromEntries(applicableStretchSeasons.map((year, index) => [year, allocation[index] / 100]));
  }
  return { status: 'calculated', liabilityReductionUsd: reduction / 100, capReductionsBySeason,
    ruleRefs: ['XXVII-1a', 'XXVII-5b'], assumptions: ['NBA successor compensation; correct YOS-based minimum, first-team priority and set-off amendment status supplied by caller.'] };
}
