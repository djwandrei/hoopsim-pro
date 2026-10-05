// Readable controls in either mode; native validation and visibility still win.
const s = '.lineup-lab-tool #workspace.command-workspace';
const css = `
${s} :is(.field input, .field select, .field-group input, .field-group select, #playerSearchInput) { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--ll-field-border); border-radius: 9px; background: var(--ll-raise); color: var(--ll-body-ink); font: 400 14px/1.45 var(--font-body); box-shadow: none; color-scheme: inherit; }
${s} input::placeholder { color: var(--ll-muted); opacity: 1; }
${s} :is(.button, .text-button, .journey-restart, .experience-switcher__button, .tool-nav__button) { min-height: 44px; font: 650 13px/1.4 var(--font-body); letter-spacing: .01em; text-transform: none; cursor: pointer; }
${s} :is(.button, .text-button, .journey-restart) { padding: 10px 16px; border: 1px solid var(--ll-gold); border-radius: 9px; background: var(--ll-gold); color: var(--ll-gold-ink); box-shadow: none; transition: background-color .15s, border-color .15s; }
${s} :is(.button--quiet, .button-secondary, .button-ghost, .text-button, .journey-restart) { background: var(--ll-track); border-color: var(--ll-field-border); color: var(--ll-body-ink); }
${s} :is(.button, .text-button, .journey-restart):not(:disabled):hover { filter: none; transform: none; box-shadow: none; border-color: var(--ll-gold); }
${s} :is(.button--quiet, .text-button, .journey-restart):not(:disabled):hover { background: var(--ll-field); }
${s} :is(.experience-switcher__button, .tool-nav__button):not(:disabled):hover { background: var(--ll-track); color: var(--ll-body-ink); }
${s} :is(.button, .text-button, .journey-restart):not(:disabled):active { transform: translateY(1px); }
${s} :is(.button, .text-button):disabled { opacity: 1; color: var(--ll-muted); background: var(--ll-track); border-color: var(--ll-panel-border); box-shadow: none; filter: none; cursor: not-allowed; }
${s} :is(.preset-grid, .choice-button-group) { display: flex; flex-wrap: wrap; gap: 10px; }
${s} :is(.preset-card, .choice-button-group__button) { flex: 1 1 150px; min-width: 0; min-height: 44px; margin: 0; padding: 12px; border: 1px solid var(--ll-panel-border); border-radius: 9px; background: var(--ll-raise); color: var(--ll-body-ink); font: 400 13px/1.5 var(--font-body); box-shadow: none; cursor: pointer; }
${s} :is(.preset-card, .choice-button-group__button) strong { color: var(--ll-heading-ink); font-size: 14px; }
${s} :is(.preset-card, .choice-button-group__button) span { color: var(--ll-muted); font-size: 12px; line-height: 1.5; }
${s} :is(.preset-card, .choice-button-group__button):is(.is-active, .is-selected) { background: var(--ll-track); border-color: var(--ll-gold); color: var(--ll-body-ink); box-shadow: inset 0 -2px var(--ll-gold); }
${s} :is(.preset-card, .choice-button-group__button):not(:disabled):hover { background: var(--ll-track); border-color: var(--ll-gold); }
${s} .range-field { display: grid; grid-template-columns: minmax(0, 1fr) 38px; align-items: center; gap: 8px; }
${s} .range-field > span { grid-column: 1 / -1; }
${s} .range-field input { width: 100%; min-height: 28px; accent-color: var(--ll-gold); cursor: pointer; }
${s} .range-field output { color: var(--ll-body-ink); text-align: right; }
${s} input[type='checkbox'] { width: 18px; height: 18px; accent-color: var(--ll-gold); }
${s} :is(button, a, input, select, textarea, summary):focus-visible { outline: 2px solid var(--ll-focus); outline-offset: 3px; box-shadow: none; }
${s} .button--full { width: 100%; }
${s} :is(.journey-navigation, .results__actions) .button { width: auto; }
`;
export default css;