import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import BoardStatusPanel from '@/components/dailyGames/BoardStatusPanel';
import CandidateCard from '@/components/dailyGames/CandidateCard';
import ProgressRail from '@/components/dailyGames/ProgressRail';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import useSeasonSource from '@/hooks/useSeasonSource';
import {
  loadSwishIQDailyBoard,
  revealSwishIQDailyGame,
  swishIQDailyGameErrorKind,
  dailySeedFromPageSearch,
  normalizeGameFamily,
  gamePointsForOutcome,
} from '@/lib/dailyGames/boardSource';
import { hydratePresentationBoard, loadSwishIqPlayerMetadata } from '@/lib/dailyGames/boardHydration';

const STORAGE_KEY = 'swishiq-studio-draft-night';
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
  const { year, setYear, source } = useSeasonSource();

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

  const choose = useCallback((round, candidate) => {
    if (pending || outcome || picks[round.roundId]) return;
    const nextPicks = { ...picks, [round.roundId]: candidate.playerRef };
    setPicks(nextPicks); setNotice('');
    persist(board.dailySeed, nextPicks, null);
    const nextIndex = rounds.findIndex(entry => !nextPicks[entry.roundId]);
    setActiveIndex(nextIndex >= 0 ? nextIndex : rounds.length);
  }, [board, outcome, pending, persist, picks, rounds]);

  const undoRound = useCallback(round => {
    if (outcome) return;
    const nextPicks = { ...picks };
    delete nextPicks[round.roundId];
    setPicks(nextPicks); setNotice('');
    setActiveIndex(rounds.findIndex(entry => entry.roundId === round.roundId));
    persist(board.dailySeed, nextPicks, null);
  }, [board, outcome, persist, picks, rounds]);

  const reveal = useCallback(async () => {
    if (pending || !allPicked || outcome) return;
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

  const points = gamePointsForOutcome(outcome);
  const statusState = status === 'error' ? errorKind || 'verification-error' : status;

  return (
    <StudioShell active="/draft-night">
      <WorkbenchHeader
        title="DRAFT NIGHT"
        description="Pick one player from each of five different team rounds. This cross-team five-pick board is scored by average estimated additive player impact; it is not observed lineup performance, a same-team lineup, a forecast, or causal chemistry."
        steps={['Five draft rounds', 'Lock the draft', 'Verified summary']}
        current={outcome ? 2 : allPicked ? 1 : 0}
        state={statusState === 'ready' ? 'ready' : statusState === 'loading' ? 'idle' : 'error'}
        status={pending ? 'Evaluating your draft…' : outcome ? 'Draft verified' : statusState === 'ready' ? 'Board verified' : null}
      />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <BoardStatusPanel state={statusState} error={error} onRetry={() => loadBoard(seed)} />
        {statusState === 'ready' && presentation && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-gold">Board {presentation.dailySeed}</span>
              <span className="rounded-full border border-border/40 px-3 py-1">{presentation.packageRef.scope.seasonStartYear}-{String(presentation.packageRef.scope.seasonEndYear).slice(2)} · {presentation.packageRef.phase.replaceAll('_', ' ')}</span>
              <span className="rounded-full border border-border/40 px-3 py-1">{presentation.packageRef.packageVersion}</span>
              <label className="ml-auto inline-flex items-center gap-2">Board date
                <input type="date" value={seed} onChange={event => { const value = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { setSeed(value); } }} className="studio-select w-40" />
              </label>
            </div>
            <div className="court-panel p-5">
              <h2 className="font-display text-2xl tracking-wide">{presentation.deck.title}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{presentation.deck.prompt}</p>
            </div>
            <ProgressRail steps={rounds.map(round => round.roundId)} current={Math.min(activeIndex, Math.max(rounds.length - 1, 0))} completed={picks} labelFor={(key) => rounds.find(round => round.roundId === key)?.title || key} />
            {outcome && <GamePointsBoard outcome={outcome} contextTitle={`${presentation.deck.title} · five-pick draft`} />}
            {!outcome && allPicked && (
              <section className="court-panel border-gold/50 p-5" aria-label="Lock the draft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="bcast-kicker">Draft locked</span>
                    <h3 className="mt-2 flex items-center gap-2 font-display text-2xl tracking-wide"><Lock className="h-5 w-5 text-gold" />Five picks, one reveal</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Evaluate the whole five-pick draft once. No partial reveals, no substitute score.</p>
                  </div>
                  <button type="button" onClick={reveal} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-canvas disabled:opacity-50">
                    <Sparkles className="h-4 w-4" /> {pending ? 'Evaluating…' : 'Lock in the draft & evaluate'}
                  </button>
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {rounds.map(round => {
                    const candidate = round.candidates.find(entry => entry.playerRef === picks[round.roundId]);
                    return (
                      <li key={round.roundId} className="flex items-center justify-between gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs">
                        <span className="truncate">{round.teamCode}: <span className="font-display tracking-wide">{candidate?.displayName}</span></span>
                        <button type="button" onClick={() => undoRound(round)} className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">Undo</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {rounds.map((round, index) => {
              if (outcome || index !== activeIndex || picks[round.roundId]) return null;
              return (
                <section key={round.roundId} className="court-panel p-5" aria-label={round.title}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-xl tracking-wide">Round {round.roundNumber} · {round.teamCode}</h3>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Pick {pickCount}/5</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{round.prompt}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {round.candidates.map(candidate => (
                      <CandidateCard
                        key={candidate.playerRef}
                        player={candidate}
                        outgoing={null}
                        compact
                        ctaLabel="Draft him"
                        onSelect={() => choose(round, candidate)}
                      />
                    ))}
                  </div>
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
            {notice && <p className="rounded-lg border border-trim/40 bg-trim/10 px-4 py-3 text-xs text-foreground" role="alert">{notice}</p>}
          </>
        )}
      </main>
    </StudioShell>
  );
}