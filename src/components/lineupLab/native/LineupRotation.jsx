import React from 'react';
import LineupField from '@/components/lineupLab/native/LineupField';

export default function LineupRotation() {
  return <fieldset id="rotationSettings" className="rotation-settings" hidden><legend>Rotation controls</legend>
    <p className="helper">Assign all 240 player-minutes to match your game plan within your hard limits.</p>
    <div className="ll-native-fields">
      <LineupField id="rotationMinutePlanInput" label="Minute approach" hidden value="openWhatIf" options={[["openWhatIf", "Optimize for the game plan"]]} />
      <LineupField id="rotationFlexibilityInput" fieldId="rotationFlexibilityField" hidden label="Allowed difference from recorded minutes" value="8" options={[["4", "±4 minutes per game"], ["8", "±8 minutes per game"], ["12", "±12 minutes per game"], ["16", "±16 minutes per game"]]} />
      <LineupField id="rotationAllocationStyleInput" fieldId="rotationAllocationStyleField" hidden label="When using recorded minutes" value="strategyFirst" options={[["strategyFirst", "Favor game plan — recommended"], ["preserveWorkload", "Stay near recorded minutes"]]} />
      <LineupField id="rotationScoringBasisInput" fieldId="rotationScoringBasisField" label="Rate used to compare players" value="per36" options={[["per36", "Per 36 — compare rates fairly"], ["perGame", "Per game — per-game values"]]} />
      <LineupField id="rotationRateStabilityInput" fieldId="rotationRateStabilityField" label="Rate confidence" value="sampleAdjusted" options={[["sampleAdjusted", "Sample-adjusted rate — recommended"], ["raw", "Observed rate only — advanced"]]} />
      <LineupField id="rotationPositionProfileInput" label="Position-minute mix" value="automatic" options={[["automatic", "Roster role mix — soft ranges"], ["traditional", "Traditional — two guards, two forwards, one center"], ["small", "Small — more guard time, less center time"], ["big", "Big — more forward time, standard center time"]]} />
      <LineupField id="roleBalanceInput" label="Role coverage preference" value="recommended" options={[["off", "Explanation only — no ranking effect"], ["recommended", "Recommended — small complementarity bonus"], ["emphasized", "Emphasized — stronger role balance"]]} />
      <LineupField id="rotationMinInput" label="Minimum minutes per selected player" min="0" max="30" step="1" value="8" />
      <LineupField id="rotationMaxInput" label="Maximum minutes per selected player" min="20" max="48" step="1" value="40" />
    </div>
    <p id="rotationMinutePlanHelp" className="helper" /><p id="rotationAllocationStyleHelp" hidden /><p id="rotationRateStabilityHelp" className="helper" /><p id="rotationMinutesHelp" className="helper">The solver creates an exact 240-minute plan. Only your displayed minimum and maximum are hard caps.</p>
  </fieldset>;
}