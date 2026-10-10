const FORMAT = 'djhc-nba-foul-disqualification-v1';
const LINEUP_SIZE = 5;

const SOURCE_REFS = [
  {
    ruleRef: 'NBA Rule 3, Section I(a)',
    url: 'https://official.nba.com/rule-no-3-players-substitutes-and-coaches/',
  },
  {
    ruleRef: 'NBA Rule 12, Section A, V(7), V(10), V(14)',
    url: 'https://official.nba.com/rule-no-12-fouls-and-penalties/',
  },
];

function refKey(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const key = String(value).trim();
  return key || null;
}

function parseRefs(value, name, { required = true } = {}) {
  const violations = [];
  const missingInputs = [];
  if (value === undefined || value === null) {
    if (required) missingInputs.push(name);
    return { refs: [], keys: [], violations, missingInputs };
  }
  if (!Array.isArray(value)) {
    violations.push(`${name} must be an array of unique string or numeric references.`);
    return { refs: [], keys: [], violations, missingInputs };
  }

  const refs = [...value];
  const keys = [];
  const seen = new Set();
  for (const [index, ref] of refs.entries()) {
    const key = refKey(ref);
    if (!key) {
      violations.push(`${name}[${index}] must be a non-empty string or finite numeric reference.`);
      continue;
    }
    if (seen.has(key)) violations.push(`${name} contains duplicate reference ${key}.`);
    seen.add(key);
    keys.push(key);
  }
  return { refs, keys, violations, missingInputs };
}

function parseFoulCounts(foulsByRef) {
  const violations = [];
  const missingInputs = [];
  const counts = new Map();
  let entries;

  if (foulsByRef === undefined || foulsByRef === null) {
    missingInputs.push('foulsByRef');
    return { counts, violations, missingInputs };
  }
  if (foulsByRef instanceof Map) {
    entries = [...foulsByRef.entries()];
  } else if (typeof foulsByRef === 'object' && !Array.isArray(foulsByRef)) {
    entries = Object.entries(foulsByRef);
  } else {
    violations.push('foulsByRef must be a Map or object of nonnegative integer counts.');
    return { counts, violations, missingInputs };
  }

  for (const [ref, foulCount] of entries) {
    const key = refKey(ref);
    if (!key) {
      violations.push('foulsByRef contains an invalid player reference.');
      continue;
    }
    if (counts.has(key)) violations.push(`foulsByRef contains duplicate normalized reference ${key}.`);
    if (!Number.isInteger(foulCount) || foulCount < 0) {
      violations.push(`Foul count for ${key} must be a nonnegative integer.`);
      continue;
    }
    counts.set(key, foulCount);
  }
  return { counts, violations, missingInputs };
}

function result({
  status,
  action,
  foulingPlayerRef,
  eligibleReplacementRefs = [],
  retainedPlayerRefs = [],
  technicalFreeThrowAttempts = 0,
  missingInputs = [],
  violations = [],
}) {
  return {
    format: FORMAT,
    version: 1,
    status,
    action,
    foulingPlayerRef,
    eligibleReplacementRefs: [...eligibleReplacementRefs],
    retainedPlayerRefs: [...retainedPlayerRefs],
    technicalFreeThrowAttempts,
    missingInputs: [...new Set(missingInputs)],
    violations: [...new Set(violations)],
    sourceRefs: SOURCE_REFS.map(source => ({ ...source })),
    disclosures: [
      'foulsByRef is interpreted as the current count including the foul being evaluated; counts are not incremented here.',
      'eligiblePlayerRefs is the caller-supplied game roster. This helper does not infer dressed, injured, suspended, or otherwise available players.',
      'This is a bounded personal-foul disqualification and retained-player penalty decision; it does not model other foul penalties, substitution timing, or financial legality.',
    ],
  };
}

/**
 * Evaluate a player foul against the NBA six-personal-foul disqualification rule.
 * This helper is pure and treats the supplied foul counts as already current.
 */
