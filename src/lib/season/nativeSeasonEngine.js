// Season Lab native engine bridge: the site's release-pinned season and
// franchise simulation modules load through the reviewed source relay (SHA-256
// verified, same-origin on the standalone site) and run the actual
// simulations — the studio UI drives them but never models outcomes itself.
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';
import { isV4RequiredError } from '@/lib/season/v4Policy';

const SEASON_MODEL = 'engine/season-lab-model.js?v=20261001b&rev=season-model-v26-fixed-16-team-playoffs-20261001b';
const SCHEDULE_SOURCE = 'engine/nba-schedule-source.js?v=20260920c&rev=structure-v1';
const FRANCHISE_MODEL = 'engine/franchise-simulation.js?v=20261001c&rev=franchise-simulation-v10-score-contributions-v1';

let modulesPromise = null;
export function nativeSeasonModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      loadNativeModule('season-lab.js'),
      loadNativeModule(SEASON_MODEL),
      loadNativeModule(SCHEDULE_SOURCE),
      loadNativeModule(FRANCHISE_MODEL),
    ]).then(([seasonLab, model, schedule, franchise]) => ({
      loadNativeSeasonLabSource: seasonLab.loadNativeSeasonLabSource,
      simulateSeasonLab: model.simulateSeasonLab,
      selectActualNbaSchedule: schedule.selectActualNbaSchedule,
      ...franchise,
    }));
    modulesPromise.catch(() => { modulesPromise = null; });
  }
  return modulesPromise;
}

// Policy probe: the site's V4 cutover gate resolves before any registry fetch,
// so one gate call answers with zero network traffic. Cached for the session.
let sourceGateProbe = null;
export function seasonSourceBlocked() {
  if (!sourceGateProbe) {
    sourceGateProbe = loadNativeModule('season-lab.js')
      .then(module => { module.listNativeSeasonLabExactChoices({}, { requiredCapabilities: [] }); return false; })
      .catch(error => isV4RequiredError(error));
    sourceGateProbe.catch(() => { sourceGateProbe = null; });
  }
  return sourceGateProbe;
}

// One verified native source per season per session: registry selection,
// team payloads (observed profiles) and the reviewed schedule artifact.
const sourceCache = new Map();
export async function nativeSeasonSource(year) {
  const key = Number(year);
  if (!Number.isSafeInteger(key)) throw new Error('Choose a published season.');
  if (sourceCache.has(key)) return sourceCache.get(key);
  const task = (async () => {
    const modules = await nativeSeasonModules();
    const source = await modules.loadNativeSeasonLabSource({
      fetchImpl: originalFetch,
      scope: 'exact-season',
      seasonStartYears: [key],
      requiredCapabilities: ['seasonSimulation'],
    });
    if (source?.phase !== 'ready' || !source.selection?.payloads?.length) {
      throw new Error('The native Season Lab source has no verified team payloads.');
    }
    return source;
  })();
  sourceCache.set(key, task);
  task.catch(() => sourceCache.delete(key));
  return task;
}

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const codeOf = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
const packageRefOf = source => {
  const candidates = [
    source.nativePackages?.[0]?.packageRef,
    source.selection?.packages?.[0]?.packageRef,
    source.selection?.entries?.[0],
  ];
  return candidates.find(ref => ref?.packageId && ref?.packageVersion) || null;
};

// Native repeat summaries carry per-team win quantiles and playoff/title
// rates across the requested replays.
function repeatRowsOf(report) {
  const container = report.repeatedRuns ?? report.repeatSummaries ?? null;
  const rows = Array.isArray(container) ? container
    : Array.isArray(container?.rows) ? container.rows
    : Array.isArray(container?.teams) ? container.teams
    : Array.isArray(container?.players) ? container.players
    : [];
  return rows;
}

