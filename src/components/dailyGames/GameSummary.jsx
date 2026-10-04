import React, { useMemo } from 'react';
import { Trophy, ShieldAlert } from 'lucide-react';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

// The game-summary screen: verdict banner, score strip with team logos, a
// quarter-by-quarter line, a head-to-head team stat duel, and top performers.
export default function GameSummary({ label, homeCode = '', awayCode = '', opponent, result }) {
  const won = result.homePts > result.awayPts;
  const home = { name: label, logo: teamAsset(homeCode), palette: paletteForTeam(homeCode) };
  const away = { name: opponent?.name || 'Away', logo: teamAsset(awayCode), palette: paletteForTeam(awayCode) };
  const quarters = useMemo(() => {
    const byQuarter = new Map();
    for (const event of result.pbp || []) {
      if (!event?.q || event.q === 'FINAL') continue;
      const slot = byQuarter.get(event.q) || { home: 0, away: 0 };
      if (event.side === 'home') slot.home += event.pts || 0;
      else if (event.side === 'away') slot.away += event.pts || 0;
      byQuarter.set(event.q, slot);
    }
    return [...byQuarter.entries()];
  }, [result?.pbp]);
  const qGrid = `minmax(5.5rem, 1fr) repeat(${Math.max(quarters.length, 4) + 1}, minmax(2.6rem, 1fr))`;
  const homeStats = result.statsHome || {};
  const awayStats = result.statsAway || {};
  const pct = value => `${(Math.round((value || 0) * 1000) / 10).toFixed(1)}%`;
  const duels = [
    { label: 'Off. rating', home: Math.round(result.ortgH), away: Math.round(result.ortgA), better: 'high' },
    { label: 'eFG %', home: homeStats.efg, away: awayStats.efg, better: 'high', format: pct },
    { label: 'Rebounds', home: homeStats.reb, away: awayStats.reb, better: 'high' },
    { label: 'Assists', home: homeStats.ast, away: awayStats.ast, better: 'high' },
    { label: 'Turnovers', home: homeStats.tov, away: awayStats.tov, better: 'low' },
  ];
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
            {won ? 'Your five win it' : `${away.name} take it`}
          </p>
        </div>
      </div>
      <div className="dg-summary__score">
        <div className="dg-summary__side" style={{ '--dg-team': home.palette?.primary }}>
          {home.logo && <img className="dg-summary__logo" src={home.logo} alt="" />}
          <span className="dg-summary__pts">{result.homePts}</span>
          <span className="dg-summary__name">{home.name}</span>
        </div>
        <span className="dg-summary__mid">
          <span className="dg-summary__final">{result.ot ? `${result.ot}OT` : 'FINAL'}</span>
          <span className="dg-summary__poss">{Math.round(result.poss)} poss</span>
        </span>
        <div className="dg-summary__side" style={{ '--dg-team': away.palette?.primary }}>
          {away.logo && <img className="dg-summary__logo" src={away.logo} alt="" />}
          <span className="dg-summary__pts">{result.awayPts}</span>
          <span className="dg-summary__name">{away.name}</span>
        </div>
      </div>
      {quarters.length > 0 && (
        <div className="dg-summary__quarters">
          <div className="dg-summary__qhead" style={{ gridTemplateColumns: qGrid }}>
            <span />
            {quarters.map(([q]) => <span key={q}>{q === 'OT' ? 'OT' : q.replace('Q', '')}</span>)}
            <span>Final</span>
          </div>
          <div className="dg-summary__qrow" style={{ gridTemplateColumns: qGrid }}>
            <span className="dg-summary__qteam">{home.name}</span>
            {quarters.map(([q, slot]) => <span key={q}>{slot.home}</span>)}
            <span className="dg-summary__qfinal">{result.homePts}</span>
          </div>
          <div className="dg-summary__qrow" style={{ gridTemplateColumns: qGrid }}>
            <span className="dg-summary__qteam">{away.name}</span>
            {quarters.map(([q, slot]) => <span key={q}>{slot.away}</span>)}
            <span className="dg-summary__qfinal">{result.awayPts}</span>
          </div>
        </div>
      )}
      <div className="dg-summary__duels">
        {duels.map(duel => {
          const homeLeads = duel.better === 'high' ? (duel.home || 0) > (duel.away || 0) : (duel.home || 0) < (duel.away || 0);
          const tie = (duel.home || 0) === (duel.away || 0);
          const fmt = duel.format || (value => Math.round(value || 0));
          return (
            <div key={duel.label} className="dg-summary__duel">
              <span className={`dg-summary__duel-val ${!tie && homeLeads ? 'is-leader' : ''}`}>{fmt(duel.home)}</span>
              <span className="dg-summary__duel-label">{duel.label}</span>
              <span className={`dg-summary__duel-val ${!tie && !homeLeads ? 'is-leader' : ''}`}>{fmt(duel.away)}</span>
            </div>
          );
        })}
      </div>
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