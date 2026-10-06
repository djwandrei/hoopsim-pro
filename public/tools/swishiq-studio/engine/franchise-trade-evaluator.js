/*
 * Standalone, evidence-aware evaluator for bilateral Franchise trades.
 *
 * This module deliberately does not implement NBA salary matching. The
 * current NBA-NBPA CBA is effective July 1, 2023 through the 2029-30 season
 * (subject to the stated post-2028-29 opt-out). Its transaction rules depend
 * on salary-cap year/date, team salary/apron state, contract accounting,
 * exception use and prior transactions. A caller must inject a versioned
 * policy that explicitly declares whether it applies to the proposed year.
 *
 * Player performance context is also caller supplied. No synthetic rating,
 * potential field, default salary, or simulated season total is treated as
 * observed trade value. This returns an evidence vector and uncertainty
 * receipt, never a composite player grade.
 */

import {
  assessFranchisePlayerAsset,
  FRANCHISE_TRADE_VALUE_MODEL_VERSION,
} from './franchise-trade-value.js?v=20260925c&rev=franchise-trade-value-v2';

export const FRANCHISE_TRADE_EVALUATOR_VERSION = 'franchise-trade-evaluator-v2';

export const NBA_NBPA_CBA_CURRENT_REFERENCE = Object.freeze({
  title: '2023 NBA-NBPA Collective Bargaining Agreement',
  sourceUrl: 'https://www.nbpa.com/cba',
  documentUrl: 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf',
  effectiveFrom: '2023-07-01',
  scheduledThroughSeason: '2029-30',
  optOutAfterSeason: '2028-29',
  relevantSections: ['Article VII, Sections 2(e), 3, 6, and 8', 'Article VII, Section 2(f)'],
});

export const NBA_DRAFT_PICK_TRADE_RULES_REFERENCE = Object.freeze({
  firstRoundConsecutivePicks: {
    title: 'NBA Constitution and By-Laws, Article 7.03',
    sourceUrl: 'https://cms.nba.com/wp-content/uploads/sites/4/2024/06/NBA-Consitution-By-Laws-June-2024.pdf',
    sourceRef: 'Article 7.03, First Round Draft Choice',
  },
  frozenPicks: {
    title: '2024-25 NBA CBA 101, Draft Pick Penalty',
    sourceUrl: 'https://cms.nba.com/wp-content/uploads/sites/4/2024/11/2024-25-CBA-101.pdf',
    sourceRef: 'Section II.F, Draft Pick Penalty',
  },
  note: 'Pick ownership and availability alone cannot establish Stepien-rule, frozen-pick, protection, swap, conveyance, or other encumbrance compliance.',
});

export const NBA_TRADE_DATE_REFERENCE = Object.freeze({
  currentSeason: '2026-27',
  officialKeyDatesUrl: 'https://www.nba.com/news/key-dates',
  currentSeasonTradeDeadline: '2027-02-11',
  currentSeasonTradeDeadlineTimeEastern: 'official page lists date only for this season; exact cutoff time must be supplied by the applicable league rule policy',
  note: 'Do not apply this date to another salary-cap year or assume that the date alone is an exact instant.',
});

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLAYER_METRICS = Object.freeze(['points', 'assists', 'rebounds', 'steals', 'blocks', 'turnovers']);
const PLAYER_ASSET = 'player';

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function integer(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  return typeof value === 'string' && /^-?\d+$/.test(value.trim())
    && Number.isSafeInteger(Number(value));
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value : null;
}

