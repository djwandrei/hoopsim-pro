// Lineup Lab design layer — "broadcast desk × site look". Injected as a
// <style> AFTER the site's own stylesheets (see toolStyles.ensureToolStyles),
// so it wins the cascade without editing the pinned site files. Presentation
// only: no element is hidden, moved, or disabled, so every tool and option
// keeps working exactly as before.

const css = `
/* ===== Design tokens ===== */
.lineup-lab-tool {
  --ll-gold: #e9b949;
  --ll-gold-soft: #f4d47c;
  --ll-gold-ink: #201505;
  --ll-royal: #2b3fae;
  --ll-blue: #1f2fa3;
  --ll-crimson: #d63a4b;
  --ll-radius: 16px;
  --ll-radius-sm: 11px;
  --ll-hairline: 1px solid rgba(233, 185, 73, .16);
  --ll-panel: linear-gradient(165deg, rgba(255, 255, 255, .95), rgba(232, 236, 250, .9));
  --ll-panel-border: rgba(16, 26, 51, .14);
  --ll-heading-ink: #101a33;
  --ll-body-ink: #26324e;
  --ll-muted: #5b6a8c;
  --ll-field: rgba(12, 19, 38, .05);
  --ll-field-border: rgba(16, 26, 51, .22);
  --ll-track: rgba(12, 19, 38, .12);
  --ll-row-alt: rgba(12, 19, 38, .035);
  --ll-row-hover: rgba(233, 185, 73, .1);
  --ll-shadow: 0 12px 32px rgba(9, 14, 30, .14);
  color: var(--ll-body-ink);
  font-kerning: normal;
}
body.dark-mode .lineup-lab-tool {
  --ll-panel: linear-gradient(165deg, rgba(28, 38, 66, .92), rgba(14, 21, 43, .95));
  --ll-panel-border: rgba(233, 185, 73, .17);
  --ll-heading-ink: #f4f7ff;
  --ll-body-ink: #e2e8ff;
  --ll-muted: #9aa8cd;
  --ll-field: rgba(5, 9, 22, .55);
  --ll-field-border: rgba(148, 163, 214, .24);
  --ll-track: rgba(5, 9, 22, .6);
  --ll-row-alt: rgba(5, 9, 22, .28);
  --ll-row-hover: rgba(233, 185, 73, .09);
  --ll-shadow: 0 16px 38px rgba(4, 8, 20, .55);
}

/* ===== Desk hero ===== */
.lineup-lab-tool .tool-hero {
  position: relative;
  overflow: hidden;
  border: var(--ll-hairline);
  border-radius: 20px;
  background:
    linear-gradient(120deg, rgba(233, 185, 73, .08), transparent 42%),
    radial-gradient(120% 160% at 88% 0%, rgba(43, 63, 174, .16), transparent 58%),
    var(--ll-panel);
  box-shadow: var(--ll-shadow);
  padding: 2.4rem 2rem;
}
.lineup-lab-tool .tool-hero::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--ll-gold), rgba(43, 63, 174, .6) 46%, transparent 84%);
}
.lineup-lab-tool .tool-hero::after {
  content: '';
  position: absolute;
  right: -6rem;
  bottom: -8rem;
  width: 22rem;
  height: 22rem;
  border-radius: 50%;
  border: 1px solid rgba(233, 185, 73, .14);
  background: radial-gradient(circle, rgba(233, 185, 73, .07), transparent 62%);
  pointer-events: none;
}
.lineup-lab-tool .tool-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: .7rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .62rem;
  font-weight: 600;
  letter-spacing: .24em;
  text-transform: uppercase;
  color: var(--ll-gold);
}
.lineup-lab-tool .tool-hero__eyebrow::before,
.lineup-lab-tool .tool-hero__eyebrow::after {
  content: '';
  height: 1px;
  width: 1.5rem;
  background: linear-gradient(90deg, transparent, var(--ll-gold));
}
.lineup-lab-tool .tool-hero__eyebrow::after { background: linear-gradient(90deg, var(--ll-gold), transparent); }
.lineup-lab-tool .tool-hero__title {
  margin-top: .55rem;
  font-family: 'Bebas Neue', var(--font-display, 'Bebas Neue'), sans-serif;
  font-size: clamp(2.6rem, 5.4vw, 4.2rem);
  line-height: .98;
  letter-spacing: .02em;
  color: var(--ll-heading-ink);
}
.lineup-lab-tool .tool-hero__title .tool-hero__accent,
.lineup-lab-tool .tool-hero__accent {
  background: linear-gradient(115deg, var(--ll-gold) 18%, var(--ll-gold-soft) 56%, var(--ll-royal) 110%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lineup-lab-tool .tool-hero__copy > p { color: var(--ll-muted); }
.lineup-lab-tool .tool-hero__emblem {
  position: relative;
  z-index: 1;
}
.lineup-lab-tool .tool-hero__emblem::before {
  content: '';
  position: absolute;
  inset: -10%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(233, 185, 73, .22), transparent 66%);
  filter: blur(6px);
}
.lineup-lab-tool .tool-hero__emblem img,
.lineup-lab-tool .tool-hero__emblem picture {
  position: relative;
  z-index: 1;
  border-radius: 18px;
  border: 1px solid rgba(233, 185, 73, .3);
  box-shadow: 0 14px 38px rgba(4, 8, 20, .4);
}

/* ===== Broadcast panels ===== */
.lineup-lab-tool .panel,
.lineup-lab-tool .watch-card,
.lineup-lab-tool .error-card {
  position: relative;
  border: 1px solid var(--ll-panel-border);
  border-radius: var(--ll-radius);
  background: var(--ll-panel);
  box-shadow: var(--ll-shadow);
}
.lineup-lab-tool .panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 14px;
  right: 14px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(233, 185, 73, .85), rgba(43, 63, 174, .45) 44%, transparent 82%);
  pointer-events: none;
}
.lineup-lab-tool .watch-card { border-radius: var(--ll-radius-sm); }

/* ===== Buttons ===== */
.lineup-lab-tool .button,
.lineup-lab-tool .contact-form button,
.lineup-lab-tool #loadLiveDataButton {
  border-radius: 10px;
  font-weight: 700;
  font-size: .78rem;
  letter-spacing: .07em;
  text-transform: uppercase;
}
.lineup-lab-tool .button {
  background: linear-gradient(120deg, var(--ll-gold), var(--ll-gold-soft));
  color: var(--ll-gold-ink);
  border: 1px solid rgba(233, 185, 73, .55);
  box-shadow: 0 8px 20px rgba(233, 185, 73, .22);
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.lineup-lab-tool .button:hover {
  filter: brightness(1.06);
  box-shadow: 0 10px 26px rgba(233, 185, 73, .34);
  transform: translateY(-1px);
}
.lineup-lab-tool .button-secondary,
.lineup-lab-tool .button-ghost,
.lineup-lab-tool .button--quiet {
  background: transparent;
  border: 1px solid rgba(233, 185, 73, .45);
  border-radius: 10px;
  color: var(--ll-gold);
  font-weight: 600;
  font-size: .72rem;
  letter-spacing: .06em;
  text-transform: uppercase;
  transition: background .18s ease;
}
.lineup-lab-tool .button-secondary:hover,
.lineup-lab-tool .button-ghost:hover,
.lineup-lab-tool .button--quiet:hover {
  background: rgba(233, 185, 73, .12);
}

/* ===== View switcher + tool nav ===== */
.lineup-lab-tool .experience-switcher { overflow: hidden; }
.lineup-lab-tool .experience-switcher__copy > strong {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.25rem;
  letter-spacing: .05em;
  color: var(--ll-heading-ink);
}
.lineup-lab-tool .experience-switcher__button {
  border-radius: 999px;
  font-weight: 600;
  font-size: .72rem;
  letter-spacing: .06em;
  text-transform: uppercase;
  border: 1px solid var(--ll-field-border);
  color: var(--ll-muted);
  transition: all .18s ease;
}
.lineup-lab-tool .experience-switcher__button.is-active {
  background: linear-gradient(120deg, var(--ll-gold), var(--ll-gold-soft));
  border-color: rgba(233, 185, 73, .6);
  color: var(--ll-gold-ink);
  box-shadow: 0 6px 16px rgba(233, 185, 73, .28);
}
.lineup-lab-tool .tool-nav__button {
  border-radius: 999px;
  font-size: .7rem;
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  border: 1px solid transparent;
  color: var(--ll-muted);
  transition: all .18s ease;
}
.lineup-lab-tool .tool-nav__button.is-active {
  border-color: rgba(233, 185, 73, .55);
  background: rgba(233, 185, 73, .12);
  color: var(--ll-gold);
  box-shadow: 0 0 14px rgba(233, 185, 73, .16);
}

/* ===== Workflow steps ===== */
.lineup-lab-tool .workflow-heading {
  display: flex;
  align-items: center;
  gap: .65rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--ll-muted);
}
.lineup-lab-tool .step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ll-gold), var(--ll-gold-soft));
  color: var(--ll-gold-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  font-size: .78rem;
  box-shadow: 0 4px 12px rgba(233, 185, 73, .3);
}
.lineup-lab-tool .step-heading,
.lineup-lab-tool .view-heading {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.5rem;
  letter-spacing: .04em;
  color: var(--ll-heading-ink);
}
.lineup-lab-tool .eyebrow {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .6rem;
  font-weight: 600;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ll-gold);
}

/* ===== Fields ===== */
.lineup-lab-tool .field > label,
.lineup-lab-tool .field-group label {
  font-size: .68rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ll-muted);
}
.lineup-lab-tool .field input,
.lineup-lab-tool .field select,
.lineup-lab-tool .field-group input,
.lineup-lab-tool .field-group select {
  border-radius: var(--ll-radius-sm);
  border: 1px solid var(--ll-field-border);
  background: var(--ll-field);
  color: var(--ll-body-ink);
  transition: border-color .18s ease, box-shadow .18s ease;
}
.lineup-lab-tool .field input:focus-visible,
.lineup-lab-tool .field select:focus-visible,
.lineup-lab-tool .field-group input:focus-visible,
.lineup-lab-tool .field-group select:focus-visible {
  outline: none;
  border-color: rgba(233, 185, 73, .65);
  box-shadow: 0 0 0 3px rgba(233, 185, 73, .18);
}
.lineup-lab-tool .choice-button-group button,
.lineup-lab-tool .model-choice button {
  border-radius: 999px;
  font-size: .7rem;
  font-weight: 600;
  letter-spacing: .05em;
  border: 1px solid var(--ll-field-border);
  color: var(--ll-muted);
  transition: all .18s ease;
}
.lineup-lab-tool .choice-button-group button.is-active,
.lineup-lab-tool .model-choice button.is-active,
.lineup-lab-tool .choice-button-group .is-active,
.lineup-lab-tool .model-choice .is-active {
  background: linear-gradient(120deg, var(--ll-gold), var(--ll-gold-soft));
  border-color: rgba(233, 185, 73, .6);
  color: var(--ll-gold-ink);
}

/* ===== Dataset strip (source desk) ===== */
.lineup-lab-tool .dataset-strip {
  border: 1px dashed rgba(233, 185, 73, .3);
  border-radius: var(--ll-radius-sm);
  background: var(--ll-field);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.lineup-lab-tool .dataset-strip__mark {
  color: var(--ll-gold);
  letter-spacing: .12em;
  text-transform: uppercase;
}
.lineup-lab-tool .result-freshness,
.lineup-lab-tool .data-source-selection-summary {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .68rem;
  letter-spacing: .04em;
  color: var(--ll-muted);
}

/* ===== Tables ===== */
.lineup-lab-tool .table-wrap {
  border: 1px solid var(--ll-panel-border);
  border-radius: var(--ll-radius-sm);
}
.lineup-lab-tool .table-wrap table,
.lineup-lab-tool .historical-benchmark__table,
.lineup-lab-tool .counter-weight-table,
.lineup-lab-tool .alternatives-table,
.lineup-lab-tool .result-table {
  font-variant-numeric: tabular-nums;
}
.lineup-lab-tool th {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .62rem;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ll-muted);
  border-bottom: 2px solid rgba(233, 185, 73, .45);
}
.lineup-lab-tool tbody tr:nth-child(even) { background: var(--ll-row-alt); }
.lineup-lab-tool tbody tr { transition: background-color .15s ease; }
.lineup-lab-tool tbody tr:hover { background: var(--ll-row-hover); }

/* ===== Chips, pills, bars ===== */
.lineup-lab-tool .position-pill {
  border-radius: 999px;
  border: 1px solid rgba(233, 185, 73, .5);
  background: rgba(233, 185, 73, .12);
  color: var(--ll-gold);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  font-size: .62rem;
  letter-spacing: .08em;
}
.lineup-lab-tool .selection-chip {
  border-radius: 999px;
  border: 1px solid rgba(233, 185, 73, .4);
  background: rgba(233, 185, 73, .1);
  color: var(--ll-body-ink);
  font-size: .68rem;
}
.lineup-lab-tool .model-status-chip {
  border-radius: 999px;
  border: 1px solid rgba(233, 185, 73, .4);
  background: rgba(233, 185, 73, .1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .64rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.lineup-lab-tool .metric-bar__track {
  border-radius: 999px;
  background: var(--ll-track);
}
.lineup-lab-tool .metric-bar__fill {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ll-royal), var(--ll-gold));
}
.lineup-lab-tool .analytics-chart__bar {
  border-radius: 4px;
  background: linear-gradient(90deg, var(--ll-royal), var(--ll-gold));
}
.lineup-lab-tool .analytics-chart__bar--warning { background: linear-gradient(90deg, var(--ll-crimson), var(--ll-gold)); }
.lineup-lab-tool .compare-player-track { border-radius: 999px; background: var(--ll-track); }
.lineup-lab-tool .compare-player-bar { border-radius: 999px; background: linear-gradient(90deg, var(--ll-royal), var(--ll-gold)); }
.lineup-lab-tool .lineup-player__rank {
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ll-gold), var(--ll-gold-soft));
  color: var(--ll-gold-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
}
.lineup-lab-tool .lineup-player__minutes {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--ll-muted);
}
.lineup-lab-tool .player-avatar {
  border-radius: 50%;
  border: 1px solid rgba(233, 185, 73, .35);
  box-shadow: 0 4px 12px rgba(4, 8, 20, .3);
}

/* ===== Result desk ===== */
.lineup-lab-tool .results { position: relative; }
.lineup-lab-tool .results::before {
  content: 'RESULT DESK';
  display: inline-flex;
  align-items: center;
  gap: .7rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .6rem;
  font-weight: 600;
  letter-spacing: .24em;
  text-transform: uppercase;
  color: var(--ll-gold);
}
.lineup-lab-tool .results::before::after { content: none; }
.lineup-lab-tool .result-scoreboard {
  border: 1px solid rgba(233, 185, 73, .35);
  border-radius: var(--ll-radius);
  background:
    linear-gradient(120deg, rgba(233, 185, 73, .07), transparent 46%),
    var(--ll-panel);
  box-shadow: var(--ll-shadow);
}
.lineup-lab-tool .result-card,
.lineup-lab-tool .objective-scenario-card,
.lineup-lab-tool .simple-result-details > *,
.lineup-lab-tool .result-passport__card {
  border: 1px solid var(--ll-panel-border);
  border-radius: var(--ll-radius-sm);
  background: var(--ll-panel);
  box-shadow: 0 8px 22px rgba(4, 8, 20, .16);
}
.lineup-lab-tool .result-passport__header {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .64rem;
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--ll-gold);
}
.lineup-lab-tool .result-passport__metric {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.lineup-lab-tool .result-passport__card--decision,
.lineup-lab-tool .result-passport__card--game {
  border-color: rgba(233, 185, 73, .35);
}
.lineup-lab-tool .lineup-dna__header,
.lineup-lab-tool .rotation-plan__heading,
.lineup-lab-tool .opponent-swishiq__heading {
  font-family: 'Bebas Neue', sans-serif;
  letter-spacing: .05em;
  color: var(--ll-heading-ink);
}
.lineup-lab-tool .unit-proof-checks .is-ok { color: #2fae66; }
.lineup-lab-tool .unit-proof-checks .is-fail { color: var(--ll-crimson); }

/* ===== Run desk (sidebar) ===== */
.lineup-lab-tool .run-card {
  border: 1px solid rgba(233, 185, 73, .3);
  background:
    linear-gradient(160deg, rgba(233, 185, 73, .09), transparent 52%),
    var(--ll-panel);
}
.lineup-lab-tool .run-card__heading {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .64rem;
  font-weight: 600;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ll-gold);
}
@media (min-width: 1024px) {
  .lineup-lab-tool .builder-sidebar { align-self: start; position: sticky; top: calc(var(--djhc-header-h, 96px) + 1rem); }
}

/* ===== States ===== */
.lineup-lab-tool .empty-state,
.lineup-lab-tool .error-card {
  border: 1px dashed rgba(233, 185, 73, .35);
  border-radius: var(--ll-radius);
  background: var(--ll-field);
  text-align: center;
  color: var(--ll-muted);
}
.lineup-lab-tool .data-note {
  border-inline-start: 3px solid rgba(233, 185, 73, .55);
  border-radius: var(--ll-radius-sm);
  background: var(--ll-field);
  color: var(--ll-muted);
  font-size: .78rem;
}

/* ===== Focus + motion ===== */
.lineup-lab-tool :is(button, a, input, select, summary):focus-visible {
  outline: 2px solid rgba(233, 185, 73, .8);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .lineup-lab-tool * { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;

export default css;