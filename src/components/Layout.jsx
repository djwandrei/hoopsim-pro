import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useMobileWebView from '@/hooks/useMobileWebView';
import { MobileTabsContext } from '@/components/mobile/mobileTabsContext';
import useMobileTabViews from '@/components/mobile/useMobileTabViews';
import KeepAliveTab from '@/components/mobile/KeepAliveTab';

// The browser router owns navigation on both web and mobile. Cached mobile
// views keep their own locations and stay mounted while their tabs are hidden.
export default function Layout() {
  const isWebView = useMobileWebView();
  const location = useLocation();
  const navigate = useNavigate();
  const tabsContext = useMobileTabViews(location, navigate);
  if (!isWebView) return <Outlet />;

  return (
    <MobileTabsContext.Provider value={tabsContext}>
      <div className="h-full min-h-0">
        {tabsContext.tabs.filter(tab => tab.location).map(tab => (
          <KeepAliveTab
            key={tab.id}
            location={tab.location}
            active={tab.id === tabsContext.activeId}
          />
        ))}
        {tabsContext.activeId == null && <Outlet />}
      </div>
    </MobileTabsContext.Provider>
  );
}