/*
 * Source-pinned future draft-rights ledger for Franchise.
 *
 * This module validates an accepted snapshot; it does not scrape or infer NBA
 * rights at runtime. A slot is represented once by its originating team/year/
 * round, with any later conveyance, swap, protection, rollover, freeze, or
 * forfeiture recorded as an explicit sourced encumbrance. Unknown rights stay
 * visible and blocked. A partial snapshot never emits tradeable assets.
 */

export const FRANCHISE_DRAFT_RIGHTS_VERSION = 'swishiq-franchise-draft-rights-v1';
export const FRANCHISE_DRAFT_RIGHTS_AS_OF = '2026-09-25';
export const FRANCHISE_SCENARIO_DRAFT_RIGHTS_VERSION = 'swishiq-franchise-scenario-draft-rights-v1';

export const FRANCHISE_DRAFT_RIGHTS_SOURCE_CATALOG = Object.freeze({
  officialTradeTracker: Object.freeze({
    sourceId: 'nba-official-2026-offseason-trade-tracker',
    sourceUrl: 'https://www.nba.com/news/2026-offseason-trade-tracker',
    authority: 'official',
    scope: 'Official NBA announcements for reported 2026 draft and offseason transactions; this is not a complete historical future-pick ledger.',
  }),
  officialLotteryRules: Object.freeze({
    sourceId: 'nba-official-2027-2029-draft-lottery-rules',
    sourceUrl: 'https://www.nba.com/news/nba-board-governors-approve-new-draft-lottery-system',
    authority: 'official',
    scope: 'Lottery format and restrictions effective for the 2027, 2028, and 2029 drafts.',
  }),
  capmathLeagueLedger: Object.freeze({
    sourceId: 'capmath-future-draft-pick-tracker',
    sourceUrl: 'https://capmath.com/nba/league/draft-picks',
    authority: 'secondary',
    scope: 'All-team first- and second-round pick holdings through 2033, with stated protections and swaps; independent reconstruction from public trade reporting.',
  }),
  realgmDetailedLedger: Object.freeze({
    sourceId: 'realgm-future-draft-picks-detailed',
    sourceUrl: 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    authority: 'secondary',
    scope: 'Team-by-team incoming and outgoing rights, including complex swap and rollover chains; must be corroborated for exact transaction conditions.',
  }),
  officialClippersForfeitures: Object.freeze({
    sourceId: 'nba-official-clippers-draft-forfeitures-2026',
    sourceUrl: 'https://pr.nba.com/nba-investigation-clippers-kawhi-leonard/',
    authority: 'official',
    scope: 'NBA announcement forfeiting one Clippers first-round selection in each of the 2029–2033 drafts; exact interaction with existing swaps and conveyed rights must be represented from the ruling and transaction chain.',
  }),
});

