import React from 'react';
import { Image } from '@/components/ui/image';
import { FAN_TOOLS } from '@/components/djhc/siteNavigation';
export default function FanSuiteRail() {
  return <nav className="fan-suite-nav" aria-label="Fan tools navigation"><div className="container fan-suite-nav__scroll">{FAN_TOOLS.filter(item=>item.label!=='Virtual Packs').map(item=><a key={item.path} className="fan-suite-nav__link" href={item.href} aria-current={item.label==='SwishIQ Studio'?'page':undefined}><Image src={item.emblem} alt="" fittingType="fit" className="h-[30px] w-[30px]" />{item.label}</a>)}</div></nav>;
}