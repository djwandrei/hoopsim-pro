import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';
import { forgePlayerScore } from './forgePool';
import { getForgePlayerRole } from './forgeOverall';

const one = value => Number.isFinite(value) ? value.toFixed(1) : '—';
const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
const int = value => Number.isFinite(value) ? String(Math.round(value)) : '—';
const BIG_STATS = [['pts', 'PPG'], ['reb', 'RPG'], ['ast', 'APG'], ['stl', 'SPG'], ['blk', 'BPG']];
const CONTEXT_STATS = [
  { key: 'mpg', label: 'MIN', fmt: one },
  { key: 'games', label: 'GP', fmt: int },
  { key: 'fg', label: 'FG%', fmt: pct },
  { key: 'tpp', label: '3P%', fmt: pct },
];

// Compact player profile for the dense one-screen forge columns: portrait and
// identity up top, the five per-game counting stats, then every DJHC grade.
export default function ForgePlayerCard({ player, note, className = '', emptyHint = "The revealed player's profile lands here." }) {
  const logo = player ? teamAsset(player.teamCode) : null;
  return <section aria-label="Player profile" className={`court-panel forge-player-profile relative overflow-hidden ${className}`}>
    {player ? <React.Fragment>
      <header className="relative border-b border-border/30 p-3">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold/40 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-br from-canvas/70 via-surface/80 to-raised/90" aria-hidden="true" />
        {logo && <Image src={logo} alt="" aria-hidden="true" fittingType="fit" className="absolute -right-8 top-1/2 h-32 w-32 -translate-y-1/2 object-contain opacity-15" />}
        <div className="forge-player-profile__identity relative flex items-center gap-3">
          <PlayerPortrait player={player} className="forge-player-profile__portrait h-16 w-14" frameless />
          <div className="forge-player-profile__heading min-w-0 flex-1">
            <h2 className="forge-player-profile__name truncate font-display text-xl uppercase leading-[0.95]">{player.name}</h2>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{player.teamCode} · {player.positions?.join(' / ') || '—'} · {player.games} GP</p>
          </div>
          {note && <span className="forge-player-profile__note shrink-0 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-center font-mono text-[9px] uppercase leading-tight text-gold">{note}</span>}
        </div>
      </header>
      <div className="p-3">
        <div className="forge-player-profile__stats grid grid-cols-5 divide-x divide-border/25 overflow-hidden rounded-xl border border-border/25 bg-raised/30">
          {BIG_STATS.map(([key, label]) => <div key={key} className="px-1 py-2 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-gold">{label}</p>
            <p className="mt-0.5 font-display text-lg leading-none">{one(player[key])}</p>
          </div>)}
        </div>
        <div className="forge-player-profile__skills-heading mt-3 flex flex-wrap items-center justify-between gap-2"><p className="bcast-kicker">DJHC skill grades</p><span className="font-mono text-[9px] text-gold">{getForgePlayerRole(player)} OVR {Math.round(forgePlayerScore(player))}</span></div>
        <div className="forge-player-profile__skills mt-1.5 grid grid-cols-3 gap-1">
          {SKILLS.map(skill => {
            const value = player[skill.key];
            if (!Number.isFinite(value)) return null;
            const tone = gradeTone(value);
            return <div key={skill.key} className="rounded-md border border-border/25 bg-raised/40 px-1.5 py-1 text-center">
              <p title={`${skill.label}: ${skill.basis}; ${player.ratingEvidence?.[skill.key]?.confidenceLabel || 'Limited'} confidence`} className="forge-player-profile__skill-label truncate text-[9px] uppercase tracking-wider text-muted-foreground">{skill.label}</p>
              <p className={`mt-0.5 font-display text-base leading-none ${tone === 'positive' ? 'text-positive' : tone === 'royal' ? 'text-royal-ink' : tone === 'gold' ? 'text-gold' : 'text-trim-ink'}`}>
                {gradeFor(value)}<span className="font-mono text-[9px] opacity-80"> · {Math.round(value)}</span>
              </p>
              <p title={player.ratingEvidence?.[skill.key]?.limitation || skill.basis} className="truncate font-mono text-[8px] text-muted-foreground">{player.ratingEvidence?.[skill.key]?.confidenceLabel || 'Limited'} confidence</p>
            </div>;
          })}
        </div>
        <details className="mt-3 rounded-lg border border-border/20 p-2"><summary className="cursor-pointer text-[10px] text-muted-foreground">How these ratings are built</summary>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Skills compare eligible players from the selected season, with a small role adjustment. Shooting accuracy and per-minute rates shrink toward season averages for smaller samples. Ratings use a curved 25–99 scale. OVR weights shift slightly by position: guards favor perimeter defense, Jump Shot and playmaking; bigs favor rim protection, rebounding and Finishing. Wings stay balanced.</p>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Clutch combines scoring, efficiency and ball security in the <a className="underline" href="https://cdn-uat.nba.com/news/stats-breakdown-coming-through-in-the-clutch" target="_blank" rel="noreferrer">NBA’s clutch window</a>. Limited samples shrink toward neutral. Perimeter Defense combines outside defended shooting, deflections and steals; these remain defensive proxies. Finishing uses 2-point shooting rather than shot-location data.</p>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Body compares height (45%), wingspan (45%) and weight (10%) with position peers. Height and weight are current roster snapshots; verified wingspans come from <a className="underline" href="https://www.nba.com/stats/draft/combine-anthro" target="_blank" rel="noreferrer">combine measurements</a>. Missing inputs are excluded and available weights rescale; no wingspan is invented. Body measures size and reach, not athleticism.</p>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">{player.seasonStartYear} season · {player.ratingModel} · {player.ratingEvidence?.scoring?.seasonPopulation || 0} eligible players</p>
        </details>
        <div className="forge-player-profile__context mt-3 flex flex-wrap gap-1.5">
          {CONTEXT_STATS.map(stat => <span key={stat.key} className="bcast-lowerthird">{stat.label}<span className="text-foreground">{stat.fmt(player[stat.key])}</span></span>)}
        </div>
      </div>
    </React.Fragment> : <div className="forge-player-profile__empty flex min-h-52 flex-col items-center justify-center px-4 text-center">
      <span className="bcast-watermark" aria-hidden="true">FRG</span>
      <p className="bcast-kicker">Player profile</p>
      <p className="mt-2 max-w-[16rem] text-xs text-muted-foreground">{emptyHint}</p>
    </div>}
  </section>;
}
