import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

const FORMAT = 'djhc-rotation-schedule-v1';
const GAME_MINUTES = 48;
const QUARTER_MINUTES = 12;
const LANE_COUNT = 5;
const TEAM_MINUTES = GAME_MINUTES * LANE_COUNT;
const EPSILON = 1e-8;

function refKey(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const key = String(value).trim();
  return key || null;
}

function rotate(values, amount) {
  if (!values.length) return [];
  const offset = amount % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function addLaneIntervals(players, demands, laneLength, timeOffset, quarterIndex, laneIntervals, violations) {
  const ordered = rotate(players, quarterIndex * 2);
  let cursor = 0;
  const totalCapacity = LANE_COUNT * laneLength;

  for (const player of ordered) {
    const demand = demands.get(player.nameKey) ?? 0;
    if (demand <= EPSILON) continue;
    if (!Number.isFinite(demand) || demand < -EPSILON || demand > laneLength + EPSILON) {
      violations.push(`${player.canonicalName} needs ${demand} minutes in a ${laneLength}-minute lane.`);
      continue;
    }

    const start = cursor;
    const end = cursor + demand;
    if (end > totalCapacity + EPSILON) {
      violations.push(`Quarter ${quarterIndex + 1} demand exceeds five-lane capacity.`);
      continue;
    }

    let position = start;
    while (position < end - EPSILON) {
      const lane = Math.min(LANE_COUNT - 1, Math.floor(position / laneLength));
      const laneStart = lane * laneLength;
      const segmentEnd = Math.min(end, laneStart + laneLength);
      const localStart = position - laneStart;
      const localEnd = segmentEnd - laneStart;
      laneIntervals.push({
        player,
        lane,
        startMinute: timeOffset + localStart,
        endMinute: timeOffset + localEnd,
      });
      position = segmentEnd;
    }
    cursor = end;
  }

  if (Math.abs(cursor - totalCapacity) > EPSILON) {
    violations.push(`Quarter ${quarterIndex + 1} lane demand totals ${cursor}; expected ${totalCapacity}.`);
  }
}

function sameFive(left, right) {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(player => player.refKey).sort();
  const rightKeys = right.map(player => player.refKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function invalidResult(violations, openingStintMinutes, disclosures = []) {
  return {
    format: FORMAT,
    version: 1,
    status: 'requires-review',
    violations,
    stints: [],
    plannedMinutes: [],
    openingStintMinutes,
    disclosures,
  };
}

/**
 * Build a deterministic five-player schedule whose minutes exactly match the
 * supplied targets. This is a pure planning helper; it does not edit LeagueState.
 */
export function createRotationSchedule({
  players = [],
  starters,
  openingStintMinutes = 2,
  gameDurationMinutes = GAME_MINUTES,
} = {}) {
  const violations = [];
  const disclosures = [
    'This schedule is deterministic minute allocation only; it does not model fouls, fatigue, injuries, or coaching decisions.',
    'Targets are spread evenly across four 12-minute quarters by the lane-packing construction.',
  ];

  if (!Array.isArray(players)) violations.push('players must be an array.');
  if (!Number.isFinite(gameDurationMinutes) || Math.abs(gameDurationMinutes - GAME_MINUTES) > EPSILON) {
    violations.push('Only a 48-minute game with four 12-minute quarters is supported.');
  }
  if (!Number.isFinite(openingStintMinutes) || openingStintMinutes < 0 || openingStintMinutes > QUARTER_MINUTES) {
    violations.push('openingStintMinutes must be finite and between 0 and 12.');
  }

  const inputPlayers = Array.isArray(players) ? players : [];
  const normalizedPlayers = inputPlayers.map((player, index) => {
    const canonicalName = typeof player?.canonicalName === 'string' ? player.canonicalName.trim() : '';
    const nameKey = normalizeCanonicalPlayerName(canonicalName);
    const playerRef = player?.playerRef;
    const key = refKey(playerRef);
    const target = player?.minutesTarget;
    if (!canonicalName || !nameKey) violations.push(`Player ${index + 1} requires a canonicalName.`);
    if (playerRef === undefined || playerRef === null || !key) violations.push(`Player ${canonicalName || index + 1} requires a non-empty string or finite numeric playerRef.`);
    if (!Number.isFinite(target) || target < 0 || target > GAME_MINUTES) {
      violations.push(`${canonicalName || `Player ${index + 1}`} minutesTarget must be finite and between 0 and 48.`);
    }
    return { canonicalName, nameKey, playerRef, refKey: key, minutesTarget: target };
  });

  const namesSeen = new Set();
  const refsSeen = new Set();
  for (const player of normalizedPlayers) {
    if (player.nameKey) {
      if (namesSeen.has(player.nameKey)) violations.push(`Duplicate normalized player name: ${player.canonicalName}.`);
      namesSeen.add(player.nameKey);
    }
    if (player.refKey) {
      if (refsSeen.has(player.refKey)) violations.push(`Duplicate playerRef: ${player.refKey}.`);
      refsSeen.add(player.refKey);
    }
  }

  if (normalizedPlayers.length) {
    const validTargets = normalizedPlayers.every(player => Number.isFinite(player.minutesTarget));
    if (validTargets) {
      const targetTotal = normalizedPlayers.reduce((sum, player) => sum + player.minutesTarget, 0);
      if (Math.abs(targetTotal - TEAM_MINUTES) > EPSILON) {
        violations.push(`minutesTarget values total ${targetTotal}; exactly 240 team minutes are required.`);
      }
      const positiveCount = normalizedPlayers.filter(player => player.minutesTarget > EPSILON).length;
      if (positiveCount < LANE_COUNT) violations.push('At least five players must have positive minute targets.');
    }
  } else {
    violations.push('At least five players are required.');
  }

  if (starters !== undefined && starters !== null && !Array.isArray(starters)) {
    violations.push('starters must be an array of canonical names when provided.');
  }
  const requestedStarters = Array.isArray(starters) && starters.length ? starters : null;
  let starterPlayers = null;
  if (requestedStarters) {
    if (requestedStarters.length !== LANE_COUNT) {
      violations.push('starters must contain exactly five canonical names when provided.');
    } else {
      const byName = new Map(normalizedPlayers.map(player => [player.nameKey, player]));
      const starterKeys = requestedStarters.map(name => normalizeCanonicalPlayerName(name));
      if (starterKeys.some(key => !key)) violations.push('Every starter must have a non-empty canonical name.');
      if (new Set(starterKeys).size !== LANE_COUNT) violations.push('starters contains duplicate normalized names.');
      starterPlayers = starterKeys.map(key => byName.get(key));
      for (let index = 0; index < starterPlayers.length; index += 1) {
        if (!starterPlayers[index]) violations.push(`Starter ${String(requestedStarters[index])} does not exactly match a supplied canonicalName.`);
      }
      if (starterPlayers.some(player => player && player.minutesTarget <= EPSILON)) {
        disclosures.push('A requested starter has a zero-minute target, so the requested opening lineup cannot be scheduled.');
      }
    }
  }

  if (violations.length) return invalidResult(violations, 0, disclosures);

  let actualOpeningStintMinutes = 0;
  if (starterPlayers) {
    const starterKeys = new Set(starterPlayers.map(player => player.nameKey));
    const nonStarters = normalizedPlayers.filter(player => !starterKeys.has(player.nameKey));
    const starterQuarterMinimum = Math.min(...starterPlayers.map(player => player.minutesTarget / 4));
    const nonStarterRoom = nonStarters.length
      ? Math.min(...nonStarters.map(player => QUARTER_MINUTES - player.minutesTarget / 4))
      : Number.POSITIVE_INFINITY;
    actualOpeningStintMinutes = Math.min(openingStintMinutes, starterQuarterMinimum, nonStarterRoom);

    if (actualOpeningStintMinutes <= EPSILON) {
      disclosures.push('The requested starters cannot all share a positive opening stint while preserving the exact minute targets; no players or targets were substituted.');
      return invalidResult(['The requested starting five has no feasible positive opening stint under the exact minute targets.'], 0, disclosures);
    }
    if (actualOpeningStintMinutes + EPSILON < openingStintMinutes) {
      disclosures.push(`The opening stint was shortened from ${openingStintMinutes} to ${actualOpeningStintMinutes} minutes to preserve exact targets.`);
    }
  }

  const laneIntervals = [];
  const quarterViolations = [];
  for (let quarterIndex = 0; quarterIndex < 4; quarterIndex += 1) {
    const quarterBase = quarterIndex * QUARTER_MINUTES;
    const demands = new Map(normalizedPlayers.map(player => [player.nameKey, player.minutesTarget / 4]));
    let laneLength = QUARTER_MINUTES;
    let timeOffset = quarterBase;

    if (quarterIndex === 0 && starterPlayers) {
      laneLength -= actualOpeningStintMinutes;
      timeOffset += actualOpeningStintMinutes;
      for (const starter of starterPlayers) {
        demands.set(starter.nameKey, Math.max(0, starter.minutesTarget / 4 - actualOpeningStintMinutes));
      }
      for (const player of normalizedPlayers) {
        if (!starterPlayers.some(starter => starter.nameKey === player.nameKey)) {
          demands.set(player.nameKey, player.minutesTarget / 4);
        }
      }
    }
    addLaneIntervals(normalizedPlayers, demands, laneLength, timeOffset, quarterIndex, laneIntervals, quarterViolations);
  }

  if (quarterViolations.length) return invalidResult(quarterViolations, actualOpeningStintMinutes, disclosures);

  const boundaries = new Set([0, 12, 24, 36, GAME_MINUTES]);
  for (const interval of laneIntervals) {
    boundaries.add(interval.startMinute);
    boundaries.add(interval.endMinute);
  }
  if (starterPlayers) boundaries.add(actualOpeningStintMinutes);
  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);
  const rawStints = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const startMinute = sortedBoundaries[index];
    const endMinute = sortedBoundaries[index + 1];
    if (endMinute - startMinute <= EPSILON) continue;
    const midpoint = (startMinute + endMinute) / 2;
    let lineup;
    if (starterPlayers && midpoint < actualOpeningStintMinutes) {
      lineup = [...starterPlayers];
    } else {
      const active = laneIntervals
        .filter(interval => midpoint >= interval.startMinute && midpoint < interval.endMinute)
        .sort((a, b) => a.lane - b.lane);
      lineup = active.map(interval => interval.player);
    }

    const uniqueRefs = new Set(lineup.map(player => player.refKey));
    if (lineup.length !== LANE_COUNT || uniqueRefs.size !== LANE_COUNT) {
      return invalidResult([`Generated interval ${startMinute}-${endMinute} does not have exactly five unique players.`], actualOpeningStintMinutes, disclosures);
    }

    const next = { startMinute, endMinute, players: lineup };
    const prior = rawStints[rawStints.length - 1];
    if (prior && Math.abs(prior.endMinute - startMinute) <= EPSILON && sameFive(prior.players, lineup)) {
      prior.endMinute = endMinute;
    } else {
      rawStints.push(next);
    }
  }

  if (!rawStints.length || Math.abs(rawStints[0].startMinute) > EPSILON || Math.abs(rawStints.at(-1).endMinute - GAME_MINUTES) > EPSILON) {
    return invalidResult(['Generated stints do not partition the full 48-minute game.'], actualOpeningStintMinutes, disclosures);
  }
  for (let index = 1; index < rawStints.length; index += 1) {
    if (Math.abs(rawStints[index - 1].endMinute - rawStints[index].startMinute) > EPSILON) {
      return invalidResult(['Generated stints contain a gap or overlap.'], actualOpeningStintMinutes, disclosures);
    }
  }

  const scheduledByRef = new Map(normalizedPlayers.map(player => [player.refKey, 0]));
  const stints = rawStints.map(stint => {
    const duration = stint.endMinute - stint.startMinute;
    for (const player of stint.players) scheduledByRef.set(player.refKey, (scheduledByRef.get(player.refKey) ?? 0) + duration);
    return {
      startMinute: stint.startMinute,
      endMinute: stint.endMinute,
      playerRefs: stint.players.map(player => player.playerRef),
      canonicalNames: stint.players.map(player => player.canonicalName),
    };
  });
  const plannedMinutes = normalizedPlayers.map(player => ({
    canonicalName: player.canonicalName,
    playerRef: player.playerRef,
    targetMinutes: player.minutesTarget,
    scheduledMinutes: scheduledByRef.get(player.refKey) ?? 0,
  }));

  for (const row of plannedMinutes) {
    if (Math.abs(row.targetMinutes - row.scheduledMinutes) > 1e-7) {
      return invalidResult([`${row.canonicalName} was scheduled for ${row.scheduledMinutes} minutes; target is ${row.targetMinutes}.`], actualOpeningStintMinutes, disclosures);
    }
  }

  if (!starterPlayers) disclosures.push('No opening starting five was requested; the first lineup follows deterministic lane order.');
  return {
    format: FORMAT,
    version: 1,
    status: 'pass',
    violations: [],
    stints,
    plannedMinutes,
    openingStintMinutes: actualOpeningStintMinutes,
    disclosures,
  };
}
