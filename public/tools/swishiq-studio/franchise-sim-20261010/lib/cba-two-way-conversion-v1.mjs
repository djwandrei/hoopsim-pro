import { minimumSalaryForContractYear } from './cba-salary-scales-v1.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const TWO_WAY_CONVERSION_FORMAT = 'djhc-cba-two-way-conversion-evaluation-v1';
export const TWO_WAY_CONVERSION_RULE_VERSION = 'nba-nbpa-cba-2023';

const clone = value => structuredClone(value);
const RESOLVED_YOS_STATUSES = new Set(['observed', 'verified', 'resolved', 'source-verified', 'official']);
const unwrap = raw => raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw;
const fieldStatus = (raw, parent = null) => raw?.valueStatus ?? raw?.status ?? parent?.valueStatus ?? parent?.status ?? '';
const unknownStatus = status => /unknown|candidate|conflict|unresolved|unreported|unverified|missing|invalid/i.test(String(status ?? ''));
const validDate = raw => {
  const value = String(raw ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const sourceValid = source => Boolean(source?.sourceSystem && source?.sourceVersion &&
  validDate(source.retrievedAt ?? source.generatedAt));
function amount(raw, parent = null) {
  const value = unwrap(raw), status = fieldStatus(raw, parent);
  return unknownStatus(status) || value === null || value === undefined || value === '' ||
    typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
}
function inspectYearsOfServiceEvidence(raw, seasonStartYear) {
  const status = String(fieldStatus(raw)).trim().toLowerCase();
  const value = unwrap(raw);
  const source = raw?.source ?? null;
  const valueValid = Number.isInteger(value) && value >= 0;
  const evidenceShapeValid = raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') &&
    raw.field === 'yearsOfService' && raw.seasonStartYear === seasonStartYear && sourceValid(source);
  const simulationAssumption = status === 'generated-scenario' || source?.sourceClass === 'generated-scenario';
  if (evidenceShapeValid && valueValid && simulationAssumption && status.length > 0 && !unknownStatus(status)) {
    return { yearsOfService: null, evidenceValue: value, evidenceStatus: status,
      evidenceClass: 'simulation-assumption', source: clone(source) };
  }
  if (evidenceShapeValid && valueValid && RESOLVED_YOS_STATUSES.has(status) && !unknownStatus(status)) {
    return { yearsOfService: value, evidenceValue: value, evidenceStatus: status,
      evidenceClass: 'resolved-sourced', source: clone(source) };
  }
  return { yearsOfService: null, evidenceValue: valueValid ? value : null, evidenceStatus: status || null,
    evidenceClass: 'unresolved', source: source ? clone(source) : null };
}
function knownBoolean(raw, parent = null) {
  const value = unwrap(raw);
  return unknownStatus(fieldStatus(raw, parent)) || typeof value !== 'boolean' ? null : value;
}
function seasonOf(term) { return Number(term?.seasonStartYear ?? term?.fromYear); }
function termSource(term) { return term?.source ?? term?.contractSource ?? null; }
function hasFieldSource(raw, parent) { return sourceValid(raw?.source) || sourceValid(termSource(parent)); }

/**
 * Check the contract-specific requirements for converting an existing
 * two-way deal into a standard deal. This is deliberately not a complete CBA
 * legality evaluator: roster, window, payroll/cap accounting, active-list and
 * transaction restrictions still belong to the shared rule engine.
 */
export function evaluateTwoWayConversion({
  seasonStartYear,
  ruleVersionId,
  canonicalName,
  teamCode,
  currentTeamCode,
  existingContractSeasons = [],
  convertedContractSeasons = [],
  yearsOfServiceBySeason = {},
  salaryScalesBySeason = {},
  transactionWindow,
  regularSeasonDays = null,
  coveredDays = null,
  conversionBeforeLastRegularSeasonGame = null,
} = {}) {
  const violations = [], missingInputs = [], calculations = [], ruleRefs = ['I-1(kk)', 'II-6(a)', 'II-11(d)', 'II-11(f)', 'XXIX-3(b)'];
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < 2023 || ruleVersionId !== TWO_WAY_CONVERSION_RULE_VERSION) {
    missingInputs.push('Two-way conversion contract terms are implemented only for the 2023 CBA branch beginning in 2023–24.');
  }
  if (!canonicalName || !normalizeCanonicalPlayerName(canonicalName)) missingInputs.push('Canonical player name is required.');
  if (!teamCode || !currentTeamCode) missingInputs.push('Current and converting team are required.');
  else if (String(teamCode).toUpperCase() !== String(currentTeamCode).toUpperCase()) violations.push('Only the team holding the current two-way contract may convert it.');

  const originalTerms = existingContractSeasons.filter(term => Number.isInteger(seasonOf(term)))
    .sort((a, b) => seasonOf(a) - seasonOf(b));
  if (originalTerms.length !== existingContractSeasons.length) {
    missingInputs.push('Every original two-way contract season must have a resolved season year.');
  }
  if (new Set(originalTerms.map(seasonOf)).size !== originalTerms.length) {
    violations.push('The original two-way contract contains duplicate season terms.');
  }
  const existing = originalTerms.filter(term => seasonOf(term) >= seasonStartYear);
  if (!existing.length) missingInputs.push('A source-backed current two-way contract term is required.');
  if (originalTerms.length > 2) violations.push('A two-way contract may cover no more than two seasons under the selected CBA branch.');
  for (let index = 0; index < originalTerms.length; index += 1) {
    const term = originalTerms[index], season = seasonOf(term), twoWay = knownBoolean(term.twoWay, term);
    if (season !== seasonOf(originalTerms[0]) + index) violations.push('The original two-way contract must contain contiguous seasons.');
    if (twoWay === false) violations.push(`Existing contract term ${season} is not a two-way contract.`);
    else if (twoWay === null) missingInputs.push(`Existing two-way status is unresolved for ${season}.`);
    if (!sourceValid(termSource(term))) missingInputs.push(`Existing two-way contract term ${season} has no dated, versioned source.`);
    if (knownBoolean(term.teamOption, term) === true || knownBoolean(term.playerOption, term) === true) {
      violations.push('A two-way contract cannot include an option year.');
    } else if (knownBoolean(term.teamOption, term) === null || knownBoolean(term.playerOption, term) === null) {
      missingInputs.push(`Existing two-way option terms are unresolved for ${season}.`);
    }
    if (knownBoolean(term.earlyTerminationOption, term) === true) {
      violations.push('A two-way contract cannot include an Early Termination Option.');
    } else if (knownBoolean(term.earlyTerminationOption, term) === null) {
      missingInputs.push(`Existing two-way Early Termination Option status is unresolved for ${season}.`);
    }
  }

  const converted = convertedContractSeasons.filter(term => Number.isInteger(seasonOf(term)))
    .sort((a, b) => seasonOf(a) - seasonOf(b));
  if (!converted.length) missingInputs.push('Converted standard contract terms are required.');
  if (existing.length && converted.length && existing.length !== converted.length) {
    violations.push('A conversion must retain the same one- or two-season term length as the two-way contract.');
  }
  const conversionScale = salaryScalesBySeason[String(seasonStartYear)] ?? salaryScalesBySeason[seasonStartYear];
  const conversionScaleValid = Boolean(conversionScale && conversionScale.seasonStartYear === seasonStartYear &&
    conversionScale.ruleVersionId === TWO_WAY_CONVERSION_RULE_VERSION && sourceValid(conversionScale.capSource));
  if (!conversionScaleValid && existing.length && converted.length) {
    missingInputs.push(`A matching sourced CBA minimum-salary scale is required for the conversion contract's first covered season (${seasonStartYear}).`);
  }
  if (existing.length && converted.length) {
    for (let index = 0; index < Math.max(existing.length, converted.length); index += 1) {
      const sourceTerm = existing[index], targetTerm = converted[index];
      if (!sourceTerm || !targetTerm) continue;
      const year = seasonOf(sourceTerm);
      if (seasonOf(targetTerm) !== year) violations.push('Converted standard contract seasons must match the existing two-way contract seasons exactly.');
      const twoWay = knownBoolean(targetTerm.twoWay, targetTerm);
      if (twoWay === true) violations.push(`Converted contract term ${year} must be a standard contract.`);
      else if (twoWay === null) missingInputs.push(`Converted standard-contract status is unresolved for ${year}.`);
      if (!sourceValid(termSource(targetTerm))) missingInputs.push(`Converted contract term ${year} has no dated, versioned source.`);

      const yearsOfServiceRaw = yearsOfServiceBySeason[String(year)] ?? yearsOfServiceBySeason[year];
      const yosEvidence = inspectYearsOfServiceEvidence(yearsOfServiceRaw, year);
      const yearsOfService = yosEvidence.yearsOfService;
      if (yosEvidence.evidenceClass === 'simulation-assumption') {
        missingInputs.push(`Credited Years of Service for ${year} is an explicit simulation assumption; source-verified evidence is required for a contract-screen pass.`);
      } else if (yearsOfService === null) {
        missingInputs.push(`Credited Years of Service is unresolved for ${year}; explicit yearsOfService field evidence with a matching season, resolved status, and dated source is required.`);
      }
      let minimum = null;
      if (conversionScaleValid && Number.isInteger(yearsOfService) && yearsOfService >= 0) {
        try { minimum = minimumSalaryForContractYear(conversionScale, { yearsOfService, contractYear: index + 1 }); }
        catch (error) { missingInputs.push(`Minimum salary cannot be resolved for ${year}: ${error.message}`); }
      }

      let fraction = 1;
      if (index === 0 && transactionWindow === 'regular-season') {
        const regular = amount(regularSeasonDays), covered = amount(coveredDays);
        if (!Number.isInteger(regular) || !Number.isInteger(covered) || regular <= 0 || covered <= 0 || covered > regular) {
          missingInputs.push('In-season conversion requires resolved regular-season days and salary-covered days remaining.');
          fraction = null;
        } else fraction = covered / regular;
      } else if (!['offseason', 'training-camp', 'regular-season'].includes(transactionWindow)) {
        missingInputs.push('Conversion window must be identified to calculate the first-year minimum salary.');
        if (index === 0) fraction = null;
      }
      const minimumSalary = minimum && fraction !== null ? minimum.unroundedAmountUsd * fraction : null;
      const salary = amount(targetTerm.salary, targetTerm);
      if (salary === null) missingInputs.push(`Converted standard salary is unresolved for ${year}.`);
      else if (minimumSalary !== null && salary !== minimumSalary) violations.push(`Converted salary for ${year} must equal the applicable minimum salary (${minimumSalary} USD under the supplied scale and proration).`);
      if (!hasFieldSource(targetTerm.salary, targetTerm)) missingInputs.push(`Converted salary for ${year} lacks field-level or term-level source provenance.`);
      const capHit = amount(targetTerm.capHit, targetTerm);
      if (capHit === null) missingInputs.push(`Standard-contract cap hit is unresolved for ${year}; the salary floor alone does not determine the team-salary treatment.`);
      else if (!hasFieldSource(targetTerm.capHit, targetTerm)) missingInputs.push(`Standard-contract cap hit for ${year} lacks field-level or term-level source provenance.`);
      for (const bonusField of ['likelyBonus', 'unlikelyBonus']) {
        const bonus = amount(targetTerm[bonusField], targetTerm);
        if (bonus === null) missingInputs.push(`Converted ${bonusField} is unresolved for ${year}.`);
        else if (bonus !== 0) missingInputs.push(`Converted ${bonusField} for ${year} requires a separate bonus-rule evaluation.`);
      }
      calculations.push({ seasonStartYear: year, yearsOfService: Number.isInteger(yearsOfService) ? yearsOfService : null,
        yearsOfServiceEvidence: { value: yosEvidence.evidenceValue, status: yosEvidence.evidenceStatus,
          evidenceClass: yosEvidence.evidenceClass, source: yosEvidence.source },
        contractYear: index + 1, applicableScaleSeasonStartYear: conversionScaleValid ? conversionScale.seasonStartYear : null,
        minimumSalaryUsd: minimum?.unroundedAmountUsd ?? null, proratedMinimumSalaryUsd: minimumSalary,
        salaryUsd: salary, capHitUsd: capHit, prorationFraction: fraction, salaryScaleSource: clone(conversionScale?.capSource ?? null),
        status: minimumSalary !== null && salary === minimumSalary ? 'minimum-checked' : 'unresolved' });
    }
  }

  const postseasonEligibility = conversionBeforeLastRegularSeasonGame === true ? 'eligible-subject-to-roster-rules'
    : conversionBeforeLastRegularSeasonGame === false ? 'not-eligible-for-postseason-roster-under-two-way-conversion-timing-rule'
      : 'unknown-needs-last-regular-season-game-timing';
  if (conversionBeforeLastRegularSeasonGame !== true && conversionBeforeLastRegularSeasonGame !== false) {
    missingInputs.push('Postseason roster eligibility requires conversion timing relative to the team’s last regular-season game.');
  }
  const status = violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass';
  return {
    format: TWO_WAY_CONVERSION_FORMAT,
    seasonStartYear, ruleVersionId: TWO_WAY_CONVERSION_RULE_VERSION,
    canonicalName, teamCode: teamCode ? String(teamCode).toUpperCase() : null,
    status, violations: [...new Set(violations)], missingInputs: [...new Set(missingInputs)],
    calculations, postseasonEligibility, ruleRefs,
    legalReady: false,
    limitations: ['This checks contract-conversion term and minimum-salary conditions only. The shared season rule engine must still resolve roster slots, team salary and cap hit, signing/transaction permissions, two-way usage limits, payroll reconciliation and all other CBA restrictions.'],
  };
}
