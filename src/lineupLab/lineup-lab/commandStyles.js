import typography from '@/lineupLab/lineup-lab/workspaceTypography';
import controls from '@/lineupLab/lineup-lab/workspaceControls';
import content from '@/lineupLab/lineup-lab/workspaceContent';

// Native HEX tokens on the body follow the existing hero palette selector.
// Root studio HEX tokens provide defaults; root HSL channels are not consumed.
const s = '.lineup-lab-tool #workspace.command-workspace';
const css = `
${s} {
  --ll-gold: hsl(var(--court-accent));
  --ll-gold-ink: hsl(var(--court-on-accent, var(--court-accent)));
  --ll-panel: hsl(var(--court-surface));
  --ll-heading-ink: hsl(var(--court-text));
  --ll-body-ink: var(--ll-heading-ink);
  --ll-muted: hsl(var(--court-muted));
  --ll-field: hsl(var(--court-canvas));
  --ll-field-border: hsl(var(--court-border));
  --ll-panel-border: color-mix(in srgb, var(--ll-field-border) 45%, transparent);
  --ll-track: hsl(var(--court-raised));
  --ll-row-alt: color-mix(in srgb, var(--ll-track) 45%, var(--ll-panel));
  --ll-focus: hsl(var(--court-focus));
  --ll-success: hsl(var(--court-positive));
  --ll-warning: var(--djhc-court-warning);
  --ll-error: var(--djhc-court-error);
  --ll-elev-rest: 0 4px 14px hsl(var(--court-canvas) / .35);
  --ll-elev-hover: 0 12px 30px hsl(var(--court-canvas) / .55);
  --ink: var(--ll-body-ink); --muted: var(--ll-muted); --navy: var(--ll-heading-ink);
  --blue: var(--ll-gold); --gold: var(--ll-gold); --warning: var(--ll-warning); --line: var(--ll-panel-border);
  box-sizing: border-box; width: calc(100% - 2rem); max-width: 1152px; margin: 24px auto 32px; padding: 24px;
  background: var(--ll-field); color: var(--ll-body-ink); position: relative; min-height: 0;
  font-family: var(--font-body); border-radius: 16px; border: 1px solid var(--ll-panel-border);
}
${s} * { box-sizing: border-box; }
${s}::before { content: ''; position: absolute; inset: 0 24px auto; height: 2px; background: linear-gradient(90deg, var(--ll-gold), transparent 70%); }
${s} > .shell { width: 100%; max-width: none; min-height: 0; margin: 0; padding: 0; }
${s} .command-top { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 0 0 22px; border-bottom: 1px solid var(--ll-panel-border); }
${s} .command-title { margin: 0; color: var(--ll-heading-ink); }
${s} .experience-switcher { display: flex; align-items: center; gap: 18px; max-width: 62%; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
${s} .experience-switcher::before { content: none; }
${s} .experience-switcher__buttons { display: flex; flex-shrink: 0; gap: 4px; padding: 3px; border: 1px solid var(--ll-panel-border); background: var(--ll-field); border-radius: 10px; }
${s} :is(.experience-switcher__button, .tool-nav__button) { border: 0; background: transparent; color: var(--ll-muted); padding: 10px 16px; border-radius: 7px; }
${s} :is(.experience-switcher__button, .tool-nav__button).is-active { background: var(--ll-track); color: var(--ll-body-ink); box-shadow: inset 0 -2px var(--ll-gold); }
${s} .tool-nav.command-navigation { position: static; display: flex; flex-wrap: wrap; gap: 6px; width: auto; height: auto; clip: auto; clip-path: none; overflow: visible; white-space: normal; margin: 16px 0 22px; padding: 0 0 16px; border: 0; border-bottom: 1px solid var(--ll-panel-border); border-radius: 0; background: transparent; }
${s} .tool-nav__button { padding: 10px 20px; }
${s} .guided-workflow.command-build { display: block; width: 100%; max-width: none; min-height: 0; }
${s} :is(.journey-canvas, #optimizerForm, .tool-view, .journey-stage) { min-height: 0; }
${s} .journey-canvas { width: 100%; max-width: none; }
${s} .journey-rail.command-stages { display: block; position: static; width: 100%; max-height: none; overflow: visible; margin: 0 0 24px; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
${s} .journey-rail::before, ${s} .journey-rail__title { display: none; }
${s} .journey-steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
${s} .journey-step { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 4px 10px; align-content: center; min-height: 74px; height: 100%; margin: 0; padding: 10px 8px; border: 0; border-bottom: 2px solid var(--ll-panel-border); border-radius: 8px 8px 0 0; background: transparent; color: var(--ll-muted); box-shadow: none; text-align: left; }
${s} .journey-step__number { grid-row: 1 / 3; width: 28px; height: 28px; margin: 0; color: var(--ll-body-ink); border: 1px solid var(--ll-field-border); border-radius: 8px; box-shadow: none; }
${s} .journey-step__status { grid-column: 2; }
${s} .journey-step__description { display: none; }
${s} .journey-step.is-current { border-color: var(--ll-gold); background: var(--ll-track); box-shadow: none; }
${s} .journey-step:is(.is-current, .is-complete) .journey-step__number { background: var(--ll-gold); color: var(--ll-gold-ink); border-color: var(--ll-gold); outline: none; }
${s} .journey-step:disabled { opacity: 1; cursor: not-allowed; }
${s} .journey-step:not(:disabled):hover { background: var(--ll-track); border-color: var(--ll-gold); }
${s} .journey-heading { margin: 0 0 18px; }
${s} .command-ticket { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 24px; padding: 12px 16px; border: 0; border-left: 2px solid var(--ll-gold); border-radius: 0 8px 8px 0; background: var(--ll-panel); }
${s} .journey-stage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 22px; scroll-margin-top: calc(var(--djhc-header-h, 96px) + 1rem); }
${s} .journey-stage > :is(.hero-outcomes, .players-step, .journey-review-action-surface) { grid-column: 1 / -1; }
${s} .journey-stage--plan .hero-outcomes { width: 100%; max-width: none; padding: 16px; margin: 0; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-panel); color: var(--ll-body-ink); }
${s} .journey-review-action-surface { min-width: 0; }
${s} .journey-next-hint { margin-left: auto; color: var(--ll-muted); font: 400 13px/1.5 var(--font-body); }
${s} .journey-restart { flex: 0 0 auto; margin: 0; }
${s} .journey-navigation { border-top: 1px solid var(--ll-panel-border); }
${s} .journey-busy { grid-template-columns: minmax(0, 1fr); padding: 19px; }
${s} .journey-errors { margin-bottom: 16px; }
${s} .builder-grid { display: block; }
${s} .builder-main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; align-items: start; }
${s} :is(.command-card, .results, .empty-result, .run-card) { position: relative; min-width: 0; padding: 22px; border: 1px solid var(--ll-panel-border); border-radius: 16px; background: var(--ll-panel); box-shadow: var(--ll-elev-rest); transition: box-shadow .2s ease, transform .2s ease; }
${s} :is(.command-card, .run-card):hover { box-shadow: var(--ll-elev-hover); transform: translateY(-1px); }
${s} .command-export-bar { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 18px; }
${s} .command-export-bar .button-secondary { min-height: 40px; padding: 9px 16px; }
${s} :is(.panel, .command-card, .results, .run-card)::before { display: none; }
${s} .guided-workflow :is(.step-heading, .workflow-heading, .run-card__heading) { display: flex; align-items: start; gap: 12px; margin: 0 0 18px; }
${s} .live-data-panel { margin: 0; }
${s} .live-data-panel__controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 18px; }
${s} .live-data-panel__controls > :first-child, ${s} #loadLiveDataButton { grid-column: 1 / -1; }
${s} #loadLiveDataButton { justify-self: start; width: auto; }
${s} :is(.field-row, .rotation-model-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
${s} .field-row--three > .field--choice { grid-column: 1 / -1; }
${s} .field { display: grid; gap: 8px; min-width: 0; }
${s} :is(.weight-grid, .compact-fields--six) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px; }
${s} .compact-fields:not(.compact-fields--six) { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
${s} .constraint-groups { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; }
${s} .players-step, ${s} .builder-sidebar { grid-column: 1 / -1; }
${s} .builder-sidebar { position: static; width: 100%; max-width: none; margin: 0; }
${s} .search-scope { margin: 16px 0; }

${s} .command-actions { position: static; bottom: auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 24px; padding: 20px 0 0; border: 0; border-top: 1px solid var(--ll-panel-border); border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
${s} .command-actions__phases { color: var(--ll-muted); font-size: 13px; }
${s} .command-actions__buttons { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-left: auto; }
${s} .command-actions .button--full { width: auto; }
${s} .mobile-solve-bar { display: none !important; }
${s} [hidden] { display: none !important; }
@media (max-width: 767px) {
  ${s} { width: calc(100% - 1rem); padding: 20px 16px; margin-bottom: 24px; }
  ${s} .command-top { flex-wrap: wrap; }
  ${s} .experience-switcher { max-width: 100%; width: 100%; flex-wrap: wrap; }
  ${s} .builder-main, ${s} .journey-stage { grid-template-columns: minmax(0, 1fr); }
  ${s} .journey-steps { display: flex; overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: 6px; }
  ${s} .journey-steps > li { flex: 0 0 168px; scroll-snap-align: start; }
  ${s} .experience-switcher__copy { max-width: none; }
  ${s} .command-ticket { flex-wrap: wrap; gap: 4px; }
  ${s} .journey-navigation .button { flex: 1; }
  ${s} .journey-next-hint { order: -1; flex-basis: 100%; }
  ${s} .command-actions { flex-wrap: wrap; }
  ${s} .command-actions__phases { display: none; }
  ${s} .command-actions__buttons { width: 100%; margin: 0; }
  ${s} .command-actions__buttons > .button { flex: 1; }
  ${s} .model-grid, ${s} .metric-field-guide__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ${s} table { min-width: 720px; }
}
@media (max-width: 420px) {
  ${s} :is(.live-data-panel__controls, .field-row, .compact-fields, .compact-fields:not(.compact-fields--six), .weight-grid) { grid-template-columns: minmax(0, 1fr); }
  ${s} .journey-navigation .button { flex: 1 1 120px; }
  ${s} .tool-nav__button { padding: 10px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  ${s} *, ${s} *::before, ${s} *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}

/* Compact tool hero: the stage controls deserve the space above the fold */
.lineup-lab-tool .tool-hero { padding: 1.6rem 1.7rem; }
.lineup-lab-tool .tool-hero__title { font-size: clamp(2.1rem, 4vw, 3.2rem); }

/* Low-vision users: muted copy rises to full ink */
@media (prefers-contrast: more) {
  ${s} { --ll-muted: var(--ll-heading-ink); }
}
`;
export default [css, typography, controls, content].join('\n');