function quantileOf(quantiles, key) {
  if (!quantiles) return null;
  if (Number.isFinite(Number(quantiles[key]))) return Number(quantiles[key]);
  if (Number.isFinite(Number(quantiles.p50))) return Number(quantiles.p50);
  if (Number.isFinite(Number(quantiles.median))) return Number(quantiles.median);
  return null;
}

function lineOf(player) {
  if (!player) return null;
  const totals = player.totals && typeof player.totals === 'object' ? player.totals : {};
  return {
    name: player.name || player.playerName || 'Player',
    min: num(player.minutes ?? player.min),
    pts: num(totals.points ?? player.points),
    reb: num(totals.rebounds ?? player.rebounds),
    ast: num(totals.assists ?? player.assists),
    stl: num(totals.steals ?? player.steals),
    blk: num(totals.blocks ?? player.blocks),
  };
}

// Per-player game logs are kept per team in schedule order; merge both sides
// of every game so the studio's box-score consumers see one game object each.
function gamesFromPlayerLogs(entries) {
  const byKey = new Map();
  const seen = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const row of Array.isArray(entry?.games) ? entry.games : []) {
      const home = codeOf(row.homeTeamId ?? row.home ?? row.homeId);
      const away = codeOf(row.awayTeamId ?? row.away ?? row.awayId);
      if (!home || !away) continue;
      const key = `${home}|${away}`;
      const occurrence = seen.get(key) || 0;
      seen.set(key, occurrence + 1);
      const gameKey = `${key}|${occurrence}`;
      let game = byKey.get(gameKey);
      if (!game) {
        game = {
          home, away,
          homePts: num(row.scoreHome ?? row.homeScore ?? row.homePts),
          awayPts: num(row.scoreAway ?? row.awayScore ?? row.awayPts),
          ot: num(row.ot),
          boxHome: { lines: [] }, boxAway: { lines: [] },
        };
        byKey.set(gameKey, game);
      }
      const isHome = home === codeOf(entry.teamId);
      const box = isHome ? game.boxHome : game.boxAway;
      for (const player of Array.isArray(row.players) ? row.players : Array.isArray(row.lines) ? row.lines : []) {
        const line = lineOf(player);
        if (line) box.lines.push(line);
      }
    }
  }
  return [...byKey.values()];
}

