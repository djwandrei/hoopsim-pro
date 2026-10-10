/**
 * Franchise-only CPU minute planner. It consumes the league's public player
 * snapshots and never changes the Lineup Lab optimizer or user rotations.
 */
export const FRANCHISE_CPU_ROTATION_VERSION = 'franchise-cpu-rotation-v3';

const STARTER_SLOTS = Object.freeze(['C', 'G', 'G', 'F', 'F']);
const ROLE_MINUTES = Object.freeze({ G: 96, F: 96, C: 48 });
const ROLE_BITS = Object.freeze({ G: 1, F: 2, C: 4 });
const POSITION_ROLES = Object.freeze({
  G: 'G', GUARD: 'G', PG: 'G', 'POINT GUARD': 'G', SG: 'G', 'SHOOTING GUARD': 'G',
  F: 'F', FORWARD: 'F', SF: 'F', 'SMALL FORWARD': 'F', PF: 'F', 'POWER FORWARD': 'F',
  C: 'C', CENTER: 'C', CENTRE: 'C',
});
const ROLE_DEMANDS = Object.freeze(Array.from({ length: 8 }, (_, mask) =>
  Object.entries(ROLE_MINUTES).reduce((sum, [role, demand]) =>
    sum + ((mask & ROLE_BITS[role]) ? demand : 0), 0)));
const MIN_ROTATION_MINUTES = 6;

function finite(value) {
  return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')
    && Number.isFinite(Number(value));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function compareRefs(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function roles(player) {
  const declared = [...(Array.isArray(player.positions) ? player.positions : []), player.position];
  const mapped = declared.flatMap(value => String(value || '').split(/[\/,]/))
    .map(value => POSITION_ROLES[value.trim().toUpperCase()] || null).filter(Boolean);
  return [...new Set(mapped)];
}

function roleMask(player) {
  return roles(player).reduce((mask, role) => mask | ROLE_BITS[role], 0);
}

function quality(player) {
  const rating = player.ratings || {};
  const values = ['scoring', 'creation', 'playmaking', 'shooting', 'defense', 'rebounding']
    .map(key => rating[key]).filter(finite).map(Number).filter(value => value >= 0 && value <= 100);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 55;
}

function observedMinuteInput(player) {
  const candidates = [
    ['baselineMinutesPerGame', player.baselineMinutesPerGame],
    ['observedMinutesPerGame', player.observedMinutesPerGame],
    ['minutesPerGame', player.minutesPerGame],
    ['perGame.minutes', player.perGame?.minutes],
  ];
  for (const [source, raw] of candidates) {
    if (!finite(raw)) continue;
    const minutes = Number(raw);
    if (minutes >= 0 && minutes <= 48) return { minutes, source };
  }
  return { minutes: null, source: null };
}

function observedMinuteProfile(player) {
  const { minutes: observedMinutes, source: minuteSource } = observedMinuteInput(player);
  const exposureFields = [
    ['baselineGames', player.baselineGames],
    ['observedSampleGames', player.observedSampleGames],
    ['sourceSeasonGames', player.sourceSeasonGames],
  ];
  const sample = exposureFields.find(([, value]) => finite(value) && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 100);
  const sampleGames = sample ? Number(sample[1]) : null;
  const sampleGamesSource = sample?.[0] || null;
  const exposureAvailable = sampleGames !== null;
  const observedAvailable = observedMinutes !== null;
  const qualitySupportWeight = exposureAvailable ? sampleGames / (sampleGames + 12) : 0.25;
  // Ratings derived from a short season are noisy too. Shrink the quality
  // prior with the same sample support before blending observed minutes;
  // otherwise a two-game spike can survive through the supposedly safe prior.
  const supportedQuality = 55 + (quality(player) - 55) * qualitySupportWeight;
  const prior = clamp(17 + (supportedQuality - 55) * 0.24, 11, 29);
  const exposureWeight = observedAvailable ? qualitySupportWeight : 0;
  return {
    minutes: observedAvailable ? clamp(observedMinutes * exposureWeight + prior * (1 - exposureWeight), 6, 40) : prior,
    observedMinutes,
    minuteSource,
    sampleGames,
    sampleGamesSource,
    exposureWeight,
    qualitySupportWeight,
    supportedQuality,
    evidence: observedAvailable && exposureAvailable
      ? (observedMinutes === 0 ? 'observed-zero-minutes-shrunk-by-games' : 'observed-minutes-shrunk-by-games')
      : observedAvailable ? (observedMinutes === 0 ? 'observed-zero-minutes-unknown-exposure' : 'observed-minutes-unknown-exposure')
        : 'model-derived-role-prior',
  };
}

function coveredStartingFive(ranked) {
  const chosen = [];
  const used = new Set();
  function assign(slotIndex) {
    if (slotIndex === STARTER_SLOTS.length) return [...chosen];
    for (const player of ranked) {
      if (used.has(player.playerRef) || !roles(player).includes(STARTER_SLOTS[slotIndex])) continue;
      used.add(player.playerRef);
      chosen.push({ playerRef: player.playerRef, role: STARTER_SLOTS[slotIndex] });
      const result = assign(slotIndex + 1);
      if (result) return result;
      chosen.pop();
      used.delete(player.playerRef);
    }
    return null;
  }
  return assign(0);
}

function projectTargets(targets, minimum, maximum, total) {
  let low = -maximum;
  let high = total + maximum;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const offset = (low + high) / 2;
    const sum = targets.reduce((value, target) => value + clamp(target + offset, minimum, maximum), 0);
    if (sum < total) low = offset;
    else high = offset;
  }
  const projected = targets.map(target => clamp(target + (low + high) / 2, minimum, maximum));
  const minutes = projected.map(Math.floor);
  let remaining = total - minutes.reduce((sum, value) => sum + value, 0);
  const order = projected.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let cursor = 0; remaining > 0; cursor = (cursor + 1) % order.length) {
    const index = order[cursor].index;
    if (minutes[index] >= maximum) continue;
    minutes[index] += 1;
    remaining -= 1;
  }
  return minutes;
}

