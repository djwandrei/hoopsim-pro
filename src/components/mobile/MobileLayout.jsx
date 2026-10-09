import React, { useLayoutEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from '@/components/ui/image';
import useMobileWebView from '@/hooks/useMobileWebView';
import { MobileTabsContext } from '@/components/mobile/mobileTabsContext';
import useMobileTabViews from '@/components/mobile/useMobileTabViews';
import useTouchRefresh, { REFRESH_THRESHOLD } from '@/components/mobile/useTouchRefresh';
import KeepAliveTab from '@/components/mobile/KeepAliveTab';
import refreshStudioData from '@/components/mobile/refreshStudioData';
import { tabForPath } from '@/components/mobile/mobileTabs';
import MobileHeaderBrand from '@/components/mobile/MobileHeaderBrand';
import BottomTabBar from '@/components/djhc/BottomTabBar';
import SiteDrawer from '@/components/djhc/SiteDrawer';
import useSiteDrawer from '@/components/djhc/useSiteDrawer';
import ThemeToggle from '@/components/djhc/ThemeToggle';
import HeaderTeamMark from '@/components/djhc/HeaderTeamMark';
import FanSuiteRail from '@/components/djhc/FanSuiteRail';
import { SITE } from '@/components/djhc/siteNavigation';

// Sticky top chrome for the WebView shell: the site header markup (brand on
// roots, back button on child views) reused verbatim so the WebView header
// styling in fanSuiteChrome.css applies unchanged, wrapped in a Framer Motion
// entrance. Only one header exists per session — the layout's.
function MobileShellHeader() {
  const headerRef = useRef(null);
  const navRef = useRef(null);
  const toggleRef = useRef(null);
  const { open, close, toggle } = useSiteDrawer(headerRef, navRef, toggleRef);
  return (<>
    <motion.header ref={headerRef} initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="djhc-chrome site-header fan-suite-header"><div className="container header-inner">
        <MobileHeaderBrand />
        <HeaderTeamMark />
        <div className="home-header-utility" aria-label="Account and shopping tools"><Link aria-label="Account" title="Account" className="home-header-utility__icon" to="/account"><UserRound aria-hidden="true" /></Link></div>
        <div className="header-actions"><button ref={toggleRef} type="button" id="navToggle" className="nav-toggle" data-state={open ? 'open' : 'closed'} aria-controls="siteNav" aria-expanded={open} aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} onClick={toggle}><span className="nav-toggle__icon" aria-hidden="true"><span /><span /><span /></span><span className="button-label">Menu</span></button><ThemeToggle /></div>
        <FanSuiteRail />
      </div></motion.header>
    <button type="button" className="site-nav-backdrop" aria-label="Close navigation menu" hidden={!open} tabIndex={-1} onClick={close} />
    <SiteDrawer open={open} navRef={navRef} onClose={close} />
  </>);
}

// The shell's single touch-gesture scroll region (.webview-scroll). Pulling
// past the threshold runs a Framer Motion spinner while the query cache and
// the registered studio loaders revalidate. Each bottom tab keeps its own
// scroll position; in-tab navigation starts at the top.
function MobilePullRefresh({ activeId, locationKey, children }) {
  const scrollRef = useRef(null);
  const scrollMemory = useRef(new Map());
  const history = useRef({ id: null, key: '' });
  const queryClient = useQueryClient();
  const onRefresh = async () => {
    await refreshStudioData();
    await queryClient.invalidateQueries();
  };
  const gesture = useTouchRefresh(scrollRef, true, onRefresh);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || activeId == null) { history.current = { id: activeId, key: locationKey }; return; }
    const previous = history.current;
    if (previous.id != null && previous.id !== activeId) node.scrollTop = scrollMemory.current.get(activeId) ?? 0;
    else if (previous.id === activeId && previous.key && previous.key !== locationKey) node.scrollTop = 0;
    history.current = { id: activeId, key: locationKey };
  }, [activeId, locationKey]);
  const saveScroll = event => { if (activeId != null) scrollMemory.current.set(activeId, event.currentTarget.scrollTop); };

  return (
    <div ref={scrollRef} className="webview-scroll relative" aria-busy={gesture.refreshing}
      onScroll={saveScroll} {...gesture.listeners}>
      <motion.div className="pointer-events-none grid place-items-center overflow-hidden text-gold"
        role="status" aria-live="polite"
        animate={{ height: gesture.refreshing ? 48 : gesture.pull, opacity: Math.min((gesture.refreshing ? 48 : gesture.pull) / REFRESH_THRESHOLD, 1) }}>
        <motion.span animate={gesture.refreshing ? { rotate: 360 } : { rotate: gesture.pull * 2 }}
          transition={gesture.refreshing ? { repeat: Infinity, ease: 'linear', duration: 0.8 } : { type: 'spring', stiffness: 260, damping: 24 }}
          className="flex items-center gap-2 rounded-full border border-border/40 bg-card px-3 py-2 text-xs shadow-sm">
          <Loader2 className="h-4 w-4" aria-hidden="true" />
          <span>{gesture.refreshing ? 'Refreshing…' : gesture.pull >= REFRESH_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
        </motion.span>
      </motion.div>
      {gesture.error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{gesture.error}</p>}
      {children}
    </div>
  );
}

// Mobile-only layout: activates when <body> carries the webview class (set by
// useMobileWebView). Normal web visits get the router untouched.
export default function MobileLayout() {
  const isWebView = useMobileWebView();
  const location = useLocation();
  const navigate = useNavigate();
  const tabsContext = useMobileTabViews(location, navigate);
  const activeId = tabsContext.activeId;

  // Marker for CSS: the layout owns the chrome, so per-page chrome stands down.
  useLayoutEffect(() => {
    if (!isWebView) return undefined;
    document.body.classList.add('mobile-shell');
    return () => document.body.classList.remove('mobile-shell');
  }, [isWebView]);

  if (!isWebView) return <Outlet />;
  return (
    <MobileTabsContext.Provider value={tabsContext}>
      <div className="flex h-full min-h-0 flex-col">
        <MobileShellHeader />
        <MobilePullRefresh activeId={activeId} locationKey={location.pathname + location.search}>
          {tabsContext.tabs.filter(tab => tab.location).map(tab => (
            <KeepAliveTab key={tab.id} location={tab.location} active={tab.id === activeId} />
          ))}
          {activeId == null && <Outlet />}
        </MobilePullRefresh>
        <BottomTabBar />
      </div>
    </MobileTabsContext.Provider>
  );
}