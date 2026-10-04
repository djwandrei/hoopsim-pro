import React from 'react';
import { Ban } from 'lucide-react';
import { playerAsset } from '@/components/studio/teamAssets';

// Half-court slot pool (percent of the court). Positions list their preferred
// spots first; the allocator never lets two markers share a slot.
const SLOTS = {
  C: [{ x: 50, y: 14 }, { x: 50, y: 27 }],
  F: [{ x: 22, y: 44 }, { x: 78, y: 44 }, { x: 36, y: 30 }, { x: 64, y: 30 }],
  G: [{ x: 30, y: 78 }, { x: 70, y: 78 }, { x: 50, y: 63 }],
};
const ALL_SLOTS = [...SLOTS.C, ...SLOTS.F, ...SLOTS.G];

function allocateSlots(lineup) {
  const taken = new Set();
  const slotKey = slot => `${slot.x},${slot.y}`;
  const positionsOf = player => (Array.isArray(player.positions) ? player.positions : []);

  const assigned = lineup.map(() => null);
  // Pass 1: each player takes the first free slot among their listed positions.
  lineup.forEach((player, index) => {
    for (const position of positionsOf(player)) {
      const slot = (SLOTS[position] || []).find(candidate => !taken.has(slotKey(candidate)));
      if (slot) { assigned[index] = slot; taken.add(slotKey(slot)); break; }
    }
  });
  // Pass 2: anyone still unplaced takes the free slot closest to their
  // preferred spots — so extra centers spread around the key instead of
  // stacking on a forward slot.
  lineup.forEach((player, index) => {
    if (assigned[index]) return;
    const preferred = positionsOf(player).flatMap(position => SLOTS[position] || []);
    const anchors = preferred.length ? preferred : ALL_SLOTS;
    const free = ALL_SLOTS.filter(slot => !taken.has(slotKey(slot)));
    if (!free.length) { assigned[index] = ALL_SLOTS[0]; return; }
    let best = free[0];
    let bestDistance = Infinity;
    for (const slot of free) {
      const distance = Math.min(...anchors.map(anchor => (anchor.x - slot.x) ** 2 + (anchor.y - slot.y) ** 2));
      if (distance < bestDistance) { bestDistance = distance; best = slot; }
    }
    assigned[index] = best;
    taken.add(slotKey(best));
  });
  return assigned;
}

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
  const slots = allocateSlots(lineup);
  const placed = lineup.map((player, index) => ({ ...player, _x: slots[index].x, _y: slots[index].y }));
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