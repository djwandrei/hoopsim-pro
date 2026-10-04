import React from 'react';
import { Trophy, ShieldAlert } from 'lucide-react';

// The game-summary screen: verdict banner, final score, efficiency ratings,
// and top performers from the simulated box score.
export default function GameSummary({ label, opponent, opponentLogo, result }) {
  const won = result.homePts > result.awayPts;
  const performers = [...(result.boxHome?.lines || [])].
    sort((a, b) => (b.pts + b.reb + b.ast) - (a.pts + a.reb + a.ast)).
    slice(0, 3);
  return (
    <section className="dg-summary" aria-label="Game summary">
      <div className="dg-summary__head">
        <div className="min-w-0">
          <span className="bcast-kicker">Game summary</span>
          <p className={`dg-summary__verdict ${won ? 'dg-summary__verdict--win' : 'dg-summary__verdict--loss'}`}>
            {won ? <Trophy className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            {won ? 'Your five win it' : `${opponent?.name || 'The opponent'} take it`}
          </p>
        </div>
        <span className="dg-summary__final">{result.ot ? `${result.ot}OT` : 'FINAL'}</span>
      </div>
      <div className="dg-summary__score">
        <div className="dg-summary__side">
          <span className="dg-summary__pts">{result.homePts}</span>
          <span className="dg-summary__name">{label}</span>
        </div>
        <span className="dg-summary__final">{result.ot ? `${result.ot}OT` : 'FINAL'}</span>
        <div className="dg-summary__side">
          <span className="dg-summary__pts">{result.awayPts}</span>
          <span className="dg-summary__name inline-flex items-center gap-1">
            {opponentLogo && <img src={opponentLogo} alt="" className="h-4 w-4 object-contain" />}
            {opponent?.name}
          </span>
        </div>
      </div>
      <dl className="dg-summary__ratings">
        <div><dt>Off. rating</dt><dd>{Math.round(result.ortgH)} — {Math.round(result.ortgA)}</dd></div>
        <div><dt>Pace</dt><dd>{Math.round(result.poss)}</dd></div>
        <div><dt>Margin</dt><dd>{won ? '+' : '−'}{Math.abs(result.homePts - result.awayPts)}</dd></div>
      </dl>
      <div className="dg-summary__top">
        <p className="dg-sim__meta">Top performers</p>
        <ul>
          {performers.map(line => (
            <li key={line.name} className="dg-summary__performer">
              <span className="dg-summary__performer-name">{line.name}</span>
              <span className="dg-summary__line">{line.pts} pts · {line.reb} reb · {line.ast} ast</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}