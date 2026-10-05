// Studio typography, scoped to the lab so shared site chrome stays untouched.
const s = '.lineup-lab-tool #workspace.command-workspace';
const css = `
${s} { font: 400 14px/1.6 var(--font-body); font-kerning: normal; }
${s} :is(h2, h3, h4, .view-heading, .step-heading) { color: var(--ll-heading-ink); text-transform: none; }
${s} .command-title { font: 400 clamp(28px, 3vw, 36px)/1.12 var(--font-display); letter-spacing: .035em; }
${s} .journey-heading h2 { margin: 0; font: 400 clamp(28px, 3vw, 34px)/1.15 var(--font-display); letter-spacing: .035em; }
${s} :is(.command-card, .results, .run-card, .view-heading) h2 { margin: 0 0 16px; font: 400 25px/1.18 var(--font-heading); letter-spacing: .025em; }
${s} h3 { margin: 20px 0 10px; font: 400 21px/1.25 var(--font-heading); letter-spacing: .025em; }
${s} h4 { font: 650 14px/1.4 var(--font-body); letter-spacing: 0; }
${s} :is(p, li) { line-height: 1.65; }
${s} :is(.view-heading, .step-heading, .workflow-heading) { font-family: var(--font-body); letter-spacing: 0; text-transform: none; }
${s} :is(.helper, .field__help, .run-card__intro, .weight-share-summary, .search-scope, .pool-summary, .lab-coaching-brief__note, .result-freshness, .data-source-selection-summary, .simple-model-summary) { color: var(--ll-muted); font: 400 13px/1.65 var(--font-body); }
${s} :is(.eyebrow, .dataset-strip__label, .run-card__heading) { color: var(--ll-muted); font: 650 11px/1.5 var(--font-body); letter-spacing: .12em; text-transform: uppercase; }
${s} .journey-heading .eyebrow { margin: 0 0 6px; color: var(--ll-gold); }
${s} :is(.field > span, .field > label, .field-group label, legend) { color: var(--ll-body-ink); font: 600 13px/1.5 var(--font-body); letter-spacing: 0; text-transform: none; }
${s} :is(.constraint-groups legend, .player-pool-details__heading h3) { color: var(--ll-heading-ink); }
${s} .experience-switcher__copy strong { font: 600 13px/1.5 var(--font-body); letter-spacing: 0; }
${s} .experience-switcher__copy span { color: var(--ll-muted); font: 400 12px/1.55 var(--font-body); }
${s} .experience-switcher__copy { max-width: 28rem; }
${s} .journey-step__label { color: var(--ll-body-ink); font: 600 13px/1.4 var(--font-body); }
${s} .journey-step__status { color: var(--ll-muted); font: 400 12px/1.4 var(--font-body); }
${s} .journey-step__number { font: 650 12px/1 var(--font-body); }
${s} .command-ticket p { margin: 0; color: var(--ll-muted); font: 400 13px/1.55 var(--font-body); white-space: normal; }
${s} .command-ticket .eyebrow { font-size: 11px; letter-spacing: .1em; }
${s} :is(.range-field, .range-field strong) { color: var(--ll-body-ink); font: 600 13px/1.5 var(--font-body); }
${s} :is(.range-field small, details small) { color: var(--ll-muted); font: 400 12px/1.5 var(--font-body); }
${s} :is(output, .lineup-player__minutes, .result-passport__metric) { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
${s} :is(.lineup-player__name, .watch-card__name) { color: var(--ll-heading-ink); font: 650 15px/1.4 var(--font-body); }
${s} :is(.position-pill, .selection-chip, .model-status-chip) { color: var(--ll-gold); font: 600 12px/1.5 var(--font-body); }
${s} a { color: var(--ll-gold); text-underline-offset: .2em; }
${s} a:hover { text-decoration: underline; }
${s} .command-card .step-number { display: none; }
`;
export default css;