import { Users, FlaskConical, Swords, Zap, CalendarRange, LineChart, Disc3, Banknote, IdCard, PackageOpen, BookOpen, Trophy, Gamepad2, Dices } from 'lucide-react';
import { studioAsset } from '@/components/studio/teamAssets';
const EMBLEMS = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/assets/workbench-icons/';
const GAME_ASSETS = 'https://www.djshouseofcards-comics.com/assets/games/';
export const WORKBENCHES = [
  { path: '/analytics', icon: LineChart, title: 'Analytics & Analysis', tag: 'PLAYER & LINEUP ANALYSIS', description: 'One desk for the analysis suite: player blueprints, chemistry between players, the full lineup optimizer, and recorded career history.', flow: 'Hub → Pick a tool → Analyze', children: [
    { path: '/players', icon: Users, emblem: `${EMBLEMS}player-blueprint-icon.webp`, title: 'Player Blueprint', tag: 'ATLAS & DOSSIERS', description: 'Scope the interactive league charts, then pin players to open their full observed dossiers.', flow: 'Atlas → Scope → Dossier' },
    { path: '/chemistry', icon: FlaskConical, emblem: `${EMBLEMS}chemistry-lab-icon.webp`, title: 'Chemistry Lab', tag: 'PAIR & LINEUP ANALYSIS', description: 'Compare a pair, play the challenge, and explore real shared-floor and exact-five combinations.', flow: 'Pair → Challenge → Combinations' },
    { path: '/lineup-lab', icon: LineChart, emblem: `${GAME_ASSETS}lineup-lab-emblem-20260911.png`, title: 'NBA Lineup Lab', tag: 'LINEUP & ROTATION OPTIMIZER', description: 'Pick a team-season, set the game plan, and run the exact optimizer to rank lineups, rotations, and one-player tradeoffs.', flow: 'Team & season → Game plan → Build' },
    { path: '/analytics/career', icon: LineChart, emblem: `${EMBLEMS}career-lab-icon.webp`, title: 'Career Lab', tag: 'RECORDED CAREER HISTORY', description: 'Follow observed seasons and team stints across the original pooled 2017–26 archive.', flow: 'Player → Career path → History' },
  ] },
  { path: '/collector', icon: PackageOpen, title: 'Collector Center', tag: 'CARDS & PACKS', description: 'One desk for the collector suite: search the live catalog by player, or replay a seeded simulated pack draw.', flow: 'Hub → Pick a tool → Collect', children: [
    { path: '/matchups', icon: IdCard, emblem: 'https://www.djshouseofcards-comics.com/assets/games/card-matchups-emblem-20260911.png', title: 'Player & Cards', tag: 'COLLECTOR SEARCH', description: 'Search the live collector catalog for cards tied to verified NBA players, then browse every catalog card.', flow: 'Search → Player match → Browse' },
    { path: '/packs', icon: PackageOpen, emblem: studioAsset('virtual-packs-emblem-20261007.png'), title: 'Virtual Packs', tag: 'SEEDED PACK SIMULATION', description: 'Declare an eligible card pool from verified player matches and replay a deterministic simulated pack draw — simulation only, no purchase.', flow: 'Find cards → Pool → Seeded draw' },
  ] },
  { path: '/daily-games', icon: Gamepad2, title: 'Daily Games', tag: 'DAILY VERIFIED GAMES', description: 'One desk for both verified daily games: repair a starting five or draft a five-round roster — each scored blind, then revealed once by the SwishIQ evaluator.', flow: 'Hub → Pick a game → Verified rank', children: [
    { path: '/daily-games/fix-the-five', emblem: `${GAME_ASSETS}fix-the-five-emblem-20260911.png`, title: 'Fix the Five' },
    { path: '/daily-games/draft-night', emblem: `${GAME_ASSETS}draft-night-emblem-20260911.png`, title: 'Draft Night' },
  ] },
  { path: '/sims', icon: Dices, title: 'Sims & What-ifs', tag: 'SEASON · GAME · FRANCHISE', description: 'One desk for the simulation suite: replay the real season, play matchup and series challenges, or run a full franchise control room.', flow: 'Hub → Pick a sim → Play it out', children: [
    { path: '/sims/game', icon: Zap, emblem: `${EMBLEMS}game-lab-icon.webp`, title: 'Game Lab', tag: 'MATCHUP SIMULATION', description: 'Play the original single-game, series and campaign challenges with adaptive trials and seeded replay.', flow: 'Matchup → Make your call → Replay' },
    { path: '/sims/season', icon: CalendarRange, emblem: `${EMBLEMS}season-lab-icon.webp`, title: 'Season Lab', tag: 'SEASON REPLAYS', description: 'Replay the real schedule, review the fixed 16-team postseason, and follow the original season history.', flow: 'Schedule → Replay → Season history' },
    { path: '/sims/franchise', icon: Trophy, emblem: studioAsset('franchise-lab-emblem-20261008.png'), title: 'Franchise Lab', tag: 'FRANCHISE CONTROL ROOM', description: 'Load a pinned exact-season scenario, control your team\'s rotation, and play the schedule out game by game.', flow: 'Source → Rotation → Season' },
  ] },
  { path: '/forge', icon: Swords, emblem: `${EMBLEMS}composite-forge-icon.webp`, title: 'Composite Forge', tag: 'BUILD & REVIEW', description: 'Choose real player-season skill donors, build your player, and save or replay the source-backed recipe.', flow: 'Player examples → Skills → Build' },
  { path: '/spin', icon: Disc3, emblem: `${EMBLEMS}spin-room-icon.webp`, title: 'Spin Room', tag: 'ROLE DRAFT & DISCOVERY', description: 'Build a seeded player pool, set exclusions, and reveal repeatable no-repeat picks.', flow: 'Pool → Draw → Selection' },
  { path: '/book', icon: Banknote, emblem: studioAsset('games/swishiq-studio-emblem-20260913.png'), title: 'Sportsbook', tag: 'PLAY-MONEY TRACKER', description: 'Track a browser-local play-money balance and ledger, with a daily simulated bonus. Odds, credit purchases, and settlement await the planned backend.', flow: 'Daily bonus → Local ledger · Odds backend planned' },
  { path: '/playbook', icon: BookOpen, emblem: studioAsset('playbook-emblem-20261007.png'), title: 'Playbook', tag: 'INTERACTIVE PLAY ANIMATION', description: 'Learn plays, sets and schemes on an animated half court: labelled players run each step while the who, the what and the why are narrated.', flow: 'Library → Animate → Steps' },
];

