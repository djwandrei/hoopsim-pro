const SOURCE = 'https://official.nba.com/rule-no-5-scoring-and-timing/';
const clone = value => structuredClone(value);

/** Current (2017 onward) standard NBA timeout counts for this live prototype.
 * Wall-clock broadcast length, advance-the-ball choices and coach challenges
 * are outside this contract. No excess-timeout technical is generated. */
export function createNbaTimeoutState() {
  return { format: 'djhc-nba-timeout-state-v1', ruleProfile: 'nba-2017-onward',
    regulationUsed: { home: 0, away: 0 }, periods: {}, ledger: [], sourceRefs: [SOURCE] };
}

function periodInfo(period) {
  if (typeof period !== 'string') return null;
  const match = /^(Q[1-4]|OT[1-9]\d*)$/.exec(period ?? '');
  return match ? { overtime: period.startsWith('OT'), length: period.startsWith('OT') ? 300 : 720 } : null;
}

export function validateNbaTimeoutState(state) {
  const violations = [];
  if (state?.format !== 'djhc-nba-timeout-state-v1' || state?.ruleProfile !== 'nba-2017-onward' ||
      !Array.isArray(state?.ledger) || !state?.periods || typeof state.periods !== 'object' || Array.isArray(state.periods) ||
      !Array.isArray(state?.sourceRefs) || !state.sourceRefs.includes(SOURCE) ||
      !state?.regulationUsed || !['home', 'away'].every(side => Number.isInteger(state.regulationUsed[side]) &&
        state.regulationUsed[side] >= 0 && state.regulationUsed[side] <= 7)) {
    return { status: 'requires-review', violations: ['Timeout state format, counts or ledger are invalid.'] };
  }
  const periods = {}, counts = { home: 0, away: 0 };
  let lastPeriodNumber = 0;
  for (const [i, row] of state.ledger.entries()) {
    const info = periodInfo(row?.period);
    if (!info || !['home', 'away'].includes(row?.side) || row.index !== i + 1 ||
        !Number.isFinite(row.clockSeconds) || row.clockSeconds <= 0 || row.clockSeconds > info.length ||
        typeof row.cause !== 'string' || !row.cause || !Array.isArray(row.sourceRefs) || !row.sourceRefs.includes(SOURCE)) {
      violations.push('Timeout ledger has an invalid charge receipt.');
      continue;
    }
    const periodNumber = info.overtime ? 4 + Number(row.period.slice(2)) : Number(row.period.slice(1));
    const prior = periods[row.period] ??= [];
    if (periodNumber < lastPeriodNumber || (prior.length && row.clockSeconds > prior.at(-1).clockSeconds + 1e-7)) violations.push('Timeout receipts are out of game-clock order.');
    lastPeriodNumber = periodNumber;
    const late = row.period === 'Q4' && row.clockSeconds <= 180 && prior.length >= 2;
    if (row.lateWindowActive !== late || row.mandatoryOrdinal !== (!info.overtime && prior.length < 2 ? prior.length + 1 : null)) violations.push('Timeout receipt phase or mandatory ordinal conflicts with prior charges.');
    const used = prior.filter(item => item.side === row.side).length;
    if ((info.overtime && used >= 2) || (row.period === 'Q4' && used >= 4) ||
        (late && prior.filter(item => item.side === row.side && item.lateWindowActive).length >= 2)) violations.push('Timeout ledger exceeds a period or late-window quota.');
    if (!info.overtime) counts[row.side] += 1;
    prior.push(row);
  }
  for (const side of ['home', 'away']) if (counts[side] !== state.regulationUsed[side] || counts[side] > 7) violations.push('Timeout regulation count does not reconcile to charges.');
  if (JSON.stringify(Object.keys(periods).sort()) !== JSON.stringify(Object.keys(state.periods).sort()) ||
      Object.keys(periods).some(period => JSON.stringify(periods[period]) !== JSON.stringify(state.periods[period]))) violations.push('Timeout period groups do not reconcile to the ledger.');
  return { status: violations.length ? 'requires-review' : 'pass', violations: [...new Set(violations)] };
}

