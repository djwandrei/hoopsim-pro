import React from 'react';
import ForgeFigure3D from '@/components/forge/ForgeFigure3D';

// Reference-direction preview: the dunk-pose silhouette sculpt shown cold
// (unforged) and fully forged, side by side.
export default function ForgeModelCompare() {
  return (
    <div className="studio-workspace min-h-screen bg-canvas px-6 py-8">
      <header className="mb-6">
        <p className="court-kicker">Forge Lab</p>
        <h1 className="court-display text-3xl">Reference Silhouette — Forge States</h1>
        <p className="mt-1 text-xs text-muted-foreground">The dunk-pose sculpt stays a near-black silhouette until skills lock in; each locked skill ignites its segment to molten gold.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="court-panel overflow-hidden">
          <div className="h-[480px] bg-canvas/60">
            <ForgeFigure3D filled={0} total={9} variant="reference" className="h-full w-full" />
          </div>
          <div className="border-t border-border/35 p-4">
            <h2 className="court-display text-lg tracking-wide">Cold — Silhouette</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Zero skills locked: matte black figure, rim light tracing the outline.</p>
          </div>
        </div>
        <div className="court-panel overflow-hidden">
          <div className="h-[480px] bg-canvas/60">
            <ForgeFigure3D filled={9} total={9} complete variant="reference" className="h-full w-full" />
          </div>
          <div className="border-t border-border/35 p-4">
            <h2 className="court-display text-lg tracking-wide">Forged — Molten Gold</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">All nine skills locked: every segment ignited, basketball lit.</p>
          </div>
        </div>
      </div>
    </div>
  );
}