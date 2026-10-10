import React from 'react';
import { WORKBENCHES } from '@/components/studio/workbenches';
import DrawerLinkGroup from '@/components/djhc/DrawerLinkGroup';
import TeamPalettePicker from '@/components/djhc/TeamPalettePicker';

// Drawer shows the individual workbenches, grouped under their desk's name —
// the hub pages themselves are deliberately not linked here.
const WORKBENCH_GROUPS = [
  ...WORKBENCHES.filter(w => w.children?.length).map(w => ({ label: w.title, items: w.children })),
  { label: 'Studio Tools', items: WORKBENCHES.filter(w => !w.children) },
];

export default function SiteDrawer({open,navRef,onClose}) {
  return <nav ref={navRef} id="siteNav" aria-label="Studio workbenches" className={`site-nav hoopsim-menu${open?' open':''}`} hidden={!open}>
    <div className="site-nav__mobile-header"><span className="site-nav__eyebrow">Navigation</span><strong className="site-nav__mobile-title">SwishIQ Studio</strong><p>Move between Studio workbenches.</p></div>
    <div className="site-nav__palette"><TeamPalettePicker /></div>
    {WORKBENCH_GROUPS.map(group => <DrawerLinkGroup key={group.label} label={group.label} items={group.items} onClose={onClose} />)}
  </nav>;
}
