import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { playerAsset } from '@/components/studio/teamAssets';
export default function PlayerPortrait({ player, className = 'h-24 w-24', frameless = false }) {
  const url = playerAsset(player.headshotPath);
  const [failed,setFailed] = useState(false);
  const name = player.name || player.displayName || '';
  const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0,2).join('');
  return <div className={`relative shrink-0 overflow-hidden ${frameless ? '' : 'rounded-2xl border border-border/35 bg-raised/40'} ${className}`}>{url && !failed ? <Image src={url} alt={`${name} portrait`} fittingType="fit" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <span className="flex h-full w-full items-center justify-center font-display text-3xl text-gold">{initials}</span>}</div>;
}