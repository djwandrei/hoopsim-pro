import React, { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
const AXES = [['off','Offense',false],['def','Defense',true],['net','Net rating',false],['pace','Pace',false],['efg','eFG%',false],['oppEfg','Defended eFG',true],['orb','Off. rebounding',false],['oppTov','Forced TOV',true]];
const scale = (team,league,key,invert) => {
  const values = league.teams.map(row => row[key]).filter(Number.isFinite);
  if (!values.length || !Number.isFinite(team[key])) return 0;
  const min = Math.min(...values),span = Math.max(...values) - min || 1;
  const scaled = (team[key] - min) / span * 100;
  return Math.round(invert ? 100 - scaled : scaled);
};
export default function MatchupRadar({ teamA,teamB,league }) {
  const data = useMemo(() => AXES.map(([key,label,invert]) => ({ axis:label,a:scale(teamA,league,key,invert),b:scale(teamB,league,key,invert),rawA:teamA[key],rawB:teamB[key] })),[teamA,teamB,league]);
  const tip = ({ active,payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg"><p className="font-semibold text-foreground">{point.axis}</p><p className="mt-1 font-mono text-gold">{teamA.code} {Number(point.rawA).toFixed(1)}</p><p className="font-mono" style={{ color: 'hsl(var(--court-royal))' }}>{teamB.code} {Number(point.rawB).toFixed(1)}</p></div>;
  };
  return <section className="court-panel p-5"><p className="court-kicker">Shape of the matchup</p><h2 className="mt-1 font-display text-2xl">RATE RADAR</h2><p className="mt-2 text-xs text-muted-foreground">Each spoke is scaled 0–100 across the league; defensive rates are inverted so a wider wedge means an edge.</p><div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background:'hsl(var(--court-accent))' }} />{teamA.code}</span><span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background:'hsl(var(--court-royal))' }} />{teamB.code}</span></div><div className="mt-2 h-80" role="img" aria-label={`Radar comparing ${teamA.code} and ${teamB.code}`}><ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="72%"><PolarGrid stroke="hsl(var(--border) / .3)" /><PolarAngleAxis dataKey="axis" tick={{ fill:'hsl(var(--muted-foreground))',fontSize:10 }} /><Radar name={teamA.code} dataKey="a" stroke="hsl(var(--court-accent))" fill="hsl(var(--court-accent))" fillOpacity={0.25} isAnimationActive={false} /><Radar name={teamB.code} dataKey="b" stroke="hsl(var(--court-royal))" fill="hsl(var(--court-royal))" fillOpacity={0.25} isAnimationActive={false} /><Tooltip content={tip} /></RadarChart></ResponsiveContainer></div></section>;
}