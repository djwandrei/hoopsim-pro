import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const selectCls = 'rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground';

function BoxTable({ lines, code }) {
  const top = (lines || []).slice(0, 8);
  return (
    <div>
      <h4 className="court-display text-lg text-gold">{code} · MODELED BOX</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1 pr-2">Player</th><th className="px-2 text-right">MIN</th><th className="px-2 text-right">PTS</th>
              <th className="px-2 text-right">REB</th><th className="px-2 text-right">AST</th><th className="px-2 text-right">STL</th><th className="px-2 text-right">BLK</th>
            </tr>
          </thead>
          <tbody>
            {top.map(line => (
              <tr key={`${code}-${line.name}`} className="border-t border-border/30">
                <td className="py-1.5 pr-2 text-foreground">{line.name}</td>
                <td className="px-2 text-right font-mono text-muted-foreground">{line.min}</td>
                <td className="px-2 text-right font-mono text-foreground">{line.pts}</td>
                <td className="px-2 text-right font-mono text-foreground">{line.reb}</td>
                <td className="px-2 text-right font-mono text-foreground">{line.ast}</td>
                <td className="px-2 text-right font-mono text-muted-foreground">{line.stl}</td>
                <td className="px-2 text-right font-mono text-muted-foreground">{line.blk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Player lines are allocated from simulated team totals; they are modeled, not observed.</p>
    </div>
  );
}

export default function GameTape({ games, focusCode, league }) {
  const [scope, setScope] = useState('focus');
  const [index, setIndex] = useState(0);
  const list = useMemo(
    () => (games || []).map((game, i) => ({ ...game, i }))
      .filter(game => scope === 'all' || game.home === focusCode || game.away === focusCode),
    [games, scope, focusCode],
  );
  const safeIndex = Math.min(index, Math.max(0, list.length - 1));
  const game = list[safeIndex];
  if (!game) return null;
  const homeWins = game.homePts > game.awayPts;
  return (
    <section className="court-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="court-kicker text-xs">GAME TAPE</span>
          <h3 className="court-display text-2xl text-foreground">INSPECT A COMPLETED GAME</h3>
        </div>
        <div className="flex items-center gap-2">
          <select className={selectCls} value={scope} onChange={event => { setScope(event.target.value); setIndex(0); }}>
            <option value="focus">{focusCode} games only</option>
            <option value="all">All games</option>
          </select>
          <Button variant="secondary" size="icon" onClick={() => setIndex(Math.max(0, safeIndex - 1))} disabled={safeIndex === 0}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-mono text-xs text-muted-foreground">{list.length ? safeIndex + 1 : 0}/{list.length}</span>
          <Button variant="secondary" size="icon" onClick={() => setIndex(Math.min(list.length - 1, safeIndex + 1))} disabled={safeIndex >= list.length - 1}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 rounded-xl border border-border/50 bg-raised/40 px-4 py-5">
        <div className={`text-right ${homeWins ? '' : 'opacity-60'}`}>
          <div className="court-display text-2xl text-foreground">{league?.byCode.get(game.home)?.name?.toUpperCase() || game.home}</div>
          <div className="text-[11px] text-muted-foreground">home</div>
        </div>
        <div className="font-mono text-4xl">
          <span className={homeWins ? 'text-gold' : 'text-foreground'}>{game.homePts}</span>
          <span className="mx-2 text-muted-foreground">–</span>
          <span className={!homeWins ? 'text-gold' : 'text-foreground'}>{game.awayPts}</span>
        </div>
        <div className={!homeWins ? '' : 'opacity-60'}>
          <div className="court-display text-2xl text-foreground">{league?.byCode.get(game.away)?.name?.toUpperCase() || game.away}</div>
          <div className="text-[11px] text-muted-foreground">away</div>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-raised px-2 py-0.5">pace {game.poss.toFixed(1)}</span>
          <span className="rounded-full bg-raised px-2 py-0.5">ORtg {game.ortgH.toFixed(1)} vs {game.ortgA.toFixed(1)}</span>
          {game.ot > 0 && <span className="rounded-full bg-trim/20 px-2 py-0.5 text-goldSoft">{game.ot}OT</span>}
          {game.actual && <span className="rounded-full bg-positive/10 px-2 py-0.5 text-positive">actual result {game.actual.home}–{game.actual.away}</span>}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <BoxTable lines={game.boxHome.lines} code={game.home} />
        <BoxTable lines={game.boxAway.lines} code={game.away} />
      </div>
    </section>
  );
}