/* Candidate 57 cache: preserved Pass-6 V2 feature construction plus native Candidate 51 contexts. */
/*
 * Chronological development runner for the Pass-6 scratch-champion
 * reimplementation.  This is intentionally separate from the official
 * Candidate 10/11/26/51 runners and does not change package or site assets.
 *
 * The outside source supplied equations, not executable source or fitted
 * checkpoints.  The report therefore identifies this run as a local
 * reimplementation, not an exact reproduction or an approval receipt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  PASS6_VERSION,
  PASS6_STATUS,
  PASS6_RIDGE_LAMBDA,
  PASS6_DECAY_HALF_LIFE_DAYS,
  PASS6_RESIDUAL_WINDOW,
  PASS6_RESIDUAL_DRAWS,
  PASS6_RESIDUAL_STRATA_MINIMUM,
  PASS6_TOTAL_FEATURE_NAMES,
  PASS6_MARGIN_FEATURE_NAMES,
  PASS6_CONTRACT,
  buildPass6Standardization,
  buildPass6Design,
  fitPass6FromNormalEquations,
  predictPass6Score,
  buildPass6Distribution,
} from '../models/game-lab-pass6-scratch-challenger-v2.mjs';
import { scoreEmpiricalDistribution } from '../models/game-lab-candidate10-paired-distribution-v3.mjs';
import { probabilityMetrics, pointMetrics } from '../models/game-lab-candidate10-predictive-metrics-v2.mjs';

if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node build-feature-cache.mjs <external-parts-directory> <new-output-directory> [season-start-years]');
const packageRoot = path.resolve(process.argv[2]);
const runLabel = 'standalone';
const targetSeasons = (process.argv[4] ?? '2021,2022,2023,2024,2025').split(',').map(value => Number(value));
const output = path.resolve(process.argv[3]);
const requestedExclusions = [];
const runScreen = process.argv.includes('--screen');
const bootstrapRepetitions = 2000;
const minimumTrainingObservations = 100;
const modelRebuildIntervalDays = 12;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const fail = message => { throw new Error(message); };
const dateMs = date => Date.parse(`${date}T00:00:00Z`);
const daysBetween = (from, to) => Math.round((dateMs(to) - dateMs(from)) / 86400000);
const pin = file => {
  const bytes = fs.readFileSync(file);
  return { path: path.resolve(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};

if (fs.existsSync(output)) fail(`Preserve previous output; choose a new run label: ${output}`);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(runLabel)) fail('Invalid run label.');
if (!targetSeasons.length || targetSeasons.some((year, index) => !Number.isInteger(year) || year < 2021
    || year > 2025 || (index > 0 && year <= targetSeasons[index - 1]))) fail('Target seasons must be supported ascending season start years after the 2020 warmup.');
const unknownExclusions = requestedExclusions.filter(name => !PASS6_TOTAL_FEATURE_NAMES.includes(name) && !PASS6_MARGIN_FEATURE_NAMES.includes(name));
if (unknownExclusions.length || new Set(requestedExclusions).size !== requestedExclusions.length) fail(`Unknown or duplicate Pass-6 feature exclusions: ${unknownExclusions.join(',')}`);
const activeTotalFeatureNames = PASS6_TOTAL_FEATURE_NAMES.filter(name => !requestedExclusions.includes(name));
const activeMarginFeatureNames = PASS6_MARGIN_FEATURE_NAMES.filter(name => !requestedExclusions.includes(name));
if (!activeTotalFeatureNames.length || !activeMarginFeatureNames.length) fail('At least one total and one margin feature must remain.');

const files = {
  inputs: path.join(packageRoot, 'game-lab-inputs.json'),
  teamGames: path.join(packageRoot, 'team-games.json'),
  playerGames: path.join(packageRoot, 'player-games.json'),
};
for (const file of Object.values(files)) if (!fs.existsSync(file)) fail(`Missing package part: ${file}`);
const inputs = read(files.inputs).records;
const teamRows = read(files.teamGames).records;
const playerRows = read(files.playerGames).records;

function buildScoreGames() {
  const byGame = new Map();
  for (const row of teamRows) {
    if (row.time.phase !== 'regular' || row.values.reconciliationStatus !== 'matched' || row.values.trainingEligible !== true) continue;
    const sides = byGame.get(row.entities.gameRef) || [];
    sides.push(row);
    byGame.set(row.entities.gameRef, sides);
  }
  const games = [];
  const sideKeys = new Set();
  for (const [gameRef, sides] of byGame) {
    if (sides.length !== 2) fail(`Expected two eligible team-game sides for ${gameRef}.`);
    const home = sides.find(row => row.values.isHome === true);
    const away = sides.find(row => row.values.isHome === false);
    if (!home || !away || home.time.gameDateLocal !== away.time.gameDateLocal
        || home.time.seasonStartYear !== away.time.seasonStartYear
        || home.entities.teamCode !== away.entities.opponentTeamCode
        || away.entities.teamCode !== home.entities.opponentTeamCode
        || home.values.pointsFor !== away.values.pointsAgainst
        || home.values.pointsAgainst !== away.values.pointsFor) fail(`Invalid paired team-game rows for ${gameRef}.`);
    sideKeys.add(`${gameRef}|${home.entities.teamCode}`);
    sideKeys.add(`${gameRef}|${away.entities.teamCode}`);
    games.push({
      gameRef,
      seasonStartYear: home.time.seasonStartYear,
      gameDateLocal: home.time.gameDateLocal,
      homeTeamRef: home.entities.teamCode,
      awayTeamRef: away.entities.teamCode,
      homeScore: home.values.pointsFor,
      awayScore: away.values.pointsFor,
    });
  }
  games.sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  return { games, sideKeys };
}

const { games: scoreGames, sideKeys } = buildScoreGames();
const gameByRef = new Map(scoreGames.map(game => [game.gameRef, game]));
const inputTargetRefs = new Set(inputs.filter(row => row.time.phase === 'regular'
  && row.evidence?.status === 'available' && row.values?.target?.status === 'available'
  && Number.isSafeInteger(row.values.target.homeScore) && Number.isSafeInteger(row.values.target.awayScore))
  .map(row => row.entities.gameRef));
for (const game of scoreGames) if (!inputTargetRefs.has(game.gameRef)) fail(`Game-lab input target missing for ${game.gameRef}.`);
for (const row of inputs.filter(row => inputTargetRefs.has(row.entities.gameRef))) {
  const game = gameByRef.get(row.entities.gameRef);
  if (!game || game.gameDateLocal !== row.time.gameDateLocal || game.seasonStartYear !== row.time.seasonStartYear
      || game.homeScore !== row.values.target.homeScore || game.awayScore !== row.values.target.awayScore) {
    fail(`Input target and paired team-game scores disagree for ${row.entities.gameRef}.`);
  }
}

function makePlayerHistory() {
  const bySide = new Map();
  const duplicate = [];
  for (const row of playerRows) {
    if (row.time.phase !== 'regular') continue;
    const key = `${row.entities.gameRef}|${row.entities.teamCode}`;
    if (!sideKeys.has(key)) continue;
    const playerRef = row.entities.playerRef;
    const minutes = row.values?.minutes;
    if (row.evidence?.status !== 'available' || typeof playerRef !== 'string' || !playerRef || !finite(minutes) || minutes < 0) {
      fail(`Invalid player-game row ${row.recordId}.`);
    }
    const players = bySide.get(key) || new Map();
    if (players.has(playerRef)) duplicate.push(`${key}/${playerRef}`);
    players.set(playerRef, { minutes, active: minutes > 0 });
    bySide.set(key, players);
  }
  if (duplicate.length) fail(`Duplicate player-game rows: ${duplicate[0]}.`);
  return bySide;
}

const playerHistoryBySide = makePlayerHistory();

function solve(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  const size = vector.length;
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (!finite(rows[pivot][col]) || Math.abs(rows[pivot][col]) < 1e-10) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let cell = col; cell <= size; cell += 1) rows[col][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      if (!factor) continue;
      for (let cell = col; cell <= size; cell += 1) rows[row][cell] -= factor * rows[col][cell];
    }
  }
  return rows.map(row => row[size]);
}

const teamCodes = [...new Set(scoreGames.flatMap(game => [game.homeTeamRef, game.awayTeamRef]))].sort();
const teamIndex = new Map(teamCodes.map((team, index) => [team, index]));

function fitSrs(completedGames, targetSeason, targetDate, recencyHalfLifeDays = null) {
  const width = teamCodes.length + 1;
  const gram = Array.from({ length: width }, () => Array(width).fill(0));
  const cross = Array(width).fill(0);
  const add = (game, weight) => {
    const vector = [1, ...Array(teamCodes.length).fill(0)];
    vector[1 + teamIndex.get(game.homeTeamRef)] = 1;
    vector[1 + teamIndex.get(game.awayTeamRef)] = -1;
    const target = game.homeScore - game.awayScore;
    for (let row = 0; row < width; row += 1) {
      cross[row] += weight * vector[row] * target;
      for (let column = 0; column < width; column += 1) if (vector[row] && vector[column]) gram[row][column] += weight * vector[row] * vector[column];
    }
  };
  for (const game of completedGames) {
    if (game.gameDateLocal >= targetDate) continue;
    const seasonAge = targetSeason - game.seasonStartYear;
    if (seasonAge > 2) continue;
    let weight = seasonAge === 0 ? 1 : seasonAge === 1 ? 0.6 : 0.3;
    if (recencyHalfLifeDays != null) {
      const age = daysBetween(game.gameDateLocal, targetDate);
      if (age < 0 || age > 140) continue;
      weight *= 2 ** (-age / recencyHalfLifeDays);
    }
    add(game, weight);
  }
  for (let index = 1; index < width; index += 1) gram[index][index] += 8;
  const coefficients = solve(gram, cross);
  if (!coefficients) return new Map(teamCodes.map(team => [team, 0]));
  return new Map(teamCodes.map((team, index) => [team, coefficients[index + 1]]));
}

function emptyTeamState() {
  return {
    completedGames: [],
    teamRecords: new Map(),
    playerRecords: new Map(),
    ewmaTotal: new Map(),
    ewmaMargin: new Map(),
    elo: new Map(teamCodes.map(team => [team, 1500])),
    eloMov: new Map(teamCodes.map(team => [team, 1500])),
    srs: { lastDate: null, current: new Map(), recent: new Map() },
  };
}

function recordsFor(state, team) { return state.teamRecords.get(team) || []; }
function playerRecordsFor(state, team) { return state.playerRecords.get(team) || []; }
function leagueValues(state, field, predicate = () => true) {
  return state.completedGames.filter(predicate).flatMap(game => {
    if (field === 'pf') return [game.homeScore, game.awayScore];
    if (field === 'pa') return [game.awayScore, game.homeScore];
    if (field === 'total') return [game.homeScore + game.awayScore];
    if (field === 'margin') return [game.homeScore - game.awayScore, game.awayScore - game.homeScore];
    return [];
  });
}
function recordValue(record, field) {
  if (field === 'pf') return record.pf;
  if (field === 'pa') return record.pa;
  if (field === 'total') return record.total;
  if (field === 'margin') return record.margin;
  if (field === 'win') return Number(record.win);
  return null;
}
function recentRecords(state, team, targetSeason, targetDate, window, field, predicate = () => true) {
  const all = recordsFor(state, team).filter(record => record.gameDateLocal < targetDate && predicate(record));
  const current = all.filter(record => record.seasonStartYear === targetSeason).slice(-window);
  let chosen = current;
  if (current.length < 3) {
    const previous = all.filter(record => record.seasonStartYear === targetSeason - 1).slice(-(3 - current.length));
    chosen = [...previous, ...current];
  }
  if (!chosen.length) return null;
  return chosen.map(record => recordValue(record, field));
}
function rollingMean(state, team, targetSeason, targetDate, window, field, fallback) {
  const values = recentRecords(state, team, targetSeason, targetDate, window, field);
  if (values?.length) return mean(values);
  return fallback;
}
function restDays(state, team, targetDate) {
  const latest = recordsFor(state, team).filter(record => record.gameDateLocal < targetDate).at(-1);
  return latest ? Math.max(0, daysBetween(latest.gameDateLocal, targetDate)) : 3;
}
function gamesLast7(state, team, targetDate) {
  const cutoff = dateMs(targetDate) - 7 * 86400000;
  return recordsFor(state, team).filter(record => record.gameDateLocal < targetDate && dateMs(record.gameDateLocal) >= cutoff).length;
}
function ewmaValue(state, team, field, fallback) {
  return (field === 'total' ? state.ewmaTotal : state.ewmaMargin).get(team) ?? fallback;
}
function venueMean(state, team, targetSeason, targetDate, isHome, window, field, fallback) {
  const values = recentRecords(state, team, targetSeason, targetDate, window, field, record => record.isHome === isHome);
  return values?.length ? mean(values) : fallback;
}
function venueDeviation(state, team, targetSeason, targetDate, isHome, window, fallback) {
  const venue = venueMean(state, team, targetSeason, targetDate, isHome, window, 'margin', fallback);
  const all = rollingMean(state, team, targetSeason, targetDate, window, 'margin', fallback);
  return venue - all;
}

function refreshSrs(state, targetSeason, targetDate) {
  if (!state.srs.lastDate || daysBetween(state.srs.lastDate, targetDate) >= modelRebuildIntervalDays) {
    state.srs.current = fitSrs(state.completedGames, targetSeason, targetDate);
    state.srs.recent = fitSrs(state.completedGames, targetSeason, targetDate, 90);
    state.srs.lastDate = targetDate;
  }
}

function playerTopIds(state, team, targetDate, count) {
  const totals = new Map();
  for (const game of playerRecordsFor(state, team).filter(row => row.gameDateLocal < targetDate).slice(-10)) {
    for (const [player, value] of game.players) totals.set(player, (totals.get(player) || 0) + value.minutes);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count).map(([player]) => player);
}
function availabilityMetric(state, team, targetDate, count, gameWindow) {
  const top = playerTopIds(state, team, targetDate, count);
  if (!top.length) return 0.5;
  const games = playerRecordsFor(state, team).filter(row => row.gameDateLocal < targetDate).slice(-gameWindow);
  if (!games.length) return 0.5;
  let available = 0;
  for (const game of games) available += top.reduce((sum, player) => sum + Number(game.players.get(player)?.active === true), 0) / top.length;
  return available / games.length;
}
function missingMetric(state, team, targetDate, count, gameWindow) {
  const top = playerTopIds(state, team, targetDate, count);
  if (!top.length) return 0.5;
  const games = playerRecordsFor(state, team).filter(row => row.gameDateLocal < targetDate).slice(-gameWindow);
  if (!games.length) return 0.5;
  let missing = 0;
  for (const game of games) missing += top.reduce((sum, player) => sum + Number(game.players.get(player)?.active !== true), 0) / top.length;
  return missing / games.length;
}
function topMinutesShare(state, team, targetDate, gameWindow) {
  const top = playerTopIds(state, team, targetDate, 5);
  const games = playerRecordsFor(state, team).filter(row => row.gameDateLocal < targetDate).slice(-gameWindow);
  if (!top.length || !games.length) return 0.2;
  return mean(games.map(game => {
    const total = [...game.players.values()].reduce((sum, value) => sum + value.minutes, 0);
    if (!total) return 0.2;
    return top.reduce((sum, player) => sum + (game.players.get(player)?.minutes || 0), 0) / total;
  }));
}

function buildFeatureRows() {
  const state = emptyTeamState();
  const byDate = new Map();
  for (const game of scoreGames) {
    const rows = byDate.get(game.gameDateLocal) || [];
    rows.push(game);
    byDate.set(game.gameDateLocal, rows);
  }
  const featureRows = [];
  const dates = [...byDate.keys()].sort();
  for (const date of dates) {
    const day = byDate.get(date).sort((a, b) => a.gameRef.localeCompare(b.gameRef));
    const season = day[0].seasonStartYear;
    refreshSrs(state, season, date);
    const leaguePf = mean(leagueValues(state, 'pf')) || 110;
    const leaguePa = mean(leagueValues(state, 'pa')) || 110;
    const leagueTotal = mean(leagueValues(state, 'total')) || 220;
    const leagueMargin = mean(leagueValues(state, 'margin')) || 0;
    const dayFeatures = day.map(game => {
      const home = game.homeTeamRef;
      const away = game.awayTeamRef;
      const hpf10 = rollingMean(state, home, season, date, 10, 'pf', leaguePf);
      const apf10 = rollingMean(state, away, season, date, 10, 'pf', leaguePf);
      const hpa10 = rollingMean(state, home, season, date, 10, 'pa', leaguePa);
      const apa10 = rollingMean(state, away, season, date, 10, 'pa', leaguePa);
      const hpf20 = rollingMean(state, home, season, date, 20, 'pf', leaguePf);
      const apf20 = rollingMean(state, away, season, date, 20, 'pf', leaguePf);
      const hpa20 = rollingMean(state, home, season, date, 20, 'pa', leaguePa);
      const apa20 = rollingMean(state, away, season, date, 20, 'pa', leaguePa);
      const homeRest = restDays(state, home, date);
      const awayRest = restDays(state, away, date);
      const homeG7 = gamesLast7(state, home, date);
      const awayG7 = gamesLast7(state, away, date);
      const homeEwmaTotal = ewmaValue(state, home, 'total', leagueTotal);
      const awayEwmaTotal = ewmaValue(state, away, 'total', leagueTotal);
      const homeVenueTotal = venueMean(state, home, season, date, true, 10, 'total', leagueTotal);
      const awayVenueTotal = venueMean(state, away, season, date, false, 10, 'total', leagueTotal);
      const pf10 = hpf10 - apf10;
      const def10 = apa10 - hpa10;
      const wr10 = rollingMean(state, home, season, date, 10, 'win', 0.5) - rollingMean(state, away, season, date, 10, 'win', 0.5);
      const pf20 = hpf20 - apf20;
      const def20 = apa20 - hpa20;
      const wr20 = rollingMean(state, home, season, date, 20, 'win', 0.5) - rollingMean(state, away, season, date, 20, 'win', 0.5);
      const pf5 = rollingMean(state, home, season, date, 5, 'pf', leaguePf) - rollingMean(state, away, season, date, 5, 'pf', leaguePf);
      const def5 = rollingMean(state, away, season, date, 5, 'pa', leaguePa) - rollingMean(state, home, season, date, 5, 'pa', leaguePa);
      const classicHomeElo = state.elo.get(home) ?? 1500;
      const classicAwayElo = state.elo.get(away) ?? 1500;
      const movHomeElo = state.eloMov.get(home) ?? 1500;
      const movAwayElo = state.eloMov.get(away) ?? 1500;
      const homeAvail5 = availabilityMetric(state, home, date, 5, 3);
      const awayAvail5 = availabilityMetric(state, away, date, 5, 3);
      const homeAvail8 = availabilityMetric(state, home, date, 8, 3);
      const awayAvail8 = availabilityMetric(state, away, date, 8, 3);
      const homeMiss10 = missingMetric(state, home, date, 10, 10);
      const awayMiss10 = missingMetric(state, away, date, 10, 10);
      const homeTop5 = topMinutesShare(state, home, date, 5);
      const awayTop5 = topMinutesShare(state, away, date, 5);
      return {
        gameRef: game.gameRef,
        gameDateLocal: date,
        seasonStartYear: season,
        observedThrough: state.completedGames.at(-1)?.gameDateLocal ?? null,
        homeTeamRef: home,
        awayTeamRef: away,
        target: { homeScore: game.homeScore, awayScore: game.awayScore, total: game.homeScore + game.awayScore, margin: game.homeScore - game.awayScore },
        features: {
          total: { hp10: hpf10, ap10: apf10, hpa10, apa10, hp20: hpf20, ap20: apf20, hpa20, apa20,
            restMean: (homeRest + awayRest) / 2, g7Mean: (homeG7 + awayG7) / 2,
            etMean: (homeEwmaTotal + awayEwmaTotal) / 2, venueTotMean: (homeVenueTotal + awayVenueTotal) / 2 },
          margin: { pfAdv10: pf10, defAdv10: def10, wrAdv10: wr10, pfAdv20: pf20, defAdv20: def20, wrAdv20: wr20,
            pfAdv5: pf5, defAdv5: def5, restAdv: homeRest - awayRest, g7Adv: homeG7 - awayG7,
            strAdv: (state.srs.current.get(home) ?? 0) - (state.srs.current.get(away) ?? 0),
            rStrAdv90: (state.srs.recent.get(home) ?? 0) - (state.srs.recent.get(away) ?? 0),
            emAdv: ewmaValue(state, home, 'margin', leagueMargin) - ewmaValue(state, away, 'margin', leagueMargin),
            eloAdv: (classicHomeElo + 50 - classicAwayElo) / 100,
            eloAdv_12h50m: (movHomeElo + 50 - movAwayElo) / 100,
            venueAdv: venueDeviation(state, home, season, date, true, 10, 0) - venueDeviation(state, away, season, date, false, 10, 0),
            availAdv5: homeAvail5 - awayAvail5, availAdv8: homeAvail8 - awayAvail8,
            missAdv10: awayMiss10 - homeMiss10, minTop5Adv: homeTop5 - awayTop5 },
        },
      };
    });
    featureRows.push(...dayFeatures);
    // Apply the full local date only after all same-date features have been captured.
    for (const game of day) {
      state.completedGames.push(game);
      const homeRecord = { gameRef: game.gameRef, gameDateLocal: date, seasonStartYear: season, pf: game.homeScore, pa: game.awayScore,
        total: game.homeScore + game.awayScore, margin: game.homeScore - game.awayScore, win: game.homeScore > game.awayScore, isHome: true };
      const awayRecord = { gameRef: game.gameRef, gameDateLocal: date, seasonStartYear: season, pf: game.awayScore, pa: game.homeScore,
        total: game.homeScore + game.awayScore, margin: game.awayScore - game.homeScore, win: game.awayScore > game.homeScore, isHome: false };
      for (const [team, record] of [[game.homeTeamRef, homeRecord], [game.awayTeamRef, awayRecord]]) {
        const list = state.teamRecords.get(team) || [];
        list.push(record);
        state.teamRecords.set(team, list);
        const previousTotal = state.ewmaTotal.get(team) ?? (mean(leagueValues(state, 'total')) || 220);
        const previousMargin = state.ewmaMargin.get(team) ?? 0;
        state.ewmaTotal.set(team, 0.12 * record.total + 0.88 * previousTotal);
        state.ewmaMargin.set(team, 0.12 * record.margin + 0.88 * previousMargin);
      }
      const homeElo = state.elo.get(game.homeTeamRef) ?? 1500;
      const awayElo = state.elo.get(game.awayTeamRef) ?? 1500;
      const homeExpected = 1 / (1 + 10 ** (-((homeElo + 50) - awayElo) / 400));
      const outcome = game.homeScore > game.awayScore ? 1 : game.homeScore === game.awayScore ? 0.5 : 0;
      state.elo.set(game.homeTeamRef, homeElo + 20 * (outcome - homeExpected));
      state.elo.set(game.awayTeamRef, awayElo + 20 * ((1 - outcome) - (1 - homeExpected)));
      const mov = ((Math.abs(game.homeScore - game.awayScore) + 3) ** 0.8) / 7.5;
      const homeMov = state.eloMov.get(game.homeTeamRef) ?? 1500;
      const awayMov = state.eloMov.get(game.awayTeamRef) ?? 1500;
      const homeMovExpected = 1 / (1 + 10 ** (-((homeMov + 50) - awayMov) / 400));
      state.eloMov.set(game.homeTeamRef, homeMov + 12 * mov * (outcome - homeMovExpected));
      state.eloMov.set(game.awayTeamRef, awayMov + 12 * mov * ((1 - outcome) - (1 - homeMovExpected)));
      for (const team of [game.homeTeamRef, game.awayTeamRef]) {
        const key = `${game.gameRef}|${team}`;
        const players = playerHistoryBySide.get(key);
        if (!players?.size) fail(`Player-game history missing for ${key}; no zero imputation is allowed.`);
        const history = state.playerRecords.get(team) || [];
        history.push({ gameRef: game.gameRef, gameDateLocal: date, players });
        state.playerRecords.set(team, history);
      }
    }
  }
  if (!featureRows.length) fail('No feature rows were built.');
  return featureRows;
}

import { buildCandidate10HistoryContexts } from '../models/game-lab-candidate10-history-features-v2.mjs';
import { buildCandidate16RotationContexts } from '../models/game-lab-candidate16-rotation-context-v1.mjs';
import { buildCandidate21BoxscoreContexts } from '../models/game-lab-candidate21-boxscore-history-context-v1.mjs';
import { buildCandidate22BoxscoreProfileContexts } from '../models/game-lab-candidate22-boxscore-profile-history-context-v1.mjs';
import { buildCandidate23PlayerRoleContexts } from '../models/game-lab-candidate23-player-role-context-v1.mjs';
import { buildCandidate24VenueContexts } from '../models/game-lab-candidate24-venue-form-context-v1.mjs';
import { buildCandidate10Features } from '../models/game-lab-native-score-model-candidate10-v5.mjs';

const configPath = path.join(import.meta.dirname, '../configuration/source-feature-contract.json');
const c51 = read(configPath);
const c51Names = {
  total: c51.candidate51Inputs.total,
  margin: c51.candidate51Inputs.margin,
};
if (c51Names.total.length !== 39 || c51Names.margin.length !== 32) fail('Unexpected Candidate 51 feature contract.');
const pass6Excluded = new Set(['pfAdv5', 'defAdv5', 'strAdv', 'emAdv', 'eloAdv_12h50m']);
const pass6Names = {
  total: [...PASS6_TOTAL_FEATURE_NAMES],
  margin: PASS6_MARGIN_FEATURE_NAMES.filter(name => !pass6Excluded.has(name)),
};
const outsideRows = buildFeatureRows();
const nativeGames = scoreGames.map(game => ({ ...game, phase: 'regular', reconciliationStatus: 'matched', trainingEligible: true }));
const playerSides = new Map();
for (const row of playerRows) {
  const key = `${row.entities.gameRef}|${row.entities.teamCode}`;
  if (row.time.phase !== 'regular' || !sideKeys.has(key)) continue;
  const list = playerSides.get(key) || [];
  list.push({ playerRef: row.entities.playerRef, minutes: row.values.minutes, isStarter: row.values.isStarter ?? null });
  playerSides.set(key, list);
}
const rotationGames = nativeGames.map(game => ({
  ...game,
  homeRotation: { players: playerSides.get(`${game.gameRef}|${game.homeTeamRef}`) },
  awayRotation: { players: playerSides.get(`${game.gameRef}|${game.awayTeamRef}`) },
}));
const contextSets = {
  historicalContext: buildCandidate10HistoryContexts({ games: nativeGames }),
  rotation: buildCandidate16RotationContexts({ games: rotationGames }),
  boxscore: buildCandidate21BoxscoreContexts({ playerGameRows: playerRows, teamGameRows: teamRows }),
  boxscoreProfile: buildCandidate22BoxscoreProfileContexts({ playerGameRows: playerRows, teamGameRows: teamRows }),
  playerConcentration: buildCandidate23PlayerRoleContexts({ playerGameRows: playerRows, teamGameRows: teamRows }),
  venueProfile: buildCandidate24VenueContexts({ games: nativeGames }),
};
for (const [name, context] of Object.entries(contextSets)) {
  if (context.audit.contextCount !== scoreGames.length || context.audit.sameLocalDateOutcomesExcluded !== true) fail('Native source chronology check: ' + name);
}
const inputByRef = new Map(inputs.map(row => [row.entities.gameRef, row]));
const missing = { total: {}, margin: {} };
const unionRows = outsideRows.filter(row => row.seasonStartYear >= 2020).map(row => {
  const contexts = Object.fromEntries(Object.entries(contextSets).map(([name, value]) => [name, value.contexts.get(row.gameRef)]));
  for (const [name, context] of Object.entries(contexts)) {
    if (!context || context.gameDateLocal !== row.gameDateLocal || (context.observedThrough != null && context.observedThrough >= row.gameDateLocal)) fail('Hybrid cutoff mismatch: ' + name + '/' + row.gameRef);
  }
  const source = inputByRef.get(row.gameRef);
  const inputFeatures = { ...source.values.inputFeatures,
    historicalContext: { ...contexts.historicalContext,
      boxscore: contexts.boxscore, boxscoreProfile: contexts.boxscoreProfile,
      playerConcentration: contexts.playerConcentration, venueProfile: contexts.venueProfile } };
  const baseFeatures = buildCandidate10Features(inputFeatures);
  const built = { total: { ...baseFeatures.total }, margin: { ...baseFeatures.margin } };
  const rotation = contexts.rotation;
  for (const metric of ['activePlayerCount', 'topFiveMinutesShare', 'minuteShareHhi', 'activePlayerOverlap', 'starterOverlap', 'minuteShareOverlap']) {
    const title = metric[0].toUpperCase() + metric.slice(1);
    built.total[`mean${title}5`] = (rotation.home[`${metric}5Shrunk`] + rotation.away[`${metric}5Shrunk`]) / 2;
    built.margin[`${metric}Advantage5`] = (rotation.home[`${metric}5Shrunk`] - rotation.away[`${metric}5Shrunk`]) / 2;
  }
  const features = {};
  for (const head of ['total', 'margin']) {
    features[head] = Object.fromEntries([
      ...c51Names[head].map(name => {
        const value = built[head][name];
        if (value == null && head === 'total') missing.total[name] = (missing.total[name] || 0) + 1;
        else if (!finite(value)) fail('Invalid native feature: ' + head + '/' + name);
        return ['c51:' + name, value ?? null];
      }),
      ...pass6Names[head].map(name => ['pass6:' + name, row.features[head][name]]),
    ]);
  }
  return { ...row, features };
});
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, 'feature-rows.jsonl'), unionRows.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
const names = Object.fromEntries(['total', 'margin'].map(head => [head, Object.keys(unionRows[0].features[head])]));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
  format: 'swishiq-candidate57-union-feature-cache-v1', status: 'prior-date-research-inputs',
  featureNames: names, featureCounts: { total: names.total.length, margin: names.margin.length },
  rows: unionRows.length, perSeason: Object.fromEntries([...new Set(unionRows.map(row => row.seasonStartYear))].map(year => [year, unionRows.filter(row => row.seasonStartYear === year).length])),
  observedThroughRule: 'every context excludes the target local date; all same-date features captured before feedback',
  missingValues: missing, imputationPolicy: 'retain null total features; model uses strictly prior warmup centers; no margin nulls permitted',
  candidate51Inputs: c51Names, editedPass6Inputs: pass6Names,
  differencesFromCandidate51Architecture: 'Union refits its complete predictor basis with rolling decayed training. Exact Candidate 51 correction outputs are preserved separately in the forecast-blend experiment.',
  contextAudits: Object.fromEntries(Object.entries(contextSets).map(([name, value]) => [name, value.audit])),
  sourcePins: [...Object.values(files), configPath, import.meta.filename,
    '../models/game-lab-candidate10-history-features-v2.mjs', '../models/game-lab-candidate16-rotation-context-v1.mjs',
    '../models/game-lab-candidate21-boxscore-history-context-v1.mjs', '../models/game-lab-candidate22-boxscore-profile-history-context-v1.mjs',
    '../models/game-lab-candidate23-player-role-context-v1.mjs', '../models/game-lab-candidate24-venue-form-context-v1.mjs',
    '../models/game-lab-native-score-model-candidate10-v5.mjs',
  ].map(file => pin(path.isAbsolute(file) ? file : path.resolve(import.meta.dirname, file))),
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, rows: unionRows.length, counts: { total: names.total.length, margin: names.margin.length }, missing }));
