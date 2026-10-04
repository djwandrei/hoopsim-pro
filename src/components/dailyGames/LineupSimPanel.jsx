import React, { useEffect, useRef, useState } from 'react';
import { Play, RefreshCcw } from 'lucide-react';
import { simSingleGame, TEAM_NAMES } from '@/lib/season/simEngine';
import { teamAsset } from '@/components/studio/teamAssets';
import LineupCourt from '@/components/dailyGames/LineupCourt';
import GameSummary from '@/components/dailyGames/GameSummary';
import LiveScoreboard from '@/components/dailyGames/LiveScoreboard';

// Model a five-man squad as a team profile for the sim engine. The five are
// the entire lineup — 48 minutes apiece, no bench players. Offense is modeled
// from the five players' observed per-game rates; defense is held at the
// league average because the public board carries no player defensive rates,
// unless the caller supplies real team ratings (the opponent's starting five).
export function lineupTeam(league, players, code, name, overrides = {}) {
  const avg = key => league.teams.reduce((sum, team) => sum + team[key], 0) / (league.teams.length || 1);
  const roster = players.map(player => ({
    playerRef: player.playerRef,
    name: player.displayName || player.name,
    positions: Array.isArray(player.positions) ? player.positions : [],
    minutes: 48,
    pts: player.publicStats?.points ?? 0,
    reb: player.publicStats?.rebounds ?? 0,
    ast: player.publicStats?.assists ?? 0,
    stl: 0,
    blk: 0,
  }));
  const pace = overrides.pace ?? avg('pace');
  // Efficiency credit: rebounding and playmaking convert into extra
  // possessions and are folded into the projected scoring.
  const possessionValue = avg('off') / 112;
  const efficiencyBonus = roster.reduce((sum, player) => sum + 0.12 * player.reb + 0.18 * player.ast, 0) * possessionValue;
  const teamPpg = roster.reduce((sum, player) => sum + player.pts, 0) + efficiencyBonus;
  const off = Math.round((teamPpg * 100) / pace);
  const def = Math.round(overrides.def ?? avg('def'));
  return {
    code,
    name,
    conference: 'EAST',
    off,
    def,
    net: off - def,
    pace,
    ppg: teamPpg,
    papg: null,
    efg: overrides.efg ?? avg('efg'),
    ftr: overrides.ftr ?? avg('ftr'),
    orb: overrides.orb ?? avg('orb'),
    drb: overrides.drb ?? avg('drb'),
    tov: overrides.tov ?? avg('tov'),
    oppEfg: overrides.oppEfg ?? avg('oppEfg'),
    oppFtr: overrides.oppFtr ?? avg('oppFtr'),
    oppTov: overrides.oppTov ?? avg('oppTov'),
    roster,
  };
}

const BOX_COLUMNS = [['MIN', 'min'], ['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast'], ['STL', 'stl'], ['BLK', 'blk']];

