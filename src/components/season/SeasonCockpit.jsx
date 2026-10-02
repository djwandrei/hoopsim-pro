import React from 'react';
import MetricTile from '@/components/studio/MetricTile';
import TeamMark from '@/components/studio/TeamMark';

export default function SeasonCockpit({ source, league }) {
  const schedule = source.schedule || [];
  const observed = schedule.filter(game => game.actual).length;
  const coverage = schedule.length ? Math.round(observed / schedule.length * 100) : 0;
  const east = league.teams.filter(team => team.conference === 'EAST').length;
  const board = [...league.teams].sort((a, b) => b.net - a.net).slice(0, 8);
  const maxNet = Math.max(...league.teams.map(team => Math.abs(team.net)), 0.1);
  return <section aria-label="Season cockpit" className="space-y-4">
    <div className="court-panel p-4">
      <p className="court-kicker">Season cockpit</p>
      <h2 className="mt-1 font-display text-2xl">{league.label} · OBSERVED PACKAGE</h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MetricTile label="Teams" value={league.teams.length} detail={`${east} East · ${league.teams.length - east} West`} />
        <MetricTile label="Scheduled games" value={schedule.length.toLocaleString()} detail="Source replay schedule" tone="royal" />
        <MetricTile label="Observed results" value={observed.toLocaleString()} detail="Actuals carried in the package" tone="positive" />
        <MetricTile label="Actuals coverage" value={`${coverage}%`} detail="Share of schedule with real scores" />
      </div>
    </div>
    <div className="court-panel p-4">
      <p className="court-kicker">Observed efficiency board</p>
      <h3 className="mt-1 font-display text-xl">TOP NET-RATING TEAMS</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Published team metrics from the package — not simulated standings.</p>
      <ol className="mt-3 space-y-1.5">{board.map((team, index) => <li key={team.code} className="flex items-center gap-2 rounded-lg border border-border/25 bg-canvas/30 px-2.5 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
        <TeamMark code={team.code} name={team.name} className="h-8 w-8" />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{team.name}</span><span className="block font-mono text-[10px] text-muted-foreground">OFF {team.off.toFixed(1)} · DEF {team.def.toFixed(1)} · PACE {team.pace.toFixed(1)}</span></span>
        <span className="flex w-16 shrink-0 items-center justify-end gap-1.5"><span className="h-1.5 rounded-full bg-gold/70" style={{ width: `${Math.max(4, Math.abs(team.net) / maxNet * 44)}px` }} /><span className="font-mono text-xs text-gold">{team.net > 0 ? '+' : ''}{team.net.toFixed(1)}</span></span>
      </li>)}</ol>
    </div>
    <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">The original Season Lab below owns the replay: schedule simulation, postseason and franchise controls. This rail stays observed-only.</p>
  </section>;
}