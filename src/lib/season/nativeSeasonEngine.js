// Season Lab native engine bridge: the site's release-pinned season and
// franchise simulation modules load through the reviewed source relay (SHA-256
// verified, same-origin on the standalone site) and run the actual
// simulations — the studio UI drives them but never models outcomes itself.
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';
import { isV4RequiredError } from '@/lib/season/v4Policy';
import { num, codeOf } from '@/lib/scalars';

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
  const value = nullableNumber(quantiles[key]);
  if (value != null) return value;
  const p50 = nullableNumber(quantiles.p50);
  if (p50 != null) return p50;
  const median = nullableNumber(quantiles.median);
  if (median != null) return median;
  return null;
}

function lineOf(player) {
  if (!player) return null;
  const totals = player.totals && typeof player.totals === 'object' ? player.totals : {};
  return {
    name: player.name || player.playerName || 'Player',
    min: nullableNumber(player.minutes ?? player.min),
    pts: nullableNumber(totals.points ?? player.points),
    reb: nullableNumber(totals.rebounds ?? totals.totalRebounds ?? player.rebounds),
    ast: nullableNumber(totals.assists ?? player.assists),
    stl: nullableNumber(totals.steals ?? player.steals),
    blk: nullableNumber(totals.blocks ?? player.blocks),
  };
}

function nullableNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function identifier(value) {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return null;
  const text = String(value).trim();
  return text || null;
}

function pairKey(home, away) {
  return home && away ? JSON.stringify([home, away]) : null;
}

function mergeScore(current, next, gameId, label) {
  if (current != null && next != null && current !== next) {
    throw new Error(`Player game log ${gameId} has conflicting ${label}.`);
  }
  return current ?? next;
}

function playerIdentity(player) {
  const playerId = identifier(player?.playerId ?? player?.playerRef ?? player?.id);
  if (playerId) return `id:${playerId}`;
  const name = typeof (player?.name ?? player?.playerName) === 'string'
    ? (player.name ?? player.playerName).trim().toLocaleLowerCase('en-US')
    : '';
  return name ? `name:${name}` : null;
}

// Team game logs use one row per team per game. Join the opposing rows by
// their stable game ID and orient scores/box lines from each row's perspective.
export function gamesFromPlayerLogs(entries) {
  const byKey = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const row of Array.isArray(entry?.games) ? entry.games : []) {
      const gameId = identifier(row?.gameId);
      if (!gameId) throw new Error('Player game log is missing its gameId.');
      const entryTeam = identifier(entry?.teamId);
      const rowTeam = identifier(row?.teamId);
      if (entryTeam && rowTeam && entryTeam !== rowTeam) {
        throw new Error(`Player game log ${gameId} conflicts with its team's entry.`);
      }
      const team = rowTeam || entryTeam;
      const opponent = identifier(row?.opponentId);
      if (!team || !opponent || team === opponent || typeof row.home !== 'boolean') {
        throw new Error(`Player game log ${gameId} has invalid team or home/away identity.`);
      }
      const home = row.home ? team : opponent;
      const away = row.home ? opponent : team;
      const homePts = row.home ? nullableNumber(row.score) : nullableNumber(row.opponentScore);
      const awayPts = row.home ? nullableNumber(row.opponentScore) : nullableNumber(row.score);
      const side = row.home ? 'home' : 'away';
      let game = byKey.get(gameId);
      if (!game) {
        game = {
          gameId, home, away, homePts, awayPts,
          ot: nullableNumber(row.ot),
          boxHome: { lines: [] }, boxAway: { lines: [] },
          sides: new Set(), playerIds: { home: new Set(), away: new Set() },
        };
        byKey.set(gameId, game);
      } else {
        if (game.home !== home || game.away !== away) {
          throw new Error(`Player game log ${gameId} conflicts on home/away teams.`);
        }
        game.homePts = mergeScore(game.homePts,homePts,gameId,'home score');
        game.awayPts = mergeScore(game.awayPts,awayPts,gameId,'away score');
        game.ot = mergeScore(game.ot,nullableNumber(row.ot),gameId,'overtime count');
      }
      if (game.sides.has(side)) throw new Error(`Player game log ${gameId} duplicates its ${side} team row.`);
      game.sides.add(side);
      const box = row.home ? game.boxHome : game.boxAway;
      const players = Array.isArray(row.players) ? row.players : Array.isArray(row.lines) ? row.lines : [];
      for (const player of players) {
        const playerId = playerIdentity(player);
        if (playerId && game.playerIds[side].has(playerId)) {
          throw new Error(`Player game log ${gameId} duplicates a player line for its ${side} team.`);
        }
        if (playerId) game.playerIds[side].add(playerId);
        const line = lineOf(player);
        if (line) box.lines.push(line);
      }
    }
  }
  return [...byKey.values()].map(({ sides, playerIds, ...game }) => game);
}

