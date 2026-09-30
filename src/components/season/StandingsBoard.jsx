import React from 'react';
import ConferenceStandings from '@/components/season/ConferenceStandings';
export default function StandingsBoard({ summary, league, focusCode, onFocusChange, actualMap }) {
  const ranked = conference => summary.filter(row => league.byCode.get(row.code)?.conference === conference).sort((a,b) => b.wins - a.wins || (b.ortg - b.drtg) - (a.ortg - a.drtg));
  return <section className="grid gap-4 xl:grid-cols-2">{['EAST','WEST'].map(conference => <ConferenceStandings key={conference} title={conference} rows={ranked(conference)} focusCode={focusCode} onFocusChange={onFocusChange} actualMap={actualMap} />)}</section>;
}