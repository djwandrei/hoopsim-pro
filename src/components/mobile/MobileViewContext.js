import { createContext, useContext } from 'react';

export const MobileViewContext = createContext({ active: true, registerRefresh: null, refresh: null });
export function useMobileView() { return useContext(MobileViewContext); }