import React from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const pct = value => `${Math.round((value || 0) * 100)}%`;
const fmt1 = value => (Number.isFinite(value) ? value.toFixed(1) : '—');

function OddsBar({ label, value, color }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="myna-muted font-semibold uppercase tracking-[0.14em]">{label}</span>
        <span className="myna-mono font-bold">{pct(value)}</span>
      </div>
      <div className="myna-bar mt-1.5"><span style={{ width: `${Math.min(100, (value || 0) * 100)}%`, background: color, boxShadow: `0 0 10px ${color}` }} /></div>
    </div>
  );
}

function RatingRow({ label, value, leagueAvg, invert = false }) {
  const diff = value - leagueAvg;
  const good = invert ? diff < 0 : diff > 0;
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--myna-border)] py-1.5 last:border-0">
      <span className="text-xs myna-muted">{label}</span>
      <span className="myna-mono flex items-baseline gap-2 text-sm">
        {fmt1(value)}
        <span className="text-xs font-semibold" style={{ color: good ? 'var(--myna-accent)' : 'var(--myna-trim)' }}>
          {diff > 0 ? '+' : ''}{fmt1(diff)} vs lg
        </span>
      </span>
    </div>
  );
}

function FactorCell({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 py-2">
      <div className="text-[10px] myna-muted">{label}</div>
      <div className="myna-mono text-sm font-semibold">{Number.isFinite(value) ? pct(value) : '—'}</div>
    </div>
  );
}

// Team page profile: projected record, odds bars, ratings and four factors — themed by the team's palette.
export default function FocusCard({ team, row, leagueAvg, actualWins }) {
  if (!team || !row) return null;
  const palette = paletteForTeam(team.code);
  const wins = Math.round(row.wins);
  const net = row.ortg - row.drtg;
  return (
    <section className="myna-panel relative overflow-hidden" aria-label={`${team.name} projection`}>
      <span aria-hidden className="pointer-events-none absolute -bottom-6 right-2 select-none font-display leading-none opacity-[0.07]" style={{ fontSize: 'clamp(4.5rem, 10vw, 8rem)' }}>{team.code}</span>
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ background: `linear-gradient(115deg, ${palette.primary}33, transparent 70%)` }}>
        <div className="flex min-w-0 items-center gap-4">
          <TeamMark code={team.code} name={team.name} className="h-16 w-16 shrink-0 rounded-2xl" />
          <div className="min-w-0">
            <span className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Focus team · {team.conference}</span>
            <h3 className="myna-display mt-1 text-3xl">{team.name.toUpperCase()}</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="myna-display text-3xl leading-none" style={{ color: palette.highlight }}>{wins}<span className="myna-muted text-lg">–{82 - wins}</span></div>
          <div className="myna-muted mt-1 text-[10px] uppercase tracking-[0.16em]">simulated record (median)</div>
        </div>
      </header>
      <div className="grid gap-4 border-t border-[var(--myna-border)] p-5 sm:grid-cols-3">
        <OddsBar label="Playoff odds" value={row.playoff} color="var(--myna-accent)" />
        <OddsBar label="Conference finals" value={row.confFinals} color="var(--myna-hi)" />
        <OddsBar label="Title odds" value={row.title} color="var(--myna-trim)" />
      </div>

      <div className="grid gap-5 border-t border-[var(--myna-border)] p-5 md:grid-cols-3">
        <div>
          <h4 className="myna-display mb-1 text-lg" style={{ color: 'var(--myna-accent)' }}>SIMULATED RATINGS</h4>
          <RatingRow label="Offensive rating" value={row.ortg} leagueAvg={leagueAvg.off} />
          <RatingRow label="Defensive rating" value={row.drtg} leagueAvg={leagueAvg.def} invert />
          <RatingRow label="Net rating" value={net} leagueAvg={leagueAvg.off - leagueAvg.def} />
          <RatingRow label="Pace" value={row.pace} leagueAvg={leagueAvg.pace} />
        </div>
        <div>
          <h4 className="myna-display mb-1 text-lg" style={{ color: 'var(--myna-accent)' }}>OFFENSIVE FOUR FACTORS</h4>
          <div className="grid grid-cols-2 gap-2">
            <FactorCell label="eFG%" value={team.efg} />
            <FactorCell label="FT attempt rate" value={team.ftr} />
            <FactorCell label="Off. rebound %" value={team.orb} />
            <FactorCell label="Turnover %" value={team.tov} />
          </div>
        </div>
        <div>
          <h4 className="myna-display mb-1 text-lg" style={{ color: 'var(--myna-accent)' }}>DEFENSIVE FOUR FACTORS</h4>
          <div className="grid grid-cols-2 gap-2">
            <FactorCell label="Opp eFG%" value={team.oppEfg} />
            <FactorCell label="Opp FT rate" value={team.oppFtr} />
            <FactorCell label="Def. rebound %" value={team.drb} />
            <FactorCell label="Opp turnover %" value={team.oppTov} />
          </div>
        </div>
      </div>

      {Number.isFinite(actualWins) && (
        <div className="border-t border-[var(--myna-border)] px-5 py-3 text-xs myna-muted">
          Actual {team.name} season: <span className="myna-mono font-semibold">{actualWins} wins</span> · compare the simulated median against the observed record.
        </div>
      )}
    </section>
  );
}