import React from 'react';
import { Award, ShieldCheck, Trophy } from 'lucide-react';
import { decisionProofStatus } from '@/lib/dailyGames/resultPassportCore';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const humanizeUnit = value => ({
  'game-score-per-40-minutes': 'Game Score per 40 minutes',
  'points-per-100-possessions': 'points per 100 possessions',
}[value] || (typeof value === 'string' ? value.replaceAll('-', ' ') : 'model units'));

function comparisonLabel(value) {
  if (typeof value === 'string') return value.replaceAll('-', ' ');
  if (!value || typeof value !== 'object') return '';
  const label = value.label || value.description || (typeof value.kind === 'string' ? value.kind.replaceAll('-', ' ') : '');
  return typeof label === 'string' ? label : '';
}

export default function GamePointsBoard({ outcome, contextTitle, teamCode, bestSelectionLabel, impactModelRef: boardImpactModelRef }) {
  const teamLogo = teamCode ? teamAsset(teamCode) : null;
  const passport = outcome?.resultPassport;
  const v4Evaluation = outcome?.evaluation ?? null;
  const scoringContract = outcome?.resultContract?.scoringContract || outcome?.scoringContract;
  const sourceImpact = v4Evaluation?.evaluationKind === 'descriptive-source-impact-ranking'
    || scoringContract === 'swishiq-impact-combined-source-ranking-v1';
  const decision = passport?.decision ?? v4Evaluation?.decision;
  const gamePoints = passport?.gamePoints;
  const nativeOutcome = passport?.nativeOutcome;
  const production = Boolean(v4Evaluation?.observedProduction)
    || v4Evaluation?.evaluationKind === 'descriptive-box-score-production-ranking'
    || scoringContract === 'observed-box-score-production-v1';
  const metric = v4Evaluation?.observedProduction ?? v4Evaluation?.estimatedImpact;
  const proof = passport?.decision ? decisionProofStatus(passport.decision) : null;
  const unitLabel = metric?.unit ? humanizeUnit(metric.unit) : production ? 'Game Score per 40 minutes' : 'model units';
  const selectedValue = Number.isFinite(metric?.value) ? metric.value : Number.isFinite(nativeOutcome?.value) ? nativeOutcome.value : null;
  const gapToBest = Number.isFinite(metric?.gapToBest) ? metric.gapToBest : Number.isFinite(decision?.gapToBest) ? decision.gapToBest : null;
  const bestValue = Number.isFinite(metric?.bestValue) ? metric.bestValue : selectedValue != null && gapToBest != null ? selectedValue + gapToBest : null;
  const scaleMin = bestValue != null ? Math.min(0, selectedValue, bestValue) : 0;
  const scaleMax = bestValue != null ? Math.max(0, selectedValue, bestValue) : 1;
  const scale = scaleMax - scaleMin || 1;
  const widthFor = value => `${Math.max(0, Math.min(100, ((value - scaleMin) / scale) * 100)).toFixed(1)}%`;
  const metricComparison = comparisonLabel(metric?.comparison);
  const impactModelRef = outcome?.sourcePins?.impactModelRef || outcome?.impactModelRef || boardImpactModelRef;
  const modelIdentity = impactModelRef?.modelId
    ? `${impactModelRef.modelId}${impactModelRef.modelVersion ? `@${impactModelRef.modelVersion}` : ''}`
    : '';
  return (
    <section className="dg-result dg-reveal" aria-label="Verified result" style={teamCode ? { '--dg-team': paletteForTeam(teamCode)?.primary } : undefined}>
      <span className="dg-result__watermark" aria-hidden="true">{gamePoints ? `${gamePoints.total}` : '—'}</span>
      <span className="bcast-kicker">Verified result</span>
      <div className="dg-result__hero mt-4">
        {gamePoints && (
          <div className="dg-result__score">
            <div>
              <div className="dg-result__score-value">{gamePoints.total}</div>
              <div className="dg-result__score-max">of {gamePoints.max} pts</div>
            </div>
          </div>
        )}
        <div className="min-w-0">
          {teamCode && (
            <span className="dg-result__club">
              {teamLogo && <img className="dg-result__logo" src={teamLogo} alt="" />}
              <span className="dg-result__code">{teamCode}</span>
            </span>
          )}
          <h3 className="dg-result__rank">
            {decision ? `Rank ${decision.rank} of ${decision.optionCount}` : v4Evaluation ? 'Descriptive rank verified' : 'Result unavailable'}
          </h3>
          {contextTitle && <p className="dg-result__context mt-1">{contextTitle}</p>}
          {bestSelectionLabel && <p className="dg-result__context mt-2"><strong>Best legal choice:</strong> {bestSelectionLabel}</p>}
        </div>
        {gamePoints && (
          <span className="dg-badge ml-auto"><Trophy className="h-3 w-3" /> {gamePoints.total}/{gamePoints.max} game points</span>
        )}
      </div>
      {decision && (
        <div className="dg-tiles mt-4">
          {[
            ['Choices beaten', decision.choicesBeaten ?? decision.optionCount - decision.rank],
            ['Gap to best', gapToBest != null ? `${gapToBest.toFixed(2)} ${unitLabel}` : '—'],
            ['Rank proof', (proof?.countComplete ?? decision.countComplete) ? 'Complete' : 'Bounded'],
            gamePoints ? ['Placement', `${gamePoints.placement} pts`] : ['Scoring', production ? 'Box score' : sourceImpact ? 'Source impact' : 'Impact'],
          ].map(([label, value]) => (
            <div key={label} className="dg-tile">
              <p className="dg-tile-label">{label}</p>
              <p className="dg-tile-value">{value}</p>
            </div>
          ))}
        </div>
      )}
      {selectedValue != null && bestValue != null && (
        <div className="dg-compare" aria-label="Estimate comparison">
          <div className="dg-compare__row">
            <span>Best legal</span>
            <span className="dg-compare__track"><span className="dg-compare__fill dg-compare__fill--best" style={{ width: widthFor(bestValue) }} /></span>
            <span>{bestValue.toFixed(2)}</span>
          </div>
          <div className="dg-compare__row">
            <span>Your pick</span>
            <span className="dg-compare__track"><span className="dg-compare__fill dg-compare__fill--yours" style={{ width: widthFor(selectedValue) }} /></span>
            <span>{selectedValue.toFixed(2)}</span>
          </div>
          <p className="dg-note">{production ? 'Observed' : sourceImpact ? 'Descriptive model estimate' : 'Estimated'} {unitLabel}. Higher values rank better.{metricComparison ? ` ${metricComparison}.` : sourceImpact ? ' Full five-player mean, not a replacement-only difference.' : ''}</p>
        </div>
      )}
      {proof && <p className="dg-note mt-4"><ShieldCheck className="h-3.5 w-3.5 text-positive" />{proof.disclosure}</p>}
      {!proof && v4Evaluation && (
        <p className="dg-note mt-4"><ShieldCheck className="h-3.5 w-3.5 text-positive" />V4 {production ? 'box-score production' : 'source-impact'} ranking, verified against every legal choice in the exact-season board.</p>
      )}
      {gamePoints && (
        <p className="dg-note mt-2">
          {gamePoints.ruleVersion === 'swishiq-game-points-v2'
            ? 'Each legal pick earns 1 point. A complete rank adds 0–9 place points by the board policy.'
            : 'Each legal pick earns 1 point; placement adds up to 3 place points.'}
        </p>
      )}
      {sourceImpact && <p className="dg-note mt-2"><Award className="h-3 w-3 text-gold" />Descriptive combined-source ranking of the full five-player result. Uncertainty is not estimated; this is not a forecast or a causal effect.</p>}
      {production && <p className="dg-note mt-2"><Award className="h-3 w-3 text-gold" />The score averages the five players’ observed Hollinger Game Score per 40 minutes in this team, season, and phase. It describes recorded box-score production; it is not a forecast or an observed lineup result.</p>}
      {!sourceImpact && !production && <p className="dg-note mt-2"><Award className="h-3 w-3 text-gold" />Model estimate of player impact; it is not observed five-player performance or causal chemistry.</p>}
      {sourceImpact && modelIdentity && <p className="dg-note mt-2">Impact model {modelIdentity} · release {impactModelRef.releaseId}{impactModelRef.manifestSha256 ? ` · manifest SHA-256 ${impactModelRef.manifestSha256.slice(0, 12)}…` : ''}</p>}
    </section>
  );
}
