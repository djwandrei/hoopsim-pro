import React, { useRef } from 'react';
import useMobileWebView from '@/hooks/useMobileWebView';
import { useMobileView } from '@/components/mobile/MobileViewContext';
import useTouchRefresh from '@/components/mobile/useTouchRefresh';
import RefreshIndicator from '@/components/mobile/RefreshIndicator';

export default function PullToRefresh({ children, className = '', id, onRefresh }) {
  const isWebView = useMobileWebView();
  const { refresh, active } = useMobileView();
  const ref = useRef(null);
  const gesture = useTouchRefresh(ref, isWebView && active, onRefresh || refresh);
  if (!isWebView) return <div id={id} className={className}>{children}</div>;
  return <div id={id} ref={ref} className={`${className} webview-scroll relative`} aria-busy={gesture.refreshing} {...gesture.listeners}>
    <RefreshIndicator pull={gesture.pull} refreshing={gesture.refreshing} />
    {gesture.error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{gesture.error}</p>}
    {children}
  </div>;
}