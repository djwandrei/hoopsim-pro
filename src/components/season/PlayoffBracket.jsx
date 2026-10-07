import React, { useEffect, useState } from 'react';
import { ChevronDown, Crown, Route, Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamThemeVars } from '@/components/game/matchupTheme';

const ROUND_ORDER = ['First round', 'Conference semifinals', 'Conference finals'];
const ROUND_SHORT = { 'First round': 'First round', 'Conference semifinals': 'Semifinals', 'Conference finals': 'Conference final' };

const winsFor = (series, code) => series.games.reduce(
  (n, g) => n + ((g.home === code ? g.homePts : g.awayPts) > (g.home === code ? g.awayPts : g.homePts) ? 1 : 0), 0);

function TeamRow({ code, seed, winner, wins, losses, isSel, onTeam }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  return (
    <button type="button" onClick={() => onTeam(code)} aria-pressed={isSel}
      className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${isSel ? '' : 'hover:bg-[var(--myna-raised)]'}`}
      style={isSel ? { ...teamThemeVars(code, mode), background: 'color-mix(in srgb, var(--team-primary) 16%, transparent)', boxShadow: 'inset 2px 0 0 var(--team-primary)' } : undefined}
    >
      <TeamMark code={code} name={code} className="h-6 w-6" />
      <span className="myna-mono text-[9px] myna-muted">#{seed}</span>
      <span className="myna-display min-w-0 flex-1 truncate text-sm tracking-[0.06em]">{code}</span>
      <span className="myna-mono shrink-0 text-[10px] font-bold" style={{ color: winner ? 'var(--myna-accent)' : 'var(--myna-muted)' }}>{wins}–{losses}</span>
      {winner && <Crown className="h-3 w-3 shrink-0" style={{ color: 'var(--myna-accent)' }} />}
    </button>
  );
}

function SeriesCard({ series, selCode, onTeam, expanded, onToggle }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const teams = [[series.higher, series.higherSeed], [series.lower, series.lowerSeed]];
  const involvesSel = Boolean(selCode) && teams.some(([code]) => code === selCode);
  const selWon = involvesSel && series.winner === selCode;
  return (
    <div
      className={`rounded-xl border p-2 transition-all ${involvesSel ? '' : 'border-[var(--myna-border)]'} ${selWon ? 'ring-1 ring-[var(--myna-accent)]' : ''}`}
      style={involvesSel ? { ...teamThemeVars(selCode, mode), borderColor: 'var(--team-primary)', background: 'color-mix(in srgb, var(--team-primary) 8%, transparent)' } : undefined}
    >
      <div className="space-y-0.5">
        {teams.map(([code, seed]) => (
          <TeamRow key={code} code={code} seed={seed} winner={series.winner === code} wins={winsFor(series, code)} losses={series.games.length - winsFor(series, code)} isSel={selCode === code} onTeam={onTeam} />
        ))}
      </div>
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className="mt-1 flex w-full items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] myna-muted transition-colors hover:text-[var(--myna-accent)]"
      >
        {expanded ? 'Hide games' : `Series games (${series.games.length})`}
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5 border-t border-[var(--myna-border)] pt-1">
          {series.games.map(game => {
            const homeWon = game.homePts > game.awayPts;
            return (
              <li key={game.game} className="myna-mono flex items-center justify-between gap-2 text-[10px]">
                <span className="myna-muted">G{game.game}</span>
                <span>{game.away} {game.awayPts} @ {game.home} {game.homePts}</span>
                <span className="myna-muted">{homeWon ? game.home : game.away} +{Math.abs(game.homePts - game.awayPts)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlayInGame({ game, onTeam }) {
  const rows = [
    { code: game.home, seed: game.homeSeed, pts: game.homePts },
    { code: game.away, seed: game.awaySeed, pts: game.awayPts },
  ].sort((a, b) => b.pts - a.pts);
  return (
    <div className="rounded-lg border border-[var(--myna-border)] bg-[var(--myna-surface)] px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-[0.12em] myna-muted">{game.label}</p>
      {rows.map(row => (
        <button key={row.code} type="button" onClick={() => onTeam(row.code)}
          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--myna-raised)]"
        >
          <TeamMark code={row.code} name={row.code} className="h-5 w-5" />
          <span className="myna-mono text-[9px] myna-muted">#{row.seed}</span>
          <span className="myna-display flex-1 truncate text-xs">{row.code}</span>
          <span className="myna-mono text-[11px] font-bold" style={{ color: row.code === game.winner ? 'var(--myna-accent)' : 'var(--myna-muted)' }}>{row.pts}</span>
          {row.code === game.winner && <Crown className="h-3 w-3 shrink-0" style={{ color: 'var(--myna-accent)' }} />}
        </button>
      ))}
    </div>
  );
}

function ConferenceBracket({ conference, conferenceName, bracket, selCode, onTeam, expanded, onToggleSeries }) {
  const conf = (bracket.rounds || []).find(round => round.conference === conference);
  if (!conf) return null;
  const groups = ROUND_ORDER
    .map(name => [name, conf.series.filter(series => series.round === name)])
    .filter(([, list]) => list.length);
  return (
    <section className="myna-panel p-3" aria-label={`${conferenceName} playoff bracket`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="myna-display text-lg">{conferenceName}</h3>
        <span className="myna-mono text-[9px] uppercase tracking-[0.16em] myna-muted">8-team playoff bracket · best of 7</span>
      </header>
      {(conf.playIn || []).length > 0 && (
        <div className="mt-2">
          <div className="rounded-xl border border-dashed p-2.5" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 45%, transparent)', background: 'var(--myna-canvas)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 55%, transparent)', background: 'color-mix(in srgb, var(--myna-accent) 12%, transparent)', color: 'var(--myna-accent)' }}>Play-in</span>
              <p className="text-[10px] myna-muted">Qualification games — winners reach the bracket below. Not playoff series.</p>
            </div>
            <div className="mt-2 space-y-1.5">
              {conf.playIn.map((game, index) => <PlayInGame key={index} game={game} selCode={selCode} onTeam={onTeam} />)}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2" aria-hidden="true">
            <span className="h-px flex-1" style={{ background: 'color-mix(in srgb, var(--myna-accent) 40%, transparent)' }} />
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] myna-muted">Advances to the playoff bracket</span>
            <span className="h-px flex-1" style={{ background: 'color-mix(in srgb, var(--myna-accent) 40%, transparent)' }} />
          </div>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {groups.map(([name, list]) => (
          <div key={name} className="min-w-0">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--myna-accent)' }}>{ROUND_SHORT[name]}</p>
            <div className="space-y-2">
              {list.map((series, index) => {
                const expandKey = `${conference}-${name}-${series.higher}-${series.lower}-${index}`;
                return <SeriesCard key={expandKey} series={series} selCode={selCode} onTeam={onTeam} expanded={expanded.has(expandKey)} onToggle={() => onToggleSeries(expandKey)} expandKey={expandKey} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalsPanel({ bracket, selCode, onTeam, expanded, onToggle }) {
  const finals = bracket.finals;
  const champion = bracket.champion;
  if (!finals) {
    // A bracket whose Finals series detail is missing must not crash the tab.
    return (
      <section className="myna-panel p-4" aria-label="NBA Finals">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--myna-accent)' }}><Trophy className="h-4 w-4" />NBA Finals</p>
        <p className="myna-muted mt-2 text-[11px]">{champion ? `${champion} won the title — this replay carried no game-by-game Finals detail.` : 'The engine report carries no game-by-game Finals detail.'}</p>
      </section>
    );
  }
  return (
    <section className="myna-panel p-4" aria-label="NBA Finals">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--myna-accent)' }}><Trophy className="h-4 w-4" />NBA Finals</p>
        <span className="myna-mono text-[9px] uppercase tracking-[0.16em] myna-muted">East champion vs West champion · best of 7</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[[finals.higher, finals.higherSeed], [finals.lower, finals.lowerSeed]].map(([code, seed]) => {
          const isSel = selCode === code;
          return (
            <button key={code} type="button" onClick={() => onTeam(code)} aria-pressed={isSel}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${isSel ? '' : 'border-[var(--myna-border)] hover:bg-[var(--myna-raised)]'}`}
              style={isSel ? { ...teamThemeVars(code, 'dark'), borderColor: 'var(--team-primary)', background: 'color-mix(in srgb, var(--team-primary) 12%, transparent)' } : undefined}
            >
              <TeamMark code={code} name={code} className="h-12 w-12" />
              <div className="min-w-0">
                <p className="myna-display truncate text-lg">{code}</p>
                <p className="myna-mono text-[10px] myna-muted">#{seed} seed · {finals.winner === code ? `won ${winsFor(finals, code)}–${finals.games.length - winsFor(finals, code)}` : 'fell in the finals'}</p>
              </div>
              {finals.winner === code && <Crown className="ml-auto h-5 w-5 shrink-0" style={{ color: 'var(--myna-accent)' }} />}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className="mt-2 flex w-full items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] myna-muted transition-colors hover:text-[var(--myna-accent)]"
      >
        {expanded ? 'Hide games' : `Finals games (${finals.games.length})`}
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5 border-t border-[var(--myna-border)] pt-2">
          {finals.games.map(game => {
            const homeWon = game.homePts > game.awayPts;
            return (
              <li key={game.game} className="myna-mono flex items-center justify-between gap-2 text-[10px]">
                <span className="myna-muted">G{game.game}</span>
                <span>{game.away} {game.awayPts} @ {game.home} {game.homePts}</span>
                <span className="myna-muted">{homeWon ? game.home : game.away} +{Math.abs(game.homePts - game.awayPts)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {champion && (
        <p className="myna-display mt-3 flex items-center justify-center gap-2 rounded-lg border py-2 text-xl" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 45%, transparent)', background: 'color-mix(in srgb, var(--myna-accent) 10%, transparent)', color: 'var(--myna-accent)' }}>
          <Crown className="h-5 w-5" />{champion} WIN THE TITLE
        </p>
      )}
    </section>
  );
}

function stepDesc(step, sel) {
  if (step.game) {
    const game = step.game;
    const opp = game.home === sel ? game.away : game.home;
    const myPts = game.home === sel ? game.homePts : game.awayPts;
    const oppPts = game.home === sel ? game.awayPts : game.homePts;
    return myPts > oppPts ? `beat ${opp} ${myPts}–${oppPts} · qualified` : `lost to ${opp} ${myPts}–${oppPts} · eliminated`;
  }
  const series = step.series;
  const opp = series.higher === sel ? series.lower : series.higher;
  const myWins = winsFor(series, sel);
  const oppWins = series.games.length - myWins;
  const isFinals = step.label === 'NBA Finals';
  if (series.winner === sel) return `beat ${opp} ${myWins}–${oppWins}${isFinals ? ' · CHAMPION' : ''}`;
  return `fell to ${opp} ${myWins}–${oppWins}`;
}

// Interactive postseason bracket: play-in qualification zone is visually
// separated from the 8-team playoff bracket; clicking a team traces its path
// to the finals (or its elimination point).
export default function PlayoffBracket({ bracket, onFocusChange }) {
  const [sel, setSel] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => {
    setSel(bracket?.champion || null);
    setExpanded(new Set());
  }, [bracket]);

  if (!bracket) {
    return (
      <div className="myna-panel p-6 text-center">
        <p className="myna-muted text-xs">No playoff bracket yet — run a season replay from the replay console (playoffs on) to simulate the postseason.</p>
      </div>
    );
  }

  const onTeam = code => {
    setSel(code);
    onFocusChange?.(code);
  };
  const toggleSeries = key => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const steps = [];
  if (sel) {
    for (const conf of bracket.rounds || []) {
      if (conf.playIn) for (const game of conf.playIn) {
        if (game.home === sel || game.away === sel) steps.push({ label: 'Play-in', game });
      }
      for (const name of ROUND_ORDER) {
        for (const series of conf.series.filter(item => item.round === name)) {
          if (series.higher === sel || series.lower === sel) steps.push({ label: ROUND_SHORT[name], series });
        }
      }
    }
    if (bracket.finals && (bracket.finals.higher === sel || bracket.finals.lower === sel)) {
      steps.push({ label: 'NBA Finals', series: bracket.finals });
    }
  }
  const isChampion = sel && sel === bracket.champion;

  return (
    <section className="space-y-4" aria-label="Playoff bracket">
      <div className="myna-panel overflow-hidden">
        <header className="p-4 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--myna-accent)' }}>Postseason</p>
          <h3 className="myna-display mt-0.5 text-2xl">PLAYOFF BRACKET</h3>
          <p className="mt-1 text-[11px] leading-relaxed myna-muted">
            Click any team to trace its path to the finals. The dashed zone at the top of each conference is the play-in tournament — qualification games that award the last two seeds. The solid bracket beneath it is the playoff proper: eight teams per conference, best-of-7 series.
          </p>
        </header>
        {sel && (
          <div className="border-t border-[var(--myna-border)] p-3">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--myna-accent)' }}>
              <Route className="h-3.5 w-3.5" />Path to the finals — {sel}
              {isChampion && <span className="rounded border px-1.5 py-0.5 text-[9px]" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 55%, transparent)', background: 'color-mix(in srgb, var(--myna-accent) 12%, transparent)' }}>Champion</span>}
            </p>
            <ol className="mt-2 flex flex-wrap items-center gap-1.5">
              {steps.length ? steps.map((step, index) => {
                const won = step.game ? (step.game.winner === sel) : (step.series.winner === sel);
                const last = index === steps.length - 1;
                return (
                  <li key={index} className="myna-mono flex items-center gap-1.5">
                    <span className="rounded-md border px-2 py-1 text-[10px]" style={won
                      ? { borderColor: 'color-mix(in srgb, var(--myna-accent) 45%, transparent)', color: 'var(--myna-accent)' }
                      : { borderColor: 'var(--myna-border)', color: 'var(--myna-muted)' }}
                    >
                      <span className="font-bold uppercase tracking-[0.08em]">{step.label}</span> · {stepDesc(step, sel)}
                    </span>
                    {!last && <span className="myna-muted" aria-hidden="true">→</span>}
                  </li>
                );
              }) : <li className="text-[10px] myna-muted">Did not reach the postseason.</li>}
            </ol>
          </div>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ConferenceBracket conference="EAST" conferenceName="Eastern Conference" bracket={bracket} selCode={sel} onTeam={onTeam} expanded={expanded} onToggleSeries={toggleSeries} />
        <ConferenceBracket conference="WEST" conferenceName="Western Conference" bracket={bracket} selCode={sel} onTeam={onTeam} expanded={expanded} onToggleSeries={toggleSeries} />
      </div>
      <FinalsPanel bracket={bracket} selCode={sel} onTeam={onTeam} expanded={expanded.has('FINALS')} onToggle={() => toggleSeries('FINALS')} />
    </section>
  );
}