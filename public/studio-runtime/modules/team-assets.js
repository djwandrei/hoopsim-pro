const TEAM_LOGO_SLUGS = Object.freeze({
  ATL: 'atlanta-hawks',
  BOS: 'boston-celtics',
  BKN: 'brooklyn-nets',
  CHA: 'charlotte-hornets',
  CHI: 'chicago-bulls',
  CLE: 'cleveland-cavaliers',
  DAL: 'dallas-mavericks',
  DEN: 'denver-nuggets',
  DET: 'detroit-pistons',
  GSW: 'golden-state-warriors',
  HOU: 'houston-rockets',
  IND: 'indiana-pacers',
  LAC: 'los-angeles-clippers',
  LAL: 'los-angeles-lakers',
  MEM: 'memphis-grizzlies',
  MIA: 'miami-heat',
  MIL: 'milwaukee-bucks',
  MIN: 'minnesota-timberwolves',
  NOP: 'new-orleans-pelicans',
  NYK: 'new-york-knicks',
  OKC: 'oklahoma-city-thunder',
  ORL: 'orlando-magic',
  PHI: 'philadelphia-76ers',
  PHX: 'phoenix-suns',
  POR: 'portland-trail-blazers',
  SAC: 'sacramento-kings',
  SAS: 'san-antonio-spurs',
  TOR: 'toronto-raptors',
  UTA: 'utah-jazz',
  WAS: 'washington-wizards',
});

export function teamLogoAssetUrl(teamCode) {
  const code = String(teamCode || '').trim().toUpperCase();
  const slug = TEAM_LOGO_SLUGS[code];
  return slug ? new URL(`../../assets/nba-logos/${slug}.png`, import.meta.url).toString() : '';
}
