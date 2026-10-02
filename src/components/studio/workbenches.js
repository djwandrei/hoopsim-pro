import { Users, FlaskConical, Swords, Zap, CalendarRange, LineChart, Disc3 } from 'lucide-react';
export const WORKBENCHES = [
  { path: '/players', icon: Users, title: 'Player Blueprint', tag: 'PROFILE & COMPARE', description: 'Compare four exact-season profiles, explore real portraits and awards, and play the scouting challenge.', flow: 'Roster → Compare → Scout' },
  { path: '/chemistry', icon: FlaskConical, title: 'Chemistry Lab', tag: 'LINEUP ANALYSIS', description: 'Compare five player profiles with clear sample sizes and evidence limits.', flow: 'Roster → Selected five → Evidence' },
  { path: '/forge', icon: Swords, title: 'Composite Forge', tag: 'BUILD & REVIEW', description: 'Blend two team profiles, review the recipe, and test a local league scenario.', flow: 'Donors → Recipe → League tour' },
  { path: '/game', icon: Zap, title: 'Game Lab', tag: 'MATCHUP SIMULATION', description: 'Set the matchup, review decisions, and replay games or series from a seed.', flow: 'Setup → Review → Results' },
  { path: '/season', icon: CalendarRange, title: 'Season Lab', tag: 'SEASON REPLAYS', description: 'Explore standings, game tape, and season history from repeated simulations.', flow: 'Setup → Replays → Dashboard' },
  { path: '/career', icon: LineChart, title: 'Career Lab', tag: 'RECORDED CAREER HISTORY', description: 'Follow observed seasons and team stints across the original pooled 2017–26 archive.', flow: 'Player → Career path → History' },
  { path: '/spin', icon: Disc3, title: 'Spin Room', tag: 'ROLE DRAFT & DISCOVERY', description: 'Build a seeded player pool, set exclusions, and reveal repeatable no-repeat picks.', flow: 'Pool → Draw → Selection' },
];