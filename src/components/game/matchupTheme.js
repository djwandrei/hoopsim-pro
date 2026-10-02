import { contrast, hslChannels, mix, paletteForTeam, themeFor } from '@/components/djhc/basketballPalettes';

const channels = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [`--${key}`, hslChannels(value)]));
const mynaVars = (palette, theme) => ({
  '--myna-canvas': theme.canvas, '--myna-surface': theme.surface, '--myna-raised': theme.raised,
  '--myna-text': theme.text, '--myna-muted': theme.muted, '--myna-border': theme.border,
  '--myna-accent': theme.accent, '--myna-on-accent': theme.onAccent,
  '--myna-primary': palette.primary, '--myna-hi': palette.highlight, '--myna-trim': palette.trim,
});
const roleVars = theme => channels({
  background: theme.canvas, foreground: theme.text, card: theme.surface, 'card-foreground': theme.text,
  popover: theme.surface, 'popover-foreground': theme.text, primary: theme.accent, 'primary-foreground': theme.onAccent,
  secondary: theme.raised, 'secondary-foreground': theme.text, muted: theme.raised, 'muted-foreground': theme.muted,
  accent: theme.raised, 'accent-foreground': theme.text, border: theme.border, input: theme.border, ring: theme.focus,
  destructive: theme.error, 'destructive-foreground': theme.onAccent,
  'court-canvas': theme.canvas, 'court-surface': theme.surface, 'court-raised': theme.raised,
  'court-text': theme.text, 'court-muted': theme.muted, 'court-border': theme.border,
  'court-accent': theme.accent, 'court-focus': theme.focus, 'court-trim': theme.trim, 'court-positive': theme.positive,
});

export function teamThemeVars(code, mode = 'dark') {
  const palette = paletteForTeam(code), theme = themeFor(palette, mode);
  const ink = themeFor({ ...palette, highlight: palette.primary }, mode).accent;
  return { ...roleVars(theme), ...mynaVars(palette, theme),
    '--court-royal': hslChannels(palette.primary), '--team-primary': palette.primary,
    '--team-secondary': palette.highlight, '--team-ink': ink,
    '--team-on-primary': contrast(palette.primary, '#FFFFFF') > contrast(palette.primary, '#111827') ? '#FFFFFF' : '#111827',
  };
}

export function matchupThemeVars(homeCode, awayCode, mode = 'dark') {
  const home = paletteForTeam(homeCode), away = paletteForTeam(awayCode);
  const base = themeFor(home, mode), opponent = themeFor(away, mode);
  const theme = { ...base, canvas: mix(base.canvas, opponent.canvas, .5),
    surface: mix(base.surface, opponent.surface, .5), raised: mix(base.raised, opponent.raised, .5) };
  const homeInk = themeFor({ ...home, highlight: home.primary }, mode).accent;
  const awayInk = themeFor({ ...away, highlight: away.primary }, mode).accent;
  return { ...roleVars(theme), ...mynaVars(home, theme), '--court-royal': hslChannels(away.primary),
    '--matchup-home-primary': home.primary, '--matchup-home-secondary': home.highlight,
    '--matchup-away-primary': away.primary, '--matchup-away-secondary': away.highlight,
    '--matchup-home-color': homeInk, '--matchup-away-color': awayInk,
    '--matchup-away-accent': opponent.accent,
    '--matchup-home-chart': home.primary,
    '--matchup-away-chart': home.primary === away.primary ? away.highlight : away.primary,
    '--myna-primary-away': away.primary, '--myna-hi-away': away.highlight, '--myna-trim-away': away.trim,
  };
}