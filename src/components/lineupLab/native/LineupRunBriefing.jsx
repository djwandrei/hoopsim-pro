import React from 'react';
import { LayoutGrid, Users, Target, Gauge, Timer, BrainCircuit, ShieldHalf, SlidersHorizontal } from 'lucide-react';
import { useSource } from '@/components/lineupLab/native/boundControls';

// Pre-flight briefing: mirrors every constraint source so the run stage shows
// exactly what the solver will follow, without restating any control.

const FLEXIBILITY = { recommended: 'Recommended', open: 'Most flexible', seasonOnly: 'Season roles only' };
const RESERVE = { reliable: 'Cautious', balanced: 'Balanced', upside: 'Upside' };
const BASIS = { per36: 'Per 36 minutes', perGame: 'Per game' };
const STABILITY = { sampleAdjusted: 'Sample-adjusted', raw: 'Raw rates' };
const PROFILE = { automatic: 'Roster role mix', traditional: 'Traditional', small: 'Small ball', big: 'Big lineups' };
const BALANCE = { off: 'No effect', recommended: 'Recommended', emphasized: 'Emphasized' };
const MODEL = { historical: 'Historical box-score profile', 'swishiq-impact': 'SwishIQ Impact' };
const OBJECTIVE = { balanced: 'Balanced', offense: 'Offense only', defense: 'Defense only', custom: 'Custom mix' };
const MODE = { lineup: 'Starting five', rotation: 'Full rotation' };


function BriefTile({ icon: Icon, title, badge, children }) {
  return <div className="ll-brief-tile">
    <header><Icon size={14} aria-hidden="true" /><h3>{title}</h3>{badge && <span className="ll-brief-tile__badge">{badge}</span>}</header>
    <div className="ll-brief-tile__body">{children}</div>
  </div>;
}

function BriefItem({ label, value }) {
  return <div className="ll-brief-item"><span>{label}</span><strong>{value}</strong></div>;
}

const num = value => (value === '' || value == null ? '—' : value);

