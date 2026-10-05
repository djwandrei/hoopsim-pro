import React, { useMemo, useState } from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import { statsFromTotals } from '@/components/players/blueprintModel';
import PlayerContextTiles from '@/components/players/PlayerContextTiles';
import LineupSeasonRecord from '@/components/lineupLab/native/LineupSeasonRecord';
import PlayerBio from '@/components/players/PlayerBio';
import TrophyCase from '@/components/players/TrophyCase';
import usePlayerContext from '@/components/players/usePlayerContext';

const initials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('');
const TABS = [['profile', 'Profile'], ['bio', 'Bio']];

// Pool card in the full dossier-profile design: the same layout and info the
// Player Lab dossier shows — portrait header with team watermark, rate strip,
// and Profile / Bio tabs with only the selected season's stats — fed by the
// pool row plus the player's published context record. Presentation only; pool actions stay wired to the
// hidden source table.
export default function LineupPoolDossier({ row, team, strip, actions, pager }) {
  const [tab, setTab] = useState('profile');
  const { context, status } = usePlayerContext(row.name);
  const year = Number((team.season || '').match(/\d{4}/)?.[0]) || null;
  const teamCode = team.code || '';
  const teamName = paletteForTeam(teamCode).team;
  const logo = teamAsset(teamCode) || team.logo;
  const profiles = context?.nba?.profiles || [];
  const bio = profiles.find(candidate => Number.isFinite(candidate.ageBySeason?.[String(year)])) || profiles[0] || context?.nba?.roster;
  const details = [
    bio?.height?.display || null,
    Number.isFinite(bio?.weightPounds) ? `${bio.weightPounds} lb` : null,
    bio?.jerseyNumber ? `#${bio.jerseyNumber}` : null,
  ].filter(Boolean).join(' · ');

  // The player's published line for this exact team and season, when the
  // context record carries it — that unlocks the full shooting splits.
  const seasonRow = useMemo(() => (year && teamCode ? (context?.basketballReference?.seasons || []).find(item =>
    item.seasonPhase === 'regular' && !item.isMultiTeamAggregate
    && item.seasonStartYear === year && String(item.teamCode || '').toUpperCase() === teamCode) : null), [context, year, teamCode]);

  const player = useMemo(() => {
    const positions = (row.position || '').split('/').map(part => part.trim()).filter(Boolean);
    if (seasonRow?.totals) {
      return { name: row.name, positions, teamCode, seasonStartYear: year, totals: seasonRow.totals, stats: statsFromTotals(seasonRow.totals, seasonRow.advanced), statsSource: 'Published full-season totals' };
    }
    const games = Number((row.detail || '').match(/\d+/)?.[0]) || null;
    const numeric = key => {
      const parsed = Number.parseFloat(row.stats.find(item => item.key === key)?.value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const minutes = numeric('minutes');
    const totals = games && minutes != null ? {
      gamesPlayed: games,
      minutesPlayed: minutes * games,
      points: numeric('points') * games,
      totalRebounds: numeric('rebounds') * games,
      assists: numeric('assists') * games,
      steals: numeric('steals') * games,
      blocks: numeric('blocks') * games,
      turnovers: numeric('turnovers') * games,
    } : null;
    return { name: row.name, positions, teamCode, seasonStartYear: year, totals, stats: { pts: numeric('points'), reb: numeric('rebounds'), ast: numeric('assists'), mpg: minutes, stl: numeric('steals'), blk: numeric('blocks'), tov: numeric('turnovers'), gp: games }, statsSource: 'Lineup Lab pool data' };
  }, [row, seasonRow, teamCode, year]);

  return <article className="court-panel overflow-hidden">
    <header className="relative overflow-hidden border-b border-border/30">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold/40 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-canvas/70 via-surface/80 to-raised/90" aria-hidden="true" />
      {logo && <Image src={logo} alt="" aria-hidden="true" fittingType="fit" className="absolute -left-6 top-1/2 h-64 w-64 -translate-y-1/2 opacity-20 object-contain" />}
      <div className="relative flex items-center justify-end gap-2 p-4">
        {(row.locked || row.muted) && <span className={`rounded-md border px-2 py-1 font-mono text-[11px] ${row.locked ? 'border-gold/30 bg-gold/10 text-gold' : 'border-trim/40 bg-trim/10 text-trim-ink'}`}>{row.locked ? 'Locked in every result' : 'Kept out of every result'}</span>}
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Player profile</span>
      </div>
      <div className="relative flex items-end gap-3 pl-4 pr-4 sm:gap-5 sm:pl-5 sm:pr-5">
        <span className="relative h-36 w-32 shrink-0 overflow-hidden rounded-t-2xl border border-b-0 border-border/35 bg-raised/40 sm:h-44 sm:w-40">
          {row.avatar ? <Image src={row.avatar} fittingType="fit" className="h-full w-full object-cover" alt="" /> : <span className="grid h-full w-full place-items-center font-display text-3xl text-gold">{initials(row.name)}</span>}
        </span>
        <div className="min-w-0 flex-1 pb-4">
          <h2 className="font-display text-3xl uppercase leading-[0.9] text-foreground sm:text-5xl">{row.name}</h2>
          <span className="hero-rule mt-3" aria-hidden="true"></span>
          <p className="mt-2 text-xs text-muted-foreground">{[teamCode || null, teamCode && teamName !== teamCode ? teamName : null, row.position || 'Position not supplied'].filter(Boolean).join(' · ')}</p>
          {row.detail && <p className="mt-1 text-[11px] text-muted-foreground">{row.detail}</p>}
          {details && <p className="mt-1 text-[11px] text-muted-foreground">Player details · {details}</p>}
        </div>
      </div>
    </header>
    <div className="grid grid-cols-3 divide-x divide-border/30 border-b border-border/30 bg-gradient-to-b from-canvas/60 to-transparent">
      {strip.map(([label, value, sub]) => <div key={label} className="px-3 py-3.5 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">{label}</p><p className="mt-0.5 font-display text-3xl text-foreground">{value}</p><p className="text-[10px] text-muted-foreground">{sub}</p></div>)}
    </div>
    <nav aria-label={`${row.name} detail tabs`} className="flex divide-x divide-border/25 border-b border-border/30 bg-canvas/40">
      {TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={`flex-1 px-3 py-2.5 text-xs capitalize transition-colors ${tab === key ? 'font-semibold text-gold shadow-[inset_0_-2px_0_hsl(var(--court-accent))]' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
    </nav>
    <div className="p-4 sm:p-5">
      {tab === 'profile' && <section>
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">Player profile</p>
        <h3 className="mt-1 font-display text-2xl uppercase tracking-wide text-foreground">Player context</h3>
        <PlayerContextTiles bio={bio} status={status} />
        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[.2em] text-gold">Season statistics</p>
        <h3 className="mt-1 font-display text-2xl uppercase tracking-wide text-foreground">{year ? `${year}–${String(year + 1).slice(-2)}` : 'Selected-season'} regular-season stats</h3>
        <LineupSeasonRecord player={player} year={year} teamCode={teamCode} status={status} />
      </section>}
      {tab === 'bio' && <><PlayerBio player={player} context={context} status={status} /><TrophyCase context={context} status={status} /></>}
      <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">{player.statsSource}. Player portraits and biography context may be current; statistics remain bound to the selected team, season and phase.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 px-4 py-3.5 sm:px-5">
      {actions}
      {pager}
    </div>
  </article>;
}