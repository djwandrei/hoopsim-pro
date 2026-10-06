import {
  predictGame,
  predictPlayerBoxRate,
  predictPlayerScoringRate,
  resolveGameInputSeasonAges,
} from './djhc-player-game-sim-v4-runtime-20261006.js';

const countFields = [
  'points', 'fieldGoalAttempts', 'fieldGoalsMade', 'fieldGoalsMissed', 'threePointAttempts',
  'threePointersMade', 'threePointMisses', 'twoPointAttempts', 'twoPointMakes', 'twoPointMisses',
  'freeThrowAttempts', 'freeThrowsMade', 'freeThrowsMissed', 'rebounds',
  'offensiveRebounds', 'defensiveRebounds', 'assists', 'turnovers', 'steals', 'blocks',
  'personalFouls',
];

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function normalizedMinutes(players) {
  if (players.length < 5) throw new Error('A live game requires at least five players for each team.');
  const requested = players.map(player => Math.max(0,
    Number(player.projectedMinutes ?? player.minutes ?? 0)));
  if (requested.filter(minutes => minutes > 0).length < 5) {
    throw new Error('Each team needs at least five players with positive projected minutes.');
  }
  const result = Array(players.length).fill(0);
  let open = players.map((_, index) => index).filter(index => requested[index] > 0);
  let remaining = 240;
  while (open.length && remaining > 1e-8) {
    const weightSum = open.reduce((sum, index) => sum + requested[index], 0);
    const weightFor = index => weightSum > 0 ? requested[index] / weightSum : 1 / open.length;
    const capped = open.filter(index => remaining * weightFor(index) > 48);
    if (!capped.length) {
      for (const index of open) result[index] = remaining * weightFor(index);
      remaining = 0;
      break;
    }
    for (const index of capped) {
      result[index] = 48;
      remaining -= 48;
    }
    open = open.filter(index => !capped.includes(index));
  }
  return result;
}

function percentage(player, keys, fallback) {
  for (const key of keys) {
    if (!Number.isFinite(player[key])) continue;
    const raw = player[key] > 1 ? player[key] / 100 : player[key];
    return clamp(raw, 0, 1);
  }
  return fallback;
}

function firstRate(player, keys, fallback = 0) {
  for (const key of keys) if (Number.isFinite(player[key])) return Math.max(0, player[key]);
  return fallback;
}

