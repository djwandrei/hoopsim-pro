import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import GaPageView from '@/components/GaPageView';
import { STANDALONE, SITE_BASE } from '@/lib/deployConfig';
import RouteFallback from '@/components/studio/RouteFallback';
import ErrorBoundary from '@/components/ErrorBoundary';
// Mobile-responsive layout route: plain passthrough on the web, keep-alive
// bottom-tab shell inside a mobile WebView.
import Layout from '@/components/Layout';
// Route code-splitting: the studio home stays eager; every workbench and
// daily game loads on first visit so the landing paint stays light. The
// shared route list feeds both the web router and the mobile tab views.
import { APP_ROUTES } from '@/components/mobile/appRoutes';

// Public studio: no login gate — every route is open. On the site the router
// lives under /tools/swishiq-studio/ so existing site links keep working.
function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router basename={STANDALONE && SITE_BASE ? SITE_BASE : undefined}>
          <ScrollToTop />
          <GaPageView />
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/*" element={<Layout />}>
              {APP_ROUTES.map(({ path, element }) => (
                <Route key={path} path={path.replace(/^\/+/, '')} element={element} />
              ))}
            </Route>
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
