import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TAGS } from '@/components/playbook/playTags';

// Browsable play library: search + category filter + scheme-family tags,
// grouped by dictionary section (formations, systems, ball screens, defense,
// BLOB/SLOB, ...).
export default function PlayLibraryList({ categories, selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [activeTags, setActiveTags] = useState([]);

  const tagCounts = useMemo(() => {
    const counts = {};
    categories.forEach((item) => item.plays.forEach((play) => (play.tags || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; })));
    return counts;
  }, [categories]);

  const toggleTag = (id) => setActiveTags((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((item) => !category || item.title === category)
      .map((item) => ({
        ...item,
        plays: item.plays.filter((play) => (!q || play.name.toLowerCase().includes(q) || play.type.toLowerCase().includes(q) || play.goal.toLowerCase().includes(q)) && activeTags.every((id) => (play.tags || []).includes(id))),
      }))
      .filter((item) => item.plays.length > 0);
  }, [categories, query, category, activeTags]);

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
        {filtered.map((item) => (
          <section key={item.title}>
            <p className="mb-1.5 font-mono text-[10.4px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.title}</p>
            <div className="flex flex-col gap-1">
              {item.plays.map((play) => (
                <button
                  key={play.id}
                  type="button"
                  onClick={() => onSelect(play.id)}
                  aria-current={play.id === selectedId}
                  className={`rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors ${play.id === selectedId ? 'border-gold/30 bg-gold/10 font-semibold text-gold' : 'border-transparent text-muted-foreground hover:bg-raised hover:text-foreground'}`}
                >
                  {play.name}
                </button>
              ))}
            </div>
          </section>
        ))}
        {filtered.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No plays match that search.</p>}
      </div>
    </div>
  );
}