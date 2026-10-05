import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupPriorities from '@/components/lineupLab/native/LineupPriorities';
import LineupModelControls from '@/components/lineupLab/native/LineupModelControls';
import LineupOpponent from '@/components/lineupLab/native/LineupOpponent';
import LineupCoachingBrief from '@/components/lineupLab/native/LineupCoachingBrief';
import { SourceField, BoundSegmented, BoundStepper } from '@/components/lineupLab/native/boundControls';

export default function LineupGamePlan() {
  return <LineupSection id="nativeGamePlan" headingId="scenarioHeading" title="Call the game plan" number="02">
    <SourceField id="modeInput" label="What are you building?" value="lineup" options={[["lineup", "Starting five (5 players)"], ["rotation", "Full rotation (8\u201312 players, 240 minutes)"]]} />
    <SourceField id="sizeInput" fieldId="sizeField" label="Roster size" min="5" max="12" step="1" value="5" help="Keep it at 5 for a starting five. Building a rotation? Pick 8–12 players and all 240 rotation minutes get planned across them." helpId="sizeInputHelp" />
    <div className="ll-native-fields mb-5">
      <BoundSegmented sourceId="modeInput" label="What are you building?" labels={{ lineup: 'Starting five', rotation: 'Full rotation (8–12)' }} columns={2} />
      <BoundStepper sourceId="sizeInput" fieldId="sizeField" label="Roster size" />
    </div>
    <LineupPriorities />
    <LineupCoachingBrief />
    <LineupModelControls />
    <LineupOpponent />
    <aside id="simpleModelSummary" className="simple-only ll-native-note"><strong>Accuracy safeguards are on</strong><p id="simpleModelSummaryCopy" /><small id="simpleModelSummaryNote" /></aside>
  </LineupSection>;
}