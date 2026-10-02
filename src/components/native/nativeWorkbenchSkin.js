const nativeWorkbenchSkin = `
.studio-native :is(.game-lab-view,.season-lab-view){width:100%;max-width:none;margin:0;padding:0;color-scheme:dark}
.studio-native .game-lab-view{--gl-ink:var(--studio-ink);--gl-muted:var(--studio-muted);--gl-surface:var(--studio-surface);--gl-raised:var(--studio-raised);--gl-canvas:var(--studio-canvas);--gl-line:var(--studio-line);--gl-gold:var(--studio-gold);--gl-blue:var(--studio-blue);--gl-danger:var(--court-trim)}
.studio-native .season-lab-view{--sl-ink:var(--studio-ink);--sl-muted:var(--studio-muted);--sl-surface:var(--studio-surface);--sl-raised:var(--studio-raised);--sl-canvas:var(--studio-canvas);--sl-line:var(--studio-line);--sl-gold:var(--studio-gold);--sl-blue:var(--studio-blue);--sl-green:var(--court-positive);--sl-red:var(--court-trim)}
.studio-native :is(.gl-hero,.sl-hero){display:none}
.studio-native :is(.gl-panel,.sl-source-panel,.sl-results-shell,.sl-setup-empty,.sl-card,.swishiq-chemistry-lab__result-card,.swishiq-composite-source-card){background:var(--studio-surface);color:var(--studio-ink);border:1px solid var(--studio-line);border-radius:1rem;box-shadow:var(--studio-shadow)}
.studio-native :is(.gl-section-heading h2,.sl-section-heading h2,.sl-card h3){font-size:1.6rem;margin-bottom:.3rem}
.studio-native :is(.gl-eyebrow,.sl-eyebrow){font-size:.65rem;letter-spacing:.17em;color:var(--studio-gold)}
.studio-native :is(.gl-form-grid,.sl-setup-grid){grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:1rem;align-items:end}
.studio-native :is(.gl-field,.sl-control){min-width:0;font-size:.75rem}
.studio-native :is(.gl-form-section-title,.gl-form-section-scenario){grid-column:1/-1}
.studio-native :is(.gl-button-primary,.sl-button:not(.sl-button--secondary):not(.sl-button--quiet),.button-primary,.swishiq-builder-action--primary){background:var(--studio-gold);color:var(--court-on-accent);border-color:var(--studio-gold);font-weight:700;min-height:2.75rem}
.studio-native :is(.gl-button-secondary,.sl-button--secondary,.button-secondary,.swishiq-builder-action--quiet){background:var(--studio-raised);color:var(--studio-ink);border-color:var(--studio-line);min-height:2.75rem}
.studio-native :is(.gl-status-dot,.sl-stage-dot){background:var(--studio-gold)}
.studio-native :is(.sl-status--ready,.sl-status--actual){color:var(--court-positive);border-color:color-mix(in srgb,var(--court-positive) 35%,transparent);background:color-mix(in srgb,var(--court-positive) 8%,var(--studio-surface))}
.studio-native :is(.sl-status--error,.gl-error){color:var(--court-trim)}
.studio-native :is(.gl-workbench-grid,.sl-dashboard-grid){grid-template-columns:minmax(0,1fr);gap:1rem}
.studio-native .gl-controls{border-top:3px solid var(--studio-gold)}
.studio-native .gl-scoreboard{padding:1.25rem;background:var(--studio-canvas);border-top:3px solid var(--studio-gold)}
.studio-native .gl-scoreboard strong{font-family:var(--font-display);font-size:clamp(2rem,5cqw,3.25rem);font-weight:400;color:var(--studio-gold)}
.studio-native :is(.gl-stat-card,.sl-metric-strip>div){border-top:2px solid var(--studio-gold);background:var(--studio-canvas);padding:1rem}
.studio-native :is(.gl-stat-card strong,.sl-metric-strip strong){font-family:var(--font-display);font-size:1.9rem;font-weight:400;letter-spacing:.03em}
.studio-native :is(.sl-workflow__step,.gl-phase){background:var(--studio-surface);box-shadow:none}
.studio-native .sl-workflow__step[data-state=current] .sl-workflow__number{color:var(--court-on-accent)}
.studio-native :is(.sl-view-nav,.gl-mode-options){background:var(--studio-canvas);border:1px solid var(--studio-line);border-radius:.85rem;padding:.35rem;gap:.35rem}
.studio-native :is(.sl-view-tab[aria-selected=true],.gl-mode-option[aria-pressed=true]){background:var(--studio-raised);color:var(--studio-gold)}
.studio-native :is(.sl-history-item,.gl-round-row,.gl-series-history-entry){background:var(--studio-canvas);border-color:var(--studio-line);border-radius:.75rem}
.studio-native .swishiq-chemistry-lab__view-chooser{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:.5rem;background:var(--studio-canvas);padding:.5rem;border-radius:1rem}
.studio-native .swishiq-chemistry-lab__view-choice:has(input:checked){background:color-mix(in srgb,var(--studio-gold) 10%,var(--studio-surface));border:1px solid color-mix(in srgb,var(--studio-gold) 40%,transparent)}
.studio-native :is(.swishiq-chemistry-combination-grid,.swishiq-composite-source-map){grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:1rem}
.studio-native .swishiq-chemistry-combination{border-radius:1rem;padding:1rem;background:var(--studio-surface);border-color:var(--studio-line)}
.studio-native .swishiq-builder-hud{background:var(--studio-canvas);border-color:var(--studio-line);border-top:3px solid var(--studio-gold);border-radius:1rem}
.studio-native .swishiq-composite-result-summary--prominent{border-left:3px solid var(--studio-gold);background:var(--studio-canvas);padding:1.25rem}
.studio-native :is(.swishiq-composite-filter-strip,.swishiq-composite-settings-grid){display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:.75rem}
.studio-native .swishiq-builder-donor-cards{gap:.75rem}
.studio-native :is(.swishiq-composite-controls,.swishiq-composite-results,.swishiq-composite-round){min-width:0;max-width:100%}
@container(min-width:58rem){.studio-native .gl-workbench-grid{grid-template-columns:minmax(20rem,.9fr) minmax(0,1.1fr)}.studio-native .sl-dashboard-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container(max-width:36rem){.studio-native :is(.sl-workflow,.gl-phase-rail,.gl-result-grid,.sl-metric-strip){grid-template-columns:minmax(0,1fr)}.studio-native :is(.gl-scoreboard,.sl-score-comparison){padding:.8rem}.studio-native :is(.gl-panel,.sl-source-panel,.sl-results-shell){padding:1rem}}
`;
export default nativeWorkbenchSkin;