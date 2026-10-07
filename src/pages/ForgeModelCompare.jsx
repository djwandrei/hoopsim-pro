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
        <p className="mt-1 text-xs text-muted-foreground">Rebuilt anatomical surfaces in the reference’s airborne pose. The body stays silhouetted; locked skills illuminate only the edge.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="court-panel overflow-hidden">
          <div className="h-[480px] bg-canvas/60">
            <ForgeFigure3D filled={0} total={9} variant="reference" className="h-full w-full" />
          </div>
          <div className="border-t border-border/35 p-4">
            <h2 className="court-display text-lg tracking-wide">Cold — Silhouette</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Matte-black silhouette: continuous shoulders and limbs, split shorts, gripping hand, forward knee and tucked trailing leg.</p>
          </div>
        </div>
        <div className="court-panel overflow-hidden">
          <div className="h-[480px] bg-canvas/60">
            <ForgeFigure3D filled={9} total={9} complete variant="reference" className="h-full w-full" />
          </div>
          <div className="border-t border-border/35 p-4">
            <h2 className="court-display text-lg tracking-wide">Forged — Silhouette</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Same black body and reference pose, with a gold edge indicating the completed build—no face or surface detailing.</p>
          </div>
        </div>
      </div>
    </div>
  );
}