function isoInstant(value) {
  const match = typeof value === 'string'
    ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
    : null;
  if (!match || !isoDate(match[1])) return null;
  const [, , hourText, minuteText, secondText = '0', zone, , offsetHourText, offsetMinuteText] = match;
  if (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return null;
  if (zone !== 'Z') {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetMinute > 59 || offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0)
      || (zone === '-00:00')) return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function finiteNonNegative(value) {
  const textValue = typeof value === 'string' ? value.trim() : '';
  const numeric = typeof value === 'number' ? value
    : textValue && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(textValue) ? Number(textValue) : NaN;
  return Number.isFinite(numeric) && numeric >= 0;
}

function stableUnique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function sortReasons(reasons) {
  const unique = new Map();
  reasons.forEach(reason => unique.set(`${reason.code}:${reason.teamId || ''}:${reason.assetRef || ''}`, reason));
  return [...unique.values()].sort((a, b) => {
    const left = `${a.code}:${a.teamId || ''}:${a.assetRef || ''}`;
    const right = `${b.code}:${b.teamId || ''}:${b.assetRef || ''}`;
    return left.localeCompare(right);
  });
}

function sourceSummary(evidence) {
  const source = evidence?.source;
  if (!isRecord(source)) return null;
  const sourceId = cleanText(source.id || source.packageId || source.datasetId || source.sourceId);
  const version = cleanText(source.version || source.packageVersion || source.datasetVersion);
  if (!sourceId || !version) return null;
  return { id: sourceId, version, scope: cleanText(source.scope) || null };
}

function validObservedSeason(row) {
  if (!isRecord(row) || row.status !== 'observed' || !integer(row.seasonStartYear)) return false;
  if (!integer(row.games) || Number(row.games) < 0 || !finiteNonNegative(row.minutes)) return false;
  return isRecord(row.perGame);
}

function metricValues(row) {
  return Object.fromEntries(PLAYER_METRICS.map(metric => [
    metric,
    finiteNonNegative(row?.perGame?.[metric]) ? Number(row.perGame[metric]) : null,
  ]));
}

function explicitAge(row) {
  return finiteNonNegative(row?.age) && Number(row.age) >= 16 && Number(row.age) <= 60
    ? Number(row.age) : null;
}

function averageMetric(rows, metric) {
  let numerator = 0;
  let denominator = 0;
  rows.forEach(row => {
    const value = metricValues(row)[metric];
    if (value === null || Number(row.games) <= 0) return;
    numerator += value * Number(row.games);
    denominator += Number(row.games);
  });
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function describePlayerEvidence(playerRef, evidence, primeWindowByRef) {
  const source = sourceSummary(evidence);
  const rows = Array.isArray(evidence?.seasons)
    ? evidence.seasons.filter(validObservedSeason).slice().sort((a, b) => Number(a.seasonStartYear) - Number(b.seasonStartYear))
    : [];
  const valid = evidence?.status === 'observed' && source && rows.length > 0;
  if (!valid) {
    return {
      playerRef,
      status: 'unavailable',
      reasonCodes: ['accepted-observed-player-evidence-unavailable'],
      recentProduction: { status: 'unavailable', values: null },
      primeProduction: { status: 'unavailable', reasonCode: 'prime-window-evidence-unavailable' },
      observedPeakByMetric: { status: 'unavailable', reasonCode: 'observed-career-window-unavailable' },
      workloadReliability: { status: 'unavailable', games: null, minutes: null, reasonCode: 'observed-denominators-unavailable' },
      ageTrajectory: { status: 'unavailable', reasonCode: 'age-longitudinal-evidence-unavailable' },
      rosterFit: { status: 'unavailable', reasonCode: 'observed-position-evidence-unavailable' },
      uncertainty: ['No accepted, source-pinned observed season rows were supplied for this player.'],
    };
  }

  const recent = rows.at(-1);
  const years = rows.map(row => Number(row.seasonStartYear));
  const continuous = rows.length >= 3 && years.every((year, index) => index === 0 || year === years[index - 1] + 1);
  const agesAvailable = rows.every(row => explicitAge(row) !== null);
  const seasonsByMetric = Object.fromEntries(PLAYER_METRICS.map(metric => {
    const candidates = rows.filter(row => metricValues(row)[metric] !== null && Number(row.games) > 0);
    const best = candidates.reduce((current, row) => !current || metricValues(row)[metric] > metricValues(current)[metric] ? row : current, null);
    return [metric, best ? { seasonStartYear: Number(best.seasonStartYear), valuePerGame: metricValues(best)[metric], games: Number(best.games) } : null];
  }));
  const declaredPrime = primeWindowByRef?.[playerRef];
  const primeRows = isRecord(declaredPrime)
    && declaredPrime.status === 'declared'
    && integer(declaredPrime.startSeasonStartYear)
    && integer(declaredPrime.endSeasonStartYear)
    && Number(declaredPrime.startSeasonStartYear) <= Number(declaredPrime.endSeasonStartYear)
    && cleanText(declaredPrime.sourceRef)
    ? rows.filter(row => Number(row.seasonStartYear) >= Number(declaredPrime.startSeasonStartYear)
      && Number(row.seasonStartYear) <= Number(declaredPrime.endSeasonStartYear))
    : [];
  const recentMetrics = metricValues(recent);
  const ageChanges = Object.fromEntries(PLAYER_METRICS.map(metric => {
    if (!continuous || !agesAvailable) return [metric, null];
    const first = metricValues(rows[0])[metric];
    const last = metricValues(rows.at(-1))[metric];
    return [metric, first === null || last === null ? null : Number(((last - first) / (rows.length - 1)).toFixed(4))];
  }));
  const primaryPositions = rows.map(row => cleanText(row.primaryPosition).toUpperCase()).filter(Boolean);
  const latestPosition = cleanText(recent.primaryPosition).toUpperCase();
  const totalGames = rows.reduce((sum, row) => sum + Number(row.games), 0);
  const totalMinutes = rows.reduce((sum, row) => sum + Number(row.minutes), 0);
  const uncertainty = [];
  if (evidence.careerCoverage !== 'complete') uncertainty.push('Career coverage is partial or unspecified; maximums are best observed in the supplied window, not a confirmed career prime.');
  if (!continuous || !agesAvailable) uncertainty.push('Growth or decline is withheld because three consecutive observed seasons with explicit age are not available.');
  if (!latestPosition) uncertainty.push('Observed position is unavailable; roster fit is descriptive only when caller-supplied role evidence exists.');
  if (rows.some(row => PLAYER_METRICS.some(metric => metricValues(row)[metric] === null))) uncertainty.push('Some production fields or their observed per-game denominators are missing.');
  uncertainty.push('No calibrated trade-value score is produced; uncertainty is not converted into a probability.');

  return {
    playerRef,
    status: 'observed-evidence-summary',
    source,
    observedSeasonCount: rows.length,
    seasonWindow: { first: years[0], last: years.at(-1), careerCoverage: evidence.careerCoverage === 'complete' ? 'declared-complete' : 'partial-or-unknown' },
    recentProduction: {
      status: 'observed', seasonStartYear: Number(recent.seasonStartYear), valuesPerGame: recentMetrics,
      games: Number(recent.games), minutes: Number(recent.minutes), minutesPerGame: Number(recent.games) > 0 ? Number((Number(recent.minutes) / Number(recent.games)).toFixed(4)) : null,
    },
    primeProduction: primeRows.length ? {
      status: 'caller-declared-prime-window', sourceRef: cleanText(declaredPrime.sourceRef),
      startSeasonStartYear: Number(declaredPrime.startSeasonStartYear), endSeasonStartYear: Number(declaredPrime.endSeasonStartYear),
      observedSeasonsIncluded: primeRows.length,
      games: primeRows.reduce((sum, row) => sum + Number(row.games), 0),
      minutes: Number(primeRows.reduce((sum, row) => sum + Number(row.minutes), 0).toFixed(2)),
      valuesPerGame: Object.fromEntries(PLAYER_METRICS.map(metric => [metric, averageMetric(primeRows, metric)])),
    } : { status: 'unavailable', reasonCode: 'prime-window-not-explicitly-declared' },
    observedPeakByMetric: {
      status: evidence.careerCoverage === 'complete' ? 'complete-career-observed' : 'best-in-supplied-window-only',
      seasonByMetric: seasonsByMetric,
    },
    workloadReliability: {
      status: rows.every(row => integer(row.games) && finiteNonNegative(row.minutes)) ? 'denominators-present' : 'partial-denominators',
      observedSeasons: rows.length, games: totalGames, minutes: Number(totalMinutes.toFixed(2)),
      ratesUse: 'per-game values retain each source row games denominator; prime-window averages are games-weighted',
      calibration: 'not-calibrated',
    },
    ageTrajectory: continuous && agesAvailable ? {
      status: 'observed-descriptive-change-only',
      ages: rows.map(row => ({ seasonStartYear: Number(row.seasonStartYear), age: explicitAge(row) })),
      perSeasonChangeByMetric: ageChanges,
      doesNotProject: true,
    } : { status: 'unavailable', reasonCode: 'requires-three-consecutive-observed-seasons-and-explicit-age' },
    rosterFit: latestPosition ? {
      status: 'position-evidence-only', primaryPosition: latestPosition,
      positionEvidenceSeasons: primaryPositions.length,
      roleNeedComparison: 'unavailable-without-declared-team-role-needs',
    } : { status: 'unavailable', reasonCode: 'observed-position-evidence-unavailable' },
    uncertainty,
  };
}

function buildValueComparisonEvidence(normalizedSides, playerEvidenceByRef, valueEvidenceByRef) {
  const bilateral = normalizedSides.length === 2;
  const opponent = new Map(bilateral ? normalizedSides.map((side, index) => [side.teamId, normalizedSides[1 - index]]) : []);
  const assessmentByRef = new Map();
  for (const side of normalizedSides) {
    for (const asset of side.assets) {
      if (asset.kind !== PLAYER_ASSET || assessmentByRef.has(asset.ref)) continue;
      const evidence = valueEvidenceByRef[asset.ref];
      const sourceEvidence = playerEvidenceByRef?.[asset.ref];
      const assessment = assessFranchisePlayerAsset({
        playerRef: asset.ref,
        playerEvidence: isRecord(evidence) ? { ...evidence, nativeImpact: sourceEvidence?.nativeImpact } : {},
      });
      assessmentByRef.set(asset.ref, assessment.observedImpact);
    }
  }
  const allPlayerRefs = stableUnique(normalizedSides.flatMap(side => side.assets
    .filter(asset => asset.kind === PLAYER_ASSET).map(asset => asset.ref)));
  const availableCount = allPlayerRefs.filter(playerRef => assessmentByRef.get(playerRef)?.status === 'observed-regularized-impact-estimate').length;
  const teams = normalizedSides.map(side => {
    const other = opponent.get(side.teamId);
    const assetsFor = candidate => candidate.assets.filter(asset => asset.kind === PLAYER_ASSET)
      .slice().sort((left, right) => left.ref.localeCompare(right.ref))
      .map(asset => ({ playerRef: asset.ref, observedImpact: assessmentByRef.get(asset.ref) || {
        status: 'unavailable', reasonCode: 'accepted-native-impact-evidence-required',
      } }));
    const nonPlayerAssetsFor = candidate => candidate.assets.filter(asset => asset.kind !== PLAYER_ASSET)
      .slice().sort((left, right) => `${left.kind}:${left.ref}`.localeCompare(`${right.kind}:${right.ref}`))
      .map(asset => ({ kind: asset.kind, assetRef: asset.ref, valueStatus: 'unavailable',
        reasonCode: asset.kind === 'draft-pick'
          ? 'accepted-pick-rights-and-outcome-ledger-with-calibrated-pick-curve-required'
          : 'accepted-asset-market-value-evidence-required' }));
    return {
      teamId: side.teamId,
      outgoingPlayerImpact: assetsFor(side),
      incomingPlayerImpact: other ? assetsFor(other) : [],
      outgoingNonPlayerMarketValue: nonPlayerAssetsFor(side),
      incomingNonPlayerMarketValue: other ? nonPlayerAssetsFor(other) : [],
    };
  });
  return {
    modelVersion: FRANCHISE_TRADE_VALUE_MODEL_VERSION,
    status: !bilateral || availableCount === 0 ? 'unavailable' : availableCount === allPlayerRefs.length ? 'evidence-components-only' : 'partial-evidence-components',
    ...(!bilateral ? { reasonCode: 'bilateral-trade-comparison-requires-exactly-two-teams' } : {}),
    evidenceCoverage: { observedPlayers: availableCount, tradedPlayers: allPlayerRefs.length },
    teams,
    overallTradeValue: {
      status: 'unavailable',
      reasonCode: 'accepted-contract-and-pick-outcome-ledgers-with-common-calibration-required',
      interpretation: 'Observed impact evidence is not a forecast, trade recommendation, salary surplus, or pick-market value.',
    },
    interpretation: 'Side-by-side historical native-impact evidence only. No side is declared the winner; player impact support windows may differ from official production coverage.',
  };
}

function salaryTermForYear(player, salaryCapYear) {
  const rows = Array.isArray(player?.contract?.salaryTerms) ? player.contract.salaryTerms : [];
  const matches = rows.filter(row => Number(row?.seasonStartYear) === salaryCapYear);
  if (matches.length !== 1 || !finiteNonNegative(matches[0]?.salaryUsd)) return null;
  return { seasonStartYear: salaryCapYear, salaryUsd: Number(matches[0].salaryUsd) };
}

function policyIdentity(policy) {
  const policyId = cleanText(policy?.policyId);
  const version = cleanText(policy?.version);
  const sourceUrl = cleanText(policy?.sourceUrl);
  return policyId && version && isHttpsUrl(sourceUrl) ? { policyId, version, sourceUrl } : null;
}

function verifiedSourceProvenance(value) {
  if (!isRecord(value) || value.status !== 'verified-source') return null;
  const sourceId = cleanText(value.sourceId);
  const sourceVersion = cleanText(value.sourceVersion);
  const sourceRef = cleanText(value.sourceRef);
  const sourceUrl = cleanText(value.sourceUrl);
  if (!sourceId || !sourceVersion || !sourceRef || !isHttpsUrl(sourceUrl)) return null;
  return { status: 'verified-source', sourceId, sourceVersion, sourceRef, sourceUrl };
}

function policySource(value) {
  if (!isRecord(value)) return null;
  const nested = isRecord(value.source) ? value.source : isRecord(value.provenance) ? value.provenance : {};
  const receipt = isRecord(value.receipt) ? value.receipt : {};
  const source = {
    status: nested.status || value.sourceStatus || value.provenanceStatus,
    sourceId: nested.sourceId || value.sourceId || receipt.sourceId,
    sourceVersion: nested.sourceVersion || nested.version || value.sourceVersion || receipt.sourceVersion,
    sourceRef: nested.sourceRef || value.sourceRef || receipt.sourceRef,
    sourceUrl: nested.sourceUrl || value.sourceUrl,
  };
  return verifiedSourceProvenance(source);
}

function policyResult(value, policy, fallbackCode) {
  if (!isRecord(value) || !['pass', 'fail', 'unavailable'].includes(value.status)) {
    return { status: 'unavailable', policy: policyIdentity(policy), reasons: [{ code: fallbackCode }] };
  }
  const reasons = Array.isArray(value.reasons)
    ? value.reasons.map(reason => isRecord(reason) && cleanText(reason.code)
      ? { ...reason, code: cleanText(reason.code) }
      : { code: 'policy-reason-unspecified' })
    : value.status === 'pass' ? [] : [{ code: `${fallbackCode}-${value.status}` }];
  return {
    status: value.status,
    policy: policyIdentity(policy),
    reasons,
    source: isRecord(value.source) ? value.source : null,
    receipt: isRecord(value.receipt) ? value.receipt : null,
  };
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clonePlain(child)]));
  return value;
}

