import { useEffect, useRef } from 'react';
import { useMobileView } from '@/components/mobile/MobileViewContext';

// A view's existing data loader participates without resetting page state.
export default function useViewRefresh(handler) {
  const { active, registerRefresh } = useMobileView();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active || !registerRefresh) return;
    return registerRefresh(() => latest.current());
  }, [active, registerRefresh]);
}