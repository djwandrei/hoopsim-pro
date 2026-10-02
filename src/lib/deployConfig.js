// Deployment mode configuration.
// - Base44 preview/dev (default): data and native studio assets load through
//   the swishiqSeasonSource relay so cross-origin reads work.
// - Standalone site build (VITE_STANDALONE=true): the app runs on the DJHC
//   site itself at /tools/swishiq-studio/, so everything loads same-origin
//   with no server code required.
export const STANDALONE = import.meta.env.VITE_STANDALONE === 'true';

// The studio's path on the live site (matches the current SwishIQ Studio URL).
export const SITE_BASE = '/tools/swishiq-studio';

// The site's public origin; same-origin when self-hosted there.
export const SITE_ORIGIN = 'https://www.djshouseofcards-comics.com';