import React from 'react';
import { paletteForTeam, themeFor } from '@/components/djhc/basketballPalettes';

const SEASON_TABS = [['hub', 'HUB'], ['standings', 'STANDINGS'], ['schedule', 'SCHEDULE'], ['team', 'MY TEAM']];
const GAME_TABS = [['matchup', 'MATCHUP'], ['game', 'GAME'], ['series', 'SERIES']];

// MyNBA-style league hub shell: every panel is themed by the focused team's palette.
export default function MyNbaHub({ focusCode, tab, onTab, tabs = SEASON_TABS, children }) {
  const palette = paletteForTeam(focusCode);
  const theme = themeFor(palette, 'dark');
  const vars = {
    '--myna-canvas': theme.canvas,
    '--myna-surface': theme.surface,
    '--myna-raised': theme.raised,
    '--myna-text': theme.text,
    '--myna-muted': theme.muted,
    '--myna-border': theme.border,
    '--myna-accent': theme.accent,
    '--myna-on-accent': theme.onAccent,
    '--myna-primary': palette.primary,
    '--myna-hi': palette.highlight,
    '--myna-trim': palette.trim,
  };
  return (
    <section className="myna space-y-4 p-4 sm:p-5" style={vars} aria-label="League hub">
      <nav aria-label="Hub tabs" className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => onTab(key)}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-[11px] font-semibold tracking-[0.15em] transition-colors ${tab === key ? 'myna-accent' : 'text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {children}
    </section>
  );
}