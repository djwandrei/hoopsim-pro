import React from 'react';
import { Image } from '@/components/ui/image';

// Fan-tool emblem with a letter fallback for tools the live site lists without
// an emblem asset, so every drawer entry renders a complete tile.
export default function ToolEmblem({ emblem, label, className = '' }) {
  if (!emblem) {
    return <span className={`tool-emblem-fallback ${className}`} aria-hidden="true">{(label || '?').trim().slice(0, 1)}</span>;
  }
  return <Image src={emblem} alt="" fittingType="fit" className={className} />;
}