function minuteDeviation(minutes, targets) {
  return minutes.reduce((sum, value, index) => sum + (value - targets[index]) ** 2, 0);
}

function coverageState(roleMasks, minutes) {
  const capacities = Array(ROLE_DEMANDS.length).fill(0);
  for (let mask = 1; mask < ROLE_DEMANDS.length; mask += 1) {
    for (let index = 0; index < roleMasks.length; index += 1) {
      if (roleMasks[index] & mask) capacities[mask] += minutes[index];
    }
  }
  let penalty = 0;
  for (let mask = 1; mask < ROLE_DEMANDS.length; mask += 1) {
    penalty += Math.max(0, ROLE_DEMANDS[mask] - capacities[mask]) ** 2;
  }
  return { capacities, penalty };
}

function transferCoverage(state, receiverMask, donorMask) {
  let penalty = 0;
  for (let mask = 1; mask < ROLE_DEMANDS.length; mask += 1) {
    const capacity = state.capacities[mask] + Number(Boolean(receiverMask & mask)) - Number(Boolean(donorMask & mask));
    penalty += Math.max(0, ROLE_DEMANDS[mask] - capacity) ** 2;
  }
  return penalty;
}

function cachedTransferCoverage(state, receiverMask, donorMask, cache) {
  // Candidate scans keep `state.capacities` fixed until their best move is
  // selected. Rosters commonly repeat the same three position masks across
  // many player pairs, so reuse the exact penalty for each role-mask pair.
  const key = (receiverMask << 3) | donorMask;
  if (!cache.has(key)) cache.set(key, transferCoverage(state, receiverMask, donorMask));
  return cache.get(key);
}

function applyCoverageTransfer(state, receiverMask, donorMask) {
  for (let mask = 1; mask < ROLE_DEMANDS.length; mask += 1) {
    state.capacities[mask] += Number(Boolean(receiverMask & mask)) - Number(Boolean(donorMask & mask));
  }
}

