import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import BoardStatusPanel from '@/components/dailyGames/BoardStatusPanel';
import BoardControlStrip from '@/components/dailyGames/BoardControlStrip';
import CandidateCard from '@/components/dailyGames/CandidateCard';
import LineupCourt from '@/components/dailyGames/LineupCourt';
import ProgressRail from '@/components/dailyGames/ProgressRail';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import useSeasonSource from '@/hooks/useSeasonSource';
import {
  loadSwishIQDailyBoard,
  revealSwishIQDailyGame,
  swishIQDailyGameErrorKind,
  chicagoDailySeed,
  dailySeedFromPageSearch,
  normalizeGameFamily,
  gamePointsForOutcome,
} from '@/lib/dailyGames/boardSource';
import { hydratePresentationBoard, loadSwishIqPlayerMetadata } from '@/lib/dailyGames/boardHydration';
import '@/components/dailyGames/dailyGames.css';

const STORAGE_KEY = 'swishiq-studio-fix-the-five';
const STORAGE_VERSION = 1;

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

export default function FixTheFive() {
  const urlSeed = useMemo(() => dailySeedFromPageSearch(window.location.search), []);
  const urlFamily = useMemo(() => { try { return normalizeGameFamily(new URLSearchParams(window.location.search).get('family')); } catch { return ''; } }, []);
  const [seed, setSeed] = useState(urlSeed);
  const [board, setBoard] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [errorKind, setErrorKind] = useState('');
  const [selections, setSelections] = useState({});
  const [outcomes, setOutcomes] = useState({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const { year, setYear, source } = useSeasonSource();

  const persist = useCallback((nextSeed, nextSelections, nextOutcomes) => {
    const store = readStore();
    store.runs[nextSeed] = { selections: nextSelections, outcomes: nextOutcomes };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* visit-only */ }
  }, []);

  const loadBoard = useCallback(async (targetSeed = seed) => {
    setStatus('loading'); setError(null); setErrorKind(''); setNotice('');
    try {
      const loaded = await loadSwishIQDailyBoard({ gameKind: 'fix-the-five', dailySeed: targetSeed, family: urlFamily });
      setBoard(loaded);
      setStatus('ready');
      const store = readStore().runs[loaded.dailySeed] || {};
      setSelections(store.selections && typeof store.selections === 'object' ? store.selections : {});
      setOutcomes(store.outcomes && typeof store.outcomes === 'object' ? store.outcomes : {});
      setActiveIndex(0);
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
  const challenges = presentation?.challenges || [];
  const completedCount = challenges.filter(challenge => outcomes[challenge.challengeId]).length;

  const pick = useCallback(async (challenge, candidate) => {
    const key = challenge.challengeId;
    if (pending || outcomes[key]) return false;
    setPending(true); setNotice('');
    try {
      const outcome = await revealSwishIQDailyGame({ board, challengeId: key, playerRef: candidate.playerRef });
      const plain = JSON.parse(JSON.stringify({ format: outcome.format, contractVersion: outcome.contractVersion, action: outcome.action, boardRef: outcome.boardRef, resultContract: outcome.resultContract, selection: outcome.selection, resultPassport: outcome.resultPassport }));
      const nextSelections = { ...selections, [key]: candidate.playerRef };
      const nextOutcomes = { ...outcomes, [key]: plain };
      setSelections(nextSelections); setOutcomes(nextOutcomes);
      persist(board.dailySeed, nextSelections, nextOutcomes);
      const nextIndex = challenges.findIndex(item => !nextOutcomes[item.challengeId]);
      setActiveIndex(nextIndex >= 0 ? nextIndex : challenges.length);
      return true;
    } catch (revealError) {
      const kind = swishIQDailyGameErrorKind(revealError);
      if (kind === 'evaluator-unavailable') {
        setNotice('The exact-season evaluator is unavailable; no Game Points or substitute score was used.');
      } else {
        setNotice('This board result is unavailable. No substitute score was used.');
      }
      return false;
    } finally {
      setPending(false);
    }
  }, [board, challenges, outcomes, pending, persist, selections]);

  const undo = useCallback(challenge => {
    const key = challenge.challengeId;
    const nextSelections = { ...selections };
    const nextOutcomes = { ...outcomes };
    delete nextSelections[key]; delete nextOutcomes[key];
    setSelections(nextSelections); setOutcomes(nextOutcomes); setNotice('');
    setActiveIndex(challenges.findIndex(item => item.challengeId === key));
    persist(board.dailySeed, nextSelections, nextOutcomes);
  }, [board, challenges, outcomes, persist, selections]);

  const replay = useCallback(() => {
    if (!board) return;
    setSelections({}); setOutcomes({}); setActiveIndex(0); setNotice('');
    persist(board.dailySeed, {}, {});
  }, [board, persist]);

  const total = Object.values(outcomes).reduce((sum, outcome) => sum + gamePointsForOutcome(outcome).total, 0);
  const maxTotal = challenges.length * 10;
  const activeChallenge = challenges[activeIndex];
  const current = board ? Math.min(completedCount, 2) : 0;
  const statusState = status === 'error' ? errorKind || 'verification-error' : status;

  return (
    <StudioShell active="/fix-the-five">
      <WorkbenchHeader
        title="FIX THE FIVE"
        description="Compare each legal swap with the starting five by summed estimated additive player impact. This is a model estimate, not observed five-player performance or causal chemistry."
        steps={['Board & context', 'Five repair calls', 'Verified summary']}
        current={current}
        state={statusState === 'ready' ? 'ready' : statusState === 'loading' ? 'idle' : 'error'}
        status={pending ? 'Checking your swap…' : completedCount === 5 ? 'Run complete' : statusState === 'ready' ? 'Board verified' : null}
      />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <BoardStatusPanel state={statusState} error={error} onRetry={() => loadBoard(seed)} />
        {statusState === 'ready' && presentation && (
          <>
            <BoardControlStrip presentation={presentation} seed={seed} onSeedChange={setSeed} />
            <ProgressRail
              steps={challenges.map(challenge => challenge.challengeId)}
              current={Math.min(activeIndex, challenges.length - 1)}
              completed={outcomes}
              labelFor={(key) => challenges.find(challenge => challenge.challengeId === key)?.title || key}
              pointsFor={(key) => gamePointsForOutcome(outcomes[key])?.total ?? null}
            />
            {completedCount === 5 && (
              <CompletionPanel
                total={total}
                max={maxTotal}
                seed={presentation.dailySeed}
                entries={challenges.map(challenge => {
                  const points = gamePointsForOutcome(outcomes[challenge.challengeId]);
                  return { key: challenge.challengeId, title: challenge.title, points: points.total, maxPoints: points.max };
                })}
                otherGamePath="/draft-night"
                otherGameTitle="Draft Night"
                onReplay={replay}
              />
            )}
            {activeChallenge && (
              <section className="space-y-4" aria-label={activeChallenge.title}>
                <div className="court-panel p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-2xl tracking-wide">{activeChallenge.title}</h2>
                    <span className="dg-challenge__chip">
                      Outgoing: {activeChallenge.lineup.find(player => player.playerRef === activeChallenge.removePlayerRef)?.displayName}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{activeChallenge.prompt}</p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
                    <LineupCourt lineup={activeChallenge.lineup} removedPlayerRef={activeChallenge.removePlayerRef} incomingPlayer={activeChallenge.candidates.find(candidate => candidate.playerRef === selections[activeChallenge.challengeId])} />
                    <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {activeChallenge.candidates.map(candidate => (
                        <CandidateCard
                          key={candidate.playerRef}
                          player={candidate}
                          outgoing={activeChallenge.lineup.find(player => player.playerRef === activeChallenge.removePlayerRef)}
                          selected={selections[activeChallenge.challengeId] === candidate.playerRef}
                          revealed={Boolean(outcomes[activeChallenge.challengeId])}
                          disabled={pending || Boolean(outcomes[activeChallenge.challengeId])}
                          ctaLabel="Swap in"
                          onSelect={() => pick(activeChallenge, candidate)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                {outcomes[activeChallenge.challengeId] && <GamePointsBoard outcome={outcomes[activeChallenge.challengeId]} contextTitle={`${activeChallenge.title} · ${activeChallenge.teamCode}`} />}
                {notice && <p className="dg-notice" role="alert"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-trim" />{notice}</p>}
                {!outcomes[activeChallenge.challengeId] && selections[activeChallenge.challengeId] && (
                  <button type="button" onClick={() => undo(activeChallenge)} className="dg-undo"><RefreshCcw className="h-3.5 w-3.5" /> Undo this swap</button>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </StudioShell>
  );
}