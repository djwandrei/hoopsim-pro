import { contrast, hslChannels, luminance, mix, paletteForTeam, themeFor } from '@/components/djhc/basketballPalettes';

// Minimum color distance required between the two sides' accents so that
// similar team palettes (e.g. two red clubs, two black clubs) stay legible.
const SIDES_CONTRAST = 1.3;

const channels = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [`--${key}`, hslChannels(value)]));

// Light mode renders on white surfaces: raw highlight/trim colors like
// #FFFFFF or #C4CED4 vanish, so swap in readable accents for those roles.
const readableSeed = (palette, seed, mode) => (
  mode === 'light' ? themeFor({ ...palette, primary: seed, highlight: seed }, mode).accent : seed
);
const mynaVars = (palette, theme, mode = 'dark') => ({
  '--myna-canvas': theme.canvas, '--myna-surface': theme.surface, '--myna-raised': theme.raised,
  '--myna-text': theme.text, '--myna-muted': theme.muted, '--myna-border': theme.border,
  '--myna-accent': theme.accent, '--myna-on-accent': theme.onAccent,
  '--myna-primary': palette.primary, '--myna-hi': readableSeed(palette, palette.highlight, mode),
  '--myna-trim': readableSeed(palette, palette.trim, mode),
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

const inkFor = (palette, seed, mode) => themeFor({ ...palette, primary: seed, highlight: seed }, mode).accent;
const seeds = palette => [palette.primary, palette.highlight, palette.trim];

// Resolve one side's color against the other: keep the team's primary unless
// it sits too close to the opponent's color — then fall through the team's
// other colors in order, and finally push the primary apart toward
// white/black until distinct.
function distinguish(candidates, anchor) {
  for (const candidate of candidates) {
    if (contrast(anchor, candidate) >= SIDES_CONTRAST) return candidate;
  }
  let color = candidates[0], steps = 0;
  while (contrast(anchor, color) < SIDES_CONTRAST && steps < 8) {
    const target = luminance(color) > luminance(anchor) ? '#FFFFFF' : '#000000';
    color = mix(color, target, .3); steps += 1;
  }
  return color;
}

export function teamThemeVars(code, mode = 'dark') {
  const palette = paletteForTeam(code), theme = themeFor(palette, mode);
  // Stat highlights paint text in the team's primary color: only walk it
  // toward a readable tone when the raw primary is too dim — never swap to
  // the team's secondary/trim colors.
  const surface = theme.surface;
  const ink = contrast(palette.primary, surface) >= 4.5 ? palette.primary : inkFor(palette, palette.primary, mode);
  return { ...roleVars(theme), ...mynaVars(palette, theme, mode),
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
  const homeInk = inkFor(home, home.primary, mode);
  const homeChart = home.primary;
  // When both teams share similar colors, fall back through the away team's
  // secondary/trim colors — then push the color apart — for every role that
  // sits home-vs-away on screen.
  const awayInk = distinguish(seeds(away).map(seed => inkFor(away, seed, mode)), homeInk);
  const awayChart = distinguish(seeds(away), homeChart);
  return { ...roleVars(theme), ...mynaVars(home, theme, mode), '--court-royal': hslChannels(away.primary),
    '--matchup-home-primary': home.primary, '--matchup-home-secondary': home.highlight,
    '--matchup-away-primary': away.primary, '--matchup-away-secondary': away.highlight,
    '--matchup-home-color': homeInk, '--matchup-away-color': awayInk,
    '--matchup-away-accent': opponent.accent,
    '--matchup-home-chart': homeChart,
    '--matchup-away-chart': awayChart,
    '--myna-primary-away': away.primary,
    '--myna-hi-away': readableSeed(away, away.highlight, mode),
    '--myna-trim-away': readableSeed(away, away.trim, mode),
  };
}