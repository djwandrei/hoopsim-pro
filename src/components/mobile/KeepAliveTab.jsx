import React, { Suspense, useLayoutEffect, useRef } from 'react';
import { Route, Routes } from 'react-router-dom';
import RouteFallback from '@/components/studio/RouteFallback';
import PageNotFound from '@/lib/PageNotFound';
import { APP_ROUTES } from '@/components/mobile/appRoutes';

// Routes can render a saved location without creating a second router.
// Links and Back still use the single app-level browser history.
export default function KeepAliveTab({ location, active }) {
  const viewRef = useRef(null);
  const scrollPositions = useRef(new Map());
  const path = location.pathname + location.search;
  const previousPath = useRef(path);

  useLayoutEffect(() => {
    if (!active) return;
    if (previousPath.current !== path) {
      previousPath.current = path;
      scrollPositions.current.clear();
      viewRef.current?.querySelectorAll('.webview-scroll').forEach(node => { node.scrollTop = 0; });
      return;
    }
    scrollPositions.current.forEach(([top, left], node) => {
      if (node.isConnected) { node.scrollTop = top; node.scrollLeft = left; }
    });
  }, [active, path]);

  return (
    <div ref={viewRef} hidden={!active} aria-hidden={!active} className="h-full min-h-0"
      onScrollCapture={event => {
        if (active) scrollPositions.current.set(event.target, [event.target.scrollTop, event.target.scrollLeft]);
      }}>
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          {APP_ROUTES.map(({ path: routePath, element }) => (
            <Route key={routePath} path={routePath} element={element} />
          ))}
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}