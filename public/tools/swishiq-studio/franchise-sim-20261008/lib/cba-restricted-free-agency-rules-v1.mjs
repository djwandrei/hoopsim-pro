const SUPPORTED_RULE_VERSION_START = 2023;
const UNKNOWN_STATUS = /unknown|candidate|conflict|unresolved|unreported|missing|disputed|invalid/i;
const LAST_MINUTE_OF_DAY = 1439;

function hasOwn(value, key) {
  return Boolean(value && typeof value === 'object' && Object.hasOwn(value, key));
}

function unique(values) {
  return [...new Set(values)];
}

function addMissing(missingInputs, message) {
  if (!missingInputs.includes(message)) missingInputs.push(message);
}

function addViolation(violations, message) {
  if (!violations.includes(message)) violations.push(message);
}

function readValue(raw, parent = null, { seasonStartYear = null, label = 'Input' } = {}) {
  const wrapped = hasOwn(raw, 'value');
  const value = wrapped ? raw.value : raw;
  const statuses = [raw?.valueStatus, raw?.status, raw?.source?.valueStatus, raw?.source?.status,
    parent?.valueStatus, parent?.status, parent?.source?.valueStatus, parent?.source?.status];
  const invalidStatus = statuses.some(status => UNKNOWN_STATUS.test(String(status ?? '')));
  const parentSeason = hasOwn(parent?.seasonStartYear, 'value') ? parent.seasonStartYear.value : parent?.seasonStartYear;
  const seasonConflicts = [raw?.seasonStartYear, raw?.source?.seasonStartYear, parentSeason, parent?.source?.seasonStartYear]
    .some(year => year !== null && year !== undefined && Number.isInteger(seasonStartYear) && year !== seasonStartYear);
  return {
    value,
    known: !invalidStatus && !seasonConflicts && value !== null && value !== undefined && value !== '',
    invalidStatus,
    seasonConflicts,
    label,
  };
}

function readBoolean(raw, parent = null, options = {}) {
  const result = readValue(raw, parent, options);
  return typeof result.value === 'boolean' ? result : { ...result, known: false };
}

function readInteger(raw, parent = null, options = {}) {
  const result = readValue(raw, parent, options);
  return Number.isInteger(result.value) ? result : { ...result, known: false };
}

function readText(raw, parent = null, options = {}) {
  const result = readValue(raw, parent, options);
  return typeof result.value === 'string' && result.value.trim()
    ? { ...result, value: result.value.trim() }
    : { ...result, known: false };
}

function stateFromValue(raw, parent, allowedValues, options = {}) {
  const result = readText(raw, parent, options);
  if (!result.known) return result;
  const normalized = result.value.toLowerCase();
  return allowedValues.includes(normalized)
    ? { ...result, value: normalized }
    : { ...result, known: false, invalidValue: true };
}

function valueStatus(raw, parent) {
  const statuses = [raw?.valueStatus, raw?.status, raw?.source?.valueStatus, raw?.source?.status,
    parent?.valueStatus, parent?.status, parent?.source?.valueStatus, parent?.source?.status]
    .map(status => String(status ?? '').trim().toLowerCase())
    .filter(Boolean);
  return statuses.some(status => UNKNOWN_STATUS.test(status)) ? 'unknown' : 'resolved';
}

function evaluatorStatus(violations, missingInputs) {
  if (violations.length) return 'fail';
  return missingInputs.length ? 'unknown' : 'pass';
}

function readSeasonField(raw, parent, seasonStartYear, label, missingInputs) {
  if (raw === undefined || raw === null) {
    addMissing(missingInputs, `${label} is unresolved.`);
    return { known: false, value: null };
  }
  const result = readInteger(raw, parent, { seasonStartYear, label });
  if (!result.known) {
    addMissing(missingInputs, result.seasonConflicts
      ? `${label} season evidence conflicts with the offer-sheet season.`
      : `${label} is unresolved.`);
    return { known: false, value: null };
  }
  if (result.value < 0) return { known: false, value: result.value, invalid: true };
  return { known: true, value: result.value };
}

