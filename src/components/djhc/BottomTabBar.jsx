import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, LineChart, Gamepad2, Dices, PackageOpen, UserRound } from 'lucide-react';
import useMobileWebView from '@/hooks/useMobileWebView';

// iOS-style bottom tab bar, rendered only inside a WebView/mobile session.
// Shortcuts to the main studio sections; the site footer is hidden in this
// mode (see public/djhc-chrome.css), so this becomes the app-level nav.
const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/analytics', label: 'Analysis', icon: LineChart },
  { to: '/daily-games', label: 'Daily', icon: Gamepad2 },
  { to: '/sims', label: 'Sims', icon: Dices },
  { to: '/collector', label: 'Cards', icon: PackageOpen },
  { to: '/account', label: 'Account', icon: UserRound },
];

export default function BottomTabBar() {
  const isWebView = useMobileWebView();
  if (!isWebView) return null;
  return (
    <nav aria-label="Main sections" className="fixed inset-x-0 bottom-0 z-[1100] border-t border-gold/25 bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-6">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-wide ${isActive ? 'text-gold' : 'text-muted-foreground'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}