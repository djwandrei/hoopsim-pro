import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { FAN_TOOLS } from '@/components/djhc/siteNavigation';
import { DAILY_GAMES } from '@/components/studio/workbenches';
export default function SiteDrawer({open,navRef,onClose}) {
  const { pathname } = useLocation();
  return <nav ref={navRef} id="siteNav" aria-label="Primary navigation" className={`site-nav${open?' open':''}`} hidden={!open}><div className="site-nav__mobile-header"><span className="site-nav__eyebrow">Navigate the collection</span><strong className="site-nav__mobile-title">SwishIQ Studio</strong><p>Move between fan tools, games, and SwishIQ workbenches.</p></div><ul className="primary-nav__list">{FAN_TOOLS.map(item=><li key={item.path} className="primary-nav__item"><a href={item.href} className={`primary-nav__link${item.label==='SwishIQ Studio'?' active':''}`} data-fan-tools-primary="true" aria-current={item.label==='SwishIQ Studio'?'page':undefined} onClick={onClose}><Image src={item.emblem} alt="" className="fan-tools-primary__emblem" fittingType="fit" /><span className="fan-tools-primary__label">{item.label}</span></a></li>)}</ul>
    <div className="site-nav__group"><span className="site-nav__eyebrow">Daily games</span></div>
    <ul className="primary-nav__list">{DAILY_GAMES.map(item=>{
      const activeGame = pathname === item.path || pathname.startsWith(`${item.path}/`);
      return <li key={item.path} className="primary-nav__item"><Link to={item.path} className={`primary-nav__link${activeGame?' active':''}`} aria-current={activeGame?'page':undefined} onClick={onClose}><Image src={item.emblem} alt="" className="fan-tools-primary__emblem" fittingType="fit" /><span className="fan-tools-primary__label">{item.title}</span></Link></li>;
    })}</ul></nav>;
}