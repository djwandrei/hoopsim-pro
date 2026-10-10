import { forgePlayerScore } from './forgePool.js';
import { forgeMinutesWeightedOverall } from './forgeOverall.js';
import { buildForgeProfile, rosterRatings, rotationValid, positionFits, forgeSeason, seededRandom, FORGE_SIM_MODEL } from './forgeSimulation.js';

export function scheduleIsComplete(schedule, teams) {
  if (!Array.isArray(schedule) || !schedule.length) return false;
  const counts = new Map(teams.map(t => [t.code, 0]));
  for (const g of schedule) { if (g.home === g.away || !counts.has(g.home) || !counts.has(g.away)) return false; counts.set(g.home, counts.get(g.home) + 1); counts.set(g.away, counts.get(g.away) + 1); }
  return [...counts.values()].every(n => n === 82);
}
// NBA-style 30-team fallback: 2 interconference games, 3 or 4 intraconference games, 41 home games.
export function generateForgeSchedule(teams, seed) {
  const conferences = ['EAST', 'WEST'].map(c => teams.filter(t => t.conference === c).sort((a, b) => a.code.localeCompare(b.code)));
  if (teams.length !== 30 || conferences.some(c => c.length !== 15)) throw new Error('A full 30-team NBA season is required.');
  const games = [];
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = teams[i], b = teams[j], conf = conferences.find(c => c.some(t => t.code === a.code)), ai = conf.indexOf(a), bi = conf.indexOf(b);
    const distance = a.conference === b.conference ? (bi - ai + 15) % 15 : 0;
    const close = distance && Math.min(distance, 15 - distance) <= 2;
    const count = a.conference !== b.conference ? 2 : close ? 3 : 4;
    for (let n = 0; n < count; n++) {
      // Four-game pairs split 2/2. For three-game pairs, orient the
      // circular four-neighbor graph so every team hosts two of its four
      // three-game series and finishes at exactly 41 home games.
      const aHome = count === 4 ? n % 2 === 0 : distance <= 2 ? n < 2 : n === 2;
      games.push({ id: `generated-${a.code}-${b.code}-${n}`, home: aHome ? a.code : b.code, away: aHome ? b.code : a.code, at: null });
    }
  }
  const rng = seededRandom(seed);
  for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }
  return games;
}
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
export function simulateForgeSeason({ league, picks, slots, seed = 41, hostCode, schedule = [], repeats = 12 }) {
  if (!rotationValid(slots, picks)) throw new Error('Fill eight unique rotation spots and allocate exactly 240 minutes (0–48 per player).');
  const host = league.byCode.get(hostCode) || league.teams[0];
  if (!host) throw new Error('The selected league could not be loaded.');
  const drafted = slots.map(slot => ({ slot, player: picks[slot.key].player }));
  const ratings = rosterRatings(picks, slots), teamScore = forgeMinutesWeightedOverall(drafted.map(({ slot, player }) => ({ player, minutes: slot.minutes })));
  const contributions = drafted.map(({ slot, player }) => ({ slot: slot.key, name: player.name, minutes: slot.minutes, fit: positionFits(player.positions, slot.key), grade: forgePlayerScore(player), contribution: forgePlayerScore(player) * slot.minutes / 240 }));
  const fitPenalty = contributions.filter(r => !r.fit).reduce((s, r) => s + r.minutes / 36, 0);
  const roster = drafted.map(({ slot, player }) => ({ ...player, rotationMinutes: slot.minutes, ratings: player }));
  const forgeTeam = buildForgeProfile(league, ratings, { code: 'FRG', name: 'Forge Legends', conference: host.conference, roster, fitPenalty });
  const teams = league.teams.map(t => t.code === host.code ? forgeTeam : t), simLeague = { ...league, teams, byCode: new Map(teams.map(t => [t.code, t])) };
  const actualSchedule = scheduleIsComplete(schedule, league.teams);
  const fixtures = (actualSchedule ? schedule : generateForgeSchedule(league.teams, seed)).map(g => ({ ...g, home: g.home === host.code ? 'FRG' : g.home, away: g.away === host.code ? 'FRG' : g.away }));
  const season = forgeSeason(simLeague, fixtures, seed);
  const forgeRow = season.standings.find(r => r.code === 'FRG');
  const tally = games => games.filter(g => g.home === 'FRG' || g.away === 'FRG').reduce((r, g) => { const won = (g.home === 'FRG' ? g.homePts > g.awayPts : g.awayPts > g.homePts); r[won ? 'wins' : 'losses']++; return r; }, { wins: 0, losses: 0 });
  let poW = 0, poL = 0, playInW = 0, playInL = 0, eliminated = null;
  for (const round of season.bracket?.rounds || []) {
    const pi = tally(round.playIn); playInW += pi.wins; playInL += pi.losses;
    for (const series of round.series) if (series.higher === 'FRG' || series.lower === 'FRG') { const count = tally(series.games); poW += count.wins; poL += count.losses; if (series.winner !== 'FRG') eliminated = series.round; }
  }
  const finals = season.bracket?.finals;
  if (finals && (finals.higher === 'FRG' || finals.lower === 'FRG')) { const count = tally(finals.games); poW += count.wins; poL += count.losses; if (finals.winner !== 'FRG') eliminated = 'the Finals'; }
  const reach = season.bracket?.reach?.FRG;
  if (reach === 'playIn') eliminated = 'the Play-In';
  const trials = [{ wins: forgeRow.wins, champion: season.bracket?.champion === 'FRG', playoffs: Boolean(reach && reach !== 'playIn') }];
  const count = Math.max(1, Math.min(100, Number(repeats) || 12));
  for (let i = 1; i < count; i++) { const trial = forgeSeason(simLeague, fixtures, (seed + i * 104729) >>> 0, false), row = trial.standings.find(r => r.code === 'FRG'); trials.push({ wins: row.wins, champion: trial.bracket?.champion === 'FRG', playoffs: Boolean(trial.bracket?.reach?.FRG && trial.bracket.reach.FRG !== 'playIn') }); }
  const winSamples = trials.map(t => t.wins).sort((a, b) => a - b);
  return { seasonLabel: league.label, teamScore, net: forgeRow.ortg - forgeRow.drtg, expectedNet: forgeTeam.net, profile: forgeTeam, contributions,
    regWins: forgeRow.wins, regLosses: forgeRow.losses, regLoss: forgeRow.losses, poW, poL, playInW, playInL,
    totalWins: forgeRow.wins + poW + playInW, totalLosses: forgeRow.losses + poL + playInL,
    champion: season.bracket?.champion, eliminated, reachedFinals: reach === 'finals' || reach === 'champion',
    perfect: forgeRow.wins === 82 && forgeRow.losses === 0 && poW === 16 && poL === 0 && playInL === 0 && season.bracket?.champion === 'FRG',
    forgeRow, standings: season.standings, roster: drafted, games: season.games, bracket: season.bracket, seed, host: { code: host.code, name: host.name, conference: host.conference },
    scheduleKind: actualSchedule ? 'Published season matchup schedule (scores re-simulated)' : 'Generated 82-game schedule (NBA-style opponent counts, 41 home games)', model: FORGE_SIM_MODEL,
    ensemble: { count: trials.length, meanWins: trials.reduce((s, t) => s + t.wins, 0) / trials.length, lowWins: quantile(winSamples, .1), highWins: quantile(winSamples, .9), championshipRate: trials.filter(t => t.champion).length / trials.length, playoffRate: trials.filter(t => t.playoffs).length / trials.length },
  };
}
