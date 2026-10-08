export const CBA_SALARY_MATCHING_FORMAT = 'djhc-cba-salary-matching-screen-v1';

export const CBA_SALARY_MATCHING_SOURCE_REFS = Object.freeze([
  {
    sourceId: 'nba-nbpa-signed-2023-cba',
    sourceVersion: '2023 signed CBA; Article VII Sections 2(e), 6(j)',
    retrievedAt: '2026-10-07', sourceClass: 'official-nbpa-cba',
    sourceUrl: 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf',
  },
  {
    sourceId: 'nba-2024-25-cba-101-trade-exceptions',
    sourceVersion: '2024-25 CBA 101; Article VII Section II.E(1)(i)',
    retrievedAt: '2026-10-07',
    sourceClass: 'official-nba-cba-summary',
    sourceUrl: 'https://cms.nba.com/wp-content/uploads/sites/4/2024/11/2024-25-CBA-101.pdf',
  },
  {
    sourceId: 'nba-trade-deadline-explained',
    sourceVersion: 'NBA trade deadline explained; updated 2026-01-30',
    retrievedAt: '2026-10-07',
    sourceClass: 'official-nba-explanation',
    sourceUrl: 'https://api-hub.nba.com/news/nba-trade-deadline-explained',
  },
]);

const clone = value => structuredClone(value);