function readClock(clock, label, { phaseRequired = false, seasonMinimum = SUPPORTED_RULE_VERSION_START } = {}) {
  const missingInputs = [];
  const violations = [];
  if (!clock || typeof clock !== 'object' || Array.isArray(clock)) {
    addMissing(missingInputs, `${label} is required as a logical clock.`);
    return { clock: null, missingInputs, violations };
  }

  const readClockInteger = (key, minimum, maximum = Infinity, expectedSeasonStartYear = null) => {
    const result = readInteger(clock[key], clock, { seasonStartYear: expectedSeasonStartYear, label: `${label}.${key}` });
    if (!result.known) {
      addMissing(missingInputs, `${label}.${key} is unresolved.`);
      return null;
    }
    if (key === 'seasonStartYear' && result.value < minimum) {
      addMissing(missingInputs, `${label}.${key} is outside the supported 2023 CBA branch.`);
      return null;
    }
    if (result.value < minimum || result.value > maximum) {
      addViolation(violations, `${label}.${key} must be an integer from ${minimum} through ${maximum}.`);
      return null;
    }
    return result.value;
  };

  const season = readClockInteger('seasonStartYear', seasonMinimum);
  const dayIndex = readClockInteger('dayIndex', 0, Infinity, season);
  const minuteOfDayEastern = readClockInteger('minuteOfDayEastern', 0, LAST_MINUTE_OF_DAY, season);
  let phase = null;
  if (phaseRequired) {
    const phaseValue = stateFromValue(clock.phase, clock, ['moratorium', 'post-moratorium'], { seasonStartYear: season });
    if (!phaseValue.known) {
      addMissing(missingInputs, `${label}.phase must be moratorium or post-moratorium.`);
    } else {
      phase = phaseValue.value;
    }
  }
  const parsedClock = season === null || dayIndex === null || minuteOfDayEastern === null
    ? null
    : { seasonStartYear: season, dayIndex, minuteOfDayEastern, ...(phaseRequired ? { phase } : {}) };
  return { clock: parsedClock, missingInputs, violations };
}

