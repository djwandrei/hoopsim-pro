import React from 'react';
export default function PlayCourtArt({ fullCourt = false }) {
  if (fullCourt) return <g><PlayCourtArt /><g transform="rotate(180 250 470)"><PlayCourtArt /></g><line x1="8" x2="492" y1="470" y2="470" stroke="hsl(var(--court-line) / .9)" strokeWidth="2.4" /></g>;
  return <g>
    <rect x="2" y="2" width="496" height="466" rx="14" fill="url(#pb-floor)" stroke="hsl(var(--court-wood-dark) / 0.85)" strokeWidth="3" />
    <g stroke="hsl(var(--court-wood-dark) / 0.16)" strokeWidth="1">{[86,172,258,344,430].map(x => <line key={x} x1={x} y1="4" x2={x} y2="466" />)}</g>
    <rect x="170" y="6" width="160" height="184" fill="url(#pb-paint)" />
    <g stroke="hsl(var(--court-line) / 0.9)" fill="none" strokeWidth="2.4">
      <rect x="8" y="8" width="484" height="454" rx="8" />
      <path d="M 30 0 L 30 128 A 237 237 0 0 0 470 128 L 470 0" strokeWidth="2.2" />
      <rect x="170" y="6" width="160" height="184" /><line x1="170" y1="190" x2="330" y2="190" /><circle cx="250" cy="190" r="60" />
      <g strokeWidth="1.6">{[46,76,106,136,166].map(y => <React.Fragment key={y}><line x1="164" y1={y} x2="156" y2={y} /><line x1="336" y1={y} x2="344" y2={y} /></React.Fragment>)}</g>
    </g>
    <path d="M 219 58 Q 250 86 281 58" fill="none" stroke="hsl(var(--court-line) / 0.6)" strokeWidth="1.8" />
    <line x1="216" y1="15" x2="284" y2="15" strokeWidth="5" strokeLinecap="round" stroke="hsl(var(--court-line) / 0.95)" />
    <circle cx="250" cy="44" r="9" fill="none" stroke="hsl(var(--court-rim))" strokeWidth="3.5" />
    <g stroke="hsl(var(--court-line) / 0.5)" strokeWidth="1"><line x1="244" y1="52" x2="246" y2="66" /><line x1="256" y1="52" x2="254" y2="66" /><line x1="246" y1="66" x2="254" y2="66" /></g>
    <circle cx="250" cy="470" r="62" fill="none" stroke="hsl(var(--court-line) / 0.9)" strokeWidth="2.4" />
    <text x="250" y="262" textAnchor="middle" fontSize="27" fontWeight="800" letterSpacing="12" fill="hsl(var(--court-accent) / 0.09)" style={{ fontFamily: 'var(--font-display)' }}>SWISHIQ</text>
  </g>;
}