function sameSortedStrings(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every(item => typeof item === 'string')
    && actual.slice().sort().every((item, index) => item === expected[index]);
}

/**
 * Draft-pick and other non-player assets need an injected, versioned eligibility
 * policy in addition to a declared owner/availability row. For first-round picks,
 * the policy must evaluate the participating teams' full pick-rights ledger and
 * the complete proposed non-player asset set (including protections/swaps and
 * retained picks), so Stepien and CBA frozen-pick rules cannot be inferred from
 * the isolated asset being sent. The resolver does not implement salary/apron math.
 */
function resolveNonPlayerAssetEligibility({ state, proposal, normalizedSides, salaryCapYear, nonPlayerAssetRules }) {
  const proposedAssets = normalizedSides.flatMap(side => side.assets
    .filter(asset => asset.kind !== PLAYER_ASSET)
    .map(asset => ({ teamId: side.teamId, kind: asset.kind, ref: asset.ref })))
    .sort((a, b) => `${a.teamId}:${a.kind}:${a.ref}`.localeCompare(`${b.teamId}:${b.kind}:${b.ref}`));
  if (!proposedAssets.length) {
    return { status: 'pass', policy: policyIdentity(nonPlayerAssetRules), scope: 'not-applicable-no-non-player-assets', reasons: [], source: null, receipt: null };
  }

  const result = { status: 'unavailable', policy: policyIdentity(nonPlayerAssetRules), reasons: [], source: null, receipt: null };
  if (!nonPlayerAssetRules || typeof nonPlayerAssetRules.appliesTo !== 'function'
    || typeof nonPlayerAssetRules.evaluate !== 'function' || !result.policy) {
    result.reasons.push({ code: 'non-player-asset-trade-eligibility-policy-unavailable' });
    return result;
  }

  const participatingTeamIds = normalizedSides.map(side => side.teamId).slice().sort();
  const ledger = Array.isArray(state?.tradeableAssets) ? state.tradeableAssets : [];
  const teams = normalizedSides.map(side => {
    const teamLedger = ledger.filter(row => cleanText(row?.ownerTeamId) === side.teamId)
      .map(clonePlain)
      .sort((a, b) => `${cleanText(a?.kind)}:${cleanText(a?.ref)}`.localeCompare(`${cleanText(b?.kind)}:${cleanText(b?.ref)}`));
    const sentAssets = side.assets.filter(asset => asset.kind !== PLAYER_ASSET).map(asset => ({
      kind: asset.kind,
      ref: asset.ref,
      ledgerRows: teamLedger.filter(row => cleanText(row?.kind).toLowerCase() === asset.kind && cleanText(row?.ref) === asset.ref),
    })).sort((a, b) => `${a.kind}:${a.ref}`.localeCompare(`${b.kind}:${b.ref}`));
    return { teamId: side.teamId, sentAssets, completeDeclaredAssetLedger: teamLedger };
  }).sort((a, b) => a.teamId.localeCompare(b.teamId));
  const proposedAssetKeys = proposedAssets.map(asset => `${asset.teamId}:${asset.kind}:${asset.ref}`).sort();
  const context = {
    salaryCapYear: integer(salaryCapYear) ? Number(salaryCapYear) : null,
    transactionAt: cleanText(proposal?.transactionAt) || null,
    transactionDate: cleanText(proposal?.transactionAt).slice(0, 10) || null,
    stateSeasonStartYear: integer(state?.currentSeason) ? Number(state.currentSeason) : null,
    participatingTeamIds,
    proposedAssetKeys,
    proposedAssets: clonePlain(proposedAssets),
    teams,
    rulesReferences: NBA_DRAFT_PICK_TRADE_RULES_REFERENCE,
  };
  let applies;
  try { applies = nonPlayerAssetRules.appliesTo(context); } catch {
    result.reasons.push({ code: 'non-player-asset-policy-applicability-check-failed' });
    return result;
  }
  if (applies !== true) {
    result.reasons.push({ code: 'non-player-asset-policy-not-applicable-or-unconfirmed-for-year-date' });
    return result;
  }
  let evaluated;
  try { evaluated = nonPlayerAssetRules.evaluate(context); } catch {
    result.reasons.push({ code: 'non-player-asset-policy-evaluation-failed' });
    return result;
  }
  if (!isRecord(evaluated) || !['pass', 'fail', 'unavailable'].includes(evaluated.status)) {
    result.reasons.push({ code: 'non-player-asset-policy-returned-invalid-receipt' });
    return result;
  }

  const normalized = policyResult(evaluated, nonPlayerAssetRules, 'non-player-asset-eligibility-unavailable');
  const source = policySource(evaluated);
  const receipt = isRecord(evaluated.receipt) ? evaluated.receipt : null;
  const basicScope = receipt?.scope === 'all-participating-team-asset-rules'
    && sameSortedStrings(receipt.participatingTeamIds, participatingTeamIds)
    && sameSortedStrings(receipt.proposedAssetKeys, proposedAssetKeys);
  const expectedLedgerCoverage = proposedAssets.some(asset => asset.kind === 'draft-pick')
    ? 'complete-draft-pick-rights-and-encumbrances'
    : 'complete-non-player-asset-ledger';
  const teamLedgerCoverage = Array.isArray(receipt?.teamAssetLedgerCoverage) ? receipt.teamAssetLedgerCoverage : [];
  const completeTeamLedgers = sameSortedStrings(teamLedgerCoverage.map(row => cleanText(row?.teamId)), participatingTeamIds)
    && teamLedgerCoverage.every(row => row?.coverage === expectedLedgerCoverage && Boolean(verifiedSourceProvenance(row?.provenance || row)));
  const fullScope = basicScope && completeTeamLedgers;
  if (normalized.status !== 'unavailable' && (!source || !fullScope)) {
    result.status = 'unavailable';
    result.reasons = [{ code: !source
      ? 'non-player-asset-policy-needs-verified-source-receipt'
      : 'non-player-asset-policy-must-cover-all-proposed-assets-and-complete-team-ledgers' }];
    result.source = source;
    result.receipt = receipt;
    return result;
  }
  return {
    status: normalized.status,
    policy: result.policy,
    reasons: normalized.reasons,
    source,
    receipt,
  };
}

