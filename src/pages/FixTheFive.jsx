import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Lock, Sparkles, Trophy } from 'lucide-react';
import GameShell from '@/components/dailyGames/GameShell';
import LineupSimPanel from '@/components/dailyGames/LineupSimPanel';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import BoardStatusPanel from '@/components/dailyGames/BoardStatusPanel';
import BoardControlStrip from '@/components/dailyGames/BoardControlStrip';
import HowToPlay from '@/components/dailyGames/HowToPlay';
import CardCycler from '@/components/dailyGames/CardCycler';
import TapeDuelCard from '@/components/dailyGames/TapeDuelCard';
import SwapBriefing from '@/components/dailyGames/SwapBriefing';
import DepthChart from '@/components/dailyGames/DepthChart';
import StepRail from '@/components/dailyGames/StepRail';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import useDailyGameBoard from '@/hooks/useDailyGameBoard';
import usePageMeta from '@/hooks/usePageMeta';
import { revealSwishIQDailyGame, revealNoticeFor, gamePointsForOutcome } from '@/lib/dailyGames/boardSource';
import { createRunStore } from '@/lib/dailyGames/runStorage';
import { encodeSharedRun, decodeSharedRun } from '@/lib/dailyGames/resultShare';
import '@/components/dailyGames/dailyGames.css';

const RUN_STORE = createRunStore('swishiq-studio-fix-the-five');

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

function restoreSelections(board, value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const restored = {};
  let invalid = false;
  const challenges = board.challenges || [];
  const challengeIds = new Set(challenges.map(challenge => challenge.challengeId));
  for (const [challengeId, playerRef] of Object.entries(source)) {
    const challenge = challenges.find(entry => entry.challengeId === challengeId);
    if (!challenge || typeof playerRef !== 'string'
      || !challenge.candidates.some(candidate => candidate.playerRef === playerRef)) {
      invalid = true;
      continue;
    }
    restored[challengeId] = playerRef;
  }
  if (Object.keys(source).some(challengeId => !challengeIds.has(challengeId))) invalid = true;
  return { restored, invalid };
}

const hasSavedOutcomes = value => Boolean(value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length);

