import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import StudioNavigation from '@/components/studio/StudioNavigation';
export default function StudioShell({ active, children }) {
  const [collapsed,setCollapsed] = useState(() => { try { return localStorage.getItem('swishiq-nav-collapsed') === '1'; } catch (error) { return false; } });
  const toggle = () => setCollapsed(value => { try { localStorage.setItem('swishiq-nav-collapsed',value ? '0' : '1'); } catch (error) { /* ignore */ } return !value; });
  return <div className="studio-workspace min-h-screen bg-canvas"><a href="#studio-content" className="sr-only z-50 rounded bg-gold p-3 text-canvas focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to workspace</a><StudioNavigation active={active} collapsed={collapsed} onToggle={toggle} />{collapsed && <button type="button" onClick={toggle} aria-label="Open workbench menu" className="fixed left-3 top-3 z-40 rounded-lg border border-border/40 bg-card p-2 text-gold shadow-lg lg:hidden"><Menu className="h-4 w-4" /></button>}<div id="studio-content" className={`min-w-0 ${collapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>{children}</div></div>;
}