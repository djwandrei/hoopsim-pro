import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';

const one = value => (Number(value) || 0).toFixed(1);
const int = value => String(Math.round(Number(value) || 0));
const pct = value => `${((Number(value) || 0) * 100).toFixed(1)}%`;

// Real box-score stats from the season source, shown as a stat strip.
const BIG_STATS = [
  { key:'pts', label:'PPG', fmt:one },
  { key:'reb', label:'RPG', fmt:one },
  { key:'ast', label:'APG', fmt:one },
  { key:'stl', label:'SPG', fmt:one },
  { key:'blk', label:'BPG', fmt:one },
];
const CONTEXT_STATS = [
  { key:'mpg', label:'MIN / GAME', fmt:one },
  { key:'games', label:'GP', fmt:int },
  { key:'fg', label:'FG%', fmt:pct },
  { key:'tpp', label:'3P%', fmt:pct },
];

// Wide showcase beside the reels: the revealed player's real per-game stat
// line, styled after the Player Blueprint profile header.
export default function ForgePlayerShowcase({ player, note }) {
  const logo = player ? teamAsset(player.teamCode) : null;
  return <section aria-label="Player showcase" className="court-panel relative overflow-hidden">
    {player ? <React.Fragment>
      <header className="relative border-b border-border/30">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold/40 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-br from-canvas/70 via-surface/80 to-raised/90" aria-hidden="true" />
        {logo && <Image src={logo} alt="" aria-hidden="true" fittingType="fit" className="absolute -left-6 top-1/2 h-44 w-44 -translate-y-1/2 object-contain opacity-20" />}
        <div className="relative flex flex-wrap items-end gap-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1 pb-1">
            <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Player profile</span>
            <h2 className="mt-1.5 font-display text-3xl uppercase leading-[0.95]">{player.name}</h2>
            <span className="hero-rule mt-2" aria-hidden="true"></span>
          </div>
          {note && <p className="shrink-0 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gold">{note}</p>}
        </div>
      </header>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-44">
          <PlayerPortrait player={player} frameless className="h-48 w-40 rounded-2xl" />
          <p className="text-center text-xs text-muted-foreground">{player.teamCode} · {player.positions?.join(' / ') || '—'} · {player.games} GP</p>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="bcast-kicker">Season stat line</p>
            <div className="mt-2 grid grid-cols-5 divide-x divide-border/30 overflow-hidden rounded-xl border border-border/25 bg-gradient-to-b from-canvas/60 to-transparent">
              {BIG_STATS.map(stat => <div key={stat.key} className="px-2 py-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">{stat.label}</p>
                <p className="mt-0.5 font-display text-2xl leading-none text-foreground sm:text-3xl">{stat.fmt(player[stat.key])}</p>
                <p className="text-[10px] text-muted-foreground">per game</p>
              </div>)}
            </div>
          </div>
          <div>
            <p className="bcast-kicker">DJHC skill grades</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {SKILLS.map(skill => {
                const value = player[skill.key];
                if (!Number.isFinite(value)) return null;
                const tone = gradeTone(value);
                return <div key={skill.key} className="rounded-lg border border-border/25 bg-raised/40 px-2 py-1.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{skill.label}</p>
                  <p className={`mt-0.5 font-display text-lg leading-none ${tone === 'positive' ? 'text-positive' : tone === 'royal' ? 'text-royal-ink' : tone === 'gold' ? 'text-gold' : 'text-trim-ink'}`}>{gradeFor(value)}<span className="font-mono text-[10px] opacity-80"> · {value}</span></p>
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border/30 p-3">
        <div className="flex flex-wrap gap-2">
          {CONTEXT_STATS.map(stat => <span key={stat.key} className="bcast-lowerthird">{stat.label}<span className="text-foreground">{stat.fmt(player[stat.key])}</span></span>)}
        </div>
      </div>
    </React.Fragment> : <div className="relative flex min-h-44 flex-col items-center justify-center text-center">
      <span className="bcast-watermark" aria-hidden="true">FRG</span>
      <p className="bcast-kicker">Player showcase</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">Spin the reels — the revealed player's real stat line lands here.</p>
    </div>}
  </section>;
}