export default function FixTheFive() {
  const [selections, setSelections] = useState({});
  const [outcomes, setOutcomes] = useState({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [revealLabel, setRevealLabel] = useState('');
  const [resultsOpen, setResultsOpen] = useState(true);
  // Site-facing title and description for this exact page, like the live
  // /tools/fix-the-five/ page serves.
  usePageMeta({
    title: "Fix the Five | DJ's House of Cards",
    description: 'Fix the Five daily game: repair a blind starting five with verified swaps, scored against the SwishIQ evaluator on the DJHC court.',
  });
  // Flow glue: after a pick, undo, or reveal, follow the run to the step the
  // visitor just unlocked — but never steal the scroll on a fresh load.
  const swapRef = useRef(null);
  const lockRef = useRef(null);
  const resultsRef = useRef(null);
  const interacted = useRef(false);
  // A ?result= link replays a friend's locked picks and re-verifies them —
  // only consumed when its board seed matches the loaded board.
  const [sharedRun] = useState(() => decodeSharedRun(window.location.search));
  const sharedRunRef = useRef(sharedRun && sharedRun.gameKind === 'fix-the-five' ? sharedRun : null);
  const autoRevealRef = useRef(false);
  const getSavedBoardRef = useCallback((targetSeed) => {
    if (sharedRun?.seed === targetSeed) return null;
    return RUN_STORE.read(targetSeed).boardRef || null;
  }, [sharedRun]);
  const {
    seed, setSeed, board, presentation, status, error, notice, setNotice, loadBoard, startNewRunOnCurrentRevision, league,
  } = useDailyGameBoard({
    gameKind: 'fix-the-five',
    getSavedBoardRef,
    onBoardReady: (loaded, { resetRun = false } = {}) => {
      const shared = sharedRunRef.current;
      if (shared) {
        if (shared.seed !== loaded.dailySeed) { setSeed(shared.seed); return; }
        sharedRunRef.current = null;
        const sharedPicks = shared.picks && typeof shared.picks === 'object' ? shared.picks : {};
        setSelections(sharedPicks);
        setOutcomes({});
        autoRevealRef.current = true;
        setNotice('Viewing a shared run — the locked picks replay and re-verify against the evaluator.');
        const firstOpen = loaded.challenges.findIndex((challenge) => !sharedPicks[challenge.challengeId]);
        setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.challenges.length);
        return;
      }
      const boardRef = loaded.boardRef || null;
      if (resetRun) {
        RUN_STORE.write(loaded.dailySeed, { selections: {}, outcomes: {}, ...(boardRef ? { boardRef } : {}) });
        setSelections({}); setOutcomes({}); setActiveIndex(0); setNotice('Started a fresh run on the current published board revision.');
        return;
      }
      const store = RUN_STORE.read(loaded.dailySeed, boardRef?.boardSha256);
      const hasRevision = Boolean(store.boardRef?.boardSha256);
      const revisionMismatch = Boolean(boardRef && hasRevision && !sameBoardRevision(store.boardRef, boardRef));
      const { restored: savedSelections, invalid: invalidSelections } = restoreSelections(loaded, store.selections);
      const storedOutcomes = store.outcomes && typeof store.outcomes === 'object' && !Array.isArray(store.outcomes) ? store.outcomes : {};
      const unpinnedOutcomes = Boolean(boardRef && !hasRevision && hasSavedOutcomes(storedOutcomes));
      const staleOutcomes = {};
      const revisionMatchedOutcomes = {};
      for (const [challengeId, outcome] of Object.entries(storedOutcomes)) {
        if (boardRef && !outcomeMatchesRevision(outcome, boardRef)) staleOutcomes[challengeId] = outcome;
        else revisionMatchedOutcomes[challengeId] = outcome;
      }
      const mismatchedOutcomes = Object.keys(staleOutcomes).length > 0;
      const stale = revisionMismatch || invalidSelections || unpinnedOutcomes || mismatchedOutcomes;
      const storedSelections = revisionMismatch ? {} : savedSelections;
      const restoredOutcomes = stale ? {} : revisionMatchedOutcomes;
      setSelections(storedSelections);
      setOutcomes(restoredOutcomes);
      if (boardRef && !revisionMismatch && (!hasRevision || invalidSelections || mismatchedOutcomes)) {
        RUN_STORE.write(loaded.dailySeed, {
          selections: storedSelections,
          outcomes: restoredOutcomes,
          ...((unpinnedOutcomes || mismatchedOutcomes) ? { staleOutcomes: { ...storedOutcomes, ...staleOutcomes } } : {}),
          boardRef,
        });
      }
      if (revisionMismatch) setNotice('This saved run belongs to a different board revision. Its picks and result were not restored. Start a fresh run on the current revision to continue.');
      else if (unpinnedOutcomes) setNotice('A saved result has no pinned board revision, so it was marked stale. Saved legal picks were restored; reveal again to verify them on this board.');
      else if (mismatchedOutcomes) setNotice('A saved result belongs to a different board revision, so it was marked stale. Saved legal picks were restored; reveal again to verify them on this board.');
      else if (invalidSelections) setNotice('Some saved picks are not legal on this board and were cleared. Review the remaining picks before revealing.');
      const firstOpen = loaded.challenges.findIndex((challenge) => !storedSelections[challenge.challengeId] && !restoredOutcomes[challenge.challengeId]);
      setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.challenges.length);
    },
  });

  const persist = useCallback((nextSeed, nextSelections, nextOutcomes) => {
    RUN_STORE.write(nextSeed, { selections: nextSelections, outcomes: nextOutcomes, ...(board?.boardRef ? { boardRef: board.boardRef } : {}) });
  }, [board]);

  const challenges = presentation?.challenges || [];
  const pickCount = challenges.filter((challenge) => selections[challenge.challengeId]).length;
  const completedCount = challenges.filter((challenge) => outcomes[challenge.challengeId]).length;
  const allPicked = challenges.length > 0 && pickCount + completedCount === challenges.length;

  // Blind flow: a pick only locks the call — nothing is evaluated or scored
  // until the whole board is locked and revealed once.
  const pick = useCallback((challenge, candidate) => {
    const key = challenge.challengeId;
    if (pending || selections[key] || outcomes[key]) return;
    interacted.current = true;
    const nextSelections = { ...selections, [key]: candidate.playerRef };
    setSelections(nextSelections);setNotice('');
    persist(board.dailySeed, nextSelections, outcomes);
    const nextIndex = challenges.findIndex((item) => !nextSelections[item.challengeId] && !outcomes[item.challengeId]);
    setActiveIndex(nextIndex >= 0 ? nextIndex : challenges.length);
  }, [board, challenges, outcomes, pending, persist, selections]);

  const undo = useCallback((challenge) => {
    if (pending || outcomes[challenge.challengeId]) return;
    interacted.current = true;
    const key = challenge.challengeId;
    const nextSelections = { ...selections };
    delete nextSelections[key];
    setSelections(nextSelections);setNotice('');
    setActiveIndex(challenges.findIndex((item) => item.challengeId === key));
    persist(board.dailySeed, nextSelections, outcomes);
  }, [board, challenges, outcomes, pending, persist, selections]);

  const reveal = useCallback(async () => {
    if (pending || !board || !allPicked) return;
    interacted.current = true;
    setPending(true);setNotice('');setRevealLabel('Revealing the board…');
    try {
      let nextOutcomes = { ...outcomes };
      for (const challenge of challenges) {
        if (nextOutcomes[challenge.challengeId] || !selections[challenge.challengeId]) continue;
        setRevealLabel(`Revealing swap ${Object.keys(nextOutcomes).length + 1} of ${challenges.length}…`);
        const outcome = await revealSwishIQDailyGame({ board, challengeId: challenge.challengeId, playerRef: selections[challenge.challengeId] });
        nextOutcomes = { ...nextOutcomes, [challenge.challengeId]: outcome };
        setOutcomes(nextOutcomes);
        persist(board.dailySeed, selections, nextOutcomes);
      }
    } catch (revealError) {
      setNotice(revealNoticeFor(revealError));
    } finally {
      setPending(false);setRevealLabel('');
    }
  }, [allPicked, board, challenges, outcomes, pending, persist, selections]);

  const replay = useCallback(() => {
    if (!board) return;
    setSelections({});setOutcomes({});setActiveIndex(0);setNotice('');
    persist(board.dailySeed, {}, {});
  }, [board, persist]);

  const total = Object.values(outcomes).reduce((sum, outcome) => sum + gamePointsForOutcome(outcome).total, 0);
  // Boards published under the earlier point rule max a decision at fewer
  // points, so the ceiling follows each outcome's own passport, not a constant.
  const maxTotal = challenges.reduce((sum, challenge) => sum + gamePointsForOutcome(outcomes[challenge.challengeId]).max, 0);
  const activeChallenge = challenges[activeIndex];
  const outgoing = activeChallenge ?
  activeChallenge.lineup.find((player) => player.playerRef === activeChallenge.removePlayerRef) :
  null;
  const simSquads = useMemo(() => challenges.
  filter((challenge) => selections[challenge.challengeId]).
  map((challenge) => {
    const picked = challenge.candidates.find((entry) => entry.playerRef === selections[challenge.challengeId]);
    const players = challenge.lineup.
    map((player) => player.playerRef === challenge.removePlayerRef ? picked : player).
    filter(Boolean);
    return { id: challenge.challengeId, label: challenge.title, code: challenge.teamCode, players };
  }), [challenges, selections]);
  const current = completedCount === challenges.length ? 2 : allPicked ? 1 : 0;
  const productionBoard = board?.scoringContract === 'observed-box-score-production-v1';
  const sourceImpactBoard = board?.scoringContract === 'swishiq-impact-combined-source-ranking-v1';

  useEffect(() => {
    if (interacted.current && swapRef.current) swapRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeIndex]);
  useEffect(() => {
    if (interacted.current && allPicked && completedCount < challenges.length && lockRef.current) {
      lockRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [allPicked, completedCount, challenges.length]);
  useEffect(() => {
    if (interacted.current && completedCount === challenges.length && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [completedCount, challenges.length]);
  // Shared runs reveal themselves once the replayed picks are all locked.
  useEffect(() => {
    if (autoRevealRef.current && board && allPicked && completedCount < challenges.length && !pending) {
      autoRevealRef.current = false;
      reveal();
    }
  }, [board, allPicked, completedCount, challenges.length, pending, reveal]);

  return (
    <GameShell>
      <WorkbenchHeader
        title="FIX THE FIVE"
        description={productionBoard
          ? 'Repair five blind lineups. Legal replacements are ranked by the five players’ average observed Game Score per 40 minutes.'
          : sourceImpactBoard
            ? 'Repair five blind lineups, ranked by the descriptive combined-source impact mean for each full five-player lineup.'
            : 'Repair a blind starting five with legal swaps, ranked by the board’s verified model comparison once it locks.'}
        steps={['Board & context', 'Five repair calls', 'Verified summary']}
        current={current}
        state={status === 'ready' ? 'ready' : status === 'loading' ? 'idle' : 'error'}
        status={pending ? revealLabel || 'Working…' : completedCount === challenges.length ? 'Run verified' : status === 'ready' ? 'Blind run in progress' : null} />
      
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <BoardStatusPanel state={status} error={error} onRetry={() => loadBoard(seed)} />
        {status === 'ready' && presentation &&
        <div className="dg-tape-layout mt-4">
            <StepRail
            total={challenges.length}
            completedCount={pickCount + completedCount}
            label={pending ? 'Revealing' : completedCount === challenges.length ? 'Verified' : 'Locked picks'} />
          
            <div className="min-w-0 space-y-3">
              <HowToPlay
              defaultOpen={pickCount + completedCount === 0}
              controls={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <BoardControlStrip presentation={presentation} seed={seed} onSeedChange={setSeed} bare />
                  <button type="button" onClick={() => startNewRunOnCurrentRevision(seed)} disabled={pending} className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold hover:bg-gold/20 disabled:opacity-50">Start fresh on current revision</button>
                </div>
              }
              steps={[
              'Read the outgoing starter\u2019s tape first — the reference row in the depth chart is the player you are replacing.',
              productionBoard
                ? 'Compare the candidates by their stat tiles. The final ranking uses the five players’ observed Game Score per 40 minutes.'
                : sourceImpactBoard
                  ? 'Use the stat tiles for context. The final rank uses the combined-source model estimate for the full five-player lineup, not a raw replacement difference.'
                  : 'Compare the candidates by their stat tiles for context; the final ranking follows the board’s verified scoring contract.',
              'Lock all five swaps blind — scores stay hidden and nothing is evaluated until the board is locked.',
              productionBoard
                ? 'Reveal once to compare the swaps by observed box-score production.'
                : sourceImpactBoard
                  ? 'Reveal to see each descriptive model rank and gap to the best legal swap. Uncertainty is not estimated; this is not a forecast or a causal effect.'
                  : 'Reveal once to verify every swap’s rank and gap to the best legal choice.']
              }
              note="Your picks save in this browser — refresh anytime and the run picks up where you left off." />
            
              {activeChallenge &&
            <React.Fragment key={activeChallenge.challengeId}>
                  <section ref={swapRef} className="dg-board-hero dg-flow-in" aria-label={activeChallenge.title}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="bcast-kicker">Swap {activeIndex + 1} of {challenges.length} · blind pick</span>
                        <h2 className="dg-board-hero__title font-display tracking-wide">{activeChallenge.title}</h2>
                      </div>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="dg-challenge__chip">Outgoing: {outgoing?.displayName}</span>
                        <span className="dg-badge">Locked {pickCount}/{challenges.length}</span>
                      </span>
                    </div>
                    
                  </section>
                  <div className="dg-flow-in space-y-3">
                    <DepthChart lineup={activeChallenge.lineup} removedPlayerRef={activeChallenge.removePlayerRef} incomingPlayer={activeChallenge.incomingPlayer} incomingLabel="Incoming" />
                    <SwapBriefing challenge={activeChallenge} />
                    <CardCycler
                      items={activeChallenge.candidates}
                      renderItem={(candidate) =>
                  <TapeDuelCard
                    key={candidate.playerRef}
                    player={candidate}
                    reference={outgoing}
                    selected={selections[activeChallenge.challengeId] === candidate.playerRef}
                    disabled={pending}
                    ctaLabel="Swap in"
                    onSelect={() => pick(activeChallenge, candidate)} />

                  } />
                  </div>
                </React.Fragment>
            }
              {pending && revealLabel && <p className="dg-reveal-status" role="status">{revealLabel}</p>}
              {allPicked && completedCount < challenges.length &&
            <section ref={lockRef} className="dg-lock dg-flow-in" aria-label="Reveal the board">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="bcast-kicker">All five calls made</span>
                      <h3 className="mt-2 flex items-center gap-2 font-display text-2xl tracking-wide"><Lock className="h-5 w-5 text-gold" />Blind board locked</h3>
                      <p className="mt-1 text-xs text-muted-foreground">All five repair calls are locked with no scores shown. Reveal once to verify every swap — no partial reveals, no substitute score.</p>
                    </div>
                    <button type="button" onClick={reveal} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-[0_8px_24px_hsl(43_78%_60%/.35)] hover:brightness-110 disabled:opacity-50">
                      <Sparkles className="h-4 w-4" /> {pending ? 'Revealing…' : 'Reveal the board & score'}
                    </button>
                  </div>
                  <ul className="dg-lock__list mt-4">
                    {challenges.map((challenge) => {
                  const candidate = challenge.candidates.find((entry) => entry.playerRef === selections[challenge.challengeId]);
                  return (
                    <li key={challenge.challengeId} className="dg-lock__pick">
                          <span className="min-w-0">
                            <span className="dg-lock__team">{challenge.teamCode}</span>
                            <span className="dg-lock__player block truncate">{candidate?.displayName}</span>
                          </span>
                          <button type="button" onClick={() => undo(challenge)} disabled={pending} className="dg-lock__undo">Undo</button>
                        </li>);

                })}
                  </ul>
                </section>
            }
              {completedCount === challenges.length &&
            <>
                  <div ref={resultsRef} className="dg-results">
                    <button type="button" className="dg-results__toggle" aria-expanded={resultsOpen} onClick={() => setResultsOpen(value => !value)}>
                      <span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-gold" /><span className="bcast-kicker">Board verified</span></span>
                      <span className="flex items-center gap-2">
                        <span className="dg-badge">{completedCount}/{challenges.length} swaps scored</span>
                        <ChevronDown className={`dg-results__chevron h-4 w-4 ${resultsOpen ? '' : 'is-closed'}`} />
                      </span>
                    </button>
                    {resultsOpen &&
                    <div className="dg-results__list">
                      {challenges.map((challenge) => outcomes[challenge.challengeId] ?
                    <GamePointsBoard
                      key={challenge.challengeId}
                      outcome={outcomes[challenge.challengeId]}
                      contextTitle={`${challenge.title} · ${challenge.teamCode}`}
                      teamCode={challenge.teamCode}
                      impactModelRef={board?.impactModelRef}
                      bestSelectionLabel={challenge.candidates.find(candidate => candidate.playerRef === outcomes[challenge.challengeId]?.evaluation?.bestSelection)?.displayName}
                    /> :
                    null)}
                    </div>
                    }
                  </div>
                  {simSquads.length > 0 &&
              <LineupSimPanel league={league} squads={simSquads} lineupLabel="The fixed five" scoreboardOverlay />
              }
                  <CompletionPanel
                total={total}
                max={maxTotal}
                seed={presentation.dailySeed}
                entries={challenges.map((challenge) => {
                  const points = gamePointsForOutcome(outcomes[challenge.challengeId]);
                  const decision = outcomes[challenge.challengeId]?.evaluation?.decision;
                  return { key: challenge.challengeId, title: challenge.title, points: points.total, maxPoints: points.max, rank: decision?.rank, optionCount: decision?.optionCount };
                })}
                otherGamePath="/daily-games/draft-night"
                otherGameTitle="Draft Night"
                onReplay={replay}
                sharedResult={completedCount === challenges.length ? encodeSharedRun({ gameKind: 'fix-the-five', seed: presentation.dailySeed, picks: selections }) : null} />
              
                </>
            }
              {notice && <p className="dg-notice" role="alert"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-trim-ink" />{notice}</p>}
            </div>
          </div>
        }
      </main>
    </GameShell>);

}
