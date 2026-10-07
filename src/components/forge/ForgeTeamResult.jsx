import React from 'react';
import { RotateCcw, RefreshCw, Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import ForgeShareButton from '@/components/forge/ForgeShareButton';

// Post-season verdict for the forged roster: the record/verdict panel sits
// beside the rotation and simulated standings, so the result reads on one
// screen instead of stacking three full-width sections.
export default function ForgeTeamResult({ result, onRerun, onNewDraft, shareEncode }) {
  const { forgeRow, standings, roster } = result;
  const near = standings.slice(0, 8);
  const showForge = forgeRow && !near.some(row => row.code === 'FRG');
  const headline = result.perfect ? 'FLAWLESS 98-0'
    : result.champion === 'FRG' ? 'CHAMPIONS'
    : result.reachedFinals ? 'RUNNERS-UP'
    : 'SEASON COMPLETE';
  const subline = result.perfect
    ? '82-0 through the regular season and 16-0 through the playoffs — perfection.'
    : result.champion === 'FRG'
      ? `Won the title, ${result.poW}-${result.poL} through the playoff bracket.`
      : result.reachedFinals
        ? `Reached the Finals, then eliminated in ${result.eliminated}.`
        : result.eliminated
          ? `Finished ${result.regWins}-${result.regLoss}, then eliminated in ${result.eliminated}.`
          : `Finished ${result.regWins}-${result.regLoss} — missed the postseason.`;
  return <section aria-label="Season result" className="grid items-start gap-4 lg:grid-cols-[minmax(0,21rem),minmax(0,1fr)]">
    <div className="court-panel court-panel-hover p-5 text-center">
      <p className="court-kicker">Season verdict · {result.seasonLabel}</p>
      <h2 className="mt-2 font-display text-5xl leading-none tracking-wide">{result.totalWins}<span className="text-muted-foreground">–</span>{result.totalLosses}</h2>
      <p className="mt-2 flex items-center justify-center gap-2 font-display text-2xl tracking-wide text-gold">{result.champion === 'FRG' && <Trophy className="h-5 w-5" />}{headline}</p>
      <p className="mt-2 text-sm text-muted-foreground">{subline}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <span className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-[11px] text-gold">Team grade <span className="font-mono font-bold">{Math.round(result.teamScore)}</span></span>
        <span className="rounded-lg border border-royal/40 bg-royal/10 px-3 py-1.5 text-[11px] text-royal-ink">Net rating <span className="font-mono font-bold">{result.net > 0 ? '+' : ''}{result.net.toFixed(1)}</span></span>
        {forgeRow && <span className="rounded-lg border border-border/30 px-3 py-1.5 text-[11px] text-muted-foreground">ORtg <span className="font-mono font-bold text-foreground">{forgeRow.ortg.toFixed(1)}</span> · DRtg <span className="font-mono font-bold text-foreground">{forgeRow.drtg.toFixed(1)}</span></span>}
      </div>
      <div className="mt-5 grid gap-2">
        <button type="button" onClick={onRerun} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"><RotateCcw className="h-3.5 w-3.5" />Run the season again</button>
        <button type="button" onClick={onNewDraft} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border/30 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"><RefreshCw className="h-3.5 w-3.5" />New draft</button>
        {shareEncode && <ForgeShareButton encode={shareEncode} />}
      </div>
    </div>
    <div className="space-y-4">
      <div className="court-panel p-4">
        <p className="court-kicker">The forged rotation</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {roster.map(({ slot, player }) => <div key={slot.key} className="flex items-center gap-2 rounded-xl border border-border/25 bg-raised/40 p-2">
            <PlayerPortrait player={player} className="h-9 w-9" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold leading-tight">{player.name}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{slot.label} · {slot.minutes} MIN · {player.pts?.toFixed(1)}p</p>
            </div>
          </div>)}
        </div>
      </div>
      {forgeRow && <div className="court-panel p-4">
        <p className="court-kicker">Simulated standings</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="text-left">Rank</th><th className="text-left">Team</th><th>W</th><th>L</th><th>Pct</th><th>ORtg</th><th>DRtg</th></tr></thead>
            <tbody>
              {near.map((row, index) => <tr key={row.code} className={row.code === 'FRG' ? 'bg-gold/10' : ''}>
                <td className="text-left font-mono text-xs">{index + 1}</td>
                <td className="text-left text-xs"><span className="flex items-center gap-1.5"><TeamMark code={row.code} className="h-6 w-6" />{row.code === 'FRG' ? 'Forge Legends' : row.name}</span></td>
                <td className="text-center font-mono text-xs">{row.wins}</td>
                <td className="text-center font-mono text-xs">{row.losses}</td>
                <td className="text-center font-mono text-xs">{row.winPct.toFixed(3).slice(1)}</td>
                <td className="text-center font-mono text-xs">{row.ortg.toFixed(1)}</td>
                <td className="text-center font-mono text-xs">{row.drtg.toFixed(1)}</td>
              </tr>)}
              {showForge && <tr className="bg-gold/10"><td className="text-left font-mono text-xs">{standings.findIndex(row => row.code === 'FRG') + 1}</td><td className="text-left text-xs"><span className="flex items-center gap-1.5"><TeamMark code="FRG" className="h-6 w-6" />Forge Legends</span></td><td className="text-center font-mono text-xs">{forgeRow.wins}</td><td className="text-center font-mono text-xs">{forgeRow.losses}</td><td className="text-center font-mono text-xs">{forgeRow.winPct.toFixed(3).slice(1)}</td><td className="text-center font-mono text-xs">{forgeRow.ortg.toFixed(1)}</td><td className="text-center font-mono text-xs">{forgeRow.drtg.toFixed(1)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  </section>;
}