function chooseWeighted(rows, weight, random, excludedRef = null) {
  const eligible = rows.filter(row => row.player.playerRef !== excludedRef && row.minutesTarget > 0);
  if (!eligible.length) return rows.find(row => row.player.playerRef !== excludedRef) ?? rows[0];
  const weights = eligible.map(row => Math.max(0, Number(weight(row)) || 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return eligible[Math.floor(random() * eligible.length)];
  let position = random() * total;
  for (let index = 0; index < eligible.length; index += 1) {
    position -= weights[index];
    if (position <= 0) return eligible[index];
  }
  return eligible[eligible.length - 1];
}

function playerRates(model, player, minutesTarget) {
  const rawPoints = firstRate(player, ['pointsPer36', 'priorPointsPer36'], 0);
  const pointsPer36 = predictPlayerScoringRate(model, player);
  const rate = (stat, fields, fallback = 0) => Math.max(0,
    predictPlayerBoxRate(model, player, stat) || firstRate(player, fields, fallback));
  const threesPer36 = rate('threePointersMade',
    ['threesPer36', 'threePointersMadePer36', 'priorThreesPer36']);
  const threesAttPer36 = firstRate(player,
    ['threePointAttemptsPer36', 'threePointersAttemptedPer36'], threesPer36 / 0.36);
  const fgaPer36 = firstRate(player,
    ['fieldGoalAttemptsPer36', 'fieldGoalsAttemptedPer36'],
    Math.max(threesAttPer36 + 1, (rawPoints || pointsPer36) / 1.2));
  const twoPointAttPer36 = firstRate(player,
    ['twoPointAttemptsPer36', 'twoPointFieldGoalAttemptsPer36'],
    Math.max(0, fgaPer36 - threesAttPer36));
  const ftAttPer36 = firstRate(player,
    ['freeThrowAttemptsPer36', 'freeThrowsAttemptedPer36'], Math.max(0, pointsPer36 * 0.18));
  const threePointPct = percentage(player,
    ['threePointPercentage', 'threePointPct', 'threePPercentage'],
    threesAttPer36 > 0 ? clamp(threesPer36 / threesAttPer36, 0.2, 0.5) : 0.36);
  const twoPointPct = percentage(player, ['twoPointPercentage', 'twoPointPct'], 0.52);
  const freeThrowPct = percentage(player,
    ['freeThrowPercentage', 'freeThrowPct'], 0.78);
  const reboundsPer36 = rate('rebounds', ['reboundsPer36', 'priorReboundsPer36']);
  const assistsPer36 = rate('assists', ['assistsPer36', 'priorAssistsPer36']);
  const turnoversPer36 = rate('turnovers', ['turnoversPer36', 'priorTurnoversPer36']);
  const stealsPer36 = rate('steals', ['stealsPer36', 'priorStealsPer36']);
  const blocksPer36 = rate('blocks', ['blocksPer36', 'priorBlocksPer36']);
  const offensiveReboundsPer36 = firstRate(player,
    ['offensiveReboundsPer36', 'priorOffensiveReboundsPer36'], reboundsPer36 * 0.23);
  const defensiveReboundsPer36 = firstRate(player,
    ['defensiveReboundsPer36', 'priorDefensiveReboundsPer36'], reboundsPer36 - offensiveReboundsPer36);
  const freeThrowsMadePer36 = firstRate(player,
    ['freeThrowsMadePer36', 'freeThrowsMadeRatePer36'], ftAttPer36 * freeThrowPct);
  return {
    player,
    minutesTarget,
    pointsPer36,
    fgaPer36,
    twoPointAttPer36,
    threesAttPer36,
    threesPer36,
    ftAttPer36,
    freeThrowsMadePer36,
    threePointPct,
    twoPointPct,
    freeThrowPct,
    reboundsPer36,
    assistsPer36,
    turnoversPer36,
    stealsPer36,
    blocksPer36,
    offensiveReboundsPer36,
    defensiveReboundsPer36,
  };
}

function emptyLine(player) {
  return { playerRef: player.playerRef ?? null, displayName: player.displayName ?? null,
    ...(player.seasonAgeStatus ? {
      age: player.age,
      ageStatus: player.seasonAgeStatus,
      ageReferenceDate: player.seasonAgeReferenceDate,
      ageSource: player.seasonAgeSource,
    } : {}),
    ...Object.fromEntries(countFields.map(field => [field, 0])), minutes: 0 };
}

function scoreOf(state) { return { home: state.teams.home.totals.points, away: state.teams.away.totals.points }; }

function clockText(secondsRemaining) {
  const seconds = Math.max(0, Math.ceil(secondsRemaining));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function snapshot(state) {
  const teamView = side => ({
    teamCode: state.teams[side].teamCode,
    stats: { ...state.teams[side].totals },
    players: [...state.teams[side].lines.values()].map(line => ({ ...line })),
  });
  return { score: scoreOf(state), home: teamView('home'), away: teamView('away') };
}

function weightedExpectedRate(rows, key) {
  const sum = rows.reduce((total, row) => total + row[key] * row.minutesTarget / 36, 0);
  return sum;
}

function prepareTeam(model, inputTeam, side) {
  const suppliedPlayers = Array.isArray(inputTeam.players) ? inputTeam.players : [];
  const players = suppliedPlayers.map((player, index) => ({
    ...player,
    playerRef: player.playerRef ?? player.displayName ?? `${side}-player-${index + 1}`,
  }));
  if (new Set(players.map(player => player.playerRef)).size !== players.length) {
    throw new Error(`${inputTeam.teamCode ?? side} contains duplicate player identities.`);
  }
  const minutes = normalizedMinutes(players);
  const roster = players.map((player, index) => playerRates(model, player, minutes[index]));
  const teamExpectedPoints = weightedExpectedRate(roster, 'pointsPer36');
  const fga = weightedExpectedRate(roster, 'fgaPer36');
  const fta = weightedExpectedRate(roster, 'ftAttPer36');
  const turnovers = weightedExpectedRate(roster, 'turnoversPer36');
  const steals = weightedExpectedRate(roster, 'stealsPer36');
  const blocks = weightedExpectedRate(roster, 'blocksPer36');
  const rebounds = weightedExpectedRate(roster, 'reboundsPer36');
  const offensiveRebounds = weightedExpectedRate(roster, 'offensiveReboundsPer36');
  const possessions = clamp(Number(inputTeam.pace) || 100, 80, 120);
  const threeAttempts = weightedExpectedRate(roster, 'threesAttPer36');
  const returnValue = {
    side,
    teamCode: inputTeam.teamCode ?? side.toUpperCase(),
    players,
    roster,
    actualMinutes: new Map(players.map(player => [player.playerRef, 0])),
    lines: new Map(players.map(player => [player.playerRef, emptyLine(player)])),
    totals: { ...Object.fromEntries(countFields.map(field => [field, 0])), minutes: 0 },
    expectedPoints: Number.isFinite(inputTeam.expectedPlayerPoints) ? inputTeam.expectedPlayerPoints : teamExpectedPoints,
    possessions,
    shotFoulChance: clamp(0.32 * (fta / Math.max(1, fga)), 0.04, 0.18),
    turnoverChance: clamp(turnovers / possessions, 0.055, 0.2),
    stealGivenTurnoverChance: clamp(steals / Math.max(1, turnovers), 0.2, 0.85),
    blockChance: clamp(blocks / possessions, 0.005, 0.14),
    offensiveReboundChance: clamp(Number(inputTeam.offensiveReboundPct) ||
      (rebounds > 0 ? offensiveRebounds / rebounds : 0.25), 0.12, 0.42),
    threeAttemptShare: clamp(threeAttempts / Math.max(1, fga), 0.12, 0.58),
  };
  return returnValue;
}

function selectLineup(team) {
  const available = team.roster.filter(row => row.minutesTarget > 0);
  const selected = [...available].sort((left, right) => {
    const leftGap = left.minutesTarget - team.actualMinutes.get(left.player.playerRef);
    const rightGap = right.minutesTarget - team.actualMinutes.get(right.player.playerRef);
    return rightGap / Math.max(1, right.minutesTarget) - leftGap / Math.max(1, left.minutesTarget);
  }).slice(0, 5);
  if (selected.length < 5) throw new Error(`${team.teamCode} has fewer than five active players.`);
  return selected;
}

function advancePossessionMinutes(state, lineups, elapsedSeconds) {
  const elapsed = clamp(Number(elapsedSeconds) || 0, 0, state.possessionSeconds);
  const deltaMinutes = Math.max(0, elapsed - state.possessionElapsed) / 60;
  if (!deltaMinutes) return;
  for (const side of ['home', 'away']) {
    for (const row of lineups[side]) {
      const playerRef = row.player.playerRef;
      state.teams[side].actualMinutes.set(playerRef,
        state.teams[side].actualMinutes.get(playerRef) + deltaMinutes);
      state.teams[side].lines.get(playerRef).minutes += deltaMinutes;
      state.teams[side].totals.minutes += deltaMinutes;
    }
  }
  state.possessionElapsed = elapsed;
}

function increment(state, side, playerRef, stat, amount = 1) {
  if (!amount) return;
  const team = state.teams[side];
  const line = team.lines.get(playerRef);
  if (!line) throw new Error(`Cannot assign ${stat} to unknown ${side} player ${playerRef}.`);
  line[stat] += amount;
  team.totals[stat] += amount;
  if (stat === 'points') state.score[side] += amount;
}

function* playPossession(state, offense, defense, lineups, context, random, targetMultiplier) {
  const { period, clockStart, possessionSeconds, possessionId } = context;
  const offenseLineup = lineups[offense];
  const defenseLineup = lineups[defense];
  const offsets = { possession_start: 0, turnover: 0.58, shot: 0.52, block: 0.58,
    assist: 0.67, foul: 0.59, rebound: 0.9 };
  const clockCursor = { elapsed: -0.05 };
  const emit = function* (type, payload, deltas = [], offsetKey = type) {
    for (const delta of deltas) increment(state, delta.side, delta.playerRef, delta.stat, delta.amount ?? 1);
    const offset = Number.isFinite(offsetKey) ? offsetKey : (offsets[offsetKey] ?? 0.9);
    const requestedElapsed = possessionSeconds * offset;
    const elapsed = clamp(Math.max(clockCursor.elapsed + 0.05, requestedElapsed), 0, possessionSeconds);
    clockCursor.elapsed = elapsed;
    advancePossessionMinutes(state, lineups, elapsed);
    const eventId = state.nextEventId++;
    const event = {
      eventId, possessionId, period,
      clock: clockText(clockStart - elapsed), offenseTeam: state.teams[offense].teamCode,
      defenseTeam: state.teams[defense].teamCode, type, ...payload,
      score: scoreOf(state), boxScore: snapshot(state),
    };
    state.eventIndex.set(eventId, { type, ...payload });
    state.events.push(event);
    if (type === 'block') state.blockedShotLinks.push(payload.missedFieldGoalEventId);
    if (type === 'steal') state.stealLinks.push(payload.turnoverEventId);
    if (type === 'rebound' && payload.missedFieldGoalEventId) {
      state.reboundLinks.push(payload.missedFieldGoalEventId);
    }
    yield event;
  };
  // Minutes are tracked independently because a team has five active players during every turn.
  yield* emit('possession_start', {
    offenseLineup: offenseLineup.map(row => row.player.playerRef),
    defenseLineup: defenseLineup.map(row => row.player.playerRef),
  }, [], 'possession_start');

  if (random() < state.teams[offense].turnoverChance) {
    const handler = chooseWeighted(offenseLineup, row => row.turnoversPer36 + row.assistsPer36 * 0.08, random);
    const stolen = random() < state.teams[defense].stealGivenTurnoverChance;
    const turnoverEventId = state.nextEventId;
    yield* emit('turnover', { actorPlayerRef: handler.player.playerRef,
      result: stolen ? 'stolen' : 'lost_ball' },
    [{ side: offense, playerRef: handler.player.playerRef, stat: 'turnovers' }], 'turnover');
    if (stolen) {
      const stealer = chooseWeighted(defenseLineup, row => row.stealsPer36 +
        Math.max(0, Number(row.player.defenseRating ?? 50) - 50) * 0.015, random);
      yield* emit('steal', { actorPlayerRef: stealer.player.playerRef,
        relatedPlayerRef: handler.player.playerRef, turnoverEventId },
      [{ side: defense, playerRef: stealer.player.playerRef, stat: 'steals' }], 'turnover');
    }
    return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shotClockOffset = 0.34 + attempt * 0.14;
    const shooter = chooseWeighted(offenseLineup,
      row => Math.max(0.1, row.fgaPer36 + row.pointsPer36 * 0.15), random);
    const shotType = random() < shooter.threeAttemptShare ? 'three' : 'two';
    const defender = chooseWeighted(defenseLineup, row => row.blocksPer36 +
      Math.max(0, Number(row.player.defenseRating ?? 50) - 50) * 0.015 + 0.1, random);
    const isFoul = random() < state.teams[defense].shotFoulChance;
    const isBlocked = !isFoul && random() < state.teams[defense].blockChance *
      clamp(0.6 + defender.blocksPer36 / 5, 0.65, 1.6);
    const baseMake = shotType === 'three' ? shooter.threePointPct : shooter.twoPointPct;
    const shootingAdjustment = (Number(shooter.player.shootingRating ?? 50) - 50) * 0.0012;
    const defenseAdjustment = (Number(defender.player.defenseRating ?? 50) - 50) * 0.0008;
    const environmentAdjustment = (targetMultiplier - 1) * 0.24;
    const makeChance = clamp(baseMake + shootingAdjustment - defenseAdjustment + environmentAdjustment,
      shotType === 'three' ? 0.18 : 0.32, shotType === 'three' ? 0.53 : 0.75);
    const made = !isBlocked && random() < makeChance;
    const result = isBlocked ? 'blocked' : isFoul ? (made ? 'made_and_fouled' : 'shooting_foul') : made ? 'made' : 'missed';
    const shotDeltas = [{ side: offense, playerRef: shooter.player.playerRef, stat: 'fieldGoalAttempts' }];
    shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef,
      stat: shotType === 'three' ? 'threePointAttempts' : 'twoPointAttempts' });
    if (!made) {
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'fieldGoalsMissed' });
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef,
        stat: shotType === 'three' ? 'threePointMisses' : 'twoPointMisses' });
    }
    const points = made ? (shotType === 'three' ? 3 : 2) : 0;
    const shotEventId = state.nextEventId;
    if (made) {
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'fieldGoalsMade' });
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef,
        stat: shotType === 'three' ? 'threePointersMade' : 'twoPointMakes' });
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'points', amount: points });
    }
    yield* emit('field_goal_attempt', {
      actorPlayerRef: shooter.player.playerRef,
      shotType: shotType === 'three' ? '3PT' : '2PT',
      shotResult: result, points, blockedByPlayerRef: isBlocked ? defender.player.playerRef : null,
    }, shotDeltas, shotClockOffset);
    if (isBlocked) {
      yield* emit('block', { actorPlayerRef: defender.player.playerRef,
        relatedPlayerRef: shooter.player.playerRef, missedFieldGoalEventId: shotEventId },
      [{ side: defense, playerRef: defender.player.playerRef, stat: 'blocks' }], shotClockOffset + 0.05);
    }
    if (isFoul) {
      yield* emit('shooting_foul', { actorPlayerRef: defender.player.playerRef,
        relatedPlayerRef: shooter.player.playerRef, shotsAwarded: made ? 1 : shotType === 'three' ? 3 : 2 },
      [{ side: defense, playerRef: defender.player.playerRef, stat: 'personalFouls' }], shotClockOffset + 0.08);
      const attempts = made ? 1 : shotType === 'three' ? 3 : 2;
      if (made) {
        const teammates = offenseLineup.filter(row => row.player.playerRef !== shooter.player.playerRef);
        if (teammates.length && random() < 0.64) {
          const assister = chooseWeighted(teammates, row => row.assistsPer36, random);
          yield* emit('assist', { actorPlayerRef: assister.player.playerRef,
            relatedPlayerRef: shooter.player.playerRef, fieldGoalEventId: shotEventId },
          [{ side: offense, playerRef: assister.player.playerRef, stat: 'assists' }], shotClockOffset + 0.12);
        }
      }
      const freeThrowResult = yield* takeFreeThrows(state, offense, defense, shooter, offenseLineup,
        defenseLineup, attempts,
        period, clockStart, possessionSeconds, possessionId, clockCursor, random);
      if (freeThrowResult.offensiveRebound && attempt < 3) continue;
      return;
    }
    if (made) {
      const teammates = offenseLineup.filter(row => row.player.playerRef !== shooter.player.playerRef);
      if (teammates.length && random() < 0.64) {
        const assister = chooseWeighted(teammates, row => row.assistsPer36, random);
      yield* emit('assist', { actorPlayerRef: assister.player.playerRef,
        relatedPlayerRef: shooter.player.playerRef, fieldGoalEventId: shotEventId },
      [{ side: offense, playerRef: assister.player.playerRef, stat: 'assists' }], shotClockOffset + 0.12);
      }
      return;
    }
    const offensiveRebound = random() < state.teams[offense].offensiveReboundChance;
    const rebounder = offensiveRebound
      ? chooseWeighted(offenseLineup, row => row.offensiveReboundsPer36 +
        Math.max(0, Number(row.player.reboundingRating ?? 50) - 50) * 0.015, random)
      : chooseWeighted(defenseLineup, row => row.defensiveReboundsPer36 +
        Math.max(0, Number(row.player.reboundingRating ?? 50) - 50) * 0.015, random);
    yield* emit('rebound', { actorPlayerRef: rebounder.player.playerRef,
      reboundType: offensiveRebound ? 'offensive' : 'defensive',
      missedFieldGoalEventId: shotEventId },
    [
      { side: offensiveRebound ? offense : defense, playerRef: rebounder.player.playerRef, stat: 'rebounds' },
      { side: offensiveRebound ? offense : defense, playerRef: rebounder.player.playerRef,
        stat: offensiveRebound ? 'offensiveRebounds' : 'defensiveRebounds' },
    ], shotClockOffset + 0.18);
    if (!offensiveRebound || attempt === 3) return;
  }
}

