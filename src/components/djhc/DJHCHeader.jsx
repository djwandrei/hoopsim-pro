import React, { useEffect, useRef, useState } from 'react';
import { Menu as MenuIcon, Moon, User, ChevronDown } from 'lucide-react';
import { Image } from '@/components/ui/image';
const SITE = 'https://www.djshouseofcards-comics.com';
const PRIMARY = [
  { label: 'Shop', href: `${SITE}/shop.html` },
  { label: 'Sports Cards', href: `${SITE}/sports-cards.html`, submenu: [['Sports Hub', `${SITE}/sports-cards.html`], ['Baseball', `${SITE}/baseball-cards.html`], ['Basketball', `${SITE}/basketball-cards.html`], ['Football', `${SITE}/football-cards.html`]] },
  { label: 'Comics', href: `${SITE}/comics.html` },
  { label: 'Collectibles', href: `${SITE}/collectibles.html` },
  { label: 'Fan Tools', href: `${SITE}/tools/` },
  { label: 'About', href: `${SITE}/about.html` },
];
const SUITE = [
  ['Fan Tools', `${SITE}/tools/`, '/assets/games/fan-tools-emblem-20260911.png'],
  ['Lineup Lab', `${SITE}/lineup-lab/`, '/assets/games/lineup-lab-emblem-20260911.png'],
  ['Fix the Five', `${SITE}/tools/fix-the-five/`, '/assets/games/fix-the-five-emblem-20260911.png'],
  ['Draft Night', `${SITE}/tools/draft-night/`, '/assets/games/draft-night-emblem-20260911.png'],
  ['Player & Cards', `${SITE}/tools/player-card-matchups/`, '/assets/games/card-matchups-emblem-20260911.png'],
  ['Workshop', `${SITE}/tools/workshop/`, '/assets/games/workshop-emblem-20260911.png'],
  ['SwishIQ Studio', `${SITE}/tools/swishiq-studio/`, '/assets/games/swishiq-studio-emblem-20260913.png'],
];
export default function DJHCHeader() {
  const ref = useRef(null);
  const [navOpen, setNavOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => document.documentElement.style.setProperty('--djhc-header-h', `${el.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const linkClass = 'rounded-md border border-transparent bg-white/[0.04] px-2.5 py-1.5 text-[13px] leading-none text-white/90 transition hover:border-gold/40 hover:bg-white/10';
  return (
    <header ref={ref} className="fixed inset-x-0 top-0 z-40 border-b border-white/10 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md" style={{ background: 'linear-gradient(180deg,rgba(8,14,32,.94),rgba(14,23,47,.92)),linear-gradient(90deg,#1d2f6f,#0c1326)' }}>
      <div className="mx-auto flex w-full max-w-[1700px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <a href={`${SITE}/`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3">
          <Image src={`${SITE}/assets/dj-logo.png`} alt="DJ's House of Cards & Comics logo" fittingType="fit" className="h-11 w-11 shrink-0 object-contain lg:h-14 lg:w-14" />
          <span className="flex min-w-0 flex-col gap-0.5 text-white">
            <span className="truncate text-xl leading-none lg:text-2xl" style={{ fontFamily: '"Lobster Two", cursive' }}>DJ's House of Cards</span>
            <span className="hidden text-xs uppercase tracking-[0.12em] text-white/75 lg:block" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>&amp; Comics • Trusted Hobby Finds</span>
          </span>
        </a>
        <nav aria-label="Primary navigation" className={`${navOpen ? 'flex' : 'hidden'} order-last w-full flex-wrap gap-1.5 lg:order-none lg:flex lg:w-auto`}>
          {PRIMARY.map(item => <span key={item.label} className="relative inline-flex items-center">
            <a href={item.href} target="_blank" rel="noopener noreferrer" className={item.submenu ? `${linkClass} rounded-r-none` : linkClass}>{item.label}</a>
            {item.submenu && <button type="button" aria-expanded={subOpen} aria-label={`Toggle ${item.label} submenu`} onClick={() => setSubOpen(value => !value)} className="rounded-l-none rounded-md border border-l-0 border-transparent bg-white/[0.04] px-1.5 py-1.5 text-white/80 transition hover:border-gold/40 hover:bg-white/10"><ChevronDown className={`h-3 w-3 transition ${subOpen ? 'rotate-180' : ''}`} /></button>}
            {item.submenu && subOpen && <span className="absolute left-0 top-full z-50 mt-1.5 block w-44 rounded-lg border border-white/15 bg-[#0a1229] p-2 shadow-2xl">{item.submenu.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="block rounded-md px-3 py-1.5 text-[13px] text-white/90 hover:bg-white/10">{label}</a>)}</span>}
          </span>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href={`${SITE}/account.html`} target="_blank" rel="noopener noreferrer" aria-label="Account" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/85 hover:border-gold/50 hover:text-gold"><User className="h-4 w-4" /></a>
          <button type="button" aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)} className="flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm text-white hover:bg-white/20"><MenuIcon className="h-4 w-4" />Menu</button>
          <span title="Dark mode — this app always runs in dark court mode" className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-canvas"><Moon className="h-4 w-4" /></span>
        </div>
      </div>
      <nav aria-label="Fan tools navigation" className="border-t border-white/10 bg-[#0a1020]/70">
        <div className="mx-auto flex w-full max-w-[1700px] items-center gap-1 overflow-x-auto px-4 py-1.5">
          {SUITE.map(([label, href, icon]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-current={label === 'SwishIQ Studio' ? 'page' : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${label === 'SwishIQ Studio' ? 'bg-gold/15 text-gold' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}><Image src={`${SITE}${icon}`} alt="" fittingType="fit" className="h-6 w-6 shrink-0 object-contain" />{label}</a>)}
        </div>
      </nav>
    </header>
  );
}