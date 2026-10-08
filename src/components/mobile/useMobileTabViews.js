import { useCallback, useLayoutEffect, useState } from 'react';
import { MOBILE_TABS, tabForPath } from '@/components/mobile/mobileTabs';

// Cache each tab's location; all navigation uses the app's browser router.
export default function useMobileTabViews(location, navigate) {
  const activeId = tabForPath(location.pathname)?.id ?? null;
  const [savedLocations, setSavedLocations] = useState(() => (
    activeId ? { [activeId]: location } : {}
  ));

  useLayoutEffect(() => {
    if (!activeId) return;
    setSavedLocations(previous => previous[activeId] === location
      ? previous : { ...previous, [activeId]: location });
  }, [activeId, location]);

  const tabs = MOBILE_TABS.map(tab => ({
    ...tab,
    location: tab.id === activeId ? location : savedLocations[tab.id],
  }));

  const switchTab = useCallback((tabId, to) => {
    if (tabId === activeId) return;
    const saved = savedLocations[tabId];
    const target = saved
      ? { pathname: saved.pathname, search: saved.search, hash: saved.hash }
      : to || MOBILE_TABS.find(tab => tab.id === tabId)?.to;
    if (target) navigate(target, { state: saved?.state });
  }, [activeId, savedLocations, navigate]);

  return { tabs, activeId, switchTab };
}