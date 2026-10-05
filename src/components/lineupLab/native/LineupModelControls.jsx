import React from 'react';
import LineupField from '@/components/lineupLab/native/LineupField';

export default function LineupModelControls() {
  return <div className="model-choice">
    <div className="ll-native-fields">
      <LineupField id="modelModeInput" label="Primary model" value="historical" options={[["historical", "Historical box-score profile"], ["swishiq-impact", "SwishIQ Impact — advanced offense / defense impact"]]} />
      <LineupField id="swishiqObjectiveInput" fieldId="swishiqObjectiveField" hidden label="Offense / defense priority" value="balanced" options={[["balanced", "Balanced — equal priority"], ["offense", "Offense only — scoring impact"], ["defense", "Defense only — points prevented"], ["custom", "Custom — choose the balance"]]} />
      <LineupField id="swishiqEvidenceModeInput" fieldId="swishiqEvidenceModeField" hidden label="Data scope" value="exact" options={[["exact", "Selected team-season"]]} />
    </div>
    <div id="swishiqCustomWeights" hidden><div className="ll-native-fields"><LineupField id="swishiqOffenseWeightInput" label="Offense weight" min="0" max="10000" step="any" value="1" disabled /><LineupField id="swishiqDefenseWeightInput" label="Defense weight" min="0" max="10000" step="any" value="1" disabled /></div><p id="swishiqCustomWeightsHelp" className="helper">Use any weights from 0 to 10,000; they do not need to add to 100. At least one must be above zero. This changes the preference mix, not the underlying player estimates.</p></div>
    <p id="swishiqPrioritySummary" role="status" hidden className="helper" />
    <p id="swishiqEvidenceModeHelp" hidden className="helper">SwishIQ Impact uses data for the selected team, season, and phase. It requires complete coverage and does not substitute pooled seasons.</p>
    <p id="modelModeHelp" className="helper">Historical combines your visible priorities with player box-score stats. SwishIQ Impact estimates player impact for the selected team-season when complete data are available.</p>
    <p id="swishiqEvidenceStatus" role="status" hidden className="helper" />
  </div>;
}