function compareClocks(left, right) {
  for (const key of ['seasonStartYear', 'dayIndex', 'minuteOfDayEastern']) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

function output(status, violations, missingInputs, ruleRefs, extra = {}) {
  return {
    ...extra,
    status,
    violations: unique(violations),
    missingInputs: unique(missingInputs),
    ruleRefs: unique(ruleRefs),
    legalReady: false,
  };
}

/**
 * Checks the bounded Article XI, Section 5 offer-sheet term rules for standard
 * contracts. Option seasons do not count toward the minimum stated term. The
 * 2023 CBA's one- and two-year-service Arenas restrictions need the separate
 * Article XI, Section 5(d) branch and therefore remain unknown unless a
 * supported structural violation is already evident.
 *
 * The expected restrictedFreeAgency fields are `restricted`,
 * `qualifyingOfferStatus`, `maximumQualifyingOffer`, and `yearsOfService`.
 * Values may be supplied directly or with the simulator's evidence wrapper.
 * Each contract season needs explicit `teamOption`, `playerOption`, and
 * `twoWay` booleans; this evaluator checks only the offer-sheet structure and
 * not available cap room, salary/bonus limits, or the complete contract.
 */
export function evaluateRestrictedOfferSheetTerms({ contractSeasons, restrictedFreeAgency,
  mechanism, seasonStartYear, ruleVersionId = 'nba-nbpa-cba-2023' } = {}) {
  const violations = [];
  const missingInputs = [];
  const ruleRefs = ['XI-5b'];
  let maximumQualifyingOfferForMinimum = { known: false };

  if (ruleVersionId !== 'nba-nbpa-cba-2023') {
    addMissing(missingInputs, 'Restricted offer-sheet terms currently support only the signed 2023 CBA rule version.');
    return output('unknown', violations, missingInputs, []);
  }
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < SUPPORTED_RULE_VERSION_START) {
    addMissing(missingInputs, 'Restricted offer-sheet terms require a season governed by the signed 2023 CBA.');
    return output('unknown', violations, missingInputs, []);
  }

  if (!restrictedFreeAgency || typeof restrictedFreeAgency !== 'object' || Array.isArray(restrictedFreeAgency)) {
    addMissing(missingInputs, 'Restricted free-agency state is required.');
  } else {
    if (Number.isInteger(restrictedFreeAgency.seasonStartYear) && restrictedFreeAgency.seasonStartYear !== seasonStartYear) {
      addViolation(violations, 'Restricted free-agency state season conflicts with the offer-sheet season.');
    }

    let restricted;
    if (hasOwn(restrictedFreeAgency, 'restricted')) {
      restricted = readBoolean(restrictedFreeAgency.restricted, restrictedFreeAgency, { seasonStartYear, label: 'Restricted status' });
    } else if (['restricted', 'unrestricted'].includes(String(restrictedFreeAgency.status ?? '').toLowerCase())) {
      restricted = stateFromValue(restrictedFreeAgency.status, null, ['restricted', 'unrestricted'], { seasonStartYear, label: 'Restricted status' });
    } else {
      restricted = { known: false };
    }
    if (!restricted.known) addMissing(missingInputs, 'Restricted free-agent status is unresolved.');
    else if (restricted.value === false || restricted.value === 'unrestricted') {
      addViolation(violations, 'An offer sheet under Article XI, Section 5 requires a restricted free agent.');
    }

    const yearsOfService = readSeasonField(restrictedFreeAgency.yearsOfService, restrictedFreeAgency,
      seasonStartYear, 'Restricted free-agent years of service', missingInputs);
    if (yearsOfService.invalid) addViolation(violations, 'Restricted free-agent years of service cannot be negative.');
    if (yearsOfService.known && yearsOfService.value < 3) {
      ruleRefs.push('XI-5d');
      addMissing(missingInputs, 'The one- and two-year-service Arenas offer-sheet rules are outside this supported standard-contract branch.');
    }

    let qualifyingOfferStatus = { known: false };
    if (hasOwn(restrictedFreeAgency, 'qualifyingOfferStatus')) {
      qualifyingOfferStatus = stateFromValue(restrictedFreeAgency.qualifyingOfferStatus, restrictedFreeAgency,
        ['outstanding', 'not-outstanding'], { seasonStartYear, label: 'Qualifying-offer status' });
    } else if (restrictedFreeAgency.qualifyingOffer && typeof restrictedFreeAgency.qualifyingOffer === 'object') {
      qualifyingOfferStatus = stateFromValue(restrictedFreeAgency.qualifyingOffer.status, restrictedFreeAgency.qualifyingOffer,
        ['outstanding', 'not-outstanding'], { seasonStartYear, label: 'Qualifying-offer status' });
    }

    let maximumQualifyingOffer = { known: false };
    if (hasOwn(restrictedFreeAgency, 'maximumQualifyingOffer')) {
      const raw = restrictedFreeAgency.maximumQualifyingOffer;
      if (typeof raw === 'boolean' || hasOwn(raw, 'value')) {
        maximumQualifyingOffer = readBoolean(raw, restrictedFreeAgency,
          { seasonStartYear, label: 'Maximum qualifying-offer status' });
      } else if (raw && typeof raw === 'object') {
        const statusValue = stateFromValue(raw.status, raw, ['outstanding', 'not-outstanding'],
          { seasonStartYear, label: 'Maximum qualifying-offer status' });
        maximumQualifyingOffer = statusValue.known
          ? { ...statusValue, value: statusValue.value === 'outstanding' }
          : statusValue;
      }
    }
    if (!maximumQualifyingOffer.known) {
      addMissing(missingInputs, 'Whether the ROFR team tendered a Maximum Qualifying Offer is unresolved.');
    } else if (maximumQualifyingOffer.value && qualifyingOfferStatus.known && qualifyingOfferStatus.value !== 'outstanding') {
      addMissing(missingInputs, 'A Maximum Qualifying Offer requires confirmation that the qualifying offer was tendered with it.');
      maximumQualifyingOfferForMinimum = { known: false };
    } else if (maximumQualifyingOffer.value && !qualifyingOfferStatus.known) {
      addMissing(missingInputs, 'Whether both the qualifying offer and Maximum Qualifying Offer were tendered is unresolved.');
      maximumQualifyingOfferForMinimum = { known: false };
    } else {
      maximumQualifyingOfferForMinimum = maximumQualifyingOffer;
    }
  }

  const mechanismValue = readText(mechanism, null, { seasonStartYear, label: 'Signing mechanism' });
  if (!mechanismValue.known) addMissing(missingInputs, 'A resolved offer-sheet signing mechanism is required.');
  else if (mechanismValue.value !== 'cap-room') {
    addViolation(violations, 'The New Team must use cap room to extend an offer sheet.');
  }

  if (!Array.isArray(contractSeasons) || contractSeasons.length === 0) {
    addMissing(missingInputs, 'Offer-sheet review requires year-by-year contract terms.');
  } else {
    let nonOptionYears = 0;
    let optionStateKnown = true;
    for (const [index, term] of contractSeasons.entries()) {
      if (!term || typeof term !== 'object' || Array.isArray(term)) {
        optionStateKnown = false;
        addMissing(missingInputs, `Offer-sheet contract year ${index + 1} is unresolved.`);
        continue;
      }
      const expectedTermYear = seasonStartYear + index;
      const termSeason = readInteger(term.seasonStartYear ?? term.fromYear, term, { label: `Offer-sheet year ${index + 1} season` });
      if (!termSeason.known) {
        optionStateKnown = false;
        addMissing(missingInputs, `Offer-sheet year ${index + 1} season is unresolved.`);
      } else if (termSeason.value !== expectedTermYear) {
        optionStateKnown = false;
        addViolation(violations, 'Offer-sheet contract seasons must be consecutive from the supplied first season.');
      }
      const teamOption = readBoolean(term.teamOption, term, { seasonStartYear: expectedTermYear, label: `Offer-sheet year ${index + 1} team option` });
      const playerOption = readBoolean(term.playerOption, term, { seasonStartYear: expectedTermYear, label: `Offer-sheet year ${index + 1} player option` });
      const twoWay = readBoolean(term.twoWay, term, { seasonStartYear: expectedTermYear, label: `Offer-sheet year ${index + 1} contract type` });
      if (!teamOption.known || !playerOption.known) {
        optionStateKnown = false;
        addMissing(missingInputs, `Offer-sheet year ${index + 1} option status is unresolved.`);
      } else if (teamOption.value && playerOption.value) {
        optionStateKnown = false;
        addMissing(missingInputs, `Offer-sheet year ${index + 1} has conflicting team and player option rights.`);
      } else if (!teamOption.value && !playerOption.value) {
        nonOptionYears += 1;
      }

      if (!twoWay.known) addMissing(missingInputs, `Offer-sheet year ${index + 1} standard-contract status is unresolved.`);
      else if (twoWay.value) addViolation(violations, 'An offer sheet cannot be for a Two-Way Contract.');
    }

    if (optionStateKnown && restrictedFreeAgency && typeof restrictedFreeAgency === 'object') {
      if (maximumQualifyingOfferForMinimum.known) {
        const requiredNonOptionYears = maximumQualifyingOfferForMinimum.value === true || maximumQualifyingOfferForMinimum.value === 'outstanding' ? 3 : 2;
        if (nonOptionYears < requiredNonOptionYears) {
          addViolation(violations, `An offer sheet requires more than ${requiredNonOptionYears - 1} non-option seasons.`);
        }
      }
    }
  }

  return output(evaluatorStatus(violations, missingInputs), violations, missingInputs, ruleRefs);
}

