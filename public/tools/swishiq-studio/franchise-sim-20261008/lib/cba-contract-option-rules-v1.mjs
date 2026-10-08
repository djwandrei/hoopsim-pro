const INVALID_STATUS = /unknown|candidate|conflict|unresolved|unreported|missing|disputed|invalid/i;
const SUPPORTED_RULE_VERSION = 'nba-nbpa-cba-2023';

function readValue(raw, parent = null) {
  const value = raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw;
  const statuses = [raw?.valueStatus, raw?.status, parent?.valueStatus, parent?.status];
  if (statuses.some(status => INVALID_STATUS.test(String(status ?? '')))) return { value: null, known: false };
  return { value, known: value !== null && value !== undefined && value !== '' };
}

function readBoolean(raw, parent = null) {
  const result = readValue(raw, parent);
  return typeof result.value === 'boolean' ? result : { value: null, known: false };
}

function readAmount(raw, parent = null) {
  const result = readValue(raw, parent);
  if (!result.known || typeof result.value === 'boolean' || !Number.isFinite(Number(result.value)) || Number(result.value) < 0) {
    return { value: null, known: false };
  }
  return { value: Number(result.value), known: true };
}

function addMissing(missingInputs, message) {
  if (!missingInputs.includes(message)) missingInputs.push(message);
}

function addViolation(violations, message) {
  if (!violations.includes(message)) violations.push(message);
}

/**
 * Bounded option-clause review for ordinary contracts and first-round rookie
 * scale contracts. Option-year salary scale bounds and the actual option
 * exercise transaction/date are separate checks. Inputs may use the simulator's
 * { value, valueStatus } evidence wrapper; bad evidence stays unresolved.
 *
 * For an ordinary option year, terms must provide `optionConditional: false`
 * and `optionTermsUnchanged: true`, which attest the fixed exercise right and
 * the unchanged non-compensation contract terms required by Article XII.
 * A player option also needs `playerWouldBeRestrictedFreeAgentIfDeclined` to
 * select the June 25 or June 29 deadline rule. If option-year salary protection
 * is positive, `playerOptionProtectionClause` must be `A` or `B`; clause B also
 * needs `playerOptionExerciseNoEarlierThanDayAfterLastGame: true`.
 *
 * Rookie-scale option years use `optionConditional: false`; the fourth-year
 * option also needs `optionTermsUnchanged: true` relative to the third-year
 * option. Rookie salary bounds and the fourth-year salary increase are checked
 * by evaluateContractSalaryScale, not duplicated here.
 * Multiple ordinary option years and overlapping team/player rights are kept
 * unknown because Article XII does not expressly resolve those shapes.
 */
