import React from 'react';
import ForgeFigure3D from '@/components/forge/ForgeFigure3D';

const VIEWS = [
  { label: 'Side', angle: .63, detail: 'Ball arm height, head scale, front knee and trailing shoe against the side reference.' },
  { label: 'Front', angle: -.94, detail: 'Shoulder symmetry, ball placement, jersey width and split shorts.' },
  { label: 'Rear three-quarter', angle: 1.9, detail: 'Back contour, trailing hand and the kicked-back shoe.' },
  { label: 'Front three-quarter', angle: 0, detail: 'The live Forge Lab view: continuous rotation starts from this angle.' }
];

export default function ForgeModelCompare() {
  return <div className="studio-workspace min-h-screen bg-canvas px-4 py-6 sm:px-6 sm:py-8">
    <header className="mb-6">
      <p className="court-kicker">Forge Lab</p>
      <h1 className="court-display text-3xl">Reference Silhouette — Three Views</h1>
      <p className="mt-1 text-xs text-muted-foreground">Fixed angles for inspecting the same sculpt. The model in Forge Lab continues rotating.</p>
    </header>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {VIEWS.map(view => <div key={view.label} className="court-panel overflow-hidden">
        <div className="h-[420px] bg-canvas/60"><ForgeFigure3D filled={0} total={9} variant="reference" rotating={false} viewAngle={view.angle} className="h-full w-full" /></div>
        <div className="border-t border-border/35 p-4">
          <h2 className="court-display text-lg tracking-wide">{view.label}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{view.detail}</p>
        </div>
      </div>)}
    </div>
  </div>;
}