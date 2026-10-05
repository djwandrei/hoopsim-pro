import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupRotation from '@/components/lineupLab/native/LineupRotation';
import { SourceField, BoundSegmented, BoundStepper, BoundSelect } from '@/components/lineupLab/native/boundControls';

export default function LineupRules() {
  return <LineupSection id="nativeRules" headingId="constraintsHeading" title="Set the boundaries" number="04" className="detailed-only">
    <fieldset><legend>Court-role requirements</legend>
      <SourceField id="minGuardsInput" label="Guards" value="2" min="0" max="12" step="1" />
      <SourceField id="minForwardsInput" label="Forwards" value="2" min="0" max="12" step="1" />
      <SourceField id="minCentersInput" label="Centers" value="1" min="0" max="12" step="1" />
      <SourceField id="positionFlexibilityInput" label="Allow multi-position players?" value="recommended" options={[["recommended", "Recommended · season roles + career flexibility"], ["open", "Most flexible · every listed career position"], ["seasonOnly", "Season only · listed roles for this year"]]} />
      <div className="ll-role-steppers">
        <BoundStepper sourceId="minGuardsInput" label="Guards" />
        <BoundStepper sourceId="minForwardsInput" label="Forwards" />
        <BoundStepper sourceId="minCentersInput" label="Centers" />
      </div>
      <BoundSelect sourceId="positionFlexibilityInput" label="Allow multi-position players?" help="Multi-position players may cover any listed position, but only one court role at a time." helpId="positionCoverageHelp" />
    </fieldset>
    <fieldset id="productionRules" hidden><legend id="productionRulesLegend">Required group production (optional)</legend>
      {['minPointsInput', 'minReboundsInput', 'minAssistsInput', 'minStealsInput', 'minBlocksInput', 'maxTurnoversInput'].map(id => <SourceField key={id} id={id} label="Required production" min="0" step="0.1" placeholder="Any" />)}
      <div className="ll-role-steppers">
        <BoundStepper sourceId="minPointsInput" label="Points ≥" placeholder="Any" />
        <BoundStepper sourceId="minReboundsInput" label="Rebounds ≥" placeholder="Any" />
        <BoundStepper sourceId="minAssistsInput" label="Assists ≥" placeholder="Any" />
        <BoundStepper sourceId="minStealsInput" label="Steals ≥" placeholder="Any" />
        <BoundStepper sourceId="minBlocksInput" label="Blocks ≥" placeholder="Any" />
        <BoundStepper sourceId="maxTurnoversInput" label="Turnovers ≤" placeholder="Any" />
      </div>
      <p id="productionRulesHelp" className="helper" />
    </fieldset>
    <fieldset id="projectionRiskSettings" hidden><legend>Planning reserve</legend>
      <SourceField id="projectionRiskInput" labelId="projectionRiskLabel" label="Planning reserve" value="balanced" options={[["reliable", "More cautious estimates"], ["balanced", "Balanced projection — recommended"], ["upside", "Expected rates — no extra downside reserve"]]} />
      <BoundSegmented sourceId="projectionRiskInput" label="Planning reserve" labels={{ reliable: 'Cautious', balanced: 'Balanced', upside: 'Upside' }} columns={3} />
      <small id="projectionRiskHelp" className="ll-control__help" />
    </fieldset>
    <LineupRotation />
  </LineupSection>;
}