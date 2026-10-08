import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import ToolEmblem from '@/components/djhc/ToolEmblem';
import { FAN_TOOLS, TOOL_ROUTES, DRAWER_HIDDEN } from '@/components/djhc/siteNavigation';
import { WORKBENCHES, DAILY_GAMES_ROUTES } from '@/components/studio/workbenches';
export default function SiteDrawer({open,navRef,onClose}) {
  const { pathname } = useLocation();
  // The drawer mirrors the app's workbench structure: the analysis and
  // collector tools are grouped under their desks, not listed standalone.
  const groups = [
    ['Analytics & Analysis', (WORKBENCHES.find(workbench => workbench.path === '/analytics')?.children ?? [])],
    ['Collector Center', (WORKBENCHES.find(workbench => workbench.path === '/collector')?.children ?? [])],
    ['Daily games', DAILY_GAMES_ROUTES],
  ];
  const grouped = new Set(['/lineup-lab', '/matchups', '/packs']);
  return <nav ref={navRef} id="siteNav" aria-label="Primary navigation" className={`site-nav${open?' open':''}`} hidden={!open}><div className="site-nav__mobile-header"><span className="site-nav__eyebrow">Navigate the collection</span><strong className="site-nav__mobile-title">SwishIQ Studio</strong><p>Move between fan tools, games, and SwishIQ workbenches.</p></div><ul className="primary-nav__list">{FAN_TOOLS.filter(item=>!DRAWER_HIDDEN.includes(item.label) && !grouped.has(item.route)).map(item=>{
    const active = item.route ? (TOOL_ROUTES[item.path] === '/' ? pathname === '/' : pathname.startsWith(item.route)) : false;
    const className = `primary-nav__link${active?' active':''}`;
    const children = <><ToolEmblem emblem={item.emblem} label={item.label} className="fan-tools-primary__emblem" /><span className="fan-tools-primary__label">{item.label}</span></>;
    return <li key={item.path} className="primary-nav__item">
      {item.route
        ? <Link to={item.route} className={className} aria-current={active?'page':undefined} onClick={onClose}>{children}</Link>
        : <a href={item.href} className={className} target="_blank" rel="noreferrer" onClick={onClose}>{children}</a>}
    </li>;
  })}</ul>
    {groups.map(([groupLabel, items]) => <React.Fragment key={groupLabel}>
    <div className="site-nav__group"><span className="site-nav__eyebrow">{groupLabel}</span></div>
    <ul className="primary-nav__list">{items.map(item=>{
      const activeGame = pathname === item.path || pathname.startsWith(`${item.path}/`);
      return <li key={item.path} className="primary-nav__item"><Link to={item.path} className={`primary-nav__link${activeGame?' active':''}`} aria-current={activeGame?'page':undefined} onClick={onClose}><ToolEmblem emblem={item.emblem} label={item.title} className="fan-tools-primary__emblem" /><span className="fan-tools-primary__label">{item.title}</span></Link></li>;
    })}</ul></React.Fragment>)}</nav>;
}