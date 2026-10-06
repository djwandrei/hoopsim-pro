/*
 * Source-bounded NBA draft lottery helper for Franchise simulations.
 *
 * This module models the traditional 2019-2026 lottery and the published
 * 2027-2029 3-2-1 policy. The latter's NBA release specifies the 16 entries,
 * ball counts, pick floor, and own-pick restrictions, but not the precise
 * physical draw/conflict-resolution procedure. We use a deterministic,
 * seeded weighted permutation over the published ball counts and explicitly
 * identify it as a model inference in each receipt.
 *
 * The NBA approved a different 3-2-1 lottery beginning with the 2027 Draft.
 * Its published policy includes all 16 lottery positions, pick floors,
 * restrictions that follow the original team's own pick, and play-in entries.
 * This helper requires explicit standings/tie and own-pick history inputs.
 * Draft years from 2030 onward are also unavailable because the NBA says the
 * rules are to be determined by a future Board of Governors vote.
 *
 * Sources:
 * NBA Constitution & By-Laws, Article 7.02(a), official odds / first four /
 * inverse standings / tie discretion / lottery exclusions:
 * https://cms.nba.com/wp-content/uploads/sites/4/2024/06/NBA-Consitution-By-Laws-June-2024.pdf
 * NBA 2026 Draft Lottery explainer, combination procedure and format effective
 * for the 2019-2026 drafts:
 * https://www.nba.com/news/nba-draft-lottery-explainer
 * NBA Board of Governors' approved 3-2-1 system, effective 2027-2029:
 * https://www.nba.com/news/nba-board-governors-approve-new-draft-lottery-system
 */

export const FRANCHISE_DRAFT_LOTTERY_VERSION = 'swishiq-franchise-draft-lottery-v2';
export const FRANCHISE_DRAFT_LOTTERY_POLICY_ID = 'nba-traditional-weighted-lottery-2019-2026';
export const FRANCHISE_DRAFT_LOTTERY_321_POLICY_ID = 'nba-3-2-1-lottery-2027-2029';
export const FRANCHISE_DRAFT_LOTTERY_SOURCE_URL = 'https://cms.nba.com/wp-content/uploads/sites/4/2024/06/NBA-Consitution-By-Laws-June-2024.pdf';
export const FRANCHISE_DRAFT_LOTTERY_EXPLAINER_URL = 'https://www.nba.com/news/nba-draft-lottery-explainer';
export const FRANCHISE_DRAFT_LOTTERY_321_SOURCE_URL = 'https://www.nba.com/news/nba-board-governors-approve-new-draft-lottery-system';

const CLASSIC_DRAFT_YEAR_MIN = 2019;
const CLASSIC_DRAFT_YEAR_MAX = 2026;
const CLASSIC_REPLAY_VERSION = 'swishiq-franchise-draft-lottery-v1';
const CLASSIC_LOTTERY_COMBINATIONS = Object.freeze([140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5]);
const THREE_TWO_ONE_BALLS = Object.freeze({
  draftRelegatedNonPlayIn: 2,
  otherNonPlayIn: 3,
  playInSeedsNineTen: 2,
  playInSevenEightLoser: 1,
});
const THREE_TWO_ONE_TEAM_COUNT = 16;
const THREE_TWO_ONE_TOTAL_BALLS = 37;
const THREE_TWO_ONE_DRAFT_RELEGATION_FLOOR = 12;
const TOTAL_ASSIGNED_COMBINATIONS = 1000;
const TEAM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const REPLAY_SEED = /^[A-Za-z0-9:._-]{1,80}$/;
const CONFERENCES = new Set(['East', 'West']);
const THREE_TWO_ONE_ENTRY_TYPES = new Set(['non-play-in', 'play-in-9-10', 'play-in-7-8-loser']);
const NBA_LOTTERY_POLICY_321_SOURCE_REF = 'NBA Board of Governors approved 3-2-1 Lottery, effective with the 2027, 2028, and 2029 Drafts';
const WEIGHTED_PERMUTATION_METHOD = 'seeded-weighted-permutation-without-replacement-over-published-ball-counts';
const WEIGHTED_PERMUTATION_DISCLOSURE = 'NBA publishes ball counts and that all 16 positions are drawn, but not the exact physical draw or conflict-resolution algorithm. This deterministic weighted permutation is a model consistent with the published ball counts, not a claim to reproduce the NBA drawing procedure.';

function unavailable(reason, draftYear = null, policy = null) {
  return { status: 'unavailable', reason, draftYear, policy };
}