function allocateMinutes(players, targetByRef) {
  const maximum = players.length === 5 ? 48 : players.length === 6 ? 42 : 40;
  const roleMasks = players.map(roleMask);
  const targets = players.map(player => targetByRef.get(player.playerRef));
  if (targets.some(target => !Number.isFinite(target))) return null;
  const minutes = projectTargets(targets, MIN_ROTATION_MINUTES, maximum, 240);
  const coverage = coverageState(roleMasks, minutes);
  let penalty = coverage.penalty;
  for (let move = 0; penalty > 0 && move < 240; move += 1) {
    let best = null;
    const transferCache = new Map();
    for (let receiver = 0; receiver < players.length; receiver += 1) {
      if (minutes[receiver] >= maximum) continue;
      for (let donor = 0; donor < players.length; donor += 1) {
        if (donor === receiver || minutes[donor] <= MIN_ROTATION_MINUTES) continue;
        // Equal role masks preserve every role capacity, so they cannot lower
        // a positive coverage penalty.
        if (roleMasks[receiver] === roleMasks[donor]) continue;
        const nextPenalty = cachedTransferCoverage(coverage, roleMasks[receiver], roleMasks[donor], transferCache);
        if (nextPenalty >= penalty) continue;
        const beforeCost = (minutes[receiver] - targets[receiver]) ** 2 + (minutes[donor] - targets[donor]) ** 2;
        const afterCost = (minutes[receiver] + 1 - targets[receiver]) ** 2 + (minutes[donor] - 1 - targets[donor]) ** 2;
        const deviation = afterCost - beforeCost;
        if (!best || nextPenalty < best.penalty || nextPenalty === best.penalty && deviation < best.deviation
          || nextPenalty === best.penalty && deviation === best.deviation
            && (receiver < best.receiver || receiver === best.receiver && donor < best.donor)) {
          best = { receiver, donor, penalty: nextPenalty, deviation };
        }
      }
    }
    if (!best) return null;
    minutes[best.receiver] += 1; minutes[best.donor] -= 1;
    applyCoverageTransfer(coverage, roleMasks[best.receiver], roleMasks[best.donor]);
    penalty = best.penalty;
  }
  if (penalty > 0) return null;
  // Once role capacity is feasible, take evidence-improving minute transfers
  // that preserve all role constraints, using squared target deviations.
  for (let move = 0; move < 240; move += 1) {
    let best = null;
    const transferCache = new Map();
    for (let receiver = 0; receiver < players.length; receiver += 1) {
      if (minutes[receiver] >= maximum) continue;
      for (let donor = 0; donor < players.length; donor += 1) {
        if (donor === receiver || minutes[donor] <= MIN_ROTATION_MINUTES) continue;
        const beforeCost = (minutes[receiver] - targets[receiver]) ** 2 + (minutes[donor] - targets[donor]) ** 2;
        const afterCost = (minutes[receiver] + 1 - targets[receiver]) ** 2 + (minutes[donor] - 1 - targets[donor]) ** 2;
        const deviation = afterCost - beforeCost;
        if (deviation >= -1e-9) continue;
        // Equal masks leave coverage unchanged and are already known feasible
        // in this phase. Other repeated mask pairs reuse this scan's result.
        const remainsFeasible = roleMasks[receiver] === roleMasks[donor]
          || cachedTransferCoverage(coverage, roleMasks[receiver], roleMasks[donor], transferCache) === 0;
        if (!remainsFeasible) continue;
        if (!best || deviation < best.deviation || deviation === best.deviation
          && (receiver < best.receiver || receiver === best.receiver && donor < best.donor)) {
          best = { receiver, donor, deviation };
        }
      }
    }
    if (!best) break;
    minutes[best.receiver] += 1; minutes[best.donor] -= 1;
    applyCoverageTransfer(coverage, roleMasks[best.receiver], roleMasks[best.donor]);
  }
  return { minutes, cost: minuteDeviation(minutes, targets) };
}

function selectedDeviationCost(availableInCostOrder, selected, allocation, targetByRef) {
  const selectedMinutes = new Map(selected.map((player, index) => [player.playerRef, allocation.minutes[index]]));
  // Floating-point addition is order-sensitive. Cost comparisons must use one
  // canonical player order so package row order cannot change the selected size.
  return availableInCostOrder.reduce((sum, player) => {
    const target = targetByRef.get(player.playerRef);
    const actual = selectedMinutes.get(player.playerRef) || 0;
    return sum + (actual - target) ** 2;
  }, 0);
}

function repairRoleCapacity(selected, ranked, protectedRefs, maximum) {
  let selectedRefs = new Set(selected.map(player => player.playerRef));
  const maximumCoveragePenalty = rows => roleCoveragePenalty(rows.map(roleMask), rows.map(() => maximum));
  let coveragePenalty = maximumCoveragePenalty(selected);
  for (let attempt = 0; coveragePenalty > 0 && attempt < selected.length; attempt += 1) {
    let replacement = null;
    for (const incoming of ranked) {
      if (selectedRefs.has(incoming.playerRef)) continue;
      for (const outgoing of selected) {
        if (protectedRefs.has(outgoing.playerRef)) continue;
        const candidate = selected.map(player => player.playerRef === outgoing.playerRef ? incoming : player);
        const penalty = maximumCoveragePenalty(candidate);
        if (penalty < coveragePenalty && (!replacement || penalty < replacement.penalty
          || penalty === replacement.penalty && compareRefs(incoming.playerRef, replacement.incoming.playerRef) < 0
          || penalty === replacement.penalty && incoming.playerRef === replacement.incoming.playerRef
            && compareRefs(outgoing.playerRef, replacement.outgoing.playerRef) < 0)) {
          replacement = { incoming, outgoing, penalty, candidate };
        }
      }
    }
    if (!replacement) break;
    selectedRefs.delete(replacement.outgoing.playerRef);
    selectedRefs.add(replacement.incoming.playerRef);
    selected = ranked.filter(player => selectedRefs.has(player.playerRef));
    coveragePenalty = replacement.penalty;
  }
  return coveragePenalty === 0 ? selected : null;
}