function resolveTradeEligibility({ state, proposal, salaryCapYear, tradedPlayers, tradeEligibilityRules }) {
  const result = { status: 'unavailable', policy: policyIdentity(tradeEligibilityRules), deadline: null, players: [], reasons: [] };
  const requiredMethods = ['appliesTo', 'evaluateTradeDate', 'evaluatePlayer'];
  if (!tradeEligibilityRules || requiredMethods.some(method => typeof tradeEligibilityRules[method] !== 'function') || !result.policy) {
    result.reasons.push({ code: 'trade-deadline-and-player-eligibility-policy-unavailable' });
    return result;
  }
  const transactionAt = cleanText(proposal?.transactionAt);
  const transactionTimestamp = isoInstant(transactionAt);
  if (transactionTimestamp === null) {
    result.reasons.push({ code: 'exact-trade-transaction-instant-required' });
    return result;
  }
  const transactionDate = transactionAt.slice(0, 10);
  const baseContext = {
    salaryCapYear,
    transactionAt,
    transactionDate,
    stateSeasonStartYear: integer(state?.currentSeason) ? Number(state.currentSeason) : null,
    participants: (Array.isArray(proposal?.teams) ? proposal.teams : []).map(side => ({ teamId: cleanText(side?.teamId) })).sort((a, b) => a.teamId.localeCompare(b.teamId)),
  };
  let applies;
  try { applies = tradeEligibilityRules.appliesTo(baseContext); } catch {
    result.reasons.push({ code: 'trade-eligibility-policy-applicability-check-failed' });
    return result;
  }
  if (applies !== true) {
    result.reasons.push({ code: 'trade-eligibility-policy-not-applicable-or-unconfirmed-for-year-date' });
    return result;
  }

  let deadlineRaw;
  try { deadlineRaw = tradeEligibilityRules.evaluateTradeDate(baseContext); } catch {
    result.reasons.push({ code: 'official-trade-deadline-evaluation-failed' });
    return result;
  }
  const deadline = policyResult(deadlineRaw, tradeEligibilityRules, 'official-trade-deadline-unavailable');
  if (deadline.status !== 'unavailable') {
    const cutoffAt = cleanText(deadlineRaw?.cutoffAt);
    const cutoffTimestamp = isoInstant(cutoffAt);
    const source = policySource(deadlineRaw);
    if (cutoffTimestamp === null || !source) {
      deadline.status = 'unavailable';
      deadline.reasons = [{ code: 'official-trade-cutoff-needs-exact-instant-and-complete-source-reference' }];
    } else if (transactionTimestamp > cutoffTimestamp) {
      deadline.status = 'fail';
      deadline.reasons = [{ code: 'trade-occurs-after-official-deadline', transactionAt, cutoffAt, sourceRef: source.sourceRef }];
    } else if (deadlineRaw.status === 'fail') {
      deadline.status = 'unavailable';
      deadline.reasons = [{ code: 'official-deadline-policy-conflicts-with-explicit-cutoff-comparison' }];
    } else {
      deadline.status = 'pass';
      deadline.reasons = [];
      deadline.comparison = 'transaction-at-or-before-explicit-official-cutoff';
      deadline.cutoffAt = cutoffAt;
      deadline.source = source;
    }
  }
  result.deadline = deadline;

  for (const player of tradedPlayers.slice().sort((a, b) => a.playerRef.localeCompare(b.playerRef))) {
    const contract = isRecord(player.contract) ? player.contract : {};
    const signedOn = cleanText(contract.signedOn);
    const signedStatus = cleanText(contract.signedStatus).toLowerCase();
    if (signedStatus !== 'under-contract') {
      result.players.push({ playerRef: player.playerRef, status: 'unavailable', reasons: [{ code: 'explicit-signed-status-required' }] });
      continue;
    }
    if (!isoDate(signedOn)) {
      result.players.push({ playerRef: player.playerRef, status: 'unavailable', reasons: [{ code: 'explicit-contract-signing-date-required' }] });
      continue;
    }
    const playerContext = {
      ...baseContext,
      playerRef: player.playerRef,
      teamId: player.teamId,
      signedStatus,
      signedOn,
      contract,
    };
    let evaluated;
    try { evaluated = tradeEligibilityRules.evaluatePlayer(playerContext); } catch {
      evaluated = null;
    }
    const playerResult = policyResult(evaluated, tradeEligibilityRules, 'player-specific-trade-eligibility-unavailable');
    const source = policySource(evaluated);
    if (playerResult.status !== 'unavailable' && !source) {
      playerResult.status = 'unavailable';
      playerResult.reasons = [{ code: 'player-trade-eligibility-needs-verified-source-receipt' }];
    }
    const verifiedContractRuleClass = cleanText(evaluated?.contractRuleClass);
    if (playerResult.status === 'pass' && (!verifiedContractRuleClass || verifiedContractRuleClass !== cleanText(contract.ruleClass))) {
      playerResult.status = 'unavailable';
      playerResult.reasons = [{ code: 'source-verified-contract-rule-class-must-match' }];
    }
    playerResult.source = source;
    playerResult.contractRuleClass = playerResult.status === 'pass' ? verifiedContractRuleClass : null;
    result.players.push({ playerRef: player.playerRef, ...playerResult });
  }
  const statuses = [deadline.status, ...result.players.map(player => player.status)];
  result.status = statuses.includes('fail') ? 'fail' : statuses.every(status => status === 'pass') ? 'pass' : 'unavailable';
  result.reasons = sortReasons([
    ...(deadline.status === 'pass' ? [] : deadline.reasons.map(reason => ({ ...reason, scope: 'deadline' }))),
    ...result.players.flatMap(player => player.status === 'pass' ? [] : player.reasons.map(reason => ({ ...reason, scope: 'player', playerRef: player.playerRef }))),
  ]);
  return result;
}