function* takeFreeThrows(state, offense, defense, shooter, offenseLineup, defenseLineup, attempts,
  period, clockStart, possessionSeconds, possessionId, clockCursor, random) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const made = random() < shooter.freeThrowPct;
    const freeThrowEventId = state.nextEventId;
    const deltas = [{ side: offense, playerRef: shooter.player.playerRef, stat: 'freeThrowAttempts' }];
    if (made) {
      deltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'freeThrowsMade' });
      deltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'points' });
    } else {
      deltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'freeThrowsMissed' });
    }
    const requestedElapsed = possessionSeconds * (0.68 + 0.08 * attempt / attempts);
    const elapsed = clamp(Math.max(clockCursor.elapsed + 0.05, requestedElapsed), 0, possessionSeconds);
    clockCursor.elapsed = elapsed;
    advancePossessionMinutes(state, state.currentLineups, elapsed);
    for (const delta of deltas) increment(state, delta.side, delta.playerRef, delta.stat, delta.amount ?? 1);
    const event = {
      eventId: state.nextEventId++, possessionId, period,
      clock: clockText(clockStart - elapsed), offenseTeam: state.teams[offense].teamCode,
      defenseTeam: state.teams[defense].teamCode, type: 'free_throw',
      actorPlayerRef: shooter.player.playerRef, attempt, attempts,
      result: made ? 'made' : 'missed', points: made ? 1 : 0,
      score: scoreOf(state), boxScore: snapshot(state),
    };
    state.eventIndex.set(event.eventId, { type: event.type, attempt, attempts, result: event.result });
    state.events.push(event);
    yield event;
    if (attempt === attempts && !made) {
      const offensiveRebound = random() < state.teams[offense].offensiveReboundChance;
      const reboundSide = offensiveRebound ? offense : defense;
      const reboundLineup = offensiveRebound ? offenseLineup : defenseLineup;
      const rebounder = chooseWeighted(reboundLineup,
        row => offensiveRebound ? row.offensiveReboundsPer36 : row.defensiveReboundsPer36, random);
      increment(state, reboundSide, rebounder.player.playerRef, 'rebounds');
      increment(state, reboundSide, rebounder.player.playerRef,
        offensiveRebound ? 'offensiveRebounds' : 'defensiveRebounds');
      const reboundElapsed = clamp(Math.max(clockCursor.elapsed + 0.05, possessionSeconds * 0.96),
        0, possessionSeconds);
      clockCursor.elapsed = reboundElapsed;
      advancePossessionMinutes(state, state.currentLineups, reboundElapsed);
      const reboundEvent = {
        eventId: state.nextEventId++, possessionId, period,
        clock: clockText(clockStart - reboundElapsed),
        offenseTeam: state.teams[offense].teamCode, defenseTeam: state.teams[defense].teamCode,
        type: 'rebound', actorPlayerRef: rebounder.player.playerRef,
        reboundType: offensiveRebound ? 'offensive' : 'defensive',
        missedFreeThrowEventId: freeThrowEventId,
        score: scoreOf(state), boxScore: snapshot(state),
      };
      state.eventIndex.set(reboundEvent.eventId, { type: reboundEvent.type,
        missedFreeThrowEventId: freeThrowEventId, reboundType: reboundEvent.reboundType });
      state.events.push(reboundEvent);
      state.reboundLinks.push(freeThrowEventId);
      yield reboundEvent;
      return { offensiveRebound };
    }
  }
  return { offensiveRebound: false };
}

