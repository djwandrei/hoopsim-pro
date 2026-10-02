import React, { useMemo } from 'react';
import { seasonLabel } from '@/lib/season/simEngine';
export default function MatchupMeetings({ source,teamA,teamB,year }) {
  const meetings = useMemo(() => (source.schedule || []).filter(game => game.actual && ((game.home === teamA.code && game.away === teamB.code) || (game.home === teamB.code && game.away === teamA.code))).slice(0,10),[source,teamA.code,teamB.code]);
  const aWins = meetings.filter(game => (game.actual.home > game.actual.away ? game.home : game.away) === teamA.code).length;
  return <section className="court-panel p-5"><p className="court-kicker">Head-to-head history</p><h2 className="mt-1 font-display text-2xl">OBSERVED MEETINGS · {seasonLabel(year)}</h2><p className="mt-2 text-xs text-muted-foreground">Season series: {teamA.code} {aWins} – {meetings.length - aWins} {teamB.code}</p>{meetings.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Date</th><th className="text-left">Matchup</th><th>Winner</th><th>Margin</th></tr></thead><tbody>{meetings.map((game,index) => {
    const homeWon = game.actual.home > game.actual.away;
    const winner = homeWon ? game.home : game.away;
    return <tr key={index}><td className="text-left text-xs text-muted-foreground">{game.at || '—'}</td><td className="text-left font-mono text-xs">{game.away} {game.actual.away} @ {game.home} {game.actual.home}</td><td className="font-semibold text-gold">{winner}</td><td className="font-mono text-xs">{Math.abs(game.actual.home - game.actual.away)}</td></tr>;
  })}</tbody></table></div> : <p className="mt-3 text-xs text-muted-foreground">No observed meetings between these two teams in the package schedule.</p>}</section>;
}