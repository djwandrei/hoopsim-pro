// Shared micro-helpers for the native franchise UI.
export const pillClass = kind => `frx-pill frx-pill--${kind === 'green' ? 'green' : kind === 'amber' ? 'amber' : kind === 'error' ? 'error' : kind === 'live' ? 'live' : 'slate'}`;

export const goldButton = 'inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-45';
export const ghostButton = 'inline-flex items-center gap-2 rounded-lg border border-border/50 bg-raised/40 px-3.5 py-2 text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-45';