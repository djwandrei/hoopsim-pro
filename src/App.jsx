import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import StudioHome from '@/pages/StudioHome';
import SeasonLab from '@/pages/SeasonLab';
import PlayerLab from '@/pages/PlayerLab';
import ChemistryLab from '@/pages/ChemistryLab';
import ForgeLab from '@/pages/ForgeLab';
import GameLab from '@/pages/GameLab';
import CareerLab from '@/pages/CareerLab';
import SpinRoom from '@/pages/SpinRoom';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<StudioHome />} />
      <Route path="/season" element={<SeasonLab />} />
      <Route path="/players" element={<PlayerLab />} />
      <Route path="/chemistry" element={<ChemistryLab />} />
      <Route path="/forge" element={<ForgeLab />} />
      <Route path="/game" element={<GameLab />} />
      <Route path="/career" element={<CareerLab />} />
      <Route path="/spin" element={<SpinRoom />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App