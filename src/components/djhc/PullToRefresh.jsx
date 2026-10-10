import React, { useRef } from 'react';
import useMobileWebView from '@/hooks/useMobileWebView';
import { useMobileView } from '@/components/mobile/MobileViewContext';
import { useMobileTabs } from '@/components/mobile/mobileTabsContext';
import useTouchRefresh from '@/components/mobile/useTouchRefresh';
import RefreshIndicator from '@/components/mobile/RefreshIndicator';

/**
 * @param {{ children: import('react').ReactNode, className?: string, id?: string, onRefresh?: () => unknown }} props
 */
export default function PullToRefresh({ children, className = '', id, onRefresh }) {
  const isWebView = useMobileWebView();
  const tabsCtx = useMobileTabs();
  const { refresh, active } = useMobileView();
  const ref = useRef(null);
  const gesture = useTouchRefresh(ref, isWebView && active && !tabsCtx, onRefresh || refresh);
  if (!isWebView) return <div id={id} className={className}>{children}</div>;
  // Inside the MobileLayout shell the layout owns pull-to-refresh and the
  // single scroll region; this wrapper stays a pass-through container.
  if (tabsCtx) return <div id={id} className={`${className} webview-scroll relative`}>{children}</div>;
  return <div id={id} ref={ref} className={`${className} webview-scroll relative`} aria-busy={gesture.refreshing} {...gesture.listeners}>
    <RefreshIndicator pull={gesture.pull} refreshing={gesture.refreshing} />
    {gesture.error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{gesture.error}</p>}
    {children}
  </div>;
}
