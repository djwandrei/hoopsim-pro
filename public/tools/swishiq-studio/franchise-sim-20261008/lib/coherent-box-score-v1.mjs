function seededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function number(player, fields, fallback = 0) {
  for (const field of fields) {
    const value = Number(player?.[field]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return fallback;
}

function allocate(total, players, weights, { lower = null, upper = null, random = Math.random } = {}) {
  const count = Math.max(0, Math.round(Number(total) || 0));
  if (!players.length) {
    if (count) throw new Error('Cannot allocate a positive team statistic to an empty rotation.');
    return [];
  }
  const minima = lower?.length === players.length ? lower.map(value => Math.max(0, Math.round(value))) : players.map(() => 0);
  const maxima = upper?.length === players.length ? upper.map(value => Math.max(0, Math.round(value))) : players.map(() => Infinity);
  if (minima.reduce((sum, value) => sum + value, 0) > count) throw new Error('Allocation total is smaller than its required player-level minimums.');
  const results = [...minima];
  const safeWeights = players.map((_, index) => Math.max(0, Number(weights[index]) || 0));
  let left = count - results.reduce((sum, value) => sum + value, 0);
  let guard = 0;
  while (left > 0) {
    const open = players.map((_, index) => index).filter(index => results[index] < maxima[index]);
    if (!open.length) throw new Error('Allocation exceeds all player-level caps.');
    const weightSum = open.reduce((sum, index) => sum + safeWeights[index], 0);
    let selected;
    if (weightSum <= 0) selected = open[Math.floor(random() * open.length)];
    else {
      let pick = random() * weightSum;
      selected = open.at(-1);
      for (const index of open) { pick -= safeWeights[index]; if (pick <= 0) { selected = index; break; } }
    }
    results[selected] += 1;
    left -= 1;
    guard += 1;
    if (guard > count + players.length + 10) throw new Error('Allocation did not converge.');
  }
  return results;
}

function normalizedMinutes(players) {
  if (players.length < 5) throw new Error('A coherent NBA box score requires at least five players per team.');
  const raw = players.map(player => Math.max(0, number(player, ['projectedMinutes', 'minutes'], 0)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const weights = raw.map(value => total ? value / total : 1 / players.length);
  const result = Array(players.length).fill(0);
  let open = players.map((_, index) => index);
  let remaining = 240;
  while (open.length && remaining > 0) {
    const weightSum = open.reduce((sum, index) => sum + weights[index], 0);
    const capped = open.filter(index => remaining * (weightSum ? weights[index] / weightSum : 1 / open.length) > 48);
    if (!capped.length) {
      const exact = open.map(index => ({ index, minutes: remaining * (weightSum ? weights[index] / weightSum : 1 / open.length) }));
      for (const item of exact) result[item.index] = item.minutes;
      remaining = 0;
      break;
    }
    for (const index of capped) { result[index] = 48; remaining -= 48; }
    open = open.filter(index => !capped.includes(index));
  }
  if (remaining > 1e-8) throw new Error('Roster does not have enough player capacity to allocate 240 minutes.');
  const integer = result.map(Math.floor);
  let left = 240 - integer.reduce((sum, value) => sum + value, 0);
  result.map((value, index) => ({ index, fraction: value - integer[index] }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (left > 0 && integer[index] < 48) { integer[index] += 1; left -= 1; } });
  return integer;
}

function expectedPlayerCounts(players, minutes, fields) {
  return players.map((player, index) => number(player, fields, 0) * minutes[index] / 36);
}

function chooseScoringComposition(targetPoints, expected) {
  const score = Math.max(0, Math.round(Number(targetPoints) || 0));
  const maxThree = Math.floor(score / 3);
  const expectedThree = expected.threeMade;
  const expectedFree = expected.freeMade;
  const expectedTwo = expected.twoMade;
  let best = null;
  for (let threes = 0; threes <= maxThree; threes += 1) {
    const remaining = score - 3 * threes;
    for (let freeThrows = remaining % 2; freeThrows <= remaining; freeThrows += 2) {
      const twos = (remaining - freeThrows) / 2;
      const cost = ((threes - expectedThree) ** 2 / (expectedThree + 1)) +
        ((freeThrows - expectedFree) ** 2 / (expectedFree + 1)) +
        ((twos - expectedTwo) ** 2 / (expectedTwo + 1));
      if (!best || cost < best.cost) best = { threes, freeThrows, twos, cost };
    }
  }
  return best ?? { threes: 0, freeThrows: score, twos: 0, cost: 0 };
}

function teamShotPlan(team, targetPoints, random) {
  const players = team.players ?? [];
  if (!players.length && targetPoints > 0) throw new Error(`${team.teamCode ?? 'Team'} requires players to allocate a positive score.`);
  const minutes = normalizedMinutes(players);
  const expectedThreeAtt = expectedPlayerCounts(players, minutes, ['threePointAttemptsPer36', 'threesAttPer36']);
  const expectedFga = expectedPlayerCounts(players, minutes, ['fieldGoalAttemptsPer36', 'fgaPer36']);
  const expectedFtAtt = expectedPlayerCounts(players, minutes, ['freeThrowAttemptsPer36', 'ftaPer36']);
  const expectedThreeMade = expectedThreeAtt.reduce((sum, value, index) => sum + value * number(players[index], ['threePointPct', 'threePointPercentage'], 0.36), 0);
  const expectedFtMade = expectedFtAtt.reduce((sum, value, index) => sum + value * number(players[index], ['freeThrowPct', 'freeThrowPercentage'], 0.77), 0);
  const expectedTwoMade = Math.max(0, (targetPoints - 3 * expectedThreeMade - expectedFtMade) / 2);
  const composition = chooseScoringComposition(targetPoints, { threeMade: expectedThreeMade, freeMade: expectedFtMade, twoMade: expectedTwoMade });
  const fg3aTotal = Math.max(composition.threes, Math.round(expectedThreeAtt.reduce((sum, value) => sum + value, 0)));
  const expectedTwoAtt = Math.max(composition.twos, Math.round(expectedFga.reduce((sum, value) => sum + value, 0) - expectedThreeAtt.reduce((sum, value) => sum + value, 0)));
  const ftaTotal = Math.max(composition.freeThrows, Math.round(expectedFtAtt.reduce((sum, value) => sum + value, 0)));
  const fg3a = allocate(fg3aTotal, players, expectedThreeAtt.map((value, index) => value + number(players[index], ['threesPer36', 'threePointersMadePer36'], 0.1)), { lower: allocate(composition.threes, players, expectedThreeAtt.map((value, index) => value * number(players[index], ['threePointPct', 'threePointPercentage'], 0.36) + 0.01), { random }), random });
  const fg3m = allocate(composition.threes, players, fg3a.map((value, index) => value * number(players[index], ['threePointPct', 'threePointPercentage'], 0.36) + 0.01), { upper: fg3a, random });
  const fga2 = allocate(expectedTwoAtt, players, expectedFga.map((value, index) => Math.max(0.1, value - expectedThreeAtt[index])), { lower: allocate(composition.twos, players, expectedFga.map((value, index) => Math.max(0.1, value - expectedThreeAtt[index])), { random }), random });
  const fg2m = allocate(composition.twos, players, fga2.map((value, index) => value * number(players[index], ['twoPointPct', 'twoPointPercentage'], 0.52) + 0.01), { upper: fga2, random });
  const fta = allocate(ftaTotal, players, expectedFtAtt.map((value, index) => value + number(players[index], ['freeThrowsMadePer36'], 0.1)), { lower: allocate(composition.freeThrows, players, expectedFtAtt.map((value, index) => value * number(players[index], ['freeThrowPct', 'freeThrowPercentage'], 0.77) + 0.01), { random }), random });
  const ftm = allocate(composition.freeThrows, players, fta.map((value, index) => value * number(players[index], ['freeThrowPct', 'freeThrowPercentage'], 0.77) + 0.01), { upper: fta, random });
  return {
    teamCode: team.teamCode ?? null,
    players,
    minutes,
    fg2m,
    fg2a: fga2,
    fg3m,
    fg3a,
    ftm,
    fta,
    points: fg2m.map((value, index) => value * 2 + fg3m[index] * 3 + ftm[index]),
    pointsTarget: Math.round(targetPoints),
    possessions: Math.max(1, Math.round(Number(team.possessions) || 100)),
    shotMisses: fga2.reduce((sum, value) => sum + value, 0) - composition.twos + fg3a.reduce((sum, value) => sum + value, 0) - composition.threes + fta.reduce((sum, value) => sum + value, 0) - composition.freeThrows,
    expected: { fg3a: fg3aTotal, fg2a: expectedTwoAtt, fta: ftaTotal, scoringComposition: composition },
  };
}

function allocateBoundedRate(total, players, rateFields, minutes, upper, random) {
  const weights = expectedPlayerCounts(players, minutes, rateFields).map(value => Math.max(0.01, value));
  return allocate(total, players, weights, { upper, random });
}

function finalizeTeamBox(plan, opponentPlan, random, reboundTarget) {
  const { players, minutes } = plan;
  const teamMisses = plan.shotMisses + opponentPlan.shotMisses;
  const reboundRates = expectedPlayerCounts(players, minutes, ['reboundsPer36', 'rebPer36']);
  const expectedRebounds = Math.round(reboundRates.reduce((sum, value) => sum + value, 0));
  const teamRebounds = Math.min(teamMisses, Number.isFinite(reboundTarget) ? reboundTarget : expectedRebounds);
  const offensiveRebounds = Math.min(teamRebounds, Math.round(teamRebounds * 0.25));
  const offensiveBoards = allocateBoundedRate(offensiveRebounds, players, ['offensiveReboundsPer36', 'orbPer36', 'reboundsPer36'], minutes, null, random);
  const defensiveBoards = allocateBoundedRate(teamRebounds - offensiveRebounds, players, ['defensiveReboundsPer36', 'drbPer36', 'reboundsPer36'], minutes, null, random);
  const turnoversExpected = expectedPlayerCounts(players, minutes, ['turnoversPer36', 'tovPer36']).reduce((sum, value) => sum + value, 0);
  const turnovers = Math.min(plan.possessions, Math.max(0, Math.round(turnoversExpected)));
  const playerTurnovers = allocateBoundedRate(turnovers, players, ['turnoversPer36', 'tovPer36'], minutes, null, random);
  const steals = Math.min(turnovers, Math.round(expectedPlayerCounts(opponentPlan.players, opponentPlan.minutes, ['stealsPer36', 'stlPer36']).reduce((sum, value) => sum + value, 0)));
  const opponentBlocksAgainst = Math.min(plan.shotMisses, Math.round(expectedPlayerCounts(opponentPlan.players, opponentPlan.minutes, ['blocksPer36', 'blkPer36']).reduce((sum, value) => sum + value, 0)));
  const playerSteals = allocateBoundedRate(steals, players, ['stealsPer36', 'stlPer36'], minutes, null, random);
  const ownBlocks = Math.min(opponentPlan.shotMisses, Math.round(expectedPlayerCounts(players, minutes, ['blocksPer36', 'blkPer36']).reduce((sum, value) => sum + value, 0)));
  const playerBlocks = allocateBoundedRate(ownBlocks, players, ['blocksPer36', 'blkPer36'], minutes, null, random);
  const madeFieldGoals = plan.fg2m.map((value, index) => value + plan.fg3m[index]);
  const totalMadeFieldGoals = madeFieldGoals.reduce((sum, value) => sum + value, 0);
  const assists = players.length < 2 ? 0 : Math.min(totalMadeFieldGoals, Math.round(expectedPlayerCounts(players, minutes, ['assistsPer36', 'astPer36']).reduce((sum, value) => sum + value, 0)));
  const assistedBounds = madeFieldGoals.map((value, index) => Math.max(0, totalMadeFieldGoals - value));
  const playerAssists = allocateBoundedRate(assists, players, ['assistsPer36', 'astPer36'], minutes, assistedBounds, random);
  const personalFouls = allocate(Math.max(0, Math.round(Number(plan.foulTotal) || 18)), players, minutes, { random });
  return players.map((player, index) => ({
    canonicalName: player.canonicalName ?? player.name ?? null,
    minutes: minutes[index],
    points: plan.points[index],
    fieldGoalsMade: madeFieldGoals[index],
    fieldGoalsAttempted: plan.fg2a[index] + plan.fg3a[index],
    twoPointersMade: plan.fg2m[index],
    twoPointersAttempted: plan.fg2a[index],
    threePointersMade: plan.fg3m[index],
    threePointersAttempted: plan.fg3a[index],
    freeThrowsMade: plan.ftm[index],
    freeThrowsAttempted: plan.fta[index],
    rebounds: offensiveBoards[index] + defensiveBoards[index],
    offensiveRebounds: offensiveBoards[index],
    defensiveRebounds: defensiveBoards[index],
    assists: playerAssists[index],
    turnovers: playerTurnovers[index],
    steals: playerSteals[index],
    blocks: playerBlocks[index],
    personalFouls: personalFouls[index],
  }));
}

function aggregate(box) {
  const fields = ['points', 'fieldGoalsMade', 'fieldGoalsAttempted', 'twoPointersMade', 'twoPointersAttempted', 'threePointersMade', 'threePointersAttempted', 'freeThrowsMade', 'freeThrowsAttempted', 'rebounds', 'offensiveRebounds', 'defensiveRebounds', 'assists', 'turnovers', 'steals', 'blocks', 'personalFouls', 'minutes'];
  return Object.fromEntries(fields.map(field => [field, box.reduce((sum, player) => sum + player[field], 0)]));
}

/** Joint two-team box-score generator; shot makes create points, misses bound rebounds/blocks. */
export function simulateCoherentGameBox({ homeTeam, awayTeam, homeScore, awayScore, seed = 1 } = {}) {
  if (!homeTeam || !awayTeam || !Number.isFinite(Number(homeScore)) || !Number.isFinite(Number(awayScore))) {
    throw new Error('Coherent box score requires two teams and target scores.');
  }
  const random = seededRandom(seed);
  const homePlan = teamShotPlan(homeTeam, homeScore, random);
  const awayPlan = teamShotPlan(awayTeam, awayScore, random);
  const totalMisses = homePlan.shotMisses + awayPlan.shotMisses;
  const expectedBoards = plan => expectedPlayerCounts(plan.players, plan.minutes, ['reboundsPer36', 'rebPer36']).reduce((sum, value) => sum + value, 0);
  const homeExpectedBoards = expectedBoards(homePlan);
  const awayExpectedBoards = expectedBoards(awayPlan);
  const totalBoards = Math.min(totalMisses, Math.round(homeExpectedBoards + awayExpectedBoards));
  const homeReboundTarget = homeExpectedBoards + awayExpectedBoards > 0
    ? Math.round(totalBoards * homeExpectedBoards / (homeExpectedBoards + awayExpectedBoards))
    : Math.floor(totalBoards / 2);
  const awayReboundTarget = totalBoards - homeReboundTarget;
  const homeBox = finalizeTeamBox(homePlan, awayPlan, random, homeReboundTarget);
  const awayBox = finalizeTeamBox(awayPlan, homePlan, random, awayReboundTarget);
  const homeTeamStats = aggregate(homeBox);
  const awayTeamStats = aggregate(awayBox);
  const checks = {
    homePointsExact: homeTeamStats.points === Math.round(homeScore),
    awayPointsExact: awayTeamStats.points === Math.round(awayScore),
    homePlayerTeamTotalsExact: homeBox.every(row => row.points === row.twoPointersMade * 2 + row.threePointersMade * 3 + row.freeThrowsMade),
    awayPlayerTeamTotalsExact: awayBox.every(row => row.points === row.twoPointersMade * 2 + row.threePointersMade * 3 + row.freeThrowsMade),
    makesDoNotExceedAttempts: [...homeBox, ...awayBox].every(row => row.fieldGoalsMade <= row.fieldGoalsAttempted && row.threePointersMade <= row.threePointersAttempted && row.twoPointersMade <= row.twoPointersAttempted && row.freeThrowsMade <= row.freeThrowsAttempted),
    assistsDoNotExceedTeamFieldGoals: homeTeamStats.assists <= homeTeamStats.fieldGoalsMade && awayTeamStats.assists <= awayTeamStats.fieldGoalsMade,
    stealsDoNotExceedOpponentTurnovers: homeTeamStats.steals <= awayTeamStats.turnovers && awayTeamStats.steals <= homeTeamStats.turnovers,
    blocksDoNotExceedOpponentMissedShots: homeTeamStats.blocks <= awayPlan.shotMisses && awayTeamStats.blocks <= homePlan.shotMisses,
    reboundsDoNotExceedAvailableMisses: homeTeamStats.rebounds + awayTeamStats.rebounds <= totalMisses,
    regulationMinutesAreAllocated: homeTeamStats.minutes === 240 && awayTeamStats.minutes === 240 && [...homeBox, ...awayBox].every(row => row.minutes <= 48),
    playerStatsReconcile: ['points', 'fieldGoalsMade', 'fieldGoalsAttempted', 'threePointersMade', 'threePointersAttempted', 'freeThrowsMade', 'freeThrowsAttempted', 'rebounds', 'assists', 'turnovers', 'steals', 'blocks'].every(field => homeTeamStats[field] === homeBox.reduce((sum, row) => sum + row[field], 0) && awayTeamStats[field] === awayBox.reduce((sum, row) => sum + row[field], 0)),
  };
  if (Object.values(checks).some(value => !value)) throw new Error(`Coherent box-score invariant failed: ${JSON.stringify(checks)}`);
  return {
    format: 'djhc-coherent-box-score-v1',
    status: 'experimental-internal-consistency-only',
    observedPbpCalibrated: false,
    seed: Number(seed) >>> 0,
    homeScore: homeTeamStats.points,
    awayScore: awayTeamStats.points,
    homeBox,
    awayBox,
    homeTeamStats,
    awayTeamStats,
    checks,
    disclosure: 'Makes generate points; player and team shot totals reconcile. Assists are bounded by made field goals, steals by opposing turnovers, blocks by opposing missed attempts, and total rebounds by combined misses. Event-level timing and realism remain uncalibrated.',
  };
}
