import React from 'react';
import MobileLayout from '@/components/mobile/MobileLayout';

// The browser router owns navigation on both web and mobile. On the web this
// is a plain passthrough; inside a mobile WebView, MobileLayout supplies the
// keep-alive bottom-tab shell with its own sticky header and pull-to-refresh.
export default function Layout() {
  return <MobileLayout />;
}