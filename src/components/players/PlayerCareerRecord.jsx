import React from 'react';

const int = value => Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '—';
const avg = value => Number.isFinite(value) ? value.toFixed(1) : '—';
const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';

function Tile({ label, value, sub }) {
  return <div className="rounded-xl border border-border/25 bg-canvas/35 px-3 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className="mt-1 font-display text-3xl text-foreground">{value}</p>
    <p className="text-[10px] text-muted-foreground">{sub}</p>
  </div>;
}

export default function PlayerCareerRecord({ context, status }) {
  if (status === 'loading') return <p className="mt-3 text-xs text-muted-foreground">Loading career record…</p>;
  const rows = (context?.basketballReference?.seasons || []).filter(row => row.seasonPhase === 'regular' && !row.isMultiTeamAggregate);
  if (!rows.length) return <p className="mt-3 text-xs text-muted-foreground">Career regular-season record is not available for this player.</p>;
  const byYear = new Map();
  rows.forEach(row => {
    const list = byYear.get(row.seasonStartYear) || [];
    list.push(row);
    byYear.set(row.seasonStartYear, list);
  });
  const sum = (list,key) => list.reduce((total,row) => total + (Number.isFinite(row.totals?.[key]) ? row.totals[key] : 0),0);
  const rate = (made,att) => Number.isFinite(made) && Number.isFinite(att) && att > 0 ? made / att : null;
  const records = [...byYear.entries()].sort((a,b) => b[0] - a[0]).map(([year,list]) => {
    const games = sum(list,'gamesPlayed');
    return {
      season: `${year}–${String(year + 1).slice(-2)}`,
      teams: [...new Set(list.map(row => row.teamCode))].join(' / '),
      gp: games,
      mpg: sum(list,'minutesPlayed') / games,
      ppg: sum(list,'points') / games,
      rpg: sum(list,'totalRebounds') / games,
      apg: sum(list,'assists') / games,
      fg: rate(sum(list,'fieldGoalsMade'),sum(list,'fieldGoalsAttempted')),
      three: rate(sum(list,'threePointFieldGoalsMade'),sum(list,'threePointFieldGoalsAttempted')),
      ft: rate(sum(list,'freeThrowsMade'),sum(list,'freeThrowsAttempted')),
    };
  });
  const games = sum(rows,'gamesPlayed');
  const career = [
    ['Games',int(games),'total'],['Points',int(sum(rows,'points')),'total'],
    ['Rebounds',int(sum(rows,'totalRebounds')),'total'],['Assists',int(sum(rows,'assists')),'total'],
    ['PPG',avg(sum(rows,'points') / games),'career average'],['RPG',avg(sum(rows,'totalRebounds') / games),'career average'],
    ['APG',avg(sum(rows,'assists') / games),'career average'],['MPG',avg(sum(rows,'minutesPlayed') / games),'career average'],
  ];
  return <>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{career.map(([label,value,sub]) => <Tile key={label} label={label} value={value} sub={sub} />)}</div>
    <p className="mt-4 text-xs font-semibold text-foreground">Team history</p>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {records.map(record => <span key={record.season} className="rounded-full border border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground">{record.season} · {record.teams}</span>)}
    </div>
    <p className="mt-4 text-xs font-semibold text-foreground">Year-by-year career regular-season stats</p>
    <div className="mt-2 overflow-x-auto rounded-xl border border-border/25">
      <table className="w-full">
        <thead><tr>{['Season','Team(s)','GP','MPG','PPG','RPG','APG','FG%','3P%','FT%'].map(label => <th key={label} className={['Season','Team(s)'].includes(label) ? 'text-left' : 'text-right'}>{label}</th>)}</tr></thead>
        <tbody>
          {records.map(record => <tr key={record.season}>
            <td className="text-xs font-semibold text-foreground">{record.season}</td>
            <td className="text-xs text-muted-foreground">{record.teams}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{int(record.gp)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{avg(record.mpg)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-gold">{avg(record.ppg)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{avg(record.rpg)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{avg(record.apg)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{pct(record.fg)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{pct(record.three)}</td>
            <td className="text-right font-mono text-[11px] tabular-nums text-foreground">{pct(record.ft)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}