/**
 * Returns the First Refusal Exercise Notice deadline under Article XI,
 * Sections 5(g) and 5(i). The logical clock uses a season-relative day index;
 * for a moratorium receipt, `moratoriumEndDayIndex` must be supplied as the
 * day index for the CBA's July 7 deadline in that offseason.
 */
export function calculateOfferSheetMatchDeadline({ receivedClock, ruleVersionId = 'nba-nbpa-cba-2023' } = {}) {
  const violations = [];
  const missingInputs = [];
  const ruleRefs = ['XI-5g', 'XI-5i'];
  if (ruleVersionId !== 'nba-nbpa-cba-2023') {
    addMissing(missingInputs, 'Offer-sheet matching deadlines currently support only the signed 2023 CBA rule version.');
    return output('unknown', violations, missingInputs, [] , { deadlineClock: null });
  }
  const parsed = readClock(receivedClock, 'Received clock', { phaseRequired: true });
  violations.push(...parsed.violations);
  missingInputs.push(...parsed.missingInputs);
  let deadlineClock = null;

  if (parsed.clock) {
    if (parsed.clock.phase === 'moratorium') {
      const endDay = readInteger(receivedClock.moratoriumEndDayIndex, receivedClock,
        { seasonStartYear: parsed.clock.seasonStartYear, label: 'Moratorium end day index' });
      if (!endDay.known) {
        addMissing(missingInputs, 'The moratorium July 7 end-day index is required for an offer sheet received during the moratorium.');
      } else if (endDay.value < parsed.clock.dayIndex || endDay.value < 0) {
        addViolation(violations, 'The moratorium July 7 end-day index cannot precede the offer-sheet receipt day.');
      } else {
        deadlineClock = {
          seasonStartYear: parsed.clock.seasonStartYear,
          dayIndex: endDay.value,
          minuteOfDayEastern: LAST_MINUTE_OF_DAY,
          phase: 'post-moratorium',
        };
      }
    } else if (parsed.clock.phase === 'post-moratorium') {
      const dayOffset = parsed.clock.minuteOfDayEastern < 12 * 60 ? 1 : 2;
      deadlineClock = {
        seasonStartYear: parsed.clock.seasonStartYear,
        dayIndex: parsed.clock.dayIndex + dayOffset,
        minuteOfDayEastern: LAST_MINUTE_OF_DAY,
        phase: 'post-moratorium',
      };
    }
  }

  return output(evaluatorStatus(violations, missingInputs), violations, missingInputs, ruleRefs, { deadlineClock });
}

