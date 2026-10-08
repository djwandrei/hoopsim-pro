import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { SITE } from '@/components/djhc/siteNavigation';
import useSiteDrawer from '@/components/djhc/useSiteDrawer';
import SiteDrawer from '@/components/djhc/SiteDrawer';
import FanSuiteRail from '@/components/djhc/FanSuiteRail';
import HeaderTeamMark from '@/components/djhc/HeaderTeamMark';
import ThemeToggle from '@/components/djhc/ThemeToggle';
import WebViewBackButton from '@/components/djhc/WebViewBackButton';
import BottomTabBar from '@/components/djhc/BottomTabBar';
export default function DJHCHeader() {
  const ref=useRef(null),navRef=useRef(null),toggleRef=useRef(null);
  const {open,close,toggle}=useSiteDrawer(ref,navRef,toggleRef);
  return <>
    <header ref={ref} className="djhc-chrome site-header fan-suite-header"><div className="container header-inner">
      <a aria-label="DJ's House of Cards & Comics • Trusted Hobby Finds home" className="brand" href={`${SITE}/index.html`}><Image src={`${SITE}/assets/dj-logo.png`} alt="DJ's House of Cards & Comics logo" className="brand-logo" fittingType="fit" /><span className="brand-copy"><span className="brand-script">DJ's House of Cards</span><span className="brand-kicker">&amp; Comics • Trusted Hobby Finds</span></span></a>
      <HeaderTeamMark /><div className="home-header-utility" aria-label="Account and shopping tools"><Link aria-label="Account" title="Account" className="home-header-utility__icon" to="/account"><UserRound aria-hidden="true" /></Link></div>
      <SiteDrawer open={open} navRef={navRef} onClose={close} />
      <div className="header-actions"><WebViewBackButton /><button ref={toggleRef} type="button" id="navToggle" className="nav-toggle" data-state={open?'open':'closed'} aria-controls="siteNav" aria-expanded={open} aria-label={open?'Close navigation menu':'Open navigation menu'} onClick={toggle}><span className="nav-toggle__icon" aria-hidden="true"><span /><span /><span /></span><span className="button-label">Menu</span></button><ThemeToggle /></div>
      <FanSuiteRail />
    </div></header>
    <button type="button" className="site-nav-backdrop" aria-label="Close navigation menu" hidden={!open} tabIndex={-1} onClick={close} />
    <BottomTabBar />
  </>;
}