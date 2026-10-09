// Route prefetch: hovering a link starts downloading the target workbench's
// lazy chunk immediately, so navigation arrives from cache instead of the
// network. Importers must reference the same module specifiers as
// src/components/mobile/appRoutes.jsx so Vite reuses the same chunks.
const ROUTE_CHUNKS = [
  ['/sims/season', () => import('@/pages/SeasonLab')],
  ['/sims/game', () => import('@/pages/GameLab')],
  ['/sims/franchise', () => import('@/pages/FranchiseLab')],
  ['/sims', () => import('@/pages/SimsHub')],
  ['/daily-games/fix-the-five', () => import('@/pages/FixTheFive')],
  ['/daily-games/draft-night', () => import('@/pages/DraftNight')],
  ['/daily-games', () => import('@/pages/DailyGames')],
  ['/lineup-lab', () => import('@/pages/LineupLab')],
  ['/tools/shared-result', () => import('@/pages/LineupSharedResult')],
  ['/forge-models', () => import('@/pages/ForgeModelCompare')],
  ['/forge', () => import('@/pages/ForgeLab')],
  ['/analytics/career', () => import('@/pages/CareerLab')],
  ['/analytics', () => import('@/pages/Analytics')],
  ['/players', () => import('@/pages/PlayerLab')],
  ['/chemistry', () => import('@/pages/ChemistryLab')],
  ['/real-book', () => import('@/pages/RealBook')],
  ['/book', () => import('@/pages/BookRoom')],
  ['/pool-mockup', () => import('@/pages/PoolRedesignMockup')],
  ['/collector', () => import('@/pages/CollectorCenter')],
  ['/matchups', () => import('@/pages/CardMatchups')],
  ['/packs', () => import('@/pages/VirtualPacks')],
  ['/playbook', () => import('@/pages/Playbook')],
  ['/workshop', () => import('@/pages/Workshop')],
  ['/account', () => import('@/pages/Account')],
].map(([prefix, load]) => ({ prefix, load }));

const started = new Set();

// Longest matching prefix wins, so grouped screens prefetch their own page.
export function prefetchRoute(path) {
  if (!path || started.has(path)) return;
  const chunk = ROUTE_CHUNKS.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  if (!chunk || started.has(chunk.prefix)) return;
  started.add(chunk.prefix);
  chunk.load().catch(() => started.delete(chunk.prefix));
}