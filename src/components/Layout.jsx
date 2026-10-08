import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useMobileWebView from '@/hooks/useMobileWebView';
import { MobileTabsContext } from '@/components/mobile/mobileTabsContext';
import { MOBILE_TABS, tabForPath } from '@/components/mobile/mobileTabs';
import KeepAliveTab from '@/components/mobile/KeepAliveTab';

// Mobile-responsive layout route. On the regular web it renders the matched
// child route unchanged, so existing web functionality is preserved. Inside a
// mobile WebView it swaps in a keep-alive tab shell: one persisted view per
// bottom tab, hidden (display: none) rather than unmounted when inactive, so
// each tab keeps its scroll position and sub-navigation state.
export default function Layout() {
  const isWebView = useMobileWebView();
  const location = useLocation();
  const navigate = useNavigate();
  const fullPath = location.pathname + location.search;

  const [tabs, setTabs] = useState(() => {
    const owner = tabForPath(location.pathname);
    return MOBILE_TABS.map((t) => {
      const base = { ...t, visited: false, entry: null, pendingOuterPath: null, lastSyncedPath: null };
      if (owner && t.id === owner.id) {
        return { ...base, visited: true, entry: fullPath, pendingOuterPath: null, lastSyncedPath: fullPath };
      }
      return base;
    });
  });
  const [activeId, setActiveId] = useState(() => tabForPath(location.pathname)?.id ?? null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const expectOuter = useRef(null); // outer URL change caused by our own sync
  const scrollStore = useRef({}); // per-tab captured scroll positions

  // Record the active tab's scroll regions before its views get hidden.
  const captureScroll = useCallback(() => {
    const saved = [];
    document.querySelectorAll('.webview-scroll').forEach((el) => saved.push([el, el.scrollTop]));
    return saved;
  }, []);
  const restoreScroll = useCallback((saved) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (saved) saved.forEach(([el, top]) => { if (el.isConnected) el.scrollTop = top; });
    }));
  }, []);

  // Deep links and any outer URL change resolve to their owning tab.
  useEffect(() => {
    if (!isWebView) return;
    if (expectOuter.current) { expectOuter.current = null; return; }
    const owner = tabForPath(location.pathname);
    if (!owner) { setActiveId(null); return; }
    const current = tabsRef.current.find(t => t.id === owner.id);
    if (current?.visited && current.lastSyncedPath === fullPath && activeIdRef.current === owner.id) return;
    if (activeIdRef.current && activeIdRef.current !== owner.id) {
      scrollStore.current[activeIdRef.current] = captureScroll();
    }
    setTabs((prev) => prev.map((t) => {
      if (t.id !== owner.id) return t;
      if (!t.visited) return { ...t, visited: true, entry: fullPath, pendingOuterPath: null, lastSyncedPath: fullPath };
      if (t.lastSyncedPath && t.lastSyncedPath !== fullPath) return { ...t, pendingOuterPath: fullPath };
      return t;
    }));
    setActiveId(owner.id);
    restoreScroll(scrollStore.current[owner.id]);
  }, [isWebView, fullPath, location.pathname, captureScroll, restoreScroll]);

  const switchTab = useCallback((tabId, to) => {
    const from = activeIdRef.current;
    if (from && from !== tabId) scrollStore.current[from] = captureScroll();
    setTabs((prev) => prev.map((t) => (t.id === tabId && !t.visited
      ? { ...t, visited: true, entry: to || t.to, pendingOuterPath: null, lastSyncedPath: to || t.to }
      : t)));
    setActiveId(tabId);
    restoreScroll(scrollStore.current[tabId]);
  }, [captureScroll, restoreScroll]);

  // A tab navigated internally: mirror it to the outer URL, or hand the
  // request to the tab that owns the path.
  const handleTabPath = useCallback((tabId, tabPath, tabFullPath, tabNavigate) => {
    const owner = tabForPath(tabPath);
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, lastSyncedPath: tabFullPath, pendingOuterPath: null } : t)));
    if (!owner || owner.id === tabId) {
      expectOuter.current = tabFullPath;
      navigate(tabFullPath, { replace: true });
      return;
    }
    // Cross-tab link: undo the stray navigation, open it in the owning tab.
    const source = tabsRef.current.find(t => t.id === tabId);
    tabNavigate(source?.lastSyncedPath || source?.to || '/', { replace: true });
    switchTab(owner.id, tabFullPath);
  }, [navigate, switchTab]);

  const clearPending = useCallback((tabId) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, pendingOuterPath: null } : t)));
  }, []);

  const ctx = useMemo(() => ({ tabs, activeId, switchTab }), [tabs, activeId, switchTab]);

  if (!isWebView) return <Outlet />;

  return (
    <MobileTabsContext.Provider value={ctx}>
      {activeId == null ? <Outlet /> : tabs.filter((t) => t.visited).map((t) => (
        <div key={t.id} style={t.id === activeId ? undefined : { display: 'none' }}>
          <KeepAliveTab
            tab={t}
            active={t.id === activeId}
            outerPath={fullPath}
            onPathChange={handleTabPath}
            onPendingConsumed={clearPending}
          />
        </div>
      ))}
    </MobileTabsContext.Provider>
  );
}