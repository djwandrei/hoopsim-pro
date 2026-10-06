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
import DraftDesk from '@/components/dailyGames/DraftDesk';
import { bestFitFor, deskNeeds, pickedRoster } from '@/components/dailyGames/draftDesk';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import useDailyGameBoard from '@/hooks/useDailyGameBoard';
import { revealSwishIQDailyGame, revealNoticeFor, gamePointsForOutcome } from '@/lib/dailyGames/boardSource';
import { createRunStore } from '@/lib/dailyGames/runStorage';
import { encodeSharedRun, decodeSharedRun } from '@/lib/dailyGames/resultShare';
import '@/components/dailyGames/dailyGames.css';

const RUN_STORE = createRunStore('swishiq-studio-draft-night');

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
  const {
    seed, setSeed, board, presentation, status, error, notice, setNotice, loadBoard, league,
  } = useDailyGameBoard({
    gameKind: 'draft-night',
    onBoardReady: (loaded) => {
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
      const store = RUN_STORE.read(loaded.dailySeed);
      const storedPicks = store.picks && typeof store.picks === 'object' ? store.picks : {};
      setPicks(storedPicks);
      setOutcome(store.outcome || null);
      const firstOpen = loaded.deck.rounds.findIndex(round => !storedPicks[round.roundId]);
      setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.deck.rounds.length);
    },
  });

  const persist = useCallback((nextSeed, nextPicks, nextOutcome) => {
    RUN_STORE.write(nextSeed, { picks: nextPicks, outcome: nextOutcome });
  }, []);

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
        description="Pick one player from each of five different team rounds — locked blind, revealed once, scored by average estimated additive player impact."
        steps={['Five draft rounds', 'Lock the draft', 'Verified summary']}
        current={outcome ? 2 : allPicked ? 1 : 0}
        state={status === 'ready' ? 'ready' : status === 'loading' ? 'idle' : 'error'}
        status={pending ? 'Evaluating your draft…' : outcome ? 'Draft verified' : status === 'ready' ? 'Blind run in progress' : null}
      />
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <BoardStatusPanel state={status} error={error} onRetry={() => loadBoard(seed)} />
        {status === 'ready' && presentation && (
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
                entries={[{ key: 'draft', title: 'Five-pick draft', points: points.total, maxPoints: points.max }]}
                otherGamePath="/fix-the-five"
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