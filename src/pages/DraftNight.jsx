import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
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
import DraftDesk from '@/components/dailyGames/DraftDesk.jsx';
import { bestFitFor, deskNeeds, pickedRoster } from '@/components/dailyGames/draftDesk.js';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import useDailyGameBoard from '@/hooks/useDailyGameBoard';
import { revealSwishIQDailyGame, revealNoticeFor, gamePointsForOutcome } from '@/lib/dailyGames/boardSource';
import { createRunStore } from '@/lib/dailyGames/runStorage';
import { encodeSharedRun, decodeSharedRun } from '@/lib/dailyGames/resultShare';
import '@/components/dailyGames/dailyGames.css';

const RUN_STORE = createRunStore('swishiq-studio-draft-night');

function sameBoardRevision(left, right) {
  return Boolean(left?.boardSha256 && right?.boardSha256
    && left.boardSha256 === right.boardSha256
    && left.boardContentSha256 === right.boardContentSha256
    && left.gameKind === right.gameKind
    && left.dailySeed === right.dailySeed);
}

function outcomeMatchesRevision(outcome, boardRef) {
  return sameBoardRevision(outcome?.boardRef, boardRef);
}

function restorePicks(board, value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const restored = {};
  let invalid = false;
  const rounds = board.deck?.rounds || [];
  const roundIds = new Set(rounds.map(round => round.roundId));
  for (const [roundId, playerRef] of Object.entries(source)) {
    const round = rounds.find(entry => entry.roundId === roundId);
    if (!round || typeof playerRef !== 'string'
      || !round.candidates.some(candidate => candidate.playerRef === playerRef)) {
      invalid = true;
      continue;
    }
    restored[roundId] = playerRef;
  }
  if (Object.keys(source).some(roundId => !roundIds.has(roundId))) invalid = true;
  return { restored, invalid };
}

const hasSavedOutcome = value => Boolean(value && typeof value === 'object');

// Rendered inside GameShell's CourtThemeProvider, so it can read the team the
// visitor picked in the palette picker and theme the sim court from it — the
// draft roster mixes teams, so no single player's team can own the floor.
function DraftSimPanel(props) {
  const { palette } = useCourtTheme();
  return <LineupSimPanel {...props} courtPalette={palette} scoreboardOverlay />;
}

