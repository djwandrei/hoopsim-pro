import React, { Suspense, useEffect, useRef } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import RouteFallback from '@/components/studio/RouteFallback';
import PageNotFound from '@/lib/PageNotFound';
import { APP_ROUTES } from '@/components/mobile/appRoutes';

function TabRoutes({ tab, active, outerPath, onPathChange, onPendingConsumed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const fullPath = location.pathname + location.search;
  const activeRef = useRef(active);
  activeRef.current = active;
  const prevPath = useRef(fullPath);

  // Bidirectional location sync: consume a pending deep link (outer → tab),
  // otherwise mirror the tab's location to the outer URL (tab → outer).
  useEffect(() => {
    if (!active) return;
    if (tab.pendingOuterPath) {
      const target = tab.pendingOuterPath;
      if (target !== fullPath) navigate(target);
      onPendingConsumed(tab.id);
      return;
    }
    if (fullPath !== outerPath) onPathChange(tab.id, location.pathname, fullPath, navigate);
  }, [active, fullPath, tab.pendingOuterPath, tab.id, outerPath, location.pathname, navigate, onPathChange, onPendingConsumed]);

  // Reset the scroll region when moving between pages inside the tab — but
  // never when the tab is merely being (re)activated, which restores scroll.
  useEffect(() => {
    if (prevPath.current !== fullPath) {
      prevPath.current = fullPath;
      if (activeRef.current) window.scrollTo(0, 0);
    }
  }, [fullPath]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {APP_ROUTES.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
}

// One persisted tab view: its own memory-routed copy of the app's routes.
// The view stays mounted (hidden by its parent) so scroll positions and all
// sub-navigation state survive switching to another tab.
export default function KeepAliveTab({ tab, active, outerPath, onPathChange, onPendingConsumed }) {
  return (
    <MemoryRouter initialEntries={[tab.entry || tab.to]} initialIndex={0}>
      <TabRoutes
        tab={tab}
        active={active}
        outerPath={outerPath}
        onPathChange={onPathChange}
        onPendingConsumed={onPendingConsumed}
      />
    </MemoryRouter>
  );
}