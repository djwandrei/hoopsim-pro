// Game Lab native engine bridge: the site's release-pinned possession
// simulator runs every matchup — the studio UI drives it but never models
// game outcomes itself. Reports are mapped from the native Monte Carlo
// result into the shapes the studio's Game Lab views consume.
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';

const GAME_LAB_MODULE = '/tools/swishiq-studio/game-lab.js';
const POSSESSION_MODULE = '/tools/swishiq-studio/engine/possession-simulator.js?v=20261001c&rev=possession-workbench-v10-score-mean-se-v1';
const SEED_MODULE = '/tools/swishiq-studio/engine/simulation-seed.js?v=20260920c&rev=random-by-default-v1';

let modulesPromise = null;
export function nativeGameLabModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      loadNativeModule(GAME_LAB_MODULE),
      loadNativeModule(POSSESSION_MODULE),
      loadNativeModule(SEED_MODULE),
    ]).then(([gameLab, possession, seedModule]) => ({
      loadSwishIqGameLabSource: gameLab.loadSwishIqGameLabSource,
      simulateMatchup: possession.simulateMatchup,
      resolveSimulationSeed: seedModule.resolveSimulationSeed,
    }));
    modulesPromise.catch(() => { modulesPromise = null; });
  }
  return modulesPromise;
}

// One verified native game source (team payloads + possession contexts) per
// exact package per session.
const sourceCache = new Map();
export async function nativeGameLabSource(entry) {
  const packageId = entry?.packageId;
  const packageVersion = entry?.packageVersion;
  if (!packageId || !packageVersion) throw new Error('The exact-season package reference is unavailable.');
  const key = `${packageId}@${packageVersion}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  const task = (async () => {
    const modules = await nativeGameLabModules();
    const source = await modules.loadSwishIqGameLabSource({ packageId, packageVersion, fetchImpl: originalFetch });
    if (source?.phase !== 'ready' || !source.payloadById?.size) {
      throw new Error('The native Game Lab source has no verified team payloads.');
    }
    return source;
  })();
  sourceCache.set(key, task);
  task.catch(() => sourceCache.delete(key));
  return task;
}

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// Display hosts follow the studio's 2-2-1-1-1 pattern; the native series is
// played on neutral terms.
export const NATIVE_SERIES_PATTERN = [1, 2, 5, 7];

// Slim, storage-safe copy of the native report the studio panels render.
function nativeSummaryOf(report) {
  return {
    modelVersion: report.modelVersion || null,
    outcomeModel: report.outcomeModel || null,
    wins: report.wins || null,
    shares: report.shares || null,
    standardError: report.monteCarloStandardError || null,
    expectedScore: report.expectedRegulationScore || null,
    expectedPpp: report.expectedPpp || null,
    settings: report.settings || null,
    histogram: report.firstGame?.histogram || null,
    seriesLengths: report.seriesLengths || null,
  };
}

// Single-game format: the example (first-trial) game carries the period
// timeline; map it into the studio's game shape (a = home, b = away).
export function mapNativeGameReport(report, homeCode, awayCode) {
  const example = report?.example || null;
  const game = example?.games?.[0] || null;
  if (!game) throw new Error('The native matchup report has no example game.');
  if (!example.winner) throw new Error('The native game reached the overtime cap without a winner — sim again with a new seed.');
  const homePts = num(game.a);
  const awayPts = num(game.b);
  const pbp = (game.timeline || []).map(row => ({
    q: row.period, clock: 'END', side: null, pts: 0, type: 'period',
    score: [num(row.a), num(row.b)],
    text: `End of ${row.period} — ${awayCode} ${num(row.b)} · ${homeCode} ${num(row.a)}`,
  }));
  pbp.push({
    q: game.overtimes ? `OT${game.overtimes}` : 'Q4', clock: 'FINAL', side: null, pts: 0, type: 'final',
    score: [homePts, awayPts],
    text: `Final — ${awayCode} ${awayPts} · ${homeCode} ${homePts}`,
  });
  return {
    home: homeCode, away: awayCode, homePts, awayPts, ot: num(game.overtimes),
    poss: num(game.possessions),
    ortgH: num(report.expectedPpp?.a) * 100, ortgA: num(report.expectedPpp?.b) * 100,
    pbp, boxHome: { lines: [] }, boxAway: { lines: [] },
    native: nativeSummaryOf(report),
  };
}

// Best-of-7 format: the example series carries every played game plus the
// final win split (a = the home-picked team, b = away).
export function mapNativeSeriesReport(report, homeCode, awayCode) {
  const example = report?.example || null;
  const games = Array.isArray(example?.games) ? example.games : [];
  if (!games.length) throw new Error('The native series report has no games.');
  if (!example.winner) throw new Error('The native series ended unresolved — sim again with a new seed.');
  const mapped = games.map((game, index) => {
    const number = index + 1;
    const homeHosts = NATIVE_SERIES_PATTERN.includes(number);
    return {
      game: number,
      host: homeHosts ? homeCode : awayCode,
      visitor: homeHosts ? awayCode : homeCode,
      hostPts: num(homeHosts ? game.a : game.b),
      visitorPts: num(homeHosts ? game.b : game.a),
      ot: num(game.overtimes),
      timeline: (game.timeline || []).map(row => ({ period: row.period, a: num(row.a), b: num(row.b) })),
    };
  });
  return {
    home: homeCode, away: awayCode,
    homeWins: num(example.seriesWins?.a), awayWins: num(example.seriesWins?.b),
    games: mapped,
    native: nativeSummaryOf(report),
  };
}