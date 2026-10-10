import { seededRandom } from './forgeSimulation.js';
export function chooseForgeOffer({ teams, players, sampling = 'player', activeTeam, sameTeam = false, seed, step }) {
  const eligible = players.filter(p => teams.some(t => t.code === p.teamCode) && (!sameTeam || p.teamCode === activeTeam));
  if (!eligible.length) return null;
  const rng = seededRandom((seed + Math.imul(step + 1, 104729)) >>> 0);
  const codes = [...new Set(eligible.map(p => p.teamCode))];
  const code = sameTeam ? activeTeam : sampling === 'team' ? codes[Math.floor(rng() * codes.length)] : null;
  const roster = code ? eligible.filter(p => p.teamCode === code) : eligible, player = roster[Math.floor(rng() * roster.length)];
  return { player, team: teams.find(t => t.code === player.teamCode), probability: code && !sameTeam ? 1 / (codes.length * roster.length) : 1 / roster.length };
}
