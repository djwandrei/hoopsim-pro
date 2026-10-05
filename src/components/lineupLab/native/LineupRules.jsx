import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupField from '@/components/lineupLab/native/LineupField';
import LineupRotation from '@/components/lineupLab/native/LineupRotation';

export default function LineupRules() {
  return <LineupSection id="nativeRules" headingId="constraintsHeading" title="Set the boundaries" number="04" className="detailed-only">
    <fieldset><legend>Court-role requirements</legend><div className="ll-native-fields ll-native-fields--three">{[['minGuardsInput', 'Guards', '2'], ['minForwardsInput', 'Forwards', '2'], ['minCentersInput', 'Centers', '1']].map(([id, label, value]) => <LineupField key={id} id={id} label={label} value={value} min="0" max="12" step="1" />)}</div>
      <LineupField id="positionFlexibilityInput" label="Allow multi-position players?" value="recommended" options={[["recommended", "Recommended · season roles + career flexibility"], ["open", "Most flexible · every listed career position"], ["seasonOnly", "Season only · listed roles for this year"]]} helpId="positionCoverageHelp" help="Multi-position players may cover any listed position, but only one court role at a time." />
    </fieldset>
    <fieldset id="productionRules" hidden><legend id="productionRulesLegend">Required group production (optional)</legend><div className="ll-native-fields">{[['minPointsInput', 'Points ≥'], ['minReboundsInput', 'Rebounds ≥'], ['minAssistsInput', 'Assists ≥'], ['minStealsInput', 'Steals ≥'], ['minBlocksInput', 'Blocks ≥'], ['maxTurnoversInput', 'Turnovers ≤']].map(([id, label]) => <LineupField key={id} id={id} label={label} min="0" step="0.1" placeholder="Any" />)}</div><p id="productionRulesHelp" className="helper" /></fieldset>
    <fieldset id="projectionRiskSettings" hidden><legend>Planning reserve</legend><LineupField id="projectionRiskInput" labelId="projectionRiskLabel" label="Planning reserve" value="balanced" options={[["reliable", "More cautious estimates"], ["balanced", "Balanced projection — recommended"], ["upside", "Expected rates — no extra downside reserve"]]} helpId="projectionRiskHelp" /></fieldset>
    <LineupRotation />
  </LineupSection>;
}