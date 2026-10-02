import React, { useMemo } from 'react';
import { observedPlayers, per36Stats, perGameStats } from '@/lib/season/labs';

const BOARDS = [['Scoring · PTS/36', 'pts'], ['Playmaking · AST/36', 'ast'], ['Rebounding · REB/36', 'reb'], ['Minutes · MPG', null]];

export default function DonorBoard({ source }) {
  const data = useMemo(() => {
    const players = observedPlayers(source);
    const boards = BOARDS.map(([title, key]) => ({
      title,
      rows: players.map(player => ({ player, value: key ? per36Stats(player)[key] : perGameStats(player).mpg })).sort((x, y) => y.value - x.value).slice(0, 5),
    }));
    return { empty: !players.length, boards };
  }, [source]);
  if (data.empty) return null;
  return <section aria-label="Donor board" className="space-y-4">
    <div className="court-panel p-4">
      <p className="court-kicker">Donor board</p>
      <h2 className="mt-1 font-display text-2xl">TOP SKILL DONORS</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Observed leaders to keep in mind while you choose donors in the original Forge below.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {data.boards.map(board => <div key={board.title} className="min-w-0 rounded-xl border border-border/25 bg-canvas/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{board.title}</p>
          <ol className="mt-2 space-y-1">{board.rows.map((row, index) => <li key={row.player.playerRef} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate"><span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span> {row.player.name}</span>
            <span className="font-mono text-gold">{row.value.toFixed(1)}</span>
          </li>)}</ol>
        </div>)}
      </div>
    </div>
    <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Per-36 rates come straight from the observed player-season rows. The original Composite Forge below owns the build and recipe evidence.</p>
  </section>;
}