function finalSummary(state, prediction, options) {
  const verifyTeam = side => {
    const team = state.teams[side];
    const playerTotals = Object.fromEntries(countFields.map(field => [field, 0]));
    let playerMinutes = 0;
    for (const line of team.lines.values()) {
      for (const field of countFields) playerTotals[field] += line[field];
      playerMinutes += line.minutes;
      if (line.fieldGoalAttempts !== line.fieldGoalsMade + line.fieldGoalsMissed ||
          line.fieldGoalAttempts !== line.threePointAttempts + line.twoPointAttempts ||
          line.fieldGoalsMade !== line.threePointersMade + line.twoPointMakes ||
          line.threePointAttempts !== line.threePointersMade + line.threePointMisses ||
          line.twoPointAttempts !== line.twoPointMakes + line.twoPointMisses ||
          line.freeThrowAttempts !== line.freeThrowsMade + line.freeThrowsMissed ||
          line.rebounds !== line.offensiveRebounds + line.defensiveRebounds ||
          line.points !== 3 * line.threePointersMade + 2 * line.twoPointMakes + line.freeThrowsMade) {
        throw new Error(`Player box-score identity failed for ${side}/${line.playerRef}: ${JSON.stringify({
          points: line.points, threes: line.threePointersMade, twos: line.twoPointMakes,
          ftm: line.freeThrowsMade, fga: line.fieldGoalAttempts, fgm: line.fieldGoalsMade,
          fgmMissed: line.fieldGoalsMissed, threePa: line.threePointAttempts,
          threePmMissed: line.threePointMisses, twoPa: line.twoPointAttempts,
          twoPmMissed: line.twoPointMisses, fta: line.freeThrowAttempts,
          ftmMissed: line.freeThrowsMissed, rebounds: line.rebounds,
          oreb: line.offensiveRebounds, dreb: line.defensiveRebounds, assists: line.assists,
        })}`);
      }
    }
    for (const field of countFields) {
      if (playerTotals[field] !== team.totals[field]) {
        throw new Error(`Team/player ${field} totals do not reconcile for ${side}.`);
      }
    }
    if (Math.abs(playerMinutes - team.totals.minutes) > 1e-7 ||
        Math.abs(team.totals.minutes - 240 - 25 * state.overtimePeriods) > 1e-7) {
      throw new Error(`Team/player minutes do not reconcile for ${side}.`);
    }
    if (team.totals.fieldGoalAttempts !== team.totals.fieldGoalsMade + team.totals.fieldGoalsMissed ||
        team.totals.points !== state.score[side] || team.totals.assists > team.totals.fieldGoalsMade) {
      throw new Error(`Team box-score identity failed for ${side}.`);
    }
  };
  verifyTeam('home');
  verifyTeam('away');
  if (state.teams.home.totals.steals > state.teams.away.totals.turnovers ||
      state.teams.away.totals.steals > state.teams.home.totals.turnovers) {
    throw new Error('A steal must correspond to an opposing-team turnover.');
  }
  if (state.teams.home.totals.blocks > state.teams.away.totals.fieldGoalsMissed ||
      state.teams.away.totals.blocks > state.teams.home.totals.fieldGoalsMissed) {
    throw new Error('A block must correspond to a missed opponent field goal.');
  }
  for (const shotId of state.blockedShotLinks) {
    if (state.eventIndex.get(shotId)?.type !== 'field_goal_attempt' ||
        state.eventIndex.get(shotId)?.shotResult !== 'blocked') {
      throw new Error(`Block event does not link to a blocked, missed field goal (${shotId}).`);
    }
  }
  for (const turnoverId of state.stealLinks) {
    if (state.eventIndex.get(turnoverId)?.type !== 'turnover' ||
        state.eventIndex.get(turnoverId)?.result !== 'stolen') {
      throw new Error(`Steal event does not link to an opposing turnover (${turnoverId}).`);
    }
  }
  for (const missedEventId of state.reboundLinks) {
    const missed = state.eventIndex.get(missedEventId);
    if (!missed || !((missed.type === 'field_goal_attempt' &&
        ['blocked', 'missed'].includes(missed.shotResult)) ||
        (missed.type === 'free_throw' && missed.result === 'missed'))) {
      throw new Error(`Rebound event does not link to a missed shot or free throw (${missedEventId}).`);
    }
  }
  const homeScore = state.teams.home.totals.points;
  const awayScore = state.teams.away.totals.points;
  return {
    modelId: state.modelId,
    modelVersion: state.modelVersion,
    status: state.status,
    score: { home: homeScore, away: awayScore },
    winner: homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'tied',
    pregamePrediction: prediction,
    homeTeamStats: { ...state.teams.home.totals },
    awayTeamStats: { ...state.teams.away.totals },
    homePlayerBoxes: [...state.teams.home.lines.values()].map(line => ({ ...line })),
    awayPlayerBoxes: [...state.teams.away.lines.values()].map(line => ({ ...line })),
    possessionsPerTeam: { home: state.possessions.home, away: state.possessions.away },
    overtimePeriods: state.overtimePeriods,
    boxScoreConsistency: 'verified-exact-player-to-team-totals-and-event-identities',
    streamMode: options.streamMode ?? 'precomputed-events',
    disclosure: 'Event sequence is generated by this simulator from prior performance, player ratings, matchups, and team prediction context. It is a simulated play-by-play, not an observed NBA play record.',
  };
}

