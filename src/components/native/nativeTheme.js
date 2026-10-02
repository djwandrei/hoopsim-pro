const nativeTheme = `
:host{display:block;min-width:0;color:inherit;font-family:var(--font-body)}
.studio-native{--court-canvas:hsl(var(--background));--court-surface:hsl(var(--card));--court-raised:hsl(var(--secondary));--court-text:hsl(var(--foreground));--court-muted:hsl(var(--muted-foreground));--court-border:hsl(var(--border));--court-accent:hsl(var(--primary));--court-focus:hsl(var(--ring));--court-positive:hsl(var(--chart-3));--court-trim:hsl(var(--destructive));--court-on-accent:hsl(var(--primary-foreground));--studio-canvas:var(--court-canvas);--studio-surface:var(--court-surface);--studio-raised:var(--court-raised);--studio-ink:var(--court-text);--studio-text:var(--court-text);--studio-muted:var(--court-muted);--studio-line:hsl(var(--border)/.3);--studio-border:var(--studio-line);--studio-gold:var(--court-accent);--studio-accent:var(--court-accent);--studio-accent-strong:var(--court-focus);--studio-blue:hsl(var(--chart-2));--studio-shadow:0 8px 24px hsl(var(--background)/.18);--swishiq-canvas:var(--studio-canvas);--swishiq-surface:var(--studio-surface);--swishiq-raised:var(--studio-raised);--swishiq-text:var(--studio-ink);--swishiq-muted:var(--studio-muted);--swishiq-border:var(--studio-line);--swishiq-accent:var(--studio-accent);--swishiq-kicker:var(--studio-gold);--swishiq-team-primary:var(--studio-blue);--swishiq-team-highlight:var(--studio-gold);color:var(--studio-ink);background:var(--studio-canvas);color-scheme:inherit;min-width:0;max-width:100%;min-height:0;padding:0;margin:0;font-family:var(--font-body);container-type:inline-size}
.studio-native *{box-sizing:border-box}
.studio-native [hidden]{display:none!important}
.studio-native #studioApp.swishiq-app-shell{display:block;width:100%;max-width:none;min-width:0;margin:0;padding:0}
.swishiq-native-panel{display:block;width:100%;min-width:0;margin:0}
.studio-native :is(h1,h2,h3){font-family:var(--font-display);font-weight:400!important;letter-spacing:.035em!important;line-height:1.12!important;overflow-wrap:normal}
.studio-native :is(button,select,input,textarea){font-family:var(--font-body);color-scheme:inherit}
.studio-native :is(button,select,input,summary,a):focus-visible{outline:2px solid var(--court-focus);outline-offset:3px}
.studio-native :is(select,input:not([type=radio]):not([type=checkbox]),textarea){background:var(--studio-raised);color:var(--studio-ink);border-color:var(--studio-line);min-width:0;max-width:100%}
.studio-native :is(select,input:not([type=radio]):not([type=checkbox])){min-height:2.75rem}
.studio-native :is(input[type=radio],input[type=checkbox]){accent-color:var(--studio-gold)}
.studio-native :is(button,input,select):disabled{cursor:not-allowed;opacity:.5}
.studio-native img{max-width:100%}
.studio-native table{width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums}
.studio-native table th{background:var(--studio-surface);color:var(--studio-muted);font-family:var(--font-mono);font-size:.65rem;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid var(--studio-line);padding:.8rem .65rem;position:sticky;top:0;z-index:1}
.studio-native table td{padding:.75rem .65rem;border-bottom:1px solid color-mix(in srgb,var(--studio-line) 65%,transparent)}
.studio-native table tbody tr:nth-child(even){background:color-mix(in srgb,var(--studio-raised) 30%,transparent)}
.studio-native table tbody tr:hover{background:color-mix(in srgb,var(--studio-gold) 5%,var(--studio-surface))}
.studio-native [class*="table-wrap"]{max-width:100%;overflow:auto;overscroll-behavior:contain}
.studio-native a{color:var(--studio-gold)}
.studio-native ::-webkit-scrollbar{width:.45rem;height:.45rem}
.studio-native ::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--studio-muted) 30%,transparent);border-radius:1rem}
.studio-native [role=status]{font-variant-numeric:tabular-nums}
@media(prefers-reduced-motion:reduce){.studio-native *{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
export default nativeTheme;