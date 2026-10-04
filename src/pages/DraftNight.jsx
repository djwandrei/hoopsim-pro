import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, Sparkles } from 'lucide-react';
import GameShell from '@/components/dailyGames/GameShell';
import LineupSimPanel from '@/components/dailyGames/LineupSimPanel';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import BoardStatusPanel from '@/components/dailyGames/BoardStatusPanel';
import BoardControlStrip from '@/components/dailyGames/BoardControlStrip';
import TapeDuelCard from '@/components/dailyGames/TapeDuelCard';
import CardCycler from '@/components/dailyGames/CardCycler';
import HowToPlay from '@/components/dailyGames/HowToPlay';
import ProgressRail from '@/components/dailyGames/ProgressRail';
import DraftDesk from '@/components/dailyGames/DraftDesk';
import { bestFitFor, deskNeeds, pickedRoster } from '@/components/dailyGames/draftDesk';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import useSeasonSource from '@/hooks/useSeasonSource';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import {
  loadSwishIQDailyBoard,
  revealSwishIQDailyGame,
  swishIQDailyGameErrorKind,
  dailySeedFromPageSearch,
  normalizeGameFamily,
  gamePointsForOutcome,
} from '@/lib/dailyGames/boardSource';
import { hydratePresentationBoard, loadSwishIqPlayerMetadata } from '@/lib/dailyGames/boardHydration';
import '@/components/dailyGames/dailyGames.css';

const STORAGE_KEY = 'swishiq-studio-draft-night';
const STORAGE_VERSION = 1;

// Rendered inside GameShell's CourtThemeProvider, so it can read the team the
// visitor picked in the palette picker and theme the sim court from it — the
// draft roster mixes teams, so no single player's team can own the floor.
function DraftSimPanel(props) {
  const { palette } = useCourtTheme();
  return <LineupSimPanel {...props} courtPalette={palette} scoreboardOverlay />;
}

function emptyStore() {
  return { version: STORAGE_VERSION, runs: {} };
}

function readStore() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored || stored.version !== STORAGE_VERSION || typeof stored !== 'object') return emptyStore();
    return { ...emptyStore(), ...stored, runs: stored.runs && typeof stored.runs === 'object' ? stored.runs : {} };
  } catch {
    return emptyStore();
  }
}