const NBA_TEAM_IDS = Object.freeze([
  'ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
const NBA_TEAM_SET = new Set(NBA_TEAM_IDS);
const SOURCE_STATUS = 'verified-source';
const ROUND_IDS = Object.freeze([1, 2]);
const OWNERSHIP_STATES = new Set(['known', 'conditional', 'forfeited', 'unresolved']);
const TRADE_STATES = new Set(['available', 'encumbered', 'conditional', 'unavailable', 'forfeited', 'unresolved']);
const ENCUMBRANCE_STATES = new Set(['clear', 'complete', 'unresolved']);
const ENCUMBRANCE_KINDS = new Set(['conveyance', 'protection', 'swap', 'rollover', 'frozen', 'forfeiture', 'restriction', 'other']);
const EVIDENCE_LEVELS = new Set(['official', 'corroborated', 'secondary']);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function teamId(value) {
  const id = cleanText(value).toUpperCase();
  return NBA_TEAM_SET.has(id) ? id : null;
}

function sourcePin(source, asOfDate) {
  if (!isRecord(source) || source.status !== SOURCE_STATUS) return null;
  const normalized = {
    status: SOURCE_STATUS,
    sourceId: cleanText(source.sourceId),
    sourceVersion: cleanText(source.sourceVersion),
    sourceRef: cleanText(source.sourceRef),
    sourceUrl: cleanText(source.sourceUrl),
    authority: cleanText(source.authority),
    asOfDate: cleanText(source.asOfDate),
  };
  if (!normalized.sourceId || !normalized.sourceVersion || !normalized.sourceRef
    || !isHttpsUrl(normalized.sourceUrl) || !['official', 'team', 'secondary'].includes(normalized.authority)
    || normalized.asOfDate !== asOfDate) return null;
  return normalized;
}

function rightsRef(draftYear, originalTeamId, round) {
  return `pick_${draftYear}_${originalTeamId.toLowerCase()}_${round}`;
}

function createMissingRight(draftYear, originalTeamId, round) {
  return {
    ref: rightsRef(draftYear, originalTeamId, round),
    draftYear,
    round,
    originalTeamId,
    ownerTeamId: null,
    ownershipStatus: 'unresolved',
    tradeStatus: 'unresolved',
    encumbranceStatus: 'unresolved',
    encumbrances: [],
    evidenceLevel: 'unverified',
    source: null,
    reasonCodes: ['draft-pick-rights-record-missing'],
  };
}

function normalizeEncumbrances(rows, asOfDate, pickRef, reasonCodes) {
  if (!Array.isArray(rows)) {
    reasonCodes.push('draft-pick-encumbrance-records-missing');
    return [];
  }
  return rows.map((row, index) => {
    if (!isRecord(row) || !ENCUMBRANCE_KINDS.has(cleanText(row.kind))) {
      reasonCodes.push(`draft-pick-encumbrance-invalid:${index}`);
      return { kind: 'other', status: 'unresolved', source: null, ref: `${pickRef}:invalid:${index}` };
    }
    const normalized = {
      ref: cleanText(row.ref) || `${pickRef}:right:${index + 1}`,
      kind: cleanText(row.kind),
      status: row.status === 'resolved' ? 'resolved' : row.status === 'active' ? 'active' : 'unresolved',
      beneficiaryTeamId: row.beneficiaryTeamId == null ? null : teamId(row.beneficiaryTeamId),
      counterpartyTeamIds: Array.isArray(row.counterpartyTeamIds)
        ? [...new Set(row.counterpartyTeamIds.map(teamId).filter(Boolean))].sort()
        : [],
      terms: cleanText(row.terms),
      rollover: isRecord(row.rollover) ? { ...row.rollover } : null,
      source: sourcePin(row.source, asOfDate),
    };
    if (row.beneficiaryTeamId != null && !normalized.beneficiaryTeamId) reasonCodes.push(`draft-pick-encumbrance-beneficiary-invalid:${index}`);
    if (normalized.counterpartyTeamIds.length !== (Array.isArray(row.counterpartyTeamIds) ? row.counterpartyTeamIds.length : 0)) {
      reasonCodes.push(`draft-pick-encumbrance-counterparty-invalid:${index}`);
    }
    if (!normalized.terms) reasonCodes.push(`draft-pick-encumbrance-terms-missing:${index}`);
    if (!normalized.source) reasonCodes.push(`draft-pick-encumbrance-source-unavailable:${index}`);
    if (normalized.kind === 'rollover' && !normalized.rollover) reasonCodes.push(`draft-pick-rollover-chain-missing:${index}`);
    return normalized;
  });
}

function normalizePickRight(row, expected, asOfDate) {
  const reasons = [];
  const ref = rightsRef(expected.draftYear, expected.originalTeamId, expected.round);
  if (!isRecord(row)) return { ...createMissingRight(expected.draftYear, expected.originalTeamId, expected.round), reasonCodes: ['draft-pick-rights-record-invalid'] };

  const ownershipStatus = OWNERSHIP_STATES.has(cleanText(row.ownershipStatus)) ? cleanText(row.ownershipStatus) : 'unresolved';
  const tradeStatus = TRADE_STATES.has(cleanText(row.tradeStatus)) ? cleanText(row.tradeStatus) : 'unresolved';
  const encumbranceStatus = ENCUMBRANCE_STATES.has(cleanText(row.encumbranceStatus)) ? cleanText(row.encumbranceStatus) : 'unresolved';
  const ownerTeamId = row.ownerTeamId == null ? null : teamId(row.ownerTeamId);
  const source = sourcePin(row.source, asOfDate);
  const encumbrances = normalizeEncumbrances(row.encumbrances, asOfDate, ref, reasons);
  const activeEncumbrances = encumbrances.filter(item => item.status === 'active');

  if (Number(row.draftYear) !== expected.draftYear || Number(row.round) !== expected.round
    || teamId(row.originalTeamId) !== expected.originalTeamId) reasons.push('draft-pick-rights-key-mismatch');
  if (!source) reasons.push('draft-pick-source-provenance-unavailable');
  if (!EVIDENCE_LEVELS.has(cleanText(row.evidenceLevel))) reasons.push('draft-pick-evidence-level-invalid');
  if (ownershipStatus === 'known' && !ownerTeamId) reasons.push('draft-pick-known-owner-required');
  if (ownershipStatus !== 'known' && ownerTeamId) reasons.push('draft-pick-owner-conflicts-with-ownership-status');
  if (ownershipStatus === 'forfeited' && tradeStatus !== 'forfeited') reasons.push('forfeited-pick-must-be-blocked');
  if (ownershipStatus === 'unresolved' && tradeStatus !== 'unresolved') reasons.push('unresolved-pick-must-be-blocked');
  if (encumbranceStatus === 'clear' && activeEncumbrances.length) reasons.push('clear-encumbrance-status-conflicts-with-active-rights');
  if (encumbranceStatus === 'complete' && !activeEncumbrances.length) reasons.push('encumbrance-status-complete-needs-active-rights');
  if (tradeStatus === 'available' && (ownershipStatus !== 'known' || !ownerTeamId
    || encumbranceStatus !== 'clear' || activeEncumbrances.length)) reasons.push('tradeable-pick-needs-known-owner-and-clear-complete-rights');
  if (tradeStatus === 'encumbered' && (ownershipStatus !== 'known' || !ownerTeamId
    || encumbranceStatus !== 'complete' || !activeEncumbrances.length)) reasons.push('encumbered-pick-needs-known-owner-and-declared-active-rights');
  if (tradeStatus === 'conditional' && !activeEncumbrances.length) reasons.push('conditional-pick-needs-sourced-active-condition');
  if ((ownershipStatus === 'conditional' || ownershipStatus === 'unresolved') && !cleanText(row.reasonCode)) reasons.push('blocked-pick-needs-reason-code');

  const normalized = {
    ref,
    draftYear: expected.draftYear,
    round: expected.round,
    originalTeamId: expected.originalTeamId,
    ownerTeamId: reasons.length ? null : ownerTeamId,
    ownershipStatus: reasons.length ? 'unresolved' : ownershipStatus,
    tradeStatus: reasons.length ? 'unresolved' : tradeStatus,
    encumbranceStatus: reasons.length ? 'unresolved' : encumbranceStatus,
    encumbrances,
    evidenceLevel: EVIDENCE_LEVELS.has(cleanText(row.evidenceLevel)) ? cleanText(row.evidenceLevel) : 'unverified',
    source,
    reasonCode: cleanText(row.reasonCode) || null,
    reasonCodes: reasons,
    displayLabel: cleanText(row.displayLabel) || null,
  };
  return normalized;
}

function expectedPickKeys(firstDraftYear, lastDraftYear) {
  const expected = [];
  for (let draftYear = firstDraftYear; draftYear <= lastDraftYear; draftYear += 1) {
    for (const originalTeamId of NBA_TEAM_IDS) {
      for (const round of ROUND_IDS) expected.push({ draftYear, originalTeamId, round });
    }
  }
  return expected;
}

function coverageDeclarationIsComplete(declaration, asOfDate, firstDraftYear, lastDraftYear) {
  if (!isRecord(declaration) || declaration.status !== 'declared-complete'
    || declaration.encumbranceCoverage !== 'complete') return false;
  if (declaration.firstDraftYear !== firstDraftYear || declaration.lastDraftYear !== lastDraftYear) return false;
  if (!Array.isArray(declaration.teamIds) || declaration.teamIds.length !== NBA_TEAM_IDS.length
    || declaration.teamIds.map(teamId).some(value => !value)
    || new Set(declaration.teamIds.map(teamId)).size !== NBA_TEAM_IDS.length
    || !NBA_TEAM_IDS.every(id => declaration.teamIds.map(teamId).includes(id))) return false;
  if (!Array.isArray(declaration.draftYears)
    || declaration.draftYears.length !== (lastDraftYear - firstDraftYear + 1)
    || !Array.from({ length: lastDraftYear - firstDraftYear + 1 }, (_, index) => firstDraftYear + index)
      .every(year => declaration.draftYears.includes(year))) return false;
  if (!Array.isArray(declaration.rounds) || declaration.rounds.length !== ROUND_IDS.length
    || !ROUND_IDS.every(round => declaration.rounds.includes(round))) return false;
  if (declaration.expectedPickCount !== (lastDraftYear - firstDraftYear + 1) * NBA_TEAM_IDS.length * ROUND_IDS.length) return false;
  return Boolean(sourcePin(declaration.source, asOfDate));
}

/**
 * Compile a source-pinned ownership snapshot to the explicit pick-rights view
 * and the subset safe to hand to `evaluateFranchiseTrade` as tradeableAssets.
 * A complete calendar has one row for every original NBA team/year/round. A
 * missing or invalid row blocks the entire asset list so Stepien/encumbrance
 * checks cannot see an incomplete team ledger.
 */
export function compileFranchiseDraftRights({
  asOfDate,
  firstDraftYear,
  lastDraftYear,
  completeness,
  pickRights,
} = {}) {
  const requestedAsOf = cleanText(asOfDate);
  const validHorizon = Number.isSafeInteger(firstDraftYear) && Number.isSafeInteger(lastDraftYear)
    && firstDraftYear >= 1947 && lastDraftYear >= firstDraftYear
    && lastDraftYear - firstDraftYear < 15;
  if (!isIsoDate(requestedAsOf) || !validHorizon) {
    return {
      status: 'unavailable', version: FRANCHISE_DRAFT_RIGHTS_VERSION, asOfDate: requestedAsOf || null,
      coverage: { status: 'incomplete', expectedPickCount: null, accountedPickCount: 0, missingRefs: [], invalidRefs: [], reasonCodes: ['draft-pick-horizon-or-as-of-date-invalid'] },
      pickRights: [], tradeableAssets: [],
    };
  }

  const expected = expectedPickKeys(firstDraftYear, lastDraftYear);
  const expectedByRef = new Map(expected.map(item => [rightsRef(item.draftYear, item.originalTeamId, item.round), item]));
  const incoming = Array.isArray(pickRights) ? pickRights : [];
  const rowsByRef = new Map();
  const invalidRefs = [];
  incoming.forEach(row => {
    const key = isRecord(row) && Number.isSafeInteger(Number(row.draftYear))
      && Number.isSafeInteger(Number(row.round)) && teamId(row.originalTeamId)
      ? rightsRef(Number(row.draftYear), teamId(row.originalTeamId), Number(row.round))
      : null;
    if (!key || !expectedByRef.has(key)) {
      invalidRefs.push(key || cleanText(row?.ref) || 'unknown-pick-rights-row');
      return;
    }
    const rows = rowsByRef.get(key) || [];
    rows.push(row);
    rowsByRef.set(key, rows);
  });

  const compiledRights = expected.map(item => {
    const ref = rightsRef(item.draftYear, item.originalTeamId, item.round);
    const matches = rowsByRef.get(ref) || [];
    if (matches.length === 0) return createMissingRight(item.draftYear, item.originalTeamId, item.round);
    if (matches.length > 1) return {
      ...createMissingRight(item.draftYear, item.originalTeamId, item.round),
      reasonCodes: ['draft-pick-rights-record-duplicate'],
      conflictCount: matches.length,
    };
    return normalizePickRight(matches[0], item, requestedAsOf);
  });

  const missingRefs = compiledRights.filter(row => row.reasonCodes.includes('draft-pick-rights-record-missing'))
    .map(row => row.ref);
  const rowInvalidRefs = compiledRights.filter(row => row.reasonCodes.length && !missingRefs.includes(row.ref))
    .map(row => row.ref);
  const declarationValid = coverageDeclarationIsComplete(completeness, requestedAsOf, firstDraftYear, lastDraftYear);
  const coverageComplete = declarationValid && missingRefs.length === 0 && rowInvalidRefs.length === 0 && invalidRefs.length === 0;
  const reasonCodes = [];
  if (!declarationValid) reasonCodes.push('draft-pick-rights-completeness-or-encumbrance-declaration-unavailable');
  if (missingRefs.length) reasonCodes.push('draft-pick-rights-ledger-missing-base-pick-rows');
  if (rowInvalidRefs.length) reasonCodes.push('draft-pick-rights-ledger-has-invalid-source-or-encumbrance-rows');
  if (invalidRefs.length) reasonCodes.push('draft-pick-rights-ledger-has-out-of-scope-rows');

  const tradeableAssets = coverageComplete
    ? compiledRights.filter(row => row.tradeStatus === 'available' && row.ownershipStatus === 'known' && row.ownerTeamId)
      .map(row => ({
        kind: 'draft-pick', ref: row.ref, ownerTeamId: row.ownerTeamId, status: 'available',
        draftYear: row.draftYear, round: row.round, originalTeamId: row.originalTeamId,
        rightsSource: row.source,
      }))
    : [];

  return {
    status: coverageComplete ? 'available' : 'unavailable',
    version: FRANCHISE_DRAFT_RIGHTS_VERSION,
    asOfDate: requestedAsOf,
    horizon: { firstDraftYear, lastDraftYear, rounds: [...ROUND_IDS], teamCount: NBA_TEAM_IDS.length },
    coverage: {
      status: coverageComplete ? 'complete' : 'incomplete',
      expectedPickCount: expected.length,
      accountedPickCount: compiledRights.filter(row => row.source).length,
      missingRefs,
      invalidRefs: [...new Set([...rowInvalidRefs, ...invalidRefs])].sort(),
      encumbranceCoverage: completeness?.encumbranceCoverage === 'complete' && coverageComplete ? 'complete' : 'incomplete',
      source: sourcePin(completeness?.source, requestedAsOf),
      reasonCodes,
    },
    pickRights: compiledRights,
    tradeableAssets,
  };
}

/** Return every right relevant to the requested team's own and incoming picks. */
export function getFranchiseDraftRightsForTeam(compiledLedger, requestedTeamId) {
  const team = teamId(requestedTeamId);
  if (!team || !isRecord(compiledLedger) || !Array.isArray(compiledLedger.pickRights)) {
    return { status: 'unavailable', teamId: team, pickRights: [], reasonCodes: ['draft-pick-team-ledger-unavailable'] };
  }
  const rows = compiledLedger.pickRights.filter(row => row.originalTeamId === team || row.ownerTeamId === team
    || row.encumbrances?.some(right => right.beneficiaryTeamId === team || right.counterpartyTeamIds?.includes(team)));
  return {
    status: compiledLedger.status === 'available' && compiledLedger.coverage?.status === 'complete' ? 'available' : 'unavailable',
    teamId: team,
    pickRights: rows,
    tradeableAssets: (compiledLedger.tradeableAssets || []).filter(asset => asset.ownerTeamId === team),
    coverage: compiledLedger.coverage || { status: 'incomplete' },
    reasonCodes: compiledLedger.status === 'available' ? [] : compiledLedger.coverage?.reasonCodes || ['draft-pick-rights-ledger-unavailable'],
  };
}

/**
 * Add modeled own-pick defaults only after a complete accepted transaction
 * history horizon. These are separate scenario assets: they are never merged
 * into verified `tradeableAssets` or represented as real-world ownership.
 * Franchise scenario trade flows may offer them as chips, but an injected
 * NBA rules policy must still validate the trade horizon, Stepien rule, pick
 * protections, freezes, and all other restrictions before commitment.
 */
export function buildFranchiseScenarioDraftRights({ verifiedLedger, throughDraftYear } = {}) {
  const verifiedThrough = Number(verifiedLedger?.horizon?.lastDraftYear);
  if (!verifiedLedger || verifiedLedger.status !== 'available' || verifiedLedger.coverage?.status !== 'complete'
    || !Number.isSafeInteger(verifiedThrough) || !Number.isSafeInteger(throughDraftYear)
    || throughDraftYear < verifiedThrough || throughDraftYear - verifiedThrough > 30) {
    return {
      status: 'unavailable', version: FRANCHISE_SCENARIO_DRAFT_RIGHTS_VERSION,
      verifiedThroughDraftYear: Number.isSafeInteger(verifiedThrough) ? verifiedThrough : null,
      throughDraftYear: Number.isSafeInteger(throughDraftYear) ? throughDraftYear : null,
      scenarioPickRights: [], scenarioTradeableAssets: [],
      reasonCodes: ['verified-draft-rights-horizon-or-scenario-year-invalid'],
    };
  }

  const scenarioPickRights = [];
  for (let draftYear = verifiedThrough + 1; draftYear <= throughDraftYear; draftYear += 1) {
    for (const originalTeamId of NBA_TEAM_IDS) {
      for (const round of ROUND_IDS) {
        const ref = `scenario_${rightsRef(draftYear, originalTeamId, round)}`;
        const provenance = {
          kind: 'model-assumption',
          modelId: 'nba-franchise-future-pick-default',
          modelVersion: FRANCHISE_SCENARIO_DRAFT_RIGHTS_VERSION,
          assumption: 'No post-horizon pick transactions are known to this snapshot; the scenario starts each future round with the originating team.',
          doesNotClaimRealWorldOwnership: true,
          verifiedThroughDraftYear: verifiedThrough,
        };
        scenarioPickRights.push({
          ref, draftYear, round, originalTeamId, ownerTeamId: originalTeamId,
          ownershipStatus: 'scenario-default-own-pick',
          tradeStatus: 'scenario-available-subject-to-rule-policy',
          encumbranceStatus: 'scenario-assumed-clear',
          encumbrances: [], provenance,
          evidence: 'modeled-scenario-assumption',
        });
      }
    }
  }

  const scenarioTradeableAssets = scenarioPickRights.map(row => ({
    kind: 'draft-pick', ref: row.ref, ownerTeamId: row.ownerTeamId, status: 'scenario-available',
    draftYear: row.draftYear, round: row.round, originalTeamId: row.originalTeamId,
    scenarioOnly: true, requiresLeagueRulesValidation: true,
    provenance: row.provenance,
  }));

  return {
    status: 'scenario',
    version: FRANCHISE_SCENARIO_DRAFT_RIGHTS_VERSION,
    verifiedThroughDraftYear: verifiedThrough,
    throughDraftYear,
    scenarioPickRights,
    scenarioTradeableAssets,
    statement: 'Only draft years strictly after the verified transaction-history horizon receive assumed own first- and second-round picks. This is a simulation default, not evidence of real-world ownership.',
    tradeNote: 'Scenario picks may be proposed in a modeled league; every proposal remains subject to a separate NBA horizon, Stepien, encumbrance, and applicable rule-policy evaluation.',
    reasonCodes: [],
  };
}

export const FRANCHISE_DRAFT_RIGHTS_TEAMS = NBA_TEAM_IDS;
