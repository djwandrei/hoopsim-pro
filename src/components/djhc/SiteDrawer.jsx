import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import ToolEmblem from '@/components/djhc/ToolEmblem';
import { FAN_TOOLS, TOOL_ROUTES, DRAWER_HIDDEN } from '@/components/djhc/siteNavigation';
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
  const { pathname } = useLocation();
  const grouped = new Set(['/lineup-lab', '/matchups', '/packs']);
  return <nav ref={navRef} id="siteNav" aria-label="Primary navigation" className={`site-nav hoopsim-menu${open?' open':''}`} hidden={!open}><div className="site-nav__mobile-header"><span className="site-nav__eyebrow">Navigation</span><strong className="site-nav__mobile-title">SwishIQ Studio</strong><p>Move between workbenches, fan tools, and games.</p></div><div className="site-nav__palette"><TeamPalettePicker /></div>{WORKBENCH_GROUPS.map(group => <DrawerLinkGroup key={group.label} label={group.label} items={group.items} onClose={onClose} />)}<ul className="primary-nav__list">{FAN_TOOLS.filter(item=>!DRAWER_HIDDEN.includes(item.label) && !grouped.has(item.route)).map(item=>{
    const active = item.route ? (TOOL_ROUTES[item.path] === '/' ? pathname === '/' : pathname.startsWith(item.route)) : false;
    const className = `primary-nav__link${active?' active':''}`;
    const children = <><ToolEmblem emblem={item.emblem} label={item.label} className="fan-tools-primary__emblem" /><span className="fan-tools-primary__label">{item.label}</span></>;
    return <li key={item.path} className="primary-nav__item">
      {item.route
        ? <Link to={item.route} className={className} aria-current={active?'page':undefined} onClick={onClose}>{children}</Link>
        : <a href={item.href} className={className} target="_blank" rel="noreferrer" onClick={onClose}>{children}</a>}
    </li>;
  })}</ul></nav>;
}