import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BarChart3, Check, Pause, RotateCw, Ruler, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SKILLS, gradeFor } from '@/components/forge/bapSkills';
import ForgeAthlete3D from '@/components/forge/ForgeAthlete3D';
import ForgeWardrobeControls from '@/components/forge/ForgeWardrobeControls';
import ForgeShadesOf from './ForgeShadesOf';
import ForgeOvrPanel from './ForgeOvrPanel';
import { FORGE_EQUIPMENT_CALLOUTS, bestForgeOffer, forgeStageSkillState } from './forgeStageMapping';
import './forgeStage.css';

const length = inches => Number.isFinite(inches) ? `${Math.floor(inches / 12)}′ ${+(inches % 12).toFixed(2)}″` : 'Unavailable';

export default function ForgeStage({ mode, picks, pool, group = 'All', overall, reveal, selectedKey, onSelect, onAssign, showGrades, spinning, editions, onEdition, appearance, onAppearance }) {
  const [rotating, setRotating] = useState(true), [focused, setFocused] = useState(null);
  const arenaRef = useRef(null), viewerRef = useRef(null), svgRef = useRef(null);
  const cards = useRef({}), lines = useRef({}), layout = useRef(null), anchors = useRef(null);
  const instructionId = useId();
  const best = mode === 'wheel' ? bestForgeOffer(picks, reveal) : null;
  const states = Object.fromEntries(SKILLS.map(skill => [skill.key, forgeStageSkillState(skill.key, { mode, picks, reveal, selectedKey, spinning })]));
  const selectedSkill = SKILLS.find(skill => skill.key === selectedKey);
  const instruction = spinning ? 'Finding your next player…' : reveal ? mode === 'pick' ? `Assign ${selectedSkill?.label || 'your selected skill'}, or respin.` : 'Choose a highlighted attribute to take this player’s rating.'
    : mode === 'pick' ? selectedSkill ? `${selectedSkill.label} selected. Spin to reveal your player.` : 'Choose an attribute, then spin for your player.' : 'Spin the reels, then choose an attribute to forge.';

  const project = useCallback(points => {
    anchors.current = points;
    if (!layout.current) return;
    const { viewer, origins } = layout.current;
    for (const item of FORGE_EQUIPMENT_CALLOUTS) {
      const target = points[item.skill], nodes = lines.current[item.skill], origin = origins[item.skill];
      if (!target || !nodes || !origin) continue;
      nodes.group.style.visibility = target.visible ? 'visible' : 'hidden';
      const x = viewer.x + target.x * viewer.width, y = viewer.y + target.y * viewer.height;
      const elbow = origin.x + (item.side === 'left' ? 16 : -16);
      nodes.line.setAttribute('points', `${origin.x},${origin.y} ${elbow},${origin.y} ${x},${y}`);
      nodes.pin.setAttribute('transform', `translate(${x},${y})`);
    }
  }, []);

  useEffect(() => {
    const measure = () => {
      const box = arenaRef.current.getBoundingClientRect(), view = viewerRef.current.getBoundingClientRect();
      const origins = {};
      for (const item of FORGE_EQUIPMENT_CALLOUTS) {
        const card = cards.current[item.skill]?.getBoundingClientRect();
        if (card) origins[item.skill] = { x: (item.side === 'left' ? card.right : card.left) - box.left, y: card.top + card.height / 2 - box.top };
      }
      layout.current = { viewer: { x: view.left - box.left, y: view.top - box.top, width: view.width, height: view.height }, origins };
      svgRef.current.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      if (anchors.current) project(anchors.current);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [arenaRef.current, viewerRef.current, ...Object.values(cards.current)]) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [project]);

  const renderCard = (skill, item) => {
    const state = states[skill.key], isBest = best === skill.key && state.live;
    const donor = state.pick?.player || (state.live ? reveal : null);
    const body = skill.key === 'body', measurements = donor?.measurements;
    const action = state.live ? `Assign ${skill.label}: ${state.value} from ${donor?.name || 'the revealed player'}` : state.selectable ? `Select ${skill.label}` : `${skill.label}, ${state.status}`;
    return <button type="button" key={skill.key} ref={node => { if (item) cards.current[skill.key] = node; }}
      className={`forge-part-card forge-part-card--${state.tone}${isBest ? ' forge-part-card--best' : ''}${item ? '' : ' forge-part-card--rating'}`}
      style={item ? { '--callout-top': `${item.top}%` } : undefined} data-side={item?.side} data-skill={skill.key}
      aria-label={`${action}. ${item?.label || (body ? 'Body measurements' : 'Skill rating only')}`} aria-disabled={!state.clickable}
      aria-pressed={state.selectable ? state.selected : undefined} aria-describedby={state.clickable ? instructionId : undefined}
      onPointerEnter={() => setFocused(skill.key)} onPointerLeave={() => setFocused(null)} onFocus={() => setFocused(skill.key)} onBlur={() => setFocused(null)}
      onClick={() => { if (state.live) onAssign(skill.key); else if (state.selectable) onSelect(skill.key); }}>
      <span className="forge-part-card__equipment"><span className="forge-part-card__number">{item?.number || (body ? <Ruler size={12} /> : <BarChart3 size={12} />)}</span>{item?.label || (body ? 'Position-relative measurements' : 'Rating only')}{state.pick && <Check size={12} className="ml-auto" />}</span>
      <span className="forge-part-card__main"><span className="forge-part-card__skill">{skill.label}</span><span className="forge-part-card__value">{state.value ?? '—'}{showGrades && state.value !== null && <small>{gradeFor(state.value)}</small>}</span></span>
      {body && <span className="forge-body-measurements"><span>Height<strong>{measurements ? length(measurements.height) : '—'}</strong></span><span>Weight<strong>{measurements ? Number.isFinite(measurements.weight) ? `${measurements.weight} lb` : 'Unavailable' : '—'}</strong></span><span>Wingspan<strong>{measurements ? length(measurements.wingspan) : '—'}</strong></span></span>}
      {body && measurements && <span className="forge-body-note">Height & weight: roster snapshot · {measurements.wingspan ? `Wingspan: ${measurements.combineYear} combine` : 'Wingspan not included in this score'}</span>}
      <span className="forge-part-card__meta"><span>{donor?.name || (state.selected ? 'Ready to spin' : 'Open slot')}</span><span>{isBest ? <><Sparkles size={10} />Best</> : state.status}</span></span>
    </button>;
  };

  return <section aria-label="Composite player and attribute map" className="forge-player-stage">
    <header className="forge-player-stage__header">
      <div><p className="bcast-kicker">Your composite</p><h2>Build your athlete</h2></div>
    </header>
    <ForgeOvrPanel picks={picks} group={group} overall={overall} showGrades={showGrades} />
    <p id={instructionId} aria-live="polite" className="forge-player-stage__instruction">{instruction}</p>
    <div ref={arenaRef} className="forge-model-map" data-focused={focused || selectedKey || ''}>
      <div ref={viewerRef} className="forge-model-map__viewer">
        <div aria-hidden="true" className="forge-model-map__halo" />
        <div aria-hidden="true" className="forge-model-map__floor" />
        <ForgeAthlete3D picks={picks} editions={editions} appearance={appearance} spinning={spinning} rotating={rotating && !focused} onProject={project} />
        <div className="forge-model-map__view-controls"><span>3D PLAYER</span><button type="button" onClick={() => setRotating(value => !value)} aria-label={rotating ? 'Pause player rotation' : 'Rotate player'} aria-pressed={rotating}>{rotating ? <Pause size={12} /> : <RotateCw size={12} />}{rotating ? 'Pause' : 'Rotate'}</button></div>
      </div>
      <svg ref={svgRef} className="forge-model-map__connections" aria-hidden="true" preserveAspectRatio="none">
        {FORGE_EQUIPMENT_CALLOUTS.map(item => <g key={item.skill} data-skill={item.skill} data-tone={states[item.skill].tone} data-active={(focused || selectedKey) === item.skill} style={{ visibility: 'hidden' }}
          ref={node => { if (node) lines.current[item.skill] = { group: node, line: node.querySelector('polyline'), pin: node.querySelector('[data-pin]') }; }}>
          <polyline fill="none" />
          <g data-pin=""><circle r="9" /><text textAnchor="middle" dominantBaseline="central">{item.number}</text></g>
        </g>)}
      </svg>
      <div className="forge-model-map__callouts">{FORGE_EQUIPMENT_CALLOUTS.map(item => renderCard(SKILLS.find(skill => skill.key === item.skill), item))}</div>
    </div>
    <div className="forge-player-stage__ratings">{SKILLS.filter(skill => !FORGE_EQUIPMENT_CALLOUTS.some(item => item.skill === skill.key)).map(skill => renderCard(skill))}</div>
    <ForgeShadesOf picks={picks} pool={pool || []} />
    <details className="forge-player-stage__appearance"><summary><SlidersHorizontal size={14} />Player appearance<span>Edit</span></summary><div><ForgeWardrobeControls picks={picks} editions={editions} onEdition={onEdition} appearance={appearance} onAppearance={onAppearance} /></div></details>
  </section>;
}
