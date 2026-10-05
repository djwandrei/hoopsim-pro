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
      <p id="swishiqCustomWeightsHelp" className="helper">Use any weights from 0 to 10,000; they do not need to add to 100. At least one must be above zero. This changes the preference mix, not the underlying player estimates.</p>
    </div>
    <p id="swishiqPrioritySummary" role="status" hidden className="helper" />
    <p id="swishiqEvidenceModeHelp" hidden className="helper">SwishIQ Impact uses data for the selected team, season, and phase. It requires complete coverage and does not substitute pooled seasons.</p>
    <p id="modelModeHelp" className="helper">Historical combines your visible priorities with player box-score stats. SwishIQ Impact estimates player impact for the selected team-season when complete data are available.</p>
    <p id="swishiqEvidenceStatus" role="status" hidden className="helper" />
  </div>;
}