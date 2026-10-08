import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { SITE } from '@/components/djhc/siteNavigation';
import WebViewBackButton from '@/components/djhc/WebViewBackButton';

// Mobile WebView brand: the store logo and original site wordmark, matching
// the desktop header instead of the studio emblem.
export default function MobileHeaderBrand() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const topLevel = path === '/' || path === '/account';
  if (!topLevel) return <div className="mobile-brand"><WebViewBackButton /></div>;
  return <Link to="/" className="mobile-brand" aria-label="DJ's House of Cards & Comics • Trusted Hobby Finds home">
    <Image src={`${SITE}/assets/dj-logo.png`} alt="DJ's House of Cards & Comics logo" fittingType="fit" className="h-9 w-9 shrink-0" />
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-display text-lg tracking-wide">DJ's House of Cards</span>
      <span className="truncate text-[10.4px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">&amp; Comics • Trusted Hobby Finds</span>
    </span>
  </Link>;
}