// Source, roster, reporting, and result surfaces share one quieter hierarchy.
const s = '.lineup-lab-tool #workspace.command-workspace';
const css = `
${s} .live-data-panel__intro { margin: 0 0 22px; padding: 0; border: 0; }
${s} .live-data-panel__intro .workflow-heading { margin: 0; border: 0; padding: 0; }
${s} .journey-stage--team { grid-template-columns: minmax(0, 1.45fr) minmax(280px, 1fr); }
${s} .journey-stage--team #datasetStrip { margin: 0; padding: 22px; border: 1px solid var(--ll-panel-border); border-radius: 16px; background: var(--ll-field); box-shadow: none; }
${s} .dataset-strip { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 14px; margin: 18px 0 0; padding: 18px; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-field); color: var(--ll-body-ink); font: 400 13px/1.6 var(--font-body); }
${s} :is(.dataset-strip__mark, .dataset-strip__logo) { width: 44px; height: 44px; }
${s} .dataset-strip__mark { color: var(--ll-gold); }
${s} .dataset-strip strong { display: block; color: var(--ll-heading-ink); font-size: 15px; }
${s} .dataset-strip :is(dl, .dataset-strip__actions) { grid-column: 1 / -1; margin: 0; }
${s} .dataset-strip dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 14px 0; border-block: 1px solid var(--ll-panel-border); }
${s} .dataset-strip dl > div { display: grid; gap: 4px; }
${s} .dataset-strip dt { color: var(--ll-muted); font: 400 12px/1.5 var(--font-body); }
${s} .dataset-strip dd { margin: 0; color: var(--ll-body-ink); font: 600 13px/1.5 var(--font-body); }
${s} .dataset-strip__actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-start; }
${s} .dataset-strip__media { color: var(--ll-muted); font-size: 12px; }
${s} :is(.constraint-groups fieldset, .model-choice) { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; }
${s} .constraint-groups legend { margin-bottom: 12px; }
${s} :is(.command-card details, .metric-field-guide) { margin-top: 18px; padding: 16px; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-raise); color: var(--ll-body-ink); font-size: 13px; line-height: 1.65; }
${s} .journey-rule-group { margin-top: 18px; padding: 16px; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-field); color: var(--ll-body-ink); font-size: 13px; line-height: 1.65; }
${s} details summary { min-height: 28px; color: var(--ll-body-ink); font: 600 14px/1.5 var(--font-body); cursor: pointer; }
${s} details[open] > summary { margin-bottom: 16px; }
${s} .journey-rule-group { margin-top: 0; }
${s} .journey-stage--rules > .journey-rule-group { margin-top: 0; }
${s} .player-pool-details { padding: 18px; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-raise); gap: 16px; }
${s} .player-pool-details__heading :is(h3, p) { margin: 0; }
${s} .player-pool-details__heading p { color: var(--ll-muted); font: 400 13px/1.6 var(--font-body); }
${s} :is(.table-wrap, .compare-content) { overflow: auto; max-width: 100%; border: 1px solid var(--ll-panel-border); border-radius: 12px; overscroll-behavior-x: contain; }
${s} table { width: 100%; min-width: 0; border-collapse: separate; border-spacing: 0; text-align: left; font: 400 13px/1.5 var(--font-body); font-variant-numeric: tabular-nums; }
${s} th { padding: 12px 10px; background: var(--ll-track); color: var(--ll-muted); border-bottom: 1px solid var(--ll-field-border); font: 600 11px/1.4 var(--font-mono); letter-spacing: .06em; text-transform: none; }
${s} td { padding: 13px 10px; color: var(--ll-body-ink); border-bottom: 1px solid var(--ll-panel-border); }
${s} tbody tr:nth-child(even) { background: var(--ll-row-alt); }
${s} tbody tr:hover { background: var(--ll-track); }
${s} :is(.results, .empty-result) { margin-top: 24px; }
${s} .results__heading { display: flex; align-items: start; flex-wrap: wrap; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
${s} .results__heading p { max-width: 62ch; color: var(--ll-muted); }
${s} :is(.results__actions, .lab-coaching-brief__actions, .opponent-swishiq__controls) { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
${s} :is(.result-card, .result-passport__card, .objective-scenario-card, .watch-card, .model-grid article) { padding: 18px; border: 1px solid var(--ll-panel-border); border-radius: 12px; background: var(--ll-field); color: var(--ll-body-ink); font: 400 14px/1.6 var(--font-body); box-shadow: none; }
${s} .result-scoreboard { background: var(--ll-field); border: 1px solid var(--ll-panel-border); box-shadow: none; }
${s} .result-freshness { padding: 12px 16px; background: var(--ll-field); border: 1px solid var(--ll-field-border); color: var(--ll-warning) !important; }
${s} .unit-proof-checks .is-ok { color: var(--ll-success); }
${s} :is(.unit-proof-checks .is-fail, .weight-validation, .error-card) { color: var(--ll-error); }
${s} :is(.model-grid, .metric-field-guide__grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
${s} .tool-view:not(#optimizerView) { padding-top: 22px; }
${s} .view-heading p { max-width: 70ch; font: 400 14px/1.65 var(--font-body); color: var(--ll-muted); }
${s} .run-card__summary { display: flex; flex-wrap: wrap; gap: 16px 24px; }
${s} :is(.field > label, .field-group label, details summary, .experience-switcher__button, .tool-nav__button, .choice-button-group button, .model-choice button) { text-transform: none; }
@media (max-width: 767px) {
  ${s} .journey-stage--team { grid-template-columns: minmax(0, 1fr); }
  ${s} :is(.model-grid, .metric-field-guide__grid, .result-detail-grid) { grid-template-columns: minmax(0, 1fr); }
  ${s} .table-wrap table { min-width: 680px; }
  ${s} .dataset-strip__actions .button { flex: 1 1 150px; }
  ${s} .command-actions { position: sticky; bottom: 10px; z-index: 6; padding: 14px; border: 1px solid var(--ll-panel-border); border-radius: 14px; background: var(--ll-panel); box-shadow: var(--ll-elev-hover); }
}
${s} .ll-compare { margin-top: 20px; }
${s} .ll-compare__head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
${s} .ll-compare__head h3 { margin: 0; color: var(--ll-heading-ink); font-family: var(--font-display); font-size: 1.2rem; letter-spacing: .04em; }
${s} .ll-compare__hint { margin: 12px 0 0; color: var(--ll-muted); font: 400 12px/1.6 var(--font-body); }
${s} .ll-compare__empty { margin: 0; color: var(--ll-muted); font: 400 13px/1.6 var(--font-body); }
${s} .ll-compare td:first-child { color: var(--ll-muted); font: 600 11px/1.4 var(--font-mono); letter-spacing: .06em; }
${s} .ll-compare__best { color: var(--ll-gold); font-weight: 700; }
${s} .ll-compare__current { color: var(--ll-gold); }
${s} .ll-compare .button-secondary { min-height: 32px; padding: 6px 12px; }
${s} .ll-sensitivity { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
${s} .ll-sensitivity .ll-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--ll-field-border); background: var(--ll-field); color: var(--ll-muted); font: 600 11px/1.4 var(--font-mono); letter-spacing: .05em; }
${s} .ll-sensitivity .is-ok { border-color: color-mix(in srgb, var(--ll-success) 55%, transparent); color: var(--ll-success); }
${s} .ll-sensitivity .is-warn { border-color: color-mix(in srgb, var(--ll-warning) 55%, transparent); color: var(--ll-warning); }
${s} .ll-weight-mirror { margin-left: 10px; color: var(--ll-muted); font: 400 11px/1.4 var(--font-body); }
${s} #weightsPanel[open] .ll-weight-mirror { display: none; }
`;
export default css;