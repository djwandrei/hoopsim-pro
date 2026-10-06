import { GAME_LAB_MATCHUP_POLICY, GAME_LAB_POLICY, createGameSampler, createScenarioRandom, teamGameEvidence } from './possession-simulator.js?v=20261001c&rev=possession-workbench-v10-score-mean-se-v1';
import { playoffSeedOrder } from './season-simulator.js?v=20261001c&rev=season-simulator-v5-fixed16-playoff-rates-v1';
import { NBA_TEAM_CODES, NBA_TEAM_DIVISIONS, NBA_TEAM_CONFERENCES } from './nba-schedule-source.js?v=20260920c&rev=structure-v1';
import { generateNbaCupScheduleCompletion, resolveNbaCupScheduleCompletion } from './nba-cup-schedule-completion.js?v=20260926m&rev=nba-cup-audit-trace-v1';
import { binaryCalibrationSummary, continuousCalibrationSummary, monteCarloStandardError, rollingOriginSplits, CALIBRATION_MODEL_VERSION } from './model-calibration.js?v=20260928i&rev=swishiq-model-calibration-v3-phase9-20260928i';

export const SEASON_LAB_CONTRACT_VERSION = 'djhc-season-lab-v1';
// The public contract remains v1 for callers and saved setups.  The scoring
// engine is versioned independently so a replay can tell which equations
// produced its result.
export const SEASON_LAB_MODEL_VERSION = 'swishiq-season-lab-model-v26';
export const SEASON_LAB_PROGRESSION_VERSION = 'swishiq-season-lab-independent-year-progression-v1';
export const SEASON_LAB_MODEL_DESIGN = Object.freeze({
  version: SEASON_LAB_MODEL_VERSION,
  nativeMatchup: 'league-anchored-regularized-offense-defense-four-factors-v6',
  matchupWeights: 'explicit-own-offense-opponent-defense-scenario-v1',
  outcomeLayer: 'bounded-multinomial-possession-v3-four-factors-event-reconciled',
  nativeScoringEventRule: 'bounded-four-factor-shaped-possession-events-v1',
  gameLabOutcomeLayer: GAME_LAB_MATCHUP_POLICY.scoringEventRule,
  outcomeFallbackPolicy: 'native-four-factor-or-game-lab-maximum-entropy-exclusive-no-cross-fallback-v1',
  nativePriorPossessions: 2000,
  paceBlend: 'harmonic-mean-of-selected-team-season-pace',
  paceInteraction: 'harmonic-mean-plus-four-factor-event-mix-v1',
  fourFactors: 'oliver-weighted-coverage-shrunk-baseline-imputed-matchup-v2',
  overtimePossessions: 'pace-scaled-five-minute-period-v1',
  matchupRateScale: 2,
  parameterUncertainty: 'component-exposure-weighted-team-season-latent-draw-v1',
  winProbability: 'exact-bounded-possession-score-distribution-with-capped-overtime-and-half-tie-credit-v1',
  rankingTiebreak: 'table-points-head-to-head-differential-seeded-lottery',
  scheduleStrength: 'opponent-record-excluding-scheduled-team',
  scheduleValidation: 'observed-calendar-or-accepted-future-matrix-v3',
  phaseAccounting: 'standings-eligible-regular-or-explicit-game-v1',
  evidenceIntegrity: 'native-offense-defense-net-coherence-v1',
  actualRecordIntegrity: 'wins-losses-ties-sum-to-games-v1',
  forecastScope: 'accepted-projection-and-rolling-backtest-v3-coverage-aware',
  playerTotals: 'historical-production-constrained-to-simulated-team-totals-v2',
  standingsAudit: 'expected-win-and-native-net-divergence-v3-exact-probability-coverage-aware',
  scheduleOrdering: 'dated-chronological-round-id-v1',
  playoffSeeding: 'conference-local-standings-order-with-global-residual-tiebreak-v1',
  playoffRateSelection: 'exact-season-retrospective-playoff-profiles-otherwise-regular-rate-scenario-v1',
  playoffVenueSchedule: 'higher-regular-season-seed-2-2-1-1-1-home-court-v1',
  repeatSummaries: 'quantiles-rates-wilson-intervals-rank-probabilities-with-win-probability-coverage-v1',
  calibration: CALIBRATION_MODEL_VERSION,
  scheduleContext: 'observed-calendar-rest-and-streak-audit-v1',
  persistentState: 'league-season-ledger-v1',
  yearProgression: SEASON_LAB_PROGRESSION_VERSION,
  nbaCupScheduleCompletion: 'published-calendar-with-seeded-30-game-completion-v2',
  leagueStructure: 'nba-conference-division-mapping-v1',
  playoffStructure: 'conference-bracket-with-finals-v1',
});

export const SEASON_LAB_LEAGUE_STATE_VERSION = 'djhc-season-lab-league-state-v1';
export const SEASON_LAB_LEAGUE_STATE_LIMITS = Object.freeze({ maxSeasons: 20, maxBytes: 8_000_000 });

// This is a transparent empirical prior, not a claim that two thousand
// possessions were observed for every team.  It prevents a short native
// segment from moving a matchup all the way to an extreme rate while leaving
// the raw package values visible in the evidence readout.
export const NATIVE_PRIOR_POSSESSIONS = 2000;
const NATIVE_GAME_NOISE_SD = 11;
const NATIVE_PARAMETER_SD_AT_PRIOR = 2.5;
// The matchup weights describe how much evidence comes from own offense and
// opponent defense.  They are a blend selector, not a request to halve both
// independent rate deltas.  Keeping the total rate scale at two preserves the
// points-per-100 interpretation and prevents strong teams from collapsing
// toward .500 when both sides of the matchup are observed.
const NATIVE_MATCHUP_RATE_SCALE = 2;
const NATIVE_FOUR_FACTOR_POINTS_SCALE = 1.25;
const NATIVE_PACE_FLOOR = 70;
const NATIVE_PACE_CEILING = 110;
const NATIVE_EXPECTED_PPP_FLOOR = 0.45;
const NATIVE_EXPECTED_PPP_CEILING = 1.65;
const NATIVE_SCORING_EVENT_RULE = 'bounded-four-factor-shaped-possession-events-v1';
// Public package metrics are rates, not arbitrary score inputs. Keep an
// explicit safety envelope so malformed evidence cannot create an unbounded
// score generator or poison league baselines.
const NATIVE_RATE_CEILING = 300;
const NATIVE_NET_FLOOR = -300;
const NATIVE_NET_CEILING = 300;
const SUPPORTED_PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const PLAYOFF_HOME_COURT_GAMES = new Set([1, 2, 5, 7]);
const PLAYOFF_VENUE_POLICY = 'higher-regular-season-seed-2-2-1-1-1-home-court-v1';
const PLAYOFF_RATE_SELECTION_POLICY = 'exact-season-retrospective-playoff-profiles-otherwise-regular-rate-scenario-v1';

export const SEASON_LAB_POLICY = Object.freeze({
  maxTeams: 30,
  minTeams: 2,
  maxGamesPerTeam: 200,
  maxRepeats: 500,
  maxCupRepeats: 50,
  maxWorkUnits: 500000,
  supportedHorizonKinds: Object.freeze(['game', 'short', 'full', 'multi-season']),
  supportedScheduleKinds: Object.freeze(['actual', 'round-robin', 'custom', 'generated-future', 'nba-cup-completion']),
  supportedRosterModes: Object.freeze(['actual', 'user-built', 'managed', 'custom']),
  supportedControlModes: Object.freeze(['user-managed', 'deterministic-bot', 'mixed']),
});

const TEAM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const SEED = /^[A-Za-z0-9:._-]{1,80}$/;
const SOURCE_KINDS = new Set(['exact-season', 'pooled-window', 'forecast-season', 'year-advance-scenario']);
const HORIZONS = new Set(SEASON_LAB_POLICY.supportedHorizonKinds);
const SCHEDULES = new Set(SEASON_LAB_POLICY.supportedScheduleKinds);
const ROSTERS = new Set(SEASON_LAB_POLICY.supportedRosterModes);
const CONTROLS = new Set(SEASON_LAB_POLICY.supportedControlModes);
const MODEL_KEYS = ['injuries', 'contracts', 'development', 'transactions'];
const DEFAULT_MATCHUP_WEIGHTS = Object.freeze({ ownOffense: 0.5, opponentDefense: 0.5 });
const MANAGED_SCORING_MIXES = new Set([0.35, 0.5, 0.65]);
const SHA256 = /^[a-f0-9]{64}$/;
const FORECAST_HOLDOUT_POLICY = 'strict-before-holdout-v1';
const FORECAST_ISSUANCE_POLICY = 'forecast-issued-before-holdout-season-v1';

const fail = message => { throw new Error(message); };
const finite = (value, min = -Infinity, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const nonNegativeNumber = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && finite(Number(value), 0);
const ordered = ids => [...ids].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
const rounded = value => Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : fail('Season Lab state cannot contain non-finite numbers.');
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return fail('Season Lab state contains an unsupported value.');
}

async function sha256StableJson(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') {
    fail('The NBA Cup schedule artifact cannot be verified because Web Crypto is unavailable.');
  }
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function decisionPolicyIdFor(decisionLog = []) {
  if (!Array.isArray(decisionLog)) fail('Season Lab decision history must be an array.');
  if (!decisionLog.length) return null;
  let previousEffectiveGameIndex = 0;
  const segments = decisionLog.map((decision, index) => {
    const checkpointGameIndex = Number(decision?.checkpointGameIndex);
    const effectiveGameIndex = Number(decision?.effectiveGameIndex);
    const ownOffense = Number(decision?.ownOffense);
    const opponentDefense = Number(decision?.opponentDefense);
    if (decision?.decisionType !== 'native-matchup-scoring-blend'
      || !integer(checkpointGameIndex, 1) || effectiveGameIndex !== checkpointGameIndex + 1
      || effectiveGameIndex <= previousEffectiveGameIndex
      || !MANAGED_SCORING_MIXES.has(ownOffense)
      || opponentDefense !== 1 - ownOffense
      || !integer(Number(decision?.seasonStartYear), 1900, 2200)
      || Number(decision?.repeat) !== 1
      || !Number.isFinite(Date.parse(String(decision?.timestamp || '')))) {
      fail(`Season Lab managed scoring decision ${index + 1} is invalid.`);
    }
    previousEffectiveGameIndex = effectiveGameIndex;
    return `${effectiveGameIndex}-${Math.round(ownOffense * 100)}`;
  });
  return `managed-scoring-${segments.join('_')}`;
}

function replayKeyForSeason(seed, season, repeat, decisionLog = []) {
  const base = `${seed}|${season}|${repeat}`;
  const policyId = decisionPolicyIdFor(decisionLog);
  return policyId ? `${base}|${policyId}` : base;
}

function cloneStateValue(value) {
  // JSON is intentional here: the public state contract is JSON-serializable
  // and this keeps browser replay behavior identical to saved-state replay.
  return JSON.parse(JSON.stringify(value));
}

function normalizedPhase(value) {
  return String(value || 'regular').trim().toLowerCase();
}

// A reviewed dated calendar is an ordered event stream, not merely a bag of
// matchups. Canonicalize it before seeded outcomes consume the random stream.
// Undated rows sort after dated rows; when dates are unavailable, the declared
// round and stable game ID remain the only defensible ordering signals.
function canonicalScheduleOrder(games) {
  return games
    .map((game, inputOrder) => ({ ...game, __inputOrder: inputOrder }))
    .sort((left, right) => {
      const leftTime = left.scheduledAt && Number.isFinite(Date.parse(left.scheduledAt)) ? Date.parse(left.scheduledAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.scheduledAt && Number.isFinite(Date.parse(right.scheduledAt)) ? Date.parse(right.scheduledAt) : Number.POSITIVE_INFINITY;
      const byDate = leftTime === rightTime ? 0 : leftTime === Number.POSITIVE_INFINITY ? 1 : rightTime === Number.POSITIVE_INFINITY ? -1 : leftTime - rightTime;
      return byDate || Number(left.round) - Number(right.round)
        || String(left.id).localeCompare(String(right.id), 'en', { numeric: true })
        || left.__inputOrder - right.__inputOrder;
    })
    .map(({ __inputOrder, ...game }) => game);
}

function nbaCupCalendarDate(game) {
  const localDate = String(game?.dateEt || game?.scheduledAtEt || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(localDate) && Number.isFinite(Date.parse(`${localDate}T00:00:00Z`))) return localDate;
  const windowDate = String(game?.scheduleWindow || '').match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (windowDate && Number.isFinite(Date.parse(`${windowDate}T00:00:00Z`))) return windowDate;
  if (game?.scheduledAt && Number.isFinite(Date.parse(game.scheduledAt))) return new Date(game.scheduledAt).toISOString().slice(0, 10);
  return null;
}

function compareNbaCupCalendarGames(left, right) {
  const leftDate = nbaCupCalendarDate(left), rightDate = nbaCupCalendarDate(right);
  const byDate = String(leftDate || '9999-12-31').localeCompare(String(rightDate || '9999-12-31'));
  if (byDate) return byDate;
  const leftGenerated = left.scenarioGenerated === true || left.evidenceStatus === 'scenario-generated';
  const rightGenerated = right.scenarioGenerated === true || right.evidenceStatus === 'scenario-generated';
  // A generated round has an allowed date window but no published tip time.
  // Assign its first allowed local date, before exact-time games on that date,
  // while keeping official games in their published timestamp order.
  if (leftGenerated !== rightGenerated) return leftGenerated ? -1 : 1;
  const leftTime = left.scheduledAt && Number.isFinite(Date.parse(left.scheduledAt)) ? Date.parse(left.scheduledAt) : Number.POSITIVE_INFINITY;
  const rightTime = right.scheduledAt && Number.isFinite(Date.parse(right.scheduledAt)) ? Date.parse(right.scheduledAt) : Number.POSITIVE_INFINITY;
  return (leftTime - rightTime) || String(left.id).localeCompare(String(right.id), 'en', { numeric: true });
}

function canonicalCupPublishedValue(key, value) {
  if (key === 'scheduledAt' && value != null && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return value;
}

function cupScheduleRowsMatchArtifact(scheduleRows, artifactRows, publicTeamByInternal) {
  if (!Array.isArray(scheduleRows) || !Array.isArray(artifactRows) || scheduleRows.length !== artifactRows.length) return false;
  const scheduleById = new Map(scheduleRows.map(game => [String(game.id), game]));
  if (scheduleById.size !== scheduleRows.length) return false;
  for (const published of artifactRows) {
    const declared = scheduleById.get(String(published?.id));
    if (!declared || !published || typeof published !== 'object') return false;
    const publishedKeys = Object.keys(published).sort();
    const declaredKeys = Object.keys(declared).sort();
    const extraKeys = declaredKeys.filter(key => !publishedKeys.includes(key) && key !== 'round');
    if (extraKeys.length || publishedKeys.some(key => !declaredKeys.includes(key))) return false;
    for (const key of publishedKeys) {
      let declaredValue = declared[key];
      if (key === 'home' || key === 'away') declaredValue = publicTeamByInternal.get(declaredValue) || declaredValue;
      if (stableJson(canonicalCupPublishedValue(key, declaredValue))
        !== stableJson(canonicalCupPublishedValue(key, published[key]))) return false;
    }
  }
  return true;
}

async function cupScheduleReceiptMatchesArtifact(artifact, receipt, scheduleReceipt) {
  const expectedId = 'djhc-nba-cup-2026-27-published-schedule-v1';
  if (!artifact || !receipt || !scheduleReceipt
    || receipt.id !== expectedId || scheduleReceipt.id !== expectedId
    || String(receipt.version || '') !== String(artifact.revision || '')
    || !SHA256.test(String(receipt.contentSha256 || ''))
    || stableJson(receipt) !== stableJson(scheduleReceipt)) return false;
  return await sha256StableJson(artifact) === receipt.contentSha256;
}

// The schedule may contain competition phases beyond the regular season so
// the simulator can replay a complete calendar.  Those games still belong in
// the game ledger, calendar diagnostics, and phase counts, but they must not
// silently change regular-season standings or regular-season player totals.
// A caller may explicitly mark an in-season tournament/custom game as
// standings-eligible (for example, a group-stage game that counts toward the
// league table).  Play-in and playoff games remain excluded by default.
function standingsEligible(game) {
  if (typeof game?.standingsEligible === 'boolean') return game.standingsEligible;
  if (typeof game?.countsTowardStandings === 'boolean') return game.countsTowardStandings;
  return normalizedPhase(game?.phase) === 'regular';
}

function normalizeStandingsEligibility(game, phase) {
  if (game?.standingsEligible != null && game?.countsTowardStandings != null
    && game.standingsEligible !== game.countsTowardStandings) {
    fail('Schedule standings eligibility fields disagree; provide only one value.');
  }
  const value = game?.standingsEligible ?? game?.countsTowardStandings;
  if (value != null && typeof value !== 'boolean') {
    fail('Schedule standings eligibility must be boolean when supplied.');
  }
  return value == null ? null : value;
}

function normalizeMatchupWeights(value) {
  if (value == null) return { ...DEFAULT_MATCHUP_WEIGHTS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Season Lab matchup weights must be an object when supplied.');
  }
  const hasOwnOffense = value.ownOffense != null || value.offenseWeight != null;
  const hasOpponentDefense = value.opponentDefense != null;
  const opponentDefense = hasOpponentDefense ? Number(value.opponentDefense) : null;
  if (hasOpponentDefense && !finite(opponentDefense, 0, 1)) {
    fail('Season Lab opponent-defense matchup weight must be between 0 and 1.');
  }
  const ownOffense = hasOwnOffense
    ? Number(value.ownOffense ?? value.offenseWeight)
    : hasOpponentDefense
      ? 1 - opponentDefense
      : DEFAULT_MATCHUP_WEIGHTS.ownOffense;
  if (!finite(ownOffense, 0, 1)) fail('Season Lab own-offense matchup weight must be between 0 and 1.');
  if (hasOwnOffense && hasOpponentDefense && Math.abs((ownOffense + opponentDefense) - 1) > 0.000001) {
    fail('Season Lab own-offense and opponent-defense matchup weights must sum to 1.');
  }
  return { ownOffense: rounded(ownOffense), opponentDefense: rounded(1 - ownOffense) };
}

function normalizeRosterDeclaration(roster, teamId) {
  if (roster == null) return null;
  if (!roster || typeof roster !== 'object' || Array.isArray(roster) || !Array.isArray(roster.players) || roster.players.length > 100) {
    fail(`Season Lab roster for ${teamId} must be an object with at most 100 declared players.`);
  }
  const ids = new Set();
  const players = roster.players.map((player, index) => {
    const id = String(player?.id || '').trim();
    if (!id || id.length > 120 || ids.has(id)) fail(`Season Lab roster for ${teamId} has an invalid or duplicate player at position ${index + 1}.`);
    ids.add(id);
    if (player?.name != null && (typeof player.name !== 'string' || !player.name.trim() || player.name.length > 160)) {
      fail(`Season Lab roster player ${id} has an invalid name.`);
    }
    if (player?.minutes != null && !nonNegativeNumber(player.minutes)) {
      fail(`Season Lab roster player ${id} has invalid non-negative minutes.`);
    }
    const normalized = { ...player, id, name: player?.name == null ? id : player.name.trim() };
    if (player?.minutes != null) normalized.minutes = Number(player.minutes);
    else delete normalized.minutes;
    return normalized;
  });
  return { ...roster, players };
}

function normalizeSeasonYears(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20
    || value.some(year => !integer(Number(year), 1900, 2200))) fail('Season Lab needs one through twenty valid season start years.');
  const years = value.map(Number);
  if (new Set(years).size !== years.length || years.some((year, index) => index > 0 && year <= years[index - 1])) {
    fail('Season Lab season years must be unique and ordered.');
  }
  return years;
}

const STRUCTURE_LABEL = /^[a-z][a-z0-9_-]{0,31}$/;
const NBA_DIVISION_LABELS = new Set(Object.values(NBA_TEAM_DIVISIONS));
const NBA_CONFERENCE_LABELS = new Set(['east', 'west']);

function normalizeStructureLabel(value, label) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!STRUCTURE_LABEL.test(normalized)) fail(`Season Lab ${label} must be a bounded lowercase label when supplied.`);
  return normalized;
}

function conferenceForDivision(division) {
  if (!division || !NBA_DIVISION_LABELS.has(division)) return null;
  const team = Object.keys(NBA_TEAM_DIVISIONS).find(code => NBA_TEAM_DIVISIONS[code] === division);
  return team ? NBA_TEAM_CONFERENCES[team] || null : null;
}

function normalizeTeam(team, index) {
  if (!team || typeof team !== 'object' || !TEAM_ID.test(String(team.id || '')) || typeof team.name !== 'string' || !team.name.trim()) {
    fail(`Season Lab team ${index + 1} is invalid.`);
  }
  const id = String(team.id);
  const canonicalCode = id.toUpperCase();
  const canonicalDivision = NBA_TEAM_DIVISIONS[canonicalCode] || null;
  const canonicalConference = NBA_TEAM_CONFERENCES[canonicalCode] || null;
  const declaredDivision = normalizeStructureLabel(team.division, 'division');
  const declaredConference = normalizeStructureLabel(team.conference, 'conference');
  if (declaredConference && !NBA_CONFERENCE_LABELS.has(declaredConference)) {
    fail(`Season Lab team ${id} has an unsupported conference; use east or west.`);
  }
  if (canonicalDivision && declaredDivision && canonicalDivision !== declaredDivision) {
    fail(`Season Lab team ${id} has a division that conflicts with the canonical NBA mapping.`);
  }
  if (canonicalConference && declaredConference && canonicalConference !== declaredConference) {
    fail(`Season Lab team ${id} has a conference that conflicts with the canonical NBA mapping.`);
  }
  const division = declaredDivision || canonicalDivision;
  const conference = declaredConference || canonicalConference || conferenceForDivision(division);
  if (division && conferenceForDivision(division) && conferenceForDivision(division) !== conference) {
    fail(`Season Lab team ${id} has a conference that conflicts with its division.`);
  }
  const rosterMode = team.rosterMode || 'actual';
  if (!ROSTERS.has(rosterMode)) fail(`Season Lab team ${team.id} has an unsupported roster mode.`);
  return { id, name: team.name.trim().slice(0, 120), rosterMode, conference, division,
    control: team.control || null, rosterId: team.rosterId || null,
    roster: normalizeRosterDeclaration(team.roster, team.id), customProfile: team.customProfile || null };
}

function leagueStructureForTeams(teams) {
  const conferenceCounts = { east: 0, west: 0, unknown: 0 };
  const divisionCounts = {};
  for (const team of teams) {
    if (NBA_CONFERENCE_LABELS.has(team.conference)) conferenceCounts[team.conference] += 1;
    else conferenceCounts.unknown += 1;
    if (team.division) divisionCounts[team.division] = (divisionCounts[team.division] || 0) + 1;
  }
  const normalizedCodes = teams.map(team => team.id.toUpperCase());
  const completeNba = teams.length === NBA_TEAM_CODES.length
    && new Set(normalizedCodes).size === NBA_TEAM_CODES.length
    && NBA_TEAM_CODES.every(code => normalizedCodes.includes(code))
    && teams.every(team => NBA_CONFERENCE_LABELS.has(team.conference) && NBA_DIVISION_LABELS.has(team.division));
  // Only canonical NBA team codes may opt into the conference bracket.  A
  // custom team is allowed to carry descriptive conference/division labels,
  // but those labels are not enough to assert NBA playoff semantics; custom
  // leagues therefore retain the generic bracket unless an accepted structure
  // adapter supplies a separate mapping.
  const mapped = teams.length > 0 && teams.every(team => {
    const code = team.id.toUpperCase();
    return NBA_TEAM_CODES.includes(code)
      && NBA_CONFERENCE_LABELS.has(team.conference)
      && NBA_DIVISION_LABELS.has(team.division)
      && NBA_TEAM_CONFERENCES[code] === team.conference
      && NBA_TEAM_DIVISIONS[code] === team.division;
  });
  return {
    status: completeNba ? 'complete' : mapped ? 'mapped' : 'partial',
    completeNba,
    mapped,
    conferenceCounts,
    divisionCounts,
    note: completeNba
      ? 'All thirty canonical NBA teams are mapped to their current conference and division.'
      : mapped
        ? 'Every selected team declares a conference and division; the selection is not the complete thirty-team NBA structure.'
        : 'Custom or non-NBA team identifiers may omit conference and division metadata; generic playoff seeding remains available.'
  };
}

function conferenceBracketPlan(teams, playoffTeams) {
  if (!playoffTeams || !Number.isInteger(playoffTeams) || playoffTeams < 4 || playoffTeams % 2 !== 0) return null;
  const structure = leagueStructureForTeams(teams);
  if (!structure.mapped) return null;
  const perConference = playoffTeams / 2;
  if (![2, 4, 8].includes(perConference)
    || structure.conferenceCounts.east < perConference
    || structure.conferenceCounts.west < perConference) return null;
  return { mode: 'conference-aware', perConference, conferences: ['east', 'west'] };
}

function normalizeForecastManifest(value, seasons) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !String(value.manifestId || '').trim() || !String(value.manifestVersion || '').trim()
    || !SHA256.test(String(value.contentSha256 || ''))
    || !SHA256.test(String(value.profileSha256 || ''))
    || !SHA256.test(String(value.scheduleSha256 || ''))
    || !SHA256.test(String(value.backtestLedgerSha256 || ''))
    || !SHA256.test(String(value.modelArtifactSha256 || ''))
    || typeof value.asOfUtc !== 'string' || !Number.isFinite(Date.parse(value.asOfUtc))) {
    fail('Upcoming-season runs require an immutable accepted forecast manifest with model, profile, schedule, and backtest-ledger hashes.');
  }
  const seasonStartYear = Number(value.seasonStartYear);
  if (seasons.length !== 1 || seasonStartYear !== seasons[0]) {
    fail('Each accepted forecast manifest currently covers exactly one requested upcoming season.');
  }
  const scheduleKind = String(value.scheduleKind || '').trim();
  if (!['actual', 'generated-future'].includes(scheduleKind)) {
    fail('The accepted forecast manifest must declare an actual or deterministic future schedule kind.');
  }
  return {
    manifestId: String(value.manifestId).trim(),
    manifestVersion: String(value.manifestVersion).trim(),
    contentSha256: String(value.contentSha256),
    seasonStartYear,
    asOfUtc: new Date(value.asOfUtc).toISOString(),
    profileSha256: String(value.profileSha256),
    scheduleSha256: String(value.scheduleSha256),
    backtestLedgerSha256: String(value.backtestLedgerSha256),
    modelArtifactSha256: String(value.modelArtifactSha256),
    scheduleKind,
  };
}

function forecastFinite(value, label, minimum = 0, maximum = Number.MAX_VALUE) {
  const number = Number(value);
  if (!finite(number, minimum, maximum)) fail(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  return number;
}

function normalizeForecastMetricSummary(value, label, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const sample = Number(value.sample);
  if (!integer(sample, 1)) fail(`${label} sample must be a positive whole number.`);
  if (kind === 'binary') {
    return {
      sample,
      brier: forecastFinite(value.brier, `${label} Brier score`, 0, 1),
      logLoss: forecastFinite(value.logLoss, `${label} log loss`),
      baselineBrier: forecastFinite(value.baselineBrier, `${label} baseline Brier score`, 0, 1),
      baselineLogLoss: forecastFinite(value.baselineLogLoss, `${label} baseline log loss`),
      calibrationError: forecastFinite(value.calibrationError, `${label} calibration error`, 0, 1),
    };
  }
  const interval = value.interval;
  const nominalCoverage = Number(interval?.nominalCoverage);
  const empiricalCoverage = Number(interval?.empiricalCoverage);
  if (!interval || typeof interval !== 'object' || Array.isArray(interval) || Number(interval.sample) !== sample
    || !finite(nominalCoverage, 0, 1) || nominalCoverage <= 0 || nominalCoverage >= 1
    || !finite(empiricalCoverage, 0, 1)) {
    fail(`${label} must include a bounded interval receipt with the same sample.`);
  }
  const mae = forecastFinite(value.mae, `${label} MAE`);
  const rmse = forecastFinite(value.rmse, `${label} RMSE`);
  const baselineMae = forecastFinite(value.baselineMae, `${label} baseline MAE`);
  const baselineRmse = forecastFinite(value.baselineRmse, `${label} baseline RMSE`);
  if (rmse + Number.EPSILON < mae || baselineRmse + Number.EPSILON < baselineMae) {
    fail(`${label} cannot report RMSE below MAE.`);
  }
  return { sample, mae, rmse, baselineMae, baselineRmse, interval: {
    sample,
    nominalCoverage,
    empiricalCoverage,
  } };
}

// Keep the forecast evidence lane honest after its receipt crosses into the
// simulator. Point-error improvement alone cannot establish that an interval
// is calibrated; compare aggregate coverage with its nominal target in units
// of the target binomial sampling error and preserve the diagnostic in the
// normalized result.
function forecastIntervalCalibration(metric) {
  const nominalCoverage = metric.interval.nominalCoverage;
  const empiricalCoverage = metric.interval.empiricalCoverage;
  const sample = metric.interval.sample;
  const standardError = Math.sqrt(Math.max(Number.EPSILON, nominalCoverage * (1 - nominalCoverage)) / sample);
  const coverageGap = empiricalCoverage - nominalCoverage;
  const zScore = coverageGap / standardError;
  return {
    nominalCoverage,
    empiricalCoverage,
    coverageGap: rounded(coverageGap),
    standardError: rounded(standardError),
    zScore: rounded(zScore),
    status: zScore < -2 ? 'under-covered' : zScore > 2 ? 'over-covered' : 'within-sampling-error',
  };
}

function normalizeForecastValidation(value, manifest) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.status !== 'validated'
    || String(value.ledgerSha256 || '') !== manifest.backtestLedgerSha256
    || value.holdoutPolicy !== FORECAST_HOLDOUT_POLICY
    || value.issuancePolicy !== FORECAST_ISSUANCE_POLICY) {
    fail('Upcoming-season runs require a validated, manifest-pinned rolling forecast backtest receipt.');
  }
  const completedThroughSeasonStartYear = Number(value.completedThroughSeasonStartYear);
  if (!integer(completedThroughSeasonStartYear, 1947, manifest.seasonStartYear - 1)) {
    fail('Forecast backtest receipt has an invalid completed-through season.');
  }
  if (!Array.isArray(value.backtests) || value.backtests.length < 2 || Number(value.holdoutCount) !== value.backtests.length) {
    fail('Forecast backtest receipt requires at least two declared rolling holdouts.');
  }
  const years = new Set();
  let previousHoldoutSeasonStartYear = null;
  const backtests = value.backtests.map((backtest, index) => {
    if (!backtest || typeof backtest !== 'object' || Array.isArray(backtest)) fail(`Forecast backtest ${index + 1} is invalid.`);
    const holdoutSeasonStartYear = Number(backtest.holdoutSeasonStartYear);
    const trainedThroughSeasonStartYear = Number(backtest.trainedThroughSeasonStartYear);
    if (!integer(holdoutSeasonStartYear, 1947, manifest.seasonStartYear - 1)
      || !integer(trainedThroughSeasonStartYear, 1947, holdoutSeasonStartYear - 1)
      || years.has(holdoutSeasonStartYear) || backtest.status !== 'complete') {
      fail(`Forecast backtest ${index + 1} is not a unique completed strict rolling holdout.`);
    }
    if (previousHoldoutSeasonStartYear !== null && holdoutSeasonStartYear <= previousHoldoutSeasonStartYear) {
      fail('Forecast backtest holdouts must be in strictly increasing season order.');
    }
    years.add(holdoutSeasonStartYear);
    previousHoldoutSeasonStartYear = holdoutSeasonStartYear;
    const sourceCutoffUtc = String(backtest.sourceCutoffUtc || '');
    const sourceCutoff = Date.parse(sourceCutoffUtc);
    if (!Number.isFinite(sourceCutoff) || new Date(sourceCutoff).toISOString() !== sourceCutoffUtc
      || sourceCutoff >= Date.UTC(holdoutSeasonStartYear, 9, 1)) {
      fail(`Forecast backtest ${index + 1} was not issued before its holdout season.`);
    }
    const metrics = backtest.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) fail(`Forecast backtest ${index + 1} lacks metric evidence.`);
    return {
      holdoutSeasonStartYear,
      trainedThroughSeasonStartYear,
      sourceCutoffUtc: new Date(sourceCutoff).toISOString(),
      status: 'complete',
      metrics: {
        winProbability: normalizeForecastMetricSummary(metrics.winProbability, `Forecast backtest ${index + 1} win probability`, 'binary'),
        teamWins: normalizeForecastMetricSummary(metrics.teamWins, `Forecast backtest ${index + 1} team wins`, 'continuous'),
        teamNetRating: normalizeForecastMetricSummary(metrics.teamNetRating, `Forecast backtest ${index + 1} team net rating`, 'continuous'),
      },
    };
  });
  if (backtests.at(-1).holdoutSeasonStartYear !== completedThroughSeasonStartYear) {
    fail('Forecast backtest completed-through season does not match the final holdout.');
  }
  const aggregate = value.aggregate;
  if (!aggregate || typeof aggregate !== 'object' || Array.isArray(aggregate)) fail('Forecast backtest receipt lacks aggregate validation metrics.');
  const normalizedAggregate = {
    winProbability: normalizeForecastMetricSummary(aggregate.winProbability, 'Forecast backtest aggregate win probability', 'binary'),
    teamWins: normalizeForecastMetricSummary(aggregate.teamWins, 'Forecast backtest aggregate team wins', 'continuous'),
    teamNetRating: normalizeForecastMetricSummary(aggregate.teamNetRating, 'Forecast backtest aggregate team net rating', 'continuous'),
  };
  const closeEnough = (left, right, tolerance = 0.00001) => Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
  const weightedMean = (metric, key) => {
    const total = backtests.reduce((sum, row) => sum + row.metrics[metric].sample, 0);
    return total ? backtests.reduce((sum, row) => sum + row.metrics[metric][key] * row.metrics[metric].sample, 0) / total : null;
  };
  const weightedRmse = (metric, key) => {
    const total = backtests.reduce((sum, row) => sum + row.metrics[metric].sample, 0);
    return total ? Math.sqrt(backtests.reduce((sum, row) => sum + row.metrics[metric][key] ** 2 * row.metrics[metric].sample, 0) / total) : null;
  };
  for (const key of ['winProbability', 'teamWins', 'teamNetRating']) {
    const expected = backtests.reduce((sum, row) => sum + row.metrics[key].sample, 0);
    if (normalizedAggregate[key].sample !== expected) fail(`Forecast backtest aggregate ${key} sample does not reconcile to its holdouts.`);
  }
  for (const key of ['brier', 'logLoss', 'baselineBrier', 'baselineLogLoss', 'calibrationError']) {
    if (!closeEnough(normalizedAggregate.winProbability[key], weightedMean('winProbability', key))) {
      fail(`Forecast backtest aggregate winProbability ${key} does not reconcile to its holdouts.`);
    }
  }
  for (const metric of ['teamWins', 'teamNetRating']) {
    for (const key of ['mae', 'baselineMae']) {
      if (!closeEnough(normalizedAggregate[metric][key], weightedMean(metric, key))) {
        fail(`Forecast backtest aggregate ${metric} ${key} does not reconcile to its holdouts.`);
      }
    }
    for (const key of ['rmse', 'baselineRmse']) {
      if (!closeEnough(normalizedAggregate[metric][key], weightedRmse(metric, key))) {
        fail(`Forecast backtest aggregate ${metric} ${key} does not reconcile to its holdouts.`);
      }
    }
    const coverage = backtests.reduce((sum, row) => sum + row.metrics[metric].interval.empiricalCoverage * row.metrics[metric].sample, 0)
      / normalizedAggregate[metric].sample;
    if (!closeEnough(normalizedAggregate[metric].interval.empiricalCoverage, coverage)) {
      fail(`Forecast backtest aggregate ${metric} interval coverage does not reconcile to its holdouts.`);
    }
    const nominal = backtests[0].metrics[metric].interval.nominalCoverage;
    if (backtests.some(row => !closeEnough(row.metrics[metric].interval.nominalCoverage, nominal))
      || !closeEnough(normalizedAggregate[metric].interval.nominalCoverage, nominal)) {
      fail(`Forecast backtest ${metric} interval nominal coverage must be consistent across holdouts.`);
    }
  }
  const quality = value.quality;
  if (!quality || typeof quality !== 'object' || Array.isArray(quality) || !['improved-versus-declared-baselines', 'mixed-versus-declared-baselines', 'not-improved-versus-declared-baselines'].includes(quality.status)) {
    fail('Forecast backtest receipt lacks a truthful declared-baseline quality summary.');
  }
  const intervalCalibration = Object.fromEntries(['teamWins', 'teamNetRating'].map(metric => [metric,
    forecastIntervalCalibration(normalizedAggregate[metric])
  ]));
  if (quality.intervalCalibration && (typeof quality.intervalCalibration !== 'object' || Array.isArray(quality.intervalCalibration))) {
    fail('Forecast backtest interval calibration summary must be an object.');
  }
  for (const metric of ['teamWins', 'teamNetRating']) {
    const declared = quality.intervalCalibration?.[metric]?.status;
    if (declared !== undefined && declared !== intervalCalibration[metric].status) {
      fail(`Forecast backtest ${metric} interval calibration status does not reconcile to its aggregate coverage.`);
    }
  }
  const improvements = [
    normalizedAggregate.winProbability.baselineBrier - normalizedAggregate.winProbability.brier,
    normalizedAggregate.winProbability.baselineLogLoss - normalizedAggregate.winProbability.logLoss,
    normalizedAggregate.teamWins.baselineMae - normalizedAggregate.teamWins.mae,
    normalizedAggregate.teamWins.baselineRmse - normalizedAggregate.teamWins.rmse,
    normalizedAggregate.teamNetRating.baselineMae - normalizedAggregate.teamNetRating.mae,
    normalizedAggregate.teamNetRating.baselineRmse - normalizedAggregate.teamNetRating.rmse,
  ].filter(Number.isFinite);
  const improved = improvements.filter(delta => delta > 0).length;
  const pointRegressed = improvements.filter(delta => delta < 0).length;
  const intervalRegressed = Object.values(intervalCalibration)
    .filter(entry => entry.status !== 'within-sampling-error').length;
  const regressed = pointRegressed + intervalRegressed;
  const expectedQuality = regressed === 0 && improved > 0 ? 'improved-versus-declared-baselines'
    : improved > 0 ? 'mixed-versus-declared-baselines' : 'not-improved-versus-declared-baselines';
  if (quality.status !== expectedQuality) fail('Forecast backtest quality status does not reconcile to its declared baseline metrics.');
  return {
    status: 'validated',
    ledgerSha256: manifest.backtestLedgerSha256,
    completedThroughSeasonStartYear,
    holdoutPolicy: FORECAST_HOLDOUT_POLICY,
    issuancePolicy: FORECAST_ISSUANCE_POLICY,
    holdoutCount: backtests.length,
    backtests,
    aggregate: normalizedAggregate,
    quality: {
      status: quality.status,
      note: typeof quality.note === 'string' ? quality.note : null,
      intervalCalibration,
    },
    note: 'Forecast validation uses immutable, pre-season-issued rolling holdouts. Results remain conditional model estimates, not observed future outcomes.',
  };
}

