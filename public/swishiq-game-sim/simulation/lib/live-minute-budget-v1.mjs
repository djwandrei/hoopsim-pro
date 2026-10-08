const EPSILON = 1e-7;
const read = (values, ref) => values instanceof Map ? values.get(ref) ?? 0 : values?.[ref] ?? 0;

/** Preserve five-player feasibility under explicit game-wide minute caps.
 * Coaching targets are preferences; caps are never relaxed. A capacity check
 * cannot guarantee future fouls or legal stoppages, which runtime checks too. */
export function selectMinuteBudgetLineup({ players = [], preferredPlayerRefs = [],
  eligiblePlayerRefs,
  protectedPlayerRefs = [], actualMinutes = new Map(), remainingGameMinutes,
  minimumStintMinutes = 0 } = {}) {
  const violations = [];
  if (!Array.isArray(players) || players.some(player => !player || typeof player !== 'object') ||
      !Array.isArray(preferredPlayerRefs) || !Array.isArray(protectedPlayerRefs) ||
      (eligiblePlayerRefs !== undefined && !Array.isArray(eligiblePlayerRefs)) ||
      (!actualMinutes || typeof actualMinutes !== 'object' || Array.isArray(actualMinutes))) {
    return { status: 'requires-review', playerRefs: [], violations: ['Minute budget needs player/reference arrays and a minute map or object.'] };
  }
  if (!Number.isFinite(remainingGameMinutes) || remainingGameMinutes < 0 ||
      !Number.isFinite(minimumStintMinutes) || minimumStintMinutes < 0) {
    return { status: 'requires-review', playerRefs: [], violations: ['Minute budget needs finite nonnegative game/stint horizons.'] };
  }
  const horizon = Math.min(remainingGameMinutes, minimumStintMinutes);
  const futureTime = Math.max(0, remainingGameMinutes - horizon);
  const eligible = new Set(eligiblePlayerRefs ?? players.filter(player => player.minutesTarget > 0).map(player => player.playerRef));
  const protectedRefs = new Set(protectedPlayerRefs);
  const rows = players.filter(player => eligible.has(player.playerRef)).map(player => {
    const played = read(actualMinutes, player.playerRef), cap = player.hardMinutesLimit ?? Infinity;
    if (!Number.isFinite(played) || played < 0 || (player.hardMinutesLimit !== null && player.hardMinutesLimit !== undefined &&
        (!Number.isFinite(cap) || cap < 0))) {
      violations.push(`Invalid minute capacity for ${player.canonicalName ?? player.playerRef}.`);
    }
    if (played > cap + EPSILON) violations.push(`${player.canonicalName ?? player.playerRef} already exceeds its hard minute limit.`);
    const remaining = Math.max(0, cap - played);
    const capacity = Math.min(remaining, remainingGameMinutes);
    const capacityWithoutStint = Math.min(remaining, futureTime);
    const capacityAfterStint = Math.min(Math.max(0, remaining - horizon), futureTime);
    return { playerRef: player.playerRef, canonicalName: player.canonicalName, cap, played, remaining,
      capacity, capacityWithoutStint, capacityCost: capacityWithoutStint - capacityAfterStint };
  });
  if (new Set(rows.map(row => row.playerRef)).size !== rows.length) violations.push('Minute budget player references must be unique.');
  const byRef = new Map(rows.map(row => [row.playerRef, row]));
  const safe = rows.filter(row => row.remaining + EPSILON >= horizon && (remainingGameMinutes <= EPSILON || row.remaining > EPSILON));
  const safeRefs = new Set(safe.map(row => row.playerRef));
  for (const ref of protectedRefs) if (!safeRefs.has(ref)) violations.push('A protected player cannot satisfy the remaining stint under its hard cap.');
  if (protectedRefs.size > 5) violations.push('At most five players can be protected.');
  const totalRemainingCapacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  const requiredTeamMinutes = remainingGameMinutes * 5;
  if (safe.length < 5) violations.push('Fewer than five eligible players have capacity for the next reserved stint.');
  if (totalRemainingCapacity + EPSILON < requiredTeamMinutes) violations.push('Remaining minute capacity cannot cover the rest of the game.');
  const baseFutureCapacity = rows.reduce((sum, row) => sum + row.capacityWithoutStint, 0);
  const fits = refs => refs.length === 5 && new Set(refs).size === 5 &&
    refs.every(ref => safeRefs.has(ref)) && [...protectedRefs].every(ref => refs.includes(ref)) &&
    baseFutureCapacity - refs.reduce((sum, ref) => sum + byRef.get(ref).capacityCost, 0) + EPSILON >= futureTime * 5;
  let selected = [...preferredPlayerRefs];
  if (!fits(selected)) {
    const rank = new Map(preferredPlayerRefs.map((ref, index) => [ref, index]));
    selected = [...protectedRefs];
    const candidates = safe.filter(row => !protectedRefs.has(row.playerRef)).sort((a, b) =>
      a.capacityCost - b.capacityCost || (rank.get(a.playerRef) ?? Infinity) - (rank.get(b.playerRef) ?? Infinity) ||
      String(a.canonicalName ?? a.playerRef).localeCompare(String(b.canonicalName ?? b.playerRef)));
    for (const row of candidates) if (selected.length < 5) selected.push(row.playerRef);
    if (!fits(selected)) violations.push('No five-player choice preserves the remaining game-minute capacity.');
  }
  const evidence = { format: 'djhc-live-minute-budget-v1', remainingGameMinutes,
    minimumStintMinutes: horizon, totalRemainingCapacity, requiredTeamMinutes,
    hardLimitedPlayers: rows.filter(row => row.cap !== Infinity).map(row => ({ ...row })),
    capHeldPlayerRefs: rows.filter(row => !safeRefs.has(row.playerRef)).map(row => row.playerRef),
    replacedPreferenceRefs: preferredPlayerRefs.filter(ref => !selected.includes(ref)),
    insertedPlayerRefs: selected.filter(ref => !preferredPlayerRefs.includes(ref)) };
  return { status: violations.length ? 'requires-review' : 'pass', playerRefs: violations.length ? [] : selected,
    violations: [...new Set(violations)], evidence };
}
