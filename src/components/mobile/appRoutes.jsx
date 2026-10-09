import React, { lazy } from 'react';
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
const Playbook = lazy(() => import('@/pages/Playbook'));
const ForgeModelCompare = lazy(() => import('@/pages/ForgeModelCompare'));
const RealBook = lazy(() => import('@/pages/RealBook'));
const FranchiseLab = lazy(() => import('@/pages/FranchiseLab'));
const DailyGames = lazy(() => import('@/pages/DailyGames'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const CollectorCenter = lazy(() => import('@/pages/CollectorCenter'));
const SimsHub = lazy(() => import('@/pages/SimsHub'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const OAuthConsent = lazy(() => import('@/pages/OAuthConsent'));

// Single source of truth for the app's page routes. src/App.jsx renders this
// list on the web; the mobile keep-alive tab layout re-renders the same list
// inside each preserved tab view (see src/components/Layout.jsx).
export const APP_ROUTES = [
  { path: '/', element: <StudioHome /> },
  { path: '/sims', element: <SimsHub /> },
  { path: '/sims/season', element: <SeasonLab /> },
  { path: '/sims/game', element: <GameLab /> },
  { path: '/sims/franchise', element: <FranchiseLab /> },
  { path: '/analytics', element: <Analytics /> },
  { path: '/players/*', element: <PlayerLab /> },
  { path: '/chemistry', element: <ChemistryLab /> },
  { path: '/forge', element: <ForgeLab /> },
  { path: '/forge-models', element: <ForgeModelCompare /> },
  { path: '/analytics/career', element: <CareerLab /> },
  { path: '/spin', element: <SpinRoom /> },
  { path: '/book', element: <BookRoom /> },
  { path: '/real-book', element: <RealBook /> },
  { path: '/daily-games', element: <DailyGames /> },
  { path: '/daily-games/fix-the-five', element: <FixTheFive /> },
  { path: '/daily-games/draft-night', element: <DraftNight /> },
  { path: '/lineup-lab', element: <LineupLab /> },
  { path: '/tools/shared-result', element: <LineupSharedResult /> },
  { path: '/pool-mockup', element: <PoolRedesignMockup /> },
  { path: '/collector', element: <CollectorCenter /> },
  { path: '/matchups', element: <CardMatchups /> },
  { path: '/packs', element: <VirtualPacks /> },
  { path: '/playbook', element: <Playbook /> },
  { path: '/workshop', element: <Workshop /> },
  { path: '/account', element: <Account /> },
  // Keep the legacy auth URLs reachable while the storefront owns identity.
  // These pages are explicit handoffs and never create a second Studio login.
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/oauth-consent', element: <OAuthConsent /> },
];
