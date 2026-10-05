import React from 'react';
import { SourceField, BoundSegmented, BoundStepper, BoundSelect } from '@/components/lineupLab/native/boundControls';

export default function LineupRotation() {
  return <fieldset id="rotationSettings" className="rotation-settings" hidden><legend>Rotation controls</legend>
    <p className="helper">Rotation mode only. The solver spreads a full 240 minutes across your 8–12 players, keeping everyone inside the minimum and maximum minutes you set here.</p>
    <SourceField id="rotationMinutePlanInput" label="Minute approach" hidden value="openWhatIf" options={[["openWhatIf", "Optimize for the game plan"]]} />
    <SourceField id="rotationFlexibilityInput" fieldId="rotationFlexibilityField" hidden label="Allowed difference from recorded minutes" value="8" options={[["4", "±4 minutes per game"], ["8", "±8 minutes per game"], ["12", "±12 minutes per game"], ["16", "±16 minutes per game"]]} />
    <SourceField id="rotationAllocationStyleInput" fieldId="rotationAllocationStyleField" hidden label="When using recorded minutes" value="strategyFirst" options={[["strategyFirst", "Favor game plan — recommended"], ["preserveWorkload", "Stay near recorded minutes"]]} />
    <SourceField id="rotationScoringBasisInput" fieldId="rotationScoringBasisField" label="Rate used to compare players" value="per36" options={[["per36", "Per 36 — compare rates fairly"], ["perGame", "Per game — per-game values"]]} />
    <SourceField id="rotationRateStabilityInput" fieldId="rotationRateStabilityField" label="Rate confidence" value="sampleAdjusted" options={[["sampleAdjusted", "Sample-adjusted rate — recommended"], ["raw", "Observed rate only — advanced"]]} />
    <SourceField id="rotationPositionProfileInput" label="Position-minute mix" value="automatic" options={[["automatic", "Roster role mix — soft ranges"], ["traditional", "Traditional — two guards, two forwards, one center"], ["small", "Small — more guard time, less center time"], ["big", "Big — more forward time, standard center time"]]} />
    <SourceField id="roleBalanceInput" label="Role coverage preference" value="recommended" options={[["off", "Explanation only — no ranking effect"], ["recommended", "Recommended — small complementarity bonus"], ["emphasized", "Emphasized — stronger role balance"]]} />
    <SourceField id="rotationMinInput" label="Minimum minutes per selected player" min="0" max="30" step="1" value="8" />
    <SourceField id="rotationMaxInput" label="Maximum minutes per selected player" min="20" max="48" step="1" value="40" />
    <div className="ll-native-fields">
      <BoundSegmented sourceId="rotationScoringBasisInput" fieldId="rotationScoringBasisField" label="Rate used to compare players" labels={{ per36: 'Per 36', perGame: 'Per game' }} columns={2} />
      <BoundSegmented sourceId="rotationRateStabilityInput" fieldId="rotationRateStabilityField" label="Rate confidence" labels={{ sampleAdjusted: 'Sample-adjusted', raw: 'Raw rates' }} columns={2} />
      <BoundSelect sourceId="rotationPositionProfileInput" label="Position-minute mix" />
      <BoundSegmented sourceId="roleBalanceInput" label="Role coverage preference" labels={{ off: 'No effect', recommended: 'Recommended', emphasized: 'Emphasized' }} columns={3} />
      <p id="rotationScoringBasisHelp" className="helper">How players are compared: per 36 puts everyone on equal playing time so a part-timer can be judged next to a starter, while per game uses raw nightly numbers.</p>
      <BoundStepper sourceId="rotationMinInput" label="Minimum minutes per player" />
      <BoundStepper sourceId="rotationMaxInput" label="Maximum minutes per player" />
    </div>
    <p id="rotationMinutePlanHelp" className="helper" /><p id="rotationAllocationStyleHelp" hidden /><p id="rotationRateStabilityHelp" className="helper" /><p id="rotationMinutesHelp" className="helper">The plan always totals exactly 240 minutes. Your minimum and maximum are the only hard limits — everything in between is shaped by the priorities you set in the game plan.</p>
  </fieldset>;
}