function normalizeSource(source, seasons) {
  if (!source || typeof source !== 'object' || !SOURCE_KINDS.has(source.kind)) fail('Season Lab needs an exact-season, accepted pooled package, or accepted forecast scope.');
  if (source.kind === 'year-advance-scenario') {
    const evidenceSeasonStartYear = Number(source.evidenceSeasonStartYear);
    const fromSeasonStartYear = Number(source.fromSeasonStartYear);
    if (!integer(evidenceSeasonStartYear, 1900, 2199) || !integer(fromSeasonStartYear, 1900, 2199)
      || seasons.length !== 1 || seasons[0] !== fromSeasonStartYear + 1 || evidenceSeasonStartYear > fromSeasonStartYear) {
      fail('A no-roster-moves year-advance scenario must target one season after its current season and keep evidence from that season or earlier.');
    }
    if (source.noRosterMoves !== true) fail('A year-advance scenario requires the explicit no-roster-moves policy.');
    const baseSource = normalizeSource(source.baseSource, [evidenceSeasonStartYear]);
    if (!['exact-season', 'pooled-window'].includes(baseSource.kind)) {
      fail('A year-advance scenario requires exact or explicitly accepted pooled native evidence.');
    }
    return { kind: 'year-advance-scenario', fromSeasonStartYear, evidenceSeasonStartYear, baseSource, noRosterMoves: true };
  }
  if (source.kind !== 'forecast-season' && (source.forecastEvidence === true || source.acceptedForecastManifest === true || source.forecastManifest != null)) {
    fail('Exact and pooled Season Lab runs cannot reuse a forecast manifest.');
  }
  if (source.kind === 'pooled-window' && source.acceptedPooledPackage !== true) {
    fail('Cross-team or era pools require an accepted pooled package.');
  }
  if (source.kind === 'pooled-window'
    && (!String(source.packageId || source.packageRef?.packageId || '').trim()
      || !String(source.packageVersion || source.packageRef?.packageVersion || '').trim())) {
    fail('Accepted pooled packages must include an immutable package ID and version.');
  }
  if (source.kind === 'exact-season') {
    if (source.exactSeasonEvidence !== true) fail('Exact historical runs require an exact-season evidence receipt.');
    const packages = Array.isArray(source.seasonPackages) ? source.seasonPackages : [];
    if (packages.length !== seasons.length) {
      fail('Exact-season runs require one explicit package selection per season.');
    }
    if (packages.some((item, index) => !item || Number(item.seasonStartYear) !== seasons[index]
      || !String(item.packageId || item.packageRef?.packageId || source.packageId || '').trim()
      || !String(item.packageVersion || item.packageRef?.packageVersion || source.packageVersion || '').trim())) {
      fail('Exact-season package selections must match the requested seasons in order.');
    }
  }
  if (source.kind === 'forecast-season') {
    if (source.forecastEvidence !== true || source.acceptedForecastManifest !== true) fail('Upcoming-season runs require an explicit accepted forecast evidence receipt.');
    if (source.acceptedPooledPackage === true || source.packageId != null || source.packageVersion != null || source.packageRef != null
      || (Array.isArray(source.seasonPackages) && source.seasonPackages.length)) {
      fail('Forecast-season runs cannot use native exact or pooled package evidence as a fallback.');
    }
    const model = source.projectionModel;
    if (!model || typeof model !== 'object' || model.status !== 'accepted'
      || !String(model.modelId || '').trim() || !String(model.version || '').trim()
      || !SHA256.test(String(model.artifactSha256 || ''))) {
      fail('Upcoming-season runs require a dedicated accepted projection model with an ID and version.');
    }
    const forecastYears = Array.isArray(source.forecastSeasonStartYears) ? source.forecastSeasonStartYears.map(Number) : [];
    if (forecastYears.length !== seasons.length || forecastYears.some((year, index) => year !== seasons[index])) {
      fail('Forecast evidence must explicitly cover every requested season in order.');
    }
    const manifest = normalizeForecastManifest(source.forecastManifest, seasons);
    if (manifest.modelArtifactSha256 !== String(model.artifactSha256)) {
      fail('The forecast manifest does not match the accepted projection-model artifact.');
    }
    if (!Array.isArray(source.projectionRefs) || source.projectionRefs.length !== 1
      || String(source.projectionRefs[0]?.id || '') !== manifest.manifestId
      || String(source.projectionRefs[0]?.hash || '') !== manifest.contentSha256) {
      fail('Forecast projection references must pin the accepted manifest ID and content hash.');
    }
    normalizeForecastValidation(source.forecastValidation, manifest);
  }
  return {
    kind: source.kind,
    packageId: source.packageId || source.packageRef?.packageId || null,
    packageVersion: source.packageVersion || source.packageRef?.packageVersion || null,
    seasonPackages: Array.isArray(source.seasonPackages) ? source.seasonPackages.map(item => ({ ...item,
      packageId: item.packageId || item.packageRef?.packageId || source.packageId || null,
      packageVersion: item.packageVersion || item.packageRef?.packageVersion || source.packageVersion || null })) : [],
    acceptedPooledPackage: source.kind === 'pooled-window',
    exactSeasonEvidence: source.exactSeasonEvidence === true,
    forecastEvidence: source.kind === 'forecast-season' && source.forecastEvidence === true,
    forecastSeasonStartYears: source.kind === 'forecast-season' ? [...seasons] : [],
    projectionModel: source.kind === 'forecast-season' ? { modelId: String(source.projectionModel.modelId), version: String(source.projectionModel.version), artifactSha256: String(source.projectionModel.artifactSha256), status: 'accepted' } : null,
    projectionRefs: source.kind === 'forecast-season' && Array.isArray(source.projectionRefs)
      ? source.projectionRefs.map(ref => ({ id: ref.id || null, hash: ref.hash || null })) : [],
    acceptedForecastManifest: source.kind === 'forecast-season' && source.acceptedForecastManifest === true,
    forecastManifest: source.kind === 'forecast-season' ? normalizeForecastManifest(source.forecastManifest, seasons) : null,
    forecastValidation: source.kind === 'forecast-season'
      ? normalizeForecastValidation(source.forecastValidation, normalizeForecastManifest(source.forecastManifest, seasons))
      : null,
  };
}

function packageSeasonStartYear(reference) {
  const value = reference?.seasonStartYear ?? reference?.scope?.seasonStartYear;
  return Number.isInteger(Number(value)) ? Number(value) : null;
}

function exactPackageForSeason(source, season) {
  return source?.kind === 'exact-season'
    ? source.seasonPackages.find(item => Number(item.seasonStartYear) === Number(season)) || null
    : null;
}

function sourceReceiptForSeason(source, season) {
  if (source?.kind === 'year-advance-scenario') {
    return { kind: 'year-advance-scenario', seasonStartYear: Number(season), fromSeasonStartYear: source.fromSeasonStartYear,
      evidenceSeasonStartYear: source.evidenceSeasonStartYear,
      evidenceSource: sourceReceiptForSeason(source.baseSource, source.evidenceSeasonStartYear),
      noRosterMoves: true };
  }
  if (source?.kind === 'exact-season') {
    const selected = exactPackageForSeason(source, season);
    return selected ? { kind: 'exact-season', seasonStartYear: Number(season), packageId: selected.packageId,
      packageVersion: selected.packageVersion, packageRef: { ...selected } } : null;
  }
  if (source?.kind === 'pooled-window') {
    return { kind: 'pooled-window', seasonStartYear: Number(season), packageId: source.packageId || null,
      packageVersion: source.packageVersion || null };
  }
  if (source?.kind === 'forecast-season') {
    return { kind: 'forecast-season', seasonStartYear: Number(season),
      projectionModel: source.projectionModel ? { ...source.projectionModel } : null,
      projectionRef: source.projectionRefs?.[0] ? { ...source.projectionRefs[0] } : null,
      forecastManifest: source.forecastManifest ? { manifestId: source.forecastManifest.manifestId,
        contentSha256: source.forecastManifest.contentSha256, scheduleSha256: source.forecastManifest.scheduleSha256 } : null };
  }
  return null;
}

/**
 * Describe the supported boundary after a simulated season. Season Lab can
 * record standings and playoff outcomes, but it has no accepted offseason
 * model to turn those results into next-year rosters. A next year listed in a
 * multi-season run is therefore a separate, explicitly sourced simulation.
 */
export function buildSeasonLabProgressionReceipt(setup, completedSeasonStartYear) {
  const seasonStartYear = Number(completedSeasonStartYear);
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 1900 || seasonStartYear > 2200) {
    fail('Season Lab progression needs a valid completed season start year.');
  }
  if (!setup || typeof setup !== 'object') fail('Season Lab progression needs a validated setup.');
  const nextSeasonStartYear = seasonStartYear + 1;
  const declaredSeasons = Array.isArray(setup?.horizon?.seasonStartYears)
    ? setup.horizon.seasonStartYears.map(Number) : [];
  if (!declaredSeasons.includes(seasonStartYear)) fail('Season Lab progression season is outside the declared horizon.');
  const nextSeasonDeclared = declaredSeasons.includes(nextSeasonStartYear);
  const yearAdvanceScenario = setup.source?.kind === 'year-advance-scenario';
  const scenarioSupported = ['exact-season', 'pooled-window', 'year-advance-scenario'].includes(setup.source?.kind);
  return {
    contractVersion: SEASON_LAB_PROGRESSION_VERSION,
    completedSeasonStartYear: seasonStartYear,
    nextSeasonStartYear,
    offseason: {
      status: 'not-modeled',
      rosterChangesApplied: false,
      note: 'Contracts, transactions, injuries, development, and retirements are not inferred between seasons.',
    },
    continuity: {
      status: yearAdvanceScenario ? 'held-constant-no-roster-moves-scenario' : 'explicit-input-required',
      rosterCarriedForward: yearAdvanceScenario,
      standingsAffectNextSeasonInputs: false,
      playoffsAffectNextSeasonInputs: false,
    },
    nextSeason: {
      status: nextSeasonDeclared ? 'declared-independent-season' : 'requires-explicit-season-selection',
      declaredInSameRun: nextSeasonDeclared,
      source: nextSeasonDeclared ? sourceReceiptForSeason(setup.source, nextSeasonStartYear) : null,
    },
    advance: {
      status: nextSeasonDeclared ? 'independent-season-input'
        : scenarioSupported ? 'no-roster-moves-scenario-available' : 'requires-explicit-next-season-input',
      contract: 'buildSeasonLabNextSeasonInput',
      automatic: false,
      nextSeasonStartYear,
      ...(yearAdvanceScenario ? { evidenceSeasonStartYear: setup.source.evidenceSeasonStartYear, noRosterMoves: true } : {}),
    },
  };
}

function scheduleProvenance(schedule) {
  const provenanceKind = schedule.kind === 'actual' ? (schedule.sourceReceipt?.contentSha256 ? 'recorded-calendar' : 'declared-actual-calendar')
    : schedule.kind === 'generated-future' ? 'accepted-forecast-calendar'
      : schedule.kind === 'nba-cup-completion' ? 'published-calendar-with-seeded-cup-completion'
      : schedule.kind === 'custom' ? 'declared-calendar' : 'simulator-generated-round-robin';
  return { kind: schedule.kind, provenanceKind, scheduleId: schedule.scheduleId || null,
    sourceReceipt: schedule.sourceReceipt ? { ...schedule.sourceReceipt } : null, gamesPerTeam: schedule.gamesPerTeam };
}

function phaseScopeForSeason(setup, season) {
  const phases = setup.schedule.kind === 'round-robin'
    ? ['regular']
    : setup.schedule.games.filter(game => game.seasonStartYear == null || Number(game.seasonStartYear) === Number(season))
      .map(game => normalizedPhase(game.phase || 'regular'));
  if (setup.playoff.enabled) phases.push('playoffs');
  return [...new Set(phases)].sort();
}

function packageIdentityMatches(reference, expected, season) {
  if (!reference || !expected) return false;
  const referenceYear = packageSeasonStartYear(reference);
  const directReference = reference.packageRef && typeof reference.packageRef === 'object' ? reference.packageRef : reference;
  return String(directReference.packageId || '') === String(expected.packageId || '')
    && String(reference.packageVersion || reference.packageRef?.packageVersion || '') === String(expected.packageVersion || '')
    && (referenceYear === null || referenceYear === Number(season))
    && ['packageManifestSha256', 'sourceLockSha256', 'projectionContentSha256'].every(key =>
      expected[key] == null || String(directReference[key] || '') === String(expected[key]));
}

function validateExactPackagePayloads(source, payloads, season) {
  const expected = exactPackageForSeason(source, season);
  if (!expected) fail(`No exact package receipt is selected for ${season}.`);
  const requiresPackagePins = ['packageManifestSha256', 'sourceLockSha256', 'projectionContentSha256']
    .some(key => typeof expected[key] === 'string' && expected[key].length > 0);
  payloads.forEach((payload, index) => {
    const teamId = payload.team;
    const payloadRefs = Array.isArray(payload.packageRefs) ? payload.packageRefs : [];
    const seasonProfiles = Array.isArray(payload.nativeProfiles) ? payload.nativeProfiles
      .filter(profile => Number(profile?.seasonStartYear) === Number(season)) : [];
    if (requiresPackagePins && seasonProfiles.length
      && (!payloadRefs.length || seasonProfiles.some(profile => !profile.packageRef))) {
      fail(`Team ${teamId || index + 1} native evidence must include the verified exact package reference for ${season}.`);
    }
    if (payloadRefs.length) {
      const refsForSeason = payloadRefs.filter(reference => packageSeasonStartYear(reference) === Number(season));
      if (refsForSeason.length !== 1 || !packageIdentityMatches(refsForSeason[0], expected, season)) {
        fail(`Team ${teamId || index + 1} package receipt does not match the selected exact package for ${season}.`);
      }
    }
    for (const profile of seasonProfiles) {
      if (Number(profile?.seasonStartYear) !== Number(season) || !profile?.packageRef) continue;
      if (!packageIdentityMatches(profile.packageRef, expected, season)) {
        fail(`Team ${teamId || index + 1} native profile package receipt does not match the selected exact package for ${season}.`);
      }
    }
    for (const playerRows of Object.values(payload.seasonProfiles || {})) {
      if (!Array.isArray(playerRows)) continue;
      for (const profile of playerRows) {
        if (Number(profile?.seasonStartYear) !== Number(season) || !profile?.packageRef) continue;
        if (!packageIdentityMatches(profile.packageRef, expected, season)) {
          fail(`Team ${teamId || index + 1} player profile package receipt does not match the selected exact package for ${season}.`);
        }
      }
    }
  });
}

function normalizeSchedule(schedule, teams, horizon) {
  if (!schedule || typeof schedule !== 'object' || !SCHEDULES.has(schedule.kind)) fail('Season Lab needs an actual, round-robin, or declared custom schedule.');
  const gamesPerTeam = Number(schedule.gamesPerTeam ?? (horizon.kind === 'full' ? 82 : horizon.kind === 'game' ? 1 : 30));
  if (!integer(gamesPerTeam, 1, SEASON_LAB_POLICY.maxGamesPerTeam)) fail('Season Lab games per team must be a whole number from 1 to 200.');
  if ((horizon.kind === 'game' && gamesPerTeam !== 1) || (horizon.kind === 'full' && gamesPerTeam !== 82)) fail(`The ${horizon.kind} horizon has a fixed games-per-team target.`);
  if (schedule.kind === 'round-robin' && (teams.length * gamesPerTeam) % 2 !== 0) {
    fail('Round-robin schedules need an even number of total team appearances.');
  }
  const teamIds = new Set(teams.map(team => team.id));
  const games = canonicalScheduleOrder(Array.isArray(schedule.games) ? schedule.games.map((game, index) => {
    if (!game || !teamIds.has(game.home) || !teamIds.has(game.away) || game.home === game.away) fail(`Schedule game ${index + 1} has invalid home/away teams.`);
    const phase = normalizedPhase(game.phase);
    if (!SUPPORTED_PHASES.has(phase)) fail(`Schedule game ${index + 1} has an unsupported phase.`);
    const id = String(game.id || `g${index + 1}`).trim();
    if (!SEED.test(id)) fail(`Schedule game ${index + 1} has an invalid ID.`);
    const round = Number(game.round ?? index + 1);
    if (!integer(round, 1, Number.MAX_SAFE_INTEGER)) fail(`Schedule game ${index + 1} has an invalid round.`);
    const seasonStartYear = game.seasonStartYear == null ? null : Number(game.seasonStartYear);
    if (seasonStartYear !== null && !integer(seasonStartYear, 1900, 2200)) fail(`Schedule game ${index + 1} has an invalid season start year.`);
    const scheduledAt = game.scheduledAt == null ? null : String(game.scheduledAt);
    if (scheduledAt !== null && !Number.isFinite(Date.parse(scheduledAt))) fail(`Schedule game ${index + 1} has an invalid scheduled time.`);
    const explicitStandingsEligibility = normalizeStandingsEligibility(game, phase);
    return { ...(schedule.kind === 'nba-cup-completion' ? game : {}), id, round, home: game.home, away: game.away, seasonStartYear, phase,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      ...(game.scheduledAtEt ? { scheduledAtEt: String(game.scheduledAtEt) } : {}),
      ...(game.dateEt ? { dateEt: String(game.dateEt) } : {}),
      ...(game.scheduleWindow ? { scheduleWindow: String(game.scheduleWindow) } : {}),
      ...(game.evidenceStatus ? { evidenceStatus: String(game.evidenceStatus) } : {}),
      ...(typeof game.scenarioGenerated === 'boolean' ? { scenarioGenerated: game.scenarioGenerated } : {}),
      ...(game.sourceId ? { sourceId: String(game.sourceId) } : {}),
      ...(game.sourceSlot != null ? { sourceSlot: Number(game.sourceSlot) } : {}),
      ...(schedule.kind === 'nba-cup-completion' && game.groupId ? { groupId: String(game.groupId) } : {}),
      ...(explicitStandingsEligibility === null ? {} : { standingsEligible: explicitStandingsEligibility }) };
  }) : []);
  if ((schedule.kind === 'actual' || schedule.kind === 'custom' || schedule.kind === 'generated-future') && games.length === 0) {
    fail(`${schedule.kind === 'actual' ? 'Actual' : schedule.kind === 'generated-future' ? 'Generated future' : 'Custom'} schedules require declared games.`);
  }
  if (new Set(games.map(game => game.id)).size !== games.length) fail('Schedule game IDs must be unique.');
  const appearances = new Map(teams.map(team => [team.id, 0]));
  for (const game of games) {
    appearances.set(game.home, appearances.get(game.home) + 1);
    appearances.set(game.away, appearances.get(game.away) + 1);
  }
  if ([...appearances.values()].some(count => count > SEASON_LAB_POLICY.maxGamesPerTeam)) {
    fail(`Declared schedules cannot exceed ${SEASON_LAB_POLICY.maxGamesPerTeam} games per team.`);
  }
  return { kind: schedule.kind, gamesPerTeam, scheduleId: schedule.scheduleId || null,
    sourceReceipt: schedule.sourceReceipt && typeof schedule.sourceReceipt === 'object'
      ? { id: schedule.sourceReceipt.id || null, version: schedule.sourceReceipt.version || null, contentSha256: schedule.sourceReceipt.contentSha256 || null }
      : null, games };
}

export function validateSeasonLabSetup(input = {}) {
  if (!input || typeof input !== 'object') fail('Season Lab setup must be an object.');
  const teams = Array.isArray(input.teams) ? input.teams.map(normalizeTeam) : [];
  if (teams.length < SEASON_LAB_POLICY.minTeams || teams.length > SEASON_LAB_POLICY.maxTeams) fail('Season Lab supports 2 through 30 teams, with the all-30-team setup recommended.');
  if (new Set(teams.map(team => team.id)).size !== teams.length) fail('Season Lab teams must be unique.');
  const leagueStructure = leagueStructureForTeams(teams);
  const horizonInput = input.horizon || {};
  if (!HORIZONS.has(horizonInput.kind)) fail('Season Lab horizon must be game, short, full, or multi-season.');
  const seasons = normalizeSeasonYears(horizonInput.seasonStartYears || [horizonInput.seasonStartYear]);
  if (horizonInput.kind === 'multi-season' && seasons.length < 2) fail('A multi-season horizon requires multiple explicit seasons.');
  if (horizonInput.kind !== 'multi-season' && seasons.length !== 1) fail('A single-season horizon accepts exactly one season.');
  const source = normalizeSource(input.source, seasons);
  const schedule = normalizeSchedule(input.schedule, teams, horizonInput);
  if (schedule.kind === 'nba-cup-completion') {
    const teamIds = teams.map(team => team.id);
    const teamSet = new Set(teamIds);
    const expectedTeams = new Set(NBA_TEAM_CODES);
    const sourceIs2025YearAdvance = source.kind === 'year-advance-scenario'
      && source.fromSeasonStartYear === 2025 && source.evidenceSeasonStartYear === 2025
      && source.baseSource.kind === 'exact-season';
    if (horizonInput.kind !== 'full' || seasons.length !== 1 || seasons[0] !== 2026
      || teams.length !== NBA_TEAM_CODES.length || teamSet.size !== expectedTeams.size
      || [...expectedTeams].some(team => !teamSet.has(team)) || !sourceIs2025YearAdvance
      || schedule.gamesPerTeam !== 82 || schedule.games.length !== 1200) {
      fail('The 2026–27 NBA Cup completion schedule is available only as a full all-30-team no-roster-moves year-advance scenario from exact 2025–26 evidence.');
    }
    const appearances = new Map(NBA_TEAM_CODES.map(team => [team, 0]));
    schedule.games.forEach(game => {
      if (!['regular', 'in_season_tournament'].includes(game.phase) || game.standingsEligible !== true) {
        fail('The published 2026–27 NBA Cup schedule requires standings-eligible regular and Cup Group Play rows.');
      }
      appearances.set(game.home, appearances.get(game.home) + 1);
      appearances.set(game.away, appearances.get(game.away) + 1);
    });
    if ([...appearances.values()].some(count => count !== 80)
      || schedule.games.filter(game => game.groupId).length !== 60
      || schedule.games.filter(game => game.phase === 'in_season_tournament').length !== 60) {
      fail('The published 2026–27 NBA Cup schedule must retain 1,200 rows, 60 Group Play games, and 80 announced appearances per team.');
    }
  }
  if (source.kind === 'forecast-season') {
    if (schedule.kind !== source.forecastManifest.scheduleKind
      || schedule.sourceReceipt?.contentSha256 !== source.forecastManifest.scheduleSha256) {
      fail('Forecast schedules must match the accepted manifest kind and immutable schedule hash.');
    }
  }
  if (schedule.kind === 'generated-future' && source.kind !== 'forecast-season') {
    fail('Generated future schedules require an accepted forecast-season source; an exact historical package cannot be relabeled as future evidence.');
  }
  if (schedule.kind !== 'round-robin') {
    if (seasons.length > 1 && schedule.games.some(game => game.seasonStartYear === null)) {
      fail('Multi-season actual or custom schedules require an explicit season start year on every declared game.');
    }
    if (schedule.games.some(game => game.seasonStartYear !== null && !seasons.includes(game.seasonStartYear))) {
      fail('Actual or custom schedule games must use one of the requested season start years.');
    }
  }
  const controlInput = input.control || {};
  if (!CONTROLS.has(controlInput.kind)) fail('Season Lab control must be user-managed, deterministic-bot, or mixed.');
  if (controlInput.managedTeamIds != null && !Array.isArray(controlInput.managedTeamIds)) fail('Season Lab managed teams must be an array of team IDs.');
  const managedTeamIds = controlInput.managedTeamIds == null ? [] : [...controlInput.managedTeamIds];
  if (managedTeamIds.some(id => !teams.some(team => team.id === id)) || new Set(managedTeamIds).size !== managedTeamIds.length) {
    fail('Season Lab managed teams must be selected from the league.');
  }
  if (controlInput.kind === 'mixed' && managedTeamIds.length === 0) fail('Mixed control requires at least one managed team.');
  if (controlInput.kind === 'user-managed' && managedTeamIds.length === 0) fail('User-managed control requires at least one managed team.');
  const repeats = Number(input.repeats ?? input.repeatCount ?? input.randomness?.repeats ?? 1);
  if (!integer(repeats, 1, SEASON_LAB_POLICY.maxRepeats)) fail('Season Lab repeat count must be a whole number from 1 to 500.');
  if (schedule.kind === 'nba-cup-completion' && repeats > SEASON_LAB_POLICY.maxCupRepeats) {
    fail(`NBA Cup completion is limited to ${SEASON_LAB_POLICY.maxCupRepeats} replays to bound per-replay audit receipts.`);
  }
  const seed = String(input.seed ?? input.randomness?.seed ?? '');
  if (!SEED.test(seed)) fail('Season Lab needs a fixed alphanumeric seed.');
  createScenarioRandom(seed);
  const playoffInput = input.playoff || {};
  const playoffsEnabled = playoffInput.enabled !== false;
  const playoffTeams = playoffsEnabled ? Number(playoffInput.teams ?? 16) : 0;
  if (playoffsEnabled && playoffTeams !== 16) {
    fail('Season Lab playoffs require exactly 16 teams; set playoff.enabled to false for a no-playoffs simulation.');
  }
  if (playoffTeams > teams.length) fail('Season Lab playoff field cannot exceed the selected league.');
  const seriesLength = Number(playoffInput.seriesLength ?? 7);
  if (![1, 3, 5, 7].includes(seriesLength)) fail('Season Lab playoff series length must be 1, 3, 5, or 7 games.');
  const playoffPlan = conferenceBracketPlan(teams, playoffTeams);
  if (leagueStructure.completeNba && playoffTeams > 0 && !playoffPlan) {
    fail('A complete NBA league requires an even conference-aware playoff field with at least two entrants per conference (4, 8, or 16 total).');
  }
  if (playoffTeams > 0 && schedule.games.some(game => game.phase === 'play_in' || game.phase === 'playoffs')) {
    fail('Declared play-in or playoff games cannot be combined with a generated playoff bracket; disable the generated bracket or omit those phases.');
  }
  const models = input.models || {};
  for (const key of MODEL_KEYS) if (models[key] != null && models[key] !== 'accepted') {
    fail(`${key} are not invented; provide a dedicated accepted model before enabling them.`);
  }
  const matchupWeights = normalizeMatchupWeights(input.matchupWeights ?? input.modelInputs?.matchupWeights);
  const scheduledGames = schedule.kind === 'nba-cup-completion'
    ? schedule.games.length + 30
    : schedule.kind === 'round-robin'
      ? Math.round(schedule.gamesPerTeam * teams.length / 2)
      : schedule.games.length;
  const regularGames = schedule.kind === 'nba-cup-completion'
    ? scheduledGames
    : schedule.kind === 'round-robin'
    ? scheduledGames
    : schedule.games.filter(game => standingsEligible(game)).length;
  // A bracket with N entrants contains N-1 series.  Reserve the maximum
  // declared series length even though most sampled series end earlier; this
  // keeps the work guard honest before a long repeat begins.
  const playoffGames = playoffTeams > 1 ? (playoffTeams - 1) * seriesLength : 0;
  const workUnits = seasons.length * repeats * (scheduledGames + playoffGames);
  if (workUnits > SEASON_LAB_POLICY.maxWorkUnits) fail('This Season Lab setup exceeds the bounded simulation work limit.');
  const weightingScenario = matchupWeights.ownOffense !== DEFAULT_MATCHUP_WEIGHTS.ownOffense;
  const scenario = horizonInput.kind === 'short' || schedule.kind === 'custom' || schedule.kind === 'generated-future' || schedule.kind === 'nba-cup-completion'
    || source.kind === 'forecast-season' || source.kind === 'year-advance-scenario' || weightingScenario;
  return {
    contractVersion: SEASON_LAB_CONTRACT_VERSION,
    modelVersion: SEASON_LAB_MODEL_VERSION,
    teams, leagueStructure, source, horizon: { kind: horizonInput.kind, seasonStartYears: seasons }, schedule,
    control: { kind: controlInput.kind, managedTeamIds, decisions: controlInput.decisions || null },
    matchupWeights,
    randomness: { seed, repeats },
    playoff: { enabled: playoffTeams > 0, teams: playoffTeams, seriesLength,
      structure: playoffPlan?.mode || 'generic', conferenceAware: Boolean(playoffPlan), conferenceTeams: playoffPlan?.perConference || null },
    scheduledGames, regularGames,
    workUnits,
    scenario,
    label: scenario ? 'Scenario' : 'Historical-shape run',
    assumptions: Array.isArray(input.assumptions) ? [...input.assumptions] : [],
  };
}

