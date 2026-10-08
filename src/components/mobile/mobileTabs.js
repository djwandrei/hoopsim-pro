import { Home, LineChart, Gamepad2, Dices, PackageOpen, UserRound } from 'lucide-react';

// Bottom-tab registry for the mobile WebView keep-alive layout. Each tab owns
// a set of route prefixes; `to` is the tab's root shortcut used by the tab bar.
export const MOBILE_TABS = [
  { id: 'home', to: '/', prefixes: ['/'], label: 'Home', icon: Home },
  { id: 'analysis', to: '/analytics', prefixes: ['/analytics', '/players', '/chemistry', '/lineup-lab'], label: 'Analysis', icon: LineChart },
  { id: 'daily', to: '/daily-games', prefixes: ['/daily-games'], label: 'Daily', icon: Gamepad2 },
  { id: 'sims', to: '/sims', prefixes: ['/sims', '/forge', '/spin', '/forge-models'], label: 'Sims', icon: Dices },
  { id: 'cards', to: '/collector', prefixes: ['/collector', '/matchups', '/packs'], label: 'Cards', icon: PackageOpen },
  { id: 'account', to: '/account', prefixes: ['/account', '/book', '/real-book', '/playbook', '/workshop', '/tools', '/pool-mockup'], label: 'Account', icon: UserRound },
];

// Which tab owns a route (first prefix match wins).
export function tabForPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return MOBILE_TABS.find(t => t.prefixes.some(p => path === p || path.startsWith(`${p}/`))) || null;
}