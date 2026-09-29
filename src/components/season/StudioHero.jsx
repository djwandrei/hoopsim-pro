import React from 'react';

const BADGES = ['Built from game data', 'Replayable scenarios', 'Responsive by design'];

export default function StudioHero({ league, source, sourceState }) {
  const pin = source?.entry ? `${source.entry.packageId} @ ${source.entry.packageVersion}` : null;
  return (
    <header className="relative overflow-hidden border-b border-border/50 bg-canvas">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-royal/20 blur-3xl" />
      <div className="pointer-events-none absolute right-40 top-48 h-40 w-40 rounded-full bg-gold/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-12">
        <span className="court-kicker inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          SWISHIQ STUDIO
        </span>
        <h1 className="court-display mt-3 text-6xl leading-none text-foreground sm:text-7xl">SEASON LAB</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Simulate a full season with every team's observed four-factor profile — then replay it as many times as you want and watch the probabilities take shape.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {BADGES.map(label => (
            <span key={label} className="rounded-full border border-border/60 bg-raised/60 px-3 py-1 text-xs text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        {league && (
          <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-positive" />
            <span className="text-xs text-muted-foreground">Package</span>
            <span className="font-mono text-xs text-goldSoft">{pin}</span>
            <span className="text-xs text-muted-foreground">· {league.teams.length} teams · model {source?.entry?.metricsVersion}</span>
            {sourceState === 'loading' && <span className="text-xs text-gold">loading…</span>}
          </div>
        )}
      </div>
    </header>
  );
}