import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { WORKBENCHES, findStudioTool } from '@/components/studio/workbenches';
import { Image } from '@/components/ui/image';
import { STUDIO_EMBLEM } from '@/components/studio/teamAssets';
import { prefetchRoute } from '@/lib/routePrefetch';
export default function StudioNavigation({ active, collapsed = false, onToggle }) {
  const { pathname } = useLocation();
  const items = WORKBENCHES;
  // The tool a route belongs to — a workbench or one of its grouped screens —
  // drives the highlight, so grouped children light up under their workbench.
  const currentPath = findStudioTool(pathname)?.tool.path ?? pathname;
  // Narrow / mobile: no studio menu at all — the site header's dropdown is
  // the navigation there, keeping the studio chrome out of the way.

  return (
    <aside className={`studio-sidebar hidden border-b border-border/60 bg-card lg:fixed lg:bottom-0 lg:left-0 lg:top-[var(--djhc-header-h,0px)] lg:z-30 lg:flex lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-b-0 lg:border-r ${collapsed ? 'lg:w-16' : 'lg:w-56'}`}>
      {/* Desktop: edge-mounted collapse toggle — arrow-only, vertically centered, half over the sidebar border */}
      <button type="button" onClick={onToggle} aria-label={collapsed ? 'Expand workbench menu' : 'Collapse workbench menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'} className={`fixed top-1/2 z-40 hidden h-12 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold bg-gold text-[hsl(223_24%_5.7%)] shadow-[0_0_20px_hsl(43_78%_60%/0.6)] transition-transform hover:scale-110 hover:bg-goldSoft lg:flex ${collapsed ? 'left-16' : 'left-56'}`}>
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
      {/* Desktop: stacked sidebar (unchanged) */}
      <div className="hidden px-4 py-3 lg:flex lg:px-4 lg:py-4">
        <Link to="/" aria-label="SwishIQ Studio home" className="flex min-w-0 items-center gap-3">
          <Image src={STUDIO_EMBLEM} alt="" fittingType="fit" className="h-14 w-14 shrink-0 object-contain" />
          {!collapsed &&
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate font-display text-2xl tracking-wide text-foreground">SwishIQ</span>
            <span className="mt-1 font-display text-sm tracking-[0.32em] text-gold">STUDIO</span>
          </span>}
        </Link>
      </div>
      {!collapsed && <p className="hidden px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground lg:block">Workbenches</p>}
      <nav aria-label="Studio workbenches" className="hidden flex-wrap gap-1 px-3 pb-3 lg:flex lg:flex-col lg:px-3">{items.map(({ path, title, icon: Icon, emblem, children: sub }) => <React.Fragment key={path}>
        <Link to={path} onPointerEnter={() => prefetchRoute(path)} onFocus={() => prefetchRoute(path)} title={collapsed ? title : undefined} aria-current={currentPath === path ? 'page' : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs lg:gap-3 lg:text-sm ${currentPath === path ? 'border-gold/20 bg-gold/10 font-medium text-gold' : 'border-transparent text-muted-foreground hover:bg-raised hover:text-foreground'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>{emblem ? <Image src={emblem} alt="" fittingType="fit" className="h-8 w-8 shrink-0 object-contain" /> : <Icon className="h-6 w-6 shrink-0" />}{!collapsed && title}{currentPath === path && !collapsed && <ArrowUpRight className="ml-auto hidden h-3 w-3 lg:block" />}</Link>
        {sub && !collapsed && (currentPath === path || (sub ?? []).some(child => pathname === child.path || pathname.startsWith(`${child.path}/`))) && <div className="ml-4 flex flex-col gap-1 border-l border-border/30 pl-2 lg:ml-6">{sub.map((item) => <Link key={item.path} to={item.path} onPointerEnter={() => prefetchRoute(item.path)} onFocus={() => prefetchRoute(item.path)} aria-current={pathname === item.path ? 'page' : undefined} className={pathname === item.path ? 'rounded-md px-2 py-1.5 text-[11px] font-semibold text-gold' : 'rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground'}>{item.title}</Link>)}</div>}
      </React.Fragment>)}</nav>
      
    </aside>);

}