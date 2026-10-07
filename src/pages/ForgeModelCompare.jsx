import React from 'react';
import ForgeFigure3D from '@/components/forge/ForgeFigure3D';

// Temporary comparison page: renders the three Forge figure sculpt variants
// side by side so the direction can be picked, then gets retired.
const VARIANTS = [
  { key: 'character', label: 'Stylized Character', note: 'Simplified smooth anatomy, big head, baggy shorts, chunky high-tops — bold basketball silhouette.' },
  { key: 'natural', label: 'Natural Proportions', note: 'Lifelike 7.5-head build: sculpted hands with thumbs, jaw, nose, defined quads and calves.' },
  { key: 'faceted', label: 'Faceted Sculpture', note: 'Angular low-poly planes — icosahedral volumes and chiseled shells, flat shading.' },
];

export default function ForgeModelCompare() {
  return (
    <div className="studio-workspace min-h-screen bg-canvas px-6 py-8">
      <header className="mb-6">
        <p className="court-kicker">Forge Lab</p>
        <h1 className="court-display text-3xl">Figure Model Directions</h1>
        <p className="mt-1 text-xs text-muted-foreground">Three complete sculpts, same lighting and forge animation. Pick a direction and the rest get retired.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {VARIANTS.map((variant, index) => (
          <div key={variant.key} className="court-panel overflow-hidden" style={{ '--rise-delay': `${index * 90}ms` }}>
            <div className="h-[430px] bg-canvas/60">
              <ForgeFigure3D filled={9} total={9} complete variant={variant.key} className="h-full w-full" />
            </div>
            <div className="border-t border-border/35 p-4">
              <h2 className="court-display text-lg tracking-wide">{variant.label}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{variant.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}