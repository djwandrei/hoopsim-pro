import React, { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';

const storageKey = year => `swishiq-season-history-${year}`;

// Managed replay history for this exact season: save a completed replay,
// review its snapshot, or clear the matching history. Browser-local only.
export default function SeasonHistoryPanel({ year, hasResults, result, championName }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem(storageKey(year)) || '[]'); } catch { rows = []; }
    setEntries(Array.isArray(rows) ? rows : []);
  }, [year]);

  const save = () => {
    if (!hasResults || !result) return;
    const entry = {
      savedAt: new Date().toISOString(),
      repeats: result.repeats,
      blend: result.seed ? `${result.seed}` : 'random',
      horizon: result.horizon,
      scheduleSource: result.scheduleSource,
      series: result.bestOf,
      champion: championName || null,
    };
    const rows = [entry, ...entries].slice(0, 20);
    setEntries(rows);
    try { localStorage.setItem(storageKey(year), JSON.stringify(rows)); } catch { /* storage unavailable */ }
  };

  const clear = () => {
    setEntries([]);
    try { localStorage.removeItem(storageKey(year)); } catch { /* storage unavailable */ }
  };

  return (
    <section className="myna-panel p-4 sm:p-5" aria-label="Replay history">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-block h-8 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--myna-accent), transparent)' }} />
          <div>
            <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.22em]">Replay history</p>
            <h3 className="myna-display mt-0.5 text-xl">Managed season history</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!hasResults}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: 'var(--myna-accent)', color: 'var(--myna-accent)' }}
          >
            <Save className="h-3.5 w-3.5" />Save completed replay
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={!entries.length}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: 'var(--myna-border)', color: 'var(--myna-muted)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />Clear matching history
          </button>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs" style={{ color: 'var(--myna-muted)' }}>No saved replay history for this exact season and schedule.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map(entry => (
            <li key={entry.savedAt} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--myna-border)', color: 'var(--myna-text)' }}>
              <span className="myna-mono">{new Date(entry.savedAt).toLocaleString()}</span>
              <span>{entry.repeats}×</span>
              <span>{entry.scheduleSource === 'round-robin' ? 'Generated slate' : 'Actual slate'}</span>
              <span>{entry.series === 1 ? 'One-game playoffs' : `Best of ${entry.series}`}</span>
              <span>seed: <span className="myna-mono">{entry.blend}</span></span>
              {entry.champion && <span style={{ color: 'var(--myna-accent)' }}>champion: {entry.champion}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}