// Prefer the schedule's stable game ID. Games without a corresponding ID fall
// back to their home/away pair occurrence without consuming an ID-matched row.
export function alignGamesToSchedule(games, scheduleRows) {
  const replayGames = Array.isArray(games) ? games : [];
  const rows = Array.isArray(scheduleRows) ? scheduleRows : [];
  const byId = new Map();
  const byPair = new Map();
  replayGames.forEach((game,index) => {
    const id = identifier(game?.gameId ?? game?.id);
    if (id) {
      if (byId.has(id)) throw new Error(`Replay has duplicate game ID ${id}.`);
      byId.set(id,index);
    }
    const key = pairKey(game?.home,game?.away);
    if (key) {
      const indices = byPair.get(key) || [];
      indices.push(index);
      byPair.set(key,indices);
    }
  });

  const aligned = Array(rows.length).fill(null);
  const used = new Set();
  const seenScheduleIds = new Set();
  rows.forEach((row,index) => {
    const id = identifier(row?.gameId ?? row?.id ?? row?.scheduleGameId);
    if (!id) return;
    if (seenScheduleIds.has(id)) throw new Error(`Schedule has duplicate game ID ${id}.`);
    seenScheduleIds.add(id);
    const gameIndex = byId.get(id);
    if (gameIndex === undefined) return;
    const game = replayGames[gameIndex];
    const schedulePair = pairKey(row?.home,row?.away);
    const replayPair = pairKey(game?.home,game?.away);
    if (schedulePair && replayPair && schedulePair !== replayPair) {
      throw new Error(`Replay game ${id} conflicts with the schedule matchup.`);
    }
    aligned[index] = game;
    used.add(gameIndex);
  });

  const pairCursor = new Map();
  rows.forEach((row,index) => {
    if (aligned[index]) return;
    const key = pairKey(row?.home,row?.away);
    if (!key) return;
    const candidates = byPair.get(key) || [];
    let cursor = pairCursor.get(key) || 0;
    while (cursor < candidates.length && used.has(candidates[cursor])) cursor += 1;
    if (cursor < candidates.length) {
      const gameIndex = candidates[cursor];
      aligned[index] = replayGames[gameIndex];
      used.add(gameIndex);
      cursor += 1;
    }
    pairCursor.set(key,cursor);
  });
  return aligned;
}

export function normalizeBlend(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return 0.5;
  const blend = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(blend) ? blend : 0.5;
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
  // 'conference finals' text in the conference field would misroute a
  // conference-final series into the NBA Finals slot — match finals markers
  // exactly instead of substring-checking.
  if (value === 'finals' || value === 'final' || value === 'league') return 'FINALS';
  return null;
}

function seriesGamesOf(series) {
  return (Array.isArray(series.games) ? series.games : []).map((game, index) => {
    const gameNumber = nullableNumber(game.game);
    return {
      game: Number.isSafeInteger(gameNumber) && gameNumber > 0 ? gameNumber : index + 1,
      home: codeOf(game.homeTeamId ?? game.home),
      away: codeOf(game.awayTeamId ?? game.away),
      homePts: nullableNumber(game.scoreHome ?? game.homeScore ?? game.homePts),
      awayPts: nullableNumber(game.scoreAway ?? game.awayScore ?? game.awayPts),
    };
  }).filter(game => game.home && game.away);
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
    const stageText = String(series.stage ?? series.round ?? series.roundName ?? '').toLowerCase();
    const label = localRoundLabel(series.round ?? series.roundName ?? series.stage, unknownLabels.size);
    if (conference === 'FINALS' || stageText === 'finals' || /nba finals?/.test(stageText)) {
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
    finals,
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
    const games = nullableNumber(row.games);
    const repeat = repeatRows.find(item => {
      const repeatCode = codeOf(item?.teamId) || codeOf(item?.team) || codeOf(item?.displayTeam);
      return repeatCode && repeatCode === code;
    }) || null;
    const medianWins = quantileOf(repeat?.winQuantiles, '0.5');
    const team = league?.byCode?.get(code) || null;
    const pointsFor = nullableNumber(row.pointsFor);
    const pointsAgainst = nullableNumber(row.pointsAgainst);
    const derivedRate = (numerator, denominator) => numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
    const ortg = nullableNumber(row.simulatedMetrics?.offense) ?? derivedRate(pointsFor, games);
    const drtg = nullableNumber(row.simulatedMetrics?.defense) ?? derivedRate(pointsAgainst, games);
    return {
      code,
      wins: medianWins ?? nullableNumber(row.wins),
      losses: nullableNumber(row.losses),
      ties: nullableNumber(row.ties),
      ortg,
      drtg,
      pace: nullableNumber(row.pace) ?? nullableNumber(team?.pace),
      playoff: repeat ? nullableNumber(repeat.playoffAppearanceRate ?? repeat.playoff) : undefined,
      title: repeat ? nullableNumber(repeat.titleRate ?? repeat.title) : undefined,
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
    matchupWeights: { ownOffense: normalizeBlend(blend) },
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
