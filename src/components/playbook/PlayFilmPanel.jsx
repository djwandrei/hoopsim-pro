import React from 'react';
import { ExternalLink, Film } from 'lucide-react';
export default function PlayFilmPanel({ play, films }) {
  const matched = films.some(film => film.relation === 'Same action');
  return <section className="rounded-xl border border-border/35 bg-raised/20 p-3" aria-label={`NBA game footage for ${play.name}`}>
    <h3 className="flex items-center gap-2 font-mono text-[10.4px] font-semibold uppercase tracking-widest text-gold"><Film className="h-3.5 w-3.5" />NBA.com game film</h3>
    {!matched && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">An exact clip for this named play has not been verified{films.length ? '; the footage below shows related actions.' : ' yet.'}</p>}
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {films.map(film => <a key={film.source} href={film.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-col gap-1 rounded-lg border border-gold/25 bg-gold/5 p-3 transition-colors hover:bg-gold/10">
        <span className="flex items-start justify-between gap-2 text-xs font-semibold text-foreground">{film.label}<ExternalLink className="h-3.5 w-3.5 shrink-0 text-gold" /></span>
        <span className="font-mono text-[10.4px] text-gold">{film.relation} · {film.format}</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground">{film.detail}</span>
      </a>)}
    </div>
  </section>;
}