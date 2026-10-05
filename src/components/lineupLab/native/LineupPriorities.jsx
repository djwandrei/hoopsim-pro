import React from 'react';
import { SourceRange, SourcePresets, useSourceGroup, BoundRange } from '@/components/lineupLab/native/boundControls';

const presets = [['balanced', 'Balanced', 'Blend offense, defense, creation, and rebounding'], ['offense', 'Offense', 'Prioritize scoring, spacing, and dependable shot creation'], ['defense', 'Defense', 'Prioritize disruption, rim protection, and finishing stops'], ['shooting', 'Space the Floor', 'Lean into efficient three-point shooting'], ['playmaking', 'Move the Ball', 'Lean into passing and turnover control'], ['rebounding', 'Own the Glass', 'Lean into rebounding and interior strength']];
const families = [['scoring', 'Scoring', 'Scoring volume, efficient finishing, and a light all-around offensive check'], ['freeThrowPressure', 'Free-throw pressure', 'Fouls drawn per shot attempt — a hint at rim pressure, not a direct measure'], ['spacing', 'Spacing', 'Reliable three-point shooting, and the volume to keep defenders honest'], ['creation', 'Creation', 'Playmaking, taking care of the ball, and overall offensive impact'], ['rebounding', 'Rebounding', 'Finishing defensive stops and generating extra chances'], ['perimeterDefense', 'Perimeter Defense', 'Ball-hawking and on-ball disruption, without over-crediting steals'], ['interiorDefense', 'Interior Defense', 'Rim protection, defensive boards, and overall defensive impact']];

export default function LineupPriorities() {
  const sources = useSourceGroup('presetGrid', 'button[data-preset]');
  const visible = sources.map(source => {
    const index = presets.findIndex(([key]) => key === source.key);
    const [, title, copy] = presets[index] || [];
    return { key: source.key, title: title || source.key, copy: copy || '', detailed: index > 2, active: source.active, disabled: source.disabled };
  });
  return <>
    <SourcePresets presets={presets} />
    <div className="ll-preset-grid">{visible.map(preset => <button key={preset.key} type="button" className={`ll-preset-card ${preset.detailed ? 'detailed-only' : ''} ${preset.active ? 'is-active' : ''}`} aria-pressed={preset.active} disabled={preset.disabled} onClick={() => document.querySelector(`#presetGrid [data-preset="${preset.key}"]`)?.click()}><strong>{preset.title}</strong><span>{preset.copy}</span></button>)}</div>
    <details className="weights-panel" id="weightsPanel"><summary>Fine-tune the game plan <span id="priorityMixLabel">(optional)</span></summary>
      <p className="helper" id="weightsHelp">Fine-tuning is optional. Each slider sets how much one skill matters when groups are ranked; the mix always totals 100%, so raising one skill lowers the others. Leave everything at 0 to stay on your preset.</p>
      <p id="weightValidation" role="status" hidden>Choose at least one skill priority above zero before optimizing.</p>
      <div className="weight-grid" id="weightGrid" role="group" aria-label="Game-plan skill priorities">{families.map(([key, label, copy]) => <React.Fragment key={key}>
        <SourceRange id={`familyWeight-${key}`} label={label} min="0" max="100" step="1" defaultValue="0" />
        <BoundRange sourceId={`familyWeight-${key}`} label={label} copy={copy} />
      </React.Fragment>)}</div>
      <p id="weightShareSummary" className="helper" />
    </details>
  </>;
}