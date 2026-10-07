import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';

const one = value => (Number(value) || 0).toFixed(1);
const pct = value => `${((Number(value) || 0) * 100).toFixed(1)}%`;
const int = value => String(Math.round(Number(value) || 0));
const BIG_STATS = [['pts', 'PPG'], ['reb', 'RPG'], ['ast', 'APG'], ['stl', 'SPG'], ['blk', 'BPG']];
const CONTEXT_STATS = [
  { key: 'mpg', label: 'MIN', fmt: one },
  { key: 'games', label: 'GP', fmt: int },
  { key: 'fg', label: 'FG%', fmt: pct },
  { key: 'tpp', label: '3P%', fmt: pct },
];

// Compact player profile for the dense one-screen forge columns: portrait and
// identity up top, the five per-game counting stats, then every DJHC grade.
export default function ForgePlayerCard({ player, note, emptyHint = "The revealed player's profile lands here." }) {
  const logo = player ? teamAsset(player.teamCode) : null;
  return <section aria-label="Player profile" className="court-panel relative overflow-hidden">
    {player ? <React.Fragment>
      <header className="relative border-b border-border/30 p-3">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold/40 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-br from-canvas/70 via-surface/80 to-raised/90" aria-hidden="true" />
        {logo && <Image src={logo} alt="" aria-hidden="true" fittingType="fit" className="absolute -right-8 top-1/2 h-32 w-32 -translate-y-1/2 object-contain opacity-15" />}
        <div className="relative flex items-center gap-3">
          <PlayerPortrait player={player} className="h-16 w-14" frameless />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl uppercase leading-[0.95]">{player.name}</h2>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{player.teamCode} · {player.positions?.join(' / ') || '—'} · {player.games} GP</p>
          </div>
          {note && <span className="shrink-0 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-center font-mono text-[9px] uppercase leading-tight text-gold">{note}</span>}
        </div>
      </header>
      <div className="p-3">
        <div className="grid grid-cols-5 divide-x divide-border/25 overflow-hidden rounded-xl border border-border/25 bg-raised/30">
          {BIG_STATS.map(([key, label]) => <div key={key} className="px-1 py-2 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-gold">{label}</p>
            <p className="mt-0.5 font-display text-lg leading-none">{one(player[key])}</p>
          </div>)}
        </div>
        <p className="bcast-kicker mt-3">DJHC skill grades</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {SKILLS.map(skill => {
            const value = player[skill.key];
            if (!Number.isFinite(value)) return null;
            const tone = gradeTone(value);
            return <div key={skill.key} className="rounded-md border border-border/25 bg-raised/40 px-1.5 py-1 text-center">
              <p className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{skill.label}</p>
              <p className={`mt-0.5 font-display text-base leading-none ${tone === 'positive' ? 'text-positive' : tone === 'royal' ? 'text-royal-ink' : tone === 'gold' ? 'text-gold' : 'text-trim-ink'}`}>
                {gradeFor(value)}<span className="font-mono text-[9px] opacity-80"> · {Math.round(value)}</span>
              </p>
            </div>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CONTEXT_STATS.map(stat => <span key={stat.key} className="bcast-lowerthird">{stat.label}<span className="text-foreground">{stat.fmt(player[stat.key])}</span></span>)}
        </div>
      </div>
    </React.Fragment> : <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
      <span className="bcast-watermark" aria-hidden="true">FRG</span>
      <p className="bcast-kicker">Player profile</p>
      <p className="mt-2 max-w-[16rem] text-xs text-muted-foreground">{emptyHint}</p>
    </div>}
  </section>;
}