/**
 * Prepare one explicitly modeled next season from the currently selected
 * native team-rate evidence. This keeps the evidence season pinned, preserves
 * the replay seed and team declarations, and treats the year advance as a
 * generated-calendar no-roster-moves scenario.
 */
export function buildSeasonLabNextSeasonInput(input = {}, completedSeasonStartYear = null, options = {}) {
  const setup = validateSeasonLabSetup(input.setup || input);
  const requestedSeason = completedSeasonStartYear == null
    ? setup.horizon.seasonStartYears[setup.horizon.seasonStartYears.length - 1]
    : Number(completedSeasonStartYear);
  if (!Number.isSafeInteger(requestedSeason) || !setup.horizon.seasonStartYears.includes(requestedSeason)) {
    fail('Choose a completed season that is included in the current Season Lab run.');
  }
  if (requestedSeason >= 2200) fail('Season Lab cannot advance beyond season start year 2200.');
  const nextSeasonStartYear = requestedSeason + 1;
  const previousSource = setup.source.kind === 'year-advance-scenario' ? setup.source.baseSource : setup.source;
  const evidenceSeasonStartYear = setup.source.kind === 'year-advance-scenario'
    ? setup.source.evidenceSeasonStartYear : requestedSeason;
  if (!['exact-season', 'pooled-window'].includes(previousSource.kind)) {
    fail('Next-season scenarios require selected exact or accepted pooled native team-rate evidence.');
  }
  const evidenceSource = previousSource.kind === 'exact-season'
    ? { kind: 'exact-season', exactSeasonEvidence: true,
      seasonPackages: [exactPackageForSeason(previousSource, evidenceSeasonStartYear)].filter(Boolean) }
    : { kind: 'pooled-window', acceptedPooledPackage: true,
      packageId: previousSource.packageId, packageVersion: previousSource.packageVersion };
  if (evidenceSource.kind === 'exact-season' && evidenceSource.seasonPackages.length !== 1) {
    fail(`No exact source package is available to carry ${evidenceSeasonStartYear} team rates into a scenario.`);
  }
  const cupCompletion = options?.cupCompletion || null;
  if (cupCompletion) {
    const teamIds = setup.teams.map(team => team.id);
    const expectedTeams = new Set(NBA_TEAM_CODES);
    if (requestedSeason !== 2025 || nextSeasonStartYear !== 2026 || evidenceSeasonStartYear !== 2025
      || evidenceSource.kind !== 'exact-season' || teamIds.length !== NBA_TEAM_CODES.length
      || new Set(teamIds).size !== expectedTeams.size || [...expectedTeams].some(team => !teamIds.includes(team))
      || cupCompletion.artifact?.format !== 'djhc-nba-cup-published-schedule-v1'
      || cupCompletion.artifact?.status !== 'published' || Number(cupCompletion.artifact?.seasonStartYear) !== 2026
      || !Array.isArray(cupCompletion.artifact?.announcedGames) || cupCompletion.artifact.announcedGames.length !== 1200
      || !Array.isArray(cupCompletion.artifact?.groups) || cupCompletion.artifact.groups.length !== 6
      || cupCompletion.priorSeasonRecords?.status !== 'ready'
      || Number(cupCompletion.priorSeasonRecords?.seasonStartYear) !== 2025
      || !cupCompletion.priorSeasonRecords?.records) {
      fail('The 2026–27 NBA Cup schedule needs all 30 teams, exact 2025–26 native evidence, the published 1,200-game artifact, and complete exact 2025–26 records.');
    }
  }
  const supplied = Array.isArray(input.teams) ? input.teams : [];
  if (supplied.length !== setup.teams.length) fail('Next-season scenarios need the current evidence payload for every selected team.');
  const payloads = setup.teams.map((team, index) => {
    const payload = supplied.find(item => item?.team === team.id || item?.team === `t${index}` || item?.id === team.id);
    if (!payload || !Array.isArray(payload.nativeProfiles)) {
      fail(`Team ${team.name} has no native team-rate payload to carry forward.`);
    }
    if (evidenceSource.kind === 'exact-season') validateExactPackagePayloads(evidenceSource, [payload], evidenceSeasonStartYear);
    const evidence = nativeTeamEvidence(payload, evidenceSeasonStartYear, 'regular');
    if (evidence.status !== 'ready' || evidence.kind !== 'native-rate') {
      fail(`Team ${team.name} cannot advance without complete observed native rates from ${evidenceSeasonStartYear}: ${evidence.reason || 'native evidence is unavailable.'}`);
    }
    return payload;
  });
  const gamesPerTeam = Number(setup.schedule.gamesPerTeam);
  if (!integer(gamesPerTeam, 1, SEASON_LAB_POLICY.maxGamesPerTeam)) {
    fail('Next-season scenarios need a balanced games-per-team target from the current schedule.');
  }
  const noRosterMovesAssumption = cupCompletion
    ? `Season 2026–27 NBA Cup is a modeled no-roster-moves scenario: keep the selected teams and exact ${evidenceSeasonStartYear} native rates fixed, simulate the 1,200 published schedule rows once per replay, and add 30 seeded schedule-completion games. This is not exact 2026–27 player data or a forecast; the Cup Championship is excluded from the 82-game regular season.`
    : `Season ${nextSeasonStartYear} is a no-roster-moves scenario: keep the selected teams and ${evidenceSeasonStartYear} native rates fixed, generate a new round-robin calendar, and do not infer contracts, transactions, injuries, development, or retirements.`;
  const scheduleSourceReceipt = cupCompletion ? {
    id: 'djhc-nba-cup-2026-27-published-schedule-v1',
    version: String(cupCompletion.sourceReceipt?.version || ''),
    contentSha256: String(cupCompletion.sourceReceipt?.contentSha256 || ''),
  } : null;
  if (cupCompletion && (cupCompletion.sourceReceipt?.id !== scheduleSourceReceipt.id
    || scheduleSourceReceipt.version !== String(cupCompletion.artifact.revision || '')
    || !SHA256.test(scheduleSourceReceipt.contentSha256))) {
    fail('The published 2026–27 NBA Cup schedule is missing a valid artifact-bound source receipt.');
  }
  const nextSetup = validateSeasonLabSetup({
    teams: setup.teams,
    source: { kind: 'year-advance-scenario', fromSeasonStartYear: requestedSeason, evidenceSeasonStartYear, baseSource: evidenceSource, noRosterMoves: true },
    horizon: { kind: gamesPerTeam === 82 ? 'full' : 'short', seasonStartYears: [nextSeasonStartYear] },
    schedule: cupCompletion
      ? { kind: 'nba-cup-completion', scheduleId: 'nba-cup-2026-27-published-schedule-v1', sourceReceipt: scheduleSourceReceipt,
        gamesPerTeam: 82, games: cupCompletion.artifact.announcedGames }
      : { kind: 'round-robin', gamesPerTeam },
    control: setup.control,
    matchupWeights: setup.matchupWeights,
    randomness: { seed: setup.randomness.seed, repeats: setup.randomness.repeats },
    playoff: { enabled: setup.playoff.enabled, teams: setup.playoff.teams, seriesLength: setup.playoff.seriesLength },
    assumptions: [...setup.assumptions, noRosterMovesAssumption],
  });
  return {
    setup: nextSetup,
    teams: payloads,
    actualRecords: null,
    progression: {
      contractVersion: SEASON_LAB_PROGRESSION_VERSION,
      status: 'ready',
      fromSeasonStartYear: requestedSeason,
      seasonStartYear: nextSeasonStartYear,
      evidenceSeasonStartYear,
      evidenceSource: sourceReceiptForSeason(evidenceSource, evidenceSeasonStartYear),
      schedule: cupCompletion ? 'published-2026-27-nba-cup-with-seeded-completion' : 'generated-round-robin-scenario',
      ...(cupCompletion ? { cupScheduleSourceReceipt: scheduleSourceReceipt,
        priorSeasonRecordsSourceReceipt: cupCompletion.priorSeasonRecords.sourceReceipt || null } : {}),
      noRosterMoves: true,
      seed: setup.randomness.seed,
    },
    ...(cupCompletion ? { cupCompletion: {
      artifact: cupCompletion.artifact,
      sourceReceipt: scheduleSourceReceipt,
      priorSeasonRecords: cupCompletion.priorSeasonRecords.records,
      priorSeasonRecordsSourceReceipt: cupCompletion.priorSeasonRecords.sourceReceipt || null,
    } } : {}),
  };
}

function stateTeamIds(state) {
  return Array.isArray(state?.teams) ? state.teams.map(team => String(team.id)) : [];
}

/**
 * Create a serializable league ledger for multi-season replay.  This is the
 * smallest persistent layer in the Season Lab: it keeps the validated setup,
 * roster declarations, and committed season outputs together, while leaving
 * transactions, contracts, injuries, development, and retirements explicitly
 * unmodeled until a dedicated accepted model is supplied.
 */
export function createSeasonLabLeagueState({ leagueId = 'season-lab-league', setup, teams = [] } = {}) {
  const normalizedSetup = validateSeasonLabSetup(setup || {});
  const supplied = Array.isArray(teams) ? teams : [];
  const expectedIds = stateTeamIds(normalizedSetup);
  if (supplied.length && supplied.length !== expectedIds.length) fail('Persistent Season Lab state needs one roster/evidence descriptor per selected team.');
  const suppliedById = new Map(supplied.map(team => [String(team?.id || team?.team || ''), team]));
  if (supplied.some(team => !team || !expectedIds.includes(String(team.id || team.team)))) fail('Persistent Season Lab state contains a team outside the validated setup.');
  const stateTeams = normalizedSetup.teams.map(team => {
    const descriptor = suppliedById.get(team.id) || {};
    return { id: team.id, name: team.name, rosterMode: team.rosterMode,
      rosterId: team.rosterId || null, roster: cloneStateValue(team.roster || descriptor.roster || null),
      control: team.control || null, conference: team.conference || null, division: team.division || null,
      sourceTeam: descriptor.team || team.id };
  });
  return {
    format: SEASON_LAB_LEAGUE_STATE_VERSION,
    leagueId: String(leagueId || 'season-lab-league').slice(0, 120),
    modelVersion: SEASON_LAB_MODEL_VERSION,
    setup: cloneStateValue(normalizedSetup),
    teams: stateTeams,
    seasons: [],
    currentSeasonStartYear: null,
    currentStandings: [],
    offseason: { status: 'not-modeled', nextSeasonStartYear: null,
      note: 'No contracts, transactions, injuries, development, or retirements are invented between committed seasons.' },
    status: 'ready',
    replay: { seed: normalizedSetup.randomness.seed, committedSeasons: 0 },
  };
}

/**
 * Commit one complete Season Lab result to a league ledger. Re-committing an
 * identical season is idempotent; a different result for the same season is
 * rejected so a saved league cannot silently fork its history.
 */
export function appendSeasonLabSeason(state, result) {
  if (!state || state.format !== SEASON_LAB_LEAGUE_STATE_VERSION || !Array.isArray(state.seasons)
    || !Array.isArray(state.teams) || !state.setup) fail('Season Lab league state is unavailable or malformed.');
  if (!result || result.status !== 'complete' || !integer(Number(result.seasonStartYear), 1900, 2200)) {
    fail('Only a complete Season Lab result can be committed to league state.');
  }
  const expectedIds = new Set(stateTeamIds(state));
  const rows = Array.isArray(result.standings) ? result.standings : [];
  const rowIds = rows.map(row => String(row?.teamId || ''));
  if (rows.length !== expectedIds.size || rowIds.some(id => !expectedIds.has(id)) || new Set(rowIds).size !== rowIds.length) {
    fail('Season Lab result standings do not match the persistent league teams.');
  }
  const seasonStartYear = Number(result.seasonStartYear);
  const entry = {
    seasonStartYear, modelVersion: result.modelVersion || SEASON_LAB_MODEL_VERSION,
    replayKey: result.replayKey || null, championId: result.championId || null,
    ...(Array.isArray(result.decisionLog) && result.decisionLog.length
      ? { decisionLog: cloneStateValue(result.decisionLog), decisionPolicyId: result.decisionPolicyId || null }
      : {}),
    progression: cloneStateValue(result.progression || null),
    standings: cloneStateValue(rows), teamRecords: cloneStateValue(result.teamRecords || rows),
    playerStats: cloneStateValue(result.playerStats || []), playerGameLogs: cloneStateValue(result.playerGameLogs || []),
    playoffBracket: cloneStateValue(result.playoffBracket || null), playoffStructure: result.playoffStructure || null,
    playoffFieldIds: cloneStateValue(result.playoffFieldIds || []), scheduleAudit: cloneStateValue(result.scheduleAudit || null),
    consistencyAudit: cloneStateValue(result.consistencyAudit || null),
  };
  const fingerprint = stableJson(entry);
  const existingIndex = state.seasons.findIndex(item => Number(item?.seasonStartYear) === seasonStartYear);
  const next = cloneStateValue(state);
  if (existingIndex >= 0) {
    if (stableJson(next.seasons[existingIndex]) !== fingerprint) fail('A different Season Lab result is already committed for this season.');
    return next;
  }
  if (next.seasons.length >= SEASON_LAB_LEAGUE_STATE_LIMITS.maxSeasons) fail('Persistent Season Lab state reached its season history limit.');
  next.seasons.push(entry);
  next.seasons.sort((left, right) => left.seasonStartYear - right.seasonStartYear);
  next.currentSeasonStartYear = seasonStartYear;
  next.currentStandings = cloneStateValue(rows);
  next.offseason = { status: 'not-modeled', nextSeasonStartYear: seasonStartYear + 1,
    note: 'The next season remains a declared scenario until an accepted roster/transaction/development model is supplied.' };
  next.status = 'active';
  next.replay = { seed: next.setup.randomness.seed, committedSeasons: next.seasons.length };
  return next;
}

export function serializeSeasonLabLeagueState(state) {
  if (!state || state.format !== SEASON_LAB_LEAGUE_STATE_VERSION) fail('Season Lab league state is unavailable.');
  const serialized = stableJson(state);
  if (serialized.length > SEASON_LAB_LEAGUE_STATE_LIMITS.maxBytes) fail('Season Lab league state exceeds the bounded save size.');
  return serialized;
}

export function parseSeasonLabLeagueState(serialized) {
  if (typeof serialized !== 'string' || serialized.length > SEASON_LAB_LEAGUE_STATE_LIMITS.maxBytes) {
    fail('Saved Season Lab league state is invalid or too large.');
  }
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { fail('Saved Season Lab league state is not valid JSON.'); }
  if (!parsed || parsed.format !== SEASON_LAB_LEAGUE_STATE_VERSION || !parsed.setup || !Array.isArray(parsed.teams) || !Array.isArray(parsed.seasons)) {
    fail('Saved Season Lab league state has an unsupported shape.');
  }
  const normalized = validateSeasonLabSetup(parsed.setup);
  const expectedTeamIds = normalized.teams.map(team => team.id);
  if (stateTeamIds(parsed).join('|') !== expectedTeamIds.join('|')) fail('Saved Season Lab league teams do not match their setup.');
  if (parsed.seasons.length > SEASON_LAB_LEAGUE_STATE_LIMITS.maxSeasons
    || parsed.seasons.some(item => !integer(item?.seasonStartYear, 1900, 2200))) fail('Saved Season Lab league seasons are invalid.');
  const seasonYears = parsed.seasons.map(item => item.seasonStartYear);
  if (new Set(seasonYears).size !== seasonYears.length
    || seasonYears.some((year, index) => index > 0 && seasonYears[index - 1] >= year)) {
    fail('Saved Season Lab league seasons must be unique and ordered.');
  }
  if (!parsed.replay || parsed.replay.seed !== normalized.randomness.seed
    || parsed.replay.committedSeasons !== parsed.seasons.length) {
    fail('Saved Season Lab replay seed or committed-season count does not match its history.');
  }
  const expectedTeamIdSet = new Set(expectedTeamIds);
  for (const season of parsed.seasons) {
    const rowIds = Array.isArray(season?.standings) ? season.standings.map(row => String(row?.teamId || '')) : [];
    if (rowIds.length !== expectedTeamIdSet.size || rowIds.some(id => !expectedTeamIdSet.has(id))
      || new Set(rowIds).size !== rowIds.length) {
      fail('Saved Season Lab season standings do not match the persistent league teams.');
    }
    const decisionLog = Array.isArray(season.decisionLog) ? season.decisionLog : [];
    const expectedPolicyId = decisionPolicyIdFor(decisionLog);
    if ((season.decisionPolicyId || null) !== expectedPolicyId) fail('Saved Season Lab decision policy does not match its decision log.');
    const expectedReplayKey = replayKeyForSeason(normalized.randomness.seed, season.seasonStartYear, 1, decisionLog);
    if (season.replayKey !== expectedReplayKey) fail('Saved Season Lab season replay key does not match its seed and year.');
    if (season.progression) {
      const progression = season.progression;
      const noRosterMovesScenario = progression.advance?.noRosterMoves === true;
      if (progression.completedSeasonStartYear !== season.seasonStartYear
        || progression.nextSeasonStartYear !== season.seasonStartYear + 1
        || progression.offseason?.status !== 'not-modeled'
        || progression.continuity?.rosterCarriedForward !== noRosterMovesScenario
        || progression.continuity?.status !== (noRosterMovesScenario ? 'held-constant-no-roster-moves-scenario' : 'explicit-input-required')
        || (noRosterMovesScenario && !integer(progression.advance?.evidenceSeasonStartYear, 1900, season.seasonStartYear - 1))) {
        fail('Saved Season Lab progression receipt conflicts with its season output.');
      }
    }
  }
  if (!parsed.seasons.length) {
    if (parsed.status !== 'ready' || parsed.currentSeasonStartYear !== null
      || !Array.isArray(parsed.currentStandings) || parsed.currentStandings.length !== 0
      || parsed.offseason?.status !== 'not-modeled' || parsed.offseason.nextSeasonStartYear !== null) {
      fail('Saved Season Lab ready state has inconsistent current-season metadata.');
    }
  } else {
    const currentSeason = parsed.seasons.find(item => item.seasonStartYear === parsed.currentSeasonStartYear);
    if (parsed.status !== 'active' || !currentSeason
      || stableJson(parsed.currentStandings) !== stableJson(currentSeason.standings)
      || parsed.offseason?.status !== 'not-modeled'
      || parsed.offseason.nextSeasonStartYear !== parsed.currentSeasonStartYear + 1) {
      fail('Saved Season Lab current season, standings, or offseason cursor does not match its history.');
    }
  }
  return cloneStateValue(parsed);
}

function baseRoundRobin(ids) {
  const sorted = ordered(ids), ring = [...sorted];
  if (ring.length % 2) ring.push(null);
  const schedule = [];
  for (let round = 0; round < ring.length - 1; round += 1) {
    for (let pair = 0; pair < ring.length / 2; pair += 1) {
      const left = ring[pair], right = ring[ring.length - 1 - pair];
      if (left !== null && right !== null) schedule.push({ round: round + 1, home: (round + pair) % 2 ? right : left, away: (round + pair) % 2 ? left : right });
    }
    ring.splice(1, 0, ring.pop());
  }
  return schedule;
}

export function buildSeasonLabSchedule(teamIds, { gamesPerTeam = 82, kind = 'round-robin', games = [] } = {}) {
  const ids = ordered(teamIds);
  if (!ids.length || ids.length > SEASON_LAB_POLICY.maxTeams || new Set(ids).size !== ids.length) fail('Season Lab schedule teams are invalid.');
  if (kind !== 'round-robin') return buildActualSeasonSchedule(games, { teamIds: ids });
  if (!integer(gamesPerTeam, 1, SEASON_LAB_POLICY.maxGamesPerTeam)) fail('Season Lab games per team are invalid.');
  if (ids.length < 2) fail('Season Lab needs at least two teams to create a schedule.');
  if ((ids.length * gamesPerTeam) % 2 !== 0) fail('Round-robin schedules need an even number of total team appearances.');
  const base = baseRoundRobin(ids), roundsPerCycle = base.reduce((max, game) => Math.max(max, game.round), 0);
  const schedule = [];
  const counts = new Map(ids.map(id => [id, 0]));
  for (let cycle = 0; counts.values().some(count => count < gamesPerTeam); cycle += 1) {
    let added = 0;
    for (const game of base) {
      if (counts.get(game.home) >= gamesPerTeam || counts.get(game.away) >= gamesPerTeam) continue;
      const home = cycle % 2 ? game.away : game.home;
      const away = cycle % 2 ? game.home : game.away;
      schedule.push({ id: `g${schedule.length + 1}`, round: cycle * roundsPerCycle + game.round, home, away, phase: 'regular' });
      counts.set(home, counts.get(home) + 1); counts.set(away, counts.get(away) + 1); added += 1;
    }
    if (!added) fail('Round-robin schedule could not satisfy every team\'s games-per-team target.');
  }
  return schedule;
}

/**
 * Adapt a reviewed historical calendar into the bounded Season Lab schedule
 * contract. This accepts only already-sanitized team codes and game IDs; it
 * never reaches a provider or embeds provider IDs in the public model result.
 */
export function buildActualSeasonSchedule(records, { teamIds = [], seasonStartYear = null, phase = 'regular', scheduleId = null } = {}) {
  if (!Array.isArray(records) || !records.length) fail('An actual schedule needs declared game records.');
  const allowed = new Set(teamIds.map(String));
  const seen = new Set();
  const games = canonicalScheduleOrder(records.map((game, index) => {
    if (!game || !allowed.has(String(game.home)) || !allowed.has(String(game.away)) || game.home === game.away) {
      fail(`Actual schedule game ${index + 1} has invalid home/away teams.`);
    }
    const id = String(game.id || `g${index + 1}`).trim();
    if (!SEED.test(id) || seen.has(id)) fail('Actual schedule game IDs must be unique and bounded.');
    seen.add(id);
    const gamePhase = normalizedPhase(game.phase || phase);
    if (!SUPPORTED_PHASES.has(gamePhase)) fail(`Actual schedule game ${index + 1} has an unsupported phase.`);
    const scheduledAt = game.scheduledAt == null ? null : String(game.scheduledAt);
    if (scheduledAt !== null && !Number.isFinite(Date.parse(scheduledAt))) fail(`Actual schedule game ${index + 1} has an invalid scheduled time.`);
    const year = game.seasonStartYear == null ? seasonStartYear : Number(game.seasonStartYear);
    if (year !== null && !integer(year, 1900, 2200)) fail(`Actual schedule game ${index + 1} has an invalid season start year.`);
    const explicitStandingsEligibility = normalizeStandingsEligibility(game, gamePhase);
    return { id, round: integer(Number(game.round), 1) ? Number(game.round) : index + 1, home: String(game.home), away: String(game.away),
      seasonStartYear: year, phase: gamePhase, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      ...(explicitStandingsEligibility === null ? {} : { standingsEligible: explicitStandingsEligibility }) };
  }));
  const counts = new Map(teamIds.map(id => [String(id), 0]));
  games.forEach(game => { counts.set(game.home, counts.get(game.home) + 1); counts.set(game.away, counts.get(game.away) + 1); });
  return { kind: 'actual', scheduleId: scheduleId || null, gamesPerTeam: new Set(counts.values()).size === 1 ? [...counts.values()][0] : null, games };
}

function quantiles(values) {
  const sorted = [...values].filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return Object.fromEntries([5, 10, 25, 50, 75, 90, 95].map(percent => [percent, null]));
  return Object.fromEntries([5, 10, 25, 50, 75, 90, 95].map(percent => [percent,
    rounded(sorted[Math.max(0, Math.ceil(sorted.length * percent / 100) - 1)])]));
}

function summaryStats(values) {
  const finiteValues = values.filter(value => Number.isFinite(value));
  if (!finiteValues.length) return { mean: null, standardDeviation: null, minimum: null, maximum: null };
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  const variance = finiteValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / finiteValues.length;
  return { mean: rounded(mean), standardDeviation: rounded(Math.sqrt(variance)), minimum: rounded(Math.min(...finiteValues)), maximum: rounded(Math.max(...finiteValues)) };
}

function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (!integer(trials, 1) || !integer(successes, 0, trials)) return { lower: null, upper: null };
  const p = successes / trials, denominator = 1 + (z ** 2) / trials;
  const center = (p + (z ** 2) / (2 * trials)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) / trials) + (z ** 2) / (4 * trials ** 2));
  return { lower: rounded(clamp(center - margin, 0, 1)), upper: rounded(clamp(center + margin, 0, 1)) };
}

function isRegularTeamSeasonProfile(entry, season, teamCode) {
  const expectedTeam = String(teamCode || '').trim().toUpperCase();
  const observedTeam = String(entry?.teamCode || '').trim().toUpperCase();
  return Number(entry?.seasonStartYear) === Number(season)
    && normalizedPhase(entry?.phase) === 'regular'
    && String(entry?.scope || '').trim().toLowerCase() === 'team'
    && Boolean(expectedTeam) && observedTeam === expectedTeam;
}

function rotationUsage(team, season) {
  const profiles = team.seasonProfiles || {};
  const teamCode = team.teamCode || team.team || team.id;
  const profileRows = new Map();
  for (const [id, playerRows] of Object.entries(profiles)) {
    if (!Array.isArray(playerRows)) continue;
    const matching = playerRows.filter(item => isRegularTeamSeasonProfile(item, season, teamCode) && nonNegativeNumber(item?.minutes));
    if (!matching.length) continue;
    const minutes = matching.reduce((sum, item) => sum + Number(item.minutes), 0);
    const first = matching.find(item => item.playerName || item.player) || matching[0];
    profileRows.set(String(id), { id: String(id), name: first.playerName || first.player || id, minutes, segments: matching.length, source: 'season-profile' });
  }
  const supplied = new Map();
  if (team.roster && Array.isArray(team.roster.players)) {
    for (const player of team.roster.players) {
      if (!player?.id || !nonNegativeNumber(player.minutes)) continue;
      supplied.set(String(player.id), { id: String(player.id), name: player.name || player.id, minutes: Number(player.minutes), segments: 1, source: 'declared-roster' });
    }
  }
  // User-built/managed/custom minutes are the explicit user input. For an
  // actual roster, package season segments are preferred and aggregated so a
  // trade or split stint cannot silently overwrite the earlier segment.
  // Any explicitly non-actual roster mode is authoritative, including an
  // empty declaration. Falling back to package season segments here would
  // silently turn a user-built, managed, or custom team into an actual roster
  // when the declaration is incomplete. Keep that state unavailable so the
  // caller can repair the roster rather than mixing provenance.
  const useDeclared = Boolean(team.rosterMode && team.rosterMode !== 'actual');
  const unique = useDeclared ? supplied : (profileRows.size ? profileRows : supplied);
  const players = [...unique.values()].sort((a, b) => b.minutes - a.minutes || String(a.name).localeCompare(String(b.name)));
  const totalMinutes = players.reduce((sum, player) => sum + player.minutes, 0);
  const observedPlayers = players.length;
  const games = Number(team.seasonGames || 0);
  return { status: players.length ? 'observed' : 'unavailable', evidenceSeasonStartYear: season, observedPlayers, players: players.slice(0, 12).map(player => ({ ...player,
      share: totalMinutes ? rounded(player.minutes / totalMinutes) : null,
      minutesPerGame: games > 0 ? rounded(player.minutes / games) : null,
    })), totalMinutes: rounded(totalMinutes), source: players.length ? (useDeclared ? 'declared-roster' : profileRows.size ? 'season-profile-aggregated' : null) : null,
    note: players.length ? 'Rotation usage aggregates all matching season segments; the simulator does not invent injuries, substitutions, development, or fatigue.' : useDeclared ? 'The declared non-actual roster has no season-keyed player-minute evidence.' : 'No season-keyed roster-minute evidence was supplied.' };
}

const PLAYER_STAT_KEYS = Object.freeze(['points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks']);
const PLAYER_STAT_ALIASES = Object.freeze({
  points: ['points', 'pointsPerGame', 'pts', 'scoring'], assists: ['assists', 'assistsPerGame', 'ast'],
  rebounds: ['rebounds', 'reboundsPerGame', 'trb'], turnovers: ['turnovers', 'turnoversPerGame', 'tov'],
  steals: ['steals', 'stealsPerGame', 'stl'], blocks: ['blocks', 'blocksPerGame', 'blk'],
});

function playerNumber(source, aliases) {
  const objects = [source, source?.perGame, source?.stats, source?.metrics, source?.production];
  for (const objectValue of objects) {
    if (!objectValue || typeof objectValue !== 'object') continue;
    for (const alias of aliases) {
      const candidate = objectValue[alias];
      const value = candidate && typeof candidate === 'object' ? candidate.value : candidate;
      if (finite(Number(value), 0)) return Number(value);
    }
  }
  return null;
}

function playerTotal(source, key, aliases) {
  const totalAliases = [key, `${key}Total`, `${key}s`, ...aliases.map(alias => `${alias}Total`), ...aliases];
  const objects = [source?.totals, source?.box, source?.totalsBySeason, source?.stats, source?.metrics, source];
  for (const objectValue of objects) {
    if (!objectValue || typeof objectValue !== 'object') continue;
    for (const alias of totalAliases) {
      const candidate = objectValue[alias];
      const value = candidate && typeof candidate === 'object' ? (candidate.total ?? candidate.numerator ?? candidate.value) : candidate;
      if (finite(Number(value), 0)) return Number(value);
    }
  }
  const games = Number(source?.games || source?.appearances || 0);
  const rate = playerNumber(source, aliases);
  return finite(rate, 0) && games > 0 ? rate * games : null;
}

function largestRemainderAllocation(total, weights, integerTotal = true) {
  const target = Math.max(0, Number(total) || 0);
  const usable = weights.map(value => Math.max(0, Number(value) || 0));
  const sum = usable.reduce((acc, value) => acc + value, 0);
  if (!(sum > 0) || !usable.length) return usable.map(() => 0);
  const raw = usable.map(value => target * value / sum);
  if (!integerTotal) return raw.map(rounded);
  const floors = raw.map(value => Math.floor(value));
  let remainder = Math.max(0, Math.round(target) - floors.reduce((acc, value) => acc + value, 0));
  const order = raw.map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let cursor = 0; cursor < remainder; cursor += 1) floors[order[cursor % order.length].index] += 1;
  return floors;
}

// Allocate an integer total without exceeding any player's remaining season
// total.  The ordinary largest-remainder helper is appropriate for a single
// unconstrained split, but game-log generation is a chained allocation: a
// player who has already received his season total must not receive another
// point/assist/minute merely because the next game's active rotation is
// smaller.  Recomputing the bounded quotas after each capped pass keeps the
// result deterministic and guarantees that the per-player log sums remain
// equal to the season totals whenever the declared capacities are feasible.
function boundedLargestRemainderAllocation(total, weights, capacities) {
  const target = Math.max(0, Math.round(Number(total) || 0));
  const size = Array.isArray(weights) ? weights.length : 0;
  if (!size) return target === 0 ? [] : null;
  const caps = Array.isArray(capacities) && capacities.length === size
    ? capacities.map(value => Math.max(0, Math.floor(Number(value) || 0)))
    : Array.from({ length: size }, () => target);
  if (caps.reduce((sum, value) => sum + value, 0) < target) return null;
  const result = Array(size).fill(0);
  let remaining = target;
  while (remaining > 0) {
    const eligible = caps.map((capacity, index) => capacity > result[index] ? index : -1).filter(index => index >= 0);
    if (!eligible.length) return null;
    const positiveWeight = eligible.reduce((sum, index) => sum + Math.max(0, Number(weights[index]) || 0), 0);
    const quotaWeights = positiveWeight > 0
      ? eligible.map(index => Math.max(0, Number(weights[index]) || 0))
      : eligible.map(index => Math.max(1, caps[index] - result[index]));
    const weightTotal = quotaWeights.reduce((sum, value) => sum + value, 0);
    const raw = eligible.map((index, cursor) => ({ index, value: remaining * quotaWeights[cursor] / weightTotal }));
    let assigned = 0;
    for (const row of raw) {
      const room = caps[row.index] - result[row.index];
      const amount = Math.min(room, Math.floor(row.value));
      if (amount > 0) { result[row.index] += amount; assigned += amount; }
    }
    remaining -= assigned;
    if (remaining <= 0) break;
    // If every quota is below one (or a cap consumed every floor), use the
    // largest fractional remainder and stable index tiebreaker for the next
    // unit.  A cap-aware loop prevents an exhausted row from being selected.
    const candidates = raw.map(row => ({ ...row, fraction: row.value - Math.floor(row.value), room: caps[row.index] - result[row.index] }))
      .filter(row => row.room > 0)
      .sort((left, right) => right.fraction - left.fraction || right.value - left.value || left.index - right.index);
    if (!candidates.length) return null;
    const units = Math.min(remaining, candidates.length);
    for (let index = 0; index < units; index += 1) result[candidates[index].index] += 1;
    remaining -= units;
  }
  return result;
}

