import React from 'react';
import { SourceField, BoundSegmented, BoundStepper } from '@/components/lineupLab/native/boundControls';

export default function LineupModelControls() {
  return <div className="model-choice">
    <SourceField id="modelModeInput" label="Primary model" value="historical" options={[["historical", "Historical box-score profile"], ["swishiq-impact", "SwishIQ Impact — advanced offense / defense impact"]]} />
    <SourceField id="swishiqObjectiveInput" fieldId="swishiqObjectiveField" hidden label="Offense / defense priority" value="balanced" options={[["balanced", "Balanced \u2014 equal priority"], ["offense", "Offense only \u2014 scoring impact"], ["defense", "Defense only \u2014 points prevented"], ["custom", "Custom \u2014 choose the balance"]]} />
    <SourceField id="swishiqEvidenceModeInput" fieldId="swishiqEvidenceModeField" hidden label="Data scope" value="exact" options={[["exact", "Selected team-season"]]} />
    <BoundSegmented sourceId="modelModeInput" label="Primary model" labels={{ historical: 'Historical profile', 'swishiq-impact': 'SwishIQ Impact' }} columns={2} />
    <BoundSegmented sourceId="swishiqObjectiveInput" fieldId="swishiqObjectiveField" label="Offense / defense priority" labels={{ balanced: 'Balanced', offense: 'Offense only', defense: 'Defense only', custom: 'Custom mix' }} columns={2} />
    <div id="swishiqCustomWeights" hidden>
      <SourceField id="swishiqOffenseWeightInput" label="Offense weight" min="0" max="10000" step="any" value="1" disabled />
      <SourceField id="swishiqDefenseWeightInput" label="Defense weight" min="0" max="10000" step="any" value="1" disabled />
      <div className="ll-native-fields">
        <BoundStepper sourceId="swishiqOffenseWeightInput" label="Offense weight" />
        <BoundStepper sourceId="swishiqDefenseWeightInput" label="Defense weight" />
      </div>
      <p id="swishiqCustomWeightsHelp" className="helper">Set any weights from 0 to 10,000 — they don't need to add up to 100, but at least one must be above zero. This only changes how strongly offense vs defense weighs in the search, not how players are measured.</p>
    </div>
    <p id="swishiqPrioritySummary" role="status" hidden className="helper" />
    <p id="swishiqEvidenceModeHelp" hidden className="helper">SwishIQ Impact only uses complete data for the exact team, season, and phase you picked — it never blends in other seasons to fill gaps.</p>
    <p id="modelModeHelp" className="helper">Historical builds from the box-score stats and the priorities you set. SwishIQ Impact adds a play-by-play impact read for the selected team-season when full data is available.</p>
    <p id="swishiqEvidenceStatus" role="status" hidden className="helper" />
  </div>;
}