function BoxTable({ title, box, teamStats, teamPoints }) {
  return (
    <div>
      <p className="dg-sim__meta mb-1">{title}</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {BOX_COLUMNS.map(([label]) => <th key={label}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {box.lines.map(line => (
              <tr key={line.name}>
                <td className="truncate">{line.name}</td>
                {BOX_COLUMNS.map(([label, key]) => <td key={key}>{line[key]}</td>)}
              </tr>
            ))}
            {teamStats && (
              <tr>
                <td className="font-semibold">Team</td>
                <td>240</td>
                <td>{teamPoints ?? '—'}</td>
                <td>{teamStats.reb ?? '—'}</td>
                <td>{teamStats.ast ?? '—'}</td>
                <td>{teamStats.stl ?? '—'}</td>
                <td>{teamStats.blk ?? '—'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LineupSimPanel({ league, squads = [], lineupLabel = 'Your lineup', courtPalette = null, scoreboardOverlay = false }) {
  const [squadId, setSquadId] = useState('');
  const [opponentCode, setOpponentCode] = useState('');
  // Every run draws a fresh seed, so no two simulations of the same matchup
  // replay identical results.
  const freshSeed = () => 1 + Math.floor(Math.random() * 999999);
  const [seed, setSeed] = useState(freshSeed);
  const [result, setResult] = useState(null);
  const [playbackDone, setPlaybackDone] = useState(false);
  const summaryRef = useRef(null);
  const squadsAvailable = Boolean(league?.teams?.length);
  const squad = squads.find(entry => entry.id === squadId) || squads[0] || null;
  const opponent = squadsAvailable ? (league.teams.find(team => team.code === opponentCode) || league.teams[0]) : null;
  const ready = Boolean(squad?.players?.length === 5 && opponent);
  const oppLogo = opponent ? teamAsset(opponent.code) : null;

  const run = (nextSeed = seed) => {
    if (!ready) return;
    const home = lineupTeam(league, squad.players, squad.code || 'FIVE', squad.label || lineupLabel);
    // The opponent is modeled as just its starting five — the same five-man
    // model, carrying the real team's pace, defense, and four-factor rates.
    const away = lineupTeam(league, opponent.roster.slice(0, 5), opponent.code, opponent.name, {
      pace: opponent.pace,
      def: opponent.def,
      efg: opponent.efg, ftr: opponent.ftr, orb: opponent.orb, drb: opponent.drb, tov: opponent.tov,
      oppEfg: opponent.oppEfg, oppFtr: opponent.oppFtr, oppTov: opponent.oppTov,
    });
    setResult(simSingleGame(league, home, away, { seed: nextSeed, neutral: true, log: true }));
    setPlaybackDone(false);
  };
  const rerun = () => {
    const next = freshSeed();
    setSeed(next);
    run(next);
  };
  useEffect(() => {
    if (result && summaryRef.current) summaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  return (
    <section className="dg-sim" aria-label="Simulate a game with the lineup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="bcast-kicker">Simulation step</span>
          <h3 className="mt-2 font-display text-2xl tracking-wide">Play the game with your five</h3>
        </div>
        <p className="dg-sim__note max-w-md">The final score is built from your five players' efficiency — each plays all 48 minutes, per-game scoring plus rebound and assist credit — against the opponent's starting five, modeled the same way. Every simulated line is a model estimate, never observed performance.</p>
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
        {result && (
          <button type="button" className="dg-sim__again" onClick={rerun}>
            <RefreshCcw className="h-3.5 w-3.5" /> New draw
          </button>
        )}
      </div>
      {!squadsAvailable && <p className="dg-sim__note mt-3">League ratings are still loading — the sim unlocks as soon as the season source is ready.</p>}
      {squad?.players?.length === 5 && (scoreboardOverlay ? (
        <div className="dg-court-stage mt-4">
          {result && (
            <div className="dg-court-jumbo">
              <LiveScoreboard
                homeCode={squad.code}
                awayCode={opponent.code}
                homeName={TEAM_NAMES[squad.code] || squad.label || lineupLabel}
                awayName={opponent.name}
                result={result}
                onComplete={() => setPlaybackDone(true)} />
            </div>
          )}
          <LineupCourt lineup={squad.players} slim palette={courtPalette} />
        </div>
      ) : <div className="mt-4"><LineupCourt lineup={squad.players} slim palette={courtPalette} /></div>)}
      {result && (
        <div className="dg-sim__body mt-4 space-y-4">
          {!scoreboardOverlay && (
            <div ref={summaryRef}>
              <LiveScoreboard
                homeCode={squad.code}
                awayCode={opponent.code}
                homeName={TEAM_NAMES[squad.code] || squad.label || lineupLabel}
                awayName={opponent.name}
                result={result}
                onComplete={() => setPlaybackDone(true)} />
            </div>
          )}
          {playbackDone && <div className="dg-flow-in space-y-4" ref={scoreboardOverlay ? summaryRef : undefined}>
            <GameSummary label={squad.label || lineupLabel} opponent={opponent} opponentLogo={oppLogo} result={result} />
            <BoxTable title={`${squad.label || lineupLabel} — box score`} box={result.boxHome} teamStats={result.statsHome} teamPoints={result.homePts} />
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-gold">{opponent.name} box score</summary>
              <div className="mt-2"><BoxTable title={opponent.name} box={result.boxAway} teamStats={result.statsAway} teamPoints={result.awayPts} /></div>
            </details>
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-gold">Play-by-play</summary>
              <div className="dg-sim__feed mt-2">
                {result.pbp.map((event, index) => (
                  <div key={index} className="dg-sim__feed-event">
                    <span className="dg-sim__feed-clock">{event.q} {event.clock}</span>
                    <span className="min-w-0 flex-1">{event.text}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>}
        </div>
      )}
    </section>
  );
}