import {
  FRANCHISE_DRAFT_LOTTERY_321_POLICY_ID,
  FRANCHISE_DRAFT_LOTTERY_321_SOURCE_URL,
  FRANCHISE_DRAFT_LOTTERY_EXPLAINER_URL,
  FRANCHISE_DRAFT_LOTTERY_POLICY_ID,
  FRANCHISE_DRAFT_LOTTERY_VERSION,
  getFranchiseDraftLotteryPolicy,
  simulateThreeTwoOneFranchiseDraftLottery,
  simulateTraditionalFranchiseDraftLottery,
} from './nba-draft-lottery-source-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from './sha256-isomorphic-v1.mjs';
import { simulateDraftOrder } from './draft-simulation-v1.mjs';

export const NBA_DRAFT_LOTTERY_ADAPTER_VERSION_V1 = 'djhc-nba-draft-lottery-adapter-v1';

const CLASSIC_POLICY = FRANCHISE_DRAFT_LOTTERY_POLICY_ID;
const THREE_TWO_ONE_POLICY = FRANCHISE_DRAFT_LOTTERY_321_POLICY_ID;
const TEAM_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,79}$/;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function teamCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return TEAM_CODE_PATTERN.test(code) ? code : '';
}

function uniqueCodes(values) {
  if (!Array.isArray(values)) return null;
  const codes = values.map(teamCode);
  return codes.every(Boolean) && new Set(codes).size === codes.length ? codes : null;
}

function policySourceRefs(policy) {
  if (policy?.status !== 'available') return [];
  const refs = [{
    id: policy.policy,
    sourceUrl: policy.sourceUrl,
    sourceRef: policy.sourceRef,
  }];
  if (policy.policy === CLASSIC_POLICY) refs.push({
    id: 'nba-draft-lottery-explainer-2019-2026',
    sourceUrl: FRANCHISE_DRAFT_LOTTERY_EXPLAINER_URL,
    sourceRef: 'NBA.com Draft Lottery explainer; traditional lottery format effective 2019 through 2026',
  });
  if (policy.policy === THREE_TWO_ONE_POLICY) refs[0] = {
    ...refs[0],
    sourceUrl: FRANCHISE_DRAFT_LOTTERY_321_SOURCE_URL,
  };
  return refs;
}

function standingsReceiptError(receipt, standingsSeasonStartYear) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return 'A source-pinned standings receipt is required.';
  if (!nonEmptyString(receipt.id)) return 'The standings receipt needs a non-empty id.';
  if (!Number.isSafeInteger(receipt.seasonStartYear) || receipt.seasonStartYear !== standingsSeasonStartYear) {
    return 'The standings receipt seasonStartYear must match the standings season.';
  }
  if (!Array.isArray(receipt.sourceRefs) || !receipt.sourceRefs.length || receipt.sourceRefs.some(ref =>
    !(nonEmptyString(ref) || (ref && typeof ref === 'object' && !Array.isArray(ref) &&
      (nonEmptyString(ref.sourceUrl) || nonEmptyString(ref.sourceSystem) || nonEmptyString(ref.id)))))) {
    return 'The standings receipt needs at least one usable source reference.';
  }
  return null;
}

function recordError(standings, seasonStartYear) {
  if (!Array.isArray(standings) || standings.length !== 30) return 'Exactly 30 final regular-season standings rows are required.';
  const codes = new Set();
  for (const [index, row] of standings.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return `Standings row ${index + 1} is malformed.`;
    const code = teamCode(row.teamCode);
    if (!code || row.teamCode !== code || !TEAM_CODE_PATTERN.test(code)) return `Standings row ${index + 1} needs an uppercase stable teamCode.`;
    if (codes.has(code)) return `Standings contain duplicate teamCode ${code}.`;
    codes.add(code);
    if (!Number.isSafeInteger(row.seasonStartYear) || row.seasonStartYear !== seasonStartYear) {
      return `Standings row ${code} needs seasonStartYear ${seasonStartYear}.`;
    }
    if (!Number.isSafeInteger(row.wins) || !Number.isSafeInteger(row.losses) || row.wins < 0 || row.losses < 0 || row.wins + row.losses <= 0) {
      return `Standings row ${code} needs a non-empty nonnegative integer regular-season record.`;
    }
  }
  return null;
}