function finiteAmount(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * The signed CBA sets a 2023-24 expanded-TPE base allowance of $7.5m,
 * scaled at the same rate as the salary cap ($7.752m in CBA-101 for 2024-25). Future
 * values returned by this helper are therefore explicitly derived candidates,
 * not silently treated as separately published official figures.
 */
export function deriveExpandedTpeFixedAllowance({ seasonStartYear, salaryCapUsd, baseSeasonStartYear = 2023, baseSalaryCapUsd = 136021000, baseAllowanceUsd = 7500000 } = {}) {
  if (!Number.isInteger(seasonStartYear)) return { value: null, status: 'unknown', notes: ['Season is missing.'] };
  if (seasonStartYear < 2023) return { value: null, status: 'not-applicable', notes: ['The 2023 CBA TPE screen applies from 2023-24.'] };
  const cap = finiteAmount(salaryCapUsd);
  if (cap === null || !Number.isFinite(Number(baseSalaryCapUsd)) || Number(baseSalaryCapUsd) <= 0) {
    return { value: null, status: 'unknown', notes: ['A season salary cap and a positive base cap are required to scale the fixed allowance.'] };
  }
  if (seasonStartYear === baseSeasonStartYear) return {
    value: baseAllowanceUsd,
    status: 'source-observed',
    notes: ['2023-24 fixed allowance stated in Article VII Section 6(j)(1)(iv).'],
  };
  return {
    value: Math.round(Number(baseAllowanceUsd) * cap / Number(baseSalaryCapUsd) / 1000) * 1000,
    status: 'derived-candidate',
    notes: ['Scaled from the signed 2023 CBA base allowance, rounded to USD 1,000; remains a derived candidate.'],
  };
}

/**
 * Evaluate the sourced 2023-CBA expanded/standard TPE formulas for one team.
 * The caller must explicitly choose the transaction path. This prevents the
 * simulator from guessing whether an exception, cap room, or apron pathway is
 * available from incomplete team data.
 */
export function evaluateCbaSalaryMatching({
  seasonStartYear,
  ruleVersionId,
  outgoingSalaryUsd,
  incomingSalaryUsd,
  preTradeTeamSalaryUsd,
  postTradeTeamSalaryUsd,
  postTradeApronTeamSalaryUsd,
  outgoingPlayerCount = null,
  isSimultaneous = null,
  capRoomAfterOutgoingUsd = null,
  salaryCapUsd,
  firstApronUsd,
  secondApronUsd,
  transactionPath = null,
  fixedAllowanceUsd = null,
  sourceRefs = CBA_SALARY_MATCHING_SOURCE_REFS,
} = {}) {
  const outgoing = finiteAmount(outgoingSalaryUsd);
  const incoming = finiteAmount(incomingSalaryUsd);
  const preSalary = finiteAmount(preTradeTeamSalaryUsd);
  const postSalary = finiteAmount(postTradeTeamSalaryUsd);
  const postApronSalary = finiteAmount(postTradeApronTeamSalaryUsd);
  const cap = finiteAmount(salaryCapUsd);
  const firstApron = firstApronUsd === null || firstApronUsd === undefined ? null : finiteAmount(firstApronUsd);
  const secondApron = secondApronUsd === null || secondApronUsd === undefined ? null : finiteAmount(secondApronUsd);
  const missingInputs = [];
  const violations = [];
  if (!Number.isInteger(seasonStartYear)) missingInputs.push('Salary-matching screen requires a season.');
  if (ruleVersionId !== 'nba-nbpa-cba-2023') missingInputs.push('A complete legacy (pre-2023) salary-matching profile is not supplied.');
  if (outgoing === null) missingInputs.push('Outgoing CBA trade-salary total is unresolved.');
  if (incoming === null) missingInputs.push('Incoming CBA trade-salary total is unresolved.');
  if (postSalary === null) missingInputs.push('Post-trade team salary is unresolved.');
  if (postApronSalary === null) missingInputs.push('Post-trade Apron Team Salary is unresolved; Team Salary is not a substitute.');
  if (cap === null) missingInputs.push('Season salary cap is unresolved.');
  if (firstApron === null) missingInputs.push('First-apron threshold is unresolved for this rule path.');
  if (secondApron === null) missingInputs.push('Second-apron threshold is unresolved for this rule path.');
  if (!transactionPath) missingInputs.push('Transaction path is not selected (expanded TPE, standard TPE, or cap room).');
  if (missingInputs.length) {
    return {
      format: CBA_SALARY_MATCHING_FORMAT,
      status: 'unknown',
      formulaId: null,
      transactionPath,
      outgoingSalaryUsd: outgoing,
      incomingSalaryUsd: incoming,
      preTradeTeamSalaryUsd: preSalary,
      postTradeTeamSalaryUsd: postSalary,
      matchingLimitUsd: null,
      missingInputs: [...new Set(missingInputs)],
      violations,
      assumptions: [],
      sourceRefs: clone(sourceRefs),
    };
  }
  const allowance = finiteAmount(fixedAllowanceUsd);
  const postAboveFirst = postApronSalary > firstApron;
  const allowance250 = postAboveFirst ? 0 : 250000;
  let matchingLimitUsd = null;
  let formulaId = null;
  const assumptions = [];
  const hardCapTriggers = [];
  const needsAggregation = ['aggregated-standard-tpe', 'expanded-tpe', 'transition-tpe'].includes(transactionPath);
  if (transactionPath !== 'cap-room' && (!Number.isInteger(outgoingPlayerCount) || outgoingPlayerCount < 1)) missingInputs.push('Outgoing player count is unresolved.');
  if (needsAggregation && isSimultaneous !== true) missingInputs.push('This TPE path requires resolved simultaneous acquisition.');
  if (transactionPath === 'cap-room') {
    formulaId = '2023-cba-cap-room-plus-250000';
    const room = finiteAmount(capRoomAfterOutgoingUsd);
    if (capRoomAfterOutgoingUsd !== null && capRoomAfterOutgoingUsd !== undefined && Number(capRoomAfterOutgoingUsd) < 0) violations.push('A cap-room pathway is unavailable when Team Salary after outgoing contracts exceeds the cap.');
    if (room === null) missingInputs.push('Cap room after outgoing contracts and before acquisitions is unresolved.');
    else matchingLimitUsd = room + allowance250;
  } else if (transactionPath === 'standard-tpe') {
    formulaId = '2023-cba-standard-tpe-100-percent-plus-allowance';
    if (Number.isInteger(outgoingPlayerCount) && outgoingPlayerCount !== 1) violations.push('Standard TPE uses one outgoing player; aggregated salaries require a different path.');
    matchingLimitUsd = outgoing + allowance250;
  } else if (transactionPath === 'aggregated-standard-tpe') {
    formulaId = '2023-cba-aggregated-standard-tpe';
    if (Number.isInteger(outgoingPlayerCount) && outgoingPlayerCount < 2) violations.push('Aggregated Standard TPE requires at least two outgoing players.');
    matchingLimitUsd = outgoing + allowance250;
    if (seasonStartYear >= 2024) hardCapTriggers.push({ level: 'second-apron', thresholdUsd: secondApron, rule: 'VII-2e-row-H' });
  } else if (transactionPath === 'transition-tpe') {
    formulaId = '2023-24-only-transition-tpe';
    if (seasonStartYear !== 2023) violations.push('Transition TPE is available only in 2023-24.');
    matchingLimitUsd = 1.1 * outgoing + allowance250;
    assumptions.push('2023-24 transition use also requires separate next-season apron checks.');
  } else if (transactionPath === 'expanded-tpe') {
    if (allowance === null) {
      missingInputs.push('Expanded TPE fixed allowance is unresolved.');
    } else {
      formulaId = '2023-cba-expanded-tpe-greater-of-lesser-200-or-salary-plus-fixed-and-125';
      const lesser = Math.min((2 * outgoing) + allowance250, outgoing + allowance);
      matchingLimitUsd = Math.max(lesser, (1.25 * outgoing) + allowance250);
    }
    hardCapTriggers.push({ level: 'first-apron', thresholdUsd: firstApron, rule: 'VII-2e-row-E' });
  } else {
    missingInputs.push(`Unsupported or unresolved transaction path ${transactionPath}.`);
  }
  if (matchingLimitUsd !== null && incoming > matchingLimitUsd) {
    violations.push(`Incoming trade salary ${incoming} exceeds the ${transactionPath} matching limit ${matchingLimitUsd}.`);
  }
  if (seasonStartYear >= 2024 && transactionPath !== 'cap-room' && incoming > outgoing) {
    hardCapTriggers.push({ level: 'first-apron', thresholdUsd: firstApron, rule: 'VII-2e-row-G' });
  }
  for (const trigger of hardCapTriggers) {
    if (postApronSalary > trigger.thresholdUsd) violations.push(`${transactionPath} triggers a ${trigger.level} hard cap that the resulting Apron Team Salary exceeds.`);
  }
  const status = violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass';
  return {
    format: CBA_SALARY_MATCHING_FORMAT,
    status,
    formulaId,
    transactionPath,
    outgoingSalaryUsd: outgoing,
    incomingSalaryUsd: incoming,
    preTradeTeamSalaryUsd: preSalary,
    postTradeTeamSalaryUsd: postSalary,
    postTradeApronTeamSalaryUsd: postApronSalary,
    outgoingPlayerCount,
    isSimultaneous,
    hardCapTriggers,
    matchingLimitUsd,
    missingInputs: [...new Set(missingInputs)],
    violations,
    assumptions,
    sourceRefs: clone(sourceRefs),
  };
}