function playerSourceRows(payload, teamConfig, season) {
  const rows = [];
  const profileMap = payload?.seasonProfiles && typeof payload.seasonProfiles === 'object' ? payload.seasonProfiles : {};
  if (teamConfig.rosterMode === 'actual') {
    const teamCode = teamConfig.teamCode || teamConfig.id || payload?.team;
    for (const [id, entries] of Object.entries(profileMap)) {
      if (!Array.isArray(entries)) continue;
      const matching = entries.filter(entry => isRegularTeamSeasonProfile(entry, season, teamCode) && nonNegativeNumber(entry?.minutes));
      if (!matching.length) continue;
      const minutes = matching.reduce((sum, entry) => sum + Number(entry.minutes), 0);
      const games = matching.reduce((sum, entry) => sum + Math.max(0, Number(entry.games || entry.appearances || 0)), 0);
      const first = matching[0];
      const gameDenominator = matching.reduce((sum, entry) => sum + Math.max(0, Number(entry.games || entry.appearances || 0)), 0);
      const totals = Object.fromEntries(PLAYER_STAT_KEYS.map(key => {
        const values = matching.map(entry => playerTotal(entry, key, PLAYER_STAT_ALIASES[key]));
        return [key, values.every(value => finite(value, 0)) ? values.reduce((sum, value) => sum + value, 0) : null];
      }));
      rows.push({ id: String(id), name: first.playerName || first.player || id, minutes, games, source: 'observed-season-profile', sourceRows: matching.length,
        totals, perGame: Object.fromEntries(PLAYER_STAT_KEYS.map(key => [key, totals[key] !== null && gameDenominator > 0
          ? totals[key] / gameDenominator : matching.some(entry => playerNumber(entry, PLAYER_STAT_ALIASES[key]) !== null)
            ? matching.reduce((sum, entry) => sum + (playerNumber(entry, PLAYER_STAT_ALIASES[key]) || 0) * Number(entry.games || 0), 0) / Math.max(1, gameDenominator) : null])) });
    }
  }
  if (teamConfig.rosterMode !== 'actual' && teamConfig.roster?.players) {
    for (const player of teamConfig.roster.players) {
      const id = String(player?.id || '').trim();
      if (!id) continue;
      rows.push({ id, name: player.name || id, minutes: nonNegativeNumber(player.minutes) ? Number(player.minutes) : null,
        games: integer(Number(player.games), 0, 300) ? Number(player.games) : null, source: 'declared-roster', sourceRows: 1,
        totals: Object.fromEntries(PLAYER_STAT_KEYS.map(key => [key, playerTotal(player, key, PLAYER_STAT_ALIASES[key])])),
        perGame: Object.fromEntries(PLAYER_STAT_KEYS.map(key => [key, playerNumber(player, PLAYER_STAT_ALIASES[key])])) });
    }
  }
  return rows.sort((a, b) => (b.minutes || 0) - (a.minutes || 0) || a.id.localeCompare(b.id));
}

function teamSourceGames(payload, season) {
  const profile = (payload?.nativeProfiles || []).find(item => Number(item?.seasonStartYear) === season && normalizedPhase(item?.phase) === 'regular');
  const denominator = Number(profile?.metrics?.pointsPerGame?.denominator ?? profile?.games);
  return integer(denominator, 1, 300) ? denominator : null;
}

function buildPlayerSeasonStats({ payload, teamConfig, season, teamGames, teamPoints, replayKey }) {
  const rows = playerSourceRows(payload, teamConfig, season);
  if (!rows.length || !integer(teamGames, 1) || !finite(teamPoints, 0)) {
    return { status: 'unavailable', evidenceSeasonStartYear: season, players: [], teamTotals: { points: null, assists: null, rebounds: null, turnovers: null, steals: null, blocks: null, minutes: null }, reconciliation: {}, source: null,
      note: 'Player statistics require season-keyed roster production and a simulated team schedule; no player totals are invented.' };
  }
  const minuteTarget = teamGames * 240;
  const minuteWeights = rows.map(row => row.minutes ?? 0);
  if (minuteWeights.every(value => !(value > 0))) minuteWeights.fill(1);
  const minutes = largestRemainderAllocation(minuteTarget, minuteWeights);
  const statTargets = { points: Math.round(teamPoints) };
  const statSources = { points: 'simulated-team-score-total' };
  const statAllocationFallbacks = Object.fromEntries(PLAYER_STAT_KEYS.map(key => [key, null]));
  const sourceTeamGames = teamSourceGames(payload, season);
  const scale = sourceTeamGames ? teamGames / sourceTeamGames : 1;
  for (const key of PLAYER_STAT_KEYS.filter(value => value !== 'points')) {
    const historicalTotals = rows.map(row => finite(row.totals?.[key], 0) ? row.totals[key]
      : finite(row.perGame?.[key], 0) && integer(row.games, 1, 300) ? row.perGame[key] * row.games : null);
    const availableCount = historicalTotals.filter(value => finite(value, 0)).length;
    if (!availableCount) { statTargets[key] = null; statSources[key] = null; continue; }
    // A missing player metric is not an observed zero.  Summing only the
    // rows that happen to report a value would understate the team target and
    // make the missing player look like a confirmed zero in every game log.
    // Keep the metric explicitly unavailable until every selected player has
    // a defensible season total or per-game denominator.
    if (availableCount < rows.length) {
      statTargets[key] = null;
      statSources[key] = 'unavailable-partial-player-coverage';
      continue;
    }
    const target = historicalTotals.reduce((sum, value) => sum + (finite(value, 0) ? value : 0), 0) * scale;
    statTargets[key] = Math.max(0, Math.round(target));
    statSources[key] = sourceTeamGames ? 'historical-player-totals-scaled-to-simulated-team-schedule' : 'historical-player-totals-at-simulated-schedule';
  }
  const statAllocations = Object.fromEntries(PLAYER_STAT_KEYS.map(key => {
    if (statTargets[key] === null) return [key, rows.map(() => null)];
    const weights = rows.map((row, index) => {
      const total = finite(row.totals?.[key], 0) ? Math.max(0, row.totals[key])
        : finite(row.perGame?.[key], 0) && integer(row.games, 1, 300) ? Math.max(0, row.perGame[key] * row.games) : null;
      // Points are always constrained to the simulated team score. If a
      // player's point production is absent, allocate a modeled share by
      // minutes rather than silently assigning that player zero points. A
      // reported zero remains a real zero and is not replaced.
      if (total === null && key === 'points') {
        statAllocationFallbacks.points = 'minutes-for-missing-player-production';
        return Math.max(1, minutes[index]);
      }
      return total === null ? 0 : total;
    });
    return [key, largestRemainderAllocation(statTargets[key], weights.some(value => value > 0) ? weights : minuteWeights)];
  }));
  const players = rows.map((row, index) => {
    const playerGames = integer(row.games, 1, 300) && sourceTeamGames
      ? clamp(Math.round(row.games * scale), 1, teamGames) : integer(row.games, 1, 300) ? Math.min(teamGames, row.games) : teamGames;
    const totals = Object.fromEntries(PLAYER_STAT_KEYS.map(key => [key, statAllocations[key][index]]));
    const perGame = Object.fromEntries(PLAYER_STAT_KEYS.map(key => [key, totals[key] === null ? null : rounded(totals[key] / Math.max(1, playerGames))]));
    return { id: row.id, name: row.name, games: playerGames, minutes: minutes[index], minutesPerGame: rounded(minutes[index] / teamGames), totals, perGame,
      source: row.source, sourceRows: row.sourceRows, historicalPerGame: row.perGame };
  });
  const reconciliation = Object.fromEntries(PLAYER_STAT_KEYS.map(key => {
    const target = statTargets[key], sum = target === null ? null : players.reduce((total, player) => total + Number(player.totals[key] || 0), 0);
    return [key, { status: target === null ? 'unavailable' : sum === target ? 'reconciled' : 'mismatch', target, sum, delta: target === null ? null : sum - target, source: statSources[key] }];
  }));
  const minutesSum = players.reduce((sum, player) => sum + player.minutes, 0);
  reconciliation.minutes = { status: minutesSum === minuteTarget ? 'reconciled' : 'mismatch', target: minuteTarget, sum: minutesSum, delta: minutesSum - minuteTarget, source: 'rotation-240-minute-constraint' };
  return { status: Object.values(reconciliation).some(item => item.status === 'mismatch') ? 'invalid' : Object.values(reconciliation).some(item => item.status === 'unavailable') ? 'partial' : 'reconciled',
    evidenceSeasonStartYear: season,
    players, teamTotals: { ...statTargets, minutes: minuteTarget }, reconciliation, source: 'historical-production-constrained-to-team-totals-v2',
    allocationFallbacks: statAllocationFallbacks,
    sourceTeamGames, scheduleScale: rounded(scale), replayKey: replayKey || null,
    note: 'Player totals preserve observed production shares, scale to the simulated team schedule when a package team-game denominator exists, and reconcile exactly to simulated team points plus every available historical stat target. Missing denominators remain unavailable rather than being fabricated.' };
}

function evenlyScheduledAppearance(index, targetGames, totalGames) {
  if (!(targetGames > 0) || !(totalGames > 0)) return false;
  return Math.floor(((index + 1) * targetGames) / totalGames) > Math.floor((index * targetGames) / totalGames);
}

function buildPlayerGameLogs({ games, setup, playerStatsByTeam }) {
  const logsByTeam = new Map();
  const statKeys = PLAYER_STAT_KEYS;
  for (const team of setup.teams) {
    const teamGames = games.filter(game => game.homeTeamId === team.id || game.awayTeamId === team.id);
    const stats = playerStatsByTeam.get(team.id);
    if (!stats?.players?.length || !teamGames.length || stats.status === 'unavailable') {
      logsByTeam.set(team.id, { status: 'unavailable', games: [], reconciliation: null, note: 'Player game logs require reconciled season player totals and a declared game schedule.' });
      continue;
    }
    const players = stats.players;
    const totalGames = teamGames.length;
    const remainingMinutes = players.map(player => Number(player.minutes) || 0);
    const remainingTotals = Object.fromEntries(statKeys.map(key => [key, players.map(player => player.totals[key] === null ? null : Number(player.totals[key]) || 0)]));
    const gameTargets = Object.fromEntries(statKeys.map(key => {
      const target = stats.teamTotals[key];
      if (target === null || target === undefined) return [key, null];
      if (key === 'points') return [key, teamGames.map(game => Number(game.homeTeamId === team.id ? game.scoreHome : game.scoreAway) || 0)];
      return [key, largestRemainderAllocation(target, teamGames.map((game, index) => {
        const score = Number(game.homeTeamId === team.id ? game.scoreHome : game.scoreAway) || 0;
        return Math.max(1, score) * (1 + (index % 5) * 0.01);
      }))];
    }));
    const teamLogs = [];
    let invalidReason = null;
    let expandedRotationGames = 0;
    for (let gameIndex = 0; gameIndex < teamGames.length; gameIndex += 1) {
      const game = teamGames[gameIndex];
      const scheduledRows = players.map((player, playerIndex) => ({ player, playerIndex }))
        .filter(({ player }) => evenlyScheduledAppearance(gameIndex, Math.min(totalGames, Math.max(0, Number(player.games) || totalGames)), totalGames));
      const activeMap = new Map(scheduledRows.map(row => [row.playerIndex, row]));
      const addCapacityRows = predicate => {
        for (const row of players.map((player, playerIndex) => ({ player, playerIndex }))) {
          if (!activeMap.has(row.playerIndex) && predicate(row.playerIndex)) activeMap.set(row.playerIndex, row);
        }
      };
      // A declared games count is an availability hint, not permission to
      // discard observed totals. If a scheduled appearance cannot carry the
      // remaining season production, add the players who still have capacity
      // before allocating minutes. This preserves exact player totals while
      // exposing the fallback instead of silently over-allocating a teammate.
      for (const key of statKeys) {
        const target = gameTargets[key]?.[gameIndex];
        if (target === null || target === undefined || target <= 0) continue;
        const activeCapacity = [...activeMap.keys()].reduce((sum, index) => sum + Math.max(0, remainingTotals[key]?.[index] || 0), 0);
        if (activeCapacity < target) {
          addCapacityRows(index => Math.max(0, remainingTotals[key]?.[index] || 0) > 0);
          expandedRotationGames += 1;
        }
      }
      const minuteCapacity = [...activeMap.keys()].reduce((sum, index) => sum + Math.max(0, remainingMinutes[index]), 0);
      if (minuteCapacity < 240) {
        addCapacityRows(index => remainingMinutes[index] > 0);
        expandedRotationGames += 1;
      }
      if (!activeMap.size) addCapacityRows(index => remainingMinutes[index] > 0 || statKeys.some(key => remainingTotals[key]?.[index] > 0));
      const activeRows = [...activeMap.values()];
      const minuteWeights = activeRows.map(({ playerIndex }) => Math.max(0, remainingMinutes[playerIndex]));
      const safeMinuteWeights = minuteWeights.some(value => value > 0) ? minuteWeights : activeRows.map(() => 1);
      let minuteAllocation = boundedLargestRemainderAllocation(240, safeMinuteWeights, minuteWeights);
      if (!minuteAllocation) {
        invalidReason ||= 'Declared player minute capacities cannot satisfy the 240-minute game constraint.';
        minuteAllocation = largestRemainderAllocation(240, safeMinuteWeights);
      }
      activeRows.forEach(({ playerIndex }, cursor) => { remainingMinutes[playerIndex] = Math.max(0, remainingMinutes[playerIndex] - minuteAllocation[cursor]); });
      const linePlayers = players.map((player, playerIndex) => ({ id: player.id, name: player.name, minutes: 0,
        totals: Object.fromEntries(statKeys.map(key => [key, stats.teamTotals[key] === null ? null : 0])), perGame: Object.fromEntries(statKeys.map(key => [key, stats.teamTotals[key] === null ? null : 0])) })).map((player, playerIndex) => {
        const cursor = activeRows.findIndex(row => row.playerIndex === playerIndex);
        player.minutes = cursor >= 0 ? minuteAllocation[cursor] : 0;
        return player;
      });
      for (const key of statKeys) {
        const target = gameTargets[key]?.[gameIndex];
        if (target === null || target === undefined) continue;
        const weights = activeRows.map(({ playerIndex }) => Math.max(0, remainingTotals[key]?.[playerIndex] || 0));
        const safeWeights = weights.some(value => value > 0) ? weights : activeRows.map(({ playerIndex }) => Math.max(1, minuteAllocation[activeRows.findIndex(row => row.playerIndex === playerIndex)]));
        let allocation = boundedLargestRemainderAllocation(target, safeWeights, weights);
        if (!allocation) {
          invalidReason ||= `Player ${key} capacities cannot satisfy the game target.`;
          allocation = largestRemainderAllocation(target, safeWeights);
        }
        activeRows.forEach(({ playerIndex }, cursor) => {
          linePlayers[playerIndex].totals[key] = allocation[cursor];
          linePlayers[playerIndex].perGame[key] = allocation[cursor];
          if (remainingTotals[key]?.[playerIndex] !== null && remainingTotals[key]?.[playerIndex] !== undefined) remainingTotals[key][playerIndex] = Math.max(0, remainingTotals[key][playerIndex] - allocation[cursor]);
        });
      }
      const score = Number(game.homeTeamId === team.id ? game.scoreHome : game.scoreAway) || 0;
      const opponentId = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId;
      teamLogs.push({ gameId: game.id, round: game.round, phase: game.phase, teamId: team.id, team: team.name,
        opponentId, opponent: game.homeTeamId === team.id ? game.away : game.home, home: game.homeTeamId === team.id,
        score, opponentScore: game.homeTeamId === team.id ? game.scoreAway : game.scoreHome, players: linePlayers,
        reconciliation: Object.fromEntries(statKeys.map(key => [key, gameTargets[key]?.[gameIndex] == null ? null : {
          target: gameTargets[key][gameIndex], sum: linePlayers.reduce((sum, player) => sum + Number(player.totals[key] || 0), 0),
          status: linePlayers.reduce((sum, player) => sum + Number(player.totals[key] || 0), 0) === gameTargets[key][gameIndex] ? 'reconciled' : 'mismatch' }])),
      });
    }
    const seasonSums = Object.fromEntries(statKeys.map(key => [key, teamLogs.reduce((sum, game) => sum + game.players.reduce((inner, player) => inner + Number(player.totals[key] || 0), 0), 0)]));
    const seasonAudit = Object.fromEntries(statKeys.map(key => [key, stats.teamTotals[key] === null ? { status: 'unavailable', target: null, sum: seasonSums[key] } : {
      status: seasonSums[key] === stats.teamTotals[key] ? 'reconciled' : 'mismatch', target: stats.teamTotals[key], sum: seasonSums[key], delta: seasonSums[key] - stats.teamTotals[key] }]));
    const playerReconciliation = Object.fromEntries(players.map((player, playerIndex) => {
      const rows = Object.fromEntries(statKeys.map(key => {
        const target = player.totals[key];
        const sum = teamLogs.reduce((total, game) => total + Number(game.players[playerIndex]?.totals[key] || 0), 0);
        return [key, target === null ? { status: 'unavailable', target: null, sum } : { status: sum === target ? 'reconciled' : 'mismatch', target, sum, delta: sum - target }];
      }));
      const minuteSum = teamLogs.reduce((total, game) => total + Number(game.players[playerIndex]?.minutes || 0), 0);
      rows.minutes = { status: minuteSum === player.minutes ? 'reconciled' : 'mismatch', target: player.minutes, sum: minuteSum, delta: minuteSum - player.minutes };
      return [player.id, rows];
    }));
    const playerMismatch = Object.values(playerReconciliation).some(row => Object.values(row).some(item => item.status === 'mismatch'));
    const invalid = Boolean(invalidReason) || Object.values(seasonAudit).some(item => item.status === 'mismatch') || playerMismatch;
    logsByTeam.set(team.id, { status: invalid ? 'invalid' : 'reconciled', games: teamLogs, reconciliation: seasonAudit, playerReconciliation,
      diagnostics: { expandedRotationGames, invalidReason },
      note: invalid ? 'Player game-log allocation could not preserve every declared player total; the result is marked invalid for repair.' : 'Game logs are a deterministic, capacity-bounded allocation of reconciled season totals. They preserve each simulated team score and each player season total without inventing injuries, fatigue, or unavailable stats.' });
  }
  return logsByTeam;
}

function nativeMetrics(evidence, { teamId = evidence?.teamId || null, season = evidence?.season ?? null, source = null } = {}) {
  const nativeRate = evidence.kind === 'native-rate' || evidence.kind === 'forecast-rate';
  const forecastRate = evidence.kind === 'forecast-rate';
  const sample = evidence.sample || {};
  const defaultStatus = forecastRate ? 'projected-rate' : nativeRate ? 'native-rate' : 'observed';
  const metric = (value, unit, status = nativeRate ? defaultStatus : 'observed') => ({ value: rounded(value), unit, status });
  return { offense: metric(sample.offensiveRating, nativeRate ? 'points-per-100' : 'points-per-100-possessions'),
    defense: metric(sample.defensiveRating, nativeRate ? 'points-per-100' : 'opponent-points-per-100-possessions'),
    net: metric(sample.netRating, nativeRate ? 'points-per-100' : 'points-per-100-possessions'),
    pace48: metric(sample.pace48, 'possessions-per-48-game-minutes', sample.paceStatus || (nativeRate ? defaultStatus : 'unavailable')),
    pointsPerGame: metric(sample.pointsPerGame, 'points-per-game', sample.pointsPerGameStatus || (nativeRate ? defaultStatus : 'unavailable')),
    pointsAllowedPerGame: metric(sample.pointsAllowedPerGame, 'points-per-game', sample.pointsAllowedPerGameStatus || (nativeRate ? defaultStatus : 'unavailable')),
    fourFactors: sample.fourFactors || null,
    phase: evidence.selectedPhase || 'regular', phaseFallback: evidence.phaseFallback === true,
    scope: { teamId, seasonStartYear: season != null && Number.isInteger(Number(season)) ? Number(season) : null,
      ...(evidence?.season != null && Number(evidence.season) !== Number(season) ? { evidenceSeasonStartYear: Number(evidence.season) } : {}),
      requestedPhase: evidence.requestedPhase || null, selectedPhase: evidence.selectedPhase || null,
      phaseFallback: evidence.phaseFallback === true, snapshot: evidence.snapshot || null,
      packageRef: evidence.packageRef || null,
      sourceReceipt: evidence.sourceReceipt || sourceReceiptForSeason(source, season) },
    sample: { games: sample.games ?? null, offensePossessions: sample.offensePossessions ?? null, defensePossessions: sample.defensePossessions ?? null },
    note: forecastRate ? 'Projected team-style metrics are conditional inputs from the accepted projection model; simulated scoring remains a separate scenario result.'
      : source?.kind === 'year-advance-scenario' ? `The ${evidence?.season ?? 'selected'} native rates are held constant for this later-season no-roster-moves scenario; the result does not model offseason changes.`
        : 'Native team-style metrics are reported from the selected package evidence; simulated scoring remains a separate scenario result.' };
}

function nativeMetricValue(profile, key, unit = null, allowProjected = false) {
  const metric = profile?.metrics?.[key];
  // Forecast inputs must be declared projections. Allowing an observed/native
  // metric merely because the caller set allowProjected would silently leak a
  // completed season into an upcoming-season result.
  const accepted = allowProjected ? metric?.status === 'projected' : metric?.status === 'available';
  return accepted && (!unit || metric.unit === unit) && finite(metric.value) ? metric.value : null;
}

const FOUR_FACTOR_KEYS = Object.freeze({
  offense: Object.freeze(['effectiveFieldGoal', 'freeThrowAttemptRate', 'offensiveReboundRate', 'turnoverRate']),
  defense: Object.freeze(['opponentEffectiveFieldGoal', 'opponentFreeThrowAttemptRate', 'defensiveReboundRate', 'opponentTurnoverRate']),
});

// Transparent fallback anchors are only used when a selected package omits a
// factor.  They are deliberately ordinary league values, not a replacement
// for the package's observed metrics.  Every output below carries coverage so
// callers can tell whether the interaction was fully observed or partial.
const FOUR_FACTOR_DEFAULTS = Object.freeze({
  offense: Object.freeze({ effectiveFieldGoal: 0.53, freeThrowAttemptRate: 0.22, offensiveReboundRate: 0.28, turnoverRate: 0.13 }),
  defense: Object.freeze({ opponentEffectiveFieldGoal: 0.53, opponentFreeThrowAttemptRate: 0.22, defensiveReboundRate: 0.70, opponentTurnoverRate: 0.13 }),
});
const FOUR_FACTOR_WEIGHTS = Object.freeze({
  effectiveFieldGoal: 0.40,
  freeThrowAttemptRate: 0.15,
  offensiveReboundRate: 0.20,
  turnoverRate: 0.25,
});
const FOUR_FACTOR_SCALE = Object.freeze({
  effectiveFieldGoal: 0.05,
  freeThrowAttemptRate: 0.05,
  offensiveReboundRate: 0.05,
  turnoverRate: 0.03,
});

function fourFactorBaseKey(key) {
  return key === 'opponentEffectiveFieldGoal' ? 'effectiveFieldGoal'
    : key === 'opponentFreeThrowAttemptRate' ? 'freeThrowAttemptRate'
      : key === 'defensiveReboundRate' ? 'offensiveReboundRate'
        : key === 'opponentTurnoverRate' ? 'turnoverRate' : key;
}

function factorDescriptor(evidence, side, key) {
  const descriptor = evidence?.sample?.fourFactors?.[side]?.[key];
  const value = Number(descriptor?.value);
  const upper = key === 'freeThrowAttemptRate' || key === 'opponentFreeThrowAttemptRate' ? 1.5 : 1;
  return descriptor && descriptor.status !== 'unavailable' && finite(value) && value >= 0 && value <= upper
    ? descriptor
    : null;
}

function factorBaselineValue(context, side, key) {
  const candidate = context?.baselineFourFactors?.[side]?.[key];
  return finite(Number(candidate)) ? Number(candidate) : FOUR_FACTOR_DEFAULTS[side][key];
}

function factorQuality(evidence, side, context) {
  const values = {}, effectiveValues = {}, contributions = [], observed = [], imputed = [];
  const totalWeight = FOUR_FACTOR_KEYS[side].reduce((sum, key) => sum + FOUR_FACTOR_WEIGHTS[fourFactorBaseKey(key)], 0);
  let observedWeight = 0;
  for (const key of FOUR_FACTOR_KEYS[side]) {
    const descriptor = factorDescriptor(evidence, side, key);
    const value = descriptor ? Number(descriptor.value) : null;
    const baseline = factorBaselineValue(context, side, key);
    const weight = FOUR_FACTOR_WEIGHTS[fourFactorBaseKey(key)];
    values[key] = value;
    effectiveValues[key] = value === null ? baseline : value;
    if (value === null) {
      // Baseline imputation contributes zero deviation while retaining the
      // factor's declared share of the full correction weight.
      imputed.push(key);
      contributions.push({ key, value: baseline, baseline, contribution: 0, weight, observed: false });
      continue;
    }
    const direction = key === 'turnoverRate' && side === 'offense' ? -1
      : key === 'opponentEffectiveFieldGoal' || key === 'opponentFreeThrowAttemptRate' ? -1
        : key === 'defensiveReboundRate' || key === 'opponentTurnoverRate' ? 1 : 1;
    const baseKey = fourFactorBaseKey(key);
    const scale = FOUR_FACTOR_SCALE[baseKey];
    const contribution = direction * (value - baseline) / scale;
    contributions.push({ key, value, baseline, contribution, weight, observed: true });
    observed.push(key);
    observedWeight += weight;
  }
  const quality = totalWeight > 0 ? contributions.reduce((sum, item) => sum + item.contribution * item.weight, 0) / totalWeight : 0;
  const boundedQuality = clamp(quality, -3, 3);
  const weightedCoverage = totalWeight > 0 ? observedWeight / totalWeight : 0;
  const qualityUncertainty = Math.min(3, (1 - weightedCoverage) * 3);
  return { quality: boundedQuality, qualityUncertainty,
    qualityRange: { lower: clamp(boundedQuality - qualityUncertainty, -3, 3), upper: clamp(boundedQuality + qualityUncertainty, -3, 3) },
    values, effectiveValues, observedKeys: observed, imputedKeys: imputed,
    coverage: observed.length / FOUR_FACTOR_KEYS[side].length, weightedCoverage,
    imputationPolicy: 'missing-factor-league-baseline-zero-contribution-v1',
    status: observed.length === FOUR_FACTOR_KEYS[side].length ? 'observed' : observed.length ? 'partial' : 'unavailable' };
}

/**
 * Convert the four factors into a small matchup-specific rate correction.
 * Team offense and opponent defense are both used, so the same native net
 * rating does not make every matchup interchangeable.  The correction is
 * intentionally modest because the published offense/defense rates already
 * summarize much of the same information.
 */
function nativeFourFactorMatchup(first, second, leagueContext) {
  const offenseA = factorQuality(first, 'offense', leagueContext);
  const defenseA = factorQuality(first, 'defense', leagueContext);
  const offenseB = factorQuality(second, 'offense', leagueContext);
  const defenseB = factorQuality(second, 'defense', leagueContext);
  const adjustmentA = NATIVE_FOUR_FACTOR_POINTS_SCALE * (offenseA.quality - defenseB.quality);
  const adjustmentB = NATIVE_FOUR_FACTOR_POINTS_SCALE * (offenseB.quality - defenseA.quality);
  const adjustmentRange = (offense, defense) => ({
    lower: rounded(NATIVE_FOUR_FACTOR_POINTS_SCALE * (offense.qualityRange.lower - defense.qualityRange.upper)),
    upper: rounded(NATIVE_FOUR_FACTOR_POINTS_SCALE * (offense.qualityRange.upper - defense.qualityRange.lower)),
  });
  return {
    status: [offenseA, defenseA, offenseB, defenseB].every(item => item.status === 'observed') ? 'observed'
      : [offenseA, defenseA, offenseB, defenseB].some(item => item.status !== 'unavailable') ? 'partial' : 'unavailable',
    adjustmentA: rounded(adjustmentA), adjustmentB: rounded(adjustmentB),
    offenseQualityA: rounded(offenseA.quality), defenseQualityA: rounded(defenseA.quality),
    offenseQualityB: rounded(offenseB.quality), defenseQualityB: rounded(defenseB.quality),
    coverage: { offenseA: rounded(offenseA.coverage), defenseA: rounded(defenseA.coverage), offenseB: rounded(offenseB.coverage), defenseB: rounded(defenseB.coverage) },
    weightedCoverage: { offenseA: rounded(offenseA.weightedCoverage), defenseA: rounded(defenseA.weightedCoverage),
      offenseB: rounded(offenseB.weightedCoverage), defenseB: rounded(defenseB.weightedCoverage) },
    imputedKeys: { offenseA: offenseA.imputedKeys, defenseA: defenseA.imputedKeys,
      offenseB: offenseB.imputedKeys, defenseB: defenseB.imputedKeys },
    qualityUncertainty: { offenseA: rounded(offenseA.qualityUncertainty), defenseA: rounded(defenseA.qualityUncertainty),
      offenseB: rounded(offenseB.qualityUncertainty), defenseB: rounded(defenseB.qualityUncertainty) },
    qualityRanges: { offenseA: { lower: rounded(offenseA.qualityRange.lower), upper: rounded(offenseA.qualityRange.upper) },
      defenseA: { lower: rounded(defenseA.qualityRange.lower), upper: rounded(defenseA.qualityRange.upper) },
      offenseB: { lower: rounded(offenseB.qualityRange.lower), upper: rounded(offenseB.qualityRange.upper) },
      defenseB: { lower: rounded(defenseB.qualityRange.lower), upper: rounded(defenseB.qualityRange.upper) } },
    adjustmentUncertainty: { a: rounded(NATIVE_FOUR_FACTOR_POINTS_SCALE * (offenseA.qualityUncertainty + defenseB.qualityUncertainty)),
      b: rounded(NATIVE_FOUR_FACTOR_POINTS_SCALE * (offenseB.qualityUncertainty + defenseA.qualityUncertainty)) },
    adjustmentRanges: { a: adjustmentRange(offenseA, defenseB), b: adjustmentRange(offenseB, defenseA) },
    imputationPolicy: 'missing-factor-league-baseline-zero-contribution-v1',
    observedKeys: { offenseA: offenseA.observedKeys, defenseA: defenseA.observedKeys, offenseB: offenseB.observedKeys, defenseB: defenseB.observedKeys },
  };
}

function nativeFourFactorMetrics(profile, allowProjected = false) {
  const source = profile?.metrics?.fourFactors;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const read = descriptor => {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
      || !(allowProjected ? descriptor.status === 'projected' : descriptor.status === 'available')
      || !finite(Number(descriptor.value))) {
      return { status: 'unavailable', value: null, unit: descriptor?.unit || null, numerator: null, denominator: null, coverage: descriptor?.coverage || null, evidenceKind: descriptor?.evidenceKind || null };
    }
    return { status: descriptor.status === 'projected' ? 'projected' : 'observed', value: rounded(Number(descriptor.value)), unit: descriptor.unit || null,
      numerator: finite(Number(descriptor.numerator)) ? Number(descriptor.numerator) : null,
      denominator: finite(Number(descriptor.denominator)) ? Number(descriptor.denominator) : null,
      coverage: descriptor.coverage || null, evidenceKind: descriptor.evidenceKind || null };
  };
  const side = name => Object.fromEntries(FOUR_FACTOR_KEYS[name].map(key => [key, read(source[name]?.[key])]));
  return { offense: side('offense'), defense: side('defense'), defenseConvention: typeof source.defenseConvention === 'string' ? source.defenseConvention : null };
}

