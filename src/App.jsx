import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { STANDALONE, SITE_BASE } from '@/lib/deployConfig';
// Add page imports here
import StudioHome from '@/pages/StudioHome';
import SeasonLab from '@/pages/SeasonLab';
import PlayerLab from '@/pages/PlayerLab';
import ChemistryLab from '@/pages/ChemistryLab';
import ForgeLab from '@/pages/ForgeLab';
import GameLab from '@/pages/GameLab';
import CareerLab from '@/pages/CareerLab';
import SpinRoom from '@/pages/SpinRoom';

// Public studio: no login gate — every route is open. On the site the router
// lives under /tools/swishiq-studio/ so existing site links keep working.
function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router basename={STANDALONE ? SITE_BASE : undefined}>
          <ScrollToTop />
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
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App