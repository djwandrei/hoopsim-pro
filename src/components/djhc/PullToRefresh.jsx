import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import useMobileWebView from '@/hooks/useMobileWebView';

const THRESHOLD = 72; // pull distance (px) that commits the refresh
const MAX_PULL = 96; // how far the indicator can travel

// Native-style pull-to-refresh for the app's main scroll containers in
// WebView/mobile sessions (roster, simulation and table views). Pull down
// at the top of the region past the threshold to reload the view. On the
// regular web it renders a plain wrapper so nothing changes.
export default function PullToRefresh({ children, className = '', id, onRefresh }) {
  const isWebView = useMobileWebView();
  const ref = useRef(null);
  const startY = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e) => {
    if (refreshing) return;
    startY.current = (ref.current?.scrollTop ?? 1) <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e) => {
    if (refreshing || startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0 || (ref.current?.scrollTop ?? 0) > 0) { setPull(0); return; }
    setPull(Math.min(delta * 0.45, MAX_PULL));
  };
  const onTouchEnd = () => {
    if (refreshing) return;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD * 0.55);
      const settle = () => { setRefreshing(false); setPull(0); };
      try { Promise.resolve(onRefresh ? onRefresh() : window.location.reload()).finally(settle); } catch { settle(); }
    } else {
      setPull(0);
    }
    startY.current = null;
  };

  if (!isWebView) return <div id={id} className={className}>{children}</div>;
  return (
    <div
      id={id}
      ref={ref}
      className={`${className} webview-scroll relative`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 grid place-items-center overflow-hidden"
        style={{ height: `${pull}px`, opacity: Math.min(pull / THRESHOLD, 1), transition: startY.current === null && !refreshing ? 'height .25s ease, opacity .25s ease' : 'none' }}
      >
        <Loader2 className={`h-5 w-5 text-gold ${refreshing ? 'animate-spin' : ''}`} style={{ transform: refreshing ? undefined : `rotate(${pull * 2.2}deg)` }} aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}