// Align replayed games onto the studio's schedule rows by home/away pair
// occurrence, so the schedule tab's replay column stays in position.
function alignGamesToSchedule(games, scheduleRows) {
  const byPair = new Map();
  for (const game of games) {
    const key = `${game.home}|${game.away}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(game);
  }
  const seen = new Map();
  return (scheduleRows || []).map(row => {
    const key = `${row.home}|${row.away}`;
    const occurrence = seen.get(key) || 0;
    seen.set(key, occurrence + 1);
    return (byPair.get(key) || [])[occurrence] || null;
  });
}

const ROUND_LOCAL = ['First round', 'Conference semifinals', 'Conference finals'];
function localRoundLabel(raw, index) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('semi')) return 'Conference semifinals';
  if (text.includes('final')) return 'Conference finals';
  if (text.includes('first') || text.includes('quarter') || text.includes('round 1')) return 'First round';
  return ROUND_LOCAL[index] || ROUND_LOCAL[0];
}

function conferenceOf(series) {
  const value = String(series.conference ?? series.side ?? '').toLowerCase();
  if (value === 'east') return 'EAST';
  if (value === 'west') return 'WEST';
  if (value === 'finals' || value.includes('final')) return 'FINALS';
  return null;
}

function seriesGamesOf(series) {
  return (Array.isArray(series.games) ? series.games : []).map((game, index) => ({
    game: Number(game.game) || index + 1,
    home: codeOf(game.homeTeamId ?? game.home),
    away: codeOf(game.awayTeamId ?? game.away),
    homePts: num(game.scoreHome ?? game.homeScore ?? game.homePts),
    awayPts: num(game.scoreAway ?? game.awayScore ?? game.awayPts),
  })).filter(game => game.home && game.away);
}

// The native conference bracket: series carry a/b names, ids, seeds and a
// winner id. Normalize into the studio's bracket shape.
function normalizeBracket(bracket, league) {
  if (!bracket) return null;
  const seriesList = Array.isArray(bracket) ? bracket
    : Array.isArray(bracket.series) ? bracket.series
    : Array.isArray(bracket.rounds) ? bracket.rounds.flat()
    : [];
  if (!seriesList.length) return null;
  const rounds = { EAST: [], WEST: [] };
  let finals = null;
  const unknownLabels = new Set();
  for (const series of seriesList) {
    const conference = conferenceOf(series);
    const games = seriesGamesOf(series);
    const winnerId = codeOf(series.winnerId ?? series.winner);
    const aId = codeOf(series.aId ?? series.higherId ?? series.higher);
    const bId = codeOf(series.bId ?? series.lowerId ?? series.lower);
    const seedA = num(series.seedA ?? series.homeCourt?.seed ?? series.higherSeed, 0) || null;
    const seedB = num(series.seedB ?? series.lowerSeed, 0) || null;
    const normalized = {
      higher: seedA != null && seedB != null && seedA > seedB ? aId : (seedA != null ? aId : aId),
      higherSeed: seedA, lower: seedA != null && seedB != null && seedA > seedB ? bId : (seedB != null ? bId : bId),
      lowerSeed: seedB, winner: winnerId, games,
    };
    const label = localRoundLabel(series.round ?? series.roundName ?? series.stage, unknownLabels.size);
    if (conference === 'FINALS' || (series.stage && String(series.stage).toLowerCase() === 'finals')) {
      finals = { ...normalized, higherSeed: seedA, lowerSeed: seedB };
    } else if (rounds[conference]) {
      if (!unknownLabels.has(label)) unknownLabels.add(label);
      rounds[conference].push({ ...normalized, round: label });
    }
  }
  const conferenceLabel = label => {
    const ordered = [...new Set([...rounds[label].map(series => series.round)])];
    return ordered.length > 1 ? ordered : null;
  };
  const eastLabels = conferenceLabel('EAST');
  if (eastLabels) for (const series of rounds.EAST) series.round = localRoundLabel(series.round, eastLabels.indexOf(series.round));
  const westLabels = conferenceLabel('WEST');
  if (westLabels) for (const series of rounds.WEST) series.round = localRoundLabel(series.round, westLabels.indexOf(series.round));
  const champion = codeOf(bracket.championId ?? bracket.champion);
  return {
    rounds: ['EAST', 'WEST'].map(conference => ({ conference, playIn: [], series: rounds[conference] })),
    finals: finals || (champion && seriesList.length ? null : null),
    champion,
  };
}

export function mapSeasonReport(report, meta) {
  const first = report.seasons?.find(item => item?.standings?.length) ?? report.seasons?.[0] ?? report.firstRun ?? {};
  const league = meta.league;
  const repeatRows = repeatRowsOf(report);
  const rows = (Array.isArray(report.standings) && report.standings.length ? report.standings : first.standings) || [];
  const summary = rows.map(row => {
    const code = codeOf(row.teamId) || codeOf(row.displayTeam);
    const games = num(row.games);
    const repeat = repeatRows.find(item => item?.teamId === code || item?.teamId === row.team || item?.team === row.team) || null;
    const medianWins = quantileOf(repeat?.winQuantiles, '0.5');
    const team = league?.byCode?.get(code) || null;
    return {
      code,
      wins: medianWins ?? num(row.wins),
      losses: num(row.losses),
      ties: num(row.ties),
      ortg: num(row.simulatedMetrics?.offense, games ? num(row.pointsFor) / games : 0),
      drtg: num(row.simulatedMetrics?.defense, games ? num(row.pointsAgainst) / games : 0),
      pace: num(row.pace, team?.pace ?? 0),
      playoff: repeat ? num(repeat.playoffAppearanceRate ?? repeat.playoff, null) ?? undefined : undefined,
      title: repeat ? num(repeat.titleRate ?? repeat.title, null) ?? undefined : undefined,
    };
  }).filter(row => row.code);
  const games = gamesFromPlayerLogs(first.playerGameLogs);
  const bracket = normalizeBracket(first.playoffBracket, league);
  const champion = codeOf(first.championId ?? first.champion) ?? bracket?.champion ?? null;
  return {
    summary, games,
    scheduleGames: meta.scheduleSource === 'actual' ? alignGamesToSchedule(games, meta.scheduleRows) : games,
    bracket, champion,
    repeats: meta.repeats, seed: meta.seed, scheduleSource: meta.scheduleSource, horizon: meta.horizon, bestOf: meta.bestOf,
    modelVersion: report.modelVersion || null,
  };
}

// Full native season replay for the selected exact season.
export async function runNativeSeason(options) {
  const { year, repeats = 1, seed = '', blend = 0.5, playoffs = true, seriesLength = 7,
    horizon = 'full', scheduleSource = 'actual', scheduleRows = [], onProgress, league } = options;
  const seasonStartYear = Number(year);
  const modules = await nativeSeasonModules();
  const source = await nativeSeasonSource(seasonStartYear);
  const payloads = source.selection.payloads;
  const ids = payloads.map(payload => payload.team);
  const ref = packageRefOf(source);
  if (!ref) throw new Error('The native season package reference is unavailable.');

  let schedule;
  if (scheduleSource === 'round-robin') {
    schedule = { kind: 'round-robin', scheduleId: null, sourceReceipt: null, gamesPerTeam: 82, games: null };
  } else {
    const selected = source.scheduleArtifact
      ? modules.selectActualNbaSchedule(source.scheduleArtifact, { seasonStartYear, teamIds: ids, phases: ['regular'] })
      : { status: 'unavailable', reason: 'The schedule artifact did not load.' };
    if (selected.status !== 'ready') throw new Error(selected.reason || 'The exact NBA schedule for this season is unavailable.');
    schedule = {
      kind: 'actual',
      scheduleId: selected.sourceReceipt?.scheduleId || null,
      sourceReceipt: selected.sourceReceipt || source.scheduleSourceReceipt || null,
      gamesPerTeam: selected.gamesPerTeam,
      games: selected.games,
    };
  }

  const setup = {
    teams: ids.map(id => ({ id, name: id })),
    source: {
      kind: 'exact-season', packageId: ref.packageId, packageVersion: ref.packageVersion, exactSeasonEvidence: true,
      seasonPackages: [{ seasonStartYear, packageId: ref.packageId, packageVersion: ref.packageVersion }],
    },
    horizon: { kind: horizon === 'team' ? 'game' : horizon, seasonStartYears: [seasonStartYear] },
    schedule,
    matchupWeights: { ownOffense: Number(blend) || 0.5 },
    repeats: Number(repeats) || 1,
    seed: String(seed || Math.floor(Math.random() * 4294960000)),
    playoff: { enabled: Boolean(playoffs) && ids.length >= 16, teams: ids.length >= 16 ? 16 : 0, seriesLength: Number(seriesLength) || 7 },
  };
  const report = await modules.simulateSeasonLab({ setup, teams: payloads }, { onProgress: value => onProgress?.(value) });
  if (report?.status !== 'complete') throw new Error(report?.error || 'The native season replay did not complete.');
  return mapSeasonReport(report, {
    year: seasonStartYear, repeats: setup.repeats, seed: setup.seed,
    scheduleSource: setup.schedule.kind, horizon: setup.horizon.kind, bestOf: setup.playoff.seriesLength,
    scheduleRows, league,
  });
}

// === Franchise mode: the site's persistent league engine ===

const franchiseRef = async year => packageRefOf(await nativeSeasonSource(Number(year)));

export async function startNativeFranchise({ year, userTeamId = null, seed, seriesLength = 7, teamNames = {} }) {
  const seasonStartYear = Number(year);
  const modules = await nativeSeasonModules();
  const source = await nativeSeasonSource(seasonStartYear);
  const payloads = source.selection.payloads;
  const ids = payloads.map(payload => payload.team);
  const ref = packageRefOf(source);
  let schedule = null;
  if (ids.length === 30 && source.scheduleArtifact) {
    const selected = modules.selectActualNbaSchedule(source.scheduleArtifact, { seasonStartYear, teamIds: ids, phases: ['regular'] });
    if (selected.status === 'ready') {
      schedule = {
        games: selected.games, gamesPerTeam: selected.gamesPerTeam,
        receipt: {
          id: selected.sourceReceipt?.scheduleId || `nba-actual-${seasonStartYear}`,
          version: source.scheduleSourceReceipt?.version || 'nba-schedule-source-v2',
          contentSha256: selected.sourceReceipt?.contentSha256 ?? source.scheduleSourceReceipt?.contentSha256 ?? null,
        },
      };
    }
  }
  return modules.createFranchiseLeague({
    leagueId: `swishiq-${seasonStartYear}-franchise`,
    seasonStartYear,
    teamPayloads: payloads,
    teamNames,
    userTeamIds: userTeamId ? [userTeamId] : [],
    seed: String(seed || Math.floor(Math.random() * 4294960000)),
    gamesPerTeam: schedule?.gamesPerTeam || 82,
    playoffTeams: ids.length >= 16 ? 16 : 0,
    seriesLength: Number(seriesLength) || 7,
    scope: 'exact-season',
    packageRef: ref,
    scheduleGames: schedule?.games || null,
    scheduleReceipt: schedule?.receipt || null,
    scheduleKind: schedule ? 'actual' : 'generated',
  });
}

export async function runNativeFranchiseSeason(state, { onProgress } = {}) {
  const modules = await nativeSeasonModules();
  return modules.simulateFranchiseSeason(state, { onProgress: value => onProgress?.(value) });
}

export async function advanceNativeFranchiseOffseason(state) {
  const modules = await nativeSeasonModules();
  const nextYear = Number(state?.currentSeason) + 1;
  const options = {};
  try {
    if (Number.isSafeInteger(nextYear) && nextYear <= 2025) {
      const source = await nativeSeasonSource(Number(state.currentSeason));
      const ids = (state.teams || []).map(team => team.teamId);
      const selected = source.scheduleArtifact
        ? modules.selectActualNbaSchedule(source.scheduleArtifact, { seasonStartYear: nextYear, teamIds: ids, phases: ['regular'] })
        : { status: 'unavailable' };
      if (selected.status === 'ready') {
        options.scheduleGames = selected.games;
        options.scheduleReceipt = {
          id: selected.sourceReceipt?.scheduleId || `nba-actual-${nextYear}`,
          version: 'nba-schedule-source-v2',
          contentSha256: selected.sourceReceipt?.contentSha256 ?? null,
        };
        options.scheduleKind = 'actual';
      }
    }
  } catch { /* fall back to the engine's generated calendar */ }
  return modules.advanceFranchiseOffseason(state, options);
}

export async function coachNativeFranchise(state, plan) {
  const modules = await nativeSeasonModules();
  return modules.applyFranchiseCoaching(state, plan);
}

export async function loadNativeFranchise() {
  const modules = await nativeSeasonModules();
  return modules.loadFranchiseLeague();
}

export async function saveNativeFranchise(state) {
  const modules = await nativeSeasonModules();
  return modules.saveFranchiseLeague(state);
}

export async function clearNativeFranchise() {
  const modules = await nativeSeasonModules();
  return modules.clearFranchiseLeague();
}