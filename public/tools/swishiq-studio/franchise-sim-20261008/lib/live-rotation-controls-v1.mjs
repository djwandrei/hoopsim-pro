import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { selectMinuteBudgetLineup } from './live-minute-budget-v1.mjs';

const key = normalizeCanonicalPlayerName;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const valueAt = (values, ref, fallback = 0) => values instanceof Map ? values.get(ref) ?? fallback : values?.[ref] ?? fallback;

/** User coaching assumptions, separate from observed player availability and
 * the fitted game model. Unknown control names fail instead of being ignored. */
export function normalizeLiveRotationControls({ players = [], controls = {} } = {}) {
  const violations = [], byName = new Map();
  const supported = new Set(['format', 'version', 'starters', 'benchOrder', 'closingLineup',
    'openingStintMinutes', 'closingWindowMinutes', 'conditionalSubstitutions']);
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    return { status: 'requires-review', violations: ['rotationControls must be an object.'], controls: null };
  }
  for (const field of Object.keys(controls)) if (!supported.has(field)) violations.push(`Unsupported rotation control: ${field}.`);
  if (controls.format !== undefined && controls.format !== 'djhc-live-rotation-controls-v1') violations.push('Unsupported rotation control format.');
  if (controls.version !== undefined && controls.version !== 1) violations.push('Unsupported rotation control version.');
  for (const player of players) {
    const name = player.canonicalName ?? player.displayName ?? player.name;
    const normalized = key(name);
    if (!normalized || byName.has(normalized)) violations.push('Rotation players need unique exact normalized names.');
    else byName.set(normalized, { ...player, canonicalName: String(name).trim() });
  }
  const names = (values, label, expected = null) => {
    if (values === undefined) return [];
    if (!Array.isArray(values)) { violations.push(`${label} must be an array of exact names.`); return []; }
    const seen = new Set(), result = [];
    for (const name of values) {
      const normalized = key(name), player = byName.get(normalized);
      if (!player || seen.has(normalized) || !(Number(player.minutesTarget ?? player.projectedMinutes) > 0)) {
        violations.push(`${label} includes an ambiguous, inactive, or absent player: ${name}.`);
      } else { seen.add(normalized); result.push(player.canonicalName); }
    }
    if (expected !== null && result.length !== expected) violations.push(`${label} requires exactly ${expected} active players.`);
    return result;
  };
  const number = (value, fallback, low, high, label) => {
    if (value === undefined) return fallback;
    if (!finite(value) || value < low || value > high) { violations.push(`${label} must be finite and between ${low} and ${high}.`); return fallback; }
    return value;
  };
  const object = (value, fields, label) => {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) { violations.push(`${label} must be an object.`); return {}; }
    for (const field of Object.keys(value)) if (!fields.includes(field)) violations.push(`Unsupported ${label} field: ${field}.`);
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') violations.push(`${label}.enabled must be boolean.`);
    return value;
  };
  const conditionals = object(controls.conditionalSubstitutions, ['foulTrouble', 'fatigue', 'garbageTime'], 'conditionalSubstitutions');
  const foul = object(conditionals.foulTrouble, ['enabled', 'thresholds', 'releaseFinalMinutes'], 'foulTrouble');
  const fatigue = object(conditionals.fatigue, ['enabled', 'maxConsecutiveMinutes', 'minRestMinutes'], 'fatigue');
  const garbage = object(conditionals.garbageTime, ['enabled', 'margin', 'finalMinutes', 'preferredPlayers'], 'garbageTime');
  const thresholds = object(foul.thresholds, ['Q1', 'Q2', 'Q3', 'Q4'], 'foulTrouble.thresholds');
  const normalizedThresholds = {};
  for (const [period, fallback] of Object.entries({ Q1: 2, Q2: 3, Q3: 4, Q4: 5 })) {
    normalizedThresholds[period] = number(thresholds[period], fallback, 1, 5, `foulTrouble.thresholds.${period}`);
    if (!Number.isInteger(normalizedThresholds[period])) violations.push('Foul thresholds must be integer personal-foul counts.');
  }
  const normalized = {
    format: 'djhc-live-rotation-controls-v1', version: 1,
    starters: names(controls.starters, 'starters', controls.starters === undefined || controls.starters?.length === 0 ? null : 5),
    benchOrder: names(controls.benchOrder, 'benchOrder'),
    closingLineup: names(controls.closingLineup, 'closingLineup', controls.closingLineup === undefined || controls.closingLineup?.length === 0 ? null : 5),
    openingStintMinutes: number(controls.openingStintMinutes, 2, 0.01, 6, 'openingStintMinutes'),
    closingWindowMinutes: number(controls.closingWindowMinutes, 5, 0.01, 12, 'closingWindowMinutes'),
    conditionalSubstitutions: {
      foulTrouble: { enabled: foul.enabled ?? false, thresholds: normalizedThresholds,
        releaseFinalMinutes: number(foul.releaseFinalMinutes, 2, 0, 12, 'foulTrouble.releaseFinalMinutes') },
      fatigue: { enabled: fatigue.enabled ?? false,
        maxConsecutiveMinutes: number(fatigue.maxConsecutiveMinutes, 10, 1, 48, 'fatigue.maxConsecutiveMinutes'),
        minRestMinutes: number(fatigue.minRestMinutes, 2, 0.01, 12, 'fatigue.minRestMinutes') },
      garbageTime: { enabled: garbage.enabled ?? false, margin: number(garbage.margin, 20, 1, 100, 'garbageTime.margin'),
        finalMinutes: number(garbage.finalMinutes, 6, 0.01, 12, 'garbageTime.finalMinutes'),
        preferredPlayers: names(garbage.preferredPlayers, 'garbageTime.preferredPlayers') },
    },
  };
  if (normalized.conditionalSubstitutions.garbageTime.enabled && normalized.conditionalSubstitutions.garbageTime.preferredPlayers.length < 5) {
    violations.push('Enabled garbage-time coaching needs at least five explicitly preferred active players.');
  }
  return { status: violations.length ? 'requires-review' : 'pass', violations: [...new Set(violations)],
    controls: violations.length ? null : normalized };
}

