import { Users, FlaskConical, Swords, Zap, CalendarRange, LineChart, Disc3 } from 'lucide-react';
const EMBLEMS = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/assets/workbench-icons/';
export const WORKBENCHES = [
  { path: '/players', icon: Users, emblem: `${EMBLEMS}player-blueprint-icon.webp`, title: 'Player Blueprint', tag: 'ATLAS & DOSSIERS', description: 'Scope the interactive league charts, then pin players to open their full observed dossiers.', flow: 'Atlas → Scope → Dossier', children: [{ path: '/players', title: 'League Atlas' }, { path: '/players/dossier', title: 'Player Dossier' }] },
  { path: '/chemistry', icon: FlaskConical, emblem: `${EMBLEMS}chemistry-lab-icon.webp`, title: 'Chemistry Lab', tag: 'PAIR & LINEUP ANALYSIS', description: 'Compare a pair, play the challenge, and explore real shared-floor and exact-five combinations.', flow: 'Pair → Challenge → Combinations' },
  { path: '/forge', icon: Swords, emblem: `${EMBLEMS}composite-forge-icon.webp`, title: 'Composite Forge', tag: 'BUILD & REVIEW', description: 'Choose real player-season skill donors, build your player, and save or replay the source-backed recipe.', flow: 'Player examples → Skills → Build' },
  { path: '/game', icon: Zap, emblem: `${EMBLEMS}game-lab-icon.webp`, title: 'Game Lab', tag: 'MATCHUP SIMULATION', description: 'Play the original single-game, series and campaign challenges with adaptive trials and seeded replay.', flow: 'Matchup → Make your call → Replay' },
  { path: '/season', icon: CalendarRange, emblem: `${EMBLEMS}season-lab-icon.webp`, title: 'Season Lab', tag: 'SEASON REPLAYS', description: 'Replay the real schedule, review the fixed 16-team postseason, and follow the original season history.', flow: 'Schedule → Replay → Season history' },
  { path: '/career', icon: LineChart, emblem: `${EMBLEMS}career-lab-icon.webp`, title: 'Career Lab', tag: 'RECORDED CAREER HISTORY', description: 'Follow observed seasons and team stints across the original pooled 2017–26 archive.', flow: 'Player → Career path → History' },
  { path: '/spin', icon: Disc3, emblem: `${EMBLEMS}spin-room-icon.webp`, title: 'Spin Room', tag: 'ROLE DRAFT & DISCOVERY', description: 'Build a seeded player pool, set exclusions, and reveal repeatable no-repeat picks.', flow: 'Pool → Draw → Selection' },
];

// Daily games live outside the SwishIQ workbench system: not in the studio
// sidebar or index — reachable from the site header drawer instead.
const GAME_ASSETS = 'https://www.djshouseofcards-comics.com/assets/games/';
export const DAILY_GAMES = [
  { path: '/fix-the-five', emblem: `${GAME_ASSETS}fix-the-five-emblem-20260911.png`, title: 'Fix the Five', tag: 'DAILY ROTATION REPAIR', description: 'Repair five exact-season starting fives by swapping in legal replacements, verified by the original private evaluator.', flow: 'Board → Swap call → Verified rank' },
  { path: '/draft-night', emblem: `${GAME_ASSETS}draft-night-emblem-20260911.png`, title: 'Draft Night', tag: 'DAILY FIVE-ROUND DRAFT', description: 'Draft one player from each of five team rounds, then reveal one verified cross-team impact result.', flow: 'Rounds → Lock draft → Verified rank' },
  { path: '/lineup-lab', emblem: `${GAME_ASSETS}lineup-lab-emblem-20260911.png`, title: 'NBA Lineup Lab', tag: 'LINEUP & ROTATION OPTIMIZER', description: 'Pick a team-season, set the game plan, and run the exact optimizer to rank lineups, rotations, and one-player tradeoffs.', flow: 'Team & season → Game plan → Build' },
];