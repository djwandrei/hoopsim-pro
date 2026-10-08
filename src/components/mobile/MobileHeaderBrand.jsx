import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { WORKBENCHES } from '@/components/studio/workbenches';
import { STUDIO_EMBLEM } from '@/components/studio/teamAssets';
import WebViewBackButton from '@/components/djhc/WebViewBackButton';

export default function MobileHeaderBrand() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const topLevel = path === '/' || path === '/account' || WORKBENCHES.some(tool => tool.path === path);
  if (!topLevel) return <div className="mobile-brand"><WebViewBackButton /></div>;
  return <Link to="/" className="mobile-brand" aria-label="HoopSim Pro home">
    <Image src={STUDIO_EMBLEM} alt="HoopSim Pro logo" fittingType="fit" className="h-10 w-10 shrink-0" />
    <span className="truncate font-display text-2xl tracking-wide">HoopSim Pro</span>
  </Link>;
}