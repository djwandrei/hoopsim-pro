import React from 'react';
import { Shield, Star, Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';

function OddsBar({ label, value, color, icon: Icon }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="myna-muted flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em]">{Icon && <Icon className="h-3 w-3" />}{label}</span>
        <span className="myna-mono font-bold">{Math.round((value || 0) * 100)}%</span>
      </div>
      <div className="myna-bar mt-1.5"><span style={{ width: `${Math.min(100, (value || 0) * 100)}%`, background: color, boxShadow: `0 0 10px ${color}` }} /></div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--myna-border)] bg-[var(--myna-surface)] p-3.5" style={{ boxShadow: 'inset 0 2px 0 var(--myna-primary)' }}>
      <div className="myna-muted text-[9px] font-bold uppercase tracking-[0.22em]">{label}</div>
      <div className="myna-mono mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

// Team-colored hero banner: record, conference rank, ratings and replay odds.
export default function LeagueHero({ team, simRow, actualRecord, conferenceRank }) {
  if (!team) return null;
  const wins = simRow ? Math.round(simRow.wins) : actualRecord?.w ?? 0;
  const losses = simRow ? 82 - wins : actualRecord?.l ?? 0;
  const winPct = wins + losses > 0 ? (wins / (wins + losses)).toFixed(3).slice(1) : '—';
  const tiles = simRow
    ? [
      ['ORTG', simRow.ortg.toFixed(1)],
      ['DRTG', simRow.drtg.toFixed(1)],
      ['NET', `${simRow.ortg - simRow.drtg > 0 ? '+' : ''}${(simRow.ortg - simRow.drtg).toFixed(1)}`],
      ['PACE', simRow.pace.toFixed(1)],
    ]
    : [
      ['OFF', team.off.toFixed(1)],
      ['DEF', team.def.toFixed(1)],
      ['NET', `${team.net > 0 ? '+' : ''}${team.net.toFixed(1)}`],
      ['PACE', team.pace.toFixed(1)],
    ];
  return (
    <section className="myna-panel myna-hero relative overflow-hidden" aria-label={`${team.name} hub`}>
      <span aria-hidden className="pointer-events-none absolute -bottom-6 right-2 select-none font-display leading-none opacity-[0.07]" style={{ fontSize: 'clamp(5rem, 12vw, 9rem)' }}>{team.code}</span>
      <div className="relative flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <TeamMark code={team.code} name={team.name} className="h-20 w-20 shrink-0" bare />
          <div className="min-w-0">
            <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">{team.conference} Conference · Seed {conferenceRank || '—'}</p>
            <h3 className="myna-display mt-1 text-3xl sm:text-4xl">{team.name.toUpperCase()}</h3>
            <p className="myna-muted mt-1 text-[11px]">{simRow ? 'Projected record · median of replays' : 'Observed record from the published schedule'}</p>
          </div>
        </div>
        <div className="relative text-right">
          <div className="myna-display flex items-baseline justify-end gap-1 text-6xl leading-none sm:text-7xl">
            <span>{wins}</span>
            <span className="myna-muted text-4xl">–</span>
            <span className="myna-muted">{losses}</span>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="myna-mono rounded-md border border-[var(--myna-border)] px-2 py-0.5 text-[10px] font-bold">{winPct}</span>
            <span className="myna-muted flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--myna-accent)', boxShadow: '0 0 8px var(--myna-accent)' }} />
              Record
            </span>
          </div>
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-px border-t border-[var(--myna-border)] bg-[var(--myna-border)] sm:grid-cols-4">
        {tiles.map(([label, value]) => <Tile key={label} label={label} value={value} />)}
      </div>
      {simRow && (
        <div className="relative grid gap-5 border-t border-[var(--myna-border)] p-5 sm:grid-cols-3">
          <OddsBar label="Playoff odds" value={simRow.playoff} color="var(--myna-accent)" icon={Shield} />
          <OddsBar label="Conference finals" value={simRow.confFinals} color="var(--myna-hi)" icon={Star} />
          <OddsBar label="Title odds" value={simRow.title} color="var(--myna-trim)" icon={Trophy} />
        </div>
      )}
      {actualRecord && simRow && (
        <div className="relative border-t border-[var(--myna-border)] px-5 py-3 text-[11px] myna-muted">
          Actual season: <span className="myna-mono font-semibold">{actualRecord.w}–{actualRecord.l}</span> · {actualRecord.gp} games played.
        </div>
      )}
    </section>
  );
}