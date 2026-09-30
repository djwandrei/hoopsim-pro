import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
export default function TeamMark({ code, name, className = 'h-12 w-12' }) {
  const src = teamAsset(code);
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-border/40 bg-raised/50 p-2 ${className}`}>{src ? <Image src={src} alt={name || `${code} team logo`} className="h-full w-full object-contain" fittingType="fit" loading="lazy" /> : <span className="font-display text-xl text-gold">{code || 'SQ'}</span>}</span>;
}