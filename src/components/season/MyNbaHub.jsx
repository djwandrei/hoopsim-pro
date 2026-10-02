import React from 'react';
import { mix, paletteForTeam, themeFor } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { matchupThemeVars, teamThemeVars } from '@/components/game/matchupTheme';

const SEASON_TABS = [['hub', 'HUB'], ['standings', 'STANDINGS'], ['schedule', 'SCHEDULE'], ['team', 'MY TEAM'], ['log', 'PLAYER LOG']];
const GAME_TABS = [['matchup', 'MATCHUP'], ['game', 'GAME'], ['series', 'SERIES']];

// MyNBA-style league hub shell: every panel is themed by the focused team's
// palette. When an opposing team is supplied (Game Lab), the canvas blends
// both teams' colors and away-side accents are exposed as extra variables.
export default function MyNbaHub({ focusCode, awayCode, tab, onTab, tabs = SEASON_TABS, teamPicker, children }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const palette = paletteForTeam(focusCode);
  const awayPalette = awayCode ? paletteForTeam(awayCode) : null;
  const theme = themeFor(palette, mode);
  const vars = {
    ...teamThemeVars(focusCode, mode),
    '--myna-hero-start': mode === 'light' ? mix(theme.canvas, palette.primary, 0.12) : palette.primary,
    '--myna-action-end': mode === 'light' ? mix(theme.accent, palette.highlight, 0.12) : palette.highlight,
    '--myna-canvas': awayPalette ? mix(theme.canvas, awayPalette.primary, 0.07) : theme.canvas,
    '--myna-surface': awayPalette ? mix(theme.surface, awayPalette.primary, 0.08) : theme.surface,
    '--myna-raised': theme.raised,
    '--myna-text': theme.text,
    '--myna-muted': theme.muted,
    '--myna-border': theme.border,
    '--myna-accent': theme.accent,
    '--myna-on-accent': theme.onAccent,
    '--myna-primary': palette.primary,
    '--myna-hi': mode === 'light' ? themeFor({ ...palette, primary: palette.highlight }, mode).accent : palette.highlight,
    '--myna-trim': mode === 'light' ? themeFor({ ...palette, primary: palette.trim }, mode).accent : palette.trim,
    '--myna-primary-away': awayPalette?.primary,
    '--myna-hi-away': awayPalette?.highlight,
    '--myna-trim-away': awayPalette?.trim,
    ...(awayPalette ? matchupThemeVars(focusCode, awayCode, mode) : {}),
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