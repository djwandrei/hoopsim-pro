import { createContext, useContext } from 'react';

// Shared by src/components/Layout.jsx (provider) and the bottom tab bar
// (consumer). Null outside the mobile keep-alive tab shell, so components
// can fall back to ordinary router navigation.
export const MobileTabsContext = createContext(null);

export function useMobileTabs() {
  return useContext(MobileTabsContext);
}