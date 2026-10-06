import { decisionProofStatus, isResultPassport } from './result-passport.js?v=20260930f';
import { createLocalReplayHistory } from './swishiq-studio/engine/replay-share-telemetry.js?v=20260927s&rev=replay-share-telemetry-v2-public-share';

const PLAYER_REF = /^p_[a-f0-9]{32}$/;

function selectionPlayerRefs(gameKind, selection, definition) {
  if (gameKind === 'fix-the-five') {
    if (selection?.kind !== gameKind || selection.challengeId !== definition.challengeId
      || !PLAYER_REF.test(String(selection.playerRef || ''))) return null;
    return [selection.playerRef];
  }
  if (selection?.kind !== gameKind || !Array.isArray(selection.picks)
    || selection.picks.length !== definition.rounds.length) return null;
  const refs = [];
  for (let index = 0; index < definition.rounds.length; index += 1) {
    const pick = selection.picks[index];
    const round = definition.rounds[index];
    if (pick?.roundId !== round.roundId || !PLAYER_REF.test(String(pick.playerRef || ''))) return null;
    refs.push(pick.playerRef);
  }
  return refs;
}

// A tab-session learning record, not a leaderboard, saved answer key, or score
// authority. Only successfully evaluated legal decisions can enter this ledger.
export function createDecisionHistory(board, { persistence = null } = {}) {
  const gameKind = board.gameKind;
  // Persistence is opt-in so existing tab-session behavior remains unchanged.
  // A caller may supply an existing history handle or options for the bounded
  // local store. Only the public decision summary is written.
  const replayHistory = persistence && typeof persistence.save === 'function'
    ? persistence
    : persistence ? createLocalReplayHistory(persistence) : null;
  const boardRef = {
    gameKind: typeof gameKind === 'string' ? gameKind : 'unknown',
    ...(typeof board.boardId === 'string' ? { boardId: board.boardId } : {}),
    ...(typeof board.dailySeed === 'string' ? { dailySeed: board.dailySeed } : {}),
    ...(typeof board.boardContentSha256 === 'string' ? { boardContentSha256: board.boardContentSha256 } : {}),
  };
  const groups = new Map();
  const definitions = gameKind === 'fix-the-five' ? board.challenges : [board.deck];
  for (const definition of definitions) {
    const definitionId = gameKind === 'fix-the-five' ? definition.challengeId : definition.deckId;
    if (!definitionId || groups.has(definitionId)) throw new Error('Duplicate decision scope.');
    const rounds = gameKind === 'fix-the-five' ? [definition] : definition.rounds;
    if (rounds.some(round => round.candidates.some(player => typeof player.playerRef !== 'string'
      || !PLAYER_REF.test(player.playerRef)
      || typeof player.displayName !== 'string'
      || !player.displayName.trim()
      || player.displayName.length > 160))) throw new Error('Decision identity is invalid.');
    groups.set(definitionId, {
      definition: structuredClone(definition),
      optionCount: gameKind === 'fix-the-five' ? definition.candidates.length : null,
      choices: new Map(),
      order: [],
      current: null,
    });
  }
  return {
    replayHistory,
    record(id, selectedPlayerRefs, response) {
      const group = groups.get(id), definition = group?.definition;
      if (!group || !Array.isArray(selectedPlayerRefs) || new Set(selectedPlayerRefs).size !== selectedPlayerRefs.length) {
        throw new Error('Decision scope is invalid.');
      }
      const rounds = gameKind === 'fix-the-five' ? [definition] : definition.rounds;
      if (selectedPlayerRefs.length !== rounds.length
        || selectedPlayerRefs.some((value, index) => !rounds[index].candidates.some(player => player.playerRef === value))) {
        throw new Error('History requires a legal selection from this board.');
      }
      const responseRefs = selectionPlayerRefs(gameKind, response?.selection, definition);
      if (!responseRefs || JSON.stringify(responseRefs) !== JSON.stringify(selectedPlayerRefs)) {
        throw new Error('History requires an evaluator response for the selected players.');
      }
      const passport = isResultPassport(response?.resultPassport)
        && response.resultPassport.status === 'complete'
        && Number.isInteger(response.resultPassport.decision?.rank)
        && Number.isInteger(response.resultPassport.decision?.optionCount)
        && Number.isInteger(response.resultPassport.gamePoints?.total)
        && Number.isInteger(response.resultPassport.gamePoints?.max)
        ? response.resultPassport : null;
      const rank = passport?.decision.rank;
      const optionCount = passport?.decision.optionCount;
      const proofStatus = decisionProofStatus(passport?.decision);
      if (!passport || rank < 1 || optionCount < 1 || rank > optionCount
        || (group.optionCount !== null && optionCount !== group.optionCount)) {
        throw new Error('History requires a matching validated Result Passport.');
      }
      if (group.optionCount === null) group.optionCount = optionCount;
      const points = passport.gamePoints;
      const fingerprint = {
        rank,
        points: points.total,
        maxPoints: points.max,
        optionCount,
        countComplete: proofStatus.rankComplete,
        bestLegalChoiceProven: proofStatus.bestLegalChoiceProven,
      };
      const key = JSON.stringify(selectedPlayerRefs), previous = group.choices.get(key);
      if (previous && JSON.stringify(previous.fingerprint) !== JSON.stringify(fingerprint)) {
        throw new Error('This fixed-board result changed. Reload the board before comparing attempts.');
      }
      if (!previous) {
        if (group.choices.size >= 243) throw new Error('Decision history reached its bounded session limit.');
        const entry = {
          number: group.choices.size + 1,
          selection: [...selectedPlayerRefs],
          names: selectedPlayerRefs.map((value, index) => rounds[index].candidates
            .find(player => player.playerRef === value).displayName),
          rank: proofStatus.rankComplete ? rank : null,
          optionCount: proofStatus.rankComplete ? optionCount : null,
          countComplete: proofStatus.rankComplete,
          bestLegalChoiceProven: proofStatus.bestLegalChoiceProven,
          points,
          fingerprint,
        };
        group.choices.set(key, entry);
        group.order.push(key);
        if (replayHistory) {
          try {
            replayHistory.save({
              kind: 'decision-history',
              gameKind,
              scopeId: id,
              boardRef,
              selection: entry.selection,
              names: entry.names,
              result: {
                rank: entry.rank,
                optionCount: entry.optionCount,
                countComplete: entry.countComplete,
                points: entry.points,
              },
            });
          } catch {
            // A blocked or full browser store must never interrupt a legal
            // in-memory decision history.
          }
        }
      }
      group.current = key;
      return this.summary(id);
    },
    summary(id) {
      const group = groups.get(id);
      if (!group) throw new Error('Decision scope is invalid.');
      const storedEntries = group.order.map(key => group.choices.get(key));
      const publicEntry = entry => entry ? ({
        number: entry.number,
        selection: entry.selection,
        names: entry.names,
        rank: entry.rank,
        optionCount: entry.optionCount,
        countComplete: entry.countComplete,
        bestLegalChoiceProven: entry.bestLegalChoiceProven,
        points: entry.points,
      }) : null;
      const entries = storedEntries.map(publicEntry);
      const rankCompleteEntries = entries.filter(entry => entry.countComplete === true);
      const best = [...rankCompleteEntries].sort((left, right) => left.rank - right.rank || left.number - right.number)[0]
        || entries.find(entry => entry.bestLegalChoiceProven === true)
        || null;
      const current = group.choices.get(group.current) || null, first = entries[0] || null;
      return structuredClone({
        count: entries.length,
        optionCount: entries.length > 0 && entries.every(entry => entry.countComplete === true) ? group.optionCount : null,
        first,
        best,
        current: publicEntry(current),
        recent: entries.slice(-8),
        rankChange: first?.countComplete === true && current?.countComplete === true
          ? first.rank - current.rank : null,
        note: 'First checked means the first evaluated choice in this tab session, not an official first attempt. Retrying the same choice does not add a decision. Reloading clears this learning history; saved picks and personal-best records are separate.',
      });
    },
  };
}
