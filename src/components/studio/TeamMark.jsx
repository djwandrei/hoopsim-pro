import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
export default function TeamMark({ code, name, className = 'h-16 w-16' }) {
  const src = teamAsset(code);
  return src
    ? <Image src={src} alt={name || `${code} team logo`} className={`shrink-0 object-contain ${className}`} fittingType="fit" loading="lazy" />
    : <span className={`inline-flex shrink-0 items-center justify-center font-display text-xl text-gold ${className}`}>{code || 'SQ'}</span>;
}