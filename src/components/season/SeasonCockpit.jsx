import React, { useState } from 'react';
import MetricTile from '@/components/studio/MetricTile';
import TeamMark from '@/components/studio/TeamMark';
import LeagueScatter from '@/components/season/LeagueScatter';
import SeedPicture from '@/components/season/SeedPicture';

export default function SeasonCockpit({ source, league }) {
  const schedule = source.schedule || [];
  const observed = schedule.filter((game) => game.actual).length;
  const coverage = schedule.length ? Math.round(observed / schedule.length * 100) : 0;
  const eastTeams = league.teams.filter((team) => team.conference === 'EAST');
  const westTeams = league.teams.filter((team) => team.conference === 'WEST');
  const [boardSort, setBoardSort] = useState('net');
  const SORTS = [['net', 'NET'], ['off', 'OFF'], ['def', 'DEF'], ['pace', 'PACE']];
  const board = [...league.teams].sort((a, b) => boardSort === 'def' ? a.def - b.def : b[boardSort] - a[boardSort]).slice(0, 8);
  const maxBoard = Math.max(...league.teams.map((team) => Math.abs(team[boardSort])), 0.1);
  const avg = (list, key) => list.reduce((sum, team) => sum + team[key], 0) / (list.length || 1);
  const signed = (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  return <section aria-label="Season cockpit" className="space-y-4">
    












    
    <div className="court-panel p-4">
      <p className="court-kicker">Observed efficiency board</p>
      <h3 className="mt-1 font-display text-xl">TOP TEAMS BY RATING</h3>
      <nav aria-label="Board sorting" className="mt-3 flex gap-1 rounded-lg bg-canvas/40 p-1">{SORTS.map(([key, label]) => <button key={key} type="button" aria-pressed={boardSort === key} onClick={() => setBoardSort(key)} className={boardSort === key ? 'min-h-9 flex-1 rounded-md bg-gold/10 px-2 text-[11px] font-semibold text-gold' : 'min-h-9 flex-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-raised'}>{label}</button>)}</nav>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Published team metrics from the package — not simulated standings.{boardSort === 'def' ? ' Lower defensive rating is better.' : ''}</p>
      <ol className="mt-3 space-y-1.5">{board.map((team, index) => <li key={team.code} className="flex items-center gap-2 rounded-lg border border-border/25 bg-canvas/30 px-2.5 py-2 transition-colors hover:border-gold/40">
        <span className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
        <TeamMark code={team.code} name={team.name} className="h-8 w-8" />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{team.name}</span><span className="block font-mono text-[10px] text-muted-foreground">OFF {team.off.toFixed(1)} · DEF {team.def.toFixed(1)} · PACE {team.pace.toFixed(1)}</span></span>
        <span className="flex w-16 shrink-0 items-center justify-end gap-1.5"><span className="h-1.5 rounded-full bg-gold/70" style={{ width: `${Math.max(4, Math.abs(team[boardSort]) / maxBoard * 44)}px` }} /><span className="font-mono text-xs text-gold">{boardSort === 'net' ? signed(team.net) : team[boardSort].toFixed(1)}</span></span>
      </li>)}</ol>
    </div>
    <LeagueScatter league={league} />
    <SeedPicture league={league} />
    <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">The original Season Lab below owns the replay: schedule simulation, postseason and franchise controls. This rail stays observed-only.</p>
  </section>;
}