function compareWinPct(left, right) {
  const leftGames = left.wins + left.losses;
  const rightGames = right.wins + right.losses;
  const lhs = left.wins * rightGames;
  const rhs = right.wins * leftGames;
  return lhs === rhs ? 0 : lhs < rhs ? -1 : 1;
}

function validateOrderedGroup(codes, byCode, label, rejectTies) {
  let previous = null;
  for (const code of codes) {
    const row = byCode.get(code);
    if (!row) return `${label} team ${code} is absent from the final standings.`;
    if (previous) {
      const comparison = compareWinPct(previous.row, row);
      if (comparison > 0) return `${label} must be supplied from worst-to-best by regular-season win percentage.`;
      if (rejectTies && comparison === 0) {
        return `Tied records in ${label.toLowerCase()} need the NBA tie-odds treatment; the reused 2019-2026 helper accepts weights but does not calculate official tied-team combination sharing.`;
      }
    }
    previous = { row };
  }
  return null;
}

function orderedPartitionError(standings, lotteryCodes, nonLotteryCodes, expectedLotteryCount, expectedNonLotteryCount) {
  if (!lotteryCodes || lotteryCodes.length !== expectedLotteryCount) {
    return `Exactly ${expectedLotteryCount} lottery team codes are required for this season policy.`;
  }
  if (!nonLotteryCodes || nonLotteryCodes.length !== expectedNonLotteryCount) {
    return `Exactly ${expectedNonLotteryCount} non-lottery team codes in worst-to-best order are required.`;
  }
  const allCodes = new Set(standings.map(row => row.teamCode));
  const submitted = [...lotteryCodes, ...nonLotteryCodes];
  if (new Set(submitted).size !== submitted.length || submitted.length !== allCodes.size ||
      submitted.some(code => !allCodes.has(code))) {
    return 'Lottery and non-lottery team lists must form an exact, non-overlapping partition of the 30 standings teams.';
  }
  return null;
}

function standingsHash(standings) {
  return sha256HexV1(stableStringifyV1(standings));
}

function unavailableResult({ draftYear, standingsSeasonStartYear, reason, standings = [], seed = null, policy = null, sourceRefs = [] }) {
  return {
    format: 'djhc-draft-order-v1',
    status: 'unknown-or-provisional',
    order: [],
    standingsSeasonStartYear: Number.isSafeInteger(standingsSeasonStartYear) ? standingsSeasonStartYear : null,
    missingInputs: [reason],
    provisionalStandings: Array.isArray(standings) ? structuredClone(standings) : [],
    lotteryPolicyReceipt: {
      format: 'djhc-nba-draft-lottery-policy-receipt-v1',
      status: 'incomplete',
      draftYear: Number.isSafeInteger(draftYear) ? draftYear : null,
      standingsSeasonStartYear: Number.isSafeInteger(standingsSeasonStartYear) ? standingsSeasonStartYear : null,
      policy: policy?.policy ?? null,
      sourceRefs: structuredClone(sourceRefs),
      seed: Number.isSafeInteger(seed) ? seed : null,
      nbaHistoricalResult: false,
      missingInputs: [reason],
    },
  };
}

/**
 * Creates a season-pinned rule contract for simulateDraftOrder(). The result
 * uses the locally source-cited Franchise lottery implementation; it does not
 * load or claim historical lottery results or resolve current pick ownership.
 */