// The Daily Games desk and its two verified games. Lineup Lab is deliberately
// not a daily game — it lives in the workbench system above.
export const DAILY_GAMES = [
  {
    path: '/daily-games', icon: Gamepad2, title: 'Daily Games', tag: 'DAILY VERIFIED GAMES',
    description: 'One desk for both verified daily games: repair a starting five or draft a five-round roster — each scored blind, then revealed once by the SwishIQ evaluator.',
    flow: 'Hub → Pick a game → Verified rank',
    children: [
      { path: '/daily-games/fix-the-five', emblem: `${GAME_ASSETS}fix-the-five-emblem-20260911.png`, title: 'Fix the Five', tag: 'DAILY ROTATION REPAIR', description: 'Repair five exact-season starting fives by swapping in legal replacements, verified by the original private evaluator.', flow: 'Board → Swap call → Verified rank' },
      { path: '/daily-games/draft-night', emblem: `${GAME_ASSETS}draft-night-emblem-20260911.png`, title: 'Draft Night', tag: 'DAILY FIVE-ROUND DRAFT', description: 'Draft one player from each of five team rounds, then reveal its verified exact-season ranking.', flow: 'Rounds → Lock draft → Verified rank' },
    ],
  },
];
// The two games themselves — the today's-call rotation and the site drawer.
export const DAILY_GAMES_ROUTES = DAILY_GAMES[0].children;

// Resolve a route to the studio tool that owns it. A child (tool screen)
// wins over its parent workbench, and the parent carries the sidebar index.
export function findStudioTool(pathname) {
  const allTools = [...WORKBENCHES, ...DAILY_GAMES];
  const match = tool => pathname === tool.path || pathname.startsWith(`${tool.path}/`);
  for (const [index, workbench] of allTools.entries()) {
    const child = (workbench.children ?? []).find(match);
    if (child) return { tool: child, workbench, index };
  }
  const index = allTools.findIndex(match);
  return index === -1 ? undefined : { tool: allTools[index], workbench: allTools[index], index };
}
