import React from 'react';
import { initials } from './chemistryFormat';

export default function PlayerAvatar({ player, tone = 'royal' }) {
  const name = player?.displayName || '';
  const toneClass = tone === 'gold' ? 'border-gold/60 text-gold shadow-gold/10' : 'border-royal/60 text-foreground shadow-royal/10';
  return <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 bg-raised font-display text-xl ${toneClass}`}>{initials(name)}</span>;
}