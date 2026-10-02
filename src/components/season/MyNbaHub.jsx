import React from 'react';
import { paletteForTeam, themeFor } from '@/components/djhc/basketballPalettes';

const SEASON_TABS = [['hub', 'HUB'], ['standings', 'STANDINGS'], ['schedule', 'SCHEDULE'], ['team', 'MY TEAM'], ['log', 'PLAYER LOG']];
const GAME_TABS = [['matchup', 'MATCHUP'], ['game', 'GAME'], ['series', 'SERIES']];

// MyNBA-style league hub shell. With a focusCode the panels theme by that
// team's palette; without one (Game Lab) they use the studio's own palette.
const NEUTRAL_THEME = {
  canvas: 'hsl(var(--court-canvas))',
  surface: 'hsl(var(--court-surface))',
  raised: 'hsl(var(--court-raised))',
  text: 'hsl(var(--court-text))',
  muted: 'hsl(var(--court-muted))',
  border: 'hsl(var(--court-border))',
  accent: 'hsl(var(--court-accent))',
  onAccent: 'hsl(var(--court-canvas))',
  primary: 'hsl(var(--court-royal))',
  hi: 'hsl(var(--court-accent))',
  trim: 'hsl(var(--court-trim))',
};

export default function MyNbaHub({ focusCode, tab, onTab, tabs = SEASON_TABS, teamPicker, children }) {
  const palette = focusCode ? paletteForTeam(focusCode) : null;
  const theme = palette ? themeFor(palette, 'dark') : NEUTRAL_THEME;
  const vars = {
    '--myna-canvas': theme.canvas,
    '--myna-surface': theme.surface,
    '--myna-raised': theme.raised,
    '--myna-text': theme.text,
    '--myna-muted': theme.muted,
    '--myna-border': theme.border,
    '--myna-accent': theme.accent,
    '--myna-on-accent': theme.onAccent,
    '--myna-primary': palette ? palette.primary : NEUTRAL_THEME.primary,
    '--myna-hi': palette ? palette.highlight : NEUTRAL_THEME.hi,
    '--myna-trim': palette ? palette.trim : NEUTRAL_THEME.trim,
  };
  return (
    <section className="myna space-y-4 p-4 sm:p-5" style={vars} aria-label="League hub">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Hub tabs" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
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
        {teamPicker && (
          <label className="flex items-center gap-2 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--myna-muted)]">Focus team</span>
            <select
              value={teamPicker.focusCode}
              onChange={event => teamPicker.onChange(event.target.value)}
              className="min-h-9 rounded-lg bg-[var(--myna-raised)] px-2 text-[11px] font-semibold tracking-[0.1em] text-[var(--myna-text)]"
              aria-label="Focus team"
            >
              {teamPicker.teams.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {children}
    </section>
  );
}