import React from 'react';
import { Link } from 'react-router-dom';

const NAV = [
  ['/', 'STUDIO'],
  ['/season', 'SEASON'],
  ['/players', 'BLUEPRINT'],
  ['/chemistry', 'CHEMISTRY'],
  ['/forge', 'FORGE'],
  ['/game', 'GAME'],
  ['/career', 'CAREER'],
];

export default function StudioShell({ active, children }) {
  return (
    <div className="min-h-screen bg-canvas">
      <nav className="sticky top-0 z-30 border-b border-border/50 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2">
          <Link to="/" className="mr-3 whitespace-nowrap font-display text-lg tracking-widest text-gold">
            SWISHIQ
          </Link>
          {NAV.map(([path, label]) => (
            <Link
              key={path}
              to={path}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-display text-sm tracking-widest transition-colors ${
                active === path ? 'bg-royal text-white' : 'text-muted-foreground hover:bg-raised'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}