export function nativeTeamEvidence(payload, season, requestedPhase = 'regular', { allowProjected = false, evidenceSeasonStartYear = season } = {}) {
  const evidenceSeason = Number.isSafeInteger(Number(evidenceSeasonStartYear)) ? Number(evidenceSeasonStartYear) : season;
  const phase = normalizedPhase(requestedPhase);
  if (!SUPPORTED_PHASES.has(phase)) {
    return { status: 'unavailable', team: payload?.team || null, season, requestedPhase: phase, selectedPhase: null, phaseFallback: false,
      snapshot: payload?.snapshot || null, packageRef: null,
      reason: `Unsupported native season phase ${phase}; choose regular, in_season_tournament, play_in, or playoffs.` };
  }
  const rows = Array.isArray(payload.nativeProfiles) ? payload.nativeProfiles : [];
  const profilesFor = selectedPhase => rows.filter(row => Number(row?.seasonStartYear) === evidenceSeason && normalizedPhase(row?.phase) === selectedPhase);
  const exactProfiles = profilesFor(phase);
  if (exactProfiles.length > 1) {
    return { status: 'unavailable', team: payload?.team || null, season, requestedPhase: phase, selectedPhase: null,
      phaseFallback: false, snapshot: payload?.snapshot || null, packageRef: null,
      reason: `Multiple native team-style rate profiles are available for ${payload.team} in ${evidenceSeason} (${phase}); the package is ambiguous.` };
  }
  let profile = exactProfiles[0] || null;
  let phaseFallback = false;
  if (!profile && phase !== 'regular') {
    const regularProfiles = profilesFor('regular');
    if (regularProfiles.length > 1) {
      return { status: 'unavailable', team: payload?.team || null, season, requestedPhase: phase, selectedPhase: null,
        phaseFallback: false, snapshot: payload?.snapshot || null, packageRef: null,
        reason: `Multiple native team-style regular profiles are available for ${payload.team} in ${evidenceSeason}; the phase fallback is ambiguous.` };
    }
    profile = regularProfiles[0] || null;
    phaseFallback = Boolean(profile);
  }
  const packageRef = profile?.packageRef && typeof profile.packageRef === 'object' ? { ...profile.packageRef } : null;
  const snapshot = packageRef?.packageId && packageRef?.packageVersion
    ? `${packageRef.packageId}@${packageRef.packageVersion}`
    : payload?.snapshot || null;
  const evidenceScope = { team: payload?.team || null, season: evidenceSeason, requestedPhase: phase,
    ...(evidenceSeason === season ? {} : { simulationSeasonStartYear: season }),
    selectedPhase: profile ? String(profile.phase || 'regular') : null, phaseFallback, snapshot, packageRef };
  const profileEvidenceMarkers = [profile?.evidenceKind, profile?.evidence, profile?.provenance?.evidenceKind,
    profile?.provenance?.evidence, profile?.provenance?.kind].filter(value => typeof value === 'string').join('|').toLowerCase();
  const profileCarriesObservedEvidence = profile?.observed === true || profile?.provenance?.observed === true
    || profileEvidenceMarkers.includes('observed') || profileEvidenceMarkers.includes('native');
  if (allowProjected && (payload?.packageRef || (Array.isArray(payload?.packageRefs) && payload.packageRefs.length)
    || profile?.packageRef || profileCarriesObservedEvidence)) {
    return { ...evidenceScope, status: 'unavailable',
      reason: `Forecast evidence for ${payload.team} cannot include a native package reference or observed profile.` };
  }
  const offense = nativeMetricValue(profile, 'offense', 'points-per-100', allowProjected);
  const defense = nativeMetricValue(profile, 'defense', 'points-per-100', allowProjected);
  const net = nativeMetricValue(profile, 'net', 'points-per-100', allowProjected);
  if (!profile || offense === null || defense === null || net === null) {
    return { ...evidenceScope, status: 'unavailable', reason: `No complete native team-style rate profile is available for ${payload.team} in ${evidenceSeason} (${phase}).` };
  }
  if (offense < 0 || offense > NATIVE_RATE_CEILING || defense < 0 || defense > NATIVE_RATE_CEILING
    || net < NATIVE_NET_FLOOR || net > NATIVE_NET_CEILING
    || Math.abs((offense - defense) - net) > 0.011) {
    return { ...evidenceScope, status: 'unavailable',
      reason: `Native offense, defense, and net rates are not internally coherent for ${payload.team} in ${evidenceSeason} (${phase}).` };
  }
  const metric = key => profile.metrics?.[key];
  const denominator = key => finite(Number(metric(key)?.denominator), 0) ? Number(metric(key).denominator) : 0;
  const pace48 = nativeMetricValue(profile, 'pace48', null, allowProjected);
  const pointsPerGame = nativeMetricValue(profile, 'pointsPerGame', null, allowProjected);
  const pointsAllowedPerGame = nativeMetricValue(profile, 'pointsAllowedPerGame', null, allowProjected);
  const profileGames = integer(Number(profile.games), 1, 300) ? Number(profile.games) : null;
  const ppgDenominator = finite(metric('pointsPerGame')?.denominator, 1) ? metric('pointsPerGame').denominator : null;
  const games = profileGames ?? ppgDenominator ?? 0;
  const fourFactors = nativeFourFactorMetrics(profile, allowProjected);
  const kind = allowProjected ? 'forecast-rate' : 'native-rate';
  const projected = allowProjected;
  return { ...evidenceScope, kind,
    sample: { status: projected ? 'projected' : 'observed', games, offensePossessions: denominator('offense'), defensePossessions: denominator('defense'),
      offensiveRating: offense, defensiveRating: defense, netRating: net, pace48, pointsPerGame, pointsAllowedPerGame,
      fourFactors,
      paceStatus: pace48 === null ? 'unavailable' : projected ? 'projected-rate' : 'native-rate', pointsPerGameStatus: pointsPerGame === null ? 'unavailable' : projected ? 'projected-rate' : 'native-rate',
      pointsAllowedPerGameStatus: pointsAllowedPerGame === null ? 'unavailable' : projected ? 'projected-rate' : 'native-rate' },
    offense: { status: projected ? 'projected-rate' : 'native-rate', mean: offense / 100 }, defense: { status: projected ? 'projected-rate' : 'native-rate', mean: defense / 100 },
    status: 'ready', reason: phaseFallback
      ? `${projected ? 'Projected' : 'Native'} ${phase} matchup fell back to the selected team's regular-season profile; no playoff rate was invented.`
      : projected ? 'Accepted projected team-style offense, defense, and net rates passed the forecast adapter.' : 'Native team-style offense, defense, and net rates passed the package adapter.' };
}

export function buildNativeLeagueContext(evidence) {
  const native = (Array.isArray(evidence) ? evidence : []).filter(item => item?.status === 'ready' && ['native-rate', 'forecast-rate'].includes(item.kind));
  const weighted = (key, denominatorKey) => {
    const rows = native.filter(item => finite(item.sample?.[key]) && finite(item.sample?.[denominatorKey], 0) && item.sample[denominatorKey] > 0);
    const denominator = rows.reduce((sum, item) => sum + item.sample[denominatorKey], 0);
    return denominator > 0 ? rows.reduce((sum, item) => sum + item.sample[key] * item.sample[denominatorKey], 0) / denominator : null;
  };
  const mean = key => { const rows = native.filter(item => finite(item.sample?.[key])); return rows.length ? rows.reduce((sum, item) => sum + item.sample[key], 0) / rows.length : null; };
  const baselineOffense = weighted('offensiveRating', 'offensePossessions') ?? mean('offensiveRating');
  const baselineDefense = weighted('defensiveRating', 'defensePossessions') ?? mean('defensiveRating');
  const baselinePace48 = weighted('pace48', 'games') ?? mean('pace48');
  const baselinePointsPerGame = weighted('pointsPerGame', 'games') ?? mean('pointsPerGame');
  const baselinePointsAllowedPerGame = weighted('pointsAllowedPerGame', 'games') ?? mean('pointsAllowedPerGame');
  const baselineFourFactors = Object.fromEntries(Object.entries(FOUR_FACTOR_KEYS).map(([side, keys]) => [side, Object.fromEntries(keys.map(key => {
    const descriptors = native.map(item => factorDescriptor(item, side, key)).filter(Boolean);
    const denominator = descriptors.reduce((sum, descriptor) => {
      const candidate = Number(descriptor.denominator);
      return sum + (Number.isFinite(candidate) && candidate > 0 ? candidate : 1);
    }, 0);
    const value = denominator > 0
      ? descriptors.reduce((sum, descriptor) => {
        const candidate = Number(descriptor.denominator);
        const weight = Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
        return sum + Number(descriptor.value) * weight;
      }, 0) / denominator
      : FOUR_FACTOR_DEFAULTS[side][key];
    return [key, rounded(Number.isFinite(value) ? value : FOUR_FACTOR_DEFAULTS[side][key])];
  }))]));
  return { status: native.length ? 'ready' : 'unavailable', teamCount: native.length,
    baselineOffense: rounded(baselineOffense), baselineDefense: rounded(baselineDefense), baselineNet: rounded(baselineOffense !== null && baselineDefense !== null ? baselineOffense - baselineDefense : null),
    baselinePace48: rounded(baselinePace48), baselinePointsPerGame: rounded(baselinePointsPerGame), baselinePointsAllowedPerGame: rounded(baselinePointsAllowedPerGame),
    baselineFourFactors,
    regularizationPriorPossessions: NATIVE_PRIOR_POSSESSIONS,
    note: 'League baselines are weighted by available native denominators; missing metrics remain unavailable. Four-Factors baselines are used only for matchup and event-mix interaction.' };
}