function improveSelection(selected, available, ranked, protectedRefs, targetByRef, availableInCostOrder) {
  let allocation = allocateMinutes(selected, targetByRef);
  if (!allocation) return null;
  let cost = selectedDeviationCost(availableInCostOrder, selected, allocation, targetByRef);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const selectedRefs = new Set(selected.map(player => player.playerRef));
    let best = null;
    for (const incoming of available) {
      if (selectedRefs.has(incoming.playerRef)) continue;
      for (const outgoing of selected) {
        if (protectedRefs.has(outgoing.playerRef)) continue;
        const candidate = ranked.filter(player => selectedRefs.has(player.playerRef) && player.playerRef !== outgoing.playerRef
          || player.playerRef === incoming.playerRef);
        const candidateAllocation = allocateMinutes(candidate, targetByRef);
        if (!candidateAllocation) continue;
        const candidateCost = selectedDeviationCost(availableInCostOrder, candidate, candidateAllocation, targetByRef);
        if (candidateCost >= cost - 1e-8) continue;
        if (!best || candidateCost < best.cost - 1e-8
          || Math.abs(candidateCost - best.cost) <= 1e-8
            && (compareRefs(incoming.playerRef, best.incoming.playerRef) < 0
              || incoming.playerRef === best.incoming.playerRef && compareRefs(outgoing.playerRef, best.outgoing.playerRef) < 0)) {
          best = { incoming, outgoing, candidate, allocation: candidateAllocation, cost: candidateCost };
        }
      }
    }
    if (!best) break;
    selected = best.candidate;
    allocation = best.allocation;
    cost = best.cost;
  }
  return { selected, allocation, cost };
}

function roleCoveragePenalty(roleMasks, minutes) {
  let penalty = 0;
  for (let mask = 1; mask < ROLE_DEMANDS.length; mask += 1) {
    let capacity = 0;
    for (let index = 0; index < roleMasks.length; index += 1) {
      if (roleMasks[index] & mask) capacity += minutes[index];
    }
    penalty += Math.max(0, ROLE_DEMANDS[mask] - capacity) ** 2;
  }
  return penalty;
}

function coversRegulationRoles(rotation, playersByRef) {
  const roleNames = Object.keys(ROLE_MINUTES);
  // Capacity Hall condition for the three role-minute demands. For every
  // subset of roles, its required minutes must fit inside the total minutes
  // of players eligible for at least one role in that subset. The integral
  // max-flow theorem then guarantees a feasible minute-to-role assignment.
  for (let mask = 1; mask < (1 << roleNames.length); mask += 1) {
    const subset = roleNames.filter((_, index) => mask & (1 << index));
    const required = ROLE_DEMANDS[mask];
    const capacity = rotation.reduce((sum, row) => {
      const player = playersByRef.get(row.playerRef);
      return sum + ((roleMask(player) & mask) ? row.minutes : 0);
    }, 0);
    if (capacity < required) return { covered: false, roles: subset, required, capacity };
  }
  return { covered: true };
}

