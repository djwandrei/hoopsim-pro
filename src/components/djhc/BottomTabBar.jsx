import React from 'react';
import { NavLink } from 'react-router-dom';
import useMobileWebView from '@/hooks/useMobileWebView';
import { useMobileTabs } from '@/components/mobile/mobileTabsContext';
import { MOBILE_TABS } from '@/components/mobile/mobileTabs';

// iOS-style bottom tab bar, rendered only inside a WebView/mobile session.
// Inside the keep-alive tab layout (src/components/Layout.jsx) a tap switches
// to the tab's persisted view — never unmounting it — so each tab keeps its
// scroll position and sub-navigation state. Outside that shell it falls back
// to plain router navigation.
export default function BottomTabBar() {
  const isWebView = useMobileWebView();
  const tabsCtx = useMobileTabs();
  if (!isWebView) return null;
  return (
    <nav aria-label="Main sections" className="fixed inset-x-0 bottom-0 z-[1100] border-t border-gold/25 bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-6">
        {MOBILE_TABS.map(({ id, to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              onClick={(e) => { if (tabsCtx) { e.preventDefault(); tabsCtx.switchTab(id, to); } }}
              className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-wide ${isActive ? 'text-gold' : 'text-muted-foreground'}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}