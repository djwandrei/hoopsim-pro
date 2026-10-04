import React from 'react';
import { Award, ShieldCheck, Trophy } from 'lucide-react';
import { decisionProofStatus } from '@/lib/dailyGames/resultPassportCore';

export default function GamePointsBoard({ outcome, contextTitle }) {
  const passport = outcome?.resultPassport;
  const decision = passport?.decision;
  const gamePoints = passport?.gamePoints;
  const nativeOutcome = passport?.nativeOutcome;
  const proof = decision ? decisionProofStatus(decision) : null;
  const unitLabel = nativeOutcome?.unit === 'points-per-100-possessions' ? 'points per 100 possessions' : 'points';
  return (
    <section className="court-panel border-gold/40 p-5" aria-label="Verified result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="bcast-kicker">Verified result</span>
        {gamePoints && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold">
            <Trophy className="h-3.5 w-3.5" /> {gamePoints.total}/{gamePoints.max} game points
          </span>
        )}
      </div>
      <h3 className="mt-3 font-display text-2xl tracking-wide">
        {decision ? `Source-impact rank ${decision.rank} of ${decision.optionCount}` : 'Result unavailable'}
      </h3>
      {contextTitle && <p className="mt-1 text-xs text-muted-foreground">{contextTitle}</p>}
      {decision && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Legal choices beaten', decision.choicesBeaten],
            ['Gap to best', decision.gapToBest.toFixed(2)],
            ['Rank proof', proof?.countComplete ? 'Complete' : 'Bounded'],
            ['Placement', `${gamePoints?.placement ?? 0} pts`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/30 bg-canvas/50 p-2.5 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}
      {nativeOutcome && Number.isFinite(nativeOutcome.value) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Selected estimate <span className="font-mono tabular-nums text-foreground">{nativeOutcome.value.toFixed(2)}</span> {unitLabel} ·
          best legal <span className="font-mono tabular-nums">{(nativeOutcome.value + (decision?.gapToBest ?? 0)).toFixed(2)}</span>
        </p>
      )}
      {proof && <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />{proof.disclosure}</p>}
      {gamePoints && (
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {gamePoints.ruleVersion === 'swishiq-game-points-v2'
            ? 'Each legal pick earns 1 point. A complete rank adds 0–9 place points by the board policy.'
            : 'Each legal pick earns 1 point; placement adds up to 3 place points.'}
        </p>
      )}
      <p className="mt-3 inline-flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground"><Award className="mt-0.5 h-3 w-3 shrink-0 text-gold" />Model estimate of summed additive player impact — not observed five-player performance or causal chemistry.</p>
    </section>
  );
}