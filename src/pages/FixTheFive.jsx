import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lock, Sparkles } from 'lucide-react';
import GameShell from '@/components/dailyGames/GameShell';
import LineupSimPanel from '@/components/dailyGames/LineupSimPanel';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import BoardStatusPanel from '@/components/dailyGames/BoardStatusPanel';
import BoardControlStrip from '@/components/dailyGames/BoardControlStrip';
import HowToPlay from '@/components/dailyGames/HowToPlay';
import TapeDuelCard from '@/components/dailyGames/TapeDuelCard';
import TapeReference from '@/components/dailyGames/TapeReference';
import LineupCourt from '@/components/dailyGames/LineupCourt';
import StepRail from '@/components/dailyGames/StepRail';
import GamePointsBoard from '@/components/dailyGames/GamePointsBoard';
import CompletionPanel from '@/components/dailyGames/CompletionPanel';
import useSeasonSource from '@/hooks/useSeasonSource';
import {
  loadSwishIQDailyBoard,
  revealSwishIQDailyGame,
  swishIQDailyGameErrorKind,
  dailySeedFromPageSearch,
  normalizeGameFamily,
  gamePointsForOutcome } from
'@/lib/dailyGames/boardSource';
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
  const urlFamily = useMemo(() => {try {return normalizeGameFamily(new URLSearchParams(window.location.search).get('family'));} catch {return '';}}, []);
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
  const [revealLabel, setRevealLabel] = useState('');
  const [notice, setNotice] = useState('');
  const { year, setYear, source, league } = useSeasonSource();

  const persist = useCallback((nextSeed, nextSelections, nextOutcomes) => {
    const store = readStore();
    store.runs[nextSeed] = { selections: nextSelections, outcomes: nextOutcomes };
    try {window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));} catch {/* visit-only */}
  }, []);

  const loadBoard = useCallback(async (targetSeed = seed) => {
    setStatus('loading');setError(null);setErrorKind('');setNotice('');
    try {
      const loaded = await loadSwishIQDailyBoard({ gameKind: 'fix-the-five', dailySeed: targetSeed, family: urlFamily });
      setBoard(loaded);
      setStatus('ready');
      const store = readStore().runs[loaded.dailySeed] || {};
      const storedSelections = store.selections && typeof store.selections === 'object' ? store.selections : {};
      const storedOutcomes = store.outcomes && typeof store.outcomes === 'object' ? store.outcomes : {};
      setSelections(storedSelections);
      setOutcomes(storedOutcomes);
      const firstOpen = loaded.challenges.findIndex((challenge) => !storedSelections[challenge.challengeId] && !storedOutcomes[challenge.challengeId]);
      setActiveIndex(firstOpen >= 0 ? firstOpen : loaded.challenges.length);
    } catch (loadError) {
      setBoard(null);
      setError(loadError);
      setErrorKind(swishIQDailyGameErrorKind(loadError));
      setStatus(['board-unavailable', 'board-invalid', 'evaluator-unavailable', 'verification-error'].includes(swishIQDailyGameErrorKind(loadError)) ? swishIQDailyGameErrorKind(loadError) : 'error');
    }
  }, [seed, urlFamily]);

  useEffect(() => {loadBoard(seed);}, [seed, loadBoard]);
  useEffect(() => {loadSwishIqPlayerMetadata().then(setMetadata, () => setMetadata(null));}, []);
  useEffect(() => {
    const boardYear = board?.packageRef?.scope?.seasonStartYear;
    if (boardYear && String(year) !== String(boardYear)) setYear(boardYear);
  }, [board, year, setYear]);

  const presentation = useMemo(() => board ? hydratePresentationBoard(board, { playerSeasons: source?.playerSeasons || [], metadata }) : null, [board, source, metadata]);
  const challenges = presentation?.challenges || [];
  const pickCount = challenges.filter((challenge) => selections[challenge.challengeId]).length;
  const completedCount = challenges.filter((challenge) => outcomes[challenge.challengeId]).length;
  const allPicked = challenges.length > 0 && pickCount + completedCount === challenges.length;

  // Blind flow: a pick only locks the call — nothing is evaluated or scored
  // until the whole board is locked and revealed once.
  const pick = useCallback((challenge, candidate) => {
    const key = challenge.challengeId;
    if (pending || selections[key] || outcomes[key]) return;
    const nextSelections = { ...selections, [key]: candidate.playerRef };
    setSelections(nextSelections);setNotice('');
    persist(board.dailySeed, nextSelections, outcomes);
    const nextIndex = challenges.findIndex((item) => !nextSelections[item.challengeId] && !outcomes[item.challengeId]);
    setActiveIndex(nextIndex >= 0 ? nextIndex : challenges.length);
  }, [board, challenges, outcomes, pending, persist, selections]);

  const undo = useCallback((challenge) => {
    if (pending || outcomes[challenge.challengeId]) return;
    const key = challenge.challengeId;
    const nextSelections = { ...selections };
    delete nextSelections[key];
    setSelections(nextSelections);setNotice('');
    setActiveIndex(challenges.findIndex((item) => item.challengeId === key));
    persist(board.dailySeed, nextSelections, outcomes);
  }, [board, challenges, outcomes, pending, persist, selections]);

  const reveal = useCallback(async () => {
    if (pending || !board || !allPicked) return;
    setPending(true);setNotice('');setRevealLabel('Revealing the board…');
    try {
      let nextOutcomes = { ...outcomes };
      for (const challenge of challenges) {
        if (nextOutcomes[challenge.challengeId] || !selections[challenge.challengeId]) continue;
        setRevealLabel(`Revealing swap ${Object.keys(nextOutcomes).length + 1} of ${challenges.length}…`);
        const outcome = await revealSwishIQDailyGame({ board, challengeId: challenge.challengeId, playerRef: selections[challenge.challengeId] });
        const plain = JSON.parse(JSON.stringify({ format: outcome.format, contractVersion: outcome.contractVersion, action: outcome.action, boardRef: outcome.boardRef, resultContract: outcome.resultContract, selection: outcome.selection, resultPassport: outcome.resultPassport }));
        nextOutcomes = { ...nextOutcomes, [challenge.challengeId]: plain };
        setOutcomes(nextOutcomes);
        persist(board.dailySeed, selections, nextOutcomes);
      }
    } catch (revealError) {
      const kind = swishIQDailyGameErrorKind(revealError);
      setNotice(kind === 'evaluator-unavailable' ?
      'The exact-season evaluator is unavailable; no Game Points or substitute score was used.' :
      'This board result is unavailable. No substitute score was used.');
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
  const maxTotal = challenges.length * 10;
  const activeChallenge = challenges[activeIndex];
  const outgoing = activeChallenge ?
  activeChallenge.lineup.find((player) => player.playerRef === activeChallenge.removePlayerRef) :
  null;
  const simSquads = challenges.
  filter((challenge) => selections[challenge.challengeId]).
  map((challenge) => {
    const picked = challenge.candidates.find((entry) => entry.playerRef === selections[challenge.challengeId]);
    const players = challenge.lineup.
    map((player) => player.playerRef === challenge.removePlayerRef ? picked : player).
    filter(Boolean);
    return { id: challenge.challengeId, label: challenge.title, code: challenge.teamCode, players };
  });
  const current = completedCount === challenges.length ? 2 : 0;
  const statusState = status === 'error' ? errorKind || 'verification-error' : status;

  return (
    <GameShell>
      <WorkbenchHeader
        title="FIX THE FIVE"
        description="Compare each legal swap with the starting five by summed estimated additive player impact. This is a model estimate, not observed five-player performance or causal chemistry."
        steps={['Board & context', 'Five repair calls', 'Verified summary']}
        current={current}
        state={statusState === 'ready' ? 'ready' : statusState === 'loading' ? 'idle' : 'error'}
        status={pending ? revealLabel || 'Working…' : completedCount === challenges.length ? 'Run verified' : statusState === 'ready' ? 'Blind run in progress' : null} />
      
      <main className="mx-auto max-w-6xl px-4 py-6">
        <BoardStatusPanel state={statusState} error={error} onRetry={() => loadBoard(seed)} />
        {statusState === 'ready' && presentation &&
        <div className="dg-tape-layout mt-5">
            <StepRail
            total={challenges.length}
            completedCount={pickCount + completedCount}
            label={pending ? 'Revealing' : completedCount === challenges.length ? 'Verified' : 'Locked picks'} />
          
            <div className="min-w-0 space-y-5">
              <HowToPlay
              controls={<BoardControlStrip presentation={presentation} seed={seed} onSeedChange={setSeed} bare />}
              steps={[
              'Read the outgoing starter\u2019s tape first — the reference row under the court is the player you are replacing.',
              'Compare each candidate by their stat tiles. Green deltas mean they out-produce the outgoing player; red means they fall short.',
              'Lock all five swaps blind — scores stay hidden and nothing is evaluated until the board is locked.',
              'Reveal once to score every swap against the verified evaluator. A perfect swap earns 10 Game Points; exact estimates score in tiers.']
              }
              note="Your picks save in this browser — refresh anytime and the run picks up where you left off." />
            
              {activeChallenge &&
            <>
                  <section key={activeChallenge.challengeId} className="dg-board-hero dg-flow-in" aria-label={activeChallenge.title}>
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
                  <div key={activeChallenge.challengeId} className="dg-flow-in space-y-3">
                    <LineupCourt slim lineup={activeChallenge.lineup} removedPlayerRef={activeChallenge.removePlayerRef} />
                    <TapeReference player={outgoing} />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {activeChallenge.candidates.map((candidate) =>
                  <TapeDuelCard
                    key={candidate.playerRef}
                    player={candidate}
                    reference={outgoing}
                    selected={selections[activeChallenge.challengeId] === candidate.playerRef}
                    disabled={pending}
                    ctaLabel="Swap in"
                    onSelect={() => pick(activeChallenge, candidate)} />

                  )}
                    </div>
                  </div>
                </>
            }
              {pending && revealLabel && <p className="dg-reveal-status" role="status">{revealLabel}</p>}
              {allPicked && completedCount < challenges.length &&
            <section className="dg-lock dg-flow-in" aria-label="Reveal the board">
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
                  <div className="space-y-4">
                    {challenges.map((challenge) => outcomes[challenge.challengeId] ?
                <div key={challenge.challengeId} className="dg-reveal">
                        <GamePointsBoard outcome={outcomes[challenge.challengeId]} contextTitle={`${challenge.title} · ${challenge.teamCode}`} />
                      </div> :
                null)}
                  </div>
                  {completedCount === challenges.length && simSquads.length > 0 &&
              <LineupSimPanel league={league} squads={simSquads} lineupLabel="The fixed five" />
              }
                  <CompletionPanel
                total={total}
                max={maxTotal}
                seed={presentation.dailySeed}
                entries={challenges.map((challenge) => {
                  const points = gamePointsForOutcome(outcomes[challenge.challengeId]);
                  return { key: challenge.challengeId, title: challenge.title, points: points.total, maxPoints: points.max };
                })}
                otherGamePath="/draft-night"
                otherGameTitle="Draft Night"
                onReplay={replay} />
              
                </>
            }
              {notice && <p className="dg-notice" role="alert"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-trim-ink" />{notice}</p>}
            </div>
          </div>
        }
      </main>
    </GameShell>);

}