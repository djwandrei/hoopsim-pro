export const SALARY_SCALE_FORMAT = 'djhc-cba-salary-scales-v1';
export const SALARY_SCALE_BASE_CAP_USD = 123655000;
export const SALARY_SCALE_RULE_VERSION = 'nba-nbpa-cba-2023';

const clone = value => structuredClone(value);
function valueOf(raw) { return raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw; }
function knownAmount(raw) {
  const value = valueOf(raw), status = raw?.valueStatus ?? raw?.status ?? '';
  return value === null || value === undefined || value === '' || typeof value === 'boolean' ||
    ['conflict', 'unresolved', 'unreported', 'missing', 'candidate'].includes(status) || /^(unknown|candidate)/.test(String(status)) ||
    !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
}
function validDate(raw) {
  const value = String(raw ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validSource(source) {
  return Boolean(source?.sourceSystem && source?.sourceVersion && validDate(source.retrievedAt ?? source.generatedAt));
}
function money(raw, factor) {
  const value = knownAmount(raw);
  if (value === null || value <= 0) throw new Error('Salary scale contains a missing or invalid baseline amount.');
  return { amountUsd: Math.round(value * factor), unroundedAmountUsd: value * factor, baselineAmountUsd: value, unit: 'USD' };
}
function checkScale(scale) {
  if (scale?.format !== SALARY_SCALE_FORMAT || scale.ruleVersionId !== SALARY_SCALE_RULE_VERSION || !validSource(scale.capSource)) throw new Error('A versioned, sourced 2023-CBA salary scale is required.');
}
function knownOption(raw, parent) {
  const status = raw?.valueStatus ?? raw?.status ?? parent?.status ?? '';
  const value = valueOf(raw);
  return /unknown|candidate|conflict|unresolved|unreported|missing/.test(String(status)) || typeof value !== 'boolean' ? null : value;
}

/** Pure browser-compatible transform of the signed Exhibit B/C source artifact.
 * Cells retain unrounded formula values. Rounded values are a display policy,
 * not a claim that the CBA prescribes nearest-dollar rounding. */
export function buildCbaSalaryScales({ baselines, seasonStartYear, salaryCapUsd, capSource,
  assumeCarryForwardRules = false, generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  if (baselines?.schemaVersion !== 'cba-salary-scale-baselines-v1') throw new Error('Signed Exhibit B/C baseline artifact is required.');
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < 2023) throw new Error('This salary scale branch starts in 2023–24; earlier seasons require their own agreement tables.');
  if (seasonStartYear > 2029 && assumeCarryForwardRules !== true) throw new Error('Post-2029–30 scales require an explicit carry-forward rule assumption.');
  const cap = knownAmount(salaryCapUsd);
  if (cap === null || cap <= 0 || !validSource(capSource) || !validDate(generatedAt)) throw new Error('Salary scales require a positive resolved cap and versioned dated cap provenance.');
  if (salaryCapUsd?.seasonStartYear !== undefined && salaryCapUsd.seasonStartYear !== seasonStartYear) throw new Error('Salary-cap evidence season conflicts with the requested scale.');
  const rookieBaseline = baselines.rookieSalaryScaleBaseline, minimumBaseline = baselines.minimumAnnualSalaryScaleBaseline;
  if (rookieBaseline?.normalizedSalaryUnit !== 'USD' || minimumBaseline?.normalizedSalaryUnit !== 'USD' || !rookieBaseline.unitDecision) throw new Error('Baseline salary units must be explicitly normalized to USD.');
  const factor = cap / SALARY_SCALE_BASE_CAP_USD;
  const minimumRows = (minimumBaseline.rows ?? []).map(row => {
    const yos = row.yearsOfService === '10+' ? 10 : Number(row.yearsOfService);
    if (!Number.isInteger(yos) || yos < 0 || yos > 10 || !Array.isArray(row.contractYears)) throw new Error('Invalid minimum salary YOS row.');
    const columns = row.contractYears.map(cell => {
      if (!Number.isInteger(cell.contractYear) || cell.contractYear < 1 || cell.contractYear > 5 || cell.contractYear > yos + 1) throw new Error('Invalid minimum salary contract-year cell.');
      return { contractYear: cell.contractYear, ...money(cell.amountUsd, factor) };
    });
    if (new Set(columns.map(cell => cell.contractYear)).size !== columns.length || columns.length !== Math.min(5, yos + 1)) throw new Error('Minimum salary row has missing or duplicate populated cells.');
    return { yearsOfService: yos, yearsOfServiceLabel: row.yearsOfService, contractYears: columns };
  });
  const rookieRows = (rookieBaseline.rows ?? []).map(row => {
    const fourth = knownAmount(row.fourthYearOptionIncrease?.percentageValue), qualifying = knownAmount(row.qualifyingOfferIncrease?.percentageValue);
    if (!Number.isInteger(row.pick) || row.pick < 1 || row.pick > 30 || fourth === null || qualifying === null) throw new Error('Invalid rookie pick or percentage row.');
    return { scalePick: row.pick, firstYear: money(row.firstYear?.amountUsd, factor), secondYear: money(row.secondYear?.amountUsd, factor),
      thirdYearOption: money(row.thirdYearOption?.amountUsd, factor), fourthYearOptionIncreasePct: fourth, qualifyingOfferIncreasePct: qualifying };
  });
  if (minimumRows.length !== 11 || new Set(minimumRows.map(row => row.yearsOfService)).size !== 11 ||
      rookieRows.length !== 30 || new Set(rookieRows.map(row => row.scalePick)).size !== 30) throw new Error('Complete unique Exhibit B and C rows are required.');
  return { format: SALARY_SCALE_FORMAT, schemaVersion: '1.0.0', seasonStartYear, ruleVersionId: SALARY_SCALE_RULE_VERSION,
    salaryCapUsd: cap, baselineSalaryCapUsd: SALARY_SCALE_BASE_CAP_USD, capMultiplier: factor, capSource: clone(capSource), generatedAt,
    status: capSource.sourceClass === 'generated-scenario' || seasonStartYear > 2029 ? 'provisional-scenario-scale' : 'formula-derived-sourced-cap',
    ruleAssumptionStatus: seasonStartYear > 2029 ? 'explicit-carry-forward' : 'scheduled-cba-term-conditional-on-no-opt-out',
    minimumRows, rookieRows, baselineSource: clone(baselines.source), baselineRetrievedAt: baselines.retrievedAt,
    unitNormalizationDecision: rookieBaseline.unitDecision,
    ruleRefs: ['I-1jj', 'I-1iii', 'II-6a', 'VIII-1b', 'Exhibit-B', 'Exhibit-C'], legalReady: false,
    assumptions: ['Nearest-dollar cell amounts are display values; unrounded amounts preserve the cap-growth formula.',
      'The 2023 agreement may end after 2028–29 if an opt-out is exercised; future rule applicability must be revisited.',
      ...(seasonStartYear > 2029 ? ['2023 rules are carried forward by explicit scenario choice; no future CBA is asserted.'] : [])] };
}

/** Years of Service is the credited YOS for the contract season being selected,
 * not NBA debut age, career appearance count, or a provider experience label. */
export function minimumSalaryForContractYear(scale, { yearsOfService, contractYear } = {}) {
  checkScale(scale);
  if (!Number.isInteger(yearsOfService) || yearsOfService < 0 || !Number.isInteger(contractYear) || contractYear < 1 || contractYear > 5) throw new Error('Minimum salary selection requires nonnegative credited YOS and contract year 1–5.');
  const row = scale.minimumRows.find(row => row.yearsOfService === Math.min(yearsOfService, 10));
  const cell = row?.contractYears.find(cell => cell.contractYear === contractYear);
  if (!cell) throw new Error('This YOS/contract-year combination is not populated in the signed minimum table.');
  return { ...clone(cell), yearsOfService, contractYear, applicableScaleSeasonStartYear: scale.seasonStartYear,
    source: clone(scale.capSource), status: scale.status, ruleRefs: ['II-6a', 'Exhibit-C'] };
}

export function buildMinimumSalarySchedule(scale, { yearsOfServiceByContractYear, seasonStartYear = scale?.seasonStartYear,
  regularSeasonDays = null, coveredDays = null, contractType = 'full-season' } = {}) {
  checkScale(scale);
  if (seasonStartYear !== scale.seasonStartYear || !Array.isArray(yearsOfServiceByContractYear) || !yearsOfServiceByContractYear.length || yearsOfServiceByContractYear.length > 5) throw new Error('Minimum schedule requires its first-season scale and explicit YOS for each of 1–5 contract years.');
  if (!['full-season', 'rest-of-season', 'ten-day'].includes(contractType)) throw new Error('Two-way and other contract types require their own minimum rule branch.');
  let fraction = 1;
  if (contractType !== 'full-season') {
    if (yearsOfServiceByContractYear.length !== 1 || !Number.isInteger(regularSeasonDays) || regularSeasonDays <= 0 ||
        !Number.isInteger(coveredDays) || coveredDays <= 0 || coveredDays > regularSeasonDays) throw new Error('Prorated contracts require one season and resolved positive covered/regular-season day counts.');
    fraction = coveredDays / regularSeasonDays;
  }
  const seasons = yearsOfServiceByContractYear.map((yearsOfService, index) => {
    const minimum = minimumSalaryForContractYear(scale, { yearsOfService, contractYear: index + 1 });
    const unroundedAmountUsd = minimum.unroundedAmountUsd * fraction;
    return { seasonStartYear: seasonStartYear + index, yearsOfService, contractYear: index + 1, applicableScaleSeasonStartYear: scale.seasonStartYear,
      salaryFloorUsd: Math.ceil(unroundedAmountUsd), unroundedAmountUsd, prorationFraction: fraction, source: clone(minimum.source) };
  });
  return { format: 'djhc-minimum-salary-schedule-v1', seasons, contractType, legalReady: false,
    roundingPolicy: 'Ceil the unrounded minimum to whole USD for conservative scenario contracts.',
    disclosure: 'Salary floors alone do not establish signing mechanism, maximum contract length, guarantee, option, tax, or reimbursement legality.' };
}

/** A forfeited pick removes scale rows from the middle, rather than treating
 * the numbered draft slot as an unchanged scale slot. */
export function rookieScaleForSelection(scale, { selectionNumber, forfeitedFirstRoundPicks } = {}) {
  checkScale(scale);
  if (!Number.isInteger(forfeitedFirstRoundPicks) || forfeitedFirstRoundPicks < 0 || forfeitedFirstRoundPicks > 30 ||
      !Number.isInteger(selectionNumber) || selectionNumber < 1 || selectionNumber > 30 - forfeitedFirstRoundPicks) throw new Error('Rookie scale requires a valid first-round selection number and explicit forfeiture count.');
  const removed = Array.from({ length: forfeitedFirstRoundPicks }, (_, index) => 15 + Math.ceil(index / 2) * (index % 2 ? 1 : -1));
  const kept = scale.rookieRows.filter(row => !removed.includes(row.scalePick)).sort((a, b) => a.scalePick - b.scalePick);
  return { ...clone(kept[selectionNumber - 1]), selectionNumber, forfeitedFirstRoundPicks, removedScalePicks: removed.sort((a, b) => a - b),
    applicableScaleSeasonStartYear: scale.seasonStartYear, source: clone(scale.capSource), ruleRefs: ['VIII-1bii'] };
}

export function buildFirstRoundRookieSalarySchedule(scale, { selectionNumber, forfeitedFirstRoundPicks, negotiatedScalePct = 120,
  yearsOfServiceByContractYear = [0, 1, 2, 3] } = {}) {
  const pick = rookieScaleForSelection(scale, { selectionNumber, forfeitedFirstRoundPicks });
  if (!Number.isFinite(negotiatedScalePct) || negotiatedScalePct < 80 || negotiatedScalePct > 120 || yearsOfServiceByContractYear.length !== 4) throw new Error('Rookie schedule requires 80%–120% and explicit YOS for four seasons.');
  const scaleAmounts = [pick.firstYear, pick.secondYear, pick.thirdYearOption];
  const seasons = scaleAmounts.map((cell, index) => {
    const minimum = minimumSalaryForContractYear(scale, { yearsOfService: yearsOfServiceByContractYear[index], contractYear: index + 1 });
    const min = Math.ceil(Math.max(cell.unroundedAmountUsd * 0.8, minimum.unroundedAmountUsd));
    const max = Math.floor(cell.unroundedAmountUsd * 1.2);
    if (min > max) throw new Error('Rookie minimum and maximum bounds conflict.');
    return { seasonStartYear: scale.seasonStartYear + index, contractYear: index + 1, yearsOfService: yearsOfServiceByContractYear[index],
      salaryUsd: Math.min(max, Math.max(min, Math.round(cell.unroundedAmountUsd * negotiatedScalePct / 100))),
      minimumBaseCompensationUsd: min, maximumSalaryPlusUnlikelyBonusUsd: max,
      unroundedScaleAmountUsd: cell.unroundedAmountUsd, teamOption: index === 2, optionDecisionStatus: index === 2 ? 'unresolved' : 'not-applicable' };
  });
  const fourthMinimum = minimumSalaryForContractYear(scale, { yearsOfService: yearsOfServiceByContractYear[3], contractYear: 4 });
  const fourthSalary = Math.round(seasons[2].salaryUsd * (1 + pick.fourthYearOptionIncreasePct / 100));
  if (fourthSalary < Math.ceil(fourthMinimum.unroundedAmountUsd)) throw new Error('Fourth-year rookie option would be below the applicable minimum.');
  seasons.push({ seasonStartYear: scale.seasonStartYear + 3, contractYear: 4, yearsOfService: yearsOfServiceByContractYear[3],
    salaryUsd: fourthSalary, minimumBaseCompensationUsd: Math.ceil(fourthMinimum.unroundedAmountUsd), maximumSalaryPlusUnlikelyBonusUsd: null,
    teamOption: true, optionDecisionStatus: 'unresolved', increaseOverThirdYearPct: pick.fourthYearOptionIncreasePct });
  return { format: 'djhc-first-round-rookie-salary-schedule-v1', applicableScaleSeasonStartYear: scale.seasonStartYear,
    selectionNumber, scalePick: pick.scalePick, forfeitedFirstRoundPicks, negotiatedScalePct, seasons, source: clone(scale.capSource), legalReady: false,
    referenceQualifyingOfferUsd: Math.round(fourthSalary * (1 + pick.qualifyingOfferIncreasePct / 100)),
    qualifyingOfferStatus: 'reference-only-starter-criteria-and-tender-eligibility-not-applied',
    ruleRefs: ['VIII-1a', 'VIII-1b', 'VIII-1c', 'II-6a', 'XI-4'],
    assumptions: ['No signing bonus, loan, incentives, or international-player-payment allocation is included.',
      'Full-season scale; later signing, option notice deadlines and draft-rights eligibility require separate checks.',
      'Option salaries are contingent; neither third- nor fourth-year option is automatically exercised.',
      'Scenario contract amounts round within conservative whole-dollar minimum/maximum bounds; this is not a claimed CBA rounding directive.'] };
}

/** Bounded amount/option checks; full signing and transaction rules remain
 * separate. Unknown facts never count as a passing salary constraint. */
export function evaluateContractSalaryScale({ scale, contractSeasons, input } = {}) {
  const violations = [], missingInputs = [], calculations = [];
  try { checkScale(scale); } catch (error) { missingInputs.push(error.message); }
  if (!input || !Array.isArray(input.yearsOfServiceByContractYear)) missingInputs.push('Contract scale checks require explicit credited YOS by contract year.');
  if (!Array.isArray(contractSeasons) || !contractSeasons.length) missingInputs.push('Contract scale checks require supplied year-by-year terms.');
  if (!missingInputs.length) {
    let schedule;
    try {
      schedule = input.contractType === 'first-round-rookie' ? buildFirstRoundRookieSalarySchedule(scale, input) : buildMinimumSalarySchedule(scale, input);
      if (schedule.seasons.length !== contractSeasons.length) violations.push('Contract term count does not match its minimum/rookie scale schedule.');
    } catch (error) { missingInputs.push(error.message); }
    if (schedule) for (let index = 0; index < contractSeasons.length; index += 1) {
      const term = contractSeasons[index], bounds = schedule.seasons[index];
      if (!bounds) continue;
      if ((term.seasonStartYear ?? term.fromYear) !== bounds.seasonStartYear) violations.push('Contract season is inconsistent with the first-season scale.');
      const amountFor = field => knownAmount(term[field] && typeof term[field] === 'object' ? term[field] : { value: term[field], valueStatus: term.status });
      const salary = amountFor('salary'), likely = amountFor('likelyBonus'), unlikely = amountFor('unlikelyBonus');
      const floor = bounds.minimumBaseCompensationUsd ?? bounds.salaryFloorUsd;
      if (salary === null) missingInputs.push(`Contract year ${index + 1} salary is unresolved.`);
      else if (salary < floor) violations.push(`Contract year ${index + 1} falls below its applicable minimum base compensation.`);
      if (input.contractType === 'first-round-rookie') {
        if (likely === null || unlikely === null) missingInputs.push(`Rookie contract year ${index + 1} bonuses are unresolved.`);
        else if (salary !== null && bounds.maximumSalaryPlusUnlikelyBonusUsd !== null && salary + likely + unlikely > bounds.maximumSalaryPlusUnlikelyBonusUsd) violations.push(`Rookie contract year ${index + 1} exceeds 120% of its scale amount.`);
        const option = knownOption(term.teamOption, term), playerOption = knownOption(term.playerOption, term);
        if (option === null || option === undefined || playerOption === null || playerOption === undefined) missingInputs.push(`Rookie contract year ${index + 1} option type is unresolved.`);
        else if (option !== (index >= 2) || playerOption !== false) violations.push('A first-round rookie contract requires team options only in years three and four.');
        if (index === 3 && salary !== null) {
          const prior = knownAmount(contractSeasons[2]?.salary);
          if (prior === null) missingInputs.push('Rookie fourth-year option requires resolved third-year salary.');
          else if (Math.abs(salary - Math.round(prior * (1 + bounds.increaseOverThirdYearPct / 100))) > 0.01) violations.push('Rookie fourth-year option does not use its required third-year increase.');
        }
      }
      calculations.push({ ...clone(bounds), suppliedBaseSalaryUsd: salary, suppliedLikelyBonusUsd: likely, suppliedUnlikelyBonusUsd: unlikely });
    }
  }
  return { format: 'djhc-contract-salary-scale-evaluation-v1', status: violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass',
    violations: [...new Set(violations)], missingInputs: [...new Set(missingInputs)], calculations, legalReady: false,
    ruleRefs: input?.contractType === 'first-round-rookie' ? ['II-6a', 'VIII-1a', 'VIII-1c'] : ['I-1kk', 'II-6a'] };
}
