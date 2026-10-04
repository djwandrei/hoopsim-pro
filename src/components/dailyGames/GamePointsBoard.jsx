import React from 'react';
import { Award, ShieldCheck, Trophy } from 'lucide-react';
import { decisionProofStatus } from '@/lib/dailyGames/resultPassportCore';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

export default function GamePointsBoard({ outcome, contextTitle, teamCode }) {
  const teamLogo = teamCode ? teamAsset(teamCode) : null;
  const passport = outcome?.resultPassport;
  const decision = passport?.decision;
  const gamePoints = passport?.gamePoints;
  const nativeOutcome = passport?.nativeOutcome;
  const proof = decision ? decisionProofStatus(decision) : null;
  const unitLabel = nativeOutcome?.unit === 'points-per-100-possessions' ? 'points per 100 possessions' : 'points';
  const selectedValue = nativeOutcome && Number.isFinite(nativeOutcome.value) ? nativeOutcome.value : null;
  const bestValue = selectedValue != null && decision ? selectedValue + decision.gapToBest : null;
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
            {decision ? `Rank ${decision.rank} of ${decision.optionCount}` : 'Result unavailable'}
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
            ['Choices beaten', decision.choicesBeaten],
            ['Gap to best', decision.gapToBest.toFixed(2)],
            ['Rank proof', proof?.countComplete ? 'Complete' : 'Bounded'],
            ['Placement', `${gamePoints?.placement ?? 0} pts`],
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
          <p className="dg-note">Estimated {unitLabel} — closer to the best legal pick means better.</p>
        </div>
      )}
      {proof && <p className="dg-note mt-4"><ShieldCheck className="h-3.5 w-3.5 text-positive" />{proof.disclosure}</p>}
      {gamePoints && (
        <p className="dg-note mt-2">
          {gamePoints.ruleVersion === 'swishiq-game-points-v2'
            ? 'Each legal pick earns 1 point. A complete rank adds 0–9 place points by the board policy.'
            : 'Each legal pick earns 1 point; placement adds up to 3 place points.'}
        </p>
      )}
      <p className="dg-note mt-2"><Award className="h-3 w-3 text-gold" />Model estimate of summed additive player impact — not observed five-player performance or causal chemistry.</p>
    </section>
  );
}