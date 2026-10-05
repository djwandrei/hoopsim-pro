import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupField from '@/components/lineupLab/native/LineupField';
import LineupPriorities from '@/components/lineupLab/native/LineupPriorities';
import LineupModelControls from '@/components/lineupLab/native/LineupModelControls';
import LineupOpponent from '@/components/lineupLab/native/LineupOpponent';
import LineupCoachingBrief from '@/components/lineupLab/native/LineupCoachingBrief';

export default function LineupGamePlan() {
  return <LineupSection id="nativeGamePlan" headingId="scenarioHeading" title="Call the game plan" number="02">
    <div className="ll-native-fields mb-5"><LineupField id="modeInput" label="What are you building?" value="lineup" options={[["lineup", "Starting five (5 players)"], ["rotation", "Full rotation (8–12 players, 240 minutes)"]]} /><LineupField id="sizeInput" fieldId="sizeField" label="Roster size" min="5" max="12" step="1" value="5" /></div>
    <LineupPriorities />
    <LineupCoachingBrief />
    <LineupModelControls />
    <LineupOpponent />
    <aside id="simpleModelSummary" className="simple-only ll-native-note"><strong>Accuracy safeguards are on</strong><p id="simpleModelSummaryCopy" /><small id="simpleModelSummaryNote" /></aside>
  </LineupSection>;
}