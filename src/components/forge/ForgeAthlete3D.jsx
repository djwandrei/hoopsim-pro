import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import useForgeAthlete from '@/components/forge/useForgeAthlete';
import { DEFAULT_WARDROBE_EDITIONS } from '@/components/forge/forgeWardrobeRules';

const EMPTY_PICKS = {};
export default function ForgeAthlete3D({ picks = EMPTY_PICKS, editions = DEFAULT_WARDROBE_EDITIONS, spinning = false, rotating = true, viewAngle = 0, className = '' }) {
  const hostRef = useRef(null), stateRef = useRef(null);
  const [version, setVersion] = useState(0);
  stateRef.current = { spinning, rotating, viewAngle };
  const { loading, error, wardrobeLoading } = useForgeAthlete(hostRef, stateRef, picks, editions, version);
  return <div className={`relative h-full w-full ${className}`}>
    <div ref={hostRef} role="img" aria-label={`Composite athlete in a dunk pose, ${Object.keys(picks).length} of 9 skills forged`} className="absolute inset-0" />
    {(loading || wardrobeLoading) && <div role="status" className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded bg-card/90 p-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{loading ? 'Loading athlete…' : 'Loading uniform…'}</div>}
    {error && <div role="alert" className="absolute inset-x-0 bottom-0 rounded border border-border bg-card p-2 text-center text-[10px] text-foreground"><p>{error}</p><button type="button" onClick={() => setVersion(value => value + 1)} className="mt-1 min-h-9 rounded border border-gold/50 px-3 text-gold">Retry athlete</button></div>}
  </div>;
}