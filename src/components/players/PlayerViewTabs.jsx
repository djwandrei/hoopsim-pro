import React from 'react';
import { Link, useLocation } from 'react-router-dom';
const VIEWS = [['/players','League atlas'],['/players/dossier','Player dossier']];
export default function PlayerViewTabs() {
  const { pathname } = useLocation();
  return <nav aria-label="Player Blueprint sections" className="flex flex-wrap gap-1 rounded-xl border border-border/30 bg-canvas/50 p-1">{VIEWS.map(([path,label]) => <Link key={path} to={path} className={`flex min-h-11 items-center rounded-lg border px-4 text-xs transition-colors ${pathname === path ? 'border-gold/30 bg-gold/10 font-semibold text-gold' : 'border-transparent font-medium text-muted-foreground hover:bg-raised hover:text-foreground'}`}>{label}</Link>)}</nav>;
}