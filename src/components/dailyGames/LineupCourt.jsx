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
      <span className="dg-court__shadow" aria-hidden="true" />
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

export default function LineupCourt({ lineup, removedPlayerRef, incomingPlayer, incomingLabel = 'Incoming', slim = false }) {
  const slots = allocateSlots(lineup);
  const placed = lineup.map((player, index) => ({ ...player, _x: slots[index].x, _y: slots[index].y }));
  const removed = placed.find(player => player.playerRef === removedPlayerRef);
  return (
    <div className={`dg-court ${slim ? 'dg-court--slim' : ''}`}>
      <div className="dg-court__scene">
        <div className="dg-court__floor" aria-hidden="true" />
        <div className="dg-court__sheen" aria-hidden="true" />
        <svg className="dg-court__lines" viewBox="0 0 100 94" preserveAspectRatio="none" aria-hidden="true">
          <rect x="3" y="3" width="94" height="88" fill="none" stroke="hsl(43 78% 66% / .5)" strokeWidth=".5" />
          <rect x="38" y="3" width="24" height="17" fill="hsl(var(--court-accent) / .08)" stroke="hsl(43 78% 66% / .55)" strokeWidth=".5" />
          <circle cx="50" cy="9" r="2.5" fill="none" stroke="hsl(43 78% 66% / .55)" strokeWidth=".5" />
          <circle cx="50" cy="20" r="5" fill="none" stroke="hsl(43 78% 66% / .45)" strokeWidth=".5" />
          <path d="M 8 20 A 42 42 0 0 0 92 20" fill="none" stroke="hsl(43 78% 66% / .45)" strokeWidth=".5" />
          <line x1="3" y1="91" x2="97" y2="91" stroke="hsl(43 78% 66% / .45)" strokeWidth=".5" />
          <path d="M 44 91 A 6 6 0 0 1 56 91" fill="none" stroke="hsl(43 78% 66% / .45)" strokeWidth=".5" />
          <rect x="45" y="4" width="10" height="1.8" fill="hsl(0 0% 96% / .8)" />
          <ellipse cx="50" cy="7.6" rx="3.2" ry="1.2" fill="hsl(12 68% 48% / .9)" />
          <path d="M 46.8 7.8 L 47.6 11.4 M 50 8.4 L 50 11.6 M 53.2 7.8 L 52.4 11.4" stroke="hsl(0 0% 96% / .65)" strokeWidth=".35" fill="none" />
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
      <span className="dg-court__badge"><Ban className="h-2.5 w-2.5 text-trim" /> marked swap</span>
    </div>
  );
}