export default function LineupRunBriefing() {
  const mode = useSource('modeInput');
  const size = useSource('sizeInput');
  const guards = useSource('minGuardsInput');
  const forwards = useSource('minForwardsInput');
  const centers = useSource('minCentersInput');
  const flexibility = useSource('positionFlexibilityInput');
  const minPoints = useSource('minPointsInput');
  const minRebounds = useSource('minReboundsInput');
  const minAssists = useSource('minAssistsInput');
  const minSteals = useSource('minStealsInput');
  const minBlocks = useSource('minBlocksInput');
  const maxTurnovers = useSource('maxTurnoversInput');
  const projectionRisk = useSource('projectionRiskInput');
  const rotationMin = useSource('rotationMinInput');
  const rotationMax = useSource('rotationMaxInput');
  const scoringBasis = useSource('rotationScoringBasisInput');
  const rateStability = useSource('rotationRateStabilityInput');
  const positionProfile = useSource('rotationPositionProfileInput');
  const roleBalance = useSource('roleBalanceInput');
  const modelMode = useSource('modelModeInput');
  const objective = useSource('swishiqObjectiveInput');
  const offenseWeight = useSource('swishiqOffenseWeightInput');
  const defenseWeight = useSource('swishiqDefenseWeightInput');
  const opponent = useSource('opponentTeamInput');
  const wScoring = useSource('familyWeight-scoring');
  const wFreeThrows = useSource('familyWeight-freeThrowPressure');
  const wSpacing = useSource('familyWeight-spacing');
  const wCreation = useSource('familyWeight-creation');
  const wRebounding = useSource('familyWeight-rebounding');
  const wPerimeter = useSource('familyWeight-perimeterDefense');
  const wInterior = useSource('familyWeight-interiorDefense');
  const weightSources = [
    ['scoring', 'Scoring', wScoring], ['freeThrowPressure', 'Free-throw pressure', wFreeThrows],
    ['spacing', 'Spacing', wSpacing], ['creation', 'Creation', wCreation],
    ['rebounding', 'Rebounding', wRebounding], ['perimeterDefense', 'Perimeter defense', wPerimeter],
    ['interiorDefense', 'Interior defense', wInterior],
  ].map(([key, label, source]) => ({ key, label, source }));

  const isRotation = mode.value === 'rotation';
  const productionRows = [
    ['Points ≥', minPoints], ['Rebounds ≥', minRebounds], ['Assists ≥', minAssists],
    ['Steals ≥', minSteals], ['Blocks ≥', minBlocks], ['Turnovers ≤', maxTurnovers],
  ].filter(([, source]) => source.value !== '' && source.value != null);
  const opponentLabel = opponent.options.find(option => option.value === opponent.value)?.label;
  const setWeights = weightSources
    .map(({ key, label, source }) => ({ key, label, value: Number(source.value) || 0 }))
    .filter(weight => weight.value > 0)
    .sort((a, b) => b.value - a.value);
  const weightTotal = setWeights.reduce((sum, weight) => sum + weight.value, 0);
  const opponentValue = opponentLabel || 'No opponent selected';

  return <div className="ll-brief">
    <BriefTile icon={LayoutGrid} title="Group shape" badge={MODE[mode.value] || '—'}>
      <BriefItem label="Players in group" value={num(size.value)} />
    </BriefTile>
    <BriefTile icon={Users} title="Court roles">
      <BriefItem label="Guards" value={`≥ ${num(guards.value)}`} />
      <BriefItem label="Forwards" value={`≥ ${num(forwards.value)}`} />
      <BriefItem label="Centers" value={`≥ ${num(centers.value)}`} />
      <BriefItem label="Flexibility" value={FLEXIBILITY[flexibility.value] || '—'} />
    </BriefTile>
    <BriefTile icon={Target} title="Production floors" badge={productionRows.length ? `${productionRows.length} set` : 'None'}>
      {productionRows.length
        ? productionRows.map(([label, source]) => <BriefItem key={label} label={label} value={source.value} />)
        : <p className="ll-brief-empty">No group-wide floor set — any passing group qualifies.</p>}
    </BriefTile>
    <BriefTile icon={Gauge} title="Planning reserve">
      <BriefItem label="Estimate caution" value={RESERVE[projectionRisk.value] || '—'} />
    </BriefTile>
    {isRotation && <BriefTile icon={Timer} title="Rotation rules" badge="Rotation">
      <BriefItem label="Minutes per player" value={`${num(rotationMin.value)}–${num(rotationMax.value)}`} />
      <BriefItem label="Comparison" value={BASIS[scoringBasis.value] || '—'} />
      <BriefItem label="Rate confidence" value={STABILITY[rateStability.value] || '—'} />
      <BriefItem label="Position mix" value={PROFILE[positionProfile.value] || '—'} />
      <BriefItem label="Role balance" value={BALANCE[roleBalance.value] || '—'} />
    </BriefTile>}
    <BriefTile icon={BrainCircuit} title="Ranking model">
      <BriefItem label="Primary model" value={MODEL[modelMode.value] || '—'} />
      {modelMode.value === 'swishiq-impact' && <BriefItem label="Offense / defense" value={OBJECTIVE[objective.value] || '—'} />}
      {modelMode.value === 'swishiq-impact' && objective.value === 'custom' && <>
        <BriefItem label="Offense weight" value={num(offenseWeight.value)} />
        <BriefItem label="Defense weight" value={num(defenseWeight.value)} />
      </>}
    </BriefTile>
    <BriefTile icon={ShieldHalf} title="Opponent context">
      <BriefItem label="Opponent" value={opponentValue} />
    </BriefTile>
    <BriefTile icon={SlidersHorizontal} title="Strategy mix" badge={weightTotal ? 'Custom' : 'Preset'}>
      {weightTotal
        ? <div className="ll-brief-weights">{setWeights.slice(0, 4).map(weight =>
          <div key={weight.key} className="ll-brief-weight">
            <div className="ll-brief-weight__head"><span>{weight.label}</span><strong>{Math.round((weight.value / weightTotal) * 100)}%</strong></div>
            <div className="ll-brief-bar"><span style={{ width: `${(weight.value / weightTotal) * 100}%` }} /></div>
          </div>)}
          {setWeights.length > 4 && <p className="ll-brief-empty">{setWeights.length - 4} more skill{setWeights.length - 4 === 1 ? '' : 's'} weighted lower.</p>}
        </div>
        : <p className="ll-brief-empty">Preset only — no custom weighting. Groups are ranked by the selected strategy alone.</p>}
    </BriefTile>
  </div>;
}