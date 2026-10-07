import React from 'react';
import { Film } from 'lucide-react';
import PlayFilmCard from '@/components/playbook/PlayFilmCard';
export default function PlayFilmPanel({ play, films }) {
  const matched = films.some(film => film.relation === 'Same action');
  return <section className="rounded-xl border border-border/35 bg-raised/20 p-3" aria-label={`NBA game footage for ${play.name}`}>
    <h3 className="flex items-center gap-2 font-mono text-[10.4px] font-semibold uppercase tracking-widest text-gold"><Film className="h-3.5 w-3.5" />NBA.com game film</h3>
    {!matched && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">An exact clip for this named play has not been verified{films.length ? '; the footage below shows related actions.' : ' yet.'}</p>}
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {films.map(film => <PlayFilmCard key={film.source} film={film} />)}
    </div>
  </section>;
}