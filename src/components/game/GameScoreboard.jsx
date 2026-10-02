import React from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

function Half({ team, pts, won, label }) {
  const palette = paletteForTeam(team.code);
  return (
    <div className="p-5 text-center" style={{ background: won ? `linear-gradient(160deg, ${palette.primary}55, transparent 80%)` : 'transparent' }}>
      <TeamMark code={team.code} name={team.name} className="mx-auto h-14 w-14 rounded-2xl border border-[var(--myna-border)] bg-[var(--myna-raised)]" />
      <p className="myna-mono mt-2 text-5xl">{pts}</p>
      <p className="myna-display mt-1 text-lg">{team.code}<span className="myna-muted text-[10px] tracking-[0.2em]"> · {label}</span></p>
    </div>
  );
}

export default function GameScoreboard({ league, game }) {
  const home = league.byCode.get(game.home);
  const away = league.byCode.get(game.away);
  if (!home || !away) return null;
  const homeWon = game.homePts > game.awayPts;
  return (
    <section className="myna-panel overflow-hidden" aria-label="Game scoreboard">
      <div className="grid grid-cols-2 border-b border-[var(--myna-border)]">
        <Half team={away} pts={game.awayPts} won={!homeWon} label="AWAY" />
        <Half team={home} pts={game.homePts} won={homeWon} label="HOME" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 p-3 text-[11px] myna-muted">
        <span className="font-semibold tracking-[0.15em]">{game.ot ? (game.ot === 1 ? 'OT' : `${game.ot}OT`) : 'REGULATION'}</span>
        <span>POSS {Math.round(game.poss)}</span>
        <span className="myna-mono">ORTG {away.code} {game.ortgA.toFixed(1)} · {home.code} {game.ortgH.toFixed(1)}</span>
      </div>
    </section>
  );
}