function seedRandom(seed) {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function getFranchiseDraftLotteryPolicy(draftYear) {
  if (!Number.isSafeInteger(draftYear) || draftYear < 1947 || draftYear > 2200) {
    return unavailable('A valid NBA draft year is required.', null);
  }
  if (draftYear >= CLASSIC_DRAFT_YEAR_MIN && draftYear <= CLASSIC_DRAFT_YEAR_MAX) {
    return {
      status: 'available', draftYear,
      policy: FRANCHISE_DRAFT_LOTTERY_POLICY_ID,
      sourceUrl: FRANCHISE_DRAFT_LOTTERY_SOURCE_URL,
      sourceRef: 'NBA Constitution & By-Laws Article 7.02(a); traditional weighted lottery effective 2019 through 2026',
      lotteryTeamCount: 14,
      drawnPickCount: 4,
      firstPickCombinationCounts: [...CLASSIC_LOTTERY_COMBINATIONS],
      totalAssignedCombinations: TOTAL_ASSIGNED_COMBINATIONS,
      remainingOrder: 'inverse-standings-order',
    };
  }
  if (draftYear >= 2027 && draftYear <= 2029) {
    return {
      status: 'available',
      draftYear,
      policy: FRANCHISE_DRAFT_LOTTERY_321_POLICY_ID,
      sourceUrl: FRANCHISE_DRAFT_LOTTERY_321_SOURCE_URL,
      sourceRef: NBA_LOTTERY_POLICY_321_SOURCE_REF,
      lotteryTeamCount: THREE_TWO_ONE_TEAM_COUNT,
      drawnPickCount: THREE_TWO_ONE_TEAM_COUNT,
      totalLotteryBalls: THREE_TWO_ONE_TOTAL_BALLS,
      draftRelegationFloor: THREE_TWO_ONE_DRAFT_RELEGATION_FLOOR,
      ballCounts: { ...THREE_TWO_ONE_BALLS },
      ownPickRestrictions: {
        consecutiveNoOne: 'the original team own pick cannot be No. 1 in consecutive drafts, regardless of current holder',
        consecutiveTopFive: 'the original team own pick cannot be top five in three consecutive drafts, regardless of current holder',
      },
      newlyTradedPickProtectionRestriction: 'teams cannot attach top-12 through top-15 protections to newly traded draft picks',
      sourceLimitations: [
        'The NBA release does not publish exact tie-resolution details for this policy.',
        'The NBA release does not publish the physical draw or resolution procedure when floors or own-pick restrictions affect a slot.',
        'League discipline adjustments require an explicit accepted input; this helper does not invent them.',
        'All 30 final records, regular-season conference seeds, and league-wide ranks must be supplied consistently; ties need evidence-backed ordering.',
        'Pick ownership, swaps, protections, conveyance, and encumbrances are separate from lottery order and are not resolved here.',
      ],
      drawMethod: WEIGHTED_PERMUTATION_METHOD,
      drawMethodDisclosure: WEIGHTED_PERMUTATION_DISCLOSURE,
    };
  }
  if (draftYear >= 2030) {
    return {
      ...unavailable(
        'NBA draft selection rules for 2030 onward are not established in the cited release; the Board of Governors is to determine them.',
        draftYear,
        { id: 'future-draft-policy-unpublished', sourceUrl: FRANCHISE_DRAFT_LOTTERY_321_SOURCE_URL,
          sourceRef: 'NBA Board of Governors approved 3-2-1 Lottery, effective 2027-2029; 2030+ to be determined' },
      ),
      missingInputs: ['the post-2029 Board-approved draft order policy', 'the applicable season-specific official rules and eligibility data'],
      scenarioOnlyFallbackSuggestion: getFranchiseDraftLotteryScenarioFallbackSuggestion(draftYear),
    };
  }
  return unavailable(
    'This helper is limited to the 2019-2026 lottery format; earlier draft lottery rules varied by year.',
    draftYear,
    { id: 'historical-policy-not-implemented', sourceUrl: FRANCHISE_DRAFT_LOTTERY_EXPLAINER_URL,
      sourceRef: 'NBA.com draft lottery history and format changes' },
  );
}

function compareWinPercentage(left, right) {
  const leftGames = left.wins + left.losses;
  const rightGames = right.wins + right.losses;
  const lhs = left.wins * rightGames;
  const rhs = right.wins * leftGames;
  return lhs === rhs ? 0 : lhs < rhs ? -1 : 1;
}

function sameIdSet(left, right) {
  return Array.isArray(left) && left.length === right.length
    && new Set(left).size === left.length
    && left.every(id => right.includes(id));
}

function validateTieResolution(resolution, tiedTeams, standingsById) {
  if (!resolution || !Array.isArray(resolution.teamIds) || !Array.isArray(resolution.worstToBest)
    || resolution.teamIds.length !== resolution.worstToBest.length
    || new Set(resolution.teamIds).size !== resolution.teamIds.length
    || !sameIdSet(resolution.teamIds, resolution.worstToBest)
    || !sameIdSet(resolution.teamIds, tiedTeams.map(team => team.teamId))
    || typeof resolution.evidenceRef !== 'string' || !resolution.evidenceRef.trim()) return false;
  const tiedIds = new Set(tiedTeams.map(team => team.teamId));
  const tieOrder = resolution.worstToBest.filter(teamId => tiedIds.has(teamId));
  if (!tieOrder.every((teamId, index) => teamId === tiedTeams[index].teamId)) return false;

  const byConference = new Map();
  for (const team of tiedTeams) {
    if (!byConference.has(team.conference)) byConference.set(team.conference, []);
    byConference.get(team.conference).push(team);
  }
  for (const [conference, conferenceTies] of byConference) {
    if (conferenceTies.length < 2) continue;
    const conferenceOrder = resolution.conferenceBestToWorstByConference?.[conference];
    const expected = [...conferenceTies]
      .sort((left, right) => standingsById.get(left.teamId).conferenceSeed - standingsById.get(right.teamId).conferenceSeed)
      .map(team => team.teamId);
    if (!Array.isArray(conferenceOrder) || !sameIdSet(conferenceOrder, expected)
      || conferenceOrder.some((teamId, index) => teamId !== expected[index])) return false;
  }
  return true;
}

function validateThreeTwoOneInputs({ draftYear, lotteryTeams, leagueStandings, leagueStandingsEvidenceRef,
  draftRelegatedTeamIds, ownPickHistory, standingsTieBreaks, leagueDiscipline, seed }) {
  if (typeof seed !== 'string' || !REPLAY_SEED.test(seed)) return 'A fixed alphanumeric replay seed is required.';
  if (!Array.isArray(lotteryTeams) || lotteryTeams.length !== THREE_TWO_ONE_TEAM_COUNT) {
    return 'Exactly 16 3-2-1 lottery entries are required.';
  }
  if (!Array.isArray(leagueStandings) || leagueStandings.length !== 30
    || typeof leagueStandingsEvidenceRef !== 'string' || !leagueStandingsEvidenceRef.trim()) {
    return 'All 30 final league standings with an evidence reference are required to validate lottery entrants, seeds, and the draft-relegation floor.';
  }

  const standingsById = new Map();
  const conferenceStandings = { East: [], West: [] };
  const leagueRanks = new Set();
  const conferenceSeedsInStandings = { East: new Set(), West: new Set() };
  for (const [index, team] of leagueStandings.entries()) {
    if (!team || typeof team !== 'object' || Array.isArray(team)) return `League standings row ${index + 1} is malformed.`;
    const teamId = typeof team.teamId === 'string' ? team.teamId.trim() : '';
    if (!TEAM_ID.test(teamId) || team.teamId !== teamId || standingsById.has(teamId)) {
      return `League standings row ${index + 1} needs a unique canonical stable team reference.`;
    }
    if (!CONFERENCES.has(team.conference)
      || !Number.isSafeInteger(team.conferenceSeed) || team.conferenceSeed < 1 || team.conferenceSeed > 15
      || !Number.isSafeInteger(team.leagueRankWorstToBest) || team.leagueRankWorstToBest < 1 || team.leagueRankWorstToBest > 30
      || !Number.isSafeInteger(team.wins) || !Number.isSafeInteger(team.losses)
      || team.wins < 0 || team.losses < 0 || team.wins + team.losses <= 0) {
      return `League standings row ${teamId} needs conference, seeds, league rank, and a non-empty nonnegative integer regular-season record.`;
    }
    if (leagueRanks.has(team.leagueRankWorstToBest)) return 'All 30 league-wide worst-to-best ranks must be unique.';
    if (conferenceSeedsInStandings[team.conference].has(team.conferenceSeed)) {
      return `Conference ${team.conference} has a duplicate regular-season seed in the supplied league standings.`;
    }
    leagueRanks.add(team.leagueRankWorstToBest);
    conferenceSeedsInStandings[team.conference].add(team.conferenceSeed);
    standingsById.set(teamId, team);
    conferenceStandings[team.conference].push(team);
  }
  for (const conference of ['East', 'West']) {
    if (conferenceStandings[conference].length !== 15
      || Array.from({ length: 15 }, (_, index) => index + 1).some(seedNumber => !conferenceSeedsInStandings[conference].has(seedNumber))) {
      return `Conference ${conference} needs exactly one final standings team at each regular-season seed from 1 through 15.`;
    }
  }

  const allRanked = [...leagueStandings].sort((a, b) => a.leagueRankWorstToBest - b.leagueRankWorstToBest);
  if (allRanked.some((team, index) => team.leagueRankWorstToBest !== index + 1)) {
    return 'All 30 league-wide worst-to-best ranks must be supplied without gaps.';
  }
  for (let index = 1; index < allRanked.length; index += 1) {
    if (compareWinPercentage(allRanked[index - 1], allRanked[index]) > 0) {
      return 'League-wide ranks must order all teams worst-to-best by regular-season winning percentage.';
    }
  }
  for (const conference of ['East', 'West']) {
    const bestToWorst = [...conferenceStandings[conference]].sort((a, b) => a.conferenceSeed - b.conferenceSeed);
    for (let index = 1; index < bestToWorst.length; index += 1) {
      if (compareWinPercentage(bestToWorst[index - 1], bestToWorst[index]) < 0) {
        return `Conference ${conference} seeds must order teams best-to-worst by regular-season winning percentage.`;
      }
    }
  }

  const byId = new Map();
  const counts = { 'non-play-in': 0, 'play-in-9-10': 0, 'play-in-7-8-loser': 0 };
  const conferenceSeeds = { East: new Set(), West: new Set() };
  const sevenEightLosersByConference = { East: 0, West: 0 };
  const nonPlayInSeedsByConference = { East: new Set(), West: new Set() };
  for (const [index, team] of lotteryTeams.entries()) {
    if (!team || typeof team !== 'object' || Array.isArray(team)) return `Lottery entry ${index + 1} is malformed.`;
    const teamId = typeof team.teamId === 'string' ? team.teamId.trim() : '';
    if (!TEAM_ID.test(teamId) || team.teamId !== teamId || byId.has(teamId)) return `Lottery entry ${index + 1} needs a unique canonical stable team reference.`;
    if (!CONFERENCES.has(team.conference)) return `Lottery team ${teamId} needs conference East or West.`;
    if (!THREE_TWO_ONE_ENTRY_TYPES.has(team.entryType)) return `Lottery team ${teamId} has an unsupported entry type.`;
    if (!Number.isSafeInteger(team.wins) || !Number.isSafeInteger(team.losses) || team.wins < 0 || team.losses < 0 || team.wins + team.losses <= 0) {
      return `Lottery team ${teamId} needs a non-empty nonnegative integer regular-season record.`;
    }
    if (!Number.isSafeInteger(team.leagueRankWorstToBest) || team.leagueRankWorstToBest < 1 || team.leagueRankWorstToBest > 30) {
      return `Lottery team ${teamId} needs an explicit league rank from worst (1) through best (30).`;
    }
    if (!Number.isSafeInteger(team.conferenceSeed) || team.conferenceSeed < 7 || team.conferenceSeed > 15) {
      return `Lottery team ${teamId} needs its regular-season conference seed from 7 through 15.`;
    }
    if (conferenceSeeds[team.conference].has(team.conferenceSeed)) return `Conference ${team.conference} has a duplicate lottery seed.`;
    conferenceSeeds[team.conference].add(team.conferenceSeed);
    counts[team.entryType] += 1;

    if (team.entryType === 'non-play-in') {
      if (team.conferenceSeed < 11) return `Non-play-in lottery team ${teamId} must be a regular-season seed 11 through 15.`;
      nonPlayInSeedsByConference[team.conference].add(team.conferenceSeed);
    } else if (team.entryType === 'play-in-9-10') {
      if (team.conferenceSeed !== 9 && team.conferenceSeed !== 10) return `Play-In team ${teamId} must be a regular-season seed 9 or 10.`;
    } else {
      if (team.conferenceSeed !== 7 && team.conferenceSeed !== 8) return `One-ball Play-In team ${teamId} must be a regular-season seed 7 or 8.`;
      if (team.playInResult !== 'lost-7-v-8') return `Play-In team ${teamId} needs an explicit loss in its conference's No. 7 vs. No. 8 game.`;
      if (typeof team.playInEvidenceRef !== 'string' || !team.playInEvidenceRef.trim()) return `Play-In team ${teamId} needs evidence for its No. 7 vs. No. 8 result.`;
      sevenEightLosersByConference[team.conference] += 1;
    }
    const standingsRow = standingsById.get(teamId);
    if (!standingsRow) return `Lottery entrant ${teamId} is missing from the supplied 30-team league standings.`;
    if (team.conference !== standingsRow.conference || team.conferenceSeed !== standingsRow.conferenceSeed
      || team.leagueRankWorstToBest !== standingsRow.leagueRankWorstToBest
      || team.wins !== standingsRow.wins || team.losses !== standingsRow.losses) {
      return `Lottery entrant ${teamId} does not match its conference seed, league rank, and record in the supplied final standings.`;
    }
    byId.set(teamId, team);
  }

  if (counts['non-play-in'] !== 10 || counts['play-in-9-10'] !== 4 || counts['play-in-7-8-loser'] !== 2) {
    return 'The published 3-2-1 field requires 10 non-play-in teams, four No. 9/10 seeds, and two No. 7/8 game losers.';
  }
  if (!Array.isArray(standingsTieBreaks) || standingsTieBreaks.some(row => !Array.isArray(row?.teamIds)
    || !Array.isArray(row?.worstToBest) || row.teamIds.length !== row.worstToBest.length
    || new Set(row.teamIds).size !== row.teamIds.length || !sameIdSet(row.teamIds, row.worstToBest)
    || (row.conferenceBestToWorstByConference !== undefined
      && (!row.conferenceBestToWorstByConference || typeof row.conferenceBestToWorstByConference !== 'object'
        || Array.isArray(row.conferenceBestToWorstByConference)
        || Object.entries(row.conferenceBestToWorstByConference).some(([conference, teamIds]) =>
          !CONFERENCES.has(conference) || !Array.isArray(teamIds) || new Set(teamIds).size !== teamIds.length
          || teamIds.some(teamId => !row.teamIds.includes(teamId)))))
    || typeof row.evidenceRef !== 'string' || !row.evidenceRef.trim())) {
    return 'Standings tie-break inputs need complete ordered team IDs, valid conference tie-break arrays when supplied, and evidence references.';
  }
  for (const conference of ['East', 'West']) {
    const expectedNonPlayInSeeds = [11, 12, 13, 14, 15];
    if (expectedNonPlayInSeeds.some(seedNumber => !nonPlayInSeedsByConference[conference].has(seedNumber))) {
      return `Conference ${conference} needs one non-play-in team at each regular-season seed 11 through 15.`;
    }
    if (![9, 10].every(seedNumber => conferenceSeeds[conference].has(seedNumber))) {
      return `Conference ${conference} needs both regular-season Play-In seeds 9 and 10.`;
    }
    if (sevenEightLosersByConference[conference] !== 1) {
      return `Conference ${conference} needs exactly one explicit loser of its No. 7 vs. No. 8 game.`;
    }
  }

  const ranked = [...lotteryTeams].sort((a, b) => a.leagueRankWorstToBest - b.leagueRankWorstToBest);
  if (new Set(ranked.map(row => row.leagueRankWorstToBest)).size !== ranked.length) {
    return 'Lottery teams need unique explicit league ranks; resolve regular-season ties before running the draw.';
  }
  for (let index = 1; index < ranked.length; index += 1) {
    if (compareWinPercentage(ranked[index - 1], ranked[index]) > 0) {
      return 'Explicit league ranks must order lottery teams worst-to-best by regular-season winning percentage.';
    }
  }
  const tiedGroups = new Map();
  for (const team of allRanked) {
    const games = team.wins + team.losses;
    let numerator = team.wins;
    let denominator = games;
    let left = numerator;
    let right = denominator;
    while (right !== 0) [left, right] = [right, left % right];
    const divisor = left || 1;
    numerator /= divisor;
    denominator /= divisor;
    const key = `${numerator}/${denominator}`;
    if (!tiedGroups.has(key)) tiedGroups.set(key, []);
    tiedGroups.get(key).push(team);
  }
  for (const tiedTeams of tiedGroups.values()) {
    if (tiedTeams.length < 2) continue;
    const resolution = Array.isArray(standingsTieBreaks)
      ? standingsTieBreaks.find(row => validateTieResolution(row, tiedTeams, standingsById))
      : null;
    if (!resolution) {
      return `Tied league standings (${tiedTeams.map(team => team.teamId).join(', ')}) require an explicit worst-to-best tie resolution, conference seed tie-break order where applicable, and evidence reference.`;
    }
  }

  const relegatedIds = Array.isArray(draftRelegatedTeamIds) ? draftRelegatedTeamIds : [];
  if (relegatedIds.length !== 3 || new Set(relegatedIds).size !== 3 || relegatedIds.some(id => !byId.has(id))) {
    return 'The three draft-relegated team IDs must be supplied explicitly.';
  }
  const expectedRelegated = allRanked.slice(0, 3).map(team => team.teamId);
  if (!sameIdSet(relegatedIds, expectedRelegated)) {
    return 'Draft-relegated IDs must match the three worst explicit ranks in the complete league standings.';
  }
  if (expectedRelegated.some(teamId => byId.get(teamId).entryType !== 'non-play-in')) {
    return 'The three worst standings ranks conflict with the published non-play-in draft-relegation input; confirm league classification before applying the floor.';
  }

  if (!leagueDiscipline || !['none', 'adjustments', 'unknown'].includes(leagueDiscipline.status)
    || typeof leagueDiscipline.evidenceRef !== 'string' || !leagueDiscipline.evidenceRef.trim()
    || (leagueDiscipline.status === 'none' && (!Array.isArray(leagueDiscipline.adjustments) || leagueDiscipline.adjustments.length > 0))
    || (leagueDiscipline.status === 'adjustments' && (!Array.isArray(leagueDiscipline.adjustments) || leagueDiscipline.adjustments.length === 0))) {
    return 'An explicit league-discipline state with evidence is required; confirm no adjustment or supply adjustments to an accepted discipline model.';
  }
  if (leagueDiscipline.status === 'unknown') return 'League lottery discipline is unknown; obtain the accepted league adjustment record before drawing.';
  if (leagueDiscipline.status === 'adjustments') return 'League lottery discipline adjustments are supplied, but no accepted adjustment model is wired to this lottery helper.';

  if (!Array.isArray(ownPickHistory)) return 'Own-pick history for the prior two drafts is required to apply the published restrictions.';
  if (!Number.isSafeInteger(draftYear)) return 'A valid draft year is required for own-pick restriction history.';
  const neededYears = [draftYear - 2, draftYear - 1];
  const history = new Map();
  for (const row of ownPickHistory) {
    if (!row || typeof row !== 'object' || !byId.has(row.teamId)
      || !neededYears.includes(row.draftYear) || !Number.isSafeInteger(row.pickNumber)
      || row.pickNumber < 1 || row.pickNumber > 30
      || typeof row.evidenceRef !== 'string' || !row.evidenceRef.trim()) {
      return 'Each own-pick history row needs a participating original team, one of the prior two draft years, an original pick number from 1 through 30, and an evidence reference.';
    }
    const key = `${row.teamId}:${row.draftYear}`;
    if (history.has(key)) return `Duplicate own-pick history for ${row.teamId} in ${row.draftYear}.`;
    history.set(key, row);
  }
  for (const teamId of byId.keys()) {
    for (const year of neededYears) {
      if (!history.has(`${teamId}:${year}`)) return `Own-pick history for ${teamId} in draft ${year} is required; current-holder records do not replace original-team history.`;
    }
  }
  return null;
}

function getOwnPickRestrictionState(teamId, draftYear, ownPickHistory) {
  const pickByYear = new Map(ownPickHistory
    .filter(row => row.teamId === teamId)
    .map(row => [row.draftYear, row.pickNumber]));
  const previousPick = pickByYear.get(draftYear - 1);
  const twoBackPick = pickByYear.get(draftYear - 2);
  return {
    barredFromNoOne: previousPick === 1,
    barredFromTopFive: previousPick <= 5 && twoBackPick <= 5,
    previousOwnPickNumbers: { [draftYear - 2]: twoBackPick, [draftYear - 1]: previousPick },
  };
}

function threeTwoOnePolicyEvidence(policyResult) {
  return {
    id: policyResult.policy,
    sourceUrl: policyResult.sourceUrl,
    sourceRef: policyResult.sourceRef,
    drawMethod: policyResult.drawMethod,
    drawMethodDisclosure: policyResult.drawMethodDisclosure,
    sourceLimitations: [...policyResult.sourceLimitations],
  };
}

/**
 * Simulates the published 2027-2029 3-2-1 lottery policy. The standings rows
 * identify original-team pick slots. Rights ownership, swaps, protections,
 * and the identity of the selecting club are intentionally resolved outside
 * this lottery-order model.
 */
export function simulateThreeTwoOneFranchiseDraftLottery({
  draftYear, lotteryTeams, leagueStandings, leagueStandingsEvidenceRef, draftRelegatedTeamIds,
  ownPickHistory, standingsTieBreaks = [], leagueDiscipline, seed,
} = {}) {
  const policyResult = getFranchiseDraftLotteryPolicy(draftYear);
  if (policyResult.status !== 'available' || policyResult.policy !== FRANCHISE_DRAFT_LOTTERY_321_POLICY_ID) {
    return policyResult.status !== 'available'
      ? policyResult
      : unavailable('The 3-2-1 policy is only available for the 2027-2029 NBA Drafts.', draftYear, policyResult);
  }
  const invalid = validateThreeTwoOneInputs({
    draftYear, lotteryTeams, leagueStandings, leagueStandingsEvidenceRef, draftRelegatedTeamIds,
    ownPickHistory, standingsTieBreaks, leagueDiscipline, seed,
  });
  if (invalid) return unavailable(invalid, draftYear, threeTwoOnePolicyEvidence(policyResult));

  const relegated = new Set(draftRelegatedTeamIds);
  const teams = lotteryTeams.map(team => {
    const draftRelegatedTeam = relegated.has(team.teamId);
    const lotteryBalls = team.entryType === 'non-play-in'
      ? (draftRelegatedTeam ? THREE_TWO_ONE_BALLS.draftRelegatedNonPlayIn : THREE_TWO_ONE_BALLS.otherNonPlayIn)
      : team.entryType === 'play-in-9-10'
        ? THREE_TWO_ONE_BALLS.playInSeedsNineTen
        : THREE_TWO_ONE_BALLS.playInSevenEightLoser;
    return { ...team, draftRelegated: draftRelegatedTeam, lotteryBalls };
  });
  const random = seedRandom(`${seed}:${draftYear}:${FRANCHISE_DRAFT_LOTTERY_VERSION}:${FRANCHISE_DRAFT_LOTTERY_321_POLICY_ID}`);
  const order = [];
  const remaining = [...teams];
  const restrictionByTeamId = new Map(teams.map(team => [
    team.teamId,
    getOwnPickRestrictionState(team.teamId, draftYear, ownPickHistory),
  ]));
  const firstPickEligible = remaining.filter(team => {
    const restriction = restrictionByTeamId.get(team.teamId);
    return !restriction.barredFromNoOne && !restriction.barredFromTopFive;
  });
  const firstPickWeight = firstPickEligible.reduce((sum, team) => sum + team.lotteryBalls, 0);
  if (firstPickWeight <= 0) return unavailable('No lottery team is eligible for No. 1 under the provided own-pick restriction history.', draftYear, threeTwoOnePolicyEvidence(policyResult));

  for (let pick = 1; pick <= THREE_TWO_ONE_TEAM_COUNT; pick += 1) {
    const positionEligible = remaining.filter(team => {
      const restriction = restrictionByTeamId.get(team.teamId);
      if (pick === 1 && restriction.barredFromNoOne) return false;
      if (pick <= 5 && restriction.barredFromTopFive) return false;
      if (pick > THREE_TWO_ONE_DRAFT_RELEGATION_FLOOR && team.draftRelegated) return false;
      return true;
    });
    const remainingRelegated = remaining.filter(team => team.draftRelegated).length;
    const remainingFloorSlots = Math.max(0, THREE_TWO_ONE_DRAFT_RELEGATION_FLOOR - pick + 1);
    const mustDrawRelegatedNow = remainingRelegated > 0 && remainingRelegated >= remainingFloorSlots;
    const eligible = mustDrawRelegatedNow
      ? positionEligible.filter(team => team.draftRelegated)
      : positionEligible;
    const totalBalls = eligible.reduce((sum, team) => sum + team.lotteryBalls, 0);
    if (totalBalls <= 0) {
      return unavailable(`No eligible team can be drawn at pick ${pick} under the explicit floor and own-pick restrictions.`, draftYear,
        threeTwoOnePolicyEvidence(policyResult));
    }
    let target = Math.floor(random() * totalBalls);
    let selectedIndex = eligible.length - 1;
    for (let index = 0; index < eligible.length; index += 1) {
      target -= eligible[index].lotteryBalls;
      if (target < 0) { selectedIndex = index; break; }
    }
    const selected = eligible[selectedIndex];
    const remainingIndex = remaining.findIndex(team => team.teamId === selected.teamId);
    remaining.splice(remainingIndex, 1);
    const restriction = restrictionByTeamId.get(selected.teamId);
    order.push({
      pick,
      teamId: selected.teamId,
      originalPickTeamId: selected.teamId,
      entryType: selected.entryType,
      conference: selected.conference,
      conferenceSeed: selected.conferenceSeed,
      leagueRankWorstToBest: selected.leagueRankWorstToBest,
      lotteryBalls: selected.lotteryBalls,
      draftRelegated: selected.draftRelegated,
      selection: 'seeded-weighted-ball-draw',
      ownPickRestrictionsApplied: {
        consecutiveNoOne: restriction.barredFromNoOne,
        consecutiveTopFive: restriction.barredFromTopFive,
      },
    });
  }

  const firstPickOdds = teams.map(team => {
    const restriction = restrictionByTeamId.get(team.teamId);
    return {
      teamId: team.teamId,
      lotteryBalls: team.lotteryBalls,
      eligibleForNoOne: !restriction.barredFromNoOne && !restriction.barredFromTopFive,
      probabilityPercent: restriction.barredFromNoOne || restriction.barredFromTopFive ? 0 : team.lotteryBalls / firstPickWeight * 100,
      publishedBaseProbabilityPercent: team.lotteryBalls / THREE_TWO_ONE_TOTAL_BALLS * 100,
    };
  });

  return {
    status: 'ready',
    lotteryOrder: order,
    firstPickOdds,
    receipt: {
      modelVersion: FRANCHISE_DRAFT_LOTTERY_VERSION,
      policy: policyResult.policy,
      draftYear,
      seed,
      lotteryTeamCount: THREE_TWO_ONE_TEAM_COUNT,
      picksDrawn: THREE_TWO_ONE_TEAM_COUNT,
      totalLotteryBalls: THREE_TWO_ONE_TOTAL_BALLS,
      drawMethod: WEIGHTED_PERMUTATION_METHOD,
      drawMethodDisclosure: WEIGHTED_PERMUTATION_DISCLOSURE,
      ballCountsSourceUrl: policyResult.sourceUrl,
      ballCountsSourceRef: policyResult.sourceRef,
      standingsAndTieBreaks: 'all 30 final records, conference seeds, and league ranks are caller-supplied and cross-validated; tied records require explicit ordered resolutions and evidence references',
      standingsEvidenceRef: leagueStandingsEvidenceRef,
      draftRelegation: 'caller-supplied three IDs validated against the three worst ranks in the complete 30-team standings; picks 1-12 are permitted, later slots are excluded',
      draftRelegatedTeamIds: [...draftRelegatedTeamIds],
      tieBreakEvidence: standingsTieBreaks.map(row => ({
        teamIds: [...row.teamIds], worstToBest: [...row.worstToBest],
        ...(row.conferenceBestToWorstByConference ? {
          conferenceBestToWorstByConference: Object.fromEntries(Object.entries(row.conferenceBestToWorstByConference)
            .map(([conference, teamIds]) => [conference, [...teamIds]])),
        } : {}),
        evidenceRef: row.evidenceRef,
      })),
      ownPickHistoryEvidence: ownPickHistory.map(row => ({ teamId: row.teamId, draftYear: row.draftYear, ownPickNumber: row.pickNumber, evidenceRef: row.evidenceRef })),
      ownPickRestrictions: 'applied to original-pick team using the two preceding draft results, independent of current pick holder',
      playInMembership: 'ten seeds 11-15, four seeds 9-10, and one explicit 7-vs-8 game loser per conference, following the NBA announcement categories',
      playInResultEvidence: lotteryTeams
        .filter(team => team.entryType === 'play-in-7-8-loser')
        .map(team => ({ teamId: team.teamId, result: team.playInResult, evidenceRef: team.playInEvidenceRef })),
      pickRights: 'not-modeled; lotteryOrder team IDs identify original-team pick slots, not current rights holders',
      leagueDiscipline: { status: leagueDiscipline.status, evidenceRef: leagueDiscipline.evidenceRef },
    },
  };
}

/**
 * Returns guidance only. It never chooses or applies fallback weights/order.
 * The consuming Franchise workflow must obtain explicit user approval and
 * label any fallback result as a custom scenario, not NBA-accurate policy.
 */
export function getFranchiseDraftLotteryScenarioFallbackSuggestion(draftYear) {
  return {
    status: 'suggestion-only',
    draftYear: Number.isSafeInteger(draftYear) ? draftYear : null,
    mode: 'explicit-user-declared-seeded-draft-order-scenario',
    requiresExplicitOptIn: true,
    applied: false,
    nbaAccurate: false,
    description: 'Let the user supply a custom draft order or probability weights and a fixed seed; label the result as a user-declared scenario. Do not silently reuse legacy NBA odds.',
  };
}

function validateLotteryTeams(teams) {
  if (!Array.isArray(teams) || teams.length !== 14) return 'Exactly 14 lottery teams are required for the 2019-2026 policy.';
  const ids = new Set();
  let previousRecord = null;
  let totalCombinations = 0;
  for (const [index, team] of teams.entries()) {
    if (!team || typeof team !== 'object' || Array.isArray(team)) return `Lottery team ${index + 1} is malformed.`;
    const teamId = typeof team.teamId === 'string' ? team.teamId.trim() : '';
    if (!TEAM_ID.test(teamId) || ids.has(teamId)) return `Lottery team ${index + 1} needs a unique stable team reference.`;
    ids.add(teamId);
    if (!Number.isSafeInteger(team.wins) || !Number.isSafeInteger(team.losses) || team.wins < 0 || team.losses < 0) {
      return `Lottery team ${teamId} needs nonnegative integer wins and losses.`;
    }
    const games = team.wins + team.losses;
    if (games <= 0) return `Lottery team ${teamId} needs a non-empty regular-season record.`;
    if (previousRecord && team.wins * previousRecord.games < previousRecord.wins * games) {
      return 'Lottery teams must be ordered worst-to-best by regular-season winning percentage; provide tie order explicitly.';
    }
    previousRecord = { wins: team.wins, games };
    if (!Number.isSafeInteger(team.firstPickCombinations) || team.firstPickCombinations < 1 || team.firstPickCombinations > 140) {
      return `Lottery team ${teamId} needs an integer first-pick combination count from 1 through 140.`;
    }
    totalCombinations += team.firstPickCombinations;
  }
  if (totalCombinations !== TOTAL_ASSIGNED_COMBINATIONS) {
    return `Caller-supplied first-pick combination counts must sum to ${TOTAL_ASSIGNED_COMBINATIONS}.`;
  }
  return null;
}

/**
 * Simulates team pick slots for the traditional 2019-2026 NBA Draft Lottery.
 * `lotteryTeamsWorstToBest` must be the 14 eligible lottery teams ordered by
 * their source/scenario standings, with tie order already resolved. Each row
 * must supply its exact integer first-pick combination count. The caller is
 * responsible for applying any actual pick forfeiture / penalty / conveyed
 * pick rights outside this helper; returned IDs identify standings teams,
 * not necessarily the teams that ultimately hold a pick.
 */
export function simulateTraditionalFranchiseDraftLottery({ draftYear, lotteryTeamsWorstToBest, seed } = {}) {
  const policyResult = getFranchiseDraftLotteryPolicy(draftYear);
  if (policyResult.status !== 'available') return policyResult;
  if (policyResult.policy !== FRANCHISE_DRAFT_LOTTERY_POLICY_ID) {
    return unavailable('Use the draft-year policy-specific simulator; the traditional 14-team lottery only applies to 2019-2026.',
      draftYear, { id: policyResult.policy, sourceUrl: policyResult.sourceUrl, sourceRef: policyResult.sourceRef });
  }
  if (typeof seed !== 'string' || !REPLAY_SEED.test(seed)) {
    return unavailable('A fixed alphanumeric replay seed is required.', draftYear, { id: policyResult.policy, sourceUrl: policyResult.sourceUrl, sourceRef: policyResult.sourceRef });
  }
  const invalid = validateLotteryTeams(lotteryTeamsWorstToBest);
  if (invalid) return unavailable(invalid, draftYear, { id: policyResult.policy, sourceUrl: policyResult.sourceUrl, sourceRef: policyResult.sourceRef });

  const random = seedRandom(`${seed}:${draftYear}:${CLASSIC_REPLAY_VERSION}`);
  const remaining = lotteryTeamsWorstToBest.map(team => ({ ...team }));
  const drawn = [];
  for (let pick = 1; pick <= 4; pick += 1) {
    const total = remaining.reduce((sum, team) => sum + team.firstPickCombinations, 0);
    let target = Math.floor(random() * total);
    let selectedIndex = remaining.length - 1;
    for (let index = 0; index < remaining.length; index += 1) {
      target -= remaining[index].firstPickCombinations;
      if (target < 0) { selectedIndex = index; break; }
    }
    const [team] = remaining.splice(selectedIndex, 1);
    drawn.push({ pick, teamId: team.teamId,
      conditionalCombinationWeight: team.firstPickCombinations,
      conditionalCombinationTotal: total });
  }
  const lotteryOrder = [
    ...drawn.map(row => ({ pick: row.pick, teamId: row.teamId, selection: 'seeded-weighted-draw' })),
    ...remaining.map((team, index) => ({ pick: index + 5, teamId: team.teamId, selection: 'inverse-standings-order' })),
  ];
  return {
    status: 'ready',
    lotteryOrder,
    firstPickOdds: lotteryTeamsWorstToBest.map(team => ({ teamId: team.teamId,
      combinations: team.firstPickCombinations,
      probabilityPercent: team.firstPickCombinations / 10 })),
    receipt: {
      modelVersion: FRANCHISE_DRAFT_LOTTERY_VERSION,
      policy: policyResult.policy,
      draftYear,
      seed,
      lotteryTeamCount: lotteryTeamsWorstToBest.length,
      picksDrawn: 4,
      totalAssignedCombinations: TOTAL_ASSIGNED_COMBINATIONS,
      drawMethod: 'seeded-weighted-team-selection-equivalent-to-combination-rejection',
      drawModelVersion: CLASSIC_REPLAY_VERSION,
      standingsAndOddsEvidence: 'caller-declared-input',
      teamOrderBasis: 'caller-supplied-worst-to-best-record-and-tiebreak-order',
      pickRights: 'not-modeled; team IDs identify standings/odds subjects only',
      eligibility: 'caller-supplied-14-team-lottery-set; forfeitures-and-penalties-not-modeled',
      sourceUrl: policyResult.sourceUrl,
      sourceRef: policyResult.sourceRef,
    },
  };
}
