export const SITE = 'https://www.djshouseofcards-comics.com';
export const FAN_TOOLS = [
  ['/tools/','Fan Tools','fan-tools-emblem-20260911.png'],
  ['/lineup-lab/','Lineup Lab','lineup-lab-emblem-20260911.png'],
  ['/tools/player-card-matchups/','Player & Cards','card-matchups-emblem-20260911.png'],
  ['/tools/virtual-pack-opening/','Virtual Packs','card-matchups-emblem-20260911.png'],
  ['/tools/workshop/','Workshop','workshop-emblem-20260911.png'],
  ['/tools/swishiq-studio/','SwishIQ Studio','swishiq-studio-emblem-20260913.png'],
].map(([path,label,asset])=>({path,label,href:SITE+path,emblem:`${SITE}/assets/games/${asset}`}));
export const FOOTER_GROUPS = [
  {title:'Browse',key:'browse',links:[['Sports Cards',SITE+'/sports-cards.html'],['Comics',SITE+'/comics.html'],['Collectibles',SITE+'/collectibles.html']]},
  {title:'Help & Policies',key:'support',links:[['Contact DJ',SITE+'/contact.html'],['Shipping',SITE+'/shipping.html'],['Returns',SITE+'/returns.html'],['Policies & Authenticity',SITE+'/policies.html']]},
  {title:'Shop & Follow',key:'storefronts',links:[['Facebook','https://www.facebook.com/DJCardsComics/'],['Whatnot','https://www.whatnot.com/user/djshouseofcards'],['Shopify','https://xy2hik-nq.myshopify.com/'],['TikTok Shop','https://www.tiktok.com/@djshouseofcards/shop']]},
];
export function teamLogo(palette) {
  if(palette.id==='djhc')return '';
  const retro=['atl','cha','cle','den','det','hou','mem','min','orl','phx','sas','tor','uta','was'].includes(palette.id);
  const slug=palette.team.toLowerCase().replace(/\s+/g,'-');
  return `${SITE}/assets/nba-logos/${retro ? 'retro-opaque/' : ''}${slug}.png`;
}