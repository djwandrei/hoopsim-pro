import React, { useMemo, useState } from 'react';
import { CheckCircle2, Trophy, XCircle } from 'lucide-react';
import { formatMetric } from './chemistryFormat';

export default function ChemChallenge({ first, second, chem }) {
  const rounds = useMemo(() => chem.pairProfileChallengeRounds(first, second), [chem, first, second]);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [choice, setChoice] = useState(null);
  if (!rounds.length) return <section className="court-panel p-5 text-sm text-muted-foreground">No different recorded measures are available for a comparison challenge.</section>;
  const done = step >= rounds.length;
  const round = rounds[Math.min(step, rounds.length - 1)];
  const pick = player => {
    if (choice || done) return;
    const correct = (player === 'first') === round.firstValue > round.secondValue;
    if (correct) setScore(value => value + 1);
    setChoice(correct ? player : (player === 'first' ? 'second' : 'first'));
  };
  return <section className="court-panel p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><Trophy className="h-3.5 w-3.5 text-gold" />Measure {Math.min(step + 1, rounds.length)} of {rounds.length} · {score} correct</p>
      <div className="flex gap-2">
        {choice && !done && <button type="button" onClick={() => { setStep(value => value + 1); setChoice(null); }} className="flex min-h-9 items-center rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold transition-colors hover:bg-gold/20">Next measure</button>}
        {done && <button type="button" onClick={() => { setStep(0); setScore(0); setChoice(null); }} className="flex min-h-9 items-center rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold transition-colors hover:bg-gold/20">Play again</button>}
      </div>
    </div>
    {done ? <div className="mt-4">
      <h4 className="font-display text-2xl tracking-wide text-gold">Challenge complete</h4>
      <p className="mt-1 text-sm text-muted-foreground">You scored {score} of {rounds.length} on {first.displayName} vs {second.displayName}.</p>
    </div> : <div className="mt-4">
      <h4 className="font-display text-xl tracking-wide text-foreground">Who recorded the higher {round.label.toLowerCase()}?</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[['first', first], ['second', second]].map(([key, player]) => {
          const isChoice = choice === key;
          const isWinner = choice && Number.isFinite(round[`${key}Value`]) && (round.firstValue > round.secondValue ? key === 'first' : key === 'second');
          return <button key={key} type="button" onClick={() => pick(key)} disabled={Boolean(choice)} aria-pressed={isChoice} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 ${isChoice ? (isWinner ? 'border-positive/50 bg-positive/10 text-positive' : 'border-trim/50 bg-trim/10 text-foreground') : 'border-border/50 bg-raised/40 text-foreground hover:border-gold/45 hover:text-gold'}`}>
            {isChoice && (isWinner ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />)}{player.displayName}
          </button>;
        })}
      </div>
      {choice && <p role="status" className="mt-3 text-sm text-muted-foreground">Correct answer: {round.firstValue > round.secondValue ? first.displayName : second.displayName} · {formatMetric(round.firstValue, round.type)} vs {formatMetric(round.secondValue, round.type)}.</p>}
    </div>}
  </section>;
}