/** Select a five at an eligible stoppage. Runtime supplies observed simulated
 * minutes/fouls; policy never invents injury, chemistry, or a new player skill. */
export function selectLiveRotation({ players, controls, schedule, elapsedMinutes = 0, period = 'Q1', margin = 0,
  actualMinutes = new Map(), fouls = new Map(), consecutiveMinutes = new Map(), restMinutes = new Map(),
  fatigueHoldRefs = [], protectedPlayerRefs = [], retainedPlayerRefs = [],
  remainingGameMinutes, minimumStintMinutes = 0, emergencyPlayerRefs = [], activatedEmergencyPlayerRefs = [] } = {}) {
  const retained = new Set(retainedPlayerRefs);
  const activated = new Set(activatedEmergencyPlayerRefs);
  const ordinary = players.filter(player => player.minutesTarget > 0 || activated.has(player.playerRef));
  const needsEmergency = ordinary.filter(player => valueAt(fouls, player.playerRef) < 6 || retained.has(player.playerRef)).length < 5;
  // In capped games these reserves also contribute future minute capacity.
  // They remain outside the preferred five until foul/cap feasibility needs them.
  const emergency = new Set(needsEmergency || remainingGameMinutes !== undefined ? emergencyPlayerRefs : []);
  const active = players.filter(player => player.minutesTarget > 0 || activated.has(player.playerRef) || emergency.has(player.playerRef));
  const byRef = new Map(active.map(player => [player.playerRef, player]));
  const byName = new Map(active.map(player => [key(player.canonicalName ?? player.displayName), player.playerRef]));
  const protectedRefs = new Set(protectedPlayerRefs);
  if ([...retained].some(ref => !byRef.has(ref) || valueAt(fouls, ref) < 6)) return { status: 'requires-review',
    playerRefs: [], reason: 'invalid-depleted-roster-authorization', violations: ['Retained players require a resolved current sixth-foul rule decision.'],
    fatigueHoldRefs: [...fatigueHoldRefs], conditionalHolds: [] };
  const disqualified = new Set(active.filter(player => valueAt(fouls, player.playerRef) >= 6 && !retained.has(player.playerRef)).map(player => player.playerRef));
  const eligible = active.filter(player => !disqualified.has(player.playerRef));
  if (eligible.length < 5) return { status: 'requires-review', playerRefs: [], reason: 'insufficient-unfouled-players',
    violations: ['Fewer than five eligible players without a resolved depleted-roster exception.'],
    fatigueHoldRefs: [...fatigueHoldRefs], conditionalHolds: [] };
  const fatigue = controls.conditionalSubstitutions.fatigue, held = new Set(fatigueHoldRefs);
  if (fatigue.enabled) {
    for (const player of eligible) {
      const ref = player.playerRef;
      if (valueAt(consecutiveMinutes, ref) >= fatigue.maxConsecutiveMinutes - 1e-8) held.add(ref);
      if (held.has(ref) && valueAt(restMinutes, ref) >= fatigue.minRestMinutes - 1e-8) held.delete(ref);
    }
  } else held.clear();
  const foul = controls.conditionalSubstitutions.foulTrouble;
  const released = elapsedMinutes >= 48 - foul.releaseFinalMinutes;
  const foulHeld = new Set(foul.enabled && !released ? eligible.filter(player =>
    valueAt(fouls, player.playerRef) >= (foul.thresholds[period] ?? 6)).map(player => player.playerRef) : []);
  const preferred = [], reasons = [];
  const addNames = values => preferred.push(...values.map(name => byName.get(key(name))).filter(Boolean));
  const garbage = controls.conditionalSubstitutions.garbageTime;
  if (garbage.enabled && elapsedMinutes < 48 && elapsedMinutes >= 48 - garbage.finalMinutes && Math.abs(margin) >= garbage.margin) {
    addNames(garbage.preferredPlayers); reasons.push('garbage-time');
  } else if (controls.closingLineup.length && elapsedMinutes >= 48 - controls.closingWindowMinutes) {
    addNames(controls.closingLineup); reasons.push(elapsedMinutes >= 48 ? 'overtime-closing-group' : 'closing-group');
  } else if (elapsedMinutes < 48) {
    const stint = schedule.stints.find(row => elapsedMinutes >= row.startMinute - 1e-8 && elapsedMinutes < row.endMinute - 1e-8) ?? schedule.stints.at(-1);
    preferred.push(...stint.playerRefs); reasons.push(elapsedMinutes < schedule.openingStintMinutes ? 'saved-starters' : 'planned-rotation');
  } else {
    addNames(controls.starters); reasons.push('overtime-rotation');
  }
  addNames(controls.benchOrder);
  const budget = [...eligible].sort((a, b) =>
    (b.minutesTarget - valueAt(actualMinutes, b.playerRef)) - (a.minutesTarget - valueAt(actualMinutes, a.playerRef)) ||
    String(a.canonicalName).localeCompare(String(b.canonicalName)));
  preferred.push(...budget.map(player => player.playerRef));
  const selected = [], conditionalHolds = [];
  const append = ref => { if (byRef.has(ref) && !disqualified.has(ref) && !selected.includes(ref)) selected.push(ref); };
  for (const ref of protectedRefs) append(ref);
  for (const ref of preferred) {
    if (selected.length >= 5) break;
    if (!held.has(ref) && !foulHeld.has(ref)) append(ref);
  }
  // Foul trouble and fatigue thresholds are coaching preferences. They never
  // turn an otherwise eligible roster into a four-player team.
  if (selected.length < 5) for (const ref of preferred) {
    if (selected.length >= 5) break;
    if (!selected.includes(ref) && !disqualified.has(ref)) {
      append(ref); conditionalHolds.push({ playerRef: ref, reason: held.has(ref) ? 'fatigue-rule-relaxed-five-required' : 'foul-trouble-rule-relaxed-five-required' });
    }
  }
  if (foulHeld.size) reasons.push('foul-trouble');
  if (held.size) reasons.push('fatigue-rest');
  if (selected.some(ref => retained.has(ref))) reasons.push('depleted-roster-exception');
  const minuteBudget = remainingGameMinutes === undefined ? null : selectMinuteBudgetLineup({ players,
    preferredPlayerRefs: selected.slice(0, 5), eligiblePlayerRefs: eligible.map(player => player.playerRef),
    protectedPlayerRefs, actualMinutes, remainingGameMinutes, minimumStintMinutes });
  if (minuteBudget?.status === 'requires-review') return { status: 'requires-review', playerRefs: [],
    reason: 'hard-minute-capacity', violations: minuteBudget.violations, minuteBudget: minuteBudget.evidence,
    fatigueHoldRefs: [...held], conditionalHolds, disqualifiedPlayerRefs: [...disqualified] };
  if (minuteBudget?.evidence?.replacedPreferenceRefs.length) reasons.push('hard-minute-budget');
  if ((minuteBudget?.playerRefs ?? selected).some(ref => emergency.has(ref) && !activated.has(ref))) reasons.push('eligible-zero-target-emergency-reserve');
  return { status: 'pass', playerRefs: minuteBudget?.playerRefs ?? selected.slice(0, 5), reason: reasons.join('+'), violations: [],
    ...(minuteBudget ? { minuteBudget: minuteBudget.evidence } : {}),
    fatigueHoldRefs: [...held], conditionalHolds,
    disqualifiedPlayerRefs: [...disqualified] };
}
