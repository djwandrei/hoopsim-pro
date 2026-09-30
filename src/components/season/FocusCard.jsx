import React from 'react';
import TeamMark from '@/components/studio/TeamMark';

const pct = value => `${Math.round((value || 0) * 100)}%`;
const fmt1 = value => (Number.isFinite(value) ? value.toFixed(1) : '—');

function OddsBar({ label, value, tone = 'bg-gold' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{pct(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.min(100, (value || 0) * 100)}%` }} />
      </div>
    </div>
  );
}

function RatingRow({ label, value, leagueAvg, invert = false }) {
  const diff = value - leagueAvg;
  const good = invert ? diff < 0 : diff > 0;
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2 font-mono text-sm text-foreground">
        {fmt1(value)}
        <span className={`text-xs ${good ? 'text-positive' : 'text-trim'}`}>
          {diff > 0 ? '+' : ''}{fmt1(diff)} vs lg
        </span>
      </span>
    </div>
  );
}

function FactorCell({ label, value }) {
  return (
    <div className="rounded-lg bg-raised/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm text-foreground">{Number.isFinite(value) ? pct(value) : '—'}</div>
    </div>
  );
}

export default function FocusCard({ team, row, leagueAvg, actualWins }) {
  if (!team || !row) return null;
  const wins = Math.round(row.wins);
  const net = row.ortg - row.drtg;
  return (
    <section className="court-panel overflow-hidden">
      <div className="border-b border-border/50 bg-raised/40 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4"><TeamMark code={team.code} className="h-16 w-16" /><div className="min-w-0"><span className="court-kicker text-xs">FOCUS TEAM · {team.conference}</span><h3 className="court-display mt-1 text-3xl text-foreground">{team.name.toUpperCase()}</h3></div></div>
          <div className="text-right">
            <div className="font-mono text-3xl text-gold">{wins}<span className="text-lg text-muted-foreground">–{82 - wins}</span></div>
            <div className="text-xs text-muted-foreground">simulated record (median of replays)</div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <OddsBar label="Playoff odds" value={row.playoff} />
          <OddsBar label="Conference finals" value={row.confFinals} tone="bg-royal" />
          <OddsBar label="Title odds" value={row.title} tone="bg-trim" />
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-3">
        <div>
          <h4 className="court-display mb-1 text-lg text-gold">SIMULATED RATINGS</h4>
          <RatingRow label="Offensive rating" value={row.ortg} leagueAvg={leagueAvg.off} />
          <RatingRow label="Defensive rating" value={row.drtg} leagueAvg={leagueAvg.def} invert />
          <RatingRow label="Net rating" value={net} leagueAvg={leagueAvg.off - leagueAvg.def} />
          <RatingRow label="Pace" value={row.pace} leagueAvg={leagueAvg.pace} />
        </div>
        <div>
          <h4 className="court-display mb-1 text-lg text-gold">OFFENSIVE FOUR FACTORS</h4>
          <div className="grid grid-cols-2 gap-2">
            <FactorCell label="eFG%" value={team.efg} />
            <FactorCell label="FT attempt rate" value={team.ftr} />
            <FactorCell label="Off. rebound %" value={team.orb} />
            <FactorCell label="Turnover %" value={team.tov} />
          </div>
        </div>
        <div>
          <h4 className="court-display mb-1 text-lg text-gold">DEFENSIVE FOUR FACTORS</h4>
          <div className="grid grid-cols-2 gap-2">
            <FactorCell label="Opp eFG%" value={team.oppEfg} />
            <FactorCell label="Opp FT rate" value={team.oppFtr} />
            <FactorCell label="Def. rebound %" value={team.drb} />
            <FactorCell label="Opp turnover %" value={team.oppTov} />
          </div>
        </div>
      </div>

      {Number.isFinite(actualWins) && (
        <div className="border-t border-border/50 px-5 py-3 text-xs text-muted-foreground">
          Actual {team.name} season: <span className="font-mono text-foreground">{actualWins} wins</span> · compare the simulated median against the observed record.
        </div>
      )}
    </section>
  );
}