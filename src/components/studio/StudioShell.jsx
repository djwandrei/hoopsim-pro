import React from 'react';
import StudioNavigation from '@/components/studio/StudioNavigation';
export default function StudioShell({ active, children }) {
  return <div className="studio-workspace min-h-screen bg-canvas"><a href="#studio-content" className="sr-only z-50 rounded bg-gold p-3 text-canvas focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to workspace</a><StudioNavigation active={active} /><div id="studio-content" className="min-w-0 lg:ml-56">{children}</div></div>;
}