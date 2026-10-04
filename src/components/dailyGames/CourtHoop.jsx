import React from 'react';
import { courtArc, courtRect, courtPoints, projectCourt } from '@/components/dailyGames/courtGeometry';

export default function CourtHoop() {
  const pole = courtPoints([[25, -2, 0], [25, -2, 13], [25, 4, 12]]);
  return (
    <g aria-hidden="true">
      <path d={courtArc(25, 5.25, 1.6) + ' Z'} fill="hsl(var(--court-canvas) / .32)" />
      <polyline points={pole} fill="none" stroke="hsl(var(--court-raised))" strokeWidth="10" strokeLinejoin="round" />
      <polyline points={pole} fill="none" stroke="hsl(var(--court-muted) / .5)" strokeWidth="3" strokeLinejoin="round" />
      <polygon points={courtPoints([[22, 4, 10], [28, 4, 10], [28, 4, 13.5], [22, 4, 13.5]])} fill="hsl(var(--court-glass) / .17)" stroke="hsl(var(--court-line))" strokeWidth="2.5" />
      <polygon points={courtPoints([[22, 4, 13.5], [28, 4, 13.5], [28, 4.2, 13.7], [22, 4.2, 13.7]])} fill="hsl(var(--court-glass) / .5)" />
      <polygon points={courtPoints([[24, 4, 10.15], [26, 4, 10.15], [26, 4, 11.65], [24, 4, 11.65]])} fill="none" stroke="hsl(var(--court-line))" strokeWidth="1.7" />
      <polygon points={courtPoints([[22.6, 4, 12.9], [24.2, 4, 12.9], [23.2, 4, 10.5], [21.9, 4, 10.5]])} fill="hsl(0 0% 100% / .14)" />
      <polygon points={courtRect(22, 3.85, 28, 4.2, 10)} fill="hsl(var(--court-canvas))" />
      <polyline points={courtPoints([[25, 4, 10], [25, 5.25, 10]])} stroke="hsl(var(--court-rim))" strokeWidth="4" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = i * Math.PI / 6;
        const top = projectCourt(25 + Math.cos(a) * .9, 5.25 + Math.sin(a) * .9, 10);
        const bottom = projectCourt(25 + Math.cos(a + .45) * .52, 5.25 + Math.sin(a + .45) * .52, 8.2);
        return <line key={i} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke="hsl(var(--court-line) / .85)" strokeWidth="1" />;
      })}
      {[9.4, 8.8, 8.2].map(height => <path key={height} d={courtArc(25, 5.25, .52 + (height - 8.2) * .21, 0, Math.PI * 2, height)} fill="none" stroke="hsl(var(--court-line) / .6)" strokeWidth=".9" />)}
      <path d={courtArc(25, 5.25, .9, 0, Math.PI * 2, 10)} fill="none" stroke="hsl(var(--court-canvas) / .65)" strokeWidth="5" />
      <path d={courtArc(25, 5.25, .9, 0, Math.PI * 2, 10)} fill="none" stroke="hsl(var(--court-rim) / .3)" strokeWidth="8" />
      <path d={courtArc(25, 5.25, .9, 0, Math.PI * 2, 10)} fill="none" stroke="hsl(var(--court-rim))" strokeWidth="3" />
    </g>
  );
}