export default function DraftNight() {
  const urlSeed = useMemo(() => dailySeedFromPageSearch(window.location.search), []);
  const urlFamily = useMemo(() => { try { return normalizeGameFamily(new URLSearchParams(window.location.search).get('family')); } catch { return ''; } }, []);
  const [seed, setSeed] = useState(urlSeed);
  const [board, setBoard] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [errorKind, setErrorKind] = useState('');
  const [picks, setPicks] = useState({});
  const [outcome, setOutcome] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const { year, setYear, source, league } = useSeasonSource();

  const persist = useCallback((nextSeed, nextPicks, nextOutcome) => {
    const store = readStore();
    store.runs[nextSeed] = { picks: nextPicks, outcome: nextOutcome };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* visit-only */ }
  }, []);

  const loadBoard = useCallback(async (targetSeed = seed) => {
    setStatus('loading'); setError(null); setErrorKind(''); setNotice('');
    try {
      const loaded = await loadSwishIQDailyBoard({ gameKind: 'draft-night', dailySeed: targetSeed, family: urlFamily });
      setBoard(loaded);
      setStatus('ready');
      const store = readStore().runs[loaded.dailySeed] || {};
      const storedPicks = store.picks && typeof store.picks === 'object' ? store.picks : {};
      setPicks(storedPicks);
      setOutcome(store.outcome || null);
      const firstOpen = loaded.deck.rounds.findIndex(round => !storedPicks[round.roundId]);
      setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.deck.rounds.length);
    } catch (loadError) {
      setBoard(null);
      setError(loadError);
      setErrorKind(swishIQDailyGameErrorKind(loadError));
      setStatus(['board-unavailable', 'board-invalid', 'evaluator-unavailable', 'verification-error'].includes(swishIQDailyGameErrorKind(loadError)) ? swishIQDailyGameErrorKind(loadError) : 'error');
    }
  }, [seed, urlFamily]);

  useEffect(() => { loadBoard(seed); }, [seed, loadBoard]);
  useEffect(() => { loadSwishIqPlayerMetadata().then(setMetadata, () => setMetadata(null)); }, []);
  useEffect(() => {
    const boardYear = board?.packageRef?.scope?.seasonStartYear;
    if (boardYear && String(year) !== String(boardYear)) setYear(boardYear);
  }, [board, year, setYear]);

  const presentation = useMemo(() => (board ? hydratePresentationBoard(board, { playerSeasons: source?.playerSeasons || [], metadata }) : null), [board, source, metadata]);
  const rounds = presentation?.deck?.rounds || [];
  const pickCount = rounds.filter(round => picks[round.roundId]).length;
  const allPicked = rounds.length > 0 && pickCount === rounds.length;
  const orderedPicks = useMemo(() => rounds.map(round => ({ roundId: round.roundId, playerRef: picks[round.roundId] })).filter(pickEntry => pickEntry.playerRef), [rounds, picks]);
  const draftRoster = useMemo(() => pickedRoster(rounds, picks), [rounds, picks]);
  const needs = useMemo(() => deskNeeds(rounds, draftRoster), [rounds, draftRoster]);
  const activeRound = rounds[activeIndex] || null;
  const fit = useMemo(() => (activeRound && !outcome ? bestFitFor(activeRound.candidates, needs, draftRoster) : null), [activeRound, needs, draftRoster, outcome]);
  const jumpToRound = useCallback(round => {
    if (pending || outcome || picks[round.roundId]) return;
    interacted.current = true;
    setActiveIndex(rounds.findIndex(entry => entry.roundId === round.roundId));
  }, [outcome, pending, picks, rounds]);

  const choose = useCallback((round, candidate) => {
    if (pending || outcome || picks[round.roundId]) return;
    interacted.current = true;
    const nextPicks = { ...picks, [round.roundId]: candidate.playerRef };
    setPicks(nextPicks); setNotice('');
    persist(board.dailySeed, nextPicks, null);
    const nextIndex = rounds.findIndex(entry => !nextPicks[entry.roundId]);
    setActiveIndex(nextIndex >= 0 ? nextIndex : rounds.length);
  }, [board, outcome, pending, persist, picks, rounds]);

  const undoRound = useCallback(round => {
    if (outcome) return;
    interacted.current = true;
    const nextPicks = { ...picks };
    delete nextPicks[round.roundId];
    setPicks(nextPicks); setNotice('');
    setActiveIndex(rounds.findIndex(entry => entry.roundId === round.roundId));
    persist(board.dailySeed, nextPicks, null);
  }, [board, outcome, persist, picks, rounds]);

  const reveal = useCallback(async () => {
    if (pending || !allPicked || outcome) return;
    interacted.current = true;
    setPending(true); setNotice('');
    try {
      const result = await revealSwishIQDailyGame({ board, picks: orderedPicks });
      const plain = JSON.parse(JSON.stringify({ format: result.format, contractVersion: result.contractVersion, action: result.action, boardRef: result.boardRef, resultContract: result.resultContract, selection: result.selection, resultPassport: result.resultPassport }));
      setOutcome(plain);
      persist(board.dailySeed, picks, plain);
    } catch (revealError) {
      const kind = swishIQDailyGameErrorKind(revealError);
      setNotice(kind === 'evaluator-unavailable'
        ? 'The exact-season evaluator is unavailable; no Game Points or substitute score was used.'
        : 'This board result is unavailable. No substitute score was used.');
    } finally {
      setPending(false);
    }
  }, [allPicked, board, orderedPicks, outcome, pending, persist, picks]);

  const replay = useCallback(() => {
    if (!board) return;
    setPicks({}); setOutcome(null); setActiveIndex(0); setNotice('');
    persist(board.dailySeed, {}, null);
  }, [board, persist]);

  const simSquads = outcome ? [{
    id: 'draft',
    label: presentation?.deck?.title || 'Your draft five',
    code: 'FIVE',
    players: orderedPicks
      .map(entry => rounds.flatMap(round => round.candidates).find(candidate => candidate.playerRef === entry.playerRef))
      .filter(Boolean),
  }] : [];
  const points = gamePointsForOutcome(outcome);
  const statusState = status === 'error' ? errorKind || 'verification-error' : status;

  // Flow glue: after a pick, undo, jump, or reveal, follow the run to the step
  // the visitor just unlocked — but never steal the scroll on a fresh load.
  const roundRef = useRef(null);
  const lockRef = useRef(null);
  const resultRef = useRef(null);
  const interacted = useRef(false);
  useEffect(() => {
    if (interacted.current && roundRef.current) roundRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeIndex]);
  useEffect(() => {
    if (interacted.current && allPicked && !outcome && lockRef.current) {
      lockRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [allPicked, outcome]);
  useEffect(() => {
    if (interacted.current && outcome && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [outcome]);

  return (
    <GameShell>
      <WorkbenchHeader
        title="DRAFT NIGHT"
        description="Pick one player from each of five different team rounds. This cross-team five-pick board is scored by average estimated additive player impact; it is not observed lineup performance, a same-team lineup, a forecast, or causal chemistry."
        steps={['Five draft rounds', 'Lock the draft', 'Verified summary']}
        current={outcome ? 2 : allPicked ? 1 : 0}
        state={statusState === 'ready' ? 'ready' : statusState === 'loading' ? 'idle' : 'error'}
        status={pending ? 'Evaluating your draft…' : outcome ? 'Draft verified' : statusState === 'ready' ? 'Board verified' : null}
      />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <BoardStatusPanel state={statusState} error={error} onRetry={() => loadBoard(seed)} />
        {statusState === 'ready' && presentation && (
          <>
            <HowToPlay
              defaultOpen={pickCount === 0 && !outcome}
              controls={<BoardControlStrip presentation={presentation} seed={seed} onSeedChange={setSeed} bare />}
              steps={[
                'Draft one player per round — each round belongs to a different team, so pick with role fit in mind.',
                'Compare candidates by their stat tiles: gold tiles (PPG, RPG, APG) carry the most scoring weight, and the per-36 chips show true pace-adjusted output.',
                'Lock all five rounds blind — scores stay hidden and nothing is evaluated until the draft is locked.',
                'Reveal once to score the draft against the verified evaluator. A perfect round earns 10 Game Points; exact estimates score in tiers.',
              ]}
              note="Your picks save in this browser — refresh anytime and the draft picks up where you left off."
            />
            <div className="dg-board-hero">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="bcast-kicker">Tonight's board</span>
                <span className="dg-badge">Rounds locked {pickCount}/5</span>
              </div>
              <h2 className="dg-board-hero__title font-display tracking-wide">{presentation.deck.title}</h2>
              <p className="dg-board-hero__prompt text-muted-foreground">{presentation.deck.prompt}</p>
              <div className="dg-complete__meter mt-3" aria-label={`${pickCount} of 5 rounds locked`}><span style={{ width: `${Math.round((pickCount / Math.max(rounds.length, 1)) * 100)}%` }} /></div>
            </div>
            <ProgressRail steps={rounds.map(round => round.roundId)} current={Math.min(activeIndex, Math.max(rounds.length - 1, 0))} completed={picks} labelFor={(key) => rounds.find(round => round.roundId === key)?.title || key} />
            {!outcome && (
              <DraftDesk rounds={rounds} picks={picks} roster={draftRoster} needs={needs} fit={fit} activeRound={activeRound} onSelectRound={jumpToRound} complete={allPicked} />
            )}
            {outcome && <div ref={resultRef} className="dg-reveal"><GamePointsBoard outcome={outcome} contextTitle={`${presentation.deck.title} · five-pick draft`} /></div>}
            {outcome && simSquads.length > 0 && <DraftSimPanel league={league} squads={simSquads} lineupLabel="Your draft five" />}
            {!outcome && allPicked && (
              <section ref={lockRef} className="dg-lock dg-flow-in" aria-label="Lock the draft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="bcast-kicker">Draft locked</span>
                    <h3 className="mt-2 flex items-center gap-2 font-display text-2xl tracking-wide"><Lock className="h-5 w-5 text-gold" />Five picks, one reveal</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Evaluate the whole five-pick draft once. No partial reveals, no substitute score.</p>
                  </div>
                  <button type="button" onClick={reveal} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-[0_8px_24px_hsl(43_78%_60%/.35)] hover:brightness-110 disabled:opacity-50">
                    <Sparkles className="h-4 w-4" /> {pending ? 'Evaluating…' : 'Lock in the draft & evaluate'}
                  </button>
                </div>
                <ul className="dg-lock__list mt-4">
                  {rounds.map(round => {
                    const candidate = round.candidates.find(entry => entry.playerRef === picks[round.roundId]);
                    return (
                      <li key={round.roundId} className="dg-lock__pick">
                        <span className="min-w-0">
                          <span className="dg-lock__team">R{round.roundNumber} · {round.teamCode}</span>
                          <span className="dg-lock__player block truncate">{candidate?.displayName}</span>
                        </span>
                        <button type="button" onClick={() => undoRound(round)} className="dg-lock__undo">Undo</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {rounds.map((round, index) => {
              if (outcome || index !== activeIndex || picks[round.roundId]) return null;
              return (
                <section ref={roundRef} key={round.roundId} className="dg-round dg-flow-in" aria-label={round.title}>
                  <div className="dg-round__title">
                    <h3 className="font-display text-xl tracking-wide">Round {round.roundNumber} · {round.teamCode}</h3>
                    <span className="dg-round__counter">Pick {pickCount}/5</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{round.prompt}</p>
                  <CardCycler
                    className="mt-4"
                    items={round.candidates}
                    renderItem={candidate => (
                      <TapeDuelCard
                        key={candidate.playerRef}
                        player={candidate}
                        selected={picks[round.roundId] === candidate.playerRef}
                        disabled={pending || Boolean(outcome)}
                        ctaLabel="Draft him"
                        fitNote={fit?.candidate?.playerRef === candidate.playerRef ? fit.reasons.join(' · ') : null}
                        onSelect={() => choose(round, candidate)}
                      />
                    )}
                  />
                </section>
              );
            })}
            {outcome && (
              <CompletionPanel
                total={points.total}
                max={points.max}
                seed={presentation.dailySeed}
                entries={[{ key: 'draft', title: 'Five-pick draft', points: points.total, maxPoints: points.max }]}
                otherGamePath="/fix-the-five"
                otherGameTitle="Fix the Five"
                onReplay={replay}
              />
            )}
            {notice && <p className="dg-notice" role="alert"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-trim-ink" />{notice}</p>}
          </>
        )}
      </main>
    </GameShell>
  );
}