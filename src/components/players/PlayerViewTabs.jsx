import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, FolderOpen } from 'lucide-react';
const VIEWS = [['/players','League atlas',Compass],['/players/dossier','Player dossier',FolderOpen]];
export default function PlayerViewTabs() {
  const { pathname } = useLocation();
  return <nav aria-label="Player Blueprint sections" className="flex flex-wrap gap-1 rounded-xl border border-border/30 bg-canvas/50 p-1">{VIEWS.map(([path,label,Icon]) => <Link key={path} to={path} className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 text-xs transition-colors ${pathname === path ? 'border-gold/30 bg-gold/10 font-semibold text-gold' : 'border-transparent font-medium text-muted-foreground hover:bg-raised hover:text-foreground'}`}><Icon className="h-3.5 w-3.5" />{label}</Link>)}</nav>;
}