export function evaluatePersonalFoulDisqualification({
  foulingPlayerRef,
  foulsByRef,
  currentLineupRefs,
  eligiblePlayerRefs,
  retainedPlayerRefs = [],
} = {}) {
  const lineup = parseRefs(currentLineupRefs, 'currentLineupRefs');
  const eligible = parseRefs(eligiblePlayerRefs, 'eligiblePlayerRefs');
  const retained = parseRefs(retainedPlayerRefs, 'retainedPlayerRefs', { required: false });
  const foulCounts = parseFoulCounts(foulsByRef);
  const violations = [
    ...lineup.violations,
    ...eligible.violations,
    ...retained.violations,
    ...foulCounts.violations,
  ];
  const missingInputs = [
    ...lineup.missingInputs,
    ...eligible.missingInputs,
    ...foulCounts.missingInputs,
  ];
  const safeRetained = retained.refs.length === retained.keys.length ? retained.refs : [];

  if (foulingPlayerRef === undefined || foulingPlayerRef === null || !refKey(foulingPlayerRef)) {
    missingInputs.push('foulingPlayerRef');
  }
  if (lineup.keys.length !== LINEUP_SIZE) violations.push('currentLineupRefs must contain exactly five unique players.');
  if (eligible.keys.length < LINEUP_SIZE) violations.push('eligiblePlayerRefs must contain at least the five current players.');

  const lineupKeys = new Set(lineup.keys);
  const eligibleKeys = new Set(eligible.keys);
  for (const key of lineup.keys) {
    if (!eligibleKeys.has(key)) violations.push(`Current player ${key} is absent from eligiblePlayerRefs.`);
  }
  for (const key of retained.keys) {
    if (!eligibleKeys.has(key)) violations.push(`Retained player ${key} is absent from eligiblePlayerRefs.`);
    if (!lineupKeys.has(key)) violations.push(`Retained player ${key} must remain in currentLineupRefs.`);
    if (!foulCounts.counts.has(key)) missingInputs.push(`foulsByRef[${key}]`);
    else if (foulCounts.counts.get(key) < 6) violations.push(`Retained player ${key} must have at least six personal fouls.`);
  }

  const foulerKey = refKey(foulingPlayerRef);
  if (foulerKey) {
    if (!lineupKeys.has(foulerKey)) violations.push(`Fouling player ${foulerKey} is not in currentLineupRefs.`);
    if (!eligibleKeys.has(foulerKey)) violations.push(`Fouling player ${foulerKey} is unknown to eligiblePlayerRefs.`);
    if (!foulCounts.counts.has(foulerKey)) missingInputs.push(`foulsByRef[${foulerKey}]`);
  }

  if (violations.length || missingInputs.length) {
    return result({
      status: 'requires-review',
      action: 'requires-review',
      foulingPlayerRef,
      retainedPlayerRefs: safeRetained,
      missingInputs,
      violations,
    });
  }

  const fouls = foulCounts.counts.get(foulerKey);
  const retainedKeys = new Set(retained.keys);
  if (fouls < 6) {
    return result({
      status: 'supported',
      action: 'none',
      foulingPlayerRef,
      retainedPlayerRefs: safeRetained,
    });
  }

  const reserves = eligible.refs.filter((ref, index) => !lineupKeys.has(eligible.keys[index]));
  const reservesWithUnknownFoulCounts = reserves.filter(ref => !foulCounts.counts.has(refKey(ref)));
  if (reservesWithUnknownFoulCounts.length) {
    return result({
      status: 'requires-review',
      action: 'requires-review',
      foulingPlayerRef,
      retainedPlayerRefs: safeRetained,
      missingInputs: reservesWithUnknownFoulCounts.map(ref => `foulsByRef[${refKey(ref)}]`),
    });
  }

  const eligibleReplacementRefs = reserves.filter(ref => {
    const key = refKey(ref);
    return foulCounts.counts.get(key) < 6 && !retainedKeys.has(key);
  });
  const retainedAfterReplacement = safeRetained.filter(ref => refKey(ref) !== foulerKey);

  if (eligibleReplacementRefs.length) {
    return result({
      status: 'supported',
      action: 'disqualify-and-replace',
      foulingPlayerRef,
      eligibleReplacementRefs,
      retainedPlayerRefs: retainedAfterReplacement,
    });
  }

  const retainedAfterFallback = [...safeRetained];
  if (!retainedKeys.has(foulerKey)) retainedAfterFallback.push(foulingPlayerRef);
  return result({
    status: 'supported',
    action: 'retain-with-team-technical',
    foulingPlayerRef,
    retainedPlayerRefs: retainedAfterFallback,
    technicalFreeThrowAttempts: 1,
  });
}
