import React from 'react';
import { Users, Target, Gauge } from 'lucide-react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupRotation from '@/components/lineupLab/native/LineupRotation';
import { LineupControlHead, useCollapsible } from '@/components/lineupLab/native/LineupControlSet';
import { SourceField, BoundSegmented, BoundStepper, BoundSelect } from '@/components/lineupLab/native/boundControls';

export default function LineupRules() {
  const roles = useCollapsible();
  const production = useCollapsible();
  const reserve = useCollapsible();
  return <LineupSection id="nativeRules" headingId="constraintsHeading" title="Set the boundaries" number="03" className="detailed-only">
    <p className="ll-section-intro">Decide what counts as a valid group before you build: which court roles it must field, optional production floors, and how cautious the estimates are. Any group that misses a rule set here never appears in your results.</p>
    <fieldset className={`ll-control-set ${roles.className}`}><legend className="sr-only">Court-role requirements</legend>
      <SourceField id="minGuardsInput" label="Guards" value="2" min="0" max="12" step="1" />
      <SourceField id="minForwardsInput" label="Forwards" value="2" min="0" max="12" step="1" />
      <SourceField id="minCentersInput" label="Centers" value="1" min="0" max="12" step="1" />
      <SourceField id="positionFlexibilityInput" label="Allow multi-position players?" value="recommended" options={[["recommended", "Recommended · season roles + career flexibility"], ["open", "Most flexible · every listed career position"], ["seasonOnly", "Season only · listed roles for this year"]]} />
      <LineupControlHead icon={Users} title="Court-role requirements" copy="The shape of your group. Set the fewest guards, forwards, and centers it must field — role counts come from each player's listed positions, and the flexibility setting below decides whose positions count." {...roles.headProps} />
      <div className="ll-role-steppers">
        <BoundStepper sourceId="minGuardsInput" label="Guards" />
        <BoundStepper sourceId="minForwardsInput" label="Forwards" />
        <BoundStepper sourceId="minCentersInput" label="Centers" />
      </div>
      <BoundSelect sourceId="positionFlexibilityInput" label="Allow multi-position players?" help="How a player's listed positions count toward your role rules. Under every option a guard–forward can fill either spot — but each player still takes only one slot in the group, so nobody covers two roles at once." helpId="positionCoverageHelp" />
    </fieldset>
    <fieldset id="productionRules" hidden className={`ll-control-set ${production.className}`}><legend id="productionRulesLegend" className="sr-only">Required group production (optional)</legend>
      {['minPointsInput', 'minReboundsInput', 'minAssistsInput', 'minStealsInput', 'minBlocksInput', 'maxTurnoversInput'].map(id => <SourceField key={id} id={id} label="Required production" min="0" step="0.1" placeholder="Any" />)}
      <LineupControlHead icon={Target} title="Required group production" badge="Optional" copy="A production floor for the group as a whole: it must average at least this many points, rebounds, assists, steals, and blocks — and no more than this many turnovers — per game. Leave a box empty for no requirement." {...production.headProps} />
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
    <fieldset id="projectionRiskSettings" hidden className={`ll-control-set ${reserve.className}`}><legend className="sr-only">Planning reserve</legend>
      <SourceField id="projectionRiskInput" labelId="projectionRiskLabel" label="Planning reserve" value="balanced" options={[["reliable", "More cautious estimates"], ["balanced", "Balanced projection — recommended"], ["upside", "Expected rates — no extra downside reserve"]]} />
      <LineupControlHead icon={Gauge} title="Planning reserve" copy="How cautious the solver is when a player's data runs thin. Cautious pads estimates down for low-minute players, Balanced is the middle road, and Upside trusts the observed rates as they are." {...reserve.headProps} />
      <BoundSegmented sourceId="projectionRiskInput" label="Planning reserve" labels={{ reliable: 'Cautious', balanced: 'Balanced', upside: 'Upside' }} columns={3} />
      <small id="projectionRiskHelp" className="ll-control__help" />
    </fieldset>
    <LineupRotation />
  </LineupSection>;
}