function resolveContractStructure({ tradedPlayers, salaryCapYear, transactionAt, contractRules }) {
  const result = { status: 'unavailable', policy: policyIdentity(contractRules), players: [], reasons: [] };
  if (!contractRules || typeof contractRules.appliesTo !== 'function' || typeof contractRules.evaluate !== 'function' || !result.policy) {
    result.reasons.push({ code: 'per-player-contract-rule-validator-unavailable' });
    return result;
  }
  for (const player of tradedPlayers.slice().sort((a, b) => a.playerRef.localeCompare(b.playerRef))) {
    const contract = isRecord(player.contract) ? player.contract : {};
    const input = {
      playerRef: player.playerRef,
      teamId: player.teamId,
      signedOn: contract.signedOn,
      salaryCapYear,
      transactionAt,
      contract: {
        playerRef: player.playerRef,
        teamId: player.teamId,
        signedOn: contract.signedOn,
        ruleClass: contract.ruleClass,
        salaryTerms: contract.salaryTerms,
        salaryTermsProvenance: contract.salaryTermsProvenance,
        salaryLimits: contract.salaryLimits,
        budgets: contract.budgets,
      },
    };
    let applies;
    try { applies = contractRules.appliesTo(input); } catch { applies = false; }
    if (applies !== true) {
      result.players.push({ playerRef: player.playerRef, status: 'unavailable', reasons: [{ code: 'contract-terms-not-covered-by-injected-contract-policy' }] });
      continue;
    }
    let evaluated;
    try { evaluated = contractRules.evaluate(input); } catch { evaluated = null; }
    const provenance = verifiedSourceProvenance(evaluated?.provenance);
    if (!isRecord(evaluated) || evaluated.valid !== true || !provenance) {
      result.players.push({
        playerRef: player.playerRef,
        status: evaluated?.valid === false && evaluated?.status === 'scenario-structure-rejected' ? 'fail' : 'unavailable',
        provenance: provenance || (isRecord(evaluated?.provenance) ? evaluated.provenance : null),
        reasons: Array.isArray(evaluated?.errors) && evaluated.errors.length
          ? evaluated.errors.map(error => ({ code: cleanText(error.code) || 'contract-rule-failed', path: error.path || null }))
          : [{ code: evaluated?.provenance?.status === 'declared-scenario' ? 'hypothetical-contract-terms-not-observed' : evaluated?.provenance?.status === 'verified-source' ? 'complete-contract-source-provenance-required' : 'source-verified-contract-structure-required' }],
      });
      continue;
    }
    result.players.push({
      playerRef: player.playerRef,
      status: 'pass',
      provenance,
      contractRulesVersion: evaluated.contractRulesVersion,
      checks: evaluated.checks,
    });
  }
  result.status = result.players.some(player => player.status === 'fail') ? 'fail'
    : result.players.every(player => player.status === 'pass') ? 'pass' : 'unavailable';
  result.reasons = sortReasons(result.players.filter(player => player.status !== 'pass').flatMap(player => player.reasons.map(reason => ({ ...reason, playerRef: player.playerRef }))));
  return result;
}