export default function DraftNight() {
  usePageMeta({ title: 'Draft Night — SwishIQ Studio', description: 'Build a five-player roster from the night’s board, lock it in, and see the verified simulation.' });
  const [picks, setPicks] = useState({});
  const [outcome, setOutcome] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState(false);
  // Flow glue: after a pick, undo, jump, or reveal, follow the run to the step
  // the visitor just unlocked — but never steal the scroll on a fresh load.
  const roundRef = useRef(null);
  const lockRef = useRef(null);
  const resultRef = useRef(null);
  const interacted = useRef(false);
  // A ?result= link replays a friend's locked picks and re-verifies them —
  // only consumed when its board seed matches the loaded board.
  const [sharedRun] = useState(() => decodeSharedRun(window.location.search));
  const sharedRunRef = useRef(sharedRun && sharedRun.gameKind === 'draft-night' ? sharedRun : null);
  const autoRevealRef = useRef(false);
  const getSavedBoardRef = useCallback((targetSeed) => {
    if (sharedRun?.seed === targetSeed) return null;
    return RUN_STORE.read(targetSeed).boardRef || null;
  }, [sharedRun]);
  const {
    seed, setSeed, board, presentation, status, error, notice, setNotice, loadBoard, startNewRunOnCurrentRevision, league,
  } = useDailyGameBoard({
    gameKind: 'draft-night',
    getSavedBoardRef,
    onBoardReady: (loaded, { resetRun = false } = {}) => {
      const shared = sharedRunRef.current;
      if (shared) {
        if (shared.seed !== loaded.dailySeed) { setSeed(shared.seed); return; }
        sharedRunRef.current = null;
        const sharedPicks = shared.picks && typeof shared.picks === 'object' ? shared.picks : {};
        setPicks(sharedPicks);
        setOutcome(null);
        autoRevealRef.current = true;
        setNotice('Viewing a shared run — the locked picks replay and re-verify against the evaluator.');
        const firstOpen = loaded.deck.rounds.findIndex(round => !sharedPicks[round.roundId]);
        setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.deck.rounds.length);
        return;
      }
      const boardRef = loaded.boardRef || null;
      if (resetRun) {
        RUN_STORE.write(loaded.dailySeed, { picks: {}, outcome: null, ...(boardRef ? { boardRef } : {}) });
        setPicks({}); setOutcome(null); setActiveIndex(0); setNotice('Started a fresh run on the current published board revision.');
        return;
      }
      const store = RUN_STORE.read(loaded.dailySeed, boardRef?.boardSha256);
      const hasRevision = Boolean(store.boardRef?.boardSha256);
      const revisionMismatch = Boolean(boardRef && hasRevision && !sameBoardRevision(store.boardRef, boardRef));
      const { restored: storedPicks, invalid: invalidPicks } = restorePicks(loaded, store.picks);
      const unpinnedOutcome = Boolean(boardRef && !hasRevision && hasSavedOutcome(store.outcome));
      const mismatchedOutcome = Boolean(boardRef && hasSavedOutcome(store.outcome) && !outcomeMatchesRevision(store.outcome, boardRef));
      const stale = revisionMismatch || invalidPicks || unpinnedOutcome || mismatchedOutcome;
      const restoredPicks = revisionMismatch ? {} : storedPicks;
      const restoredOutcome = stale ? null : store.outcome || null;
      setPicks(restoredPicks);
      setOutcome(restoredOutcome);
      if (boardRef && !revisionMismatch && (!hasRevision || invalidPicks || mismatchedOutcome)) {
        RUN_STORE.write(loaded.dailySeed, {
          picks: restoredPicks,
          outcome: restoredOutcome,
          ...((unpinnedOutcome || mismatchedOutcome) ? { staleOutcome: store.outcome } : {}),
          boardRef,
        });
      }
      if (revisionMismatch) setNotice('This saved run belongs to a different board revision. Its picks and result were not restored. Start a fresh run on the current revision to continue.');
      else if (unpinnedOutcome) setNotice('A saved result has no pinned board revision, so it was marked stale. Saved legal picks were restored; lock in the draft again to verify them on this board.');
      else if (mismatchedOutcome) setNotice('A saved result belongs to a different board revision, so it was marked stale. Saved legal picks were restored; lock in the draft again to verify them on this board.');
      else if (invalidPicks) setNotice('Some saved picks are not legal on this board and were cleared. Review the remaining picks before revealing.');
      const firstOpen = loaded.deck.rounds.findIndex(round => !restoredPicks[round.roundId]);
      setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.deck.rounds.length);
    },
  });

  const persist = useCallback((nextSeed, nextPicks, nextOutcome) => {
    RUN_STORE.write(nextSeed, { picks: nextPicks, outcome: nextOutcome, ...(board?.boardRef ? { boardRef: board.boardRef } : {}) });
  }, [board]);

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
    if (outcome || pending) return;
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
      setOutcome(result);
      persist(board.dailySeed, picks, result);
    } catch (revealError) {
      setNotice(revealNoticeFor(revealError));
    } finally {
      setPending(false);
    }
  }, [allPicked, board, orderedPicks, outcome, pending, persist, picks]);

  const replay = useCallback(() => {
    if (!board) return;
    setPicks({}); setOutcome(null); setActiveIndex(0); setNotice('');
    persist(board.dailySeed, {}, null);
  }, [board, persist]);

  // The picked roster already resolves every pick to its candidate in round
  // order, so the sim squad reuses it instead of re-searching the rounds.
  const simSquads = useMemo(() => (outcome ? [{
    id: 'draft',
    label: presentation?.deck?.title || 'Your draft five',
    code: 'FIVE',
    players: draftRoster,
  }] : []), [outcome, presentation, draftRoster]);
  const points = gamePointsForOutcome(outcome);
  const productionBoard = board?.scoringContract === 'observed-box-score-production-v1';
  const sourceImpactBoard = board?.scoringContract === 'swishiq-impact-combined-source-ranking-v1';
  const bestSelectionLabel = useMemo(() => {
    const bestSelection = outcome?.evaluation?.bestSelection;
    if (!Array.isArray(bestSelection)) return undefined;
    return rounds.map((round, index) => {
      const candidate = round.candidates.find(entry => entry.playerRef === bestSelection[index]);
      return `${round.teamCode}: ${candidate?.displayName || 'Unavailable'}`;
    }).join(' · ');
  }, [outcome, rounds]);

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
  // Shared runs reveal themselves once the replayed picks are all locked.
  useEffect(() => {
    if (autoRevealRef.current && board && allPicked && !outcome && !pending) {
      autoRevealRef.current = false;
      reveal();
    }
  }, [board, allPicked, outcome, pending, reveal]);

  return (
    <GameShell>
      <WorkbenchHeader
        title="DRAFT NIGHT"
        description={productionBoard
          ? 'Draft one player from each of five teams. All 243 combinations are ranked by average observed Game Score per 40 minutes.'
          : sourceImpactBoard
            ? 'Draft one player from each of five teams, ranked by the descriptive combined-source impact mean for each full roster.'
            : 'Draft one player from each of five teams, ranked by the board’s verified model comparison.'}
        steps={['Five draft rounds', 'Lock the draft', 'Verified summary']}
        current={outcome ? 2 : allPicked ? 1 : 0}
        state={status === 'ready' ? 'ready' : status === 'loading' ? 'idle' : 'error'}
        status={pending ? 'Evaluating your draftâ€¦' : outcome ? 'Draft verified' : status === 'ready' ? 'Blind run in progress' : null}
      />
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <BoardStatusPanel state={status} error={error} onRetry={() => loadBoard(seed)} />
        {status === 'ready' && presentation && (
          <>
            <HowToPlay
              defaultOpen={pickCount === 0 && !outcome}
              controls={(
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <BoardControlStrip presentation={presentation} seed={seed} onSeedChange={setSeed} bare />
                  <button type="button" onClick={() => startNewRunOnCurrentRevision(seed)} disabled={pending} className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold hover:bg-gold/20 disabled:opacity-50">Start fresh on current revision</button>
                </div>
              )}
              steps={[
                'Draft one player per round — each round belongs to a different team, so pick with role fit in mind.',
                productionBoard
                  ? 'Compare candidates by their stat tiles. The final ranking uses the five players’ observed Game Score per 40 minutes.'
                  : sourceImpactBoard
                    ? 'Use stat tiles for context. The final rank compares the full five-pick roster by its combined-source model estimate, not a sum of individual tiles.'
                    : 'Compare the candidates by their stat tiles for context; the final rank follows the board’s verified scoring contract.',
                'Lock all five rounds blind — scores stay hidden and nothing is evaluated until the draft is locked.',
                productionBoard
                  ? 'Reveal once to compare the roster by observed box-score production.'
                  : sourceImpactBoard
                    ? 'Reveal to see the descriptive model rank, gap to best, and best legal roster. Uncertainty is not estimated; this is not a forecast or a causal effect.'
                    : 'Reveal once to verify the roster rank and gap to the best legal roster.',
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
            {outcome && <div ref={resultRef} className="dg-reveal"><GamePointsBoard outcome={outcome} contextTitle={`${presentation.deck.title} · five-pick draft`} bestSelectionLabel={bestSelectionLabel} impactModelRef={board?.impactModelRef} /></div>}
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
                    <Sparkles className="h-4 w-4" /> {pending ? 'Evaluatingâ€¦' : 'Lock in the draft & evaluate'}
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
                        <button type="button" onClick={() => undoRound(round)} disabled={pending} className="dg-lock__undo">Undo</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {!outcome && activeRound && !picks[activeRound.roundId] && (
              <section ref={roundRef} key={activeRound.roundId} className="dg-round dg-flow-in" aria-label={activeRound.title}>
                <div className="dg-round__title">
                  <h3 className="font-display text-xl tracking-wide">Round {activeRound.roundNumber} · {activeRound.teamCode}</h3>
                  <span className="dg-round__counter">Pick {pickCount}/5</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{activeRound.prompt}</p>
                <CardCycler
                  className="mt-4"
                  items={activeRound.candidates}
                  renderItem={candidate => (
                    <TapeDuelCard
                      key={candidate.playerRef}
                      player={candidate}
                      selected={picks[activeRound.roundId] === candidate.playerRef}
                      disabled={pending || Boolean(outcome)}
                      ctaLabel="Draft him"
                      fitNote={fit?.candidate?.playerRef === candidate.playerRef ? fit.reasons.join(' · ') : null}
                      onSelect={() => choose(activeRound, candidate)}
                    />
                  )}
                />
              </section>
            )}
            {outcome && (
              <CompletionPanel
                total={points.total}
                max={points.max}
                seed={presentation.dailySeed}
                entries={[{ key: 'draft', title: 'Five-pick draft', points: points.total, maxPoints: points.max, rank: outcome?.evaluation?.decision?.rank, optionCount: outcome?.evaluation?.decision?.optionCount }]}
                otherGamePath="/daily-games/fix-the-five"
                otherGameTitle="Fix the Five"
                onReplay={replay}
                sharedResult={outcome ? encodeSharedRun({ gameKind: 'draft-night', seed: presentation.dailySeed, picks }) : null}
              />
            )}
            {notice && <p className="dg-notice" role="alert"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-trim-ink" />{notice}</p>}
          </>
        )}
      </main>
    </GameShell>
  );
}
