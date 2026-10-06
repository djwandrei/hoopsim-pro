import React, { useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import StudioNavigation from '@/components/studio/StudioNavigation';
import DJHCHeader from '@/components/djhc/DJHCHeader';
import DJHCFooter from '@/components/djhc/DJHCFooter';
import CourtThemeProvider from '@/components/djhc/CourtThemeProvider';
export default function StudioShell({ active, children, followTeam }) {
  const [collapsed,setCollapsed] = useState(() => { try { return localStorage.getItem('swishiq-nav-collapsed') === '1'; } catch { return false; } });
  const toggle = () => setCollapsed(value => { try { localStorage.setItem('swishiq-nav-collapsed',value ? '0' : '1'); } catch { /* ignore */ } return !value; });
  return <CourtThemeProvider followTeam={followTeam}><div className="studio-workspace min-h-screen bg-canvas"><DJHCHeader /><a href="#studio-content" className="sr-only z-50 rounded bg-gold p-3 text-canvas focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to workspace</a><StudioNavigation active={active} collapsed={collapsed} onToggle={toggle} />{collapsed && <button type="button" onClick={toggle} aria-label="Open workbench menu" style={{top:'calc(var(--djhc-header-h, 0px) + .75rem)'}} className="fixed left-3 z-40 flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-canvas shadow-lg lg:hidden"><ChevronsRight className="h-4 w-4" /></button>}<div id="studio-content" className={`min-w-0 ${collapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>{children}<DJHCFooter /></div></div></CourtThemeProvider>;
}