export function evaluateContractOptionRules({ contractSeasons, contractProfile = 'standard',
  seasonStartYear, ruleVersionId = SUPPORTED_RULE_VERSION } = {}) {
  const violations = [], missingInputs = [], optionDeadlineRules = [];
  const ruleRefs = ['XII-1', 'XII-2', 'XII-3', 'XII-4'];
  const profile = typeof contractProfile === 'string' ? contractProfile : contractProfile?.contractType ?? contractProfile?.type;
  const rookie = profile === 'first-round-rookie' || profile === 'first-round-rookie-scale';
  const supportedProfile = ['standard', 'first-round-rookie', 'first-round-rookie-scale'].includes(profile);

  if (ruleVersionId !== SUPPORTED_RULE_VERSION) addMissing(missingInputs, 'Supported signed 2023 CBA option rules are required.');
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < 2023) addMissing(missingInputs, 'A supported first contract season is required.');
  if (!supportedProfile) {
    addMissing(missingInputs, 'Contract profile is outside the ordinary and first-round rookie option branches.');
  }
  if (rookie) ruleRefs.push('VIII-1a', 'VIII-1c');

  if (ruleVersionId !== SUPPORTED_RULE_VERSION || !Number.isInteger(seasonStartYear) || seasonStartYear < 2023 || !supportedProfile) {
    return { status: 'unknown', violations, missingInputs, optionDeadlineRules, ruleRefs, legalReady: false };
  }

  if (!Array.isArray(contractSeasons) || contractSeasons.length === 0) {
    addMissing(missingInputs, 'Option checks require year-by-year contract terms.');
  }

  if (Array.isArray(contractSeasons) && contractSeasons.length > 0 && Number.isInteger(seasonStartYear)) {
    for (const [index, term] of contractSeasons.entries()) {
      const year = readValue(term?.seasonStartYear ?? term?.fromYear, term);
      if (!year.known || !Number.isInteger(year.value)) addMissing(missingInputs, `Contract year ${index + 1} has no resolved season.`);
      else if (year.value !== seasonStartYear + index) addViolation(violations, 'Contract seasons must be consecutive from the supplied first season.');
    }

    if (rookie && contractSeasons.length !== 4) {
      addViolation(violations, 'A first-round rookie scale contract must contain two stated seasons and two team option seasons.');
    }

    const options = [];
    for (const [index, term] of contractSeasons.entries()) {
      const teamOption = readBoolean(term?.teamOption, term);
      const playerOption = readBoolean(term?.playerOption, term);
      if (!teamOption.known) addMissing(missingInputs, `Contract year ${index + 1} team-option status is unresolved.`);
      if (!playerOption.known) addMissing(missingInputs, `Contract year ${index + 1} player-option status is unresolved.`);
      if (!teamOption.known || !playerOption.known) continue;
      if (teamOption.value || playerOption.value) options.push({ index, term,
        holder: teamOption.value && playerOption.value ? 'conflicting' : teamOption.value ? 'team' : 'player' });
    }

    if (rookie) {
      for (let index = 0; index < contractSeasons.length; index += 1) {
        const term = contractSeasons[index];
        const teamOption = readBoolean(term?.teamOption, term), playerOption = readBoolean(term?.playerOption, term);
        if (!teamOption.known || !playerOption.known) continue;
        const expectedTeamOption = index === 2 || index === 3;
        if (teamOption.value !== expectedTeamOption || playerOption.value !== false) {
          addViolation(violations, 'First-round rookie contracts require team options only in seasons three and four.');
        }
      }
      if (options.length === 2 && options.every(row => row.holder === 'team') && options[0].index === 2 && options[1].index === 3) {
        const fourthYearTerms = readBoolean(options[1].term.optionTermsUnchanged, options[1].term);
        if (!fourthYearTerms.known) addMissing(missingInputs, 'Rookie fourth-year non-salary terms must be resolved as unchanged from the third-year option.');
        else if (!fourthYearTerms.value) addViolation(violations, 'Rookie fourth-year non-salary terms must remain unchanged from the third-year option.');
      }
    } else if (profile === 'standard') {
      const hasConflictingHolders = options.some(option => option.holder === 'conflicting');
      const hasUnsupportedShape = options.length > 1 || hasConflictingHolders;
      if (options.length > 1) {
        addMissing(missingInputs, 'Multiple ordinary option years are outside the verified single-option branch; confirm the contract clause before a legality decision.');
      }
      if (hasConflictingHolders) {
        addMissing(missingInputs, 'A season with both team and player option rights requires clause-specific interpretation outside this evaluator.');
      }
      for (const option of options) {
        if (hasUnsupportedShape) continue;
        if (option.index !== contractSeasons.length - 1 || option.index === 0) {
          addViolation(violations, 'An ordinary option must be the final season and extend a prior stated contract term.');
          continue;
        }
        const previous = contractSeasons[option.index - 1];
        const conditional = readBoolean(option.term.optionConditional, option.term);
        if (!conditional.known) addMissing(missingInputs, `Option year ${option.index + 1} conditionality is unresolved.`);
        else if (conditional.value) addViolation(violations, 'Option rights must be fixed when the contract is entered and cannot depend on an individually negotiated condition.');
        const unchanged = readBoolean(option.term.optionTermsUnchanged, option.term);
        if (!unchanged.known) addMissing(missingInputs, `Option year ${option.index + 1} non-compensation terms are unresolved.`);
        else if (!unchanged.value) addViolation(violations, 'Option-year non-compensation terms must remain unchanged from the last stated season.');

        for (const field of ['salary', 'likelyBonus', 'unlikelyBonus']) {
          const optionAmount = readAmount(option.term[field], option.term);
          const priorAmount = readAmount(previous?.[field], previous);
          if (!optionAmount.known || !priorAmount.known) {
            addMissing(missingInputs, `Option-year ${field} and preceding-season ${field} are required.`);
          } else if (optionAmount.value < priorAmount.value) {
            addViolation(violations, `Option-year ${field} cannot be less than the preceding season.`);
          }
        }

        if (option.holder === 'team') {
          optionDeadlineRules.push({ contractYear: option.index + 1, holder: 'team',
            deadline: '5:00 p.m. ET on June 29 immediately before the option season (Article XII, Section 4).' });
        } else {
          const rfa = readBoolean(option.term.playerWouldBeRestrictedFreeAgentIfDeclined, option.term);
          if (!rfa.known) addMissing(missingInputs, 'Player-option RFA status is required to resolve the applicable June 25/June 29 deadline.');
          else optionDeadlineRules.push({ contractYear: option.index + 1, holder: 'player',
            deadline: rfa.value
              ? 'Before June 25 immediately before the option season when declining makes the player a Restricted Free Agent.'
              : '5:00 p.m. ET on June 29 immediately before the option season.' });

          const protectedBase = readAmount(option.term.guaranteedCash, option.term);
          if (!protectedBase.known) addMissing(missingInputs, 'Player-option base-compensation protection status is unresolved.');
          else if (protectedBase.value > 0) {
            const clause = readValue(option.term.playerOptionProtectionClause, option.term);
            if (!clause.known) addMissing(missingInputs, 'Protected player-option salary requires the applicable Article XII, Section 2(a) Exhibit 2 clause.');
            else if (!['A', 'B'].includes(String(clause.value).toUpperCase())) addViolation(violations, 'Protected player options require exactly one permitted Article XII, Section 2(a) Exhibit 2 clause (A or B).');
            else if (String(clause.value).toUpperCase() === 'B') {
              const earliest = readBoolean(option.term.playerOptionExerciseNoEarlierThanDayAfterLastGame, option.term);
              if (!earliest.known) addMissing(missingInputs, 'Clause B player option requires its last-game-based earliest exercise restriction.');
              else if (!earliest.value) addViolation(violations, 'Clause B player option cannot be exercisable before the day after the team’s last game before the option year.');
            }
          }
        }
      }
    }

    if (rookie) {
      for (const option of options) {
        optionDeadlineRules.push({ contractYear: option.index + 1, holder: option.holder,
          deadline: option.index === 2
            ? 'From the day after the first contract season through the immediately following October 31; move the deadline to the next business day when October 31 is a Saturday, Sunday, or federal holiday.'
            : 'From the day after the second contract season through the immediately following October 31; move the deadline to the next business day when October 31 is a Saturday, Sunday, or federal holiday.' });
        const conditional = readBoolean(option.term.optionConditional, option.term);
        if (!conditional.known) addMissing(missingInputs, `Rookie option year ${option.index + 1} conditionality is unresolved.`);
        else if (conditional.value) addViolation(violations, 'Option rights must be fixed when the contract is entered and cannot depend on an individually negotiated condition.');
      }
    }
  }

  const status = violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass';
  return { status, violations, missingInputs, optionDeadlineRules, ruleRefs: [...new Set(ruleRefs)], legalReady: false };
}
