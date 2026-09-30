import React from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, ArrowUpRight } from 'lucide-react';
import { WORKBENCHES } from '@/components/studio/workbenches';
import { Image } from '@/components/ui/image';
import { STUDIO_EMBLEM } from '@/components/studio/teamAssets';
export default function StudioNavigation({ active }) {
  const items = [{ path: '/', title: 'Studio overview', icon: LayoutGrid }, ...WORKBENCHES];
  return (
    <aside className="border-b border-border/60 bg-card lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-56 lg:flex-col lg:border-b-0 lg:border-r">
      <Link to="/" className="flex items-center gap-3 px-4 py-5 lg:px-6 lg:py-8" aria-label="SwishIQ Studio overview"><Image src={STUDIO_EMBLEM} alt="" fittingType="fit" className="h-12 w-12 shrink-0 object-contain" /><div><span className="block font-display text-2xl leading-none tracking-wide text-foreground">SWISHIQ</span><span className="mt-1 block text-[9px] uppercase tracking-[0.24em] text-muted-foreground">DJHC · Studio</span></div></Link>
      <p className="hidden px-6 pb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground lg:block">Workbenches</p>
      <nav aria-label="Studio workbenches" className="flex flex-wrap gap-1 px-3 pb-3 lg:flex-col lg:px-3">{items.map(({ path, title, icon: Icon }) => <Link key={path} to={path} aria-current={active === path ? 'page' : undefined} className={active === path ? 'flex items-center gap-2 rounded-lg border border-gold/20 bg-gold/10 px-3 py-2.5 text-xs font-medium text-gold lg:gap-3 lg:text-sm' : 'flex items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-xs text-muted-foreground hover:bg-raised hover:text-foreground lg:gap-3 lg:text-sm'}><Icon className="h-4 w-4 shrink-0" />{title}{active === path && <ArrowUpRight className="ml-auto hidden h-3 w-3 lg:block" />}</Link>)}</nav>
      <div className="mt-auto hidden border-t border-border/60 px-6 py-5 lg:block"><p className="text-[10px] font-semibold uppercase tracking-widest text-gold">Evidence before outcomes</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Observed records and local scenarios are always labeled separately.</p></div>
    </aside>
  );
}