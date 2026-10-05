import React from 'react';

const presets = [['balanced', 'Balanced', 'Blend offense, defense, creation, and rebounding'], ['offense', 'Offense', 'Prioritize scoring, spacing, and dependable shot creation'], ['defense', 'Defense', 'Prioritize disruption, rim protection, and finishing stops'], ['shooting', 'Space the Floor', 'Lean into efficient three-point shooting'], ['playmaking', 'Move the Ball', 'Lean into passing and turnover control'], ['rebounding', 'Own the Glass', 'Lean into rebounding and interior strength']];
const families = [['scoring', 'Scoring', 'Points, efficient finishing, and a small impact check'], ['freeThrowPressure', 'Free-throw pressure', 'FTA per FGA; a foul-drawing proxy, not measured rim attacks'], ['spacing', 'Spacing', 'Three-point accuracy and sample-supported attempt frequency'], ['creation', 'Creation', 'Assists, turnover control, and offensive impact'], ['rebounding', 'Rebounding', 'End possessions and create extra chances'], ['perimeterDefense', 'Perimeter Defense', 'Disruption without treating steals as complete defense'], ['interiorDefense', 'Interior Defense', 'Rim protection, rebounding, and defensive impact']];

export default function LineupPriorities() {
  return <>
    <div className="preset-grid" id="presetGrid">{presets.map(([key, title, copy], index) => <button key={key} type="button" data-preset={key} className={`preset-card ${index === 0 ? 'is-active' : index > 2 ? 'detailed-only' : ''}`} aria-pressed={index === 0}><strong>{title}</strong><span>{copy}</span></button>)}</div>
    <details className="weights-panel" id="weightsPanel"><summary>Fine-tune the game plan <span id="priorityMixLabel">(optional)</span></summary>
      <p className="helper" id="weightsHelp">The app automatically converts these sliders into a 100% focus mix. Raising one priority makes it more important relative to the others.</p>
      <p id="weightValidation" role="status" hidden>Choose at least one skill priority above zero before optimizing.</p>
      <div className="weight-grid" id="weightGrid" role="group" aria-label="Game-plan skill priorities">{families.map(([key, label, copy]) => <label className="range-field" key={key}><span><strong>{label}</strong><small>{copy}</small></span><input id={`familyWeight-${key}`} type="range" min="0" max="100" step="1" data-family={key} defaultValue="0" aria-label={label} /><output>0</output></label>)}</div>
      <p id="weightShareSummary" className="helper" />
    </details>
  </>;
}