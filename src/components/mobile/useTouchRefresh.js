import { useEffect, useRef, useState } from 'react';

export const REFRESH_THRESHOLD = 72;
export default function useTouchRefresh(container, enabled, onRefresh) {
  const gesture = useRef(null), distance = useRef(0), busy = useRef(false);
  const [pull, setPull] = useState(0), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const reset = () => { gesture.current = null; distance.current = 0; setPull(0); };
  useEffect(() => {
    const node = container.current;
    if (!enabled || !node) return;
    const preventBounce = event => { if (gesture.current?.pulling && event.cancelable) event.preventDefault(); };
    node.addEventListener('touchmove', preventBounce, { passive: false });
    return () => node.removeEventListener('touchmove', preventBounce);
  }, [container, enabled]);
  const onTouchStart = event => {
    if (busy.current || event.touches.length !== 1 || container.current.scrollTop > 0) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"], [data-no-refresh]')) return;
    for (let node = event.target; node && node !== container.current; node = node.parentElement) {
      if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight) return;
    }
    const { clientX: x, clientY: y } = event.touches[0];
    gesture.current = { x, y, pulling: false };
  };
  const onTouchMove = event => {
    const start = gesture.current;
    if (!start || busy.current) return;
    if (event.touches.length !== 1) { reset(); return; }
    const dy = event.touches[0].clientY - start.y, dx = Math.abs(event.touches[0].clientX - start.x);
    if (dy <= 0 || dx > Math.max(dy, 10) || container.current.scrollTop > 0) { reset(); return; }
    start.pulling = dy > 10;
    distance.current = Math.min(dy * 0.45, 96);
    setPull(distance.current);
  };
  const onTouchEnd = async () => {
    if (!gesture.current || busy.current) return;
    const commit = distance.current >= REFRESH_THRESHOLD;
    reset();
    if (!commit) return;
    busy.current = true; setRefreshing(true); setPull(44); setError('');
    try { await onRefresh(); }
    catch (failure) { setError(failure?.message || 'Could not refresh. Pull down to try again.'); }
    finally { busy.current = false; setRefreshing(false); reset(); }
  };
  return { pull, refreshing, error, listeners: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset } };
}