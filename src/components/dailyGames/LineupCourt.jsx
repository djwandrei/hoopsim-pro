import React from 'react';
import { Ban } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { playerAsset } from '@/components/studio/teamAssets';

// Half-court slots by primary position; players land on their first listed slot.
const SLOTS = {
  G: [{ x: 82, y: 46 }, { x: 78, y: 72 }],
  F: [{ x: 52, y: 58 }, { x: 56, y: 80 }],
  C: [{ x: 47, y: 32 }],
};

function CourtMarker({ player, tone, label }) {
  const headshot = playerAsset(player.headshotPath || null);
  return (
    <foreignObject x={player._slotX - 26} y={player._slotY - 26} width={52} height={62}>
      <div className="flex flex-col items-center gap-0.5" xmlns="http://www.w3.org/1999/xhtml">
        <div className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 ${tone}`} xmlns="http://www.w3.org/1999/xhtml">
          {headshot
            ? <img src={headshot} alt="" className="h-full w-full object-cover" />
            : <span className="font-display text-xs">{player.displayName.slice(0, 2).toUpperCase()}</span>}
        </div>
        <span className="max-w-[70px] truncate rounded bg-canvas/80 px-1 text-[8px] font-semibold uppercase tracking-wider text-foreground" xmlns="http://www.w3.org/1999/xhtml">{player.displayName}</span>
        {label && <span className="rounded bg-trim/80 px-1 text-[7px] font-bold uppercase tracking-wider text-white" xmlns="http://www.w3.org/1999/xhtml">{label}</span>}
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
    <div className="relative overflow-hidden rounded-xl border border-border/30 bg-canvas/60">
      <svg viewBox="0 0 100 100" className="h-auto w-full" role="img" aria-label="Starting five on the half court">
        <rect width="100" height="100" fill="hsl(223 24% 5.7%)" />
        <g stroke="hsl(43 78% 60% / .28)" strokeWidth=".5" fill="none">
          <rect x="4" y="4" width="92" height="92" />
          <circle cx="50" cy="50" r="12" />
          <line x1="50" y1="4" x2="50" y2="96" />
          <rect x="32" y="4" width="36" height="24" />
          <circle cx="50" cy="18" r="4" />
          <path d="M 6 82 A 44 44 0 0 0 94 82" />
        </g>
        <rect x="46" y="4" width="8" height="2" fill="hsl(43 78% 60% / .8)" />
        {placed.filter(player => player.playerRef !== removedPlayerRef).map(player => (
          <CourtMarker key={player.playerRef} player={player} tone="border-positive/70" />
        ))}
        {removed && <CourtMarker player={removed} tone="border-trim" label="Outgoing" />}
        {incomingPlayer && removed && (
          <g>
            <line x1={removed._slotX - 8} y1={removed._slotY + 12} x2={removed._slotX + 8} y2={removed._slotY + 12} stroke="hsl(43 78% 60% / .8)" strokeWidth=".8" markerEnd="none" />
            <foreignObject x={removed._slotX - 24} y={removed._slotY + 13} width={48} height={40}>
              <div className="flex justify-center" xmlns="http://www.w3.org/1999/xhtml">
                <span className="max-w-[68px] truncate rounded bg-gold px-1 text-[8px] font-bold uppercase tracking-wider text-canvas" xmlns="http://www.w3.org/1999/xhtml">{incomingPlayer.displayName}</span>
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border/40 bg-canvas/70 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-muted-foreground"><Ban className="h-2.5 w-2.5 text-trim" /> marked swap</span>
    </div>
  );
}