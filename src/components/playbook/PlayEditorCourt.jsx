import React, { useRef } from 'react';
import PlayCourtArt from '@/components/playbook/PlayCourtArt';
import PlayCourtDefs from '@/components/playbook/PlayCourtDefs';
import PlayPlayer from '@/components/playbook/PlayPlayer';
import PlayDefender from '@/components/playbook/PlayDefender';
import { clampPoint, distance } from '@/components/playbook/playGeometry';
import { roleLabel } from '@/components/playbook/playNarration';

// Pointer coordinates follow the SVG transform, including responsive sizing.
// The same placement callback also serves keyboard and numeric input controls.
export default function PlayEditorCourt({ positions, previous, owner, showDefense, selectedActor, courtHeight = 470, onSelect, onPlace }) {
  const svgRef = useRef(null), dragRef = useRef(null);
  const visible = Object.entries(positions).filter(([id]) => showDefense || id[0] === 'O');
  const point = event => {
    const svg = svgRef.current, matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const value = svg.createSVGPoint(); value.x = event.clientX; value.y = event.clientY;
    const result = value.matrixTransform(matrix.inverse());
    return [result.x, result.y];
  };
  const finish = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <svg ref={svgRef} viewBox={`0 0 500 ${courtHeight}`} className="h-auto w-full select-none" style={{ touchAction: 'none' }} role="group" aria-label="Editable basketball court"
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      const pos = point(event); if (!pos) return;
      const id = event.target.closest('[data-actor]')?.getAttribute('data-actor');
      if (id) {
        event.preventDefault(); onSelect(id);
        dragRef.current = { id, pointerId: event.pointerId, offset: [pos[0] - positions[id][0], pos[1] - positions[id][1]] };
        event.currentTarget.setPointerCapture(event.pointerId);
      } else onPlace(selectedActor, clampPoint(pos, courtHeight));
    }}
    onPointerMove={event => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const pos = point(event);
      if (pos) onPlace(drag.id, clampPoint([pos[0] - drag.offset[0], pos[1] - drag.offset[1]], courtHeight));
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { dragRef.current = null; }}>
    <PlayCourtDefs playId="builder" /><PlayCourtArt fullCourt={courtHeight > 470} />
    {previous && visible.filter(([id, pos]) => distance(previous[id], pos) > 10).map(([id, pos]) => <path key={id} d={`M ${previous[id].join(' ')} L ${pos.join(' ')}`} stroke="hsl(var(--court-focus) / .5)" strokeWidth="2" strokeDasharray="4 6" markerEnd="url(#pb-arrow-builder)" fill="none" pointerEvents="none" />)}
    {visible.map(([id, pos]) => <g key={id} data-actor={id} role="button" tabIndex={0} aria-label={`Move ${roleLabel(id)}`} aria-pressed={selectedActor === id} className="cursor-grab outline-none focus:opacity-75"
      onFocus={() => onSelect(id)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(id); return; }
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[event.key]; if (!direction) return;
        event.preventDefault(); const amount = event.shiftKey ? 20 : 5;
        onPlace(id, clampPoint([pos[0] + direction[0] * amount, pos[1] + direction[1] * amount], courtHeight));
      }}>
      {id[0] === 'O' ? <PlayPlayer id={id} pos={pos} involved={id === selectedActor} isHandler={id === owner} /> : <PlayDefender id={id} pos={pos} involved={id === selectedActor} />}
    </g>)}
    {owner && positions[owner] && <circle cx={positions[owner][0] + 21} cy={positions[owner][1] + 19} r="8" fill="hsl(var(--court-rim))" stroke="hsl(var(--court-line))" pointerEvents="none" />}
  </svg>;
}