function nativeRandomNormal(random) {
  const first = Math.max(Number.EPSILON, random()), second = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function regularizedRate(value, baseline, possessions) {
  if (!finite(value) || !finite(baseline)) return value;
  const n = Math.max(0, Number(possessions) || 0), weight = n / (n + NATIVE_PRIOR_POSSESSIONS);
  return baseline + weight * (value - baseline);
}

function nativeComponentParameterSd(possessions) {
  const n = Math.max(0, Number(possessions) || 0);
  // The native rate is already shrunk toward the league baseline by
  // regularizedRate().  Apply that same evidence weight to the raw sampling
  // uncertainty; otherwise a tiny segment can still inject an 8-point latent
  // shock even though its observed rate contributes almost nothing to the
  // matchup.  With no denominator the native value contributes no latent
  // uncertainty at all and the baseline remains deterministic.
  if (!(n > 0)) return 0;
  const evidenceWeight = n / (n + NATIVE_PRIOR_POSSESSIONS);
  const rawSd = Math.min(8, NATIVE_PARAMETER_SD_AT_PRIOR * Math.sqrt(NATIVE_PRIOR_POSSESSIONS / n));
  return evidenceWeight * rawSd;
}

function nativeParameterSds(evidence) {
  const offense = nativeComponentParameterSd(evidence?.sample?.offensePossessions);
  const defense = nativeComponentParameterSd(evidence?.sample?.defensePossessions);
  return { offense, defense, aggregate: Math.sqrt(offense ** 2 + defense ** 2) };
}

function matchupUncertainty(first, second, pace, forecastNetSd = 0, matchupWeights = DEFAULT_MATCHUP_WEIGHTS) {
  const gameNoiseSd = clamp(NATIVE_GAME_NOISE_SD * Math.sqrt(Math.max(0.7, Number(pace) / 100)), 9, 13);
  // Native-rate and forecast-error components are expressed per 100
  // possessions, while the sampled game margin is in score points. Convert
  // both components through the same matchup pace used by expectedA/B so a
  // slow game does not inherit an overstated rate-uncertainty variance.
  const paceFactor = Math.max(0, Number(pace) / 100);
  const rateComponentsA = nativeParameterSds(first), rateComponentsB = nativeParameterSds(second);
  const componentsA = { offense: rateComponentsA.offense * paceFactor, defense: rateComponentsA.defense * paceFactor, aggregate: rateComponentsA.aggregate * paceFactor };
  const componentsB = { offense: rateComponentsB.offense * paceFactor, defense: rateComponentsB.defense * paceFactor, aggregate: rateComponentsB.aggregate * paceFactor };
  const parameterSdA = componentsA.aggregate, parameterSdB = componentsB.aggregate;
  // Parameter variance must follow the same matchup coefficients as the
  // expected-rate equation. With the default 50/50 blend and rate scale of
  // two, each component has coefficient one. Explicit scenario weights can
  // suppress a component entirely; that component must not continue widening
  // the reported win-probability uncertainty after it has been excluded from
  // the matchup itself.
  const ownOffenseWeight = finite(Number(matchupWeights?.ownOffense), 0, 1)
    ? Number(matchupWeights.ownOffense) : DEFAULT_MATCHUP_WEIGHTS.ownOffense;
  const opponentDefenseWeight = finite(Number(matchupWeights?.opponentDefense), 0, 1)
    ? Number(matchupWeights.opponentDefense) : DEFAULT_MATCHUP_WEIGHTS.opponentDefense;
  const offenseMarginScale = NATIVE_MATCHUP_RATE_SCALE * ownOffenseWeight;
  const defenseMarginScale = NATIVE_MATCHUP_RATE_SCALE * opponentDefenseWeight;
  const marginParameterSdsA = {
    offense: componentsA.offense * offenseMarginScale,
    defense: componentsA.defense * defenseMarginScale,
  };
  const marginParameterSdsB = {
    offense: componentsB.offense * offenseMarginScale,
    defense: componentsB.defense * defenseMarginScale,
  };
  const marginParameterSd = Math.sqrt(marginParameterSdsA.offense ** 2 + marginParameterSdsA.defense ** 2
    + marginParameterSdsB.offense ** 2 + marginParameterSdsB.defense ** 2);
  // The two score draws contribute independent variance; the regularized
  // native rates contribute a smaller parameter component.  Keeping those
  // sources separate makes expected win rates widen for sparse packages while
  // leaving the seeded sampled game path unchanged.
  // A projected team profile has no observed possession denominator. Use the
  // accepted rolling-holdout net-rating RMSE as an explicit model-error
  // component instead of allowing a projected row to look falsely certain.
  // The same component is sampled once per team/replay in buildNativeLatents;
  // adding its two-team variance here keeps the expected win probability and
  // the seeded score path on the same uncertainty contract.
  const forecastSd = finite(Number(forecastNetSd), 0) ? Number(forecastNetSd) : 0;
  const forecastMarginScale = NATIVE_MATCHUP_RATE_SCALE * (ownOffenseWeight + opponentDefenseWeight) / 2;
  const forecastMarginSd = Math.sqrt(2) * forecastSd * paceFactor * forecastMarginScale;
  const marginSd = Math.sqrt((2 * gameNoiseSd ** 2) + marginParameterSd ** 2 + forecastMarginSd ** 2);
  return { gameNoiseSd, paceFactor, parameterSdA, parameterSdB, parameterSdsA: componentsA, parameterSdsB: componentsB,
    marginParameterSdsA, marginParameterSdsB, marginParameterSd, forecastNetSd: forecastSd, forecastMarginSd, marginSd };
}

function matchupPace(first, second, leagueContext) {
  const left = first.sample.pace48, right = second.sample.pace48;
  if (finite(left, NATIVE_PACE_FLOOR, NATIVE_PACE_CEILING) && finite(right, NATIVE_PACE_FLOOR, NATIVE_PACE_CEILING)) {
    return { value: 2 / ((1 / left) + (1 / right)), source: 'team-harmonic-mean' };
  }
  if (finite(leagueContext?.baselinePace48, NATIVE_PACE_FLOOR, NATIVE_PACE_CEILING)) return { value: leagueContext.baselinePace48, source: 'league-fallback' };
  return { value: 95, source: 'bounded-default' };
}

function possessionOutcomeProfile(expectedPoints, possessions, evidence, opponentEvidence = null, leagueContext = null) {
  const requestedExpectedPerPossession = Number(expectedPoints) / Math.max(1, possessions);
  const expectedPerPossession = clamp(requestedExpectedPerPossession, NATIVE_EXPECTED_PPP_FLOOR, NATIVE_EXPECTED_PPP_CEILING);
  const offenseCoverage = factorQuality(evidence, 'offense', leagueContext);
  const defenseCoverage = factorQuality(opponentEvidence, 'defense', leagueContext);
  const offense = evidence?.sample?.fourFactors?.offense || {};
  const opponentDefense = opponentEvidence?.sample?.fourFactors?.defense || {};
  const read = (side, key, fallback) => {
    const descriptor = side?.[key];
    const value = Number(descriptor?.value);
    const upper = key === 'freeThrowAttemptRate' || key === 'opponentFreeThrowAttemptRate' ? 1.5 : 1;
    return descriptor?.status !== 'unavailable' && finite(value) && value >= 0 && value <= upper ? value : fallback;
  };
  const baseline = leagueContext?.baselineFourFactors || FOUR_FACTOR_DEFAULTS;
  const efg = read(offense, 'effectiveFieldGoal', baseline.offense.effectiveFieldGoal);
  const opponentEfg = read(opponentDefense, 'opponentEffectiveFieldGoal', baseline.defense.opponentEffectiveFieldGoal);
  const freeThrowRate = read(offense, 'freeThrowAttemptRate', baseline.offense.freeThrowAttemptRate);
  const opponentFreeThrowRate = read(opponentDefense, 'opponentFreeThrowAttemptRate', baseline.defense.opponentFreeThrowAttemptRate);
  const offensiveReboundRate = read(offense, 'offensiveReboundRate', baseline.offense.offensiveReboundRate);
  const defensiveReboundRate = read(opponentDefense, 'defensiveReboundRate', baseline.defense.defensiveReboundRate);
  const turnoverRate = read(offense, 'turnoverRate', baseline.offense.turnoverRate);
  const opponentTurnoverRate = read(opponentDefense, 'opponentTurnoverRate', baseline.defense.opponentTurnoverRate);

  // eFG and free-throw rate set the scoring-event mix.  Turnovers and
  // offensive rebounds alter the share of empty possessions, while the
  // opponent's defensive factors push the same mix in the opposite direction.
  // The expected points target is solved back into the event probabilities so
  // factor interaction does not silently inflate or deflate team totals.
  const shotQuality = clamp(efg + (baseline.defense.opponentEffectiveFieldGoal - opponentEfg) * 0.5, 0.40, 0.68);
  const threePointRate = clamp(0.22 + (shotQuality - baseline.offense.effectiveFieldGoal) * 0.8, 0.12, 0.38);
  const onePoint = clamp(0.035 + ((freeThrowRate + (baseline.defense.opponentFreeThrowAttemptRate - opponentFreeThrowRate) * 0.35) * 0.24), 0.04, 0.16);
  const turnoverEdge = clamp(((turnoverRate - baseline.offense.turnoverRate) / 0.03 + (opponentTurnoverRate - baseline.defense.opponentTurnoverRate) / 0.03) / 2, -3, 3);
  const reboundEdge = clamp(((offensiveReboundRate - baseline.offense.offensiveReboundRate) / 0.05 + (baseline.defense.defensiveReboundRate - defensiveReboundRate) / 0.05) / 2, -3, 3);
  const desiredScoredPossessions = clamp(expectedPerPossession / 2.05 - turnoverEdge * 0.025 + reboundEdge * 0.018, 0.32, 0.82);
  // With scoredPossessions = twoPoint + threePoint, expected points are
  // onePoint + 2*scoredPossessions + threePoint.  Subtract the one-point
  // event here; adding it would overstate the implied three-point share and
  // make the event mix less faithful to the declared free-throw rate.
  const impliedThreePointRate = expectedPerPossession - onePoint - (2 * desiredScoredPossessions);
  let threePoint = clamp((threePointRate + impliedThreePointRate) / 2, 0.08, 0.38);
  let twoPoint = (expectedPerPossession - onePoint - (3 * threePoint)) / 2;
  let zeroPoint = 1 - onePoint - twoPoint - threePoint;
  let fallbackUsed = false;
  if (twoPoint < 0.08 || twoPoint > 0.65 || zeroPoint < 0.04 || zeroPoint > 0.76) {
    // Extreme or very low rates cannot satisfy the four-factor constraints
    // while keeping every event bucket realistic. Preserve the bounded v2
    // behavior for that edge and disclose that the fallback was used.
    fallbackUsed = true;
    threePoint = clamp(0.03 + ((efg - 0.45) * 0.62), 0.12, 0.38);
    twoPoint = clamp((expectedPerPossession - onePoint - (3 * threePoint)) / 2, 0.08, 0.65);
    const totalScoring = onePoint + twoPoint + threePoint;
    zeroPoint = clamp(1 - totalScoring, 0.04, 0.76);
  }
  const total = zeroPoint + onePoint + twoPoint + threePoint;
  const realizedExpectedPerPossession = (onePoint + (2 * twoPoint) + (3 * threePoint)) / total;
  const factorStatus = !opponentEvidence ? 'offense-only'
    : offenseCoverage.status === 'observed' && defenseCoverage.status === 'observed' ? 'observed'
      : offenseCoverage.status !== 'unavailable' || defenseCoverage.status !== 'unavailable' ? 'partial' : 'unavailable';
  return { zeroPoint: zeroPoint / total, onePoint: onePoint / total, twoPoint: twoPoint / total, threePoint: threePoint / total,
    requestedExpectedPerPossession: rounded(requestedExpectedPerPossession), boundedExpectedPerPossession: rounded(expectedPerPossession),
    expectedPerPossession: rounded(realizedExpectedPerPossession),
    clampApplied: requestedExpectedPerPossession < NATIVE_EXPECTED_PPP_FLOOR || requestedExpectedPerPossession > NATIVE_EXPECTED_PPP_CEILING,
    realizedMinusRequested: rounded(realizedExpectedPerPossession - requestedExpectedPerPossession),
    factorInteraction: { status: factorStatus, shotQuality: rounded(shotQuality), turnoverEdge: rounded(turnoverEdge), reboundEdge: rounded(reboundEdge),
      desiredScoredPossessions: rounded(desiredScoredPossessions), threePointRate: rounded(threePointRate), fallbackUsed,
      coverage: { offense: rounded(offenseCoverage.coverage), opponentDefense: rounded(defenseCoverage.coverage) },
      weightedCoverage: { offense: rounded(offenseCoverage.weightedCoverage), opponentDefense: rounded(defenseCoverage.weightedCoverage) },
      observedKeys: { offense: offenseCoverage.observedKeys, opponentDefense: defenseCoverage.observedKeys },
      imputedKeys: { offense: offenseCoverage.imputedKeys, opponentDefense: defenseCoverage.imputedKeys },
      imputationPolicy: 'missing-factor-league-baseline-zero-contribution-v1' } };
}

function mergeEventCounts(first = {}, second = {}) {
  return { zero: (Number(first.zero) || 0) + (Number(second.zero) || 0),
    one: (Number(first.one) || 0) + (Number(second.one) || 0),
    two: (Number(first.two) || 0) + (Number(second.two) || 0),
    three: (Number(first.three) || 0) + (Number(second.three) || 0) };
}

function samplePossessions(random, profile, possessions) {
  const counts = { zero: 0, one: 0, two: 0, three: 0 };
  let score = 0;
  for (let index = 0; index < possessions; index += 1) {
    const draw = random();
    if (draw < profile.zeroPoint) counts.zero += 1;
    else if (draw < profile.zeroPoint + profile.onePoint) { counts.one += 1; score += 1; }
    else if (draw < profile.zeroPoint + profile.onePoint + profile.twoPoint) { counts.two += 1; score += 2; }
    else { counts.three += 1; score += 3; }
  }
  return { score, counts, profile };
}

function normalizedOutcomeProbabilities(profile) {
  const probabilities = ['zeroPoint', 'onePoint', 'twoPoint', 'threePoint'].map(key => Number(profile?.[key]));
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (probabilities.some(value => !Number.isFinite(value) || value < 0 || value > 1)
    || !Number.isFinite(total) || total <= 0 || Math.abs(total - 1) > 1e-8) return null;
  return probabilities.map(value => value / total);
}

function exactScoreDistribution(probabilities, possessions) {
  if (!Number.isSafeInteger(possessions) || possessions < 1) return null;
  const maxScore = possessions * 3;
  let current = new Float64Array(maxScore + 1), next = new Float64Array(maxScore + 1);
  current[0] = 1;
  for (let gamePossession = 0; gamePossession < possessions; gamePossession += 1) {
    const currentMax = gamePossession * 3;
    next.fill(0);
    for (let score = 0; score <= currentMax; score += 1) {
      const mass = current[score];
      if (!mass) continue;
      for (let points = 0; points < probabilities.length; points += 1) {
        const outcomeMass = probabilities[points];
        if (outcomeMass) next[score + points] += mass * outcomeMass;
      }
    }
    const previous = current;
    current = next;
    next = previous;
  }
  return current;
}

function scoreOutcomeProbabilities(first, second) {
  if (!first || !second || first.length !== second.length) return null;
  let secondBelow = 0, firstWins = 0, ties = 0;
  for (let score = 0; score < first.length; score += 1) {
    firstWins += first[score] * secondBelow;
    ties += first[score] * second[score];
    secondBelow += second[score];
  }
  return { firstWins, ties };
}

function exactExpectedWinSharesByOvertimeCap({ outcomeProfileA, outcomeProfileB, possessions }) {
  const firstProbabilities = normalizedOutcomeProbabilities(outcomeProfileA);
  const secondProbabilities = normalizedOutcomeProbabilities(outcomeProfileB);
  if (!firstProbabilities || !secondProbabilities || !Number.isSafeInteger(possessions) || possessions < 1) return null;
  const overtimePossessions = Math.max(1, Math.round(possessions * GAME_LAB_POLICY.overtimeMinutes / GAME_LAB_POLICY.regulationMinutes));
  const regulation = scoreOutcomeProbabilities(
    exactScoreDistribution(firstProbabilities, possessions), exactScoreDistribution(secondProbabilities, possessions));
  const overtime = scoreOutcomeProbabilities(
    exactScoreDistribution(firstProbabilities, overtimePossessions), exactScoreDistribution(secondProbabilities, overtimePossessions));
  if (!regulation || !overtime) return null;
  const shares = { 0: regulation.firstWins + regulation.ties * 0.5 };
  let pathsStillTied = 1, resolvedOvertimeWins = 0;
  for (let maxOvertimes = 1; maxOvertimes <= 10; maxOvertimes += 1) {
    resolvedOvertimeWins += pathsStillTied * overtime.firstWins;
    pathsStillTied *= overtime.ties;
    shares[maxOvertimes] = regulation.firstWins + regulation.ties * (resolvedOvertimeWins + 0.5 * pathsStillTied);
  }
  return shares;
}

/** Exact expected win credit from the same bounded possession score distribution used by the native sampler.
 * Unresolved ties after the requested overtime cap are valued as half a win, matching Season Lab's table points.
 * Returns null when the sampler does not expose a complete, valid score distribution.
 */
export function exactExpectedWinShareFromPossessionProfiles({ outcomeProfileA, outcomeProfileB, possessions, maxOvertimes = GAME_LAB_POLICY.maxOvertimes } = {}) {
  if (!integer(maxOvertimes, 0, 10)) return null;
  return exactExpectedWinSharesByOvertimeCap({ outcomeProfileA, outcomeProfileB, possessions })?.[maxOvertimes] ?? null;
}

function createNativeRateSamplerFromEvidence({ a, b, season, phase = 'regular', first, second, leagueContext = null, latentByTeam = null, matchupWeights = null, forecastNetSd = 0 }) {
  if (first.status !== 'ready' || second.status !== 'ready') fail(first.status !== 'ready' ? first.reason : second.reason);
  const context = leagueContext?.status === 'ready' ? leagueContext : buildNativeLeagueContext([first, second]);
  const baselineOffense = context.baselineOffense ?? ((first.sample.offensiveRating + second.sample.offensiveRating) / 2);
  const baselineDefense = context.baselineDefense ?? ((first.sample.defensiveRating + second.sample.defensiveRating) / 2);
  const offenseA = regularizedRate(first.sample.offensiveRating, baselineOffense, first.sample.offensePossessions);
  const defenseA = regularizedRate(first.sample.defensiveRating, baselineDefense, first.sample.defensePossessions);
  const offenseB = regularizedRate(second.sample.offensiveRating, baselineOffense, second.sample.offensePossessions);
  const defenseB = regularizedRate(second.sample.defensiveRating, baselineDefense, second.sample.defensePossessions);
  const pace = matchupPace(first, second, context);
  const latentA = latentByTeam?.get(`${a.team}|${phase}`) || { offense: 0, defense: 0 };
  const latentB = latentByTeam?.get(`${b.team}|${phase}`) || { offense: 0, defense: 0 };
  const weights = normalizeMatchupWeights(matchupWeights);
  const factorInteraction = nativeFourFactorMatchup(first, second, context);
  // Defensive rating is opponent points allowed per 100 possessions.  Lower
  // is better, so it must *reduce* the opponent's expected rating.  The prior
  // version inverted this sign and penalized elite defenses in every matchup.
  const expectedRatingA = baselineOffense
    + NATIVE_MATCHUP_RATE_SCALE * (weights.ownOffense * (offenseA + latentA.offense - baselineOffense)
      + weights.opponentDefense * (defenseB + latentB.defense - baselineDefense))
    + factorInteraction.adjustmentA;
  const expectedRatingB = baselineOffense
    + NATIVE_MATCHUP_RATE_SCALE * (weights.ownOffense * (offenseB + latentB.offense - baselineOffense)
      + weights.opponentDefense * (defenseA + latentA.defense - baselineDefense))
    + factorInteraction.adjustmentB;
  const expectedA = Math.max(0, expectedRatingA * pace.value / 100), expectedB = Math.max(0, expectedRatingB * pace.value / 100);
  const possessions = clamp(Math.round(pace.value), 60, 120);
  const outcomeProfileA = possessionOutcomeProfile(expectedA, possessions, first, second, context);
  const outcomeProfileB = possessionOutcomeProfile(expectedB, possessions, second, first, context);
  const outcomeExpectedPointsA = outcomeProfileA.expectedPerPossession * possessions;
  const outcomeExpectedPointsB = outcomeProfileB.expectedPerPossession * possessions;
  const uncertainty = matchupUncertainty(first, second, pace.value, forecastNetSd, weights);
  const expectedWinProbabilityByOvertimeCap = exactExpectedWinSharesByOvertimeCap({
    outcomeProfileA, outcomeProfileB, possessions,
  });
  const expectedWinProbabilityA = expectedWinProbabilityByOvertimeCap?.[GAME_LAB_POLICY.maxOvertimes] ?? null;
  return Object.freeze({
    metadata: { phase, phaseFallback: first.phaseFallback || second.phaseFallback, pace48: rounded(pace.value), paceSource: pace.source,
      expectedRatingA: rounded(expectedRatingA), expectedRatingB: rounded(expectedRatingB), expectedPointsA: rounded(expectedA), expectedPointsB: rounded(expectedB),
      expectedWinProbabilityA: rounded(expectedWinProbabilityA),
      winProbabilityMeanSource: expectedWinProbabilityA === null ? 'unavailable' : 'exact-score-distribution-with-overtime-v1',
      winProbabilityExpectedMargin: rounded(outcomeExpectedPointsA - outcomeExpectedPointsB), possessions,
      matchupWeights: { ...weights },
      matchupRateScale: NATIVE_MATCHUP_RATE_SCALE,
      fourFactorInteraction: factorInteraction,
      outcomeModel: 'bounded-multinomial-possession-v3-four-factors-event-reconciled',
      scoringEventRule: NATIVE_SCORING_EVENT_RULE,
      outcomePppBounds: { floor: NATIVE_EXPECTED_PPP_FLOOR, ceiling: NATIVE_EXPECTED_PPP_CEILING },
      outcomeProbabilities: { a: outcomeProfileA, b: outcomeProfileB },
      outcomeExpectedPointsA: rounded(outcomeExpectedPointsA),
      outcomeExpectedPointsB: rounded(outcomeExpectedPointsB),
      outcomeExpectationGapA: rounded((outcomeProfileA.expectedPerPossession * possessions) - expectedA),
      outcomeExpectationGapB: rounded((outcomeProfileB.expectedPerPossession * possessions) - expectedB),
      regularized: { offenseA: rounded(offenseA), defenseA: rounded(defenseA), offenseB: rounded(offenseB), defenseB: rounded(defenseB) },
      gameNoiseSd: rounded(uncertainty.gameNoiseSd), probabilityMarginSd: rounded(uncertainty.marginSd),
      uncertaintyPaceFactor: rounded(uncertainty.paceFactor), parameterSdA: rounded(uncertainty.parameterSdA), parameterSdB: rounded(uncertainty.parameterSdB),
      parameterSdByComponent: { a: { offense: rounded(uncertainty.parameterSdsA.offense), defense: rounded(uncertainty.parameterSdsA.defense) },
        b: { offense: rounded(uncertainty.parameterSdsB.offense), defense: rounded(uncertainty.parameterSdsB.defense) } },
      parameterMarginSd: rounded(uncertainty.marginParameterSd),
      parameterMarginSdByComponent: { a: { offense: rounded(uncertainty.marginParameterSdsA.offense), defense: rounded(uncertainty.marginParameterSdsA.defense) },
        b: { offense: rounded(uncertainty.marginParameterSdsB.offense), defense: rounded(uncertainty.marginParameterSdsB.defense) } },
      forecastNetErrorA: rounded(latentA.forecastNetError), forecastNetErrorB: rounded(latentB.forecastNetError),
      forecastNetRatingRmse: rounded(uncertainty.forecastNetSd), forecastMarginSd: rounded(uncertainty.forecastMarginSd),
      forecastUncertaintySource: uncertainty.forecastNetSd > 0 ? 'accepted-rolling-holdout-team-net-rating-rmse' : 'unavailable' },
    expectedWinProbabilityForOvertimes(maxOvertimes = GAME_LAB_POLICY.maxOvertimes) {
      return integer(maxOvertimes, 0, 10) ? expectedWinProbabilityByOvertimeCap?.[maxOvertimes] ?? null : null;
    },
    play(random, { maxOvertimes = GAME_LAB_POLICY.maxOvertimes } = {}) {
      if (typeof random !== 'function') fail('A seeded random stream is required.');
      if (!integer(maxOvertimes, 0, 10)) fail('Cup overtime periods must be a whole number from 0 through 10.');
      let sampledA = samplePossessions(random, outcomeProfileA, possessions);
      let sampledB = samplePossessions(random, outcomeProfileB, possessions);
      let scoreA = sampledA.score, scoreB = sampledB.score, overtimes = 0;
      const regulationA = scoreA, regulationB = scoreB;
      const overtime = [];
      let overtimePointsA = 0, overtimePointsB = 0;
      const overtimePossessions = Math.max(1, Math.round(possessions * GAME_LAB_POLICY.overtimeMinutes / GAME_LAB_POLICY.regulationMinutes));
      while (scoreA === scoreB && overtimes < maxOvertimes) {
        overtimes += 1;
        const overtimeA = samplePossessions(random, outcomeProfileA, overtimePossessions);
        const overtimeB = samplePossessions(random, outcomeProfileB, overtimePossessions);
        overtimePointsA += overtimeA.score;
        overtimePointsB += overtimeB.score;
        overtime.push({ period: `OT${overtimes}`, a: overtimeA.score, b: overtimeB.score });
        sampledA = { score: sampledA.score + overtimeA.score, counts: mergeEventCounts(sampledA.counts, overtimeA.counts), profile: sampledA.profile };
        sampledB = { score: sampledB.score + overtimeB.score, counts: mergeEventCounts(sampledB.counts, overtimeB.counts), profile: sampledB.profile };
        scoreA = sampledA.score; scoreB = sampledB.score;
      }
      return { a: scoreA, b: scoreB, margin: scoreA - scoreB, winner: scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : 'unresolved', overtimes,
        possessions: possessions + overtimes * overtimePossessions, eventsA: sampledA.counts, eventsB: sampledB.counts,
        regulation: { a: regulationA, b: regulationB }, overtime, overtimePointsA, overtimePointsB };
    },
  });
}

export function createNativeRateSampler({ a, b, season, phase = 'regular', leagueContext = null, latentByTeam = null, matchupWeights = null, allowProjected = false, forecastNetSd = 0, evidenceSeasonStartYear = season }) {
  const first = nativeTeamEvidence(a, season, phase, { allowProjected, evidenceSeasonStartYear });
  const second = nativeTeamEvidence(b, season, phase, { allowProjected, evidenceSeasonStartYear });
  return createNativeRateSamplerFromEvidence({ a, b, season, phase, first, second, leagueContext, latentByTeam, matchupWeights, forecastNetSd });
}

function buildNativeLatents(payloads, season, phase, random, allowProjected = false, forecastNetSd = 0, forecastErrors = null, evidenceSeasonStartYear = season) {
  const latents = new Map();
  for (const payload of payloads) {
    const evidence = nativeTeamEvidence(payload, season, phase, { allowProjected, evidenceSeasonStartYear });
    if (evidence.status !== 'ready') continue;
    const sds = nativeParameterSds(evidence);
    // One latent draw per team and requested phase makes uncertainty about a
    // short/partial sample persistent across that replay phase. Drawing it
    // anew for every game would incorrectly turn parameter uncertainty into
    // independent game noise and understate repeat-to-repeat variation. An
    // accepted forecast-error latent is different: it represents one
    // season-level projection error, so reuse it across regular and fallback
    // competition phases when a shared map is supplied.
    const projectedErrorSd = evidence.kind === 'forecast-rate' && finite(Number(forecastNetSd), 0) ? Number(forecastNetSd) : 0;
    let forecastNetError = 0;
    if (projectedErrorSd > 0) {
      if (forecastErrors instanceof Map && forecastErrors.has(payload.team)) forecastNetError = forecastErrors.get(payload.team);
      else {
        forecastNetError = projectedErrorSd * nativeRandomNormal(random);
        forecastErrors?.set(payload.team, forecastNetError);
      }
    }
    latents.set(`${payload.team}|${phase}`, {
      // A forecast net-rating error is split symmetrically across offense and
      // defense. This preserves the projected scoring level while moving the
      // team's net expectation by the observed holdout error; it also lets the
      // same latent affect every matchup in this replay rather than being
      // redrawn independently for every game.
      offense: sds.offense * nativeRandomNormal(random) + forecastNetError / 2,
      defense: sds.defense * nativeRandomNormal(random) - forecastNetError / 2,
      forecastNetError,
      standardDeviation: sds.aggregate,
      standardDeviationByComponent: { offense: sds.offense, defense: sds.defense },
      forecastNetStandardDeviation: projectedErrorSd,
      source: projectedErrorSd > 0 ? 'component-denominator-plus-rolling-holdout-forecast-error' : 'component-denominator-derived-parameter-proxy',
    });
  }
  return latents;
}

function actualComparison(standings, actualRecords, gamesPerTeam, scenario) {
  if (!actualRecords || typeof actualRecords !== 'object') return { status: 'unavailable', comparisons: [], note: 'Actual records were not supplied. No historical wins are invented.' };
  const comparisons = standings.map(row => {
    const actual = actualRecords[row.teamId] || actualRecords[row.team] || actualRecords[row.displayTeam];
    if (!actual || !integer(Number(actual.wins), 0) || !integer(Number(actual.games), 1)
      || Number(actual.wins) > Number(actual.games)) {
      return { team: row.displayTeam, teamId: row.teamId, status: 'unavailable', reason: 'Actual wins must be a whole number no greater than actual games.' };
    }
    const actualGames = Number(actual.games);
    const hasLosses = actual.losses != null;
    const hasTies = actual.ties != null;
    const actualLosses = hasLosses ? Number(actual.losses) : 0;
    const actualTies = hasTies ? Number(actual.ties) : 0;
    if ((hasLosses && !integer(actualLosses, 0)) || (hasTies && !integer(actualTies, 0))
      || ((hasLosses || hasTies) && actualLosses + actualTies + Number(actual.wins) !== actualGames)) {
      return { team: row.displayTeam, teamId: row.teamId, status: 'unavailable', reason: 'Actual wins, losses, and ties must be whole numbers that sum to actual games.' };
    }
    const scenarioGames = Number(row.games);
    if (!integer(scenarioGames, 1)) return { team: row.displayTeam, teamId: row.teamId, status: 'unavailable', reason: 'The declared scenario schedule did not give this team a comparable game count.' };
    return { team: row.displayTeam, teamId: row.teamId, status: 'available', scenarioWins: row.wins, actualWins: Number(actual.wins),
      scenarioGames, actualGames,
      scenarioWinRate: rounded(row.wins / scenarioGames), actualWinRate: rounded(Number(actual.wins) / actualGames),
      winRateDifference: rounded(row.wins / scenarioGames - Number(actual.wins) / actualGames),
      qualification: scenario ? 'rate-qualified scenario comparison' : 'same-games comparison' };
  });
  return { status: comparisons.every(row => row.status === 'available') ? 'available' : 'partial', comparisons,
    note: scenario ? 'Short/custom schedules compare rates, not raw win totals, and remain scenarios.' : 'Actual comparison is descriptive; it does not validate the simulation model.' };
}

function scheduleContextAudit(games, teams) {
  const source = Array.isArray(games) ? games : [];
  const dated = source.filter(game => game?.scheduledAt && Number.isFinite(Date.parse(game.scheduledAt)));
  if (!dated.length) {
    return { status: 'unavailable', games: source.length, datedGames: 0, undatedGames: source.length,
      teams: {}, note: 'The selected schedule has no usable calendar dates; rest, back-to-back, and streak context are unavailable and are not invented.' };
  }
  const byTeam = new Map((Array.isArray(teams) ? teams : []).map(team => [team.id, []]));
  let undatedGames = 0;
  for (const game of source) {
    const time = game?.scheduledAt ? Date.parse(game.scheduledAt) : NaN;
    if (!Number.isFinite(time)) { undatedGames += 1; continue; }
    const day = new Date(time).getTime();
    for (const teamId of [game.homeTeamId, game.awayTeamId]) if (byTeam.has(teamId)) byTeam.get(teamId).push({ day, home: teamId === game.homeTeamId });
  }
  const teamSummary = {};
  const allRest = [], allBackToBack = [];
  for (const [teamId, rows] of byTeam.entries()) {
    rows.sort((left, right) => left.day - right.day);
    const rest = [], streaks = [];
    let currentStreak = 0, previousHome = null;
    for (let index = 0; index < rows.length; index += 1) {
      if (index > 0) {
        const gap = Math.max(0, Math.round((rows[index].day - rows[index - 1].day) / 86400000) - 1);
        rest.push(gap); allRest.push(gap); allBackToBack.push(gap <= 0 ? 1 : 0);
      }
      if (rows[index].home === previousHome) currentStreak += 1;
      else { if (currentStreak) streaks.push(currentStreak); currentStreak = 1; previousHome = rows[index].home; }
    }
    if (currentStreak) streaks.push(currentStreak);
    teamSummary[teamId] = { games: rows.length, minRestDays: rest.length ? Math.min(...rest) : null,
      meanRestDays: rest.length ? rounded(rest.reduce((sum, value) => sum + value, 0) / rest.length) : null,
      maxRestDays: rest.length ? Math.max(...rest) : null, backToBackGames: rest.filter(value => value <= 0).length,
      maxHomeAwayStreak: streaks.length ? Math.max(...streaks) : null,
      calendarStart: rows.length ? new Date(rows[0].day).toISOString() : null,
      calendarEnd: rows.length ? new Date(rows.at(-1).day).toISOString() : null };
  }
  const start = dated.reduce((min, game) => Math.min(min, Date.parse(game.scheduledAt)), Infinity);
  const end = dated.reduce((max, game) => Math.max(max, Date.parse(game.scheduledAt)), -Infinity);
  return { status: undatedGames ? 'partial-dates' : 'measured', games: source.length, datedGames: dated.length, undatedGames,
    calendarStart: Number.isFinite(start) ? new Date(start).toISOString() : null,
    calendarEnd: Number.isFinite(end) ? new Date(end).toISOString() : null,
    windowDays: Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : null,
    backToBackGames: allBackToBack.reduce((sum, value) => sum + value, 0),
    meanRestDays: allRest.length ? rounded(allRest.reduce((sum, value) => sum + value, 0) / allRest.length) : null,
    teams: teamSummary,
    effectsApplied: false,
    note: 'Calendar, rest, back-to-back, and home/away streak context is measured from declared dates. No fatigue, travel, or venue effect is applied without a dedicated accepted model.' };
}

function buildSeasonCalibration(input = {}) {
  if (!input || typeof input !== 'object') return { status: 'unavailable', version: CALIBRATION_MODEL_VERSION, reason: 'No held-out validation records were supplied.' };
  const records = Array.isArray(input.records) ? input.records : [];
  if (!records.length) return { status: 'unavailable', version: CALIBRATION_MODEL_VERSION, reason: 'No held-out validation records were supplied.' };
  const heldOut = records.filter(row => row?.holdout === true);
  if (!heldOut.length) return { status: 'blocked', version: CALIBRATION_MODEL_VERSION, reason: 'Season calibration requires at least one record explicitly marked holdout:true.' };
  const timeKey = input.timeKey || 'seasonStartYear';
  const splits = rollingOriginSplits(records, { timeKey, minTrain: Math.max(1, Number(input.minTrain || 1)), horizon: Math.max(1, Number(input.horizon || 1)) });
  const heldOutRows = new Set(heldOut);
  const scoredRows = new Set();
  const splitSummaries = splits.map(split => {
    const declaredHoldout = split.holdout.filter(row => heldOutRows.has(row));
    declaredHoldout.forEach(row => scoredRows.add(row));
    return {
      index: split.index,
      holdoutStart: split.holdoutStart,
      holdoutEnd: split.holdoutEnd,
      trainCount: split.train.length,
      holdoutCount: split.holdout.length,
      scoredHoldoutCount: declaredHoldout.length,
    };
  });
  const scored = records.filter(row => scoredRows.has(row));
  const binaryReady = scored.length > 0 && scored.every(row => row.probability !== undefined && row.outcome !== undefined);
  const continuousReady = scored.length > 0 && scored.every(row => row.prediction !== undefined && row.actual !== undefined);
  const binary = binaryReady
    ? binaryCalibrationSummary(scored, { bins: input.bins || 10, scope: 'season-lab-held-out' }) : null;
  const continuous = continuousReady
    ? continuousCalibrationSummary(scored, { scope: 'season-lab-held-out' }) : null;
  const scoreable = binaryReady || continuousReady;
  return { status: scoreable ? 'complete' : 'blocked', version: CALIBRATION_MODEL_VERSION,
    scope: 'season-lab-held-out', fitRecordCount: records.length - heldOut.length, declaredHoldoutCount: heldOut.length,
    scoredHoldoutCount: scored.length, scoreableHoldoutCount: scoreable ? scored.length : 0, splits: splitSummaries, binary, continuous,
    note: scoreable
      ? 'Scores use only rows marked holdout:true that fall in a strict rolling-origin holdout window. Fit/history rows establish eligibility but are never scored, and same-season rows are never treated as prior evidence.'
      : scored.length
        ? 'Held-out rows fall in a strict rolling-origin window but do not provide a complete binary probability/outcome or continuous prediction/actual pair.'
        : 'At least one explicitly held-out row with strictly earlier history is required.' };
}

async function runSeason({ setup, season, teams, actualRecords, cupCompletion = null, repeat = 0, replayKey = null }, {
  random, signal, yieldEveryBatch, onGameProgress, onCupLifecycle,
  managedMode = false, onDecisionCheckpoint = null,
}) {
  const evidenceSource = setup.source.kind === 'year-advance-scenario' ? setup.source.baseSource : setup.source;
  const evidenceSeasonStartYear = setup.source.kind === 'year-advance-scenario' ? setup.source.evidenceSeasonStartYear : season;
  const internal = new Map(setup.teams.map((team, index) => [team.id, `t${index}`]));
  const suppliedPayloads = new Map();
  const payloads = setup.teams.map((team, index) => {
    const payload = teams.find(item => item.team === team.id || item.team === `t${index}` || item.id === team.id);
    if (!payload) fail(`No evidence payload was supplied for ${team.name}.`);
    suppliedPayloads.set(team.id, payload);
    return { ...payload, rosterMode: team.rosterMode, roster: team.roster || payload.roster || null, customProfile: team.customProfile || payload.customProfile || null, team: `t${index}` };
  });
  if (evidenceSource.kind === 'exact-season') validateExactPackagePayloads(evidenceSource, payloads, evidenceSeasonStartYear);
  const allowProjected = evidenceSource.kind === 'forecast-season';
  const evidence = payloads.map((payload, index) => {
    const item = Array.isArray(payload.nativeProfiles)
      ? nativeTeamEvidence(payload, season, 'regular', { allowProjected, evidenceSeasonStartYear }) : teamGameEvidence(payload, evidenceSeasonStartYear);
    return { ...item, teamId: setup.teams[index].id, sourceReceipt: sourceReceiptForSeason(setup.source, season) };
  });
  if (evidence.some(item => item.status !== 'ready')) fail(`Every Season Lab team needs validated ${season} season scoring evidence.`);
  const nativeMode = evidence.every(item => ['native-rate', 'forecast-rate'].includes(item.kind));
  const mixedEvidence = evidence.some(item => ['native-rate', 'forecast-rate'].includes(item.kind)) && !nativeMode;
  if (mixedEvidence) fail('Season Lab cannot mix native four-factor events with Game Lab maximum-entropy scoring events; there is no cross-model scoring fallback.');
  const scheduleInput = setup.schedule.kind === 'round-robin'
    ? buildSeasonLabSchedule(payloads.map(payload => payload.team), setup.schedule)
    : setup.schedule.games.filter(game => game.seasonStartYear == null || game.seasonStartYear === season).map(game => ({ ...game, phase: game.phase || 'regular', home: internal.get(game.home), away: internal.get(game.away) }));
  if (!scheduleInput.length) fail(`The selected schedule has no games for ${season}.`);
  const regularSchedule = scheduleInput.filter(game => String(game.phase || 'regular').toLowerCase() === 'regular');
  const regularDecisionTargets = new Set([0.25, 0.5, 0.75]
    .map(fraction => Math.round(regularSchedule.length * fraction))
    .filter(gameIndex => gameIndex >= 1 && gameIndex < regularSchedule.length));
  let completedRegularGames = 0;
  let currentMatchupWeights = { ...setup.matchupWeights };
  const decisionLog = [];
  function summarizeRegularSegment({ startGameIndex, endGameIndex, decisionIndex, ownOffense, opponentDefense }) {
    const segmentGames = games.filter(game => game.phase === 'regular'
      && game.regularGameIndex >= startGameIndex && game.regularGameIndex <= endGameIndex);
    const teamResults = setup.teams.map(team => {
      const teamGames = segmentGames.filter(game => game.homeTeamId === team.id || game.awayTeamId === team.id);
      let wins = 0, losses = 0, ties = 0, pointDifferential = 0;
      for (const game of teamGames) {
        const isHome = game.homeTeamId === team.id;
        const pointsFor = isHome ? game.scoreHome : game.scoreAway;
        const pointsAgainst = isHome ? game.scoreAway : game.scoreHome;
        pointDifferential += pointsFor - pointsAgainst;
        if (!game.winner) ties += 1;
        else if (game.winner === team.name) wins += 1;
        else losses += 1;
      }
      return { teamId: team.id, team: team.name, games: teamGames.length, wins, losses, ties,
        winRate: teamGames.length ? rounded((wins + ties / 2) / teamGames.length) : null,
        averagePointMargin: teamGames.length ? rounded(pointDifferential / teamGames.length) : null };
    });
    return { decisionIndex, effectiveGameIndex: startGameIndex, endGameIndex,
      ownOffense, opponentDefense, simulatedGameCount: segmentGames.length, teamResults };
  }
  const isCupCompletion = setup.schedule.kind === 'nba-cup-completion';
  const cupArtifact = isCupCompletion ? cupCompletion?.artifact : null;
  let publishedScheduleMatchesArtifact = false;
  function emitCupLifecycle(stage, detail = {}) {
    if (!isCupCompletion || typeof onCupLifecycle !== 'function') return;
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
    onCupLifecycle({ stage, seasonStartYear: season, repeat, ...detail });
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
  }
  if (isCupCompletion) {
    if (!cupArtifact || cupArtifact.format !== 'djhc-nba-cup-published-schedule-v1'
      || Number(cupArtifact.seasonStartYear) !== 2026 || !Array.isArray(cupArtifact.announcedGames)
      || cupArtifact.announcedGames.length !== 1200 || !Array.isArray(cupArtifact.groups)
      || !cupCompletion.priorSeasonRecords || !nativeMode) {
      fail('The NBA Cup run is missing its published schedule, exact prior records, or native team-rate evidence.');
    }
    if (!await cupScheduleReceiptMatchesArtifact(cupArtifact, cupCompletion.sourceReceipt, setup.schedule.sourceReceipt)) {
      fail('The NBA Cup source receipt does not match the immutable published schedule artifact.');
    }
    const publicTeamByInternal = new Map([...internal.entries()].map(([teamId, internalId]) => [internalId, teamId]));
    publishedScheduleMatchesArtifact = cupScheduleRowsMatchArtifact(scheduleInput, cupArtifact.announcedGames, publicTeamByInternal);
    if (!publishedScheduleMatchesArtifact) fail('The NBA Cup simulation rows do not match the immutable published schedule artifact.');
  }

  const regularContext = nativeMode ? buildNativeLeagueContext(evidence) : { status: 'unavailable', note: 'Possession-outcome evidence does not expose native team-style baselines.' };
  const forecastNetSd = allowProjected ? Number(setup.source.forecastValidation?.aggregate?.teamNetRating?.rmse) || 0 : 0;
  const forecastPaceFactor = nativeMode && finite(regularContext?.baselinePace48, NATIVE_PACE_FLOOR, NATIVE_PACE_CEILING)
    ? Number(regularContext.baselinePace48) / 100 : 1;
  const forecastErrors = nativeMode && allowProjected ? new Map() : null;
  const regularLatents = nativeMode ? buildNativeLatents(payloads, season, 'regular', random, allowProjected, forecastNetSd, forecastErrors, evidenceSeasonStartYear) : new Map();
  const samplerSets = new Map();
  function buildSamplers(phase, { evidencePhase = phase } = {}) {
    if (samplerSets.has(phase)) return samplerSets.get(phase);
    const phaseEvidence = (nativeMode ? payloads.map(payload => {
      const item = nativeTeamEvidence(payload, season, evidencePhase, { allowProjected, evidenceSeasonStartYear });
      if (phase !== 'playoffs' || evidencePhase === phase || item.status !== 'ready') return item;
      return { ...item, requestedPhase: 'playoffs', selectedPhase: 'regular', phaseFallback: true,
        phaseSelectionReason: 'forecast-safe-regular-season-rate-scenario',
        reason: 'No accepted postseason calibration is available; playoff games use only the declared regular-season rate profile.' };
    }) : evidence)
      .map((item, index) => ({ ...item, teamId: setup.teams[index].id,
        ...(phase === 'playoffs' && evidencePhase === 'regular' && !nativeMode
          ? { requestedPhase: 'playoffs', selectedPhase: 'regular', phaseFallback: true,
            phaseSelectionReason: 'forecast-safe-regular-season-rate-scenario' } : {}),
        sourceReceipt: sourceReceiptForSeason(setup.source, season) }));
    if (nativeMode && phaseEvidence.some(item => item.status !== 'ready')) fail(`Every native team needs a usable ${phase} profile for ${season}; no Game Lab scoring-event fallback is applied.`);
    const context = nativeMode ? buildNativeLeagueContext(phaseEvidence) : regularContext;
    const latents = nativeMode ? (evidencePhase === 'regular' ? regularLatents : buildNativeLatents(payloads, season, evidencePhase, random, allowProjected, forecastNetSd, forecastErrors, evidenceSeasonStartYear)) : new Map();
    const samplers = new Map();
    for (let a = 0; a < payloads.length; a += 1) for (let b = a + 1; b < payloads.length; b += 1) {
      samplers.set(`t${a}|t${b}`, nativeMode
        ? createNativeRateSamplerFromEvidence({ a: payloads[a], b: payloads[b], season, phase: evidencePhase, leagueContext: context, latentByTeam: latents,
          matchupWeights: currentMatchupWeights, forecastNetSd, first: phaseEvidence[a], second: phaseEvidence[b] })
        : createGameSampler({ a: payloads[a], b: payloads[b], season, possessions: 100, attackWeight: 0.5 }));
    }
    const value = { samplers, context, phaseEvidence, latents };
    samplerSets.set(phase, value);
    return value;
  }
  let regularSamplers = buildSamplers('regular');
  const nameFor = id => setup.teams[Number(String(id).slice(1))]?.name || id;
  const table = new Map(payloads.map(payload => [payload.team, { team: payload.team, displayTeam: nameFor(payload.team), wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0, expectedWins: 0, expectedWinProbabilityGames: 0, games: 0, homeGames: 0, awayGames: 0, opponentGames: [] }]));
  const pairRecords = new Map();
  const pairKey = (a, b) => ordered([a, b]).join('|');
  const pairRecord = (a, b) => {
    const key = pairKey(a, b), canonical = ordered([a, b]);
    if (!pairRecords.has(key)) pairRecords.set(key, { a: canonical[0], b: canonical[1], winsA: 0, winsB: 0, ties: 0 });
    return pairRecords.get(key);
  };
  const games = [];
  let gamesSinceCheckpoint = 0, simulatedGameCount = 0, checkpointStage = '', lastGameProgress = null;
  async function recordSimulatedGame(progress) {
    simulatedGameCount += 1;
    gamesSinceCheckpoint += 1;
    lastGameProgress = { ...progress, completedGames: simulatedGameCount };
    const checkpointKey = progress.stage === 'playoffs'
      ? `${progress.stage}:${progress.round}:${progress.seriesStage}`
      : `${progress.stage}:${progress.phase}`;
    if (gamesSinceCheckpoint < 50 && (!checkpointStage || checkpointStage === checkpointKey)) return;
    gamesSinceCheckpoint = 0;
    checkpointStage = checkpointKey;
    onGameProgress?.(lastGameProgress);
    await yieldEveryBatch?.();
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
  }
  async function flushGameCheckpoint() {
    if (gamesSinceCheckpoint > 0 && lastGameProgress) {
      gamesSinceCheckpoint = 0;
      const checkpointKey = lastGameProgress.stage === 'playoffs'
        ? `${lastGameProgress.stage}:${lastGameProgress.round}:${lastGameProgress.seriesStage}`
        : `${lastGameProgress.stage}:${lastGameProgress.phase}`;
      checkpointStage = checkpointKey;
      onGameProgress?.(lastGameProgress);
      await yieldEveryBatch?.();
    }
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
  }
  async function maybeRequestManagedDecision() {
    if (!managedMode) return;
    completedRegularGames += 1;
    if (!regularDecisionTargets.delete(completedRegularGames)) return;
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
    const upcomingGame = regularSchedule[completedRegularGames];
    const previousDecision = decisionLog.at(-1) || null;
    const completedSegment = summarizeRegularSegment({
      startGameIndex: previousDecision?.effectiveGameIndex || 1,
      endGameIndex: completedRegularGames,
      decisionIndex: decisionLog.length,
      ownOffense: currentMatchupWeights.ownOffense,
      opponentDefense: currentMatchupWeights.opponentDefense,
    });
    const selected = await onDecisionCheckpoint({
      seasonStartYear: season,
      repeat,
      completedGames: completedRegularGames,
      totalGames: regularSchedule.length,
      effectiveGameIndex: completedRegularGames + 1,
      effectiveGameId: upcomingGame?.id || null,
      currentOwnOffense: currentMatchupWeights.ownOffense,
      currentOpponentDefense: currentMatchupWeights.opponentDefense,
      completedSegment: { ...completedSegment, kind: previousDecision ? 'managed-choice' : 'baseline' },
    });
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
    const ownOffense = Number(typeof selected === 'object' && selected !== null ? selected.ownOffense : selected);
    if (!MANAGED_SCORING_MIXES.has(ownOffense)) fail('Choose a supported managed scoring mix before continuing Season Lab.');
    const timestamp = new Date().toISOString();
    decisionLog.push({
      decisionType: 'native-matchup-scoring-blend',
      timestamp,
      seasonStartYear: season,
      repeat,
      checkpointGameIndex: completedRegularGames,
      effectiveGameIndex: completedRegularGames + 1,
      effectiveGameId: upcomingGame?.id || null,
      previousOwnOffense: currentMatchupWeights.ownOffense,
      previousOpponentDefense: currentMatchupWeights.opponentDefense,
      ownOffense,
      opponentDefense: 1 - ownOffense,
    });
    currentMatchupWeights = { ownOffense, opponentDefense: 1 - ownOffense };
    samplerSets.delete('regular');
    regularSamplers = buildSamplers('regular');
  }
  async function simulateScheduledGame(scheduled, { gameNumber = games.length + 1, stage = 'schedule' } = {}) {
    if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
    if (!scheduled.home || !scheduled.away || !table.has(scheduled.home) || !table.has(scheduled.away)) fail('The selected schedule references a team outside the league.');
    const phase = SUPPORTED_PHASES.has(String(scheduled.phase || 'regular')) ? String(scheduled.phase || 'regular') : 'regular';
    const countsTowardTable = standingsEligible({ ...scheduled, phase });
    const samplerSet = phase === 'regular' ? regularSamplers : buildSamplers(phase);
    const key = pairKey(scheduled.home, scheduled.away), sampler = samplerSet.samplers.get(key);
    if (!sampler) fail(`No scoring sampler is available for ${scheduled.home} versus ${scheduled.away}.`);
    // Every standings-eligible Cup-mode game needs a win/loss for the exact
    // 82-game record and group/knockout ledgers. Keep all of those games under
    // the same bounded ten-OT policy; non-Cup runs keep the simulator default.
    const cupStandingsGame = isCupCompletion && countsTowardTable;
    const maxOvertimes = cupStandingsGame ? 10 : GAME_LAB_POLICY.maxOvertimes;
    const result = sampler.play(random, ...(cupStandingsGame ? [{ maxOvertimes }] : [])), canonical = ordered([scheduled.home, scheduled.away]), first = canonical[0] === scheduled.home;
    const scoreHome = first ? result.a : result.b, scoreAway = first ? result.b : result.a;
    const winner = result.winner === 'unresolved' ? null : (first ? (result.winner === 'a' ? scheduled.home : scheduled.away) : (result.winner === 'a' ? scheduled.away : scheduled.home));
    const overtimePointsA = Number.isFinite(Number(result.overtimePointsA)) ? Number(result.overtimePointsA)
      : Array.isArray(result.overtime) ? result.overtime.reduce((sum, period) => sum + (Number(period.a) || 0), 0) : 0;
    const overtimePointsB = Number.isFinite(Number(result.overtimePointsB)) ? Number(result.overtimePointsB)
      : Array.isArray(result.overtime) ? result.overtime.reduce((sum, period) => sum + (Number(period.b) || 0), 0) : 0;
    const regulationA = Number.isFinite(Number(result.regulation?.a)) ? Number(result.regulation.a) : scoreHome;
    const regulationB = Number.isFinite(Number(result.regulation?.b)) ? Number(result.regulation.b) : scoreAway;
    const regulationHomeScore = first ? regulationA : regulationB;
    const regulationAwayScore = first ? regulationB : regulationA;
    const homeOvertimePoints = first ? overtimePointsA : overtimePointsB;
    const awayOvertimePoints = first ? overtimePointsB : overtimePointsA;
    if (cupStandingsGame && winner === null) {
      fail(`NBA Cup schedule game ${scheduled.id || `${scheduled.home} at ${scheduled.away}`} remained tied after the ten-overtime limit; every standings-eligible game needs a decided winner.`);
    }
    const home = table.get(scheduled.home), away = table.get(scheduled.away);
    const probabilityCanonical = typeof sampler.expectedWinProbabilityForOvertimes === 'function'
      ? sampler.expectedWinProbabilityForOvertimes(maxOvertimes) : null;
    const probabilityAvailable = Number.isFinite(probabilityCanonical) && probabilityCanonical >= 0 && probabilityCanonical <= 1;
    const probabilityHome = probabilityAvailable ? (first ? probabilityCanonical : 1 - probabilityCanonical) : null;
    const probabilityUnavailableReason = probabilityAvailable ? null
      : Number.isFinite(probabilityCanonical) ? 'sampler-probability-out-of-range' : 'sampler-probability-unavailable';
    if (countsTowardTable) {
      home.games += 1; away.games += 1; home.homeGames += 1; away.awayGames += 1;
      if (probabilityAvailable) {
        home.expectedWins += probabilityHome; away.expectedWins += 1 - probabilityHome;
        home.expectedWinProbabilityGames += 1; away.expectedWinProbabilityGames += 1;
      }
      home.pointsFor += scoreHome; home.pointsAgainst += scoreAway; away.pointsFor += scoreAway; away.pointsAgainst += scoreHome;
      home.opponentGames.push({ team: scheduled.away, outcome: winner === null ? 'tie' : winner === scheduled.home ? 'win' : 'loss', phase });
      away.opponentGames.push({ team: scheduled.home, outcome: winner === null ? 'tie' : winner === scheduled.away ? 'win' : 'loss', phase });
      const pair = pairRecord(scheduled.home, scheduled.away);
      if (winner === null) { home.ties += 1; away.ties += 1; pair.ties += 1; }
      else { table.get(winner).wins += 1; table.get(winner === scheduled.home ? scheduled.away : scheduled.home).losses += 1; if (winner === pair.a) pair.winsA += 1; else pair.winsB += 1; }
    }
    const simulated = { ...scheduled, phase, standingsEligible: countsTowardTable,
      ...(phase === 'regular' ? { regularGameIndex: completedRegularGames + 1 } : {}),
      homeId: scheduled.home, awayId: scheduled.away,
      homeTeamId: setup.teams[Number(String(scheduled.home).slice(1))]?.id || scheduled.home,
      awayTeamId: setup.teams[Number(String(scheduled.away).slice(1))]?.id || scheduled.away,
      home: nameFor(scheduled.home), away: nameFor(scheduled.away), scoreHome, scoreAway,
      regulationHomeScore, regulationAwayScore, homeOvertimePoints, awayOvertimePoints,
      expectedHome: rounded(first ? sampler.metadata?.expectedPointsA : sampler.metadata?.expectedPointsB),
      expectedAway: rounded(first ? sampler.metadata?.expectedPointsB : sampler.metadata?.expectedPointsA),
      expectedWinProbabilityHome: rounded(probabilityHome),
      expectedWinProbabilityStatus: probabilityAvailable ? 'available' : 'unavailable',
      expectedWinProbabilityReason: probabilityUnavailableReason,
      expectedWinProbabilityMethod: typeof sampler.metadata?.winProbabilityMeanSource === 'string' ? sampler.metadata.winProbabilityMeanSource : null,
      forecastNetRatingRmse: rounded(sampler.metadata?.forecastNetRatingRmse),
      forecastMarginSd: rounded(sampler.metadata?.forecastMarginSd),
      forecastUncertaintySource: sampler.metadata?.forecastUncertaintySource || 'unavailable',
      winner: winner ? nameFor(winner) : null, overtimes: result.overtimes,
      possessions: result.possessions ?? sampler.metadata?.possessions ?? null,
      outcomeModel: sampler.metadata?.outcomeModel || null, scoringEventRule: sampler.metadata?.scoringEventRule || null,
      fourFactorInteraction: sampler.metadata?.fourFactorInteraction || null,
      eventsHome: first ? result.eventsA || null : result.eventsB || null,
      eventsAway: first ? result.eventsB || null : result.eventsA || null,
      matchupWeights: sampler.metadata?.matchupWeights ? { ...sampler.metadata.matchupWeights } : null };
    games.push(simulated);
    await recordSimulatedGame({ stage, phase, gameNumber, gamesInStage: setup.scheduledGames,
      home: nameFor(scheduled.home), away: nameFor(scheduled.away), gameId: scheduled.id || null,
      scheduledAt: scheduled.scheduledAt || scheduled.scheduleWindow || null });
    if (phase === 'regular') await maybeRequestManagedDecision();
    emitCupLifecycle('calendar-game-complete', {
      gameId: simulated.id,
      calendarDate: nbaCupCalendarDate(scheduled),
      scheduledAt: scheduled.scheduledAt || null,
      scheduleWindow: scheduled.scheduleWindow || null,
      groupId: scheduled.groupId || null,
      evidenceStatus: scheduled.evidenceStatus || null,
      scenarioGenerated: scheduled.scenarioGenerated === true,
      sourceId: scheduled.sourceId || null,
      sourceSlot: scheduled.sourceSlot ?? null,
      round: scheduled.round || null,
      phase,
    });
    return simulated;
  }

  let cupRun = null;
  if (isCupCompletion) {
    const groupSchedule = scheduleInput.filter(game => game.groupId);
    if (groupSchedule.length !== 60 || groupSchedule.some(game => !game.scheduledAt || !Number.isFinite(Date.parse(game.scheduledAt)))) {
      fail('The NBA Cup run needs all 60 dated Group Play games before it can compile the completion schedule.');
    }
    const groupStageEnd = Math.max(...groupSchedule.map(game => Date.parse(game.scheduledAt)));
    const groupStageCalendar = scheduleInput.filter(game => Date.parse(game.scheduledAt) <= groupStageEnd);
    const completedPublishedIds = new Set();
    for (const scheduled of groupStageCalendar) {
      await simulateScheduledGame(scheduled, { gameNumber: games.length + 1 });
      completedPublishedIds.add(scheduled.id);
    }

    const cupConferenceByGroup = new Map(cupArtifact.groups.map(group => [group.groupId || group.id, group.conference]));
    const simulatedById = new Map(games.map(game => [game.id, game]));
    const groupResults = cupArtifact.announcedGames.filter(game => game.groupId).map(game => {
      const result = simulatedById.get(game.id);
      if (!result) fail(`Published NBA Cup Group Play game ${game.id} was not simulated exactly once.`);
      return { id: game.id, groupId: game.groupId, conference: cupConferenceByGroup.get(game.groupId), home: game.home, away: game.away,
        homeScore: result.scoreHome, awayScore: result.scoreAway,
        homeOvertimePoints: result.homeOvertimePoints, awayOvertimePoints: result.awayOvertimePoints,
        overtimePeriods: result.overtimes };
    });
    if (groupResults.length !== 60) fail('NBA Cup completion compilation needs exactly 60 simulated published Group Play results.');
    emitCupLifecycle('group-stage-complete', {
      groupResultCount: groupResults.length,
      publishedGamesCompleted: completedPublishedIds.size,
      groupStageEnd: new Date(groupStageEnd).toISOString(),
      priorSeasonRecordsSourceReceipt: cupCompletion.priorSeasonRecordsSourceReceipt || null,
    });

    const plan = generateNbaCupScheduleCompletion({ seasonStartYear: 2026, announcedGames: cupArtifact.announcedGames,
      groups: cupArtifact.groups, groupResults, priorSeasonRecords: cupCompletion.priorSeasonRecords,
      seed: replaySeed(setup.randomness.seed, season, repeat) });
    const quarterfinals = plan.games.filter(game => game.round === 'quarterfinal');
    if (quarterfinals.length !== 4) fail('NBA Cup completion must compile four conditional Quarterfinal games.');
    const quarterfinalDate = quarterfinals.map(nbaCupCalendarDate).filter(Boolean).sort()[0];
    if (!quarterfinalDate) fail('NBA Cup Quarterfinals need a dated schedule window before the published calendar can resume.');
    emitCupLifecycle('completion-compiled', { seed: plan.seed, groupResultCount: groupResults.length, generatedGameCount: plan.games.length,
      quarterfinalDate, priorSeasonRecordsSourceReceipt: cupCompletion.priorSeasonRecordsSourceReceipt || null });

    const preQuarterfinalGames = scheduleInput.filter(game => !completedPublishedIds.has(game.id)
      && nbaCupCalendarDate(game) && nbaCupCalendarDate(game) < quarterfinalDate);
    for (const scheduled of preQuarterfinalGames) {
      await simulateScheduledGame(scheduled, { gameNumber: games.length + 1 });
      completedPublishedIds.add(scheduled.id);
    }
    emitCupLifecycle('pre-quarterfinal-calendar-complete', { publishedGamesCompleted: completedPublishedIds.size,
      quarterfinalDate, remainingPublishedGames: scheduleInput.length - completedPublishedIds.size });

    const quarterfinalResults = [];
    for (const quarterfinal of quarterfinals.sort(compareNbaCupCalendarGames)) {
      const scheduled = { ...quarterfinal, home: internal.get(quarterfinal.home), away: internal.get(quarterfinal.away) };
      const result = await simulateScheduledGame(scheduled, { stage: 'schedule', gameNumber: games.length + 1 });
      if (!result.winner) fail(`NBA Cup Quarterfinal ${quarterfinal.id} remained tied after ten overtime periods.`);
      quarterfinalResults.push({ gameId: quarterfinal.id, homeScore: result.scoreHome, awayScore: result.scoreAway });
    }
    emitCupLifecycle('quarterfinals-complete', { quarterfinalResultCount: quarterfinalResults.length });

    // Conditional participants are resolved once, after the four published-window
    // Quarterfinals have results, then the remaining calendar resumes in order.
    const resolved = resolveNbaCupScheduleCompletion(plan, { quarterfinalResults });
    const quarterfinalIds = new Set(quarterfinalResults.map(game => game.gameId));
    emitCupLifecycle('conditional-round-resolved', { quarterfinalResultCount: quarterfinalResults.length,
      generatedGameCount: resolved.games.length, unresolvedParticipants: resolved.games.some(game => !game.home || !game.away) });

    const sourceRowsUnchanged = publishedScheduleMatchesArtifact
      && cupScheduleRowsMatchArtifact(resolved.scheduleGames.slice(0, cupArtifact.announcedGames.length),
        cupArtifact.announcedGames, new Map());
    if (!sourceRowsUnchanged) fail('The NBA Cup completion changed an official published schedule row.');
    const generatedEvents = resolved.games.filter(game => !quarterfinalIds.has(game.id));
    const generatedEventIds = new Set(generatedEvents.map(game => game.id));
    const remainingPublishedGames = scheduleInput.filter(game => !completedPublishedIds.has(game.id));
    const resumedEvents = [...remainingPublishedGames, ...generatedEvents].sort(compareNbaCupCalendarGames);
    emitCupLifecycle('calendar-resumed', { remainingPublishedGames: remainingPublishedGames.length,
      remainingGeneratedGames: generatedEvents.length, publishedGamesCompleted: completedPublishedIds.size });
    for (const scheduled of resumedEvents) {
      const isGenerated = generatedEventIds.has(scheduled.id);
      const internalGame = isGenerated
        ? { ...scheduled, home: internal.get(scheduled.home), away: internal.get(scheduled.away) }
        : scheduled;
      const result = await simulateScheduledGame(internalGame, { stage: 'schedule', gameNumber: games.length + 1 });
      if (!result.winner) fail(`NBA Cup game ${scheduled.id} remained tied after ten overtime periods.`);
      if (!isGenerated) completedPublishedIds.add(scheduled.id);
    }
    if (completedPublishedIds.size !== cupArtifact.announcedGames.length) {
      fail('NBA Cup schedule resumption must simulate every published row exactly once.');
    }
    emitCupLifecycle('calendar-complete', { publishedGamesCompleted: completedPublishedIds.size,
      generatedGamesCompleted: generatedEvents.length + quarterfinals.length });

    const generatedIds = new Set(resolved.games.map(game => game.id));
    const generatedResults = new Map(games.filter(game => generatedIds.has(game.id)).map(game => [game.id, game]));
    const orderedGeneratedResults = resolved.games.map(game => generatedResults.get(game.id));
    if (orderedGeneratedResults.some(game => !game)) fail('NBA Cup completion did not reuse every generated game result exactly once.');
    if (games.length !== scheduleInput.length + resolved.games.length) {
      fail('NBA Cup lifecycle did not simulate every announced and generated game exactly once.');
    }
    const appearancesPerTeam = Object.fromEntries(setup.teams.map(team => [team.id, 0]));
    games.forEach(game => {
      if (game.standingsEligible !== true) return;
      appearancesPerTeam[game.homeTeamId] += 1;
      appearancesPerTeam[game.awayTeamId] += 1;
    });
    if (Object.values(appearancesPerTeam).some(count => count !== 82)) fail('NBA Cup completion must give every team exactly 82 standings-eligible games.');
    cupRun = { status: 'complete', kind: resolved.kind, format: resolved.format, seasonStartYear: resolved.seasonStartYear,
      repeat, replayKey, seed: resolved.seed, sourceReceipt: resolved.sourceReceipt, priorSeasonRecordsSourceReceipt: cupCompletion.priorSeasonRecordsSourceReceipt || null,
      groupPlayLedger: { status: 'complete', count: groupResults.length, games: groupResults.map(game => ({ ...game })) },
      publishedSchedule: { announcedGames: resolved.coverage.announcedGamesPreserved, unchanged: sourceRowsUnchanged,
        sourceReceipt: cupCompletion.sourceReceipt || null },
      groupStandings: resolved.groupStandings, tiebreakTrace: resolved.tiebreakTrace,
      conferenceRankings: resolved.conferenceRankings, qualifiers: resolved.qualifiers,
      games: orderedGeneratedResults, coverage: { ...resolved.coverage, appearancesPerTeam,
        standingsEligibleGames: games.filter(game => game.standingsEligible === true).length,
        decidedStandingsGames: games.filter(game => game.standingsEligible === true && game.winner).length,
        maximumOvertimePeriods: 10,
        noTiePolicy: 'Every standings-eligible game is played through at most ten overtime periods and must resolve to a winner.',
        cupChampionship: 'excluded-from-regular-season-standings-and-the-82-game-schedule' },
      cupChampionship: { status: 'excluded', note: 'The NBA Cup Championship is not one of the 82 regular-season games.' },
      note: resolved.note };
  } else {
    for (const [index, scheduled] of scheduleInput.entries()) {
      await simulateScheduledGame(scheduled, { gameNumber: index + 1 });
    }
  }

  // Finish the regular-schedule batch before assembling standings and the
  // bracket so pause, cancel, and the progress display get a browser turn.
  await flushGameCheckpoint();

  const standingsGames = games.filter(game => game.standingsEligible === true);
  const rawRanked = [...table.values()].map(row => ({ ...row, tablePoints: row.wins + row.ties / 2, differential: row.pointsFor - row.pointsAgainst }));
  rawRanked.sort((a, b) => b.tablePoints - a.tablePoints || b.differential - a.differential || String(a.team).localeCompare(String(b.team)));
  const ranked = [];
  for (let start = 0; start < rawRanked.length;) {
    let end = start + 1; while (end < rawRanked.length && rawRanked[end].tablePoints === rawRanked[start].tablePoints) end += 1;
    const group = rawRanked.slice(start, end), h2hRate = row => {
      let wins = 0, ties = 0, played = 0;
      for (const other of group) if (other.team !== row.team) {
        const record = pairRecords.get(pairKey(row.team, other.team)); if (!record) continue;
        const rowIsA = record.a === row.team; wins += rowIsA ? record.winsA : record.winsB; ties += record.ties; played += rowIsA ? record.winsA + record.winsB + record.ties : record.winsA + record.winsB + record.ties;
      }
      return played ? (wins + ties / 2) / played : null;
    };
    group.forEach(row => { row.headToHeadWinRate = h2hRate(row); });
    group.sort((a, b) => (b.headToHeadWinRate ?? -1) - (a.headToHeadWinRate ?? -1) || b.differential - a.differential || String(a.team).localeCompare(String(b.team)));
    for (let index = 0; index < group.length;) {
      let tieEnd = index + 1; while (tieEnd < group.length && group[tieEnd].headToHeadWinRate === group[index].headToHeadWinRate && group[tieEnd].differential === group[index].differential) tieEnd += 1;
      for (let cursor = tieEnd - 1; cursor > index; cursor -= 1) { const swap = index + Math.floor(random() * (cursor - index + 1)); [group[cursor], group[swap]] = [group[swap], group[cursor]]; }
      ranked.push(...group.slice(index, tieEnd)); index = tieEnd;
    }
    start = end;
  }
  // Conference brackets apply their own local head-to-head and differential
  // criteria, but an exact residual tie must preserve the already-computed
  // standings order. Re-ranking that final tie by team ID would let a playoff
  // cutoff disagree with the published standings lottery.
  const globalStandingsOrder = new Map(ranked.map((row, index) => [row.team, index]));

  const scheduleStrength = new Map();
  const evidenceByInternalTeam = new Map(payloads.map((payload, index) => [payload.team, evidence[index]]));
  ranked.forEach(row => {
    const opponentRows = row.opponentGames.map(event => ({ event, row: table.get(event.team), evidence: evidenceByInternalTeam.get(event.team) })).filter(item => item.row);
    const metrics = opponentRows.map(item => item.evidence?.sample).filter(Boolean);
    let opponentWins = 0, opponentGames = 0;
    // An opponent's adjusted record is weighted by the number of scheduled
    // meetings with that opponent.  Repeating its full season record once per
    // meeting weights teams by their own game count instead, which makes the
    // result depend on the opponent's schedule rather than this team's
    // declared matchup slate.
    const meetingsByOpponent = new Map();
    row.opponentGames.forEach(event => meetingsByOpponent.set(event.team, (meetingsByOpponent.get(event.team) || 0) + 1));
    for (const [opponentId, meetings] of meetingsByOpponent.entries()) {
      const opponent = table.get(opponentId);
      if (!opponent || !Number.isInteger(meetings) || meetings < 1) continue;
      const against = opponent.opponentGames.filter(event => event.team === row.team);
      const winsAgainst = against.filter(event => event.outcome === 'win').length;
      const tiesAgainst = against.filter(event => event.outcome === 'tie').length;
      const adjustedGames = Math.max(0, opponent.games - against.length);
      const adjustedWins = opponent.wins - winsAgainst + 0.5 * (opponent.ties - tiesAgainst);
      if (adjustedGames > 0) {
        opponentWins += meetings * adjustedWins / adjustedGames;
        opponentGames += meetings;
      }
    }
    const opponentAverageNet = metrics.length ? metrics.reduce((sum, metric) => sum + metric.netRating, 0) / metrics.length : null;
    const nativeCount = opponentRows.filter(item => ['native-rate', 'forecast-rate'].includes(item.evidence?.kind)).length;
    scheduleStrength.set(row.team, { games: opponentRows.length, opponentAverageOffense: rounded(metrics.length ? metrics.reduce((sum, metric) => sum + metric.offensiveRating, 0) / metrics.length : null),
      opponentAverageDefense: rounded(metrics.length ? metrics.reduce((sum, metric) => sum + metric.defensiveRating, 0) / metrics.length : null), opponentAverageNet: rounded(opponentAverageNet),
      opponentWinRate: opponentGames > 0 ? rounded(opponentWins / opponentGames) : null,
      scheduleIndex: regularContext.baselineNet !== null && opponentAverageNet !== null ? rounded(opponentAverageNet - regularContext.baselineNet) : null,
      homeGames: row.homeGames, awayGames: row.awayGames, homeAwayBalance: row.homeGames - row.awayGames,
      nativeCoverage: opponentRows.length ? rounded(nativeCount / opponentRows.length) : null,
      note: 'Strength of schedule uses the selected opponents actually declared; opponent win rate excludes games against this team.' });
  });
  const totalExpectedWinProbabilityGames = [...table.values()].reduce((sum, row) => sum + row.expectedWinProbabilityGames, 0) / 2;
  const expectedWinProbabilityCoverageStatus = standingsGames.length > 0
    && [...table.values()].every(row => row.games > 0 && row.expectedWinProbabilityGames === row.games)
    ? 'available'
    : totalExpectedWinProbabilityGames > 0 ? 'partial' : 'unavailable';
  const expectedWinProbabilityCoverageReason = expectedWinProbabilityCoverageStatus === 'available' ? null
    : standingsGames.length === 0 ? 'no-standings-eligible-games'
      : 'one-or-more-standings-eligible-games-have-no-valid-probability';
  const expectedRankByTeam = expectedWinProbabilityCoverageStatus === 'available'
    ? new Map([...table.values()].sort((left, right) => right.expectedWins - left.expectedWins || String(left.team).localeCompare(String(right.team))).map((row, index) => [row.team, index + 1]))
    : new Map();
  const netRankByTeam = new Map([...table.values()].sort((left, right) => {
    const leftNet = evidenceByInternalTeam.get(left.team)?.sample?.netRating;
    const rightNet = evidenceByInternalTeam.get(right.team)?.sample?.netRating;
    return (Number.isFinite(rightNet) ? rightNet : -Infinity) - (Number.isFinite(leftNet) ? leftNet : -Infinity) || String(left.team).localeCompare(String(right.team));
  }).map((row, index) => [row.team, index + 1]));
  const consistencyRows = ranked.map(row => {
    const evidenceRow = evidenceByInternalTeam.get(row.team);
    const expectedRank = expectedRankByTeam.get(row.team) || null, netRank = netRankByTeam.get(row.team) || null;
    const divergence = expectedRank !== null && netRank !== null ? Math.abs(expectedRank - netRank) : null;
    return { team: row.team, expectedWinRank: expectedRank, nativeNetRank: netRank, divergence, nativeNet: rounded(evidenceRow?.sample?.netRating),
      reason: expectedRank === null ? expectedWinProbabilityCoverageReason : divergence === null ? 'native-net-rank-unavailable' : null,
      status: divergence === null ? 'unavailable' : divergence >= Math.max(3, Math.ceil(setup.teams.length * 0.2)) ? 'divergence-explained' : 'aligned' };
  });
  const comparableConsistencyRows = consistencyRows.filter(row => row.divergence !== null);
  const consistencyAudit = { status: standingsGames.length === 0 || !comparableConsistencyRows.length ? 'unavailable' : consistencyRows.some(row => row.status === 'divergence-explained') ? 'divergence-explained' : 'aligned',
    expectedWinProbabilityCoverage: { status: expectedWinProbabilityCoverageStatus, availableGames: totalExpectedWinProbabilityGames,
      standingsGames: standingsGames.length, reason: expectedWinProbabilityCoverageReason },
    rows: standingsGames.length === 0 ? consistencyRows.map(row => ({ ...row, status: 'unavailable', reason: 'no-standings-eligible-games' })) : consistencyRows,
    note: 'Standings are sampled game outcomes. Expected-win rank uses matchup probabilities, while native-net rank is an isolated team-style ordering; schedule strength, home/away balance, parameter draws, and game noise can legitimately separate them. The audit exposes the separation instead of overwriting either result. If no standings-eligible games are declared, rank divergence is unavailable.' };
  const scheduledCounts = new Map(setup.teams.map(team => [team.id, 0]));
  games.forEach(game => {
    for (const teamId of [game.homeTeamId, game.awayTeamId]) if (scheduledCounts.has(teamId)) {
      scheduledCounts.set(teamId, scheduledCounts.get(teamId) + 1);
    }
  });
  const counts = [...table.values()].map(row => row.games), gamesPerTeam = counts.length && new Set(counts).size === 1 ? counts[0] : undefined,
    averageGamesPerTeam = rounded(standingsGames.length * 2 / setup.teams.length), scheduleAudit = { status: standingsGames.length === 0 ? 'no-standings-eligible-games' : new Set(counts).size === 1 ? 'balanced' : 'uneven-declared-schedule', minGames: Math.min(...counts), maxGames: Math.max(...counts), totalGames: games.length,
    leagueStructure: setup.leagueStructure,
    standingsGames: standingsGames.length, gamesPerTeam, averageGamesPerTeam,
    scheduledGamesPerTeam: rounded(games.length * 2 / setup.teams.length),
    perTeam: Object.fromEntries([...table.values()].map(row => [setup.teams[Number(String(row.team).slice(1))].id, row.games])),
    scheduledPerTeam: Object.fromEntries([...scheduledCounts.entries()]),
    phaseGameCounts: Object.fromEntries([...games.reduce((phaseCounts, game) => phaseCounts.set(game.phase, (phaseCounts.get(game.phase) || 0) + 1), new Map()).entries()]),
    standingsPhaseGameCounts: Object.fromEntries([...standingsGames.reduce((phaseCounts, game) => phaseCounts.set(game.phase, (phaseCounts.get(game.phase) || 0) + 1), new Map()).entries()]),
    context: scheduleContextAudit(games, setup.teams),
    note: setup.schedule.kind === 'nba-cup-completion'
      ? 'The published 2026–27 NBA Cup calendar stays unchanged. Each replay adds only its seeded Cup knockout and regular-season completion games; all Cup Group Play, Quarterfinal, and Semifinal games count toward standings, while the Cup Championship is excluded.'
      : setup.schedule.kind === 'round-robin'
      ? 'Round-robin target is balanced by construction. Non-regular phases remain in the calendar but do not enter standings unless explicitly marked standingsEligible.'
      : 'Actual/custom declarations are audited but not silently padded or rejected. Non-regular phases remain in the calendar but do not enter standings unless explicitly marked standingsEligible.' };
  const playerStatsByTeam = new Map();
  const teamTotalsReconciliation = Object.fromEntries([...table.values()].map(row => {
    const ledger = { wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 };
    standingsGames.forEach(game => {
      if (game.homeId !== row.team && game.awayId !== row.team) return;
      const isHome = game.homeId === row.team;
      const score = Number(isHome ? game.scoreHome : game.scoreAway) || 0;
      const opponentScore = Number(isHome ? game.scoreAway : game.scoreHome) || 0;
      ledger.games += 1; ledger.pointsFor += score; ledger.pointsAgainst += opponentScore;
      if (score === opponentScore) ledger.ties += 1;
      else if (score > opponentScore) ledger.wins += 1;
      else ledger.losses += 1;
    });
    const fields = ['wins', 'losses', 'ties', 'games', 'pointsFor', 'pointsAgainst'];
    const mismatches = fields.filter(key => Number(ledger[key]) !== Number(row[key]));
    return [setup.teams[Number(String(row.team).slice(1))].id, {
      status: mismatches.length ? 'mismatch' : ledger.games ? 'reconciled' : 'unavailable',
      source: 'standings-eligible-game-ledger', ledger, standings: Object.fromEntries(fields.map(key => [key, row[key]])),
      mismatches,
    }];
  }));
  for (const row of table.values()) {
    const teamConfig = setup.teams[Number(String(row.team).slice(1))];
    const teamId = teamConfig.id;
    const payload = suppliedPayloads.get(teamId) || {};
    playerStatsByTeam.set(teamId, buildPlayerSeasonStats({ payload, teamConfig, season: evidenceSeasonStartYear, teamGames: row.games, teamPoints: row.pointsFor, replayKey }));
  }
  const playerGameLogsByTeam = buildPlayerGameLogs({ games: standingsGames, setup, playerStatsByTeam });
  const standings = ranked.map((row, index) => {
    const teamConfig = setup.teams[Number(String(row.team).slice(1))];
    const teamId = teamConfig.id;
    const payload = suppliedPayloads.get(teamId) || {};
    const audit = consistencyRows.find(item => item.team === row.team);
    const simulatedMetrics = {
      offense: row.games ? rounded(row.pointsFor / row.games) : null,
      defense: row.games ? rounded(row.pointsAgainst / row.games) : null,
      net: row.games ? rounded((row.pointsFor - row.pointsAgainst) / row.games) : null,
      unit: 'points-per-game',
      status: row.games ? 'simulated-outcome-rate' : 'unavailable',
      note: 'Derived from this replay\'s team scores; it is not a replacement for the selected native package rate.'
    };
    const expectedWinProbabilityAvailable = row.games > 0 && row.expectedWinProbabilityGames === row.games;
    const expectedWinProbabilityStatus = expectedWinProbabilityAvailable ? 'available'
      : row.expectedWinProbabilityGames > 0 ? 'partial' : 'unavailable';
    const expectedWinProbabilityReason = expectedWinProbabilityAvailable ? null
      : row.games === 0 ? 'no-standings-eligible-games' : 'one-or-more-standings-eligible-games-have-no-valid-probability';
    return {
      seed: index + 1, team: row.team, displayTeam: row.displayTeam, teamId, conference: teamConfig.conference || null, division: teamConfig.division || null, wins: row.wins, losses: row.losses, ties: row.ties, games: row.games, winRate: row.games ? rounded(row.wins / row.games) : null,
      expectedWins: expectedWinProbabilityAvailable ? rounded(row.expectedWins) : null,
      expectedWinRate: expectedWinProbabilityAvailable ? rounded(row.expectedWins / row.games) : null,
      expectedWinProbabilityCoverage: { status: expectedWinProbabilityStatus, availableGames: row.expectedWinProbabilityGames, standingsGames: row.games, reason: expectedWinProbabilityReason },
      expectedWinRank: audit?.expectedWinRank ?? null, expectedWinRankStatus: audit?.expectedWinRank === null || audit?.expectedWinRank === undefined ? 'unavailable' : 'available',
      nativeNetRank: audit?.nativeNetRank ?? null, standingsConsistency: audit?.status || 'unavailable',
      pointsFor: row.pointsFor, pointsAgainst: row.pointsAgainst, pointDifferential: row.differential, tablePoints: rounded(row.tablePoints), headToHeadWinRate: rounded(row.headToHeadWinRate), scheduleStrength: scheduleStrength.get(row.team), simulatedMetrics,
      nativeMetrics: nativeMetrics(evidence[Number(String(row.team).slice(1))], { teamId, season, source: setup.source }),
      playerStats: playerStatsByTeam.get(teamId), playerGameLogs: playerGameLogsByTeam.get(teamId),
      rotationUsage: rotationUsage({ ...payload, rosterMode: teamConfig.rosterMode, roster: teamConfig.roster ?? payload.roster, seasonGames: row.games }, evidenceSeasonStartYear),
    };
  });

  let bracket = [], champion = null, championId = null, playoffFieldIds = [], playoffIntegrity = null, playoffRateScenario = null;
  const conferenceSeedByInternal = new Map();
  if (setup.playoff.enabled) {
    const retrospectiveSameSeasonReplay = setup.source.kind === 'exact-season' && nativeMode;
    const playoffEvidencePhase = retrospectiveSameSeasonReplay ? 'playoffs' : 'regular';
    playoffRateScenario = {
      policy: PLAYOFF_RATE_SELECTION_POLICY,
      mode: retrospectiveSameSeasonReplay ? 'retrospective-same-season-playoff-replay' : 'regular-season-rate-scenario',
      requestedPhase: 'playoffs', ratePhase: playoffEvidencePhase, evidenceSeasonStartYear,
      postseasonCalibration: retrospectiveSameSeasonReplay
        ? 'same-season-observed-playoff-profile-when-present-otherwise-regular-fallback'
        : 'unavailable-prior-season-postseason-calibration',
      note: retrospectiveSameSeasonReplay
        ? 'This is a retrospective exact-season replay. It may use the exact same-season observed playoff phase profile; teams without one use their regular profile. It is not a forecast.'
        : 'No accepted prior-season postseason calibration exists for this run. Playoff outcomes use only regular-season rates and do not read target-season playoff profiles.',
    };
    const playoffEvidenceSet = buildSamplers('playoffs', { evidencePhase: playoffEvidencePhase });
    const playoffSamplers = playoffEvidenceSet.samplers;
    const teamConfigFor = internalTeam => internalTeam ? setup.teams[Number(String(internalTeam).slice(1))] || null : null;
    const externalIdFor = internalTeam => teamConfigFor(internalTeam)?.id || null;
    const playoffEvidenceByInternalTeam = new Map(payloads.map((payload, index) => [payload.team, playoffEvidenceSet.phaseEvidence[index]]));
    const playoffParticipantEvidence = internalTeam => {
      const teamId = externalIdFor(internalTeam), evidenceItem = internalTeam ? playoffEvidenceByInternalTeam.get(internalTeam) : null;
      return { status: evidenceItem?.status || 'unavailable', teamId, seasonStartYear: season,
        requestedPhase: 'playoffs', selectedPhase: evidenceItem?.selectedPhase || null,
        phaseFallback: evidenceItem?.phaseFallback === true,
        basis: playoffRateScenario.mode === 'regular-season-rate-scenario' ? 'regular-season-rate-scenario'
          : evidenceItem?.selectedPhase === 'playoffs' ? 'same-season-observed-playoff-profile'
          : setup.source.kind === 'forecast-season' ? 'accepted-projected-team-rates'
          : setup.source.kind === 'year-advance-scenario' ? 'held-constant-prior-season-native-rates'
          : nativeMode ? (evidenceItem?.phaseFallback ? 'regular-profile-fallback' : 'phase-specific-native-profile')
            : 'selected-season-possession-outcome-evidence',
        rateScenario: playoffRateScenario.mode,
        phaseSelectionReason: evidenceItem?.phaseSelectionReason || (evidenceItem?.phaseFallback ? 'same-season-playoff-profile-unavailable-regular-profile-fallback' : null),
        snapshot: evidenceItem?.snapshot || null, packageRef: evidenceItem?.packageRef || null,
        sourceReceipt: evidenceItem?.sourceReceipt || sourceReceiptForSeason(setup.source, season),
        reason: evidenceItem?.status === 'ready' ? null : evidenceItem?.reason || 'No resolved participant evidence is available for this bracket path.' };
    };
    const stageFor = (fieldSize, conference) => {
      if (!conference) return 'generic-round';
      if (fieldSize === 8) return 'conference-quarterfinal';
      if (fieldSize === 4) return 'conference-semifinal';
      if (fieldSize === 2) return 'conference-final';
      return 'conference-round';
    };
    const rankBracketTeams = members => {
      const groups = new Map();
      members.forEach(row => { const group = groups.get(row.tablePoints) || []; group.push(row); groups.set(row.tablePoints, group); });
      return [...groups.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).flatMap(([, group]) => group.map(row => {
        let wins = 0, ties = 0, played = 0;
        for (const other of group) if (other.team !== row.team) {
          const record = pairRecords.get(pairKey(row.team, other.team)); if (!record) continue;
          const rowIsA = record.a === row.team;
          wins += rowIsA ? record.winsA : record.winsB; ties += record.ties;
          played += record.winsA + record.winsB + record.ties;
        }
        return { row, h2hWinRate: played ? (wins + ties / 2) / played : null };
      }).sort((a, b) => (b.h2hWinRate ?? -1) - (a.h2hWinRate ?? -1)
        || b.row.differential - a.row.differential
        || (globalStandingsOrder.get(a.row.team) ?? Number.MAX_SAFE_INTEGER) - (globalStandingsOrder.get(b.row.team) ?? Number.MAX_SAFE_INTEGER)
        || String(a.row.team).localeCompare(String(b.row.team))).map(item => ({ ...item.row, headToHeadWinRate: item.h2hWinRate })));
    };
    const seedInfo = (team, conference) => {
      if (conference && conference !== 'finals') {
        const seed = conferenceSeedByInternal.get(team);
        if (Number.isInteger(seed)) return { seed, scope: 'conference' };
      }
      const order = globalStandingsOrder.get(team);
      return Number.isInteger(order) ? { seed: order + 1, scope: 'league' } : { seed: null, scope: 'league' };
    };
    const runSeries = async ({ a, b, round, conference = null, stage = 'generic-round' }) => {
      const seedA = seedInfo(a, conference), seedB = seedInfo(b, conference);
      const aHasHomeCourt = seedA.seed != null && (seedB.seed == null || seedA.seed <= seedB.seed);
      const homeCourtInternal = aHasHomeCourt ? a : b;
      const awayCourtInternal = homeCourtInternal === a ? b : a;
      const homeCourtSeed = homeCourtInternal === a ? seedA : seedB;
      const awayCourtSeed = homeCourtInternal === a ? seedB : seedA;
      const venueSchedule = Array.from({ length: setup.playoff.seriesLength }, (_, index) => {
        const game = index + 1;
        const homeInternal = PLAYOFF_HOME_COURT_GAMES.has(game) ? homeCourtInternal : awayCourtInternal;
        const awayInternal = homeInternal === a ? b : a;
        return { game, homeTeamId: externalIdFor(homeInternal), awayTeamId: externalIdFor(awayInternal) };
      });
      const series = { round, stage, conference, seasonStartYear: season, replayKey, phase: 'playoffs',
        rateScenario: playoffRateScenario.mode,
        venuePolicy: PLAYOFF_VENUE_POLICY,
        homeCourt: { teamId: externalIdFor(homeCourtInternal), seed: homeCourtSeed.seed, seedScope: homeCourtSeed.scope,
          basis: conference && conference !== 'finals' ? 'higher-regular-season-conference-seed' : 'higher-regular-season-league-order' },
        venueSchedule,
        phaseEvidence: { requestedPhase: 'playoffs', a: playoffParticipantEvidence(a), b: playoffParticipantEvidence(b) },
        a: a ? nameFor(a) : 'Unresolved', b: b ? nameFor(b) : 'Unresolved',
        aId: externalIdFor(a), bId: externalIdFor(b), winsA: 0, winsB: 0, winner: null, winnerId: null, games: [] };
      if (!a || !b) return { winnerInternal: null, series };
      const needed = Math.floor(setup.playoff.seriesLength / 2) + 1;
      for (let game = 0; game < setup.playoff.seriesLength && series.winsA < needed && series.winsB < needed; game += 1) {
        if (signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
        const key = pairKey(a, b), sampler = playoffSamplers.get(key);
        if (!sampler) fail(`No playoff scoring sampler is available for ${a} versus ${b}.`);
        const result = sampler.play(random), canonical = ordered([a, b]), first = canonical[0] === a;
        const winner = result.winner === 'unresolved' ? null : (first ? (result.winner === 'a' ? a : b) : (result.winner === 'a' ? b : a));
        const venue = venueSchedule[game];
        const scoreA = first ? result.a : result.b, scoreB = first ? result.b : result.a;
        series.games.push({ game: game + 1, homeTeamId: venue.homeTeamId, awayTeamId: venue.awayTeamId,
          homeScore: venue.homeTeamId === externalIdFor(a) ? scoreA : scoreB,
          awayScore: venue.awayTeamId === externalIdFor(a) ? scoreA : scoreB,
          scoreA, scoreB,
          winner: winner ? nameFor(winner) : null, overtimes: result.overtimes });
        if (winner === a) series.winsA += 1; else if (winner === b) series.winsB += 1;
        await recordSimulatedGame({ stage: 'playoffs', phase: 'playoffs', round, conference, seriesStage: stage,
          gameNumber: game + 1, gamesInStage: setup.playoff.seriesLength,
          home: nameFor(venue.homeTeamId === externalIdFor(a) ? a : b),
          away: nameFor(venue.awayTeamId === externalIdFor(a) ? a : b) });
      }
      series.winnerId = series.winsA >= needed ? externalIdFor(a) : series.winsB >= needed ? externalIdFor(b) : null;
      const winnerInternal = series.winnerId ? (series.winnerId === externalIdFor(a) ? a : b) : null;
      series.winner = series.winnerId ? teamConfigFor(winnerInternal)?.name || series.winnerId : null;
      return { winnerInternal, series };
    };
    const runKnockout = async ({ seededField, conference = null, startRound = 1 }) => {
      let field = [...seededField], round = startRound;
      while (field.length > 1) {
        const next = [], stage = stageFor(field.length, conference);
        for (let index = 0; index < field.length; index += 2) {
          const result = await runSeries({ a: field[index], b: field[index + 1], round, conference, stage });
          next.push(result.winnerInternal); bracket.push(result.series);
        }
        field = next; round += 1;
      }
      return { winnerInternal: field[0] || null, nextRound: round };
    };

    const conferencePlan = setup.playoff.structure === 'conference-aware'
      ? { perConference: setup.playoff.conferenceTeams, conferences: ['east', 'west'] }
      : null;
    if (conferencePlan) {
      const conferenceWinners = {};
      let finalsRound = 1;
      for (const conference of conferencePlan.conferences) {
        const conferenceRanked = rankBracketTeams(ranked.filter(row => teamConfigFor(row.team)?.conference === conference));
        conferenceRanked.forEach((row, index) => conferenceSeedByInternal.set(row.team, index + 1));
        const seededField = playoffSeedOrder(conferencePlan.perConference)
          .map(seed => conferenceRanked[seed - 1]?.team || null);
        playoffFieldIds.push(...seededField.map(externalIdFor).filter(Boolean));
        const result = await runKnockout({ seededField, conference, startRound: 1 });
        conferenceWinners[conference] = result.winnerInternal;
        finalsRound = Math.max(finalsRound, result.nextRound);
      }
      const finals = await runSeries({ a: conferenceWinners.east, b: conferenceWinners.west, round: finalsRound,
        conference: 'finals', stage: 'finals' });
      bracket.push(finals.series);
      championId = finals.series.winnerId;
    } else {
      const seededField = playoffSeedOrder(setup.playoff.teams).map(seed => ranked[seed - 1]?.team || null);
      playoffFieldIds.push(...seededField.map(externalIdFor).filter(Boolean));
      const result = await runKnockout({ seededField });
      championId = externalIdFor(result.winnerInternal);
    }
    champion = championId ? setup.teams.find(team => team.id === championId)?.name || championId : null;
    const internalByExternal = new Map(setup.teams.map((team, index) => [team.id, `t${index}`]));
    const fieldUnique = new Set(playoffFieldIds).size === playoffFieldIds.length && playoffFieldIds.length === setup.playoff.teams;
    const missingStandingsTeams = playoffFieldIds.filter(teamId => (table.get(internalByExternal.get(teamId))?.games || 0) < 1);
    // A missing winner can originate from an unresolved tied series and then
    // propagate as a missing participant in the next knockout round. Audit all
    // bracket rows, not only rows that still have two participant IDs, so a
    // generic bracket cannot be reported as passed with an invented/absent
    // champion path.
    const seriesWithUnresolvedWinner = bracket.some(series => !series.winnerId);
    const conferenceSeries = bracket.filter(series => series.stage !== 'finals');
    const conferenceLocal = setup.playoff.structure === 'conference-aware'
      ? conferenceSeries.every(series => series.aId && series.bId
        && teamConfigFor(internalByExternal.get(series.aId))?.conference === series.conference
        && teamConfigFor(internalByExternal.get(series.bId))?.conference === series.conference)
      : null;
    const finals = bracket.find(series => series.stage === 'finals');
    const finalOpposite = setup.playoff.structure === 'conference-aware'
      ? Boolean(finals?.aId && finals?.bId
        && teamConfigFor(internalByExternal.get(finals.aId))?.conference
        && teamConfigFor(internalByExternal.get(finals.bId))?.conference
        && teamConfigFor(internalByExternal.get(finals.aId)).conference !== teamConfigFor(internalByExternal.get(finals.bId)).conference)
      : null;
    const passed = fieldUnique && missingStandingsTeams.length === 0 && !seriesWithUnresolvedWinner
      && (conferenceLocal === null || (conferenceLocal && finalOpposite));
    playoffIntegrity = { fieldUnique, fieldSize: playoffFieldIds.length, standingsEligible: missingStandingsTeams.length === 0,
      missingStandingsTeams, conferenceLocal, finalOpposite, unresolvedSeries: seriesWithUnresolvedWinner,
      status: passed ? 'passed' : seriesWithUnresolvedWinner ? 'incomplete' : 'failed' };
    if (!passed && playoffIntegrity.status === 'failed') fail('Season Lab playoff field must contain unique standings-eligible teams and preserve conference bracket constraints.');
  }
  await flushGameCheckpoint();
  standings.forEach(row => { row.conferenceSeed = conferenceSeedByInternal.get(row.team) || null; });
  const decisionSegments = decisionLog.map((decision, index) => {
    const startGameIndex = decision.effectiveGameIndex;
    const endGameIndex = decisionLog[index + 1]?.checkpointGameIndex ?? regularSchedule.length;
    return summarizeRegularSegment({ startGameIndex, endGameIndex, decisionIndex: index + 1,
      ownOffense: decision.ownOffense, opponentDefense: decision.opponentDefense });
  });
  decisionSegments.forEach((segment, index) => { decisionLog[index].resultSegment = segment; });
  const decisionPolicyId = decisionPolicyIdFor(decisionLog);
  replayKey = replayKeyForSeason(setup.randomness.seed, season, repeat, decisionLog);
  bracket.forEach(series => { series.replayKey = replayKey; });
  if (cupRun) cupRun.replayKey = replayKey;
  const runScenario = setup.scenario || managedMode || decisionLog.length > 0;
  const scheduledGames = games.length;
  const phaseGameCounts = Object.fromEntries([...games.reduce((counts, game) => counts.set(game.phase, (counts.get(game.phase) || 0) + 1), new Map()).entries()]);
  const standingsPhaseGameCounts = Object.fromEntries([...standingsGames.reduce((counts, game) => counts.set(game.phase, (counts.get(game.phase) || 0) + 1), new Map()).entries()]);
  const provenance = { seasonStartYear: season, teamIds: setup.teams.map(team => team.id), phases: phaseScopeForSeason(setup, season),
    source: sourceReceiptForSeason(setup.source, season), schedule: scheduleProvenance(setup.schedule),
    simulation: { modelVersion: SEASON_LAB_MODEL_VERSION, seed: setup.randomness.seed, repeat, replayKey } };
  const runReport = { status: 'complete', seasonStartYear: season, repeat, replayKey, decisionPolicyId, decisionLog,
    decisionSegments: decisionLog.map(item => item.resultSegment),
    decisionMode: managedMode ? 'managed-conditional-scoring-scenario' : 'unattended-replay-series',
    provenance, gamesPerTeam, averageGamesPerTeam, scheduledGames, standingsGames: standingsGames.length, regularGames: phaseGameCounts.regular || 0, phaseGameCounts, standingsPhaseGameCounts, playoffGames: bracket.reduce((sum, series) => sum + (series.games?.length || 0), 0), scheduleAudit, consistencyAudit, playoffIntegrity, playoffRateScenario,
    playoffVenuePolicy: setup.playoff.enabled ? PLAYOFF_VENUE_POLICY : null,
    teamTotalsReconciliation, cupCompletion: cupRun, modelDiagnostics: { model: SEASON_LAB_MODEL_DESIGN, native: nativeMode, forecast: allowProjected, forecastNetRatingRmse: allowProjected ? rounded(forecastNetSd) : null, forecastPaceFactor: allowProjected ? rounded(forecastPaceFactor) : null, forecastMarginSd: allowProjected ? rounded(Math.sqrt(2) * forecastNetSd * forecastPaceFactor) : null, forecastUncertaintySource: allowProjected ? 'accepted-rolling-holdout-team-net-rating-rmse' : 'unavailable', leagueContext: regularContext, standingsConsistency: consistencyAudit, scheduleContext: scheduleAudit.context, phaseAccounting: { defaultEligiblePhase: 'regular', explicitOverrideField: 'standingsEligible', standingsGames: standingsGames.length, scheduledGames: games.length }, leagueStructure: setup.leagueStructure, playoffStructure: setup.playoff.structure, conferenceAwarePlayoffs: setup.playoff.conferenceAware, playoffIntegrity, playoffRateScenario, playoffVenuePolicy: setup.playoff.enabled ? PLAYOFF_VENUE_POLICY : null, managedDecisionCount: decisionLog.length, finalMatchupWeights: { ...currentMatchupWeights }, phaseProfiles: Object.fromEntries([...samplerSets.entries()].map(([phase, value]) => [phase, { phaseFallbackTeams: value.phaseEvidence.filter(item => item.phaseFallback).map(item => item.team), paceSources: [...new Set([...value.samplers.values()].map(sampler => sampler.metadata?.paceSource).filter(Boolean))] }])), parameterLatentCount: [...regularSamplers.latents.values()].length }, playerStats: [...playerStatsByTeam.entries()].map(([teamId, value]) => ({ teamId, ...value })), playerGameLogs: [...playerGameLogsByTeam.entries()].map(([teamId, value]) => ({ teamId, ...value })), standings, teamRecords: standings,
    playoffBracket: setup.playoff.enabled ? bracket : null, playoffStructure: setup.playoff.enabled ? setup.playoff.structure : null,
    playoffFieldIds: setup.playoff.enabled ? playoffFieldIds : [], champion, championId, exampleGames: games.slice(0, 20), scenario: runScenario,
    scenarioVsActual: actualComparison(standings, actualRecords, averageGamesPerTeam, runScenario), evidence };
  runReport.modelDiagnostics.scoringEventPath = nativeMode ? 'native-four-factor' : 'game-lab-maximum-entropy';
  runReport.modelDiagnostics.scoringEventModel = nativeMode
    ? 'bounded-multinomial-possession-v3-four-factors-event-reconciled' : GAME_LAB_MATCHUP_POLICY.outcomeModel;
  runReport.modelDiagnostics.scoringEventRule = nativeMode ? NATIVE_SCORING_EVENT_RULE : GAME_LAB_MATCHUP_POLICY.scoringEventRule;
  runReport.modelDiagnostics.crossPathFallback = 'unavailable';
  return runReport;
}

function replaySeed(seed, season, repeat) {
  const value = `${seed}:${season}:${repeat}`;
  if (value.length <= 80) return value;
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${String(seed).slice(0, 48)}:${season}:${repeat}:${(hash >>> 0).toString(16)}`;
}

export async function simulateSeasonLab(input = {}, options = {}) {
  const setup = validateSeasonLabSetup(input.setup || input);
  const managedMode = options.managedMode === true;
  if (managedMode) {
    if (setup.horizon.seasonStartYears.length !== 1 || setup.randomness.repeats !== 1) {
      fail('Managed Season Lab checkpoints require exactly one season and one replay.');
    }
    if (!['actual', 'round-robin'].includes(setup.schedule.kind)) {
      fail('Managed Season Lab checkpoints require an actual or generated regular-season schedule.');
    }
    if (typeof options.onDecisionCheckpoint !== 'function') {
      fail('Managed Season Lab checkpoints require an interactive decision handler.');
    }
  }
  const cupCompletion = input.cupCompletion || null;
  if (setup.schedule.kind === 'nba-cup-completion' && (!cupCompletion?.artifact || !cupCompletion?.priorSeasonRecords)) {
    fail('The NBA Cup completion schedule needs its published artifact and exact 2025–26 records.');
  }
  if (setup.schedule.kind !== 'nba-cup-completion' && cupCompletion) {
    fail('NBA Cup completion inputs can only be used with the 2026–27 NBA Cup schedule mode.');
  }
  const teams = Array.isArray(input.teams) ? input.teams : [];
  if (teams.length !== setup.teams.length) fail('Season Lab requires one evidence payload per selected team.');
  if (managedMode && teams.some(team => !Array.isArray(team?.nativeProfiles))) {
    fail('Managed scoring decisions require native team-rate evidence for every selected team.');
  }
  const calibration = buildSeasonCalibration(input.validation || input.calibration);
  const forecastValidation = setup.source.kind === 'forecast-season'
    ? setup.source.forecastValidation
    : { status: 'unavailable', reason: 'This is not an accepted upcoming-season forecast run.' };
  const progressPlans = new Map(setup.horizon.seasonStartYears.map(season => {
    const scheduledGames = setup.schedule.kind === 'nba-cup-completion'
      ? setup.schedule.games.filter(game => game.seasonStartYear == null || game.seasonStartYear === season).length + 30
      : setup.schedule.kind === 'round-robin'
        ? buildSeasonLabSchedule(setup.teams.map((_, index) => `t${index}`), setup.schedule).length
        : setup.schedule.games.filter(game => game.seasonStartYear == null || game.seasonStartYear === season).length;
    const maximumPlayoffGames = setup.playoff.enabled ? (setup.playoff.teams - 1) * setup.playoff.seriesLength : 0;
    return [season, { scheduledGames, maximumPlayoffGames, runWorkUnits: scheduledGames + maximumPlayoffGames }];
  }));
  const totalProgressUnits = Math.max(1, [...progressPlans.values()].reduce((sum, plan) => sum + plan.runWorkUnits * setup.randomness.repeats, 0));
  let completedProgressUnits = 0;
  const seasonResults = [];
  options.onProgress?.(0, { stage: 'preparing', seasonStartYear: setup.horizon.seasonStartYears[0], repeat: 1,
    repeatCount: setup.randomness.repeats });
  for (const season of setup.horizon.seasonStartYears) {
    const distributions = new Map(setup.teams.map(team => [team.id, { team: team.name, teamId: team.id, wins: [], winRates: [], expectedWins: [],
      expectedWinProbabilityEligibleGames: 0, expectedWinProbabilityAvailableGames: 0, expectedWinProbabilityCoverageReported: true,
      pointDifferentials: [], seeds: [], playoffAppearances: 0, titles: 0, rankCounts: new Map() }]));
    let firstRun = null;
    const replayLedger = [];
    const cupReplayReceipts = [];
    const scopeReceipt = { seasonStartYear: season, teamIds: setup.teams.map(team => team.id), phases: phaseScopeForSeason(setup, season),
      source: sourceReceiptForSeason(setup.source, season), schedule: scheduleProvenance(setup.schedule) };
    for (let repeat = 0; repeat < setup.randomness.repeats; repeat += 1) {
      if (options.signal?.aborted) throw new DOMException('Season Lab simulation cancelled.', 'AbortError');
      const progressPlan = progressPlans.get(season);
      const key = replaySeed(setup.randomness.seed, season, repeat + 1), random = createScenarioRandom(key);
      const replayKey = `${setup.randomness.seed}|${season}|${repeat + 1}`;
      const result = await runSeason({ setup, season, teams, actualRecords: input.actualRecords?.[season] || input.actualRecords,
        cupCompletion, repeat: repeat + 1, replayKey }, {
        random, signal: options.signal, yieldEveryBatch: options.yieldEveryBatch,
        managedMode,
        onDecisionCheckpoint: managedMode ? options.onDecisionCheckpoint : null,
        onGameProgress: activity => options.onProgress?.((completedProgressUnits + activity.completedGames) / totalProgressUnits, {
          ...activity, seasonStartYear: season, repeat: repeat + 1, repeatCount: setup.randomness.repeats,
        }),
        onCupLifecycle: event => options.onCupLifecycle?.(event),
      });
      if (repeat === 0) firstRun = result;
      replayLedger.push({ repeat: repeat + 1, replayKey: result.replayKey, streamSeed: key,
        ...(result.decisionPolicyId ? { decisionPolicyId: result.decisionPolicyId, decisionLog: result.decisionLog } : {}),
        ...(result.cupCompletion ? { cupCompletionSeed: result.cupCompletion.seed } : {}), status: 'complete', scopeReceipt });
      if (result.cupCompletion) {
        const cup = result.cupCompletion;
        cupReplayReceipts.push({
          repeat: repeat + 1,
          replayKey: result.replayKey,
          seed: cup.seed,
          groupPlayLedger: cup.groupPlayLedger,
          groupStandings: cup.groupStandings,
          conferenceRankings: cup.conferenceRankings,
          qualifiers: cup.qualifiers,
          games: cup.games,
          coverage: cup.coverage,
          tiebreakTrace: cup.tiebreakTrace,
        });
      }
      const playoffField = new Set(result.playoffFieldIds || []);
      result.standings.forEach(row => {
        const distribution = distributions.get(row.teamId);
        distribution.wins.push(row.wins);
        distribution.winRates.push(row.winRate);
        distribution.expectedWins.push(row.expectedWins);
        const probabilityCoverage = row.expectedWinProbabilityCoverage;
        if (Number.isSafeInteger(probabilityCoverage?.standingsGames) && probabilityCoverage.standingsGames >= 0
          && Number.isSafeInteger(probabilityCoverage?.availableGames) && probabilityCoverage.availableGames >= 0
          && probabilityCoverage.availableGames <= probabilityCoverage.standingsGames) {
          distribution.expectedWinProbabilityEligibleGames += probabilityCoverage.standingsGames;
          distribution.expectedWinProbabilityAvailableGames += probabilityCoverage.availableGames;
        } else {
          distribution.expectedWinProbabilityCoverageReported = false;
        }
        distribution.pointDifferentials.push(row.pointDifferential);
        distribution.seeds.push(row.seed);
        distribution.rankCounts.set(row.seed, (distribution.rankCounts.get(row.seed) || 0) + 1);
        if (setup.playoff.enabled && playoffField.has(row.teamId)) distribution.playoffAppearances += 1;
        if (result.championId === row.teamId) distribution.titles += 1;
      });
      completedProgressUnits += progressPlan.runWorkUnits;
      options.onProgress?.(completedProgressUnits / totalProgressUnits, { stage: 'replay-complete', seasonStartYear: season,
        repeat: repeat + 1, repeatCount: setup.randomness.repeats, completedGames: result.scheduledGames + result.playoffGames,
        plannedGames: progressPlan.runWorkUnits });
    }
    const repeats = setup.randomness.repeats;
    if (setup.schedule.kind === 'nba-cup-completion' && cupReplayReceipts.length !== repeats) {
      fail('The NBA Cup result must retain exactly one complete audit receipt for every configured replay.');
    }
    const firstRunCupCompletion = firstRun?.cupCompletion
      ? Object.fromEntries(Object.entries(firstRun.cupCompletion)
        .filter(([key]) => !['groupPlayLedger', 'tiebreakTrace', 'replayReceipts'].includes(key)))
      : null;
    const first = firstRunCupCompletion ? { ...firstRun, cupCompletion: firstRunCupCompletion } : firstRun;
    const cupCompletionResult = firstRunCupCompletion
      ? { ...firstRunCupCompletion, replayReceipts: cupReplayReceipts }
      : null;
    const repeatedRuns = [...distributions.values()].map(distribution => {
      const observedWinRates = distribution.winRates.filter(Number.isFinite);
      const averageWinRate = observedWinRates.length
        ? observedWinRates.reduce((sum, value) => sum + value, 0) / observedWinRates.length
        : null;
      const expectedWinValues = distribution.expectedWins.filter(Number.isFinite);
      const expectedWinsCoverageStatus = expectedWinValues.length === repeats ? 'available'
        : expectedWinValues.length > 0 ? 'partial' : 'unavailable';
      const averageExpectedWins = expectedWinsCoverageStatus === 'available'
        ? rounded(expectedWinValues.reduce((sum, value) => sum + value, 0) / repeats)
        : null;
      const eligibleProbabilityGames = distribution.expectedWinProbabilityEligibleGames;
      const availableProbabilityGames = distribution.expectedWinProbabilityAvailableGames;
      const probabilityCoverageStatus = !distribution.expectedWinProbabilityCoverageReported ? 'unverified'
        : eligibleProbabilityGames > 0 && availableProbabilityGames === eligibleProbabilityGames ? 'available'
          : availableProbabilityGames > 0 ? 'partial' : 'unavailable';
      const probabilityCoverageReason = probabilityCoverageStatus === 'available' ? null
        : probabilityCoverageStatus === 'unverified' ? 'source-model-did-not-report-valid-probability-coverage'
          : eligibleProbabilityGames === 0 ? 'no-standings-eligible-games'
            : 'one-or-more-standings-eligible-games-have-no-valid-probability';
      const titleInterval = wilsonInterval(distribution.titles, repeats), playoffInterval = wilsonInterval(distribution.playoffAppearances, repeats);
      return { team: distribution.team, teamId: distribution.teamId, averageWins: rounded(distribution.wins.reduce((sum, value) => sum + value, 0) / repeats), averageWinRate: rounded(averageWinRate), averageExpectedWins,
        expectedWinsCoverage: { status: expectedWinsCoverageStatus, availableRepeats: expectedWinValues.length, totalRepeats: repeats,
          reason: expectedWinsCoverageStatus === 'available' ? null : 'one-or-more-repeats-have-unavailable-expected-wins' },
        expectedWinProbabilityCoverage: { status: probabilityCoverageStatus, eligibleGames: eligibleProbabilityGames,
          availableGames: availableProbabilityGames, reason: probabilityCoverageReason },
        winStats: summaryStats(distribution.wins), winRateStats: summaryStats(distribution.winRates), pointDifferentialStats: summaryStats(distribution.pointDifferentials), seedStats: summaryStats(distribution.seeds),
        winQuantiles: quantiles(distribution.wins), pointDifferentialQuantiles: quantiles(distribution.pointDifferentials), seedQuantiles: quantiles(distribution.seeds), rankProbabilities: Object.fromEntries([...distribution.rankCounts.entries()].sort((a, b) => a[0] - b[0]).map(([rank, count]) => [rank, rounded(count / repeats)])),
        playoffAppearanceRate: setup.playoff.enabled ? rounded(distribution.playoffAppearances / repeats) : null, playoffAppearanceInterval: setup.playoff.enabled ? playoffInterval : null,
        titleRate: setup.playoff.enabled ? rounded(distribution.titles / repeats) : null, titleInterval: setup.playoff.enabled ? titleInterval : null,
        monteCarloStandardErrorWinRate: monteCarloStandardError(averageWinRate, repeats),
        parameterUncertainty: first.modelDiagnostics?.native ? 'Denominator-derived team-season latent proxy; not a calibrated confidence interval.' : 'No native parameter uncertainty supplied by the possession-outcome evidence.',
      };
    });
    const progression = buildSeasonLabProgressionReceipt(setup, season);
    seasonResults.push({ ...first, ...(cupCompletionResult ? { cupCompletion: cupCompletionResult } : {}), repeatedRuns, replayLedger,
      firstRun: first, progression });
  }
  const first = seasonResults[0];
  const reportScenario = setup.scenario || managedMode || seasonResults.some(season => season.decisionLog?.length > 0);
  return { contractVersion: SEASON_LAB_CONTRACT_VERSION, status: 'complete', modelVersion: SEASON_LAB_MODEL_VERSION, modelDesign: SEASON_LAB_MODEL_DESIGN,
    label: reportScenario ? 'Scenario' : setup.label, scenario: reportScenario,
    decisionMode: managedMode ? 'managed-conditional-scoring-scenario' : 'unattended-replay-series',
    decisionNote: managedMode
      ? 'Scoring choices are conditional model settings applied only to future games. Segment win rates and point margins are simulated scenario outcomes, not causal evidence or a calibrated forecast.'
      : null,
    decisionPolicyId: first.decisionPolicyId || null, decisionLog: first.decisionLog || [],
    decisionSegments: first.decisionLog?.map(item => item.resultSegment) || [],
    seed: setup.randomness.seed, repeatCount: setup.randomness.repeats, workUnits: setup.workUnits, setup, leagueStructure: setup.leagueStructure, seasons: seasonResults,
    progression: { contractVersion: SEASON_LAB_PROGRESSION_VERSION,
      mode: setup.source.kind === 'year-advance-scenario' ? 'no-roster-moves-year-advance-scenario' : 'independent-explicit-season-inputs',
      ...(setup.source.kind === 'year-advance-scenario' ? { evidenceSeasonStartYear: setup.source.evidenceSeasonStartYear, noRosterMoves: true } : {}),
      seasons: seasonResults.map(season => season.progression) },
    standings: first.standings, teamRecords: first.teamRecords,
    provenance: first.provenance, scheduleAudit: first.scheduleAudit, phaseAccounting: first.modelDiagnostics.phaseAccounting, scheduleStrength: first.standings.map(row => ({ team: row.displayTeam, teamId: row.teamId, ...row.scheduleStrength })), nativeMetrics: first.standings.map(row => ({ team: row.displayTeam, teamId: row.teamId, ...row.nativeMetrics })), rotationUsage: first.standings.map(row => ({ team: row.displayTeam, teamId: row.teamId, ...row.rotationUsage })), consistencyAudit: first.consistencyAudit, teamTotalsReconciliation: first.teamTotalsReconciliation, playerStats: first.playerStats, playerGameLogs: first.playerGameLogs,
    playoffBracket: first.playoffBracket, playoffStructure: first.playoffStructure, playoffFieldIds: first.playoffFieldIds, playoffIntegrity: first.playoffIntegrity, playoffRateScenario: first.playoffRateScenario, playoffVenuePolicy: first.playoffVenuePolicy, repeatedRunDistributions: first.repeatedRuns, scenarioVsActual: first.scenarioVsActual, calibration, forecastValidation,
    uncertainty: { status: 'conditional', monteCarlo: 'Reported standard errors and intervals describe repeat sampling noise; independent replay streams keep seasons and repeats isolated.', parameter: 'Native team-season latent variation is a denominator-derived uncertainty proxy, not a held-out calibrated confidence interval. Raw package rates remain observed evidence.',
      forecast: setup.source.kind === 'forecast-season'
        ? `Forecast validation reports historical rolling-holdout accuracy and interval coverage; the accepted team-net RMSE (${rounded(Number(setup.source.forecastValidation.aggregate.teamNetRating.rmse))}) is also sampled as one replay-stable projection-error latent. It does not turn a modeled upcoming season into observed fact or cover unmodeled roster, injury, transaction, and coaching changes.`
        : 'No upcoming-season forecast validation applies to this observed-package or scenario run.',
      unavailable: ['injuries', 'contracts', 'player development', 'transactions', 'fatigue', 'travel', 'coaching response'] },
    assumptions: [...setup.assumptions, 'Native team-style packages use the disclosed aggregate-rate adapter and a bounded multinomial possession outcome layer; raw rates remain in nativeMetrics.', `Native rates are regularized toward weighted league baselines with a ${NATIVE_PRIOR_POSSESSIONS}-possession transparent prior; raw rates remain in nativeMetrics.`, `Matchup scoring uses ${Math.round(setup.matchupWeights.ownOffense * 100)}% own-offense and ${Math.round(setup.matchupWeights.opponentDefense * 100)}% opponent-defense evidence. A non-default blend is an explicit scenario control; it never rewrites raw native rates.`, 'The matchup keeps the full points-per-100 scale after blending independent offense and opponent-defense deltas; the blend weights are selectors rather than a hidden shrinkage factor.', 'Observed eFG, free-throw rate, offensive/defensive rebounding, and turnover rates interact with opponent defense in both the matchup correction and the bounded possession event mix. Missing factors remain partial and are surfaced with coverage.', `The possession outcome layer bounds requested expected points per possession to ${NATIVE_EXPECTED_PPP_FLOOR}–${NATIVE_EXPECTED_PPP_CEILING}; edge adjustments are surfaced in outcomeExpectationGap metadata rather than hidden.`, 'Native matchup pace uses the harmonic mean of the selected team-season pace48 values; missing pace falls back to the selected league baseline and is labeled.', 'One component-specific parameter-latent offense and defense draw is held constant for each team and replay phase; denominator exposure is applied after the same regularization used by the matchup, while possession outcome variation is sampled separately.', 'For accepted forecast profiles, the rolling-holdout model-error latent is drawn once per team and replay and reused across regular and fallback competition phases; phase-specific denominator latents remain separate.', 'Expected win credit uses the same bounded discrete possession score distributions as the game sampler, including the configured overtime cap; unresolved ties at the cap contribute half a win. A sampler without a valid exact score distribution leaves expected wins and expected-win rank unavailable.', 'Accepted forecast runs add a team-level net-rating latent from rolling-holdout RMSE to seeded replay draws; exact win credit is conditional on the resulting matchup profiles and does not apply an additional normal-curve uncertainty layer.', 'The NBA 2-2-1-1-1 venue sequence is assigned from regular-season conference seed or league standings order, including Finals home court; venue labels do not add an unverified scoring effect.', 'Playoff simulations are labeled as retrospective same-season replays only when exact-season native phase profiles are available; all other runs use a regular-season-rate scenario until prior-season postseason calibration exists, and never consume target-season playoff rates.', 'Calendar, rest, back-to-back, and home/away streak diagnostics are measured when dates are present; no fatigue, travel, or venue effect is applied without a dedicated accepted model.', 'Head-to-head win percentage is applied before point differential; exact remaining ties use the declared seeded lottery.', 'Unresolved ties remain ties and never receive an invented playoff bye or championship.', 'Control mode and roster mode are recorded setup inputs; without a dedicated accepted strategy/roster-effect model they do not silently alter observed team rates.', 'Injuries, contracts, player development, and transactions are not modeled unless a dedicated accepted model is explicitly supplied.', 'Player game logs are deterministic capacity-bounded allocations of simulated team scores and available historical production; unavailable team denominators stay unavailable.', 'Standings use only regular-phase games by default; non-regular calendar games remain simulated and auditable but require an explicit standingsEligible:true override to enter the table.', 'Standings, expected-win rank, native-net rank, and replay-derived simulated offense/defense/net are reported as separate layers and audited for schedule/noise divergence; no layer is silently overwritten.', 'Canonical NBA team codes are mapped to one of six divisions and the East or West conference. Complete NBA playoff fields use conference-local seeds and a separate East-versus-West Finals; custom/unmapped leagues retain a generic bracket.', 'Year advance is not an automatic offseason: every next-season roster/evidence input must be declared separately, and prior standings or playoff results do not alter it.', setup.source.kind === 'forecast-season' ? `Upcoming-season output is conditional on accepted projection model ${setup.source.projectionModel.modelId}@${setup.source.projectionModel.version}, with ${setup.source.forecastValidation.holdoutCount} immutable pre-season rolling holdouts through ${setup.source.forecastValidation.completedThroughSeasonStartYear}. No unaccepted future roster, injury, transaction, or coaching story is invented.` : null, setup.scenario ? 'This short or custom schedule or non-default matchup blend is labeled a scenario; raw wins are not a historical-season comparison.' : 'A full/actual schedule is still a conditional simulation, not a forecast.'].filter(Boolean),
    note: 'Season Lab is an all-30-team league simulator contract. Observed history, user-built rosters, managed teams, custom teams, and accepted pooled packages remain distinct inputs; no missing player or team behavior is silently invented.' };
}
