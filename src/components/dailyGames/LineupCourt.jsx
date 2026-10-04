import React from 'react';
import { Ban } from 'lucide-react';
import { playerAsset } from '@/components/studio/teamAssets';

// Half-court slots by primary position; players land on their first listed slot.
const SLOTS = {
  G: [{ x: 82, y: 46 }, { x: 78, y: 72 }],
  F: [{ x: 52, y: 58 }, { x: 56, y: 80 }],
  C: [{ x: 47, y: 32 }],
};

function CourtMarker({ player, outgoing, label }) {
  const headshot = playerAsset(player.headshotPath || null);
  return (
    <foreignObject x={player._slotX - 26} y={player._slotY - 26} width={52} height={64}>
      <div className="dg-court__marker" xmlns="http://www.w3.org/1999/xhtml">
        <div className={`dg-court__avatar ${outgoing ? 'dg-court__avatar--out' : ''}`} xmlns="http://www.w3.org/1999/xhtml">
          {headshot
            ? <img src={headshot} alt="" className="" />
            : <span className="font-display text-xs text-foreground">{player.displayName.slice(0, 2).toUpperCase()}</span>}
        </div>
        <span className="dg-court__name" xmlns="http://www.w3.org/1999/xhtml">{player.displayName}</span>
        {label && <span className={`dg-court__tag ${outgoing ? 'dg-court__tag--out' : 'dg-court__tag--in'}`} xmlns="http://www.w3.org/1999/xhtml">{label}</span>}
      </div>
    </foreignObject>
  );
}

export default function LineupCourt({ lineup, removedPlayerRef, incomingPlayer, incomingLabel = 'Incoming' }) {
  const placed = [];
  const used = new Map();
  for (const player of lineup) {
    const positions = Array.isArray(player.positions) ? player.positions : [];
    let slot = null;
    for (const position of positions) {
      const list = SLOTS[position] || [];
      const index = used.get(position) || 0;
      if (index < list.length) { slot = list[index]; used.set(position, index + 1); break; }
    }
    if (!slot) { const list = SLOTS.F; const index = used.get('F') || 0; slot = list[Math.min(index, list.length - 1)]; used.set('F', index + 1); }
    placed.push({ ...player, _slotX: slot.x, _slotY: slot.y });
  }
  const removed = placed.find(player => player.playerRef === removedPlayerRef);
  return (
    <div className="dg-court">
      <span className="dg-court__badge"><Ban className="h-2.5 w-2.5 text-trim" /> marked swap</span>
      <svg viewBox="0 0 100 100" className="h-auto w-full" role="img" aria-label="Starting five on the half court">
        <defs>
          <radialGradient id="dg-court-glow" cx="50%" cy="20%" r="80%">
            <stop offset="0%" stopColor="hsl(43 78% 60% / .08)" />
            <stop offset="100%" stopColor="hsl(223 24% 5.7%)" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#dg-court-glow)" />
        <g stroke="hsl(43 78% 60% / .3)" strokeWidth=".45" fill="none">
          <rect x="4" y="4" width="92" height="92" />
          <circle cx="50" cy="50" r="12" />
          <line x1="50" y1="4" x2="50" y2="96" />
          <rect x="32" y="4" width="36" height="24" />
          <circle cx="50" cy="18" r="4" />
          <path d="M 6 82 A 44 44 0 0 0 94 82" />
        </g>
        <rect x="46" y="4" width="8" height="2" fill="hsl(43 78% 60% / .85)" />
        {placed.filter(player => player.playerRef !== removedPlayerRef).map(player => (
          <CourtMarker key={player.playerRef} player={player} />
        ))}
        {removed && <CourtMarker player={removed} outgoing label="Outgoing" />}
        {incomingPlayer && removed && (
          <g>
            <line
              x1={removed._slotX} y1={removed._slotY + 10}
              x2={removed._slotX} y2={removed._slotY + 16}
              stroke="hsl(43 78% 60% / .9)" strokeWidth=".9" strokeLinecap="round"
            />
            <path d={`M ${removed._slotX - 1.6} ${removed._slotY + 15} L ${removed._slotX + 1.6} ${removed._slotY + 15} L ${removed._slotX} ${removed._slotY + 17.5} Z`} fill="hsl(43 78% 60% / .9)" />
            <foreignObject x={removed._slotX - 26} y={removed._slotY + 18} width={52} height={14}>
              <div className="flex justify-center" xmlns="http://www.w3.org/1999/xhtml">
                <span className="dg-court__name" style={{ background: 'hsl(43 78% 60%)', color: 'hsl(223 24% 5.7%)' }} xmlns="http://www.w3.org/1999/xhtml">{incomingPlayer.displayName}</span>
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
    </div>
  );
}