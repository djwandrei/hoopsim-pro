import React from 'react';

function StandingsRow({ row, rank, focusCode, onFocusChange, actualWins }) {
  const isFocus = row.code === focusCode;
  const inPlayoffs = rank <= 6;
  const inPlayIn = rank >= 7 && rank <= 10;
  const net = row.ortg - row.drtg;
  return (
    <button
      type="button"
      onClick={() => onFocusChange(row.code)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
        isFocus ? 'bg-raised ring-1 ring-gold' : inPlayIn ? 'bg-royal/5 hover:bg-raised/70' : 'hover:bg-raised/70'
      }`}
    >
      <span className={`w-6 shrink-0 text-center font-mono text-xs ${inPlayoffs ? 'text-gold' : inPlayIn ? 'text-royal' : 'text-muted-foreground'}`}>{rank}</span>
      <span className="w-10 shrink-0 font-mono text-xs text-foreground">{row.code}</span>
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">{row.name}</span>
      <span className="relative h-2 w-16 shrink-0 overflow-hidden rounded-full bg-raised sm:w-24">
        <span className="absolute inset-y-0 left-0 rounded-full bg-gold/80" style={{ width: `${Math.min(100, (row.wins / 82) * 100)}%` }} />
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-sm text-foreground">{row.wins.toFixed(1)}</span>
      <span className={`hidden w-12 shrink-0 text-right font-mono text-xs md:block ${net >= 0 ? 'text-positive' : 'text-trim'}`}>
        {net >= 0 ? '+' : ''}{net.toFixed(1)}
      </span>
      <span className="hidden w-10 shrink-0 text-right font-mono text-xs text-muted-foreground lg:block">
        {Number.isFinite(actualWins) ? actualWins : '—'}
      </span>
      <span className="hidden w-12 shrink-0 text-right font-mono text-xs text-goldSoft sm:block">{Math.round(row.playoff * 100)}%</span>
      <span className="hidden w-10 shrink-0 text-right font-mono text-xs text-trim md:block">{Math.round(row.title * 100)}%</span>
    </button>
  );
}

function ConferenceCard({ title, rows, focusCode, onFocusChange, actualMap, footnote }) {
  return (
    <div className="court-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="court-display text-2xl text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{footnote}</span>
      </div>
      <div className="mt-3 grid grid-cols-[2rem_2.5rem_1fr_3rem_3rem_2.5rem_2.5rem] items-center gap-2 border-b border-border/50 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground md:[grid-template-columns:2rem_2.5rem_1fr_3rem_3rem_3rem_2.5rem_2.5rem] lg:[grid-template-columns:2rem_2.5rem_1fr_6rem_3rem_3rem_2.5rem_2.5rem]">
        <span className="text-center">#</span><span>Team</span><span className="hidden sm:block">Name</span>
        <span className="text-right">Proj W</span><span className="text-right md:block">Net</span>
        <span className="text-right hidden lg:block">Actual</span>
        <span className="text-right sm:block">PO%</span><span className="text-right hidden md:block">Title</span>
      </div>
      <div className="mt-1">
        {rows.map((row, index) => (
          <StandingsRow key={row.code} row={row} rank={index + 1} focusCode={focusCode} onFocusChange={onFocusChange} actualWins={actualMap?.get?.(row.code)} />
        ))}
      </div>
    </div>
  );
}

export default function StandingsBoard({ summary, league, focusCode, onFocusChange, actualMap }) {
  const east = summary.filter(row => league.byCode.get(row.code)?.conference === 'EAST')
    .sort((a, b) => b.wins - a.wins || (b.ortg - b.drtg) - (a.ortg - a.drtg));
  const west = summary.filter(row => league.byCode.get(row.code)?.conference === 'WEST')
    .sort((a, b) => b.wins - a.wins || (b.ortg - b.drtg) - (a.ortg - a.drtg));
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ConferenceCard title="EAST" rows={east} focusCode={focusCode} onFocusChange={onFocusChange} actualMap={actualMap} footnote="1–6 playoffs · 7–10 play-in" />
      <ConferenceCard title="WEST" rows={west} focusCode={focusCode} onFocusChange={onFocusChange} actualMap={actualMap} footnote="1–6 playoffs · 7–10 play-in" />
    </section>
  );
}