/*
 * Browser-safe structural validator for explicit NBA contract scenarios.
 *
 * This module does not contain or infer historical salary terms. A scenario
 * offer must identify itself as user-declared; source-backed terms are usable
 * only when the caller injects a provenance resolver that verifies them.
 * Passing these checks does not establish full CBA, cap-room, exception,
 * tax/apron, free-agent eligibility, or contract-form compliance.
 *
 * Sources (official NBA-NBPA materials):
 * 2023 CBA, Article VII, Section 5(a) (annual salary increases/decreases),
 * Article VII, Section 8(b)-(e) (trade consent and waiting periods), and
 * Article IX, Sections 1-2 (maximum term and season counting):
 * https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf
 * NBPA CBA index (confirms effective date and term): https://www.nbpa.com/cba
 * NBA season-specific free-agency/trade calendar: https://www.nba.com/news/key-dates
 * The general term is four seasons; specified prior-team and extension cases
 * have the longer limits represented below. Ordinary annual changes use 5%
 * of first-year salary; specified prior-team deals and ordinary extensions
 * use 8%, while trade-connected extensions use 5%. Rule-class eligibility
 * remains a caller assertion because the required service/right/transaction
 * history is not present in the public player-season contract.
 */

export const FRANCHISE_CONTRACT_RULES_VERSION = 'swishiq-franchise-contract-rules-v1';
export const FRANCHISE_CONTRACT_POLICY_ID = 'nba-cba-2023-structural-rules';
export const FRANCHISE_CONTRACT_OFFER_FORMAT = 'djhc-franchise-contract-offer-v1';
export const FRANCHISE_CONTRACT_CBA_SOURCE_URL = 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf';
export const FRANCHISE_CONTRACT_CBA_INDEX_URL = 'https://www.nbpa.com/cba';
export const FRANCHISE_NBA_KEY_DATES_SOURCE_URL = 'https://www.nba.com/news/key-dates';
export const FRANCHISE_TRADE_ELIGIBILITY_VERSION = 'swishiq-franchise-trade-eligibility-v1';
export const FRANCHISE_TRADE_ELIGIBILITY_POLICY_ID = 'nba-cba-2023-player-trade-eligibility';
export const FRANCHISE_FREE_AGENCY_WINDOW_VERSION = 'swishiq-franchise-free-agency-window-v1';
export const FRANCHISE_CONTRACT_VALUATION_VERSION = 'swishiq-franchise-contract-valuation-gate-v1';
export const FRANCHISE_OFFICIAL_CAP_FACTS_VERSION = 'nba-official-salary-cap-facts-v1';

// NBA.com published these 2026-27 dates on September 23, 2026. It publishes
// the trade-deadline date but not a cutoff time on this page; do not turn a
// date-only item into a fabricated RFC3339 cutoff. Free-agency times are stated.
export const FRANCHISE_KNOWN_OFFICIAL_CALENDARS = Object.freeze({
  2026: Object.freeze({
    seasonStartYear: 2026,
    sourceUrl: FRANCHISE_NBA_KEY_DATES_SOURCE_URL,
    sourceRef: '2026-27 NBA key dates; Season Dates and Past Key Dates; updated 2026-09-23',
    tradeDeadlineDate: '2027-02-11',
    tradeDeadlineAt: null,
    negotiationsOpenAt: '2026-06-30T18:00:00-04:00',
    freeAgentSigningsOpenAt: '2026-07-06T12:01:00-04:00',
  }),
});

