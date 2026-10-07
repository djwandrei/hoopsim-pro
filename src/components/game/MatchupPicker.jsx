import React from 'react';
import { ArrowLeftRight, Dices } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';

const fieldCls = 'min-h-10 w-full rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 text-xs text-[var(--myna-text)]';
const sideChip = (team, side) => (
  <div data-team-side={side} className="matchup-side-surface flex items-center gap-2 rounded-lg border px-3 py-2">
    <TeamMark code={team.code} name={team.name} className="h-12 w-12" />
    <div className="min-w-0">
      <p className="matchup-side-text truncate text-xs font-semibold">{team.name}</p>
      <p className="myna-mono myna-muted text-[10px]">NET {team.net > 0 ? '+' : ''}{team.net.toFixed(1)}</p>
    </div>
  </div>
);

export default function MatchupPicker({ league, a, b, onA, onB, onSimGame, hasGame, blocked = false }) {
  const swap = () => { onA(b); onB(a); };
  const randomize = () => {
    const first = Math.floor(Math.random() * league.teams.length);
    let second = Math.floor(Math.random() * (league.teams.length - 1));
    if (second >= first) second += 1;
    onA(league.teams[first].code);
    onB(league.teams[second].code);
  };
  const teamA = league.byCode.get(a) || league.teams[0];
  const teamB = league.byCode.get(b) || league.teams[1];
  return (
    <section className="myna-panel p-4" aria-label="Matchup picker">
      <p className="bcast-kicker">Matchup</p>
      <h2 className="broadcast-gradient-text myna-display mt-1 text-2xl">PICK YOUR BOARD</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label data-team-side="home" className="block">
          <span className="matchup-side-text mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">HOME (TEAM A)</span>
          <select className={`${fieldCls} matchup-side-surface`} value={a} onChange={event => onA(event.target.value)}>{league.teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}</select>
        </label>
        <label data-team-side="away" className="block">
          <span className="matchup-side-text mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">AWAY (TEAM B)</span>
          <select className={`${fieldCls} matchup-side-surface`} value={b} onChange={event => onB(event.target.value)}>{league.teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}</select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={swap} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--myna-border)] text-[11px] font-semibold tracking-[0.12em] text-[var(--myna-accent)] transition-colors hover:bg-[var(--myna-raised)]"><ArrowLeftRight className="h-3.5 w-3.5" />SWAP SIDES</button>
        <button type="button" onClick={randomize} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--myna-border)] text-[11px] font-semibold tracking-[0.12em] text-[var(--myna-accent)] transition-colors hover:bg-[var(--myna-raised)]"><Dices className="h-3.5 w-3.5" />RANDOM PAIRING</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sideChip(teamA, 'home')}
        {sideChip(teamB, 'away')}
        <p className="col-span-2 text-center text-[10px] myna-muted">{teamA.code} hosts · swing the sides with swap or a random pairing</p>
      </div>
      {onSimGame && (
        <button type="button" onClick={onSimGame} disabled={blocked} className="myna-accent mt-4 flex w-full min-h-12 items-center justify-center gap-2 rounded-lg text-[12px] font-semibold tracking-[0.18em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {blocked ? 'SIM PAUSED — V4 GATE' : hasGame ? 'SIM NEW GAME' : 'SIM GAME'}
        </button>
      )}
    </section>
  );
}