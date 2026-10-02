// Dedicated Chemistry Lab skin: re-themes the native pair-profile, roster and
// observed-combination surfaces to the DJHC charcoal/gold studio aesthetic.
// Rules carry .swishiq-studio-page specificity so they win the cascade over
// the original studio stylesheets already injected into the shadow DOM.
const chemistrySkin = `
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__result{margin-top:1.75rem;padding:1.4rem;border:1px solid color-mix(in srgb,var(--studio-line) 70%,transparent);border-radius:1.25rem;background:var(--studio-surface);box-shadow:0 12px 34px hsl(var(--background)/.35)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__result::before{content:"";display:block;width:3.25rem;height:.2rem;margin-bottom:1.1rem;border-radius:999px;background:linear-gradient(90deg,var(--studio-gold),color-mix(in srgb,var(--studio-gold) 40%,transparent))}

/* Segmented view chooser ------------------------------------------------- */
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-chooser{grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin:0 0 1.35rem;padding:.45rem;border:1px solid color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:1rem;background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-chooser legend{margin-bottom:.55rem;color:var(--studio-muted);font-family:var(--font-mono);font-size:.62rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice{position:relative;min-height:3.6rem;padding:.75rem 1rem;border:1px solid transparent;border-radius:.7rem;background:transparent;transition:background .2s ease,border-color .2s ease,box-shadow .2s ease}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice input{inline-size:1rem;min-block-size:1rem;accent-color:var(--studio-gold)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice strong{font-family:var(--font-display);font-size:1rem;font-weight:400;letter-spacing:.06em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice small{font-size:.68rem;letter-spacing:.02em}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice:hover{background:color-mix(in srgb,var(--studio-gold) 6%,transparent)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice:has(input:checked){border-color:color-mix(in srgb,var(--studio-gold) 55%,transparent);background:color-mix(in srgb,var(--studio-gold) 10%,var(--studio-surface));box-shadow:0 0 0 3px color-mix(in srgb,var(--studio-gold) 12%,transparent)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-choice:has(input:checked) strong{color:var(--studio-gold)}

/* Pair profile — identities ---------------------------------------------- */
.studio-native.swishiq-studio-page .swishiq-pair-profile__heading h3{font-size:clamp(1.8rem,3.5vw,2.6rem)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__scope-note{border-color:color-mix(in srgb,var(--studio-gold) 50%,transparent);color:var(--studio-gold);background:color-mix(in srgb,var(--studio-gold) 10%,transparent);font-weight:700}
.studio-native.swishiq-studio-page .swishiq-pair-profile__boundary,.studio-native.swishiq-studio-page .swishiq-chemistry-combination__boundary{border-color:color-mix(in srgb,var(--studio-line) 85%,transparent);border-left:.25rem solid var(--studio-gold);border-radius:.9rem;background:color-mix(in srgb,var(--studio-gold) 4%,var(--studio-canvas))}
.studio-native.swishiq-studio-page .swishiq-pair-profile__boundary strong,.studio-native.swishiq-studio-page .swishiq-chemistry-combination__boundary strong{color:var(--studio-gold);font-family:var(--font-mono);font-size:.66rem;font-weight:600;letter-spacing:.12em}
.studio-native.swishiq-studio-page .swishiq-pair-profile__identity{border-color:color-mix(in srgb,var(--studio-line) 75%,transparent);border-radius:1.1rem;background:linear-gradient(135deg,color-mix(in srgb,var(--studio-raised) 85%,var(--studio-gold) 6%),var(--studio-surface));box-shadow:0 10px 26px hsl(var(--background)/.3);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}
.studio-native.swishiq-studio-page .swishiq-pair-profile__identity:hover{border-color:color-mix(in srgb,var(--studio-gold) 40%,transparent);box-shadow:0 14px 34px hsl(var(--background)/.45);transform:translateY(-2px)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__identity--second::before{background:var(--studio-gold)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__avatar{border-color:color-mix(in srgb,var(--swishiq-team-primary) 60%,transparent);color:var(--studio-ink);background:linear-gradient(145deg,color-mix(in srgb,var(--studio-raised) 75%,var(--swishiq-team-primary) 25%),var(--studio-raised));font-family:var(--font-display);box-shadow:0 0 0 .25rem color-mix(in srgb,var(--swishiq-team-primary) 12%,transparent)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__identity--second .swishiq-pair-profile__avatar{border-color:color-mix(in srgb,var(--studio-gold) 65%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--studio-raised) 75%,var(--studio-gold) 25%),var(--studio-raised));color:var(--studio-gold);box-shadow:0 0 0 .25rem color-mix(in srgb,var(--studio-gold) 12%,transparent)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__identity-copy h4{font-family:var(--font-display);font-size:clamp(1.25rem,2.2vw,1.55rem);letter-spacing:.04em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-pair-profile__role,.studio-native.swishiq-studio-page .swishiq-pair-profile__workload > div{border-color:color-mix(in srgb,var(--studio-line) 85%,transparent);border-radius:.65rem;background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__workload dd{font-size:1.2rem;letter-spacing:.05em}
.studio-native.swishiq-studio-page .swishiq-pair-profile__visuals{border-color:color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:1.1rem;background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__visuals h4{color:var(--studio-gold)}

/* Metric cards + comparison bars ----------------------------------------- */
.studio-native.swishiq-studio-page .swishiq-pair-profile__metric{border-color:color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:.85rem;background:var(--studio-surface);transition:border-color .2s ease,box-shadow .2s ease}
.studio-native.swishiq-studio-page .swishiq-pair-profile__metric:hover{border-color:color-mix(in srgb,var(--studio-gold) 35%,transparent);box-shadow:0 8px 20px hsl(var(--background)/.3)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__metric-code{border-color:color-mix(in srgb,var(--studio-gold) 45%,transparent);color:var(--studio-gold);background:color-mix(in srgb,var(--studio-gold) 10%,transparent)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__metric-delta.is-first-leading{color:var(--studio-blue)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__metric-delta.is-second-leading{color:var(--studio-gold)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__bar-track{height:.6rem;background:color-mix(in srgb,var(--studio-line) 45%,var(--studio-canvas));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--studio-line) 55%,transparent)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__bar-fill{background:linear-gradient(90deg,var(--studio-blue),color-mix(in srgb,var(--studio-blue) 55%,var(--studio-gold)));box-shadow:0 0 10px color-mix(in srgb,var(--studio-blue) 30%,transparent);transition:width .45s cubic-bezier(.2,.8,.3,1)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__bar-row--second .swishiq-pair-profile__bar-fill{background:linear-gradient(90deg,var(--studio-gold),color-mix(in srgb,var(--studio-gold) 60%,var(--court-on-accent)));box-shadow:0 0 10px color-mix(in srgb,var(--studio-gold) 30%,transparent)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__bar-row > strong{font-size:1rem}
.studio-native.swishiq-studio-page .swishiq-pair-profile__summary-card{border-color:color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:.9rem;background:linear-gradient(145deg,var(--studio-surface),var(--studio-canvas))}
.studio-native.swishiq-studio-page .swishiq-pair-profile__summary-card--roles{border-top-color:var(--studio-gold)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__summary-card--boundary{border-top-color:color-mix(in srgb,var(--studio-gold) 55%,transparent)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__summary-card > strong{color:var(--studio-gold)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__details{border-color:color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:.9rem;background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-pair-profile__details > summary{color:var(--studio-gold);font-family:var(--font-mono);font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;transition:color .2s ease}
.studio-native.swishiq-studio-page .swishiq-pair-profile__details > summary:hover{color:var(--studio-accent-strong)}

/* Roster explorer --------------------------------------------------------- */
.studio-native.swishiq-studio-page .swishiq-advanced-field,.studio-native.swishiq-studio-page .swishiq-chemistry-lab__filter-grid .swishiq-advanced-field{border-color:color-mix(in srgb,var(--studio-line) 85%,transparent);border-radius:.7rem;background:var(--studio-surface)}
.studio-native.swishiq-studio-page .swishiq-advanced-field > span{color:var(--studio-gold);font-family:var(--font-mono);font-size:.6rem;letter-spacing:.12em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-advanced-field input,.studio-native.swishiq-studio-page .swishiq-advanced-field select{border-color:color-mix(in srgb,var(--studio-line) 85%,transparent);border-radius:.55rem;background:var(--studio-raised);transition:border-color .2s ease,box-shadow .2s ease}
.studio-native.swishiq-studio-page .swishiq-advanced-field input:focus,.studio-native.swishiq-studio-page .swishiq-advanced-field select:focus{border-color:color-mix(in srgb,var(--studio-gold) 55%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--studio-gold) 12%,transparent)}
.studio-native.swishiq-studio-page .swishiq-advanced-table-wrap{border-color:color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:.9rem;background:var(--studio-surface)}
.studio-native.swishiq-studio-page .swishiq-advanced-table thead{background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-advanced-table tbody tr:nth-child(even){background:color-mix(in srgb,var(--studio-raised) 28%,transparent)}
.studio-native.swishiq-studio-page .swishiq-advanced-table tbody tr:hover{background:color-mix(in srgb,var(--studio-gold) 7%,var(--studio-surface))}
.studio-native.swishiq-studio-page .swishiq-table-sort{color:var(--studio-muted);font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase;transition:color .2s ease}
.studio-native.swishiq-studio-page .swishiq-table-sort:hover,.studio-native.swishiq-studio-page .swishiq-table-sort[aria-sort] {color:var(--studio-gold)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__roster-pager{align-items:center}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__roster-page-status{color:var(--studio-muted);font-family:var(--font-mono);font-size:.68rem;letter-spacing:.08em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__roster-status,.studio-native.swishiq-studio-page .swishiq-table-source-note{color:var(--studio-muted);font-size:.72rem;line-height:1.5}

/* Observed combination cards --------------------------------------------- */
.studio-native.swishiq-studio-page .swishiq-chemistry-combination{border-color:color-mix(in srgb,var(--studio-line) 75%,transparent);border-radius:1.1rem;box-shadow:0 8px 22px hsl(var(--background)/.22)}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination:hover{border-color:color-mix(in srgb,var(--studio-gold) 45%,transparent);box-shadow:0 14px 32px hsl(var(--background)/.38)}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__heading h3,.studio-native.swishiq-studio-page .swishiq-chemistry-combination-explorer__heading h3{font-size:clamp(1.5rem,2.8vw,2rem)}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__kind{border-color:color-mix(in srgb,var(--studio-gold) 50%,transparent);color:var(--studio-gold);background:color-mix(in srgb,var(--studio-gold) 10%,transparent);font-family:var(--font-mono);font-size:.6rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__provenance{border-color:color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:.9rem;background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__provenance > summary{color:var(--studio-gold);font-family:var(--font-mono);font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__player-averages dt{color:var(--studio-muted);font-family:var(--font-mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__player-averages strong{color:var(--studio-gold);font-family:var(--font-display);font-size:1.15rem;font-weight:400;letter-spacing:.05em}
.studio-native.swishiq-studio-page .swishiq-chemistry-combination__note,.studio-native.swishiq-studio-page .swishiq-chemistry-combination__sample{color:var(--studio-muted);font-size:.72rem;line-height:1.5}

/* Challenge, status and notices ------------------------------------------ */
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__challenge,.studio-native.swishiq-studio-page .swishiq-chemistry-lab__observed-challenge{border:1px solid color-mix(in srgb,var(--studio-line) 80%,transparent);border-radius:1rem;padding:1.15rem;background:var(--studio-canvas)}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__challenge h4{font-family:var(--font-display);font-size:1.25rem;font-weight:400;letter-spacing:.05em;text-transform:uppercase}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__challenge-choices{gap:.6rem}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__challenge-choices button{min-height:2.9rem;border-radius:.7rem;font-weight:600;transition:background .2s ease,border-color .2s ease,filter .2s ease}
.studio-native.swishiq-studio-page .swishiq-advanced-status{color:var(--studio-muted);font-size:.75rem}
.studio-native.swishiq-studio-page .swishiq-advanced-notice{border-color:color-mix(in srgb,var(--studio-gold) 40%,transparent);border-radius:.8rem;color:var(--studio-gold);background:color-mix(in srgb,var(--studio-gold) 8%,transparent);font-size:.75rem;line-height:1.5}
.studio-native.swishiq-studio-page .swishiq-advanced-notice--error{border-color:color-mix(in srgb,var(--court-trim) 45%,transparent);color:color-mix(in srgb,var(--court-trim) 85%,var(--studio-ink));background:color-mix(in srgb,var(--court-trim) 9%,transparent)}

/* Responsive rhythm -------------------------------------------------------- */
@container(min-width:64rem){.studio-native.swishiq-studio-page .swishiq-pair-profile__metric-grid{gap:.8rem}.studio-native.swishiq-studio-page .swishiq-pair-profile__identities{gap:1.25rem}}
@container(max-width:34rem){.studio-native.swishiq-studio-page .swishiq-chemistry-lab__view-chooser{grid-template-columns:minmax(0,1fr)}.studio-native.swishiq-studio-page .swishiq-pair-profile__summary-card,.studio-native.swishiq-studio-page .swishiq-pair-profile__workload{grid-template-columns:repeat(2,minmax(0,1fr))}.studio-native.swishiq-studio-page .swishiq-pair-profile__identity{padding:.85rem}}
.studio-native.swishiq-studio-page .swishiq-chemistry-lab__workbench-evidence,.studio-native.swishiq-studio-page .swishiq-chemistry-lab__workbench-controls{min-width:0}
`;
export default chemistrySkin;