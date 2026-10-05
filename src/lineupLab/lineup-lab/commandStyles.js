// Command layout uses the CURRENT court palette. No new palette, body theme,
// hero, header, footer, or palette-picker rules are introduced here.
const s = '.lineup-lab-tool #workspace.command-workspace';
const css = `
${s} {
  --ll-gold: var(--djhc-court-accent);
  --ll-gold-soft: var(--djhc-court-focus);
  --ll-gold-ink: var(--djhc-court-on-accent);
  --ll-royal: var(--djhc-court-team-primary);
  --ll-crimson: var(--djhc-court-team-trim);
  --ll-panel: var(--djhc-court-surface);
  --ll-heading-ink: var(--djhc-court-text);
  --ll-body-ink: var(--djhc-court-text);
  --ll-muted: var(--djhc-court-muted);
  --ll-field: var(--djhc-court-canvas);
  --ll-field-border: color-mix(in srgb, var(--djhc-court-border) 55%, transparent);
  --ll-panel-border: color-mix(in srgb, var(--djhc-court-border) 45%, transparent);
  --ll-row-alt: color-mix(in srgb, var(--djhc-court-raised) 45%, var(--djhc-court-surface));
  --ll-track: var(--djhc-court-raised);
  box-sizing: border-box; width: 100%; margin-top: 24px; padding: 28px 30px 112px;
  background: var(--djhc-court-canvas); color: var(--ll-body-ink); position: relative;
  font-family: var(--font-body); border-radius: 16px; border: 1px solid var(--ll-panel-border);
}
${s} * { box-sizing: border-box; }
${s}::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; border-radius: 16px 16px 0 0; background: linear-gradient(90deg, var(--ll-gold), var(--ll-royal), transparent 80%); }
${s} > .shell { width: 100%; max-width: none; margin: 0; padding: 0; }
${s} .command-top { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 4px 2px 20px; border-bottom: 1px solid var(--ll-panel-border); animation: command-rise .55s ease-out both; }
${s} .command-title { margin: 0; font-family: var(--font-heading); font-size: 25px; line-height: 1.15; letter-spacing: -.035em; font-weight: 750; color: var(--ll-heading-ink); }
${s} .experience-switcher { display: flex; align-items: center; gap: 8px; max-width: 60%; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
${s} .experience-switcher::before { content: none; }
${s} .experience-switcher__copy strong { font-family: var(--font-body); font-size: 13px; font-weight: 650; letter-spacing: 0; }
${s} .experience-switcher__copy span { color: var(--ll-muted); font-size: 11px; line-height: 1.4; }
${s} .experience-switcher__buttons { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--ll-panel-border); background: var(--ll-field); border-radius: 10px; }
${s} :is(.experience-switcher__button, .tool-nav__button) { border: 0; background: transparent; color: var(--ll-muted); padding: 9px 15px; border-radius: 7px; font-family: var(--font-body); font-size: 12px; font-weight: 650; letter-spacing: .04em; text-transform: none; cursor: pointer; transition: background .18s, color .18s, box-shadow .18s; }
${s} :is(.experience-switcher__button, .tool-nav__button).is-active { background: var(--djhc-court-raised); color: var(--ll-body-ink); box-shadow: inset 0 -2px var(--ll-gold); }
${s} .tool-nav.command-navigation { position: static; display: flex; flex-wrap: wrap; gap: 5px; width: auto; height: auto; clip: auto; clip-path: none; overflow: visible; white-space: normal; margin: 16px 0 18px; padding: 6px; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-field); animation: command-rise .55s .06s ease-out both; }
${s} .tool-nav__button { padding: 11px 18px; }
${s} .guided-workflow.command-build { display: block; width: 100%; max-width: none; }
${s} .journey-canvas { width: 100%; max-width: none; }
${s} .journey-rail.command-stages { display: block; position: static; width: 100%; max-height: none; overflow: visible; margin: 16px 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
${s} .journey-rail::before, ${s} .journey-rail__title { display: none; }
${s} .journey-steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
${s} .journey-step { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 4px 8px; min-height: 76px; height: 100%; margin: 0; padding: 10px; border: 1px solid var(--ll-panel-border); border-radius: 8px; background: var(--ll-field); color: var(--ll-muted); box-shadow: none; font-family: var(--font-body); text-align: left; transition: background .18s, color .18s, box-shadow .18s; }
${s} .journey-step__number { grid-row: 1 / 3; width: 24px; height: 24px; margin: 0; font-size: 10px; border-radius: 7px; }
${s} .journey-step__label { font-size: 11px; line-height: 1.4; color: var(--ll-body-ink); }
${s} .journey-step__status { grid-column: 2; font-size: 10px; font-weight: 400; }
${s} .journey-step__description { display: none; }
${s} .journey-step.is-current { border-color: var(--ll-gold); background: var(--djhc-court-raised); box-shadow: inset 0 -2px var(--ll-gold); }
${s} .journey-heading { margin: 0 0 16px; }
${s} .journey-heading h2 { margin: 0; font-family: var(--font-heading); font-size: 25px; line-height: 1.15; }
${s} .command-ticket { display: flex; align-items: baseline; gap: 16px; margin: 0 0 16px; padding: 11px 12px; border: 1px dashed var(--ll-field-border); border-radius: 8px; background: var(--ll-field); }
${s} .command-ticket p { margin: 0; color: var(--ll-muted); font-size: 11px; line-height: 1.6; white-space: normal; }
${s} .journey-stage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; scroll-margin-top: calc(var(--djhc-header-h, 96px) + 1rem); }
${s} .journey-stage > :is(.hero-outcomes, .players-step, .journey-review-action-surface) { grid-column: 1 / -1; }
${s} .journey-stage--team #datasetStrip { margin-top: 0; padding: 19px; background: var(--ll-panel); border-style: solid; border-radius: 13px; box-shadow: 0 12px 28px #05091040; }
${s} .journey-stage--plan .hero-outcomes { width: 100%; max-width: none; padding: 13px; margin: 0; border: 1px solid var(--ll-panel-border); border-radius: 8px; background: var(--ll-field); color: var(--ll-body-ink); }
${s} .journey-review-action-surface { min-width: 0; }
${s} .journey-rule-group { border: 1px solid var(--ll-panel-border); border-radius: 8px; padding: 11px; background: var(--ll-field); color: var(--ll-muted); }
${s} .journey-next-hint { margin-left: auto; color: var(--ll-muted); font-size: 11px; }
${s} .journey-navigation .button { width: auto; }
${s} .journey-restart { margin: 0; padding: 10px 14px; border: 1px solid var(--ll-field-border); border-radius: 7px; background: var(--djhc-court-raised); color: var(--ll-body-ink); font-size: 11px; }
${s} .journey-navigation { border-top: 1px solid var(--ll-field-border); }
${s} .journey-rule-group summary { cursor: pointer; }
${s} .journey-busy { grid-template-columns: minmax(0, 1fr); padding: 19px; }
${s} .journey-errors { margin-bottom: 16px; }
${s} .command-stage { border: 1px solid var(--ll-panel-border); border-radius: 8px; background: var(--ll-field); padding: 10px; color: var(--ll-muted); font-family: var(--font-body); font-size: 10px; line-height: 1.4; text-align: left; cursor: pointer; transition: background .18s, color .18s, box-shadow .18s; }
${s} .command-stage strong { display: block; margin-bottom: 4px; color: var(--ll-body-ink); font-size: 11px; }
${s} .builder-grid { display: block; }
${s} .builder-main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
${s} :is(.command-card, .results, .empty-result, .run-card) { position: relative; min-width: 0; padding: 19px; border: 1px solid var(--ll-panel-border); border-radius: 13px; background: var(--ll-panel); box-shadow: 0 12px 28px #05091040; animation: command-rise .55s .1s ease-out both; }
${s} :is(.command-card, .results, .run-card)::before { content: ''; position: absolute; left: 18px; right: 18px; top: 0; height: 1px; border-radius: 0; background: linear-gradient(90deg, var(--ll-gold), color-mix(in srgb, var(--ll-royal) 53%, transparent), transparent); }
${s} :is(.command-card, .run-card, .results) h2 { margin: 0 0 16px; font-family: var(--font-heading); font-size: 17px; line-height: 1.25; letter-spacing: -.02em; color: var(--ll-heading-ink); }
${s} :is(.command-card, .run-card, .results) h3 { margin: 18px 0 10px; font-family: var(--font-heading); font-size: 13px; letter-spacing: .01em; color: var(--ll-heading-ink); }
${s} .eyebrow { margin: 0 0 7px; color: var(--ll-gold); font: 700 10px var(--font-mono); letter-spacing: .16em; text-transform: uppercase; }
${s} .guided-workflow :is(.step-heading, .workflow-heading, .run-card__heading) { display: flex; align-items: start; gap: 10px; margin: 0 0 16px; }
${s} .step-number { flex: 0 0 24px; width: 24px; height: 24px; margin-top: 2px; font-size: 11px; border-radius: 7px; box-shadow: none; background: var(--ll-track); color: var(--ll-gold); }
${s} .live-data-panel { margin: 0; }
${s} .live-data-panel__controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 12px; }
${s} .live-data-panel__controls > :first-child, ${s} #loadLiveDataButton { grid-column: 1 / -1; }
${s} :is(.field-row, .rotation-model-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
${s} .field-row--three > .field--choice { grid-column: 1 / -1; }
${s} .field { display: grid; gap: 6px; min-width: 0; }
${s} .field > :is(span, label), ${s} .field-group label { font-size: 11px; font-weight: 650; color: var(--ll-muted); letter-spacing: 0; text-transform: none; }
${s} :is(.field input, .field select, #playerSearchInput) { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--ll-field-border); border-radius: 7px; background: var(--ll-field); color: var(--ll-body-ink); font: 12px var(--font-body); box-shadow: none; }
${s} :is(.field__help, .helper, .weight-share-summary, .run-card__intro) { color: var(--ll-muted); font-size: 11px; line-height: 1.65; }
${s} .dataset-strip { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; margin: 16px 0 0; padding: 11px 12px; border: 1px dashed var(--ll-field-border); border-radius: 8px; background: var(--ll-field); color: var(--ll-muted); font-size: 11px; line-height: 1.65; }
${s} .dataset-strip__mark { width: 36px; height: 36px; }
${s} .dataset-strip__logo { width: 36px; height: 36px; }
${s} .dataset-strip dl, ${s} .dataset-strip__actions { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin: 0; }
${s} .dataset-strip dl > div { display: flex; gap: 8px; }
${s} .dataset-strip :is(dt, dd, strong, span) { color: inherit; font-size: 11px; }
${s} :is(.preset-grid, .choice-button-group) { display: flex; flex-wrap: wrap; gap: 7px; }
${s} :is(.preset-card, .choice-button-group__button) { flex: 1 1 120px; min-width: 0; margin: 0; padding: 7px 10px; border: 1px solid var(--ll-field-border); border-radius: 7px; background: var(--ll-field); color: var(--ll-body-ink); font-size: 11px; box-shadow: none; }
${s} :is(.preset-card, .choice-button-group__button) strong { font-size: 11px; }
${s} :is(.preset-card, .choice-button-group__button) span { font-size: 10px; line-height: 1.4; color: var(--ll-muted); }
${s} :is(.preset-card, .choice-button-group__button):is(.is-active, .is-selected) { border-color: var(--ll-gold); background: color-mix(in srgb, var(--ll-gold) 12%, var(--ll-panel)); color: var(--ll-gold); }
${s} :is(.weight-grid, .compact-fields--six) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
${s} .range-field { display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: 5px; color: var(--ll-muted); font-size: 11px; }
${s} .range-field > span { grid-column: 1 / -1; }
${s} .range-field strong { font-size: 11px; }
${s} .range-field small { display: block; font-size: 10px; line-height: 1.4; }
${s} .range-field input { width: 100%; accent-color: var(--ll-royal); }
${s} input[type='checkbox'] { accent-color: var(--ll-gold); }
${s} .compact-fields:not(.compact-fields--six) { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
${s} .constraint-groups { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
${s} :is(.constraint-groups fieldset, .model-choice) { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; }
${s} .constraint-groups legend { margin-bottom: 10px; font-size: 13px; font-weight: 650; color: var(--ll-heading-ink); }
${s} :is(.command-card details, .metric-field-guide, .model-grid article) { padding: 11px; border: 1px solid var(--ll-panel-border); border-radius: 8px; background: var(--ll-field); color: var(--ll-muted); font-size: 11px; line-height: 1.6; margin-top: 14px; }
${s} details summary { color: var(--ll-body-ink); font-size: 11px; font-weight: 650; cursor: pointer; }
${s} .players-step, ${s} .builder-sidebar { grid-column: 1 / -1; }
${s} .builder-sidebar { position: static; width: 100%; max-width: none; margin: 0; }
${s} .run-card__summary { display: flex; flex-wrap: wrap; gap: 16px; }
${s} .search-scope { margin: 12px 0; }
${s} :is(.table-wrap, .compare-content) { overflow: auto; border: 1px solid var(--ll-panel-border); border-radius: 8px; }
${s} table { width: 100%; min-width: 0; border-collapse: collapse; text-align: left; font-size: 10px; }
${s} th { padding: 9px 7px; background: var(--ll-field); color: var(--ll-muted); font: 600 9px var(--font-mono); letter-spacing: .06em; border-bottom: 1px solid var(--ll-panel-border); }
${s} td { padding: 10px 8px; color: var(--ll-muted); }
${s} tbody tr:nth-child(even) { background: var(--ll-row-alt); }
${s} :is(.results, .empty-result) { margin-top: 16px; }
${s} .results__heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; }
${s} :is(.results__actions, .lab-coaching-brief__actions, .opponent-swishiq__controls) { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
${s} .result-card, ${s} .result-passport__card { padding: 13px; border: 1px solid var(--ll-panel-border); border-radius: 8px; background: var(--ll-field); color: var(--ll-muted); font-size: 11px; }
${s} .model-grid, ${s} .metric-field-guide__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
${s} .tool-view:not(#optimizerView) { padding-top: 16px; }
${s} .command-actions { position: sticky; bottom: 12px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; padding: 12px; border: 1px solid var(--ll-field-border); border-radius: 12px; background: color-mix(in srgb, var(--ll-panel) 94%, transparent); box-shadow: 0 14px 30px #05091070; backdrop-filter: blur(12px); }
${s} .command-actions__phases { color: var(--ll-muted); font-size: 11px; }
${s} .command-actions__buttons { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: auto; }
${s} .command-actions .button--full { width: auto; }
${s} .mobile-solve-bar { display: none !important; }
${s} button { cursor: pointer; }
${s} button:hover { color: var(--ll-body-ink); background-color: var(--djhc-court-raised); }
${s} button:active { color: var(--ll-gold); }
${s} :is(.button, .text-button) { min-height: 38px; padding: 10px 14px; border: 1px solid var(--ll-gold); border-radius: 7px; background: linear-gradient(135deg, var(--ll-gold), var(--ll-gold-soft)); color: var(--ll-gold-ink); font-family: var(--font-body); font-size: 11px; font-weight: 750; letter-spacing: .045em; text-transform: none; box-shadow: none; cursor: pointer; transition: filter .18s, box-shadow .18s, transform .18s; }
${s} :is(.button, .text-button):hover { filter: brightness(1.1); box-shadow: 0 5px 15px color-mix(in srgb, var(--ll-gold) 20%, transparent); transform: none; }
${s} :is(.button, .text-button):active { transform: translateY(1px); }
${s} :is(.button--quiet, .text-button) { background: var(--djhc-court-raised); border-color: var(--ll-field-border); color: var(--ll-body-ink); }
${s} :is(button, input, select, summary):focus-visible { outline: 2px solid var(--djhc-court-focus); outline-offset: 2px; }
${s} [hidden] { display: none !important; }
@keyframes command-rise { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 767px) {
  ${s} { padding: 20px 16px 88px; }
  ${s} .command-top { flex-wrap: wrap; }
  ${s} .experience-switcher { max-width: 100%; width: 100%; flex-wrap: wrap; }
  ${s} .builder-main, ${s} .journey-stage { grid-template-columns: minmax(0, 1fr); }
  ${s} .journey-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
  ${s} .live-data-panel__controls, ${s} .field-row { grid-template-columns: minmax(0, 1fr); }
  ${s} .tool-nav__button { padding: 10px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  ${s} *, ${s} *::before, ${s} *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;
export default css;