export function createNbaDraftLotteryRulesV1({
  draftYear,
  standingsSeasonStartYear,
  standingsReceipt,
  lotteryFieldEvidenceRef,
  lotteryTeamCodesWorstToBest,
  lotteryTeams,
  nonLotteryTeamCodesWorstToBest,
  draftRelegatedTeamCodes,
  ownPickHistory,
  standingsTieBreaks = [],
  leagueDiscipline,
} = {}) {
  const policy = getFranchiseDraftLotteryPolicy(draftYear);
  const sourceRefs = policySourceRefs(policy);
  const rules = {
    status: 'incomplete',
    ruleVersionId: `${NBA_DRAFT_LOTTERY_ADAPTER_VERSION_V1}:${policy.policy ?? 'unavailable'}`,
    seasonStartYear: Number.isSafeInteger(standingsSeasonStartYear) ? standingsSeasonStartYear : null,
    sourceRefs,
    resolveOrder: () => [],
    getLastReceipt: () => null,
    getLastFailure: () => null,
  };
  let lastReceipt = null;
  let lastFailure = null;
  rules.getLastReceipt = () => lastReceipt ? structuredClone(lastReceipt) : null;
  rules.getLastFailure = () => lastFailure;

  if (policy.status !== 'available') {
    lastFailure = policy.reason ?? 'No source-supported NBA lottery policy is available for this draft year.';
    return rules;
  }
  if (!Number.isSafeInteger(standingsSeasonStartYear) || draftYear !== standingsSeasonStartYear + 1) {
    lastFailure = 'NBA draftYear must be the calendar year immediately after standingsSeasonStartYear.';
    return rules;
  }
  const receiptError = standingsReceiptError(standingsReceipt, standingsSeasonStartYear);
  if (receiptError) {
    lastFailure = receiptError;
    return rules;
  }
  if (!nonEmptyString(lotteryFieldEvidenceRef)) {
    lastFailure = 'An evidence reference for the season-specific lottery field and eligibility is required.';
    return rules;
  }
  const nonLotteryCodes = uniqueCodes(nonLotteryTeamCodesWorstToBest);
  if (!nonLotteryCodes) {
    lastFailure = 'Non-lottery team codes must be unique canonical team codes in worst-to-best order.';
    return rules;
  }

  if (policy.policy === CLASSIC_POLICY) {
    const lotteryCodes = uniqueCodes(lotteryTeamCodesWorstToBest);
    if (!lotteryCodes || lotteryCodes.length !== 14) {
      lastFailure = 'The 2019-2026 policy requires 14 unique lottery team codes ordered worst-to-best.';
      return rules;
    }
    if (nonLotteryCodes.length !== 16) {
      lastFailure = 'The 2019-2026 policy requires the remaining 16 non-lottery teams in worst-to-best order.';
      return rules;
    }
    rules.resolveOrder = ({ standings, seed } = {}) => {
      lastReceipt = null;
      lastFailure = recordError(standings, standingsSeasonStartYear);
      if (lastFailure) return [];
      lastFailure = orderedPartitionError(standings, lotteryCodes, nonLotteryCodes, 14, 16);
      if (lastFailure) return [];
      const byCode = new Map(standings.map(row => [row.teamCode, row]));
      lastFailure = validateOrderedGroup(lotteryCodes, byCode, 'Lottery standings', true) ??
        validateOrderedGroup(nonLotteryCodes, byCode, 'Non-lottery standings', true);
      if (lastFailure) return [];

      const weightedLotteryTeams = lotteryCodes.map((code, index) => ({
        teamId: code,
        wins: byCode.get(code).wins,
        losses: byCode.get(code).losses,
        firstPickCombinations: policy.firstPickCombinationCounts[index],
      }));
      const internalSeed = String(seed);
      const draw = simulateTraditionalFranchiseDraftLottery({
        draftYear,
        lotteryTeamsWorstToBest: weightedLotteryTeams,
        seed: internalSeed,
      });
      if (draw.status !== 'ready') {
        lastFailure = draw.reason ?? 'The source-cited traditional lottery helper rejected its inputs.';
        return [];
      }
      const fullOrder = [
        ...draw.lotteryOrder.map(row => row.teamId),
        ...nonLotteryCodes,
      ];
      lastFailure = fullOrder.length === 30 && new Set(fullOrder).size === 30
        ? null
        : 'The traditional lottery draw did not resolve all 30 teams exactly once.';
      if (lastFailure) return [];
      lastReceipt = {
        format: 'djhc-nba-draft-lottery-policy-receipt-v1',
        status: 'simulated-policy-draw',
        adapterVersion: NBA_DRAFT_LOTTERY_ADAPTER_VERSION_V1,
        sourceEngineVersion: FRANCHISE_DRAFT_LOTTERY_VERSION,
        policy: policy.policy,
        draftYear,
        standingsSeasonStartYear,
        standingsReceipt: structuredClone(standingsReceipt),
        standingsSha256: standingsHash(standings),
        lotteryFieldEvidenceRef,
        ruleSourceRefs: structuredClone(sourceRefs),
        seed: { draftSimulationSeed: seed, sourceEngineSeed: internalSeed },
        simulatedLotteryOrder: structuredClone(draw.lotteryOrder),
        publishedFirstPickOdds: structuredClone(draw.firstPickOdds),
        completeDraftOrder: fullOrder,
        sourceEngineReceipt: structuredClone(draw.receipt),
        nbaHistoricalResult: false,
        disclosure: 'This is a seeded simulation using the published 2019-2026 first-pick combination weights. It is not an observed NBA lottery result. Tied-record odds are not implemented here and are rejected.',
        pickRights: 'Lottery order identifies original-team draft slots only; ownership, swaps, protections, conveyance, and encumbrances remain unresolved.',
      };
      return fullOrder;
    };
  } else if (policy.policy === THREE_TWO_ONE_POLICY) {
    if (!Array.isArray(lotteryTeams) || lotteryTeams.length !== 16) {
      lastFailure = 'The 2027-2029 policy requires 16 complete lottery entrant rows.';
      return rules;
    }
    if (lotteryTeams.some(row => !row || typeof row !== 'object' || Array.isArray(row) ||
        (row.teamCode !== undefined && row.teamId !== undefined && teamCode(row.teamCode) !== teamCode(row.teamId)))) {
      lastFailure = 'Each 2027-2029 lottery entrant needs one consistent teamCode/teamId identity.';
      return rules;
    }
    const lotteryCodes = uniqueCodes(lotteryTeams.map(row => row?.teamCode ?? row?.teamId));
    if (!lotteryCodes || lotteryCodes.length !== 16 || nonLotteryCodes.length !== 14) {
      lastFailure = 'The 2027-2029 policy requires 16 unique lottery entrants and 14 non-lottery teams.';
      return rules;
    }
    const relegatedCodes = uniqueCodes(draftRelegatedTeamCodes);
    if (!relegatedCodes || relegatedCodes.length !== 3 || !Array.isArray(ownPickHistory) || !Array.isArray(standingsTieBreaks) ||
        !leagueDiscipline || typeof leagueDiscipline !== 'object') {
      lastFailure = 'The 2027-2029 policy requires three draft-relegated IDs, two-year original-team own-pick history, tie inputs, and an explicit league-discipline state.';
      return rules;
    }
    rules.resolveOrder = ({ standings, seed } = {}) => {
      lastReceipt = null;
      lastFailure = recordError(standings, standingsSeasonStartYear);
      if (lastFailure) return [];
      lastFailure = orderedPartitionError(standings, lotteryCodes, nonLotteryCodes, 16, 14);
      if (lastFailure) return [];
      const byCode = new Map(standings.map(row => [row.teamCode, row]));
      const rankFieldsMissing = standings.some(row => !['East', 'West'].includes(row.conference) ||
        !Number.isSafeInteger(row.conferenceSeed) || !Number.isSafeInteger(row.leagueRankWorstToBest));
      if (rankFieldsMissing) {
        lastFailure = '2027-2029 standings require exact East/West conference seeds and leagueRankWorstToBest on every row.';
        return [];
      }
      if (nonLotteryCodes.some((code, index) => index > 0 &&
          byCode.get(nonLotteryCodes[index - 1]).leagueRankWorstToBest >= byCode.get(code).leagueRankWorstToBest)) {
        lastFailure = 'Non-lottery team order must follow unique league ranks from worst-to-best.';
        return [];
      }

      const leagueStandings = standings.map(row => ({
        teamId: row.teamCode,
        conference: row.conference,
        conferenceSeed: row.conferenceSeed,
        leagueRankWorstToBest: row.leagueRankWorstToBest,
        wins: row.wins,
        losses: row.losses,
      }));
      const normalizedLotteryTeams = lotteryTeams.map(row => ({ ...row, teamId: teamCode(row.teamCode ?? row.teamId) }));
      const draw = simulateThreeTwoOneFranchiseDraftLottery({
        draftYear,
        lotteryTeams: normalizedLotteryTeams,
        leagueStandings,
        leagueStandingsEvidenceRef: standingsReceipt.id,
        draftRelegatedTeamIds: relegatedCodes,
        ownPickHistory,
        standingsTieBreaks,
        leagueDiscipline,
        seed: String(seed),
      });
      if (draw.status !== 'ready') {
        lastFailure = draw.reason ?? 'The source-cited 3-2-1 lottery helper rejected its inputs.';
        return [];
      }
      const fullOrder = [
        ...draw.lotteryOrder.map(row => row.teamId),
        ...nonLotteryCodes,
      ];
      lastFailure = fullOrder.length === 30 && new Set(fullOrder).size === 30
        ? null
        : 'The 3-2-1 lottery draw did not resolve all 30 teams exactly once.';
      if (lastFailure) return [];
      lastReceipt = {
        format: 'djhc-nba-draft-lottery-policy-receipt-v1',
        status: 'simulated-policy-draw',
        adapterVersion: NBA_DRAFT_LOTTERY_ADAPTER_VERSION_V1,
        sourceEngineVersion: FRANCHISE_DRAFT_LOTTERY_VERSION,
        policy: policy.policy,
        draftYear,
        standingsSeasonStartYear,
        standingsReceipt: structuredClone(standingsReceipt),
        standingsSha256: standingsHash(standings),
        lotteryFieldEvidenceRef,
        ruleSourceRefs: structuredClone(sourceRefs),
        seed: { draftSimulationSeed: seed, sourceEngineSeed: String(seed) },
        simulatedLotteryOrder: structuredClone(draw.lotteryOrder),
        completeDraftOrder: fullOrder,
        sourceEngineReceipt: structuredClone(draw.receipt),
        nbaHistoricalResult: false,
        disclosure: draw.receipt.drawMethodDisclosure,
        pickRights: draw.receipt.pickRights,
      };
      return fullOrder;
    };
  } else {
    lastFailure = 'The cited lottery policy has no compatible season-specific simulator.';
    return rules;
  }

  rules.status = 'complete';
  return rules;
}

