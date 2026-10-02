import React from 'react';
import TeamMark from '@/components/studio/TeamMark';

function OddsBar({ label, value, color }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="myna-muted">{label}</span>
        <span className="myna-mono">{Math.round((value || 0) * 100)}%</span>
      </div>
      <div className="myna-bar mt-1"><span style={{ width: `${Math.min(100, (value || 0) * 100)}%`, background: color }} /></div>
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className="bg-[var(--myna-surface)] p-3">
      <div className="myna-muted text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</div>
      <div className={`myna-mono mt-1 text-lg ${tone || ''}`}>{value}</div>
    </div>
  );
}

// Team-colored hero banner: record, conference rank, ratings and replay odds.
export default function LeagueHero({ team, simRow, actualRecord, conferenceRank }) {
  if (!team) return null;
  const wins = simRow ? Math.round(simRow.wins) : actualRecord?.w ?? 0;
  const losses = simRow ? 82 - wins : actualRecord?.l ?? 0;
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
    <section className="myna-panel myna-hero overflow-hidden" aria-label={`${team.name} hub`}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-4">
          <TeamMark code={team.code} name={team.name} className="h-20 w-20 rounded-2xl border border-[var(--myna-border)] bg-[var(--myna-raised)]" />
          <div className="min-w-0">
            <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">{team.conference} CONFERENCE · RANK {conferenceRank || '—'}</p>
            <h3 className="myna-display mt-1 text-3xl sm:text-4xl">{team.name.toUpperCase()}</h3>
            <p className="myna-muted mt-1 text-[11px]">{simRow ? 'Projected record · median of replays' : 'Observed record from the published schedule'}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="myna-mono text-4xl">{wins}<span className="myna-muted text-xl">–{losses}</span></div>
          <div className="myna-muted mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]">Record</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-[var(--myna-border)] bg-[var(--myna-border)] sm:grid-cols-4">
        {tiles.map(([label, value]) => <Tile key={label} label={label} value={value} />)}
      </div>
      {simRow && (
        <div className="grid gap-4 border-t border-[var(--myna-border)] p-5 sm:grid-cols-3">
          <OddsBar label="Playoff odds" value={simRow.playoff} color="var(--myna-accent)" />
          <OddsBar label="Conference finals" value={simRow.confFinals} color="var(--myna-hi)" />
          <OddsBar label="Title odds" value={simRow.title} color="var(--myna-trim)" />
        </div>
      )}
      {actualRecord && (
        <div className="border-t border-[var(--myna-border)] px-5 py-3 text-[11px] myna-muted">
          Actual season: <span className="myna-mono">{actualRecord.w}–{actualRecord.l}</span> · {actualRecord.gp} games played.
        </div>
      )}
    </section>
  );
}