/**
 * Checks only the one-year anti-trade rules that follow an offer-sheet match.
 * `restriction.newTeamCode` is the original offer-sheet team,
 * `restriction.matchedTeamCode` is the ROFR team, and `expiresClock` is the
 * caller's explicit one-year expiration clock. The no-consent rule applies
 * when `fromTeamCode` is the matched team; the original offer-sheet destination
 * remains barred regardless of the current trade source.
 */
export function evaluateMatchedOfferSheetTradeRestriction({ restriction, fromTeamCode, toTeamCode,
  playerConsent, clock, ruleVersionId = 'nba-nbpa-cba-2023' } = {}) {
  const violations = [];
  const missingInputs = [];
  const ruleRefs = ['XI-5j'];
  if (ruleVersionId !== 'nba-nbpa-cba-2023') {
    addMissing(missingInputs, 'Matched-offer-sheet trade restrictions currently support only the signed 2023 CBA rule version.');
    return output('unknown', violations, missingInputs, [] , { restrictionActive: null });
  }

  if (!restriction || typeof restriction !== 'object' || Array.isArray(restriction)) {
    addMissing(missingInputs, 'Matched offer-sheet trade-restriction state is required.');
    return output('unknown', violations, missingInputs, ruleRefs);
  }
  if (valueStatus(restriction, null) === 'unknown') {
    addMissing(missingInputs, 'Matched offer-sheet trade-restriction evidence is unresolved.');
  }

  const current = readClock(clock, 'Current clock');
  const expires = readClock(restriction.expiresClock, 'Offer-sheet trade-restriction expiration clock');
  violations.push(...current.violations, ...expires.violations);
  missingInputs.push(...current.missingInputs, ...expires.missingInputs);
  const target = readText(toTeamCode, null, { seasonStartYear: current.clock?.seasonStartYear, label: 'Trade destination' });
  if (!target.known) addMissing(missingInputs, 'A resolved trade destination team code is required.');
  const newTeam = readText(restriction.newTeamCode, restriction, { label: 'Original offer-sheet team' });
  const matchedTeam = readText(restriction.matchedTeamCode, restriction, { label: 'ROFR match team' });
  if (!newTeam.known) addMissing(missingInputs, 'The original offer-sheet team is unresolved.');
  if (!matchedTeam.known) addMissing(missingInputs, 'The team that matched the offer sheet is unresolved.');
  let matched = null;
  if (restriction.matchedClock !== undefined && restriction.matchedClock !== null) {
    const matchClock = readClock(restriction.matchedClock, 'Offer-sheet match clock');
    violations.push(...matchClock.violations);
    missingInputs.push(...matchClock.missingInputs);
    matched = matchClock.clock;
  }

  if (current.clock && expires.clock && matched) {
    if (compareClocks(expires.clock, matched) <= 0) {
      addMissing(missingInputs, 'The explicit expiration clock must follow the recorded offer-sheet match clock.');
    } else if (compareClocks(current.clock, matched) < 0) {
      addMissing(missingInputs, 'The current clock predates the recorded offer-sheet match.');
    }
  }

  const active = current.clock && expires.clock ? compareClocks(current.clock, expires.clock) < 0 : null;
  if (active === false) {
    return output(evaluatorStatus(violations, missingInputs), violations, missingInputs, ruleRefs, { restrictionActive: false });
  }

  if (active === true && target.known && newTeam.known &&
      target.value.trim().toUpperCase() === newTeam.value.trim().toUpperCase()) {
    addViolation(violations, 'For one year after a match, the player cannot be traded to the team whose offer sheet was matched.');
  } else if (active === true) {
    const sender = readText(fromTeamCode, null, { label: 'Trade source' });
    if (!sender.known) {
      addMissing(missingInputs, 'A resolved trade source is required to determine whether the matched team needs player consent.');
    } else if (matchedTeam.known && sender.value.trim().toUpperCase() === matchedTeam.value.trim().toUpperCase()) {
      const consent = readBoolean(playerConsent, null, {
        seasonStartYear: current.clock?.seasonStartYear,
        label: 'Player trade consent',
      });
      if (!consent.known) addMissing(missingInputs, 'Player consent is required to resolve a trade by the team that matched the offer sheet.');
      else if (!consent.value) addViolation(violations, 'For one year after a match, the team that exercised the right of first refusal cannot trade the player without consent.');
    }
  }

  return output(evaluatorStatus(violations, missingInputs), violations, missingInputs, ruleRefs,
    { restrictionActive: active });
}