export function evaluateNbaTimeout({ state, side, period, clockSeconds, ballDead = false,
  possessionSide = null } = {}) {
  const validation = validateNbaTimeoutState(state);
  const violations = [...validation.violations], info = periodInfo(period);
  if (validation.status !== 'pass') return { status: 'requires-review', violations, sourceRefs: [SOURCE] };
  if (!['home', 'away'].includes(side)) violations.push('Timeout needs an existing team side.');
  if (typeof ballDead !== 'boolean' || (possessionSide !== null && !['home', 'away'].includes(possessionSide))) violations.push('Timeout ball state and possession side are invalid.');
  if (!info || !Number.isFinite(clockSeconds) || clockSeconds <= 0 || clockSeconds > info.length) violations.push('Timeout needs a valid live period clock.');
  if (!ballDead && possessionSide !== side) violations.push('A live-ball timeout requires control of the ball by the requesting team.');
  const ledger = state?.periods?.[period] ?? [];
  const used = ledger.filter(row => row.side === side).length;
  const last = state.ledger.at(-1);
  if (last && info) {
    const number = value => value.startsWith('OT') ? 4 + Number(value.slice(2)) : Number(value.slice(1));
    if (number(period) < number(last.period) || (period === last.period && clockSeconds > last.clockSeconds + 1e-7)) violations.push('Timeout request precedes an already recorded charge.');
  }
  // The second mandatory timeout's conclusion may be later than the three-minute
  // mark. Its own charge precedes the late-window limit, so it is not counted.
  const lateWindowActive = period === 'Q4' && clockSeconds <= 180 && ledger.length >= 2;
  const lateUsed = ledger.filter(row => row.side === side && row.lateWindowActive).length;
  if (info?.overtime && used >= 2) violations.push('No overtime team timeouts remain.');
  if (info && !info.overtime && (state?.regulationUsed?.[side] ?? 7) >= 7) violations.push('No regulation team timeouts remain.');
  if (period === 'Q4' && used >= 4) violations.push('Fourth-quarter team timeout limit reached.');
  if (lateWindowActive && lateUsed >= 2) violations.push('Late fourth-quarter team timeout limit reached.');
  return { status: violations.length ? 'requires-review' : 'available', violations,
    lateWindowActive, mandatoryOrdinal: info && !info.overtime && ledger.length < 2 ? ledger.length + 1 : null,
    sourceRefs: [SOURCE] };
}

export function chargeNbaTimeout(options = {}) {
  const evaluation = evaluateNbaTimeout(options);
  if (options.cause !== undefined && (typeof options.cause !== 'string' || !options.cause.trim())) {
    evaluation.status = 'requires-review'; evaluation.violations.push('Timeout charge requires a nonempty cause.');
  }
  if (evaluation.status !== 'available') return { status: 'rejected', state: clone(options.state), evaluation, receipt: null };
  const next = clone(options.state), { side, period, clockSeconds, cause = 'team-request' } = options;
  const receipt = { index: next.ledger.length + 1, side, period, clockSeconds, cause,
    lateWindowActive: evaluation.lateWindowActive, mandatoryOrdinal: evaluation.mandatoryOrdinal,
    sourceRefs: [SOURCE] };
  next.periods[period] ??= [];
  next.periods[period].push(receipt);
  next.ledger.push(receipt);
  if (!period.startsWith('OT')) next.regulationUsed[side] += 1;
  return { status: 'charged', state: next, evaluation, receipt };
}

/** Return a due mandatory charge only at a modeled dead ball. Team-requested
 * first/second timeouts already satisfy their corresponding mandatory slots.
 * Null means the supplied request and timeout state were valid, with no charge
 * due at this clock. Invalid inputs are explicit review results. */
export function dueNbaMandatoryTimeout(options = {}) {
  const input = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const { state, period, clockSeconds, ballDead } = input;
  const violations = [];
  if (!input || input !== options || Array.isArray(options)) violations.push('Mandatory timeout request must be an object.');

  const stateValidation = validateNbaTimeoutState(state);
  if (stateValidation.status !== 'pass') violations.push(...stateValidation.violations);

  const info = typeof period === 'string' ? periodInfo(period) : null;
  if (!info) violations.push('Mandatory timeout needs a supported game period (Q1-Q4 or OT1 and later).');
  if (typeof clockSeconds !== 'number' || !Number.isFinite(clockSeconds) || clockSeconds < 0 ||
      (info && clockSeconds > info.length)) {
    violations.push('Mandatory timeout needs a nonnegative clock within the selected period.');
  }
  if (!Object.hasOwn(input, 'ballDead') || typeof ballDead !== 'boolean') {
    violations.push('Mandatory timeout needs an explicit boolean ball-dead state.');
  }
  if (violations.length) return { status: 'requires-review', violations: [...new Set(violations)], sourceRefs: [SOURCE] };
  if (!ballDead || info.overtime || clockSeconds === 0) return null;

  const ledger = state.periods[period] ?? [];
  if (ledger.length === 0 && clockSeconds <= 419) return { side: 'home', cause: 'first-mandatory' };
  if (ledger.length === 1 && clockSeconds <= 179) return { side: ledger[0].side === 'home' ? 'away' : 'home', cause: 'second-mandatory' };
  return null;
}