function* liveEvents(model, input, options = {}) {
  const random = seededRandom(options.seed ?? 1);
  const preparedInput = resolveGameInputSeasonAges(input, model);
  const prediction = predictGame(model, preparedInput);
  const state = {
    modelId: model.modelId, modelVersion: model.version, status: model.status,
    nextEventId: 1, score: { home: 0, away: 0 },
    teams: {
      home: prepareTeam(model, preparedInput.home ?? {}, 'home'),
      away: prepareTeam(model, preparedInput.away ?? {}, 'away'),
    },
    possessions: { home: 0, away: 0 }, overtimePeriods: 0,
    eventIndex: new Map(), events: [], blockedShotLinks: [], reboundLinks: [], stealLinks: [],
  };
  const targetPoints = {
    home: Math.max(1, prediction.expectedHomePoints),
    away: Math.max(1, prediction.expectedAwayPoints),
  };
  const multipliers = {
    home: clamp(targetPoints.home / 110, 0.86, 1.14),
    away: clamp(targetPoints.away / 110, 0.86, 1.14),
  };
  const maxOT = clamp(Math.floor(options.maxOvertimePeriods ?? 8), 1, 12);
  const regulationPace = clamp(Math.round((state.teams.home.possessions + state.teams.away.possessions) / 2), 80, 120);
  const periodLengths = [720, 720, 720, 720];
  let nextOffense = 'home';
  let possessionId = 1;

  const runPeriod = function* (periodNumber, periodSeconds, possessionsPerTeam) {
    const safePossessions = Math.max(1, Math.floor(possessionsPerTeam));
    const totalTurns = safePossessions * 2;
    const secondsPerTurn = periodSeconds / totalTurns;
    let secondsPlayed = 0;
    for (let turn = 0; turn < totalTurns; turn += 1) {
      const offense = nextOffense;
      const defense = offense === 'home' ? 'away' : 'home';
      nextOffense = defense;
      const lineups = {
        home: selectLineup(state.teams.home),
        away: selectLineup(state.teams.away),
      };
      state.currentLineups = lineups;
      state.possessionSeconds = secondsPerTurn;
      state.possessionElapsed = 0;
      state.possessions[offense] += 1;
      const clockStart = periodSeconds - secondsPlayed;
      yield* playPossession(state, offense, defense, lineups, {
        period: periodNumber <= 4 ? `Q${periodNumber}` : `OT${periodNumber - 4}`,
        clockStart, possessionSeconds: secondsPerTurn, possessionId,
      }, random, multipliers[offense]);
      advancePossessionMinutes(state, lineups, secondsPerTurn);
      const period = periodNumber <= 4 ? `Q${periodNumber}` : `OT${periodNumber - 4}`;
      const endEvent = {
        eventId: state.nextEventId++, possessionId, period,
        clock: clockText(clockStart - secondsPerTurn),
        offenseTeam: state.teams[offense].teamCode, defenseTeam: state.teams[defense].teamCode,
        type: 'possession_end', score: scoreOf(state), boxScore: snapshot(state),
      };
      state.eventIndex.set(endEvent.eventId, { type: endEvent.type });
      state.events.push(endEvent);
      yield endEvent;
      secondsPlayed += secondsPerTurn;
      possessionId += 1;
    }
    const endEvent = {
      eventId: state.nextEventId++, possessionId: null,
      period: periodNumber <= 4 ? `Q${periodNumber}` : `OT${periodNumber - 4}`,
      clock: '0:00', offenseTeam: null, defenseTeam: null, type: 'period_end',
      score: scoreOf(state), boxScore: snapshot(state),
    };
    state.eventIndex.set(endEvent.eventId, { type: endEvent.type });
    state.events.push(endEvent);
    yield endEvent;
  };

  for (let index = 0; index < periodLengths.length; index += 1) {
    const base = Math.floor(regulationPace / 4);
    const extra = index < regulationPace % 4 ? 1 : 0;
    yield* runPeriod(index + 1, periodLengths[index], base + extra);
  }
  let overtime = 0;
  while (state.score.home === state.score.away && overtime < maxOT) {
    overtime += 1;
    state.overtimePeriods = overtime;
    const otPossessions = Math.max(4, Math.round(regulationPace * 5 / 48));
    yield* runPeriod(4 + overtime, 300, otPossessions);
  }
  if (state.score.home === state.score.away) {
    throw new Error(`The live simulator remained tied after ${maxOT} overtime periods.`);
  }
  const summary = finalSummary(state, prediction, options);
  const endEvent = {
    eventId: state.nextEventId++, possessionId: null, period: 'FINAL', clock: '0:00',
    offenseTeam: null, defenseTeam: null, type: 'game_end', score: scoreOf(state),
    boxScore: snapshot(state), summary,
  };
  state.eventIndex.set(endEvent.eventId, { type: endEvent.type });
  state.events.push(endEvent);
  yield endEvent;
  return summary;
}

export function* simulateGameLiveEvents(model, input, options = {}) {
  yield* liveEvents(model, input, options);
}

export async function* streamGameLive(model, input, options = {}) {
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 0));
  const iterator = liveEvents(model, input, { ...options, streamMode: 'incremental-event-stream' });
  for (;;) {
    const step = iterator.next();
    if (step.done) return step.value;
    yield step.value;
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

export function simulateGameLive(model, input, options = {}) {
  const iterator = liveEvents(model, input, options);
  const events = [];
  for (;;) {
    const step = iterator.next();
    if (step.done) return { ...step.value, events };
    events.push(step.value);
  }
}
