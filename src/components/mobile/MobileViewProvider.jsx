import React, { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MobileViewContext } from '@/components/mobile/MobileViewContext';
import refreshStudioData from '@/components/mobile/refreshStudioData';

export default function MobileViewProvider({ active, children }) {
  const handlers = useRef(new Set());
  const queryClient = useQueryClient();
  const registerRefresh = useCallback(handler => {
    handlers.current.add(handler);
    return () => handlers.current.delete(handler);
  }, []);
  const refresh = useCallback(async () => {
    await refreshStudioData();
    const results = await Promise.allSettled([
      queryClient.invalidateQueries({ refetchType: 'active' }),
      ...Array.from(handlers.current, handler => Promise.resolve().then(handler)),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }, [queryClient]);
  const value = useMemo(() => ({ active, registerRefresh, refresh }), [active, registerRefresh, refresh]);
  return <MobileViewContext.Provider value={value}>{children}</MobileViewContext.Provider>;
}