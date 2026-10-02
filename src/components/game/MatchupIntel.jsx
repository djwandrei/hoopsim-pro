import React, { useState } from 'react';
import { ArrowLeftRight, Dices } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import MatchupRadar from '@/components/game/MatchupRadar';
import MatchupTable from '@/components/game/MatchupTable';
import MatchupMeetings from '@/components/game/MatchupMeetings';

const Bar = ({ label, value, average, invert }) => {
  const delta = value - average;
  const width = Math.min(94, Math.max(6, 50 + delta * 3));
  const good = invert ? delta < 0 : delta > 0;
  return <div className="min-w-0"><p className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground"><span>{label}</span><span className={`font-mono ${good ? 'text-positive' : 'text-trim'}`}>{value.toFixed(1)}</span></p><div className="mt-1 h-1.5 rounded-full bg-canvas"><div className={`h-1.5 rounded-full ${good ? 'bg-positive/80' : 'bg-trim/70'}`} style={{ width: `${width}%`, marginLeft: invert ? `${100 - width}%` : undefined }} /></div></div>;
};

export default function MatchupIntel({ source, league, year }) {
  const [a, setA] = useState(league.teams[0]?.code || '');
  const [b, setB] = useState(league.teams[1]?.code || '');
  const teamA = league.byCode.get(a) || league.teams[0];
  const teamB = league.byCode.get(b) || league.teams[1];
  const swap = () => { setA(b);setB(a); };
  const randomize = () => {
    const first = Math.floor(Math.random() * league.teams.length);
    let second = Math.floor(Math.random() * (league.teams.length - 1));
    if (second >= first) second += 1;
    setA(league.teams[first].code);setB(league.teams[second].code);
  };
  const edges = [
    ['Shooting', teamA.efg - teamB.oppEfg, teamB.efg - teamA.oppEfg],
    ['Rebounding', teamA.orb + teamA.drb, teamB.orb + teamB.drb],
    ['Ball control', teamB.oppTov - teamA.tov, teamA.oppTov - teamB.tov],
  ];
  const side = team => <div className="min-w-0 rounded-xl border border-border/25 bg-canvas/30 p-3">
    <div className="flex items-center gap-2.5"><TeamMark code={team.code} name={team.name} className="h-14 w-14" /><div className="min-w-0"><p className="truncate text-xs font-semibold">{team.name}</p><p className="font-mono text-[10px] text-muted-foreground">NET {team.net > 0 ? '+' : ''}{team.net.toFixed(1)}</p></div></div>
    <div className="mt-3 space-y-2.5"><Bar label="Offense" value={team.off} average={league.offAvg} /><Bar label="Defense" value={team.def} average={league.defAvg} invert /><Bar label="Pace" value={team.pace} average={99} /></div>
    <p className="mt-2 truncate text-[10px] text-muted-foreground">{team.roster[0] ? `Leads minutes: ${team.roster[0].name}` : 'No roster rows in package'}</p>
  </div>;
  return <section aria-label="Matchup intelligence" className="space-y-4">
    <div className="court-panel p-4">
      <p className="court-kicker">Matchup intelligence</p>
      <h2 className="mt-1 font-display text-2xl">PICK YOUR BOARD</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Set the matchup here, mirror it in the original Game Lab below.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted-foreground">Team A<select value={a} onChange={event => setA(event.target.value)} className="studio-select mt-1.5">{league.teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}</select></label>
        <label className="block text-xs text-muted-foreground">Team B<select value={b} onChange={event => setB(event.target.value)} className="studio-select mt-1.5">{league.teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}</select></label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={swap} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border/30 text-[11px] font-semibold text-gold hover:bg-raised"><ArrowLeftRight className="h-3.5 w-3.5" />Swap sides</button>
        <button type="button" onClick={randomize} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border/30 text-[11px] font-semibold text-gold hover:bg-raised"><Dices className="h-3.5 w-3.5" />Random pairing</button>
      </div>
    </div>
    <div className="court-panel p-4"><div className="grid grid-cols-2 gap-3">{side(teamA, 'A')}{side(teamB, 'B')}</div></div>
    <MatchupRadar teamA={teamA} teamB={teamB} league={league} />
    <MatchupTable teamA={teamA} teamB={teamB} />
    <div className="court-panel p-4">
      <p className="court-kicker">Observed edges</p>
      <ul className="mt-2 space-y-1.5">{edges.map(([label, valueA, valueB]) => { const leader = valueA === valueB ? null : valueA > valueB ? teamA : teamB; return <li key={label} className="flex items-center justify-between gap-2 rounded-lg border border-border/25 bg-canvas/30 px-2.5 py-2 text-[11px]"><span className="text-muted-foreground">{label}</span><span className={leader ? 'font-semibold text-gold' : 'text-muted-foreground'}>{leader ? `${leader.code} leads` : 'Even'}</span></li>; })}</ul>
    </div>
    <MatchupMeetings source={source} teamA={teamA} teamB={teamB} year={year} />
  </section>;
}