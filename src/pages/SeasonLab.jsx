import React, { useEffect, useMemo, useRef, useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import StudioHero from '@/components/season/StudioHero';
import SetupPanel from '@/components/season/SetupPanel';
import DashboardTab from '@/components/season/DashboardTab';
import GameTape from '@/components/season/GameTape';
import ChallengePanel from '@/components/season/ChallengePanel';
import HistoryPanel from '@/components/season/HistoryPanel';
import { loadSeasonSource, AVAILABLE_YEARS } from '@/lib/season/dataClient';
import {
  buildLeague, runRepeat, aggregateRepeats, summarizeAggregate,
  actualStandings, buildGeneratedSchedule, nextLeague,
} from '@/lib/season/simEngine';

const LEAGUE_STORE = 'djhc:swishiq:season-league:v1:base44';
const CHALLENGE_STORE = 'djhc:swishiq:season-challenge:v1:base44';
const BLEND_WEIGHTS = { '0.5': 0.9, '0.65': 1.15, '0.35': 0.65 };
const BLEND_LABELS = { '0.5': 'balanced 50/50', '0.65': 'own offense 65%', '0.35': 'opponent defense 35%' };

const TABS = [
  ['dashboard', 'DASHBOARD'],
  ['tape', 'GAME TAPE'],
  ['challenge', 'REPLAY CHALLENGE'],
  ['history', 'SEASON HISTORY'],
];

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export default function SeasonLab() {
  const [year, setYear] = useState(2025);
  const [source, setSource] = useState(null);
  const [sourceState, setSourceState] = useState('idle');
  const [sourceError, setSourceError] = useState('');
  const [league, setLeague] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [setup, setSetup] = useState({ repeats: 25, playoffs: true, blend: '0.5' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agg, setAgg] = useState(null);
  const aggRef = useRef(null);
  const [lastRepeat, setLastRepeat] = useState(null);
  const [focus, setFocus] = useState('BOS');
  const [tab, setTab] = useState('dashboard');
  const [history, setHistory] = useState(() => readStore(LEAGUE_STORE, []));
  const [challenge, setChallenge] = useState(() => readStore(CHALLENGE_STORE, { attempts: 0, correct: 0, streak: 0, prediction: 'more' }));
  const [challengeMsg, setChallengeMsg] = useState('');
  const [historyNote, setHistoryNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSourceState('loading');
    setSourceError('');
    (async () => {
      try {
        const data = await loadSeasonSource(year);
        if (cancelled) return;
        const built = buildLeague(data);
        setSource(data);
        setLeague(built);
        setSchedule(data.schedule || []);
        aggRef.current = null;
        setAgg(null);
        setLastRepeat(null);
        setTab('dashboard');
        setFocus(current => (built.byCode.has(current) ? current : built.teams[0]?.code || 'BOS'));
        setSourceState('ready');
      } catch (error) {
        if (cancelled) return;
        setSourceError(error?.response?.data?.error || error?.message || 'The season source could not be loaded.');
        setSourceState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [year]);

  const actualMap = useMemo(() => {
    if (!source || league?.generated) return new Map();
    return actualStandings(source);
  }, [source, league]);

  const summary = useMemo(() => (agg ? summarizeAggregate(agg).sort((a, b) => b.wins - a.wins) : []), [agg]);

  const saveEntry = (entry) => {
    setHistory(prev => {
      const next = [...prev, entry].slice(-20);
      try { localStorage.setItem(LEAGUE_STORE, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const runRepeats = async ({ count, lg = league, sc = schedule, pending = null, autoSave = false } = {}) => {
    if (!lg || running) return;
    setRunning(true);
    setProgress(0);
    const weight = BLEND_WEIGHTS[setup.blend] ?? 0.8;
    let accum = aggRef.current;
    let rep = null;
    for (let i = 0; i < count; i += 1) {
      rep = runRepeat(lg, sc, {
        seed: Math.floor(Math.random() * 4294967296),
        playoffs: setup.playoffs,
        defenseWeight: weight,
      });
      accum = aggregateRepeats(accum, rep);
      setProgress((i + 1) / count);
      // Yield to keep the interface responsive during long runs.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    aggRef.current = accum;
    setAgg(accum);
    setLastRepeat(rep);
    setRunning(false);
    if (pending && rep) {
      const row = rep.standings.find(item => item.code === pending.code);
      const direction = row.wins > pending.baselineWins ? 'more' : row.wins < pending.baselineWins ? 'fewer' : 'same';
      const won = direction === pending.prediction;
      setChallenge(prev => {
        const next = {
          ...prev,
          attempts: prev.attempts + 1,
          correct: prev.correct + (won ? 1 : 0),
          streak: won ? prev.streak + 1 : 0,
          prediction: pending.prediction,
        };
        try { localStorage.setItem(CHALLENGE_STORE, JSON.stringify(next)); } catch { /* storage unavailable */ }
        return next;
      });
      setChallengeMsg(`${pending.teamName}: ${pending.baselineWins} → ${row.wins} wins. ${won ? 'Prediction correct.' : `Missed — the result was ${direction} wins.`}`);
    }
    if (autoSave && rep) {
      const sorted = summarizeAggregate(accum).sort((a, b) => b.wins - a.wins);
      saveEntry({
        year: lg.seasonStartYear,
        label: lg.label,
        repeats: accum.repeats,
        champion: rep.bracket?.champion || null,
        leader: sorted[0] ? { code: sorted[0].code, wins: sorted[0].wins } : null,
      });
      setHistoryNote(`${lg.label} completed and saved · ${accum.repeats} replays${rep.bracket ? ` · champion ${rep.bracket.champion}` : ''}.`);
    }
  };

  const saveCurrentRun = () => {
    if (!aggRef.current || !lastRepeat || running) return;
    const sorted = summarizeAggregate(aggRef.current).sort((a, b) => b.wins - a.wins);
    saveEntry({
      year: league.seasonStartYear,
      label: league.label,
      repeats: aggRef.current.repeats,
      champion: lastRepeat.bracket?.champion || null,
      leader: sorted[0] ? { code: sorted[0].code, wins: sorted[0].wins } : null,
    });
    setHistoryNote(`${league.label} saved · ${aggRef.current.repeats} replays${lastRepeat.bracket ? ` · champion ${lastRepeat.bracket.champion}` : ''}.`);
  };

  const handlePlay = async (code, prediction) => {
    if (!lastRepeat || running) return;
    const baseline = lastRepeat.standings.find(item => item.code === code);
    if (!baseline) return;
    await runRepeats({ count: 1, pending: { code, baselineWins: baseline.wins, prediction, teamName: baseline.name } });
  };

  const resetChallenge = () => {
    const next = { attempts: 0, correct: 0, streak: 0, prediction: challenge.prediction };
    setChallenge(next);
    setChallengeMsg('Challenge record reset.');
    try { localStorage.setItem(CHALLENGE_STORE, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const advanceSeason = async () => {
    if (!league || running) return;
    const nextYear = (league.seasonStartYear || year) + 1;
    const nextLg = nextLeague(league, nextYear);
    const generated = buildGeneratedSchedule(nextLg.teams, Math.floor(Math.random() * 4294967296));
    setLeague(nextLg);
    setSchedule(generated);
    aggRef.current = null;
    setAgg(null);
    setLastRepeat(null);
    setHistoryNote(`Season ${nextLg.label} uses a generated round-robin schedule; team rates stay pinned to the ${league.label} package.`);
    await runRepeats({ count: setup.repeats, lg: nextLg, sc: generated, autoSave: true });
  };

  const tabsReady = { dashboard: Boolean(summary.length), tape: Boolean(lastRepeat), challenge: Boolean(lastRepeat), history: true };

  return (
    <StudioShell active="/season">
      <StudioHero league={league} source={source} sourceState={sourceState} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <SetupPanel
          years={AVAILABLE_YEARS}
          year={year}
          onYearChange={setYear}
          sourceState={sourceState}
          sourceError={sourceError}
          league={league}
          setup={setup}
          onSetupChange={setSetup}
          onRun={() => runRepeats({ count: setup.repeats })}
          running={running}
          progress={progress}
          hasResults={Boolean(lastRepeat)}
        />

        {league && (
          <>
            <nav className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card/95 p-1 backdrop-blur">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  disabled={!tabsReady[key]}
                  className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 font-display text-sm tracking-widest transition-colors ${
                    tab === key ? 'bg-royal text-white' : 'text-muted-foreground hover:bg-raised disabled:opacity-40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === 'dashboard' && (
              summary.length
                ? <DashboardTab summary={summary} league={league} focus={focus} onFocus={setFocus} actualMap={actualMap} repeats={agg.repeats} />
                : <p className="rounded-xl border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">No results yet — build your replay above and run the season lab.</p>
            )}
            {tab === 'tape' && <GameTape games={lastRepeat?.games || []} focusCode={focus} league={league} />}
            {tab === 'challenge' && (
              <ChallengePanel
                summary={summary}
                focusCode={focus}
                onFocusChange={setFocus}
                record={challenge}
                message={challengeMsg}
                blendLabel={BLEND_LABELS[setup.blend]}
                onPlay={handlePlay}
                onReset={resetChallenge}
                running={running}
              />
            )}
            {tab === 'history' && (
              <HistoryPanel
                seasons={history}
                canSave={Boolean(lastRepeat)}
                onSave={saveCurrentRun}
                onAdvance={advanceSeason}
                onClear={() => { setHistory([]); try { localStorage.removeItem(LEAGUE_STORE); } catch { /* storage unavailable */ } setHistoryNote('Saved season history cleared.'); }}
                running={running}
                note={historyNote}
              />
            )}
          </>
        )}
      </main>
    </StudioShell>
  );
}