import React from 'react';
import { Ban } from 'lucide-react';
import { playerAsset } from '@/components/studio/teamAssets';

// Half-court slots (percent of the court) by primary position; players land
// on their first listed slot, falling back to a forward slot.
const SLOTS = {
  C: [{ x: 50, y: 16 }],
  F: [{ x: 20, y: 40 }, { x: 80, y: 40 }],
  G: [{ x: 34, y: 76 }, { x: 66, y: 76 }],
};

function initials(name) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function CourtMarker({ x, y, player, tone = 'starter', tag, sub }) {
  const headshot = playerAsset(player.headshotPath || null);
  return (
    <div className={`dg-court__marker dg-court__marker--${tone}`} style={{ left: `${x}%`, top: `${y}%` }}>
      <span className={`dg-court__avatar dg-court__avatar--${tone}`}>
        {headshot
          ? <img src={headshot} alt="" />
          : <span className="font-display text-xs text-foreground">{initials(player.displayName)}</span>}
      </span>
      <span className="dg-court__name">{player.displayName}</span>
      {sub && <span className="dg-court__sub">for {sub}</span>}
      {tag && <span className={`dg-court__tag dg-court__tag--${tone}`}>{tag}</span>}
    </div>
  );
}

export default function LineupCourt({ lineup, removedPlayerRef, incomingPlayer, incomingLabel = 'Incoming' }) {
  const used = new Map();
  const placed = lineup.map(player => {
    const positions = Array.isArray(player.positions) ? player.positions : [];
    let slot = null;
    for (const position of positions) {
      const list = SLOTS[position] || [];
      const index = used.get(position) || 0;
      if (index < list.length) { slot = list[index]; used.set(position, index + 1); break; }
    }
    if (!slot) {
      const list = SLOTS.F;
      const index = used.get('F') || 0;
      slot = list[Math.min(index, list.length - 1)];
      used.set('F', index + 1);
    }
    return { ...player, _x: slot.x, _y: slot.y };
  });
  const removed = placed.find(player => player.playerRef === removedPlayerRef);
  return (
    <div className="dg-court">
      <span className="dg-court__badge"><Ban className="h-2.5 w-2.5 text-trim" /> marked swap</span>
      <svg className="dg-court__lines" viewBox="0 0 100 94" preserveAspectRatio="none" aria-hidden="true">
        <g stroke="hsl(43 78% 60% / .3)" strokeWidth=".5" fill="none">
          <rect x="3" y="3" width="94" height="88" />
          <rect x="38" y="3" width="24" height="17" />
          <circle cx="50" cy="9" r="2.5" />
          <circle cx="50" cy="20" r="5" />
          <path d="M 8 20 A 42 42 0 0 0 92 20" />
        </g>
        <rect x="46" y="3" width="8" height="2" fill="hsl(43 78% 60% / .85)" />
      </svg>
      {placed.filter(player => player.playerRef !== removedPlayerRef).map(player => (
        <CourtMarker key={player.playerRef} x={player._x} y={player._y} player={player} />
      ))}
      {removed && !incomingPlayer && (
        <CourtMarker x={removed._x} y={removed._y} player={removed} tone="out" tag="Outgoing" />
      )}
      {removed && incomingPlayer && (
        <CourtMarker x={removed._x} y={removed._y} player={incomingPlayer} tone="in" tag={incomingLabel} sub={removed.displayName} />
      )}
    </div>
  );
}