function resolveContractMatching({ state, proposal, salaryCapYear, tradedPlayers, tradeSalaryRules, contractStructure, tradeEligibility }) {
  const result = { status: 'unavailable', policy: policyIdentity(tradeSalaryRules), reasons: [] };
  if (!tradeSalaryRules || typeof tradeSalaryRules.appliesTo !== 'function' || typeof tradeSalaryRules.evaluate !== 'function' || !result.policy) {
    result.reasons.push({ code: 'trade-salary-rule-policy-not-supplied' });
    return result;
  }
  const missingTerms = tradedPlayers.filter(player => !salaryTermForYear(player, salaryCapYear)).map(player => player.playerRef).sort();
  if (missingTerms.length) {
    result.reasons.push({ code: 'explicit-season-salary-terms-unavailable', playerRefs: missingTerms });
    return result;
  }
  if (contractStructure?.status !== 'pass') {
    result.reasons.push(...(contractStructure?.reasons || [{ code: 'source-verified-contract-structure-required' }]));
    return result;
  }
  const verifiedContractRuleClassByPlayer = Object.fromEntries((tradeEligibility?.players || [])
    .filter(player => player.status === 'pass' && cleanText(player.contractRuleClass))
    .map(player => [player.playerRef, player.contractRuleClass])
    .sort(([a], [b]) => a.localeCompare(b)));
  const missingRuleClassRefs = tradedPlayers.map(player => player.playerRef)
    .filter(playerRef => !verifiedContractRuleClassByPlayer[playerRef])
    .sort();
  if (missingRuleClassRefs.length) {
    result.reasons.push({ code: 'source-verified-contract-rule-class-required', playerRefs: missingRuleClassRefs });
    return result;
  }

  const salaryTermProvenance = contractStructure.players.map(player => ({
    playerRef: player.playerRef,
    status: player.provenance?.status || 'unavailable',
    sourceId: player.provenance?.sourceId || null,
    sourceVersion: player.provenance?.sourceVersion || null,
    sourceRef: player.provenance?.sourceRef || null,
    sourceUrl: player.provenance?.sourceUrl || null,
  })).sort((a, b) => a.playerRef.localeCompare(b.playerRef));

  const context = {
    salaryCapYear,
    transactionDate: cleanText(proposal.transactionAt).slice(0, 10) || cleanText(proposal.transactionDate) || null,
    transactionAt: cleanText(proposal.transactionAt) || null,
    stateSeasonStartYear: integer(state.currentSeason) ? Number(state.currentSeason) : null,
    sides: proposal.teams.map(side => ({
      teamId: side.teamId,
      sentPlayers: side.assets.filter(asset => asset.kind === PLAYER_ASSET).map(asset => {
        const player = tradedPlayers.find(candidate => candidate.playerRef === asset.ref);
        return {
          playerRef: player.playerRef,
          ruleClass: verifiedContractRuleClassByPlayer[player.playerRef],
          salaryTerms: player.contract.salaryTerms,
          salaryCapYearTerm: salaryTermForYear(player, salaryCapYear),
          salaryTermsProvenance: contractStructure.players.find(item => item.playerRef === player.playerRef)?.provenance || null,
        };
      }).sort((a, b) => a.playerRef.localeCompare(b.playerRef)),
      receivedPlayers: proposal.teams.find(other => other.teamId !== side.teamId).assets.filter(asset => asset.kind === PLAYER_ASSET).map(asset => {
        const player = tradedPlayers.find(candidate => candidate.playerRef === asset.ref);
        return {
          playerRef: player.playerRef,
          ruleClass: verifiedContractRuleClassByPlayer[player.playerRef],
          salaryTerms: player.contract.salaryTerms,
          salaryCapYearTerm: salaryTermForYear(player, salaryCapYear),
          salaryTermsProvenance: contractStructure.players.find(item => item.playerRef === player.playerRef)?.provenance || null,
        };
      }).sort((a, b) => a.playerRef.localeCompare(b.playerRef)),
      })).sort((a, b) => a.teamId.localeCompare(b.teamId)),
    assetRefsByTeam: Object.fromEntries(proposal.teams.map(side => [side.teamId, side.assets.map(asset => ({ kind: asset.kind, ref: asset.ref })).sort((a, b) => `${a.kind}:${a.ref}`.localeCompare(`${b.kind}:${b.ref}`))]).sort(([a], [b]) => a.localeCompare(b))),
    salaryTermProvenance,
    sourceContractRuleClassByPlayer: verifiedContractRuleClassByPlayer,
  };

  let applies;
  try { applies = tradeSalaryRules.appliesTo(context); } catch {
    result.reasons.push({ code: 'trade-salary-rule-applicability-check-failed' });
    return result;
  }
  if (applies !== true) {
    result.reasons.push({ code: 'trade-salary-rule-not-applicable-or-unconfirmed-for-year-date' });
    return result;
  }
  let evaluated;
  try { evaluated = tradeSalaryRules.evaluate(context); } catch {
    result.reasons.push({ code: 'trade-salary-rule-evaluation-failed' });
    return result;
  }
  if (!isRecord(evaluated) || !['pass', 'fail', 'unavailable'].includes(evaluated.status)) {
    result.reasons.push({ code: 'trade-salary-rule-returned-invalid-receipt' });
    return result;
  }
  const ruleProvenance = policySource(evaluated);
  if (evaluated.status === 'pass' && !ruleProvenance) {
    result.reasons.push({ code: 'trade-salary-match-needs-source-backed-rule-receipt' });
    return result;
  }
  return {
    status: evaluated.status === 'pass' && !ruleProvenance ? 'unavailable' : evaluated.status,
    policy: result.policy,
    reasons: Array.isArray(evaluated.reasons) && evaluated.reasons.length
      ? evaluated.reasons.map(item => isRecord(item) && cleanText(item.code) ? { ...item, code: cleanText(item.code) } : { code: 'trade-salary-policy-reason-unspecified' })
      : [{ code: `trade-salary-policy-${evaluated.status}` }],
    policyReceipt: isRecord(evaluated.receipt) ? evaluated.receipt : null,
    ruleProvenance,
    termProvenance: salaryTermProvenance,
  };
}

function evaluateRosterFit(stateTeams, normalizedSides, playerEvidenceByRef, teamRoleNeedsById) {
  const evidencePosition = playerRef => {
    const evidence = playerEvidenceByRef?.[playerRef];
    const rows = Array.isArray(evidence?.seasons) ? evidence.seasons.filter(validObservedSeason) : [];
    const latest = rows.slice().sort((a, b) => Number(a.seasonStartYear) - Number(b.seasonStartYear)).at(-1);
    const position = cleanText(latest?.primaryPosition).toUpperCase();
    return position ? { position, source: sourceSummary(evidence), seasonStartYear: Number(latest.seasonStartYear) } : null;
  };
  const results = [];
  normalizedSides.forEach(side => {
    const team = stateTeams.find(candidate => cleanText(candidate?.teamId) === side.teamId);
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    const before = {};
    let complete = Array.isArray(team?.roster);
    roster.forEach(player => {
      const evidence = evidencePosition(cleanText(player?.playerRef));
      if (!evidence) { complete = false; return; }
      before[evidence.position] = (before[evidence.position] || 0) + 1;
    });
    const assetsSent = side.assets.filter(asset => asset.kind === PLAYER_ASSET).map(asset => evidencePosition(asset.ref));
    const opposingAssets = normalizedSides.find(other => other.teamId !== side.teamId)?.assets || [];
    const assetsReceived = opposingAssets.filter(asset => asset.kind === PLAYER_ASSET).map(asset => evidencePosition(asset.ref));
    if (assetsSent.some(value => !value) || assetsReceived.some(value => !value)) complete = false;
    const after = { ...before };
    if (complete) {
      assetsSent.forEach(value => { after[value.position] = Math.max(0, (after[value.position] || 0) - 1); });
      assetsReceived.forEach(value => { after[value.position] = (after[value.position] || 0) + 1; });
    }
    const roleNeeds = teamRoleNeedsById?.[side.teamId];
    const hasRoleNeeds = isRecord(roleNeeds) && roleNeeds.status === 'declared'
      && sourceSummary(roleNeeds) && isRecord(roleNeeds.positions)
      && Object.entries(roleNeeds.positions).every(([position, count]) => /^[A-Z0-9-]{1,8}$/.test(position.toUpperCase()) && integer(count) && Number(count) >= 0);
    let status = complete ? 'observed-position-mix-only' : 'unavailable';
    let roleNeedDelta = null;
    if (complete && hasRoleNeeds) {
      const needs = Object.fromEntries(Object.entries(roleNeeds.positions).map(([position, count]) => [position.toUpperCase(), Number(count)]));
      const uncoveredBefore = Object.fromEntries(Object.keys(needs).sort().map(position => [position, Math.max(0, needs[position] - (before[position] || 0))]));
      const uncoveredAfter = Object.fromEntries(Object.keys(needs).sort().map(position => [position, Math.max(0, needs[position] - (after[position] || 0))]));
      roleNeedDelta = {
        source: sourceSummary(roleNeeds),
        uncoveredBefore,
        uncoveredAfter,
        changeByPosition: Object.fromEntries(Object.keys(needs).sort().map(position => [position, uncoveredBefore[position] - uncoveredAfter[position]])),
        interpretation: 'descriptive coverage of caller-declared roles; not calibrated to wins or player value',
      };
      status = 'observed-position-mix-with-declared-role-needs';
    }
    results.push({
      teamId: side.teamId,
      status,
      positionMixBefore: complete ? Object.fromEntries(Object.entries(before).sort(([a], [b]) => a.localeCompare(b))) : null,
      positionMixAfter: complete ? Object.fromEntries(Object.entries(after).sort(([a], [b]) => a.localeCompare(b))) : null,
      declaredRoleNeedDelta: roleNeedDelta,
      reasonCode: complete ? null : 'every-roster-and-traded-player-needs-an-observed-primary-position',
    });
  });
  return results;
}

