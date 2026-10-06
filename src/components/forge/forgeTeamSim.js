import { SKILLS } from '@/components/forge/bapSkills';
import { forgePlayerScore } from '@/components/forge/forgePool';
import { mulberry32, buildGeneratedSchedule, runRepeat } from '@/lib/season/simEngine';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const ELIM_LABELS = {
  'First round': 'the first round',
  'Conference semifinals': 'the conference semifinals',
  'Conference finals': 'the conference finals',
};

// Build the forged roster as a league team, swap it into the league in place of
// a random host franchise, and simulate the full 82-game season plus playoffs.
// Strength comes from the mean of each donor's 25–99 DJHC skill ratings.
export function simulateForgeSeason({ league, pool, picks, slots, seed }) {
  const rng = mulberry32(seed >>> 0);
  const drafted = slots.map(slot => ({ slot, player: picks[slot.key]?.player })).filter(row => row.player);
  const totalMinutes = drafted.reduce((sum, row) => sum + row.slot.minutes, 0);
  const teamScore = totalMinutes
    ? drafted.reduce((sum, row) => sum + forgePlayerScore(row.player) * row.slot.minutes, 0) / totalMinutes
    : 50;
  const scores = pool.map(player => forgePlayerScore(player)).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)] || 50;
  const avg = key => league.teams.reduce((sum, team) => sum + (team[key] || 0), 0) / (league.teams.length || 1);
  const net = clamp((teamScore - median) * 0.4, -10, 13);
  const host = league.teams[Math.floor(rng() * league.teams.length)];
  const roster = drafted.map(({ slot, player }) => ({
    playerRef: player.playerRef, name: player.name, positions: player.positions || [],
    games: player.games, minutes: slot.minutes,
    pts: player.pts, reb: player.reb, ast: player.ast, stl: player.stl || 0, blk: player.blk || 0,
  }));
  const forgeTeam = {
    code: 'FRG', name: 'Forge Legends', conference: host.conference,
    off: avg('off') + net * 0.55, def: avg('def') - net * 0.45, net, pace: avg('pace'),
    efg: avg('efg') + net * 0.004, ftr: avg('ftr'), orb: avg('orb'),
    drb: clamp(avg('drb') + net * 0.004, 0.6, 0.82), tov: avg('tov'),
    oppEfg: clamp(avg('oppEfg') - net * 0.004, 0.44, 0.62), oppFtr: avg('oppFtr'), oppTov: avg('oppTov'),
    roster,
  };
  const teams = [...league.teams.filter(team => team.code !== host.code), forgeTeam];
  const simLeague = { ...league, teams, byCode: new Map(teams.map(team => [team.code, team])) };
  const season = runRepeat(simLeague, buildGeneratedSchedule(teams, seed), { seed });
  const forgeRow = season.standings.find(row => row.code === 'FRG') || null;
  let poW = 0; let poL = 0; let eliminated = null;
  const tally = games => {
    for (const game of games) {
      const home = game.home === 'FRG';
      const mine = home ? game.homePts : game.awayPts;
      const theirs = home ? game.awayPts : game.homePts;
      if (mine > theirs) poW += 1; else poL += 1;
    }
  };
  for (const round of season.bracket?.rounds || []) {
    for (const series of round.series || []) {
      if (series.higher !== 'FRG' && series.lower !== 'FRG') continue;
      tally(series.games || []);
      if (series.winner !== 'FRG') eliminated = ELIM_LABELS[series.round] || series.round;
    }
  }
  if (season.bracket?.finals && (season.bracket.finals.higher === 'FRG' || season.bracket.finals.lower === 'FRG')) {
    tally(season.bracket.finals.games || []);
    if (season.bracket.finals.winner !== 'FRG') eliminated = 'the Finals';
  }
  const reach = season.bracket?.reach?.FRG;
  if (!eliminated && reach === 'playIn') eliminated = 'the Play-In';
  const regWins = forgeRow?.wins ?? 0;
  const regLosses = forgeRow?.losses ?? 0;
  const champion = season.bracket?.champion || null;
  return {
    seasonLabel: league.label, teamScore, net,
    regWins, regLosses, poW, poL,
    totalWins: regWins + poW, totalLosses: regLosses + poL,
    champion, eliminated, reachedFinals: reach === 'finals' || reach === 'champion',
    perfect: regLosses === 0 && poL === 0 && champion === 'FRG',
    forgeRow, standings: season.standings, roster: drafted, seed,
  };
}