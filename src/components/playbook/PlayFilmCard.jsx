import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Image } from '@/components/ui/image';
export default function PlayFilmCard({ film }) {
  const [showClip, setShowClip] = useState(false);
  return <div className="flex min-w-0 flex-col rounded-lg border border-gold/25 bg-gold/5">
    <a href={film.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1 p-3 transition-colors hover:bg-gold/10">
      <span className="flex items-start justify-between gap-2 text-xs font-semibold text-foreground">{film.label}<ExternalLink className="h-3.5 w-3.5 shrink-0 text-gold" /></span>
      <span className="font-mono text-[10.4px] text-gold">{film.relation} · {film.format}</span>
      <span className="text-[11px] leading-relaxed text-muted-foreground">{film.detail}</span>
    </a>
    {film.clipUrl && <div className="px-3 pb-3">
      <button type="button" onClick={() => setShowClip(value => !value)} aria-expanded={showClip} className="min-h-9 rounded-md border border-gold/35 px-3 text-xs font-semibold text-gold">{showClip ? 'Hide game clip' : 'Show game clip'}</button>
      {showClip && <Image src={film.clipUrl} alt={`Real game footage: ${film.label}`} className="mt-2 aspect-video w-full rounded-md" fittingType="fit" />}
    </div>}
  </div>;
}