// Official NBA/NBPA-released salary cap denominators for contract normalization.
// Only fields explicitly stated in the cited release are included; missing
// thresholds are intentionally not derived. This is a cap facts table, not a
// player contract ledger or team salary sheet.
const FRANCHISE_OFFICIAL_CAP_FACT_ROWS = Object.freeze({
  2017: Object.freeze({ salaryCapUsd: 99093000, taxLevelUsd: 119266000, minimumTeamSalaryUsd: 89184000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 8406000, taxpayer: 5192000, room: 4328000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-2017-18-season/', sourceRef: '2017-18 NBA salary cap official release, June 30 2017', sourceVersion: '2017-06-30' }),
  2018: Object.freeze({ salaryCapUsd: 101869000, taxLevelUsd: 123733000, minimumTeamSalaryUsd: 91682000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 8641000, taxpayer: 5337000, room: 4449000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-2018-19-season/', sourceRef: '2018-19 NBA salary cap official release, June 30 2018', sourceVersion: '2018-06-30' }),
  2019: Object.freeze({ salaryCapUsd: 109140000, taxLevelUsd: 132627000, minimumTeamSalaryUsd: 98226000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 9258000, taxpayer: 5718000, room: 4767000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-for-2019-20-season-set-at-109-140-million/', sourceRef: '2019-20 NBA salary cap official release, June 29 2019', sourceVersion: '2019-06-29' }),
  2020: Object.freeze({ salaryCapUsd: 109140000, taxLevelUsd: 132627000, sourceUrl: 'https://pr.nba.com/nba-nbpa-2020-21-season/', sourceRef: 'NBA-NBPA 2020-21 season start and CBA adjustment official release, November 9 2020', sourceVersion: '2020-11-09' }),
  2021: Object.freeze({ salaryCapUsd: 112414000, taxLevelUsd: 136606000, minimumTeamSalaryUsd: 101173000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 9536000, taxpayer: 5890000, room: 4910000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-for-2021-22-season-set-at-112-414-million/', sourceRef: '2021-22 NBA salary cap official release, August 2 2021', sourceVersion: '2021-08-02' }),
  2022: Object.freeze({ salaryCapUsd: 123655000, taxLevelUsd: 150267000, minimumTeamSalaryUsd: 111290000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 10490000, taxpayer: 6479000, room: 5401000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-2022-23-season/', sourceRef: '2022-23 NBA salary cap official release, June 30 2022', sourceVersion: '2022-06-30' }),
  2023: Object.freeze({ salaryCapUsd: 136021000, taxLevelUsd: 165294000, minimumTeamSalaryUsd: 122418000, firstApronUsd: 172346000, secondApronUsd: 182794000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 12405000, taxpayer: 5000000, room: 7723000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-for-2023-24-season-set-at-136-021-million/', sourceRef: '2023-24 NBA salary cap official release, June 30 2023', sourceVersion: '2023-06-30' }),
  2024: Object.freeze({ salaryCapUsd: 140588000, taxLevelUsd: 170814000, minimumTeamSalaryUsd: 126529000, firstApronUsd: 178132000, secondApronUsd: 188931000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 12822000, taxpayer: 5168000, room: 7983000 }), sourceUrl: 'https://pr.nba.com/2024-25-nba-season-salary-cap/', sourceRef: '2024-25 NBA salary cap official release, June 30 2024', sourceVersion: '2024-06-30' }),
  2025: Object.freeze({ salaryCapUsd: 154647000, taxLevelUsd: 187895000, minimumTeamSalaryUsd: 139182000, firstApronUsd: 195945000, secondApronUsd: 207824000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 14104000, taxpayer: 5685000, room: 8781000 }), sourceUrl: 'https://pr.nba.com/nba-salary-cap-2025-26-season/', sourceRef: '2025-26 NBA salary cap official release, June 30 2025', sourceVersion: '2025-06-30' }),
  2026: Object.freeze({ salaryCapUsd: 164961000, taxLevelUsd: 200428000, minimumTeamSalaryUsd: 148465000, firstApronUsd: 209015000, secondApronUsd: 221686000, midLevelExceptionsUsd: Object.freeze({ nonTaxpayer: 15044000, taxpayer: 6064000, room: 9366000 }), sourceUrl: 'https://pr.nba.com/2026-27-salary-cap/', sourceRef: '2026-27 NBA salary cap official release, June 30 2026', sourceVersion: '2026-06-30' }),
});

const CBA_EFFECTIVE_DATE = '2023-07-01';
const MAX_MONEY_CENTS = Number.MAX_SAFE_INTEGER;

// These are the structural categories this compact validator can check. They
// do not establish that a player/team qualifies for the selected category.
export const FRANCHISE_CONTRACT_RULE_CLASSES = Object.freeze({
  'standard-player-contract': Object.freeze({ maxTermSeasons: 4, maxAnnualChangePercent: 5, termCitation: 'Article IX, Section 1', changeCitation: 'Article VII, Section 5(a)(1)' }),
  'qualifying-veteran-prior-team': Object.freeze({ maxTermSeasons: 5, maxAnnualChangePercent: 8, termCitation: 'Article IX, Section 1(a)', changeCitation: 'Article VII, Section 5(a)(2)' }),
  'early-qualifying-veteran-prior-team': Object.freeze({ maxTermSeasons: 4, maxAnnualChangePercent: 8, termCitation: 'Article IX, Section 1', changeCitation: 'Article VII, Section 5(a)(2)' }),
  'rookie-scale-extension': Object.freeze({ maxTermSeasons: 6, maxAnnualChangePercent: 8, termCitation: 'Article IX, Section 1(b)', changeCitation: 'Article VII, Section 5(a)(3)' }),
  'veteran-extension': Object.freeze({ maxTermSeasons: 5, maxAnnualChangePercent: 8, termCitation: 'Article IX, Section 1(c)', changeCitation: 'Article VII, Section 5(a)(3)' }),
  'designated-veteran-player-extension': Object.freeze({ maxTermSeasons: 6, maxAnnualChangePercent: 8, termCitation: 'Article IX, Section 1(d)', changeCitation: 'Article VII, Section 5(a)(3)' }),
  'trade-connected-extension': Object.freeze({ maxTermSeasons: 5, maxAnnualChangePercent: 5, termCitation: 'Article IX, Section 1(c)', changeCitation: 'Article VII, Section 5(a)(4)' }),
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120;

function parseUsdCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const source = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(source)) return null;
  const [whole, fraction = ''] = source.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents <= MAX_MONEY_CENTS ? cents : null;
}

function usdFromCents(cents) {
  return cents / 100;
}

function replaySafeValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 8 || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.slice(0, 64).map(item => replaySafeValue(item, depth + 1, seen));
  } else if (record(value)) {
    output = {};
    Object.keys(value).sort().slice(0, 64).forEach(key => {
      output[key] = replaySafeValue(value[key], depth + 1, seen);
    });
  } else {
    output = null;
  }
  seen.delete(value);
  return output;
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function isoInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function calendarYearForCapDate(value) {
  const date = isoDate(value);
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

function addCalendarMonths(dateString, months) {
  const date = isoDate(dateString);
  if (!date || !Number.isInteger(months)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const targetMonthIndex = (year * 12) + (month - 1) + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function addCalendarDays(dateString, days) {
  const date = isoDate(dateString);
  if (!date || !Number.isInteger(days)) return null;
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function unavailablePolicyResult(code, message, sourceUrl = FRANCHISE_CONTRACT_CBA_SOURCE_URL) {
  return { status: 'unavailable', reasons: [{ code, message }], sourceUrl, sourceRef: null, receipt: null };
}

function normalizeContext(input) {
  const source = record(input) ? input : {};
  const contract = record(source.contract) ? source.contract : source;
  return {
    playerRef: source.playerRef ?? contract.playerRef,
    teamId: source.teamId ?? contract.teamId,
    signedOn: source.signedOn ?? contract.signedOn,
    ruleClass: source.ruleClass ?? contract.ruleClass,
    salaryTerms: source.salaryTerms ?? contract.salaryTerms,
    salaryTermsProvenance: source.salaryTermsProvenance ?? contract.salaryTermsProvenance,
    salaryLimits: source.salaryLimits ?? contract.salaryLimits,
    budgets: source.budgets ?? contract.budgets,
  };
}

function declaredProvenance(context, resolver, originalInput = context) {
  const provenance = context.salaryTermsProvenance;
  if (record(provenance) && provenance.kind === 'user-declared-scenario') {
    return { status: 'declared-scenario', kind: 'user-declared-scenario' };
  }
  if (typeof resolver === 'function') {
    try {
      const resolved = resolver(originalInput);
      if (record(resolved) && resolved.status === 'verified-source'
        && nonEmpty(resolved.sourceId) && nonEmpty(resolved.sourceVersion)
        && nonEmpty(resolved.sourceRef) && typeof resolved.sourceUrl === 'string'
        && resolved.sourceUrl.startsWith('https://')) {
        return {
          status: 'verified-source', kind: 'verified-source',
          sourceId: resolved.sourceId.trim(), sourceVersion: resolved.sourceVersion.trim(),
          sourceRef: resolved.sourceRef.trim(), sourceUrl: resolved.sourceUrl.trim(),
        };
      }
    } catch {
      return { status: 'source-unverified', kind: 'source-unverified' };
    }
  }
  return { status: 'source-unverified', kind: 'source-unverified' };
}

function resultUnavailable(code, message, provenance = { status: 'unavailable', kind: 'unavailable' }) {
  return {
    contractRulesVersion: FRANCHISE_CONTRACT_RULES_VERSION,
    policyId: FRANCHISE_CONTRACT_POLICY_ID,
    sourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL,
    status: 'unavailable',
    valid: false,
    provenance,
    offer: null,
    checks: {},
    errors: [{ code, message }],
    caveats: caveats(),
    canonicalJson: null,
  };
}

function caveats() {
  return [
    'Rule class is a declared scenario input; player service, rights, prior-team status, draft status, and transaction timing are not verified.',
    'Historical contract/salary terms are unavailable in this model lane; a user-declared offer is hypothetical, not an observed NBA contract.',
    'Only term and base-salary year-to-year change structure plus explicitly declared numeric bounds are checked.',
    'Declared roster and payroll thresholds are scenario arithmetic, not NBA roster eligibility, Team Salary, cap room, exception, tax, or apron determinations.',
    'Options, bonuses, incentives, guarantees, waivers, cap holds, trade rules, and other CBA provisions are not evaluated here.',
  ];
}

function canonicalOfferJson(offer, provenance) {
  // Fixed field order and normalized numeric values make saved scenario replay
  // deterministic without timestamps, random IDs, or browser-specific hashes.
  return JSON.stringify({
    format: FRANCHISE_CONTRACT_OFFER_FORMAT,
    policyId: FRANCHISE_CONTRACT_POLICY_ID,
    playerRef: offer.playerRef,
    teamId: offer.teamId,
    signedOn: offer.signedOn,
    ruleClass: offer.ruleClass,
    salaryTerms: offer.salaryTerms.map(term => ({ seasonStartYear: term.seasonStartYear, salaryUsd: term.salaryUsd })),
    salaryTermsProvenance: provenance.kind === 'verified-source'
      ? {
        kind: 'verified-source', sourceId: provenance.sourceId,
        sourceVersion: provenance.sourceVersion, sourceRef: provenance.sourceRef,
        sourceUrl: provenance.sourceUrl,
      }
      : { kind: 'user-declared-scenario' },
    salaryLimits: replaySafeValue(offer.salaryLimits),
    budgets: replaySafeValue(offer.budgets),
  });
}

function validateOptionalLimits(limits, terms, errors) {
  if (limits === undefined) return { status: 'not-declared', rows: [] };
  if (!record(limits)) {
    errors.push({ code: 'salary-limits-invalid', path: 'salaryLimits', message: 'Declared salary limits must be an object.' });
    return { status: 'invalid', rows: [] };
  }
  const rows = [];
  for (const key of ['minimumSalaryUsdByYear', 'maximumSalaryUsdByYear']) {
    if (limits[key] === undefined) continue;
    const values = limits[key];
    if (!Array.isArray(values) || values.length !== terms.length) {
      errors.push({ code: 'salary-limits-length', path: `salaryLimits.${key}`, message: 'Each declared salary-limit array must match salaryTerms length.' });
      continue;
    }
    values.forEach((value, index) => {
      const cents = parseUsdCents(value);
      if (cents === null) {
        errors.push({ code: 'salary-limit-amount-invalid', path: `salaryLimits.${key}[${index}]`, message: 'Declared salary bounds must be non-negative USD amounts with at most two decimal places.' });
        return;
      }
      const salaryCents = parseUsdCents(terms[index].salaryUsd);
      const passed = key === 'minimumSalaryUsdByYear' ? salaryCents >= cents : salaryCents <= cents;
      rows.push({ seasonStartYear: terms[index].seasonStartYear, bound: key, amountUsd: usdFromCents(cents), salaryUsd: terms[index].salaryUsd, status: passed ? 'pass' : 'fail' });
      if (!passed) errors.push({ code: key === 'minimumSalaryUsdByYear' ? 'salary-below-declared-minimum' : 'salary-above-declared-maximum', path: `salaryTerms[${index}].salaryUsd`, message: `Salary for ${terms[index].seasonStartYear} is outside the caller-declared ${key === 'minimumSalaryUsdByYear' ? 'minimum' : 'maximum'}.` });
    });
  }
  return { status: errors.some(item => item.path?.startsWith('salaryLimits.')) ? 'invalid' : rows.some(row => row.status === 'fail') ? 'fail' : rows.length ? 'pass' : 'not-declared', rows };
}

function validateDeclaredBudgets(budgets, terms, errors) {
  if (budgets === undefined) return { roster: { status: 'not-declared' }, teamSalary: { status: 'not-declared' } };
  if (!record(budgets)) {
    errors.push({ code: 'budgets-invalid', path: 'budgets', message: 'Declared budgets must be an object.' });
    return { roster: { status: 'invalid' }, teamSalary: { status: 'invalid' } };
  }

  const checks = { roster: { status: 'not-declared' }, teamSalary: { status: 'not-declared' } };
  if (budgets.roster !== undefined) {
    const roster = budgets.roster;
    const count = Number(roster?.postOfferCount);
    const limit = Number(roster?.rosterLimit);
    if (!record(roster) || !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(limit) || limit < 0) {
      checks.roster = { status: 'invalid' };
      errors.push({ code: 'roster-budget-invalid', path: 'budgets.roster', message: 'Roster budget requires non-negative integer postOfferCount and rosterLimit values.' });
    } else {
      const status = count <= limit ? 'pass' : 'fail';
      checks.roster = { status, postOfferCount: count, rosterLimit: limit };
      if (status === 'fail') errors.push({ code: 'roster-budget-exceeded', path: 'budgets.roster.postOfferCount', message: 'The caller-declared post-offer roster exceeds its declared limit.' });
    }
  }

  if (budgets.teamSalary !== undefined) {
    const teamSalary = budgets.teamSalary;
    const totalValues = teamSalary?.postOfferSalaryUsdByYear;
    const capValues = teamSalary?.capLimitUsdByYear;
    if (!record(teamSalary) || !Array.isArray(totalValues) || !Array.isArray(capValues) || totalValues.length !== terms.length || capValues.length !== terms.length) {
      checks.teamSalary = { status: 'invalid' };
      errors.push({ code: 'team-salary-budget-shape', path: 'budgets.teamSalary', message: 'Payroll budget arrays must each match salaryTerms length and represent the caller-declared post-offer values.' });
    } else {
      const rows = [];
      totalValues.forEach((amount, index) => {
        const totalCents = parseUsdCents(amount);
        const capCents = parseUsdCents(capValues[index]);
        if (totalCents === null || capCents === null) {
          errors.push({ code: 'team-salary-budget-amount-invalid', path: `budgets.teamSalary[${index}]`, message: 'Payroll totals and cap thresholds must be non-negative USD amounts with at most two decimal places.' });
          rows.push({ seasonStartYear: terms[index].seasonStartYear, status: 'invalid' });
          return;
        }
        const status = totalCents <= capCents ? 'pass' : 'fail';
        rows.push({ seasonStartYear: terms[index].seasonStartYear, postOfferSalaryUsd: usdFromCents(totalCents), capLimitUsd: usdFromCents(capCents), status });
        if (status === 'fail') errors.push({ code: 'team-salary-budget-exceeded', path: `budgets.teamSalary.postOfferSalaryUsdByYear[${index}]`, message: `Caller-declared payroll exceeds the declared threshold in ${terms[index].seasonStartYear}.` });
      });
      checks.teamSalary = { status: rows.some(row => row.status === 'invalid') ? 'invalid' : rows.some(row => row.status === 'fail') ? 'fail' : 'pass', rows };
    }
  }
  return checks;
}

function evaluateContract(input, { provenanceResolver = null } = {}) {
  const context = normalizeContext(input);
  const provenance = declaredProvenance(context, provenanceResolver, input);
  if (!Array.isArray(context.salaryTerms) || context.salaryTerms.length === 0) {
    return resultUnavailable('salary-terms-unavailable', 'No explicit per-season salaryTerms were supplied.', provenance);
  }
  if (provenance.status === 'source-unverified') {
    return resultUnavailable('salary-terms-provenance-unverified', 'Salary terms require explicit user-declared scenario provenance or a caller-injected source resolver that verifies them.', provenance);
  }
  if (!nonEmpty(context.playerRef) || !nonEmpty(context.teamId)) {
    return resultUnavailable('offer-subject-unavailable', 'A playerRef and teamId are required to evaluate a contract offer.', provenance);
  }
  if (!own(FRANCHISE_CONTRACT_RULE_CLASSES, context.ruleClass)) {
    return resultUnavailable('rule-class-unavailable', 'A supported CBA structural ruleClass must be explicitly declared.', provenance);
  }
  const signedOn = isoDate(context.signedOn);
  if (!signedOn || signedOn < CBA_EFFECTIVE_DATE) {
    return resultUnavailable('cba-date-unavailable', 'This validator covers contracts explicitly signed on or after 2023-07-01; earlier contracts require the applicable historical CBA rule set.', provenance);
  }

  const errors = [];
  const rule = FRANCHISE_CONTRACT_RULE_CLASSES[context.ruleClass];
  const inputRows = context.salaryTerms.map((term, index) => ({ term, index }));
  if (inputRows.some(row => !record(row.term))) {
    return resultUnavailable('salary-term-shape-invalid', 'Each salaryTerms entry must be an object.', provenance);
  }
  const rows = inputRows.map(({ term, index }) => {
    const seasonStartYear = Number(term.seasonStartYear);
    const cents = parseUsdCents(term.salaryUsd);
    if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 1946 || seasonStartYear > 2500) {
      errors.push({ code: 'salary-season-invalid', path: `salaryTerms[${index}].seasonStartYear`, message: 'Salary term seasonStartYear must be a valid four-digit NBA season start year.' });
    }
    if (cents === null || cents <= 0) {
      errors.push({ code: 'salary-amount-invalid', path: `salaryTerms[${index}].salaryUsd`, message: 'Salary must be a positive USD amount with at most two decimal places.' });
    }
    return { seasonStartYear, salaryUsd: cents === null ? null : usdFromCents(cents), cents };
  });

  if (rows.length > rule.maxTermSeasons) {
    errors.push({ code: 'contract-term-exceeded', path: 'salaryTerms', message: `${context.ruleClass} is limited to ${rule.maxTermSeasons} covered seasons under the declared 2023 CBA structural rule.` });
  }
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].seasonStartYear !== rows[index - 1].seasonStartYear + 1) {
      errors.push({ code: 'salary-seasons-not-contiguous', path: `salaryTerms[${index}].seasonStartYear`, message: 'Salary term seasons must be contiguous and unique.' });
      break;
    }
  }
  if (rows.some(row => row.cents === null)) {
    // Amount errors already identify the exact row; don't attempt a percentage
    // calculation using the missing value.
  } else {
    const firstSalaryCents = rows[0]?.cents || 0;
    const maxChangeCents = firstSalaryCents * rule.maxAnnualChangePercent / 100;
    for (let index = 1; index < rows.length; index += 1) {
      const changeCents = Math.abs(rows[index].cents - rows[index - 1].cents);
      if (changeCents > maxChangeCents) {
        errors.push({ code: 'annual-salary-change-exceeded', path: `salaryTerms[${index}].salaryUsd`, message: `Year-to-year base salary change exceeds ${rule.maxAnnualChangePercent}% of first-year salary under ${rule.changeCitation}.` });
      }
    }
  }
  const normalizedRows = rows.map(({ seasonStartYear, salaryUsd }) => ({ seasonStartYear, salaryUsd }));
  const normalizedOffer = {
    playerRef: context.playerRef.trim(),
    teamId: context.teamId.trim(),
    signedOn,
    ruleClass: context.ruleClass,
    salaryTerms: normalizedRows,
    salaryLimits: replaySafeValue(context.salaryLimits),
    budgets: replaySafeValue(context.budgets),
  };
  const salaryLimits = validateOptionalLimits(context.salaryLimits, normalizedRows, errors);
  const budgets = validateDeclaredBudgets(context.budgets, normalizedRows, errors);
  const canonicalJson = canonicalOfferJson(normalizedOffer, provenance);
  const status = errors.length ? 'scenario-structure-rejected' : 'scenario-structure-passes';
  return {
    contractRulesVersion: FRANCHISE_CONTRACT_RULES_VERSION,
    policyId: FRANCHISE_CONTRACT_POLICY_ID,
    sourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL,
    status,
    valid: errors.length === 0,
    provenance,
    rule: {
      ruleClass: context.ruleClass,
      classEligibility: 'caller-declared-not-verified',
      maxTermSeasons: rule.maxTermSeasons,
      maxAnnualChangePercentOfFirstYearSalary: rule.maxAnnualChangePercent,
      termCitation: rule.termCitation,
      changeCitation: rule.changeCitation,
    },
    offer: normalizedOffer,
    checks: {
      term: { status: normalizedRows.length <= rule.maxTermSeasons ? 'pass' : 'fail', coveredSeasons: normalizedRows.length, maxTermSeasons: rule.maxTermSeasons },
      annualSalaryChanges: { status: errors.some(item => item.code === 'annual-salary-change-exceeded') ? 'fail' : 'pass', basis: `${rule.maxAnnualChangePercent}% of first-year salary`, changesUseFirstYearBase: true },
      salaryLimits,
      budgets,
    },
    errors,
    caveats: caveats(),
    canonicalJson,
  };
}

/**
 * Explicit scenario offer validator. For a player contract, use the nested
 * `contract` object, including salaryTerms and salaryTermsProvenance.
 */
export function validateFranchiseContractOffer(input) {
  return evaluateContract(input);
}

/**
 * Factory matching the injected policy contract used by downstream trade
 * evaluators. A source resolver must synchronously return
 * `{ status: 'verified-source', sourceId, sourceVersion, sourceRef,
 * sourceUrl }`; this module does not fetch or authenticate a source itself.
 */
export function createFranchiseContractRules({ resolveSalaryTermsProvenance = null } = {}) {
  return Object.freeze({
    policyId: FRANCHISE_CONTRACT_POLICY_ID,
    version: FRANCHISE_CONTRACT_RULES_VERSION,
    sourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL,
    appliesTo(input) {
      const context = normalizeContext(input);
      const provenance = declaredProvenance(context, resolveSalaryTermsProvenance, input);
      return Array.isArray(context.salaryTerms)
        && context.salaryTerms.length > 0
        && own(FRANCHISE_CONTRACT_RULE_CLASSES, context.ruleClass)
        && Boolean(isoDate(context.signedOn) && context.signedOn >= CBA_EFFECTIVE_DATE)
        && provenance.status !== 'source-unverified';
    },
    evaluate(input) {
      return evaluateContract(input, { provenanceResolver: resolveSalaryTermsProvenance });
    },
  });
}

function evidenceMeta(evidence) {
  if (!record(evidence) || evidence.status !== 'verified-source'
    || !nonEmpty(evidence.sourceId) || !nonEmpty(evidence.sourceVersion)
    || !nonEmpty(evidence.sourceRef) || typeof evidence.sourceUrl !== 'string'
    || !evidence.sourceUrl.startsWith('https://')) return null;
  return {
    status: 'verified-source', sourceId: evidence.sourceId.trim(),
    sourceVersion: evidence.sourceVersion.trim(), sourceRef: evidence.sourceRef.trim(),
    sourceUrl: evidence.sourceUrl.trim(),
  };
}

function officialCalendarFor(seasonStartYear, resolver, context) {
  if (typeof resolver === 'function') {
    try { return resolver({ ...context, seasonStartYear }); } catch { return null; }
  }
  const known = FRANCHISE_KNOWN_OFFICIAL_CALENDARS[seasonStartYear];
  return known ? { ...known, status: 'verified-source', sourceId: 'nba-key-dates', sourceVersion: '2026-09-23', scopeSeasonStartYear: seasonStartYear } : null;
}

function officialCalendarMeta(calendar, seasonStartYear) {
  if (!record(calendar) || calendar.status !== 'verified-source'
    || Number(calendar.seasonStartYear ?? calendar.scopeSeasonStartYear) !== seasonStartYear
    || !nonEmpty(calendar.sourceRef) || typeof calendar.sourceUrl !== 'string'
    || !calendar.sourceUrl.startsWith('https://')) return null;
  return {
    status: 'verified-source',
    sourceId: nonEmpty(calendar.sourceId) ? calendar.sourceId.trim() : 'official-calendar',
    sourceVersion: nonEmpty(calendar.sourceVersion) ? calendar.sourceVersion.trim() : null,
    sourceRef: calendar.sourceRef.trim(), sourceUrl: calendar.sourceUrl.trim(),
  };
}

function reason(code, message) {
  return { code, message };
}

/**
 * Returns current official NBA calendar facts only where NBA.com publishes
 * them. For 2026-27 the deadline date is known, but the cited key-dates page
 * does not state the cutoff time; trade comparison therefore remains blocked
 * unless a caller supplies a verified exact cutoff timestamp.
 */
export function getFranchiseOfficialCalendar(seasonStartYear) {
  const year = Number(seasonStartYear);
  const calendar = FRANCHISE_KNOWN_OFFICIAL_CALENDARS[year];
  if (!calendar) return { status: 'unavailable', seasonStartYear: Number.isInteger(year) ? year : null, sourceUrl: FRANCHISE_NBA_KEY_DATES_SOURCE_URL, reasons: [reason('season-calendar-not-included', 'No official NBA calendar record is embedded for this season; inject one with a verifiable source reference.')] };
  return {
    status: 'verified-source', seasonStartYear: calendar.seasonStartYear,
    tradeDeadlineDate: calendar.tradeDeadlineDate, tradeDeadlineAt: calendar.tradeDeadlineAt,
    negotiationsOpenAt: calendar.negotiationsOpenAt,
    freeAgentSigningsOpenAt: calendar.freeAgentSigningsOpenAt,
    sourceId: 'nba-key-dates', sourceVersion: '2026-09-23',
    sourceRef: calendar.sourceRef, sourceUrl: calendar.sourceUrl,
  };
}

/**
 * Returns NBA-announced season cap facts for exact normalization and scenario
 * display. It contains no player salary records and no team-specific cap holds.
 */
export function getFranchiseOfficialSalaryCapFacts(seasonStartYear) {
  const year = Number(seasonStartYear);
  const facts = Number.isInteger(year) ? FRANCHISE_OFFICIAL_CAP_FACT_ROWS[year] : null;
  if (!facts) return {
    status: 'unavailable', seasonStartYear: Number.isInteger(year) ? year : null,
    sourceId: 'nba-official-salary-cap-facts', sourceVersion: FRANCHISE_OFFICIAL_CAP_FACTS_VERSION,
    sourceUrl: 'https://pr.nba.com/tag/salary-cap/',
    reasons: [reason('official-salary-cap-facts-not-included', 'No exact NBA-announced salary-cap record is embedded for this season.')],
  };
  return {
    ...facts, status: 'verified-source', seasonStartYear: year,
    sourceId: 'nba-official-salary-cap-facts', sourceVersion: FRANCHISE_OFFICIAL_CAP_FACTS_VERSION,
  };
}

/**
 * Builds a source-pinned official cap denominator panel over an inclusive
 * contiguous span. Every row retains its individual NBA/NBPA release citation.
 */
export function getFranchiseOfficialSalaryCapHistory({ firstSeasonStartYear = 2017, lastSeasonStartYear = 2026 } = {}) {
  const first = Number(firstSeasonStartYear);
  const last = Number(lastSeasonStartYear);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 2017 || last > 2026 || first > last) {
    return {
      status: 'unavailable', sourceId: 'nba-official-salary-cap-facts',
      sourceVersion: FRANCHISE_OFFICIAL_CAP_FACTS_VERSION,
      reasons: [reason('official-salary-cap-range-invalid', 'Choose a contiguous inclusive season-start-year range within the source-verified 2017-2026 window.')],
    };
  }
  const rows = [];
  for (let year = first; year <= last; year += 1) {
    const fact = getFranchiseOfficialSalaryCapFacts(year);
    if (fact.status !== 'verified-source') return {
      status: 'unavailable', sourceId: 'nba-official-salary-cap-facts',
      sourceVersion: FRANCHISE_OFFICIAL_CAP_FACTS_VERSION,
      reasons: [reason('official-salary-cap-season-gap', `The NBA cap record for ${year}-${String(year + 1).slice(-2)} is not verified.`)],
    };
    rows.push(fact);
  }
  return {
    status: 'verified-source', capability: 'salary-cap-history',
    sourceId: 'nba-official-salary-cap-facts', sourceVersion: FRANCHISE_OFFICIAL_CAP_FACTS_VERSION,
    sourceRef: `NBA official salary-cap announcements for seasons ${first}-${String(last + 1).slice(-2)}; row-specific citations included`,
    sourceUrl: 'https://pr.nba.com/tag/salary-cap/',
    normalizationBasis: 'salary-percent-of-cap', rows,
  };
}

function isVerifiedOfficialSalaryCapHistory(panel) {
  if (!record(panel) || panel.status !== 'verified-source'
    || panel.capability !== 'salary-cap-history'
    || panel.sourceId !== 'nba-official-salary-cap-facts'
    || panel.sourceVersion !== FRANCHISE_OFFICIAL_CAP_FACTS_VERSION
    || panel.normalizationBasis !== 'salary-percent-of-cap'
    || !Array.isArray(panel.rows) || !panel.rows.length) return false;
  let previousYear = null;
  return panel.rows.every(row => {
    const year = Number(row?.seasonStartYear);
    const official = FRANCHISE_OFFICIAL_CAP_FACT_ROWS[year];
    const valid = row?.status === 'verified-source' && official
      && Number.isInteger(year) && (previousYear === null || year === previousYear + 1)
      && Number(row.salaryCapUsd) === official.salaryCapUsd
      && row.sourceId === 'nba-official-salary-cap-facts'
      && row.sourceVersion === FRANCHISE_OFFICIAL_CAP_FACTS_VERSION
      && row.sourceRef === official.sourceRef && row.sourceUrl === official.sourceUrl;
    previousYear = valid ? year : previousYear;
    return Boolean(valid);
  });
}

function evaluateTradeDate(input, resolveOfficialTradeCutoff) {
  const context = record(input) ? input : {};
  const salaryCapYear = Number(context.salaryCapYear);
  const seasonStartYear = Number(context.stateSeasonStartYear ?? context.seasonStartYear ?? salaryCapYear);
  const transactionAt = context.transactionAt;
  const transactionMs = isoInstant(transactionAt);
  if (!Number.isInteger(salaryCapYear) || salaryCapYear < 1946 || salaryCapYear > 2500
    || !Number.isInteger(seasonStartYear) || seasonStartYear < 1946 || seasonStartYear > 2500
    || transactionMs === null) {
    return unavailablePolicyResult('trade-date-context-incomplete', 'Trade-date evaluation requires integer salaryCapYear/stateSeasonStartYear and an exact transactionAt timestamp with an explicit UTC offset.');
  }
  if (salaryCapYear !== seasonStartYear) return unavailablePolicyResult('salary-cap-season-mismatch', 'In-season trade validation requires salaryCapYear to match stateSeasonStartYear; offseason/transition dates need a separate sourced transaction calendar.');
  const calendar = officialCalendarFor(seasonStartYear, resolveOfficialTradeCutoff, context);
  const source = officialCalendarMeta(calendar, seasonStartYear);
  if (!source) return unavailablePolicyResult('official-trade-cutoff-source-unverified', 'No season-matched official NBA cutoff source was verified.', FRANCHISE_NBA_KEY_DATES_SOURCE_URL);
  const cutoffMs = isoInstant(calendar.tradeDeadlineAt ?? calendar.cutoffAt);
  const cutoffAt = calendar.tradeDeadlineAt ?? calendar.cutoffAt;
  if (cutoffMs === null) {
    return {
      status: 'unavailable',
      reasons: [reason('official-trade-deadline-time-unavailable', `NBA.com publishes ${calendar.tradeDeadlineDate || 'a deadline date'} for this season but the verified source does not provide the exact deadline time and timezone.`)],
      cutoffAt: null, deadlineDate: isoDate(calendar.tradeDeadlineDate) || null,
      sourceId: source.sourceId, sourceVersion: source.sourceVersion,
      sourceUrl: source.sourceUrl, sourceRef: source.sourceRef, provenance: source,
      receipt: { seasonStartYear, salaryCapYear, precision: 'date-only-source-cannot-validate-instant', sourceId: source.sourceId, sourceVersion: source.sourceVersion },
    };
  }
  const deadlineDate = isoDate(calendar.tradeDeadlineDate);
  if (deadlineDate && cutoffAt.slice(0, 10) !== deadlineDate) {
    return unavailablePolicyResult('trade-cutoff-date-conflict', 'Official cutoff timestamp and published trade-deadline date do not match.', source.sourceUrl);
  }
  const status = transactionMs <= cutoffMs ? 'pass' : 'fail';
  return {
    status,
    reasons: status === 'pass' ? [] : [reason('after-official-trade-deadline', 'The transaction timestamp is after the verified season-specific NBA trade deadline.')],
    cutoffAt, deadlineDate: deadlineDate || cutoffAt.slice(0, 10),
    sourceId: source.sourceId, sourceVersion: source.sourceVersion,
    sourceUrl: source.sourceUrl, sourceRef: source.sourceRef, provenance: source,
    receipt: { seasonStartYear, salaryCapYear, transactionAt, cutoffAt, comparison: 'transactionAt <= cutoffAt', sourceId: source.sourceId, sourceVersion: source.sourceVersion },
  };
}

function validatePlayerRestrictionFacts(context, facts) {
  const contractRuleClass = record(context.contract) ? context.contract.ruleClass : context.ruleClass;
  const contextSignedOn = isoDate(context.signedOn ?? context.contract?.signedOn);
  const evidenceSignedOn = isoDate(facts?.signedOn);
  const requiredBooleans = ['draftRookie', 'contractIsTwoWay', 'standardFreeAgentSigning', 'initialSignAndTrade', 'priorTeamVeteranReSign', 'oneYearQvfaConsentRight'];
  if (!record(facts) || facts.coverage !== 'all-player-specific-trade-restrictions'
    || facts.signedStatus !== 'under-contract' || !contextSignedOn || evidenceSignedOn !== contextSignedOn
    || !['standard', 'two-way'].includes(facts.contractType)
    || !own(FRANCHISE_CONTRACT_RULE_CLASSES, contractRuleClass)
    || facts.contractRuleClass !== contractRuleClass
    || requiredBooleans.some(key => typeof facts[key] !== 'boolean')
    || !['clear', 'blocked', 'unknown'].includes(facts.otherPlayerRestrictionsStatus)) {
    return { status: 'unavailable', reasons: [reason('player-trade-restriction-facts-incomplete', 'A source-verified complete player-specific restriction record, including actual under-contract status, exact signedOn date, and an exact binding to the evaluated contract ruleClass, is required; caller-declared values alone are insufficient.')] };
  }
  if (facts.otherPlayerRestrictionsStatus === 'blocked') return { status: 'fail', reasons: [reason('other-player-specific-trade-restriction', 'The verified contract record reports an additional player-specific trade restriction.')] };
  if (facts.otherPlayerRestrictionsStatus !== 'clear') return { status: 'unavailable', reasons: [reason('other-player-specific-trade-restrictions-unknown', 'Other player-specific trade and consent restrictions are not confirmed clear.')] };
  if (facts.priorTeamVeteranReSign && !facts.standardFreeAgentSigning) {
    return { status: 'unavailable', reasons: [reason('prior-team-signing-facts-conflict', 'A prior-team veteran re-sign must also be classified as a Standard Contract free-agent signing before its special waiting rule can be checked.')] };
  }

  const signedOn = isoDate(context.signedOn ?? context.contract?.signedOn);
  const transactionDate = context.transactionAt.slice(0, 10);
  if ((facts.draftRookie || facts.contractIsTwoWay) && !signedOn) {
    return { status: 'unavailable', reasons: [reason('contract-signing-date-unavailable', 'The signed-on date is required to evaluate the 30-day rookie/Two-Way restriction.')] };
  }
  if ((facts.draftRookie || facts.contractIsTwoWay) && transactionDate < addCalendarDays(signedOn, 30)) {
    return { status: 'fail', reasons: [reason('30-day-rookie-or-two-way-wait', 'The CBA prohibits trading the applicable signed draft rookie or Two-Way player before 30 days have elapsed.')] };
  }

  if (facts.standardFreeAgentSigning) {
    if (!signedOn) return { status: 'unavailable', reasons: [reason('free-agent-signing-date-unavailable', 'The signing/conversion date is required for the free-agent trade waiting period.')] };
    const initialSignAndTrade = facts.initialSignAndTrade;
    const tradeCount = facts.signAndTradeTradeCount;
    if (initialSignAndTrade && (!Number.isInteger(tradeCount) || tradeCount < 0)) {
      return { status: 'unavailable', reasons: [reason('sign-and-trade-history-unavailable', 'Sign-and-trade initial/second-trade status is required.')] };
    }
    const initialExemptTrade = initialSignAndTrade && tradeCount === 0;
    if (!initialExemptTrade) {
      const capYearAtSigning = calendarYearForCapDate(signedOn);
      const december15 = `${String(capYearAtSigning).padStart(4, '0')}-12-15`;
      let blockedUntil = [addCalendarMonths(signedOn, 3), december15].sort().at(-1);
      if (facts.priorTeamVeteranReSign) {
        const rightsClass = facts.veteranRightsClass;
        const aboveCap = facts.teamSalaryAboveCapImmediatelyAfterSigning;
        const newSalaryCents = parseUsdCents(facts.firstSeasonSalaryUsd);
        const priorSalaryCents = parseUsdCents(facts.priorLastSeasonSalaryUsd);
        const minimumNoBonuses = facts.minimumSalaryNoBonuses;
        if (!['qualifying', 'early-qualifying', 'other'].includes(rightsClass)
          || typeof aboveCap !== 'boolean' || newSalaryCents === null || priorSalaryCents === null
          || typeof minimumNoBonuses !== 'boolean') {
          return { status: 'unavailable', reasons: [reason('prior-team-re-sign-facts-incomplete', 'Qualifying rights, post-signing team salary, relevant salary amounts, and minimum-salary status are required to determine whether January 15 applies.')] };
        }
        const qualifyingClass = rightsClass === 'qualifying' || rightsClass === 'early-qualifying';
        const exceeds120Percent = newSalaryCents * 100 > priorSalaryCents * 120;
        if (qualifyingClass && aboveCap && exceeds120Percent && !minimumNoBonuses) {
          blockedUntil = [addCalendarMonths(signedOn, 3), `${String(capYearAtSigning + 1).padStart(4, '0')}-01-15`].sort().at(-1);
        }
      }
      if (transactionDate < blockedUntil) {
        return { status: 'fail', reasons: [reason('free-agent-trade-waiting-period', `The CBA waiting period for this Standard Contract runs through ${blockedUntil}; transaction date is ${transactionDate}.`)], blockedUntil };
      }
    }
  }

  if (facts.oneYearQvfaConsentRight) {
    const consent = facts.playerConsentStatus;
    if (!['granted', 'waived-at-signing', 'denied'].includes(consent)) {
      return { status: 'unavailable', reasons: [reason('player-trade-consent-unavailable', 'Verified player consent or a contemporaneous waiver of the consent right is required for this one-year veteran contract.')] };
    }
    if (consent === 'denied') return { status: 'fail', reasons: [reason('player-trade-consent-denied', 'The verified player record indicates that required trade consent has not been given.')] };
  }
  return { status: 'pass', reasons: [], contractRuleClass, signedOn: evidenceSignedOn };
}

/**
 * CBA eligibility adapter for in-season trades. It only adjudicates the
 * source-backed player restrictions in Article VII, Section 8(b)-(d); salary
 * matching, aprons, team-side rules, and CBA exceptions remain a separate
 * injected policy. The resolver must return a complete, source-verified
 * restriction record; absent historical contract data is unavailable.
 */
export function createFranchiseTradeEligibilityRules({
  resolveOfficialTradeCutoff = null,
  resolvePlayerRestrictionFacts = null,
} = {}) {
  const evaluatePlayer = input => {
    const context = record(input) ? input : {};
    const base = {
      status: 'unavailable', reasons: [], sourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL,
      sourceRef: 'Article VII, Section 8(b)-(d)', receipt: null,
    };
    if (!Number.isInteger(Number(context.salaryCapYear)) || !nonEmpty(context.teamId) || !nonEmpty(context.playerRef)
      || isoInstant(context.transactionAt) === null) {
      return { ...base, reasons: [reason('player-trade-context-incomplete', 'Player trade evaluation requires salaryCapYear, teamId, playerRef, and an exact transactionAt timestamp with timezone.')] };
    }
    if (context.signedStatus !== 'under-contract') {
      return context.signedStatus === 'unsigned-free-agent' || context.signedStatus === 'waived'
        ? { ...base, status: 'fail', reasons: [reason('player-not-under-contract', 'An unsigned free agent or waived player is not transferable as an under-contract player asset.')] }
        : { ...base, reasons: [reason('player-signed-status-unavailable', 'A verified under-contract status is required; roster membership is not contract status.')] };
    }
    const dateResult = evaluateTradeDate({
      salaryCapYear: Number(context.salaryCapYear),
      stateSeasonStartYear: Number(context.stateSeasonStartYear ?? context.seasonStartYear ?? context.salaryCapYear),
      transactionAt: context.transactionAt,
      transactionDate: context.transactionAt,
      participants: [{ teamId: context.teamId }],
    }, resolveOfficialTradeCutoff);
    if (dateResult.status !== 'pass') return {
      ...base, status: dateResult.status, reasons: dateResult.reasons,
      sourceId: dateResult.sourceId, sourceVersion: dateResult.sourceVersion,
      sourceUrl: dateResult.sourceUrl, sourceRef: dateResult.sourceRef,
      provenance: dateResult.provenance,
      ruleSourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL,
      ruleSourceRef: base.sourceRef,
      receipt: { dateCheck: dateResult.receipt, cutoffAt: dateResult.cutoffAt },
    };
    if (typeof resolvePlayerRestrictionFacts !== 'function') {
      return { ...base, reasons: [reason('player-contract-restrictions-not-sourced', 'No accepted player contract/restriction history resolver was supplied.')] };
    }
    let resolved;
    try { resolved = resolvePlayerRestrictionFacts(context); } catch { resolved = null; }
    const source = evidenceMeta(resolved);
    if (!source) return { ...base, reasons: [reason('player-contract-restriction-source-unverified', 'Player trade restrictions require a verified source id, version, reference, and HTTPS URL.')] };
    const checked = validatePlayerRestrictionFacts(context, resolved.facts);
    return {
      ...base, status: checked.status, reasons: checked.reasons,
      contractRuleClass: checked.status === 'pass' ? checked.contractRuleClass : null,
      signedOn: checked.status === 'pass' ? checked.signedOn : null,
      sourceId: source.sourceId, sourceVersion: source.sourceVersion,
      sourceRef: source.sourceRef, sourceUrl: source.sourceUrl,
      provenance: source,
      ruleSourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL, ruleSourceRef: base.sourceRef,
      receipt: {
        seasonStartYear: Number(context.stateSeasonStartYear ?? context.seasonStartYear ?? context.salaryCapYear),
        salaryCapYear: Number(context.salaryCapYear), teamId: context.teamId.trim(), playerRef: context.playerRef.trim(),
        contractRuleClass: checked.status === 'pass' ? checked.contractRuleClass : null,
        signedStatus: checked.status === 'pass' ? 'under-contract' : context.signedStatus,
        signedOn: checked.status === 'pass' ? checked.signedOn : null,
        transactionAt: context.transactionAt, restrictionChecks: checked,
        contractEvidence: source, deadlineEvidence: dateResult.receipt,
        ruleSourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL, ruleSourceRef: base.sourceRef,
      },
    };
  };
  return Object.freeze({
    policyId: FRANCHISE_TRADE_ELIGIBILITY_POLICY_ID,
    version: FRANCHISE_TRADE_ELIGIBILITY_VERSION,
    sourceUrl: FRANCHISE_CONTRACT_CBA_SOURCE_URL,
    appliesTo(context) {
      const seasonStartYear = Number(context?.stateSeasonStartYear ?? context?.seasonStartYear ?? context?.salaryCapYear);
      const salaryCapYear = Number(context?.salaryCapYear);
      return Number.isInteger(salaryCapYear) && salaryCapYear === seasonStartYear
        && isoInstant(context?.transactionAt) !== null
        && typeof resolveOfficialTradeCutoff === 'function'
        && typeof resolvePlayerRestrictionFacts === 'function';
    },
    evaluateTradeDate(context) {
      return evaluateTradeDate(context, resolveOfficialTradeCutoff);
    },
    evaluatePlayer,
  });
}

/**
 * Free-agency date gate for exact official negotiation/signing windows. This
 * does not decide a player's free-agent rights: restricted free agents require
 * a separate accepted qualifying-offer/ROFR decision record.
 */
export function evaluateFranchiseFreeAgencyWindow(input) {
  const context = record(input) ? input : {};
  const action = context.action;
  const year = Number(context.seasonStartYear ?? context.salaryCapYear);
  const transactionMs = isoInstant(context.transactionAt);
  if (!['negotiate', 'sign'].includes(action) || !Number.isInteger(year) || year < 1946 || year > 2500 || transactionMs === null) {
    return unavailablePolicyResult('free-agency-window-context-incomplete', 'Free-agency window checks require action, seasonStartYear, and an exact transactionAt timestamp with timezone.');
  }
  const calendar = record(context.officialCalendar)
    ? context.officialCalendar
    : officialCalendarFor(year, context.resolveOfficialCalendar, context);
  const source = officialCalendarMeta(calendar, year);
  if (!source) return unavailablePolicyResult('official-free-agency-calendar-unavailable', 'A season-matched official NBA free-agency calendar with source reference is required.', FRANCHISE_NBA_KEY_DATES_SOURCE_URL);
  const opensAt = action === 'negotiate' ? calendar.negotiationsOpenAt : calendar.freeAgentSigningsOpenAt;
  const opensMs = isoInstant(opensAt);
  if (opensMs === null) return unavailablePolicyResult('official-free-agency-time-unavailable', `The official ${action} window timestamp is unavailable for this season.`, source.sourceUrl);
  const status = transactionMs >= opensMs ? 'pass' : 'fail';
  if (status === 'fail') {
    return {
      status: 'fail',
      reasons: [reason('before-free-agency-window', `The ${action} attempt occurs before the verified season-specific NBA free-agency window opens.`)],
      opensAt, sourceUrl: source.sourceUrl, sourceRef: source.sourceRef,
      receipt: { action, seasonStartYear: year, transactionAt: context.transactionAt, opensAt, calendarSource: source },
    };
  }
  const freeAgentStatus = context.freeAgentStatus;
  if (freeAgentStatus === 'restricted-free-agent') {
    return {
      status: 'unavailable', reasons: [reason('restricted-free-agent-rights-unresolved', 'Restricted free-agent signing requires accepted qualifying-offer and right-of-first-refusal state; the calendar alone cannot authorize a signing.')],
      opensAt, sourceUrl: source.sourceUrl, sourceRef: source.sourceRef,
      receipt: { action, seasonStartYear: year, opensAt, calendarSource: source, rightsStatus: 'unavailable' },
    };
  }
  if (freeAgentStatus !== 'unrestricted-free-agent') {
    return { status: freeAgentStatus === 'under-contract' ? 'fail' : 'unavailable', reasons: [reason(freeAgentStatus === 'under-contract' ? 'player-not-a-free-agent' : 'free-agent-rights-unverified', 'The player must have a verified unrestricted-free-agent status for this calendar-only signing check.')], opensAt, sourceUrl: source.sourceUrl, sourceRef: source.sourceRef, receipt: { action, seasonStartYear: year, opensAt, calendarSource: source } };
  }
  const rightsSource = evidenceMeta(context.freeAgentRightsProvenance);
  if (!rightsSource) {
    return { status: 'unavailable', reasons: [reason('free-agent-rights-source-unverified', 'Free-agent eligibility needs a verified player-rights source; the NBA calendar does not identify player rights.')], opensAt, sourceUrl: source.sourceUrl, sourceRef: source.sourceRef, receipt: { action, seasonStartYear: year, opensAt, calendarSource: source } };
  }
  const rights = { status: 'verified-unrestricted-free-agent', sourceId: rightsSource.sourceId, sourceVersion: rightsSource.sourceVersion, sourceRef: rightsSource.sourceRef, sourceUrl: rightsSource.sourceUrl };
  return {
    status: 'pass', reasons: [],
    opensAt, sourceUrl: source.sourceUrl, sourceRef: source.sourceRef,
    receipt: { action, seasonStartYear: year, transactionAt: context.transactionAt, opensAt, calendarSource: source, playerRights: rights, scope: 'window-and-unrestricted-status-only; salary-cap, contract, exception and offer validity not checked' },
  };
}

/**
 * Gate for a future salary-as-market-value model. No contract valuation is
 * estimated until accepted contract history, cap history, chronological
 * holdout calibration, and a versioned estimator are all injected. The
 * current public SwishIQ registry has no contracts/franchise salary panel.
 */
export function estimateFranchiseContractValue(input) {
  const context = record(input) ? input : {};
  const reasons = [];
  const contractPanel = context.contractHistory;
  const capPanel = context.salaryCapHistory;
  const calibration = context.chronologicalCalibration;
  const model = context.valuationModel;
  if (!record(contractPanel) || contractPanel.status !== 'accepted'
    || contractPanel.capability !== 'contracts' || !nonEmpty(contractPanel.sourceId)
    || !nonEmpty(contractPanel.sourceVersion) || !nonEmpty(contractPanel.sourceRef)) {
    reasons.push(reason('accepted-contract-history-unavailable', 'No accepted, source-pinned historical contract panel was supplied.'));
  }
  const acceptedCapHistory = record(capPanel) && capPanel.status === 'accepted'
    && Array.isArray(capPanel.rows) && capPanel.rows.length > 0
    && nonEmpty(capPanel.sourceId) && nonEmpty(capPanel.sourceVersion) && nonEmpty(capPanel.sourceRef);
  if (!acceptedCapHistory && !isVerifiedOfficialSalaryCapHistory(capPanel)) {
    reasons.push(reason('accepted-salary-cap-history-unavailable', 'Accepted source-pinned cap history or the exact NBA-announced official cap-history helper is required to normalize comparable contracts as percent of cap.'));
  }
  const trainEnd = Number(calibration?.trainEndSeasonStartYear);
  const holdoutStart = Number(calibration?.holdoutStartSeasonStartYear);
  if (!record(calibration) || calibration.status !== 'passed' || !Number.isInteger(trainEnd)
    || !Number.isInteger(holdoutStart) || trainEnd >= holdoutStart
    || calibration.normalization !== 'salary-percent-of-cap') {
    reasons.push(reason('chronological-contract-holdout-unavailable', 'Chronological train-before-holdout validation using salary-as-percent-of-cap normalization is required.'));
  }
  if (!record(model) || typeof model.evaluate !== 'function' || !nonEmpty(model.modelId)
    || !nonEmpty(model.version) || typeof model.sourceUrl !== 'string' || !model.sourceUrl.startsWith('https://')) {
    reasons.push(reason('calibrated-contract-valuation-model-unavailable', 'No versioned, evidence-backed contract valuation estimator was supplied.'));
  }
  if (reasons.length) return {
    status: 'unavailable', estimate: null, metric: 'salary-percent-of-cap', reasons,
    caveat: 'A modeled market estimate is not an actual player contract or guaranteed future salary.',
    requiredInputs: ['accepted source-pinned contract history', 'observed cap history', 'chronological holdout calibration', 'versioned estimator with uncertainty'],
  };
  let result;
  try { result = model.evaluate(context.player, { contractHistory: contractPanel, salaryCapHistory: capPanel, chronologicalCalibration: calibration }); } catch { result = null; }
  const value = Number(result?.salaryPercentOfCap);
  const low = Number(result?.uncertainty?.lowPercentOfCap);
  const high = Number(result?.uncertainty?.highPercentOfCap);
  if (!record(result) || result.status !== 'modeled' || !Number.isFinite(value) || value < 0
    || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low
    || !nonEmpty(result.sourceRef)) {
    return { status: 'unavailable', estimate: null, metric: 'salary-percent-of-cap', reasons: [reason('valuation-model-receipt-invalid', 'Estimator output must provide a modeled salary-percent-of-cap value, a finite uncertainty interval, and provenance.')], caveat: 'No actual salary is inferred or copied from player performance.' };
  }
  return {
    status: 'modeled-estimate', estimate: { salaryPercentOfCap: value, uncertaintyPercentOfCap: { low, high } },
    metric: 'salary-percent-of-cap', model: { modelId: model.modelId, version: model.version, sourceUrl: model.sourceUrl, sourceRef: result.sourceRef },
    caveat: 'This is a modeled market-value estimate, not an actual player contract, cap charge, or guaranteed future salary.',
  };
}
