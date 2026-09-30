import { Users, FlaskConical, Swords, Zap, CalendarRange, LineChart, Disc3 } from 'lucide-react';
export const WORKBENCHES = [
  { path: '/players', icon: Users, title: 'Player Blueprint', tag: 'PROFILE & COMPARE', description: 'Browse observed player records. Explore rates and conditional next-game scenarios.', flow: 'Roster → Profile → Scenario' },
  { path: '/chemistry', icon: FlaskConical, title: 'Chemistry Lab', tag: 'LINEUP ANALYSIS', description: 'Compare five player profiles with clear sample sizes and evidence limits.', flow: 'Roster → Selected five → Evidence' },
  { path: '/forge', icon: Swords, title: 'Composite Forge', tag: 'BUILD & REVIEW', description: 'Blend two team profiles, review the recipe, and test a local league scenario.', flow: 'Donors → Recipe → League tour' },
  { path: '/game', icon: Zap, title: 'Game Lab', tag: 'MATCHUP SIMULATION', description: 'Set the matchup, review decisions, and replay games or series from a seed.', flow: 'Setup → Review → Results' },
  { path: '/season', icon: CalendarRange, title: 'Season Lab', tag: 'SEASON REPLAYS', description: 'Explore standings, game tape, and season history from repeated simulations.', flow: 'Setup → Replays → Dashboard' },
  { path: '/career', icon: LineChart, title: 'Career Lab', tag: 'HISTORY & SCENARIOS', description: 'Keep recorded season evidence separate from conditional aging scenarios.', flow: 'Player → Evidence → Scenario' },
  { path: '/spin', icon: Disc3, title: 'Spin Room', tag: 'ROLE DRAFT & DISCOVERY', description: 'Build a seeded player pool, set exclusions, and reveal repeatable no-repeat picks.', flow: 'Pool → Draw → Selection' },
];