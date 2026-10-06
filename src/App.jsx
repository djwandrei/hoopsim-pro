import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { STANDALONE, SITE_BASE } from '@/lib/deployConfig';
import RouteFallback from '@/components/studio/RouteFallback';
// Add page imports here
// Route code-splitting: the studio home stays eager; every workbench and
// daily game loads on first visit so the landing paint stays light.
import StudioHome from '@/pages/StudioHome';
const SeasonLab = lazy(() => import('@/pages/SeasonLab'));
const PlayerLab = lazy(() => import('@/pages/PlayerLab'));
const ChemistryLab = lazy(() => import('@/pages/ChemistryLab'));
const ForgeLab = lazy(() => import('@/pages/ForgeLab'));
const GameLab = lazy(() => import('@/pages/GameLab'));
const CareerLab = lazy(() => import('@/pages/CareerLab'));
const SpinRoom = lazy(() => import('@/pages/SpinRoom'));
const BookRoom = lazy(() => import('@/pages/BookRoom'));
const FixTheFive = lazy(() => import('@/pages/FixTheFive'));
const DraftNight = lazy(() => import('@/pages/DraftNight'));
const LineupLab = lazy(() => import('@/pages/LineupLab'));
const LineupSharedResult = lazy(() => import('@/pages/LineupSharedResult'));
const PoolRedesignMockup = lazy(() => import('@/pages/PoolRedesignMockup'));
const CardMatchups = lazy(() => import('@/pages/CardMatchups'));
const VirtualPacks = lazy(() => import('@/pages/VirtualPacks'));
const Workshop = lazy(() => import('@/pages/Workshop'));
const Account = lazy(() => import('@/pages/Account'));

// Public studio: no login gate — every route is open. On the site the router
// lives under /tools/swishiq-studio/ so existing site links keep working.
function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router basename={STANDALONE ? SITE_BASE : undefined}>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Add your page Route elements here */}
            <Route path="/" element={<StudioHome />} />
            <Route path="/season" element={<SeasonLab />} />
            <Route path="/players/*" element={<PlayerLab />} />
            <Route path="/chemistry" element={<ChemistryLab />} />
            <Route path="/forge" element={<ForgeLab />} />
            <Route path="/game" element={<GameLab />} />
            <Route path="/career" element={<CareerLab />} />
            <Route path="/spin" element={<SpinRoom />} />
            <Route path="/book" element={<BookRoom />} />
            <Route path="/fix-the-five" element={<FixTheFive />} />
            <Route path="/draft-night" element={<DraftNight />} />
            <Route path="/lineup-lab" element={<LineupLab />} />
            <Route path="/tools/shared-result" element={<LineupSharedResult />} />
            <Route path="/pool-mockup" element={<PoolRedesignMockup />} />
            <Route path="/matchups" element={<CardMatchups />} />
            <Route path="/packs" element={<VirtualPacks />} />
            <Route path="/workshop" element={<Workshop />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          </Suspense>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App