/**
 * Evaluate a two-team trade proposal without mutating the supplied league.
 *
 * Proposal shape:
 * {
 *   salaryCapYear: 2026,
 *   transactionAt: '2027-02-11T14:59:00-05:00', // exact local instant and UTC offset required
 *   transactionDate: '2027-02-11', // optional display/search field only
 *   teams: [
 *     { teamId: 'AAA', assets: [{ kind: 'player', ref: '...' }] },
 *     { teamId: 'BBB', assets: [{ kind: 'player', ref: '...' }] },
 *   ],
 * }
 *
 * Non-player assets require an exact matching record in state.tradeableAssets
 * with kind, ref, ownerTeamId, and status:'available', plus a versioned
 * nonPlayerAssetRules policy that validates the complete asset bundle and
 * participating teams. A pass receipt must attest complete source-backed team
 * asset ledgers (including pick rights/encumbrances for draft-pick proposals).
 * An explicit ledger alone does not establish pick legality.
 */
export function evaluateFranchiseTrade(state, proposal, {
  contractRules = null,
  tradeSalaryRules = null,
  tradeEligibilityRules = null,
  nonPlayerAssetRules = null,
  rosterPolicy = null,
  playerEvidenceByRef = {},
  primeWindowByRef = {},
  teamRoleNeedsById = {},
} = {}) {
  const reasons = [];
  const unavailableFindings = [];
  const sides = Array.isArray(proposal?.teams) ? proposal.teams : [];
  const salaryCapYearRaw = proposal?.salaryCapYear ?? proposal?.seasonStartYear;
  const salaryCapYear = integer(salaryCapYearRaw) ? Number(salaryCapYearRaw) : NaN;
  if (!Number.isInteger(salaryCapYear) || salaryCapYear < 1946 || salaryCapYear > 2500) reasons.push({ code: 'salary-cap-year-missing-or-invalid' });
  if (proposal?.transactionAt != null && isoInstant(String(proposal.transactionAt)) === null) reasons.push({ code: 'transaction-instant-invalid' });
  if (proposal?.transactionDate != null && !isoDate(String(proposal.transactionDate))) {
    reasons.push({ code: 'transaction-date-invalid' });
  }
  if (sides.length !== 2) reasons.push({ code: 'bilateral-trade-requires-exactly-two-teams' });

  const normalizedSides = sides.map(side => ({
    teamId: cleanText(side?.teamId),
    assets: Array.isArray(side?.assets) ? side.assets.map(asset => ({ kind: cleanText(asset?.kind).toLowerCase(), ref: cleanText(asset?.ref) })) : [],
  })).sort((a, b) => a.teamId.localeCompare(b.teamId));
  if (normalizedSides.some(side => !SAFE_REF.test(side.teamId))) reasons.push({ code: 'team-reference-invalid' });
  if (new Set(normalizedSides.map(side => side.teamId)).size !== normalizedSides.length) reasons.push({ code: 'trade-team-references-duplicated' });
  normalizedSides.forEach(side => {
    if (!side.assets.length) reasons.push({ code: 'each-team-must-send-explicit-assets', teamId: side.teamId });
    side.assets.forEach(asset => {
      if (!asset.kind || !SAFE_REF.test(asset.ref)) reasons.push({ code: 'trade-asset-reference-invalid', teamId: side.teamId, assetRef: asset.ref || null });
    });
    const keys = side.assets.map(asset => `${asset.kind}:${asset.ref}`);
    if (new Set(keys).size !== keys.length) reasons.push({ code: 'team-asset-references-duplicated', teamId: side.teamId });
  });

  const stateTeams = Array.isArray(state?.teams) ? state.teams : [];
  const teamById = new Map(stateTeams.filter(team => cleanText(team?.teamId)).map(team => [String(team.teamId), team]));
  const teamIds = normalizedSides.map(side => side.teamId);
  teamIds.forEach(teamId => { if (!teamById.has(teamId)) reasons.push({ code: 'trade-team-not-in-league-state', teamId }); });
  if (new Set(stateTeams.map(team => cleanText(team?.teamId))).size !== stateTeams.length) reasons.push({ code: 'league-team-references-duplicated' });

  const playerOccurrences = new Map();
  stateTeams.forEach(team => {
    if (!Array.isArray(team?.roster)) {
      reasons.push({ code: 'team-roster-unavailable', teamId: cleanText(team?.teamId) || null });
      return;
    }
    const local = new Set();
    team.roster.forEach(player => {
      const ref = cleanText(player?.playerRef);
      if (!SAFE_REF.test(ref)) {
        reasons.push({ code: 'roster-player-reference-invalid', teamId: cleanText(team.teamId) || null });
        return;
      }
      if (local.has(ref)) reasons.push({ code: 'duplicate-player-reference-within-roster', teamId: cleanText(team.teamId), assetRef: ref });
      local.add(ref);
      const owners = playerOccurrences.get(ref) || [];
      owners.push({ teamId: cleanText(team.teamId), player });
      playerOccurrences.set(ref, owners);
    });
  });
  playerOccurrences.forEach((owners, ref) => {
    if (owners.length > 1) reasons.push({ code: 'player-ownership-ambiguous-across-rosters', assetRef: ref });
  });

  const assetOwnership = [];
  const tradedPlayers = [];
  const allAssetKeys = [];
  normalizedSides.forEach(side => side.assets.forEach(asset => {
    const key = `${asset.kind}:${asset.ref}`;
    allAssetKeys.push(key);
    if (asset.kind === PLAYER_ASSET) {
      const owners = playerOccurrences.get(asset.ref) || [];
      if (owners.length !== 1) {
        reasons.push({ code: owners.length ? 'player-ownership-ambiguous' : 'player-asset-owner-unavailable', teamId: side.teamId, assetRef: asset.ref });
      } else if (owners[0].teamId !== side.teamId || cleanText(owners[0].player?.teamId) !== side.teamId) {
        reasons.push({ code: 'player-not-owned-by-sending-team', teamId: side.teamId, actualOwnerTeamId: owners[0].teamId, assetRef: asset.ref });
      } else if (cleanText(owners[0].player?.status) !== 'active') {
        reasons.push({ code: 'player-not-active-on-sending-roster', teamId: side.teamId, assetRef: asset.ref });
      } else {
        tradedPlayers.push(owners[0].player);
      }
      const ownershipIsValid = owners.length === 1 && owners[0].teamId === side.teamId
        && cleanText(owners[0].player?.teamId) === side.teamId
        && cleanText(owners[0].player?.status) === 'active';
      assetOwnership.push({ kind: asset.kind, ref: asset.ref, sendingTeamId: side.teamId, status: ownershipIsValid ? 'verified-from-roster' : 'unavailable-or-invalid' });
      return;
    }
    const registered = Array.isArray(state?.tradeableAssets) ? state.tradeableAssets.filter(row => cleanText(row?.kind).toLowerCase() === asset.kind && cleanText(row?.ref) === asset.ref) : [];
    if (!Array.isArray(state?.tradeableAssets) || registered.length === 0) {
      unavailableFindings.push({ code: 'non-player-asset-ledger-or-ownership-record-unavailable', teamId: side.teamId, assetRef: asset.ref });
      assetOwnership.push({ kind: asset.kind, ref: asset.ref, sendingTeamId: side.teamId, status: 'unavailable' });
    } else if (registered.length > 1) {
      reasons.push({ code: 'non-player-asset-ownership-ambiguous', teamId: side.teamId, assetRef: asset.ref });
      assetOwnership.push({ kind: asset.kind, ref: asset.ref, sendingTeamId: side.teamId, status: 'ambiguous' });
    } else if (cleanText(registered[0].ownerTeamId) !== side.teamId || registered[0].status !== 'available') {
      reasons.push({ code: 'non-player-asset-not-available-to-sending-team', teamId: side.teamId, assetRef: asset.ref });
      assetOwnership.push({ kind: asset.kind, ref: asset.ref, sendingTeamId: side.teamId, status: 'not-available' });
    } else {
      assetOwnership.push({ kind: asset.kind, ref: asset.ref, sendingTeamId: side.teamId, status: 'declared-in-explicit-asset-ledger' });
    }
  }));
  if (new Set(allAssetKeys).size !== allAssetKeys.length) reasons.push({ code: 'asset-included-more-than-once' });

  const nonPlayerAssetEligibility = resolveNonPlayerAssetEligibility({
    state,
    proposal,
    normalizedSides,
    salaryCapYear,
    nonPlayerAssetRules,
  });
  if (nonPlayerAssetEligibility.status === 'unavailable') {
    unavailableFindings.push(...nonPlayerAssetEligibility.reasons.map(reason => ({ ...reason, scope: 'non-player-asset-eligibility' })));
  }

  let rosterResult;
  const rosterPolicyId = cleanText(rosterPolicy?.policyId);
  const rosterPolicyVersion = cleanText(rosterPolicy?.version);
  const rosterPolicySource = cleanText(rosterPolicy?.sourceUrl || rosterPolicy?.source);
  const limitsByTeam = rosterPolicy?.limitsByTeam;
  if (!rosterPolicyId || !rosterPolicyVersion || !isHttpsUrl(rosterPolicySource) || !isRecord(limitsByTeam)) {
    rosterResult = { status: 'unavailable', policy: null, teams: [], reasons: [{ code: 'explicit-roster-capacity-policy-unavailable' }] };
  } else {
    const teamRows = normalizedSides.map(side => {
      const team = teamById.get(side.teamId);
      const sentPlayers = side.assets.filter(asset => asset.kind === PLAYER_ASSET && playerOccurrences.get(asset.ref)?.length === 1 && playerOccurrences.get(asset.ref)?.[0].teamId === side.teamId).length;
      const other = normalizedSides.find(candidate => candidate.teamId !== side.teamId);
      const receivedPlayers = other?.assets.filter(asset => asset.kind === PLAYER_ASSET
        && playerOccurrences.get(asset.ref)?.length === 1
        && playerOccurrences.get(asset.ref)?.[0].teamId === other.teamId).length || 0;
      const limit = limitsByTeam[side.teamId];
      if (!Array.isArray(team?.roster) || !integer(limit) || Number(limit) < 1) return { teamId: side.teamId, status: 'unavailable', current: Array.isArray(team?.roster) ? team.roster.length : null, projected: null, limit: null };
      const current = team.roster.length;
      const projected = current - sentPlayers + receivedPlayers;
      return { teamId: side.teamId, status: current <= Number(limit) && projected <= Number(limit) ? 'pass' : 'fail', current, sentPlayers, receivedPlayers, projected, limit: Number(limit) };
    });
    rosterResult = {
      status: teamRows.some(row => row.status === 'fail') ? 'fail' : teamRows.every(row => row.status === 'pass') ? 'pass' : 'unavailable',
      policy: { policyId: rosterPolicyId, version: rosterPolicyVersion, sourceUrl: rosterPolicySource },
      teams: teamRows,
      reasons: teamRows.filter(row => row.status !== 'pass').map(row => ({ code: row.status === 'fail' ? 'roster-limit-exceeded' : 'team-roster-capacity-unavailable', teamId: row.teamId })),
    };
  }

  const transactionAt = cleanText(proposal?.transactionAt) || null;
  const contractStructure = resolveContractStructure({ tradedPlayers, salaryCapYear, transactionAt, contractRules });
  const tradeEligibility = resolveTradeEligibility({ state, proposal: { ...proposal, teams: normalizedSides }, salaryCapYear, tradedPlayers, tradeEligibilityRules });
  const contractMatching = Number.isInteger(salaryCapYear)
    ? resolveContractMatching({ state, proposal: { ...proposal, teams: normalizedSides }, salaryCapYear, tradedPlayers, tradeSalaryRules, contractStructure, tradeEligibility })
    : { status: 'unavailable', policy: policyIdentity(tradeSalaryRules), reasons: [{ code: 'salary-cap-year-missing-or-invalid' }] };
  const structuralReasons = sortReasons(reasons);
  const hardInvalid = structuralReasons.length > 0 || rosterResult.status === 'fail' || contractMatching.status === 'fail'
    || contractStructure.status === 'fail' || tradeEligibility.status === 'fail'
    || nonPlayerAssetEligibility.status === 'fail';
  const eligibleToCommit = !hardInvalid && unavailableFindings.length === 0
    && rosterResult.status === 'pass' && contractStructure.status === 'pass'
    && contractMatching.status === 'pass' && tradeEligibility.status === 'pass'
    && nonPlayerAssetEligibility.status === 'pass';
  const overallStatus = hardInvalid ? 'invalid' : eligibleToCommit ? 'valid' : 'review-required';
  const valueEvidence = Object.fromEntries(stableUnique(tradedPlayers.map(player => player.playerRef)).map(playerRef => [
    playerRef,
    describePlayerEvidence(playerRef, playerEvidenceByRef?.[playerRef], primeWindowByRef),
  ]));
  const rosterFit = evaluateRosterFit(stateTeams, normalizedSides, playerEvidenceByRef, teamRoleNeedsById);
  const requestFingerprint = JSON.stringify({
    salaryCapYear: integer(salaryCapYear) ? salaryCapYear : null,
    transactionAt,
    sides: normalizedSides.map(side => ({ teamId: side.teamId, assets: side.assets.slice().sort((a, b) => `${a.kind}:${a.ref}`.localeCompare(`${b.kind}:${b.ref}`)) })),
  });
  return {
    evaluatorVersion: FRANCHISE_TRADE_EVALUATOR_VERSION,
    status: overallStatus,
    eligibleToCommit,
    requestFingerprint,
    structural: { status: structuralReasons.length ? 'fail' : 'pass', reasons: structuralReasons },
    availability: { status: unavailableFindings.length ? 'incomplete' : 'complete', reasons: sortReasons(unavailableFindings) },
    assetOwnership: assetOwnership.slice().sort((a, b) => `${a.sendingTeamId}:${a.kind}:${a.ref}`.localeCompare(`${b.sendingTeamId}:${b.kind}:${b.ref}`)),
    rosterCapacity: rosterResult,
    rosterFit,
    contractStructure,
    tradeEligibility,
    nonPlayerAssetEligibility,
    salaryMatching: contractMatching,
    playerValueEvidence: valueEvidence,
    valueComparisonEvidence: buildValueComparisonEvidence(normalizedSides, playerEvidenceByRef, valueEvidence),
    valueMethod: 'evidence-vector-no-overall-trade-grade',
    provenance: {
      stateSeasonStartYear: integer(state?.currentSeason) ? Number(state.currentSeason) : null,
      salaryCapYear: integer(salaryCapYear) ? salaryCapYear : null,
      transactionAt,
      ruleReference: NBA_NBPA_CBA_CURRENT_REFERENCE,
      scenarioDataNotice: 'League simulation contracts default to scenario placeholders; they are never accepted as observed salary terms.',
      unverifiedItems: [
        'Historical salary, option, consent, rights, team salary and prior exception use require explicit source evidence.',
        'Trade date, deadline, signing status, player restrictions and source-backed contract terms require explicit year-pinned policies and evidence.',
        'Performance values remain descriptive evidence; roster fit and trade value are not calibrated as win impact.',
      ],
    },
  };
}
