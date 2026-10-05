import React from 'react';
import CourtArt from '@/components/lineupLab/native/CourtArt';
import LineupStageNav from '@/components/lineupLab/native/LineupStageNav';

export default function LineupStagePanel({ scene, active, modified, stages, index, onGoto, onEdit }) {
  return <section className={`ll-stage ${active ? 'is-current' : ''}`} data-stage={scene.n} hidden={!active} onInput={onEdit} onChange={onEdit}>
    <header className="ll-stage-head" data-stage-number={scene.n}>
      <div><p className="court-kicker">Stage {scene.n}</p><h2 className="ll-stage-title">{scene.title}</h2><p className="ll-stage-tag">{scene.tag}</p></div>
      <CourtArt className="ll-stage-art" />
      {modified && <span className="ll-stage-badge">Tuned</span>}
    </header>
    <div className="ll-stage-body">{scene.content}</div>
    <LineupStageNav stages={stages} index={index} onGoto={onGoto} isRun={scene.key === 'run'} />
  </section>;
}