import React, { useCallback, useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { TAGS, tagLabel } from '@/components/playbook/playTags';
import { readFavorites, toggleFavorite } from '@/components/playbook/playFavorites';

// Browsable play library: search + category filter + scheme-family tags,
// grouped by dictionary section (formations, systems, ball screens, defense,
// BLOB/SLOB, ...), with starred favorites pinned to the top.
export default function PlayLibraryList({ categories, selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [favorites, setFavorites] = useState(readFavorites);

  const star = (id) => setFavorites(toggleFavorite(id));

  const tagCounts = useMemo(() => {
    const counts = {};
    categories.forEach((item) => item.plays.forEach((play) => (play.tags || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; })));
    return counts;
  }, [categories]);

  const toggleTag = (id) => setActiveTags((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const matches = useCallback((play) => {
    const q = query.trim().toLowerCase();
    return (!q || play.name.toLowerCase().includes(q) || play.type.toLowerCase().includes(q) || play.goal.toLowerCase().includes(q) || (play.tags || []).some((id) => tagLabel(id).toLowerCase().includes(q)))
      && activeTags.every((id) => (play.tags || []).includes(id));
  }, [query, activeTags]);

  const filtered = useMemo(() => categories
    .filter((item) => !category || item.title === category)
    .map((item) => ({ ...item, plays: item.plays.filter((play) => matches(play) && !favorites.includes(play.id)) }))
    .filter((item) => item.plays.length > 0),
  [categories, category, matches, favorites]);

  const favoritePlays = useMemo(() => categories
    .flatMap((item) => item.plays)
    .filter((play) => favorites.includes(play.id) && matches(play)),
  [categories, favorites, matches]);

  const row = (play) => (
    <div key={play.id} className={`flex items-center gap-1 rounded-lg border ${play.id === selectedId ? 'border-gold/30 bg-gold/10' : 'border-transparent'}`}>
      <button
        type="button"
        onClick={() => onSelect(play.id)}
        aria-current={play.id === selectedId}
        className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs leading-snug transition-colors ${play.id === selectedId ? 'font-semibold text-gold' : 'text-muted-foreground hover:bg-raised hover:text-foreground'}`}
      >
        {play.name}
      </button>
      <button
        type="button"
        onClick={() => star(play.id)}
        aria-pressed={favorites.includes(play.id)}
        aria-label={`${favorites.includes(play.id) ? 'Unstar' : 'Star'} ${play.name}`}
        className={`shrink-0 rounded-lg p-2 transition-colors ${favorites.includes(play.id) ? 'text-gold' : 'text-muted-foreground/50 hover:text-gold'}`}
      >
        <Star className={`h-3.5 w-3.5 ${favorites.includes(play.id) ? 'fill-current' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="court-panel p-4">
      <p className="court-kicker mb-3">Play library</p>
      <div className="space-y-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plays, sets, schemes…"
            aria-label="Search the play library"
            className="min-h-10 w-full rounded-lg border border-input bg-raised/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70"
          />
        </label>
        <select className="studio-select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
          <option value="">All categories ({categories.reduce((total, item) => total + item.plays.length, 0)})</option>
          {categories.map((item) => <option key={item.title} value={item.title}>{item.title} ({item.plays.length})</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Filter by scheme tags">
          {TAGS.filter((tag) => tagCounts[tag.id]).map((tag) => {
            const active = activeTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10.4px] font-semibold transition-colors ${active ? 'border-gold/50 bg-gold/10 text-gold' : 'border-border/40 bg-raised/30 text-muted-foreground hover:border-gold/40 hover:text-foreground'}`}
              >
                {tag.label} <span className="opacity-70">{tagCounts[tag.id]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1 lg:max-h-[calc(100vh-22rem)]">
        {favoritePlays.length > 0 && (
          <section>
            <p className="mb-1.5 flex items-center gap-1 font-mono text-[10.4px] font-semibold uppercase tracking-[0.18em] text-gold"><Star className="h-3 w-3" aria-hidden="true" />Pinned favorites</p>
            <div className="flex flex-col gap-1">{favoritePlays.map(row)}</div>
          </section>
        )}
        {filtered.map((item) => (
          <section key={item.title}>
            <p className="mb-1.5 font-mono text-[10.4px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.title}</p>
            <div className="flex flex-col gap-1">
              {item.plays.map(row)}
            </div>
          </section>
        ))}
        {filtered.length === 0 && favoritePlays.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No plays match that search.</p>}
      </div>
    </div>
  );
}