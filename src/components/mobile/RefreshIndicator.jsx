import React from 'react';
import { Loader2 } from 'lucide-react';
import { REFRESH_THRESHOLD } from '@/components/mobile/useTouchRefresh';

export default function RefreshIndicator({ pull, refreshing }) {
  return <div className="pointer-events-none grid place-items-center overflow-hidden text-gold"
    style={{ height: pull, opacity: Math.min(pull / 44, 1) }} role="status" aria-live="polite">
    <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card px-3 py-2 text-xs shadow-sm">
      <Loader2 className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true"
        style={refreshing ? undefined : { transform: `rotate(${pull * 2}deg)` }} />
      <span>{refreshing ? 'Refreshing…' : pull >= REFRESH_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
    </div>
  </div>;
}