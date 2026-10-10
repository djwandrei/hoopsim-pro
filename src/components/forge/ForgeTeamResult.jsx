import React from 'react';
import { RotateCcw, RefreshCw, Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import ForgeShareButton from '@/components/forge/ForgeShareButton';
import MetricTile from '@/components/studio/MetricTile';

// Post-season verdict for the forged roster: the record/verdict panel sits
// beside the rotation and simulated standings, so the result reads on one
// screen instead of stacking three full-width sections.
export default function ForgeTeamResult({ result, onRerun, onNewDraft, onEdit, shareEncode }) {
  const { forgeRow, standings = [], roster = [] } = result;
  const headline = result.perfect ? 'PERFECT 98-0'
    : result.champion === 'FRG' ? 'CHAMPIONS'
    : result.reachedFinals ? 'RUNNERS-UP'
    : 'SEASON COMPLETE';
  const subline = result.perfect
    ? '82-0 through the regular season and 16-0 through the playoff bracket.'
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
      <p className="mt-2 text-sm text-muted-foreground">{subline}{result.playInW + result.playInL > 0 ? ` Play-In: ${result.playInW}-${result.playInL}.` : ''}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <span className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-[11px] text-gold">Team grade <span className="font-mono font-bold">{Math.round(result.teamScore)}</span></span>
        <span className="rounded-lg border border-royal/40 bg-royal/10 px-3 py-1.5 text-[11px] text-royal-ink">Net rating <span className="font-mono font-bold">{result.net > 0 ? '+' : ''}{result.net.toFixed(1)}</span></span>
        {forgeRow && <span className="rounded-lg border border-border/30 px-3 py-1.5 text-[11px] text-muted-foreground">ORtg <span className="font-mono font-bold text-foreground">{forgeRow.ortg.toFixed(1)}</span> · DRtg <span className="font-mono font-bold text-foreground">{forgeRow.drtg.toFixed(1)}</span></span>}
        {result.ensemble && <span className="rounded-lg border border-royal/30 bg-royal/5 px-3 py-1.5 text-[11px] text-muted-foreground">{result.ensemble.count}-season range <span className="font-mono font-bold text-foreground">{result.ensemble.lowWins}–{result.ensemble.highWins} wins</span></span>}
      </div>
      <div className="mt-5 grid gap-2">
        <button type="button" onClick={onRerun} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"><RotateCcw className="h-3.5 w-3.5" />Run the season again</button>
        <button type="button" onClick={onNewDraft} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border/30 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"><RefreshCw className="h-3.5 w-3.5" />New draft</button>
        {onEdit && <button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-border/30 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-gold/40 hover:text-gold">Adjust rotation</button>}
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
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{slot.label} · {slot.minutes} MIN · {player.pts?.toFixed(1) ?? '—'} PPG</p>
            </div>
          </div>)}
        </div>
      </div>
      {forgeRow && <div className="court-panel p-4">
        <p className="court-kicker">Simulated standings</p>
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="text-left">Rank</th><th className="text-left">Team</th><th>W</th><th>L</th><th>Pct</th><th>ORtg</th><th>DRtg</th></tr></thead>
            <tbody>
              {standings.map((row, index) => <tr key={row.code} className={row.code === 'FRG' ? 'bg-gold/10' : ''}>
                <td className="text-left font-mono text-xs">{index + 1}</td>
                <td className="text-left text-xs"><span className="flex items-center gap-1.5"><TeamMark code={row.code} className="h-6 w-6" />{row.code === 'FRG' ? 'Forge Legends' : row.name}</span></td>
                <td className="text-center font-mono text-xs">{row.wins}</td>
                <td className="text-center font-mono text-xs">{row.losses}</td>
                <td className="text-center font-mono text-xs">{row.winPct.toFixed(3).slice(1)}</td>
                <td className="text-center font-mono text-xs">{row.ortg.toFixed(1)}</td>
                <td className="text-center font-mono text-xs">{row.drtg.toFixed(1)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
      {result.ensemble && <div className="grid gap-2 sm:grid-cols-3"><MetricTile label="Average regular wins" value={result.ensemble.meanWins.toFixed(1)} detail={`${result.ensemble.count} seeded seasons`} /><MetricTile label="Playoff frequency" value={`${(result.ensemble.playoffRate * 100).toFixed(0)}%`} detail="ensemble estimate" tone="royal" /><MetricTile label="Championship frequency" value={`${(result.ensemble.championshipRate * 100).toFixed(0)}%`} detail="ensemble estimate" tone="positive" /></div>}
      <div className="court-panel p-4"><p className="court-kicker">Scenario & contributions</p><p className="mt-1 text-xs text-muted-foreground">Forge Legends replace {result.host?.name || 'the selected franchise'} · {result.scheduleKind} · seed {result.seed} · {result.model}</p><div className="mt-3 grid gap-1 sm:grid-cols-2">{result.contributions?.map(row => <div key={row.slot} className="flex items-center justify-between rounded border border-border/20 px-2 py-1.5 text-xs"><span>{row.slot} · {row.name}</span><span className="font-mono">{row.minutes}m · skill {row.grade.toFixed(0)}{row.fit ? '' : ' · role mismatch'}</span></div>)}</div></div>
      <details className="court-panel p-4"><summary className="cursor-pointer text-xs font-semibold text-gold">Forge game log ({result.games?.length || 0} games)</summary><div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-card"><tr><th className="p-2">Game</th><th>Matchup</th><th>Score</th><th>ORtg / DRtg</th></tr></thead><tbody>{result.games?.map((game, i) => <tr key={game.gameId || i} className="border-t border-border/20"><td className="p-2 text-center">{i + 1}</td><td className="text-center">{game.home} vs {game.away}</td><td className="text-center font-mono">{game.homePts}–{game.awayPts}</td><td className="text-center font-mono">{game.home === 'FRG' ? `${game.ortgH.toFixed(1)} / ${game.ortgA.toFixed(1)}` : `${game.ortgA.toFixed(1)} / ${game.ortgH.toFixed(1)}`}</td></tr>)}</tbody></table></div></details>
      <details className="court-panel p-4"><summary className="cursor-pointer text-xs font-semibold text-gold">Play-In and playoff bracket</summary><div className="mt-3 space-y-3">{result.bracket?.rounds.map(round => <section key={round.conference}><p className="court-kicker">{round.conference} · Play-In {round.playIn.length} games</p><div className="mt-1 grid gap-1">{round.playIn.map((game, i) => <p key={`${round.conference}-pi-${i}`} className="text-xs">{game.home} {game.homePts}–{game.awayPts} {game.away} · winner {game.winner}</p>)}</div>{round.series.map(series => <div key={`${series.round}-${series.higher}-${series.lower}`} className="mt-2"><p className="text-xs font-semibold">{series.round}: {series.winner} over {series.winner === series.higher ? series.lower : series.higher}, {series.winsHigher}-{series.winsLower}</p><p className="text-[10px] text-muted-foreground">{series.games.map(g => `${g.homePts}-${g.awayPts}`).join(' · ')}</p></div>)}</section>)}{result.bracket?.finals && <p className="text-xs font-semibold">Finals: {result.bracket.finals.winner} · {result.bracket.finals.winsHigher}-{result.bracket.finals.winsLower}</p>}</div></details>
    </div>
  </section>;
}
