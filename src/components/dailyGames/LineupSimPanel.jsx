import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { simSingleGame } from '@/lib/season/simEngine';
import { hasLineupStats, lineupTeam } from '@/lib/dailyGames/lineupSimModel';
import LineupCourt from '@/components/dailyGames/LineupCourt';
import LineupSimResults from '@/components/dailyGames/LineupSimResults';

export { lineupTeam } from '@/lib/dailyGames/lineupSimModel';

export default function LineupSimPanel({ league, squads = [], lineupLabel = 'Your lineup', courtPalette = null, scoreboardOverlay = false }) {
  const [squadId, setSquadId] = useState('');
  const [opponentCode, setOpponentCode] = useState('');
  // Every run draws a fresh seed, so no two simulations of the same matchup
  // replay identical results.
  const [result, setResult] = useState(null);
  const squadsAvailable = Boolean(league?.teams?.length);
  const squad = squads.find(entry => entry.id === squadId) || squads[0] || null;
  const opponent = squadsAvailable ? (league.teams.find(team => team.code === opponentCode) || league.teams[0]) : null;
  const ready = Boolean(squad?.players?.length === 5 && squad.players.every(hasLineupStats)
    && opponent?.roster?.length >= 5 && opponent.roster.slice(0, 5).every(hasLineupStats));
  const lineupKey = JSON.stringify(squad?.players || []);
  useEffect(() => { setResult(null); }, [league, squad?.id, opponent?.code, lineupKey]);

  // Every run draws a fresh seed, so "Tip off" and "Re-simulate" both produce
  // a brand-new draw — no separate new-draw button needed.
  const run = () => {
    if (!ready) return;
    const nextSeed = 1 + Math.floor(Math.random() * 999999);
    const home = lineupTeam(league, squad.players, squad.code || 'FIVE', squad.label || lineupLabel);
    // The opponent is modeled as just its starting five — the same five-man
    // model, carrying the real team's pace, defense, and four-factor rates.
    const away = lineupTeam(league, opponent.roster.slice(0, 5), opponent.code, opponent.name, {
      pace: opponent.pace,
      def: opponent.def,
      efg: opponent.efg, ftr: opponent.ftr, orb: opponent.orb, drb: opponent.drb, tov: opponent.tov,
      oppEfg: opponent.oppEfg, oppFtr: opponent.oppFtr, oppTov: opponent.oppTov,
    });
    setResult({
      ...simSingleGame(league, home, away, { seed: nextSeed, neutral: true, log: true }),
      replaySeed: nextSeed, homeTeam: home, awayTeam: away,
      lineup: squad.players, lineupLabel: squad.label || lineupLabel,
    });
  };

  return (
    <section className="dg-sim" aria-label="Simulate a game with the lineup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="bcast-kicker">Simulation step</span>
          <h3 className="mt-2 font-display text-2xl tracking-wide">Play the game with your five</h3>
        </div>
        <p className="dg-sim__note max-w-md">The final score is built from your five players' efficiency — each plays all 48 regulation minutes plus any overtime, with per-game scoring plus rebound and assist credit — against the opponent's starting five, modeled the same way. Every simulated line is a model estimate, never observed performance.</p>
      </div>
      <div className="dg-sim__controls mt-4">
        {squads.length > 1 && (
          <label className="dg-sim__field">
            Which five
            <select value={squadId || squads[0]?.id || ''} onChange={event => { setSquadId(event.target.value); setResult(null); }}>
              {squads.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
        )}
        <label className="dg-sim__field">
          Opponent
          <select value={opponent?.code || ''} onChange={event => { setOpponentCode(event.target.value); setResult(null); }} disabled={!squadsAvailable}>
            {squadsAvailable && league.teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}
          </select>
        </label>
        <button type="button" className="dg-sim__go" disabled={!ready} onClick={() => run()}>
          <Play className="h-3.5 w-3.5" /> {result ? 'Re-simulate' : 'Tip off'}
        </button>
      </div>
      {!squadsAvailable && <p className="dg-sim__note mt-3">League ratings are still loading — the sim unlocks as soon as the season source is ready.</p>}
      {squadsAvailable && !ready && <p className="dg-sim__note mt-3">The sim needs complete season stats for all five players on both sides before tip-off.</p>}
      {result ? <LineupSimResults key={result.replaySeed} result={result} courtPalette={courtPalette} scoreboardOverlay={scoreboardOverlay} />
        : squad?.players?.length === 5 && <div className="mt-4"><LineupCourt lineup={squad.players} slim palette={courtPalette} /></div>}
    </section>
  );
}