import React from 'react';
import { Award, ShieldCheck, Trophy } from 'lucide-react';
import { decisionProofStatus } from '@/lib/dailyGames/resultPassportCore';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

export default function GamePointsBoard({ outcome, contextTitle, teamCode }) {
  const teamLogo = teamCode ? teamAsset(teamCode) : null;
  const passport = outcome?.resultPassport;
  const v4Evaluation = outcome?.evaluation ?? null;
  const decision = passport?.decision ?? v4Evaluation?.decision;
  const gamePoints = passport?.gamePoints;
  const nativeOutcome = passport?.nativeOutcome;
  const production = v4Evaluation?.observedProduction;
  const metric = production ?? v4Evaluation?.estimatedImpact;
  const proof = passport?.decision ? decisionProofStatus(passport.decision) : null;
  const unitLabel = production ? 'Game Score per 40 minutes' : 'points per 100 possessions';
  const selectedValue = Number.isFinite(metric?.value) ? metric.value : Number.isFinite(nativeOutcome?.value) ? nativeOutcome.value : null;
  const bestValue = Number.isFinite(metric?.bestValue) ? metric.bestValue : selectedValue != null && decision ? selectedValue + decision.gapToBest : null;
  const scale = bestValue != null ? Math.max(Math.abs(selectedValue), Math.abs(bestValue)) || 1 : 1;
  const widthFor = value => `${Math.min(100, (Math.abs(value) / scale) * 100).toFixed(1)}%`;
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
        </div>
        {gamePoints && (
          <span className="dg-badge ml-auto"><Trophy className="h-3 w-3" /> {gamePoints.total}/{gamePoints.max} game points</span>
        )}
      </div>
      {decision && (
        <div className="dg-tiles mt-4">
          {[
            ['Choices beaten', decision.choicesBeaten ?? decision.optionCount - decision.rank],
            ['Gap to best', (metric?.gapToBest ?? decision.gapToBest)?.toFixed(2) ?? '—'],
            ['Rank proof', (proof?.countComplete ?? decision.countComplete) ? 'Complete' : 'Bounded'],
            gamePoints ? ['Placement', `${gamePoints.placement} pts`] : ['Scoring', production ? 'Box score' : 'Impact'],
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
          <p className="dg-note">{production ? 'Observed' : 'Estimated'} {unitLabel}. Higher values rank better.</p>
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
      <p className="dg-note mt-2"><Award className="h-3 w-3 text-gold" />{production ? 'The score averages the five players’ observed Hollinger Game Score per 40 minutes in this team, season, and phase. It describes recorded box-score production; it is not a forecast or an observed lineup result.' : 'Model estimate of additive player impact; it is not observed five-player performance or causal chemistry.'}</p>
    </section>
  );
}
