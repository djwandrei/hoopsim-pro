import { STANDALONE, SITE_BASE } from '@/lib/deployConfig';
// Standalone site build serves the logos from the site's own asset directory;
// the Base44 preview serves the bundled copies.
const LOGO_BASE = STANDALONE ? '/assets/nba-logos/' : '/studio-assets/nba-logos/';
const FILES = { ATL:'retro-opaque/atlanta-hawks', BKN:'brooklyn-nets', BOS:'boston-celtics', CHA:'retro-opaque/charlotte-hornets', CHI:'chicago-bulls', CLE:'retro-opaque/cleveland-cavaliers', DAL:'dallas-mavericks', DEN:'retro-opaque/denver-nuggets', DET:'retro-opaque/detroit-pistons', GSW:'golden-state-warriors', HOU:'retro-opaque/houston-rockets', IND:'indiana-pacers', LAC:'los-angeles-clippers', LAL:'los-angeles-lakers', MEM:'retro-opaque/memphis-grizzlies', MIA:'miami-heat', MIL:'milwaukee-bucks', MIN:'retro-opaque/minnesota-timberwolves', NOP:'new-orleans-pelicans', NYK:'new-york-knicks', OKC:'oklahoma-city-thunder', ORL:'retro-opaque/orlando-magic', PHI:'philadelphia-76ers', PHX:'retro-opaque/phoenix-suns', POR:'portland-trail-blazers', SAC:'sacramento-kings', SAS:'retro-opaque/san-antonio-spurs', TOR:'retro-opaque/toronto-raptors', UTA:'retro-opaque/utah-jazz', WAS:'retro-opaque/washington-wizards' };
export const teamAsset = code => FILES[code] ? `${LOGO_BASE}${FILES[code]}.png` : null;
export const STUDIO_EMBLEM = STANDALONE ? '/assets/games/swishiq-studio-emblem-20260913.png' : '/studio-assets/games/swishiq-studio-emblem-20260913.png';
// Forge silhouette art ships with the studio build: on the site it lives
// under the studio root (/tools/swishiq-studio/studio-assets/forge/).
export const forgeSilhouette = mode =>
  `${STANDALONE ? SITE_BASE : ''}/studio-assets/forge/basketball-silhouette-${mode}.png`;
export const playerAsset = path => /^\/assets\/player-headshots\/(nba|nba-no-background)\/[a-z0-9._-]+\.(webp|png|jpg|jpeg)$/i.test(path || '') ? (STANDALONE ? path : `https://www.djshouseofcards-comics.com${path}`) : null;