/** Runs a source-bounded simulated lottery through the existing draft-order guard. */
export function simulateNbaDraftOrderWithLotteryPolicyV1({ standings, standingsSeasonStartYear, seed,
  ...ruleInputs } = {}) {
  const draftYear = ruleInputs.draftYear;
  const rules = createNbaDraftLotteryRulesV1({ ...ruleInputs, standingsSeasonStartYear });
  if (rules.status !== 'complete') {
    return unavailableResult({
      draftYear,
      standingsSeasonStartYear,
      reason: rules.getLastFailure() ?? 'Season-specific NBA lottery inputs are incomplete.',
      standings,
      seed,
      policy: getFranchiseDraftLotteryPolicy(draftYear),
      sourceRefs: rules.sourceRefs,
    });
  }
  const standingsError = recordError(standings, standingsSeasonStartYear);
  if (standingsError) {
    return unavailableResult({
      draftYear,
      standingsSeasonStartYear,
      reason: standingsError,
      standings,
      seed,
      policy: getFranchiseDraftLotteryPolicy(draftYear),
      sourceRefs: rules.sourceRefs,
    });
  }
  const result = simulateDraftOrder({ standings, standingsSeasonStartYear, seed, lotteryRules: rules });
  const receipt = rules.getLastReceipt();
  if (result.status !== 'resolved-by-supplied-season-rules' || !receipt) {
    const reason = rules.getLastFailure() ?? result.missingInputs?.[0] ?? 'Lottery order remains incomplete.';
    return {
      ...result,
      status: 'unknown-or-provisional',
      order: [],
      missingInputs: [...new Set([...(result.missingInputs ?? []), reason])],
      lotteryPolicyReceipt: {
        format: 'djhc-nba-draft-lottery-policy-receipt-v1',
        status: 'incomplete',
        adapterVersion: NBA_DRAFT_LOTTERY_ADAPTER_VERSION_V1,
        policy: getFranchiseDraftLotteryPolicy(draftYear).policy ?? null,
        draftYear,
        standingsSeasonStartYear,
        standingsReceipt: ruleInputs.standingsReceipt ?? null,
        sourceRefs: structuredClone(rules.sourceRefs),
        seed: Number.isSafeInteger(seed) ? seed : null,
        nbaHistoricalResult: false,
        missingInputs: [...new Set([reason])],
      },
    };
  }
  return {
    ...result,
    lotteryOutcomeStatus: 'simulated-not-historical',
    lotteryPolicyReceipt: receipt,
  };
}
