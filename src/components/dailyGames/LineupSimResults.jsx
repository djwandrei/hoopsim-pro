import React, { useEffect, useRef, useState } from 'react';
import LineupCourt from '@/components/dailyGames/LineupCourt';
import GameSummary from '@/components/dailyGames/GameSummary';
import BoxScore from '@/components/dailyGames/BoxScore';
import LiveScoreboard from '@/components/dailyGames/LiveScoreboard';

export default function LineupSimResults({ result, courtPalette, scoreboardOverlay }) {
  const [done, setDone] = useState(false);
  const scoreRef = useRef(null);
  const { homeTeam, awayTeam, lineup, lineupLabel } = result;
  useEffect(() => { scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  const court = <div className="mt-4"><LineupCourt lineup={lineup} slim palette={courtPalette} /></div>;
  return <>
    {!scoreboardOverlay && court}
    <div className="mt-4" ref={scoreRef}>
      <LiveScoreboard homeCode={homeTeam.code} awayCode={awayTeam.code} homeName={homeTeam.name} awayName={awayTeam.name} result={result} onComplete={() => setDone(true)} />
    </div>
    {scoreboardOverlay && court}
    {done && <div className="dg-flow-in mt-4 space-y-4">
      <GameSummary label={lineupLabel} homeCode={homeTeam.code} awayCode={awayTeam.code} opponent={awayTeam} result={result} />
      <BoxScore title={`${lineupLabel} — box score`} code={homeTeam.code} box={result.boxHome} teamStats={result.statsHome} teamPoints={result.homePts} />
      <details>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-gold">{awayTeam.name} box score</summary>
        <div className="mt-2"><BoxScore title={awayTeam.name} code={awayTeam.code} box={result.boxAway} teamStats={result.statsAway} teamPoints={result.awayPts} /></div>
      </details>
      <details>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-gold">Play-by-play</summary>
        <div className="dg-sim__feed mt-2">{result.pbp.map((event, index) => <div key={index} className="dg-sim__feed-event">
          <span className="dg-sim__feed-clock">{event.q} {event.clock}</span><span className="min-w-0 flex-1">{event.text}</span>
        </div>)}</div>
      </details>
    </div>}
  </>;
}