export function planCpuFranchiseRotation(team, { seed, gameId } = {}) {
  if (!team || team.control !== 'cpu' || !Array.isArray(team.roster)) {
    return { status: 'unavailable', reason: 'A CPU-controlled team roster is required.' };
  }
  if (seed == null || !String(seed).trim() || gameId == null || !String(gameId).trim()) {
    return { status: 'unavailable', reason: 'A fixed league seed and game reference are required for replay.' };
  }
  const available = team.roster.filter(player => player?.status === 'active' && !(Number(player.injury?.gamesRemaining) > 0)
    && typeof player.playerRef === 'string' && player.playerRef && roles(player).length);
  if (new Set(available.map(player => player.playerRef)).size !== available.length) {
    return { status: 'unavailable', reason: 'The active roster has duplicate player references.' };
  }
  if (available.length < 5) return { status: 'unavailable', reason: 'At least five available players are required.' };
  const availableInCostOrder = [...available].sort((left, right) => compareRefs(left.playerRef, right.playerRef));
  const ranked = [...available].sort((left, right) =>
    observedMinuteProfile(right).minutes - observedMinuteProfile(left).minutes
    || observedMinuteProfile(right).supportedQuality - observedMinuteProfile(left).supportedQuality
    || compareRefs(left.playerRef, right.playerRef));
  const starters = coveredStartingFive(ranked);
  if (!starters) return { status: 'unavailable', reason: 'The active roster cannot cover two guards, two forwards, and one center.' };
  // Keep the strongest observed playmaking option in the game plan when the
  // roster has a clear primary handler. A ninth-player cut for role coverage
  // must not turn a high-minute, high-assist guard into a zero-minute player.
  const primaryHandler = ranked.filter(player => {
    const minutes = observedMinuteInput(player).minutes;
    const assists = player.baselinePerGame?.assists;
    return minutes !== null && minutes >= 20 && finite(assists) && Number(assists) >= 3;
  }).sort((left, right) => Number(right.baselinePerGame.assists) - Number(left.baselinePerGame.assists)
    || observedMinuteProfile(right).minutes - observedMinuteProfile(left).minutes
    || compareRefs(left.playerRef, right.playerRef))[0] || null;
  const planSeed = `${seed}:${gameId}:${team.teamId || ''}:${FRANCHISE_CPU_ROTATION_VERSION}`;
  const targetByRef = new Map(available.map(player => {
    const random = seededRandom(`${planSeed}:${player.playerRef}`);
    const base = observedMinuteProfile(player).minutes;
    // A small deterministic game-level variation preserves replay flavor while
    // keeping every player's evidence target independent of source row order.
    return [player.playerRef, base * (0.96 + random() * 0.08)];
  }));
  const protectedRefs = new Set(starters.map(row => row.playerRef));
  if (primaryHandler) protectedRefs.add(primaryHandler.playerRef);
  const targetSizes = [...new Set([Math.min(9, available.length), Math.min(10, available.length)])]
    .filter(size => size >= protectedRefs.size);
  const candidates = [];
  for (const targetSize of targetSizes) {
    const selectedRefs = new Set(protectedRefs);
    for (const player of ranked) {
      if (selectedRefs.size >= targetSize) break;
      selectedRefs.add(player.playerRef);
    }
    const maximum = selectedRefs.size === 5 ? 48 : selectedRefs.size === 6 ? 42 : 40;
    const roleFeasible = repairRoleCapacity(ranked.filter(player => selectedRefs.has(player.playerRef)),
      ranked, protectedRefs, maximum);
    if (!roleFeasible) continue;
    const improved = improveSelection(roleFeasible, available, ranked, protectedRefs, targetByRef, availableInCostOrder);
    if (improved) candidates.push({ ...improved, targetSize });
  }
  candidates.sort((left, right) => left.cost - right.cost || right.targetSize - left.targetSize
    || left.selected.map(player => player.playerRef).join('|').localeCompare(right.selected.map(player => player.playerRef).join('|')));
  const best = candidates[0];
  if (!best) {
    return { status: 'unavailable', reason: 'The available roster cannot produce a role-feasible evidence rotation within player limits.' };
  }
  const selected = best.selected;
  const minutes = best.allocation.minutes;
  const slotByRef = new Map(starters.map(row => [row.playerRef, row.role]));
  const rotation = selected.map((player, index) => ({
    playerRef: player.playerRef,
    minutes: minutes[index],
    starter: slotByRef.has(player.playerRef),
    startingRole: slotByRef.get(player.playerRef) || null,
  }));
  const roleCoverage = coversRegulationRoles(rotation, new Map(selected.map(player => [player.playerRef, player])));
  if (!roleCoverage.covered) {
    return { status: 'unavailable', reason: `The selected minutes cannot cover ${roleCoverage.roles.join('/')} roles: ${roleCoverage.capacity} of ${roleCoverage.required} required minutes.` };
  }
  return {
    status: 'ready',
    rotation,
    startingFive: starters,
    receipt: {
      modelVersion: FRANCHISE_CPU_ROTATION_VERSION,
      evidence: 'seeded-franchise-cpu-scenario',
      seed: String(seed), gameId: String(gameId), teamId: String(team.teamId || ''),
      totalRegulationMinutes: 240,
      roleMinuteRequirements: { ...ROLE_MINUTES },
      roleMinuteCoverage: 'feasible-aggregate-assignment; stints-not-modeled',
      selectedPlayerCount: selected.length,
      evidenceTargetDeviation: Number(best.cost.toFixed(4)),
      maximumPlayerMinutes: selected.length === 5 ? 48 : selected.length === 6 ? 42 : 40,
      playerEvidence: selected.map(player => ({ playerRef: player.playerRef, ...observedMinuteProfile(player) })),
      note: 'Observed minutes guide availability-adjusted usage. This scenario plan is not an observed coach rotation or calibrated forecast.',
    },
  };
}
