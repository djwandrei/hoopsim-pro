import React, { useMemo, useState } from 'react';
import { ChevronDown, Crown, TrendingUp, TrendingDown, Star } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import { hasMetric } from '@/lib/season/seasonMetrics';

// Interactive post-simulation recap: champion banner and key-metric tiles
// (clickable to refocus the hub). Leaders live on the League leaders panel.
export default function SeasonSummaryPanel({ summary, repeats, actualRecords, league, championCode, onFocusChange }) {
  const [open, setOpen] = useState(true);

  const model = useMemo(() => {
    if (!summary || !summary.length) return null;
    const validWins = row => hasMetric(row.wins);
    const rows = [...summary].sort((a, b) => (validWins(b) ? Number(b.wins) : -Infinity) - (validWins(a) ? Number(a.wins) : -Infinity));
    const netOf = row => hasMetric(row.ortg) && hasMetric(row.drtg) ? Number(row.ortg) - Number(row.drtg) : null;
    const bestNet = [...summary].filter(row => Number.isFinite(netOf(row))).sort((a, b) => netOf(b) - netOf(a))[0] || null;
    const surprises = summary
      .map(row => {
        const actual = actualRecords?.get?.(row.code);
        return actual && validWins(row) ? { row, delta: Math.round(Number(row.wins)) - actual.w } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.delta - a.delta);
    const over = surprises[0] || null;
    const under = surprises.length > 1 ? surprises[surprises.length - 1] : null;
    return { rows, bestNet, over, under };
  }, [summary, actualRecords]);

  if (!model) return null;
  const champion = championCode ? league.byCode.get(championCode) : null;
  const championRow = championCode ? summary.find(row => row.code === championCode) : null;
  const best = model.rows[0] || null;
  const signed = value => (value > 0 ? `+${value}` : `${value}`);

  const tile = 'group flex w-full flex-col rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-3 text-left transition-colors hover:bg-[var(--myna-raised)]';
  const tileLabel = 'flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] myna-muted';

  return (
    <section className="myna-panel overflow-hidden" aria-label="Season simulation summary">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Season recap</p>
          <h3 className="myna-display mt-0.5 text-2xl">SIMULATION SUMMARY</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="myna-muted text-[10px]">Median of {repeats ?? ''} replays</span>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
            className="myna-mono flex min-h-8 items-center gap-1 rounded-lg border border-[var(--myna-border)] px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] myna-muted transition-colors hover:bg-[var(--myna-raised)]"
          >
            {open ? 'Collapse' : 'Expand'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
        </div>
      </header>
      {open && (
        <div className="border-t border-[var(--myna-border)]">
          {champion && (
            <button
              type="button"
              onClick={() => onFocusChange?.(champion.code)}
              className="flex w-full flex-wrap items-center gap-3 px-4 py-4 text-left transition-colors hover:brightness-110"
              style={{ background: 'color-mix(in srgb, var(--myna-accent) 9%, transparent)' }}
            >
              <Crown className="h-5 w-5 shrink-0" style={{ color: 'var(--myna-accent)' }} />
              <TeamMark code={champion.code} name={champion.name} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="myna-muted text-[9px] font-bold uppercase tracking-[0.2em]">NBA champion</p>
                <p className="myna-display text-xl">{champion.name}</p>
              </div>
              <div className="ml-auto flex items-baseline gap-4">
                <span className="myna-mono text-lg font-bold">{hasMetric(championRow?.wins) && hasMetric(championRow?.losses) ? `${Math.round(Number(championRow.wins))}–${Math.round(Number(championRow.losses))}` : 'Record unavailable'}</span>
                <span className="myna-mono text-sm" style={{ color: 'var(--myna-accent)' }}>{hasMetric(championRow?.title) ? `${Math.round(Number(championRow.title) * 100)}% title odds` : 'Title odds unavailable'}</span>
              </div>
            </button>
          )}
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {best && <button type="button" className={tile} onClick={() => onFocusChange?.(best.code)}>
              <span className={tileLabel}><Star className="h-3 w-3" />Best record</span>
              <TeamMark code={best.code} name={best.code} className="mt-2 h-8 w-8" />
              <p className="myna-display mt-1 text-xl">{best.code} · {hasMetric(best.wins) && hasMetric(best.losses) ? `${Math.round(Number(best.wins))}–${Math.round(Number(best.losses))}` : 'record unavailable'}</p>
              <p className="myna-muted text-[10px]">Net {hasMetric(best.ortg) && hasMetric(best.drtg) ? signed(Math.round((Number(best.ortg) - Number(best.drtg)) * 10) / 10) : 'unavailable'}</p>
            </button>}
            {model.bestNet && <button type="button" className={tile} onClick={() => onFocusChange?.(model.bestNet.code)}>
              <span className={tileLabel}><Star className="h-3 w-3" />Best net rating</span>
              <TeamMark code={model.bestNet.code} name={model.bestNet.code} className="mt-2 h-8 w-8" />
              <p className="myna-display mt-1 text-xl">{model.bestNet.code} · {signed(Math.round((Number(model.bestNet.ortg) - Number(model.bestNet.drtg)) * 10) / 10)}</p>
              <p className="myna-muted text-[10px]">{Number(model.bestNet.ortg).toFixed(1)} ORTG · {Number(model.bestNet.drtg).toFixed(1)} DRTG</p>
            </button>}
            {model.over && (
              <button type="button" className={tile} onClick={() => onFocusChange?.(model.over.row.code)}>
                <span className={tileLabel}><TrendingUp className="h-3 w-3" />Biggest overperformer</span>
                <TeamMark code={model.over.row.code} name={model.over.row.code} className="mt-2 h-8 w-8" />
                <p className="myna-display mt-1 text-xl">{model.over.row.code} · {signed(model.over.delta)} wins</p>
                <p className="myna-muted text-[10px]">vs observed wins on the same slate</p>
              </button>
            )}
            {model.under && (
              <button type="button" className={tile} onClick={() => onFocusChange?.(model.under.row.code)}>
                <span className={tileLabel}><TrendingDown className="h-3 w-3" />Biggest underperformer</span>
                <TeamMark code={model.under.row.code} name={model.under.row.code} className="mt-2 h-8 w-8" />
                <p className="myna-display mt-1 text-xl">{model.under.row.code} · {signed(model.under.delta)} wins</p>
                <p className="myna-muted text-[10px]">vs observed wins on the same slate</p>
              </button>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
