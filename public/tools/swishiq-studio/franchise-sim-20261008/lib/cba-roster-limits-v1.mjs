import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

const BASE_RULE_REFS = Object.freeze([
  '2023-NBA-CBA-Article-XXIX-1',
  '2023-NBA-CBA-Article-XXIX-2a',
  '2023-NBA-CBA-Article-XXIX-2b',
  '2023-NBA-CBA-Article-XXIX-2c',
  '2023-NBA-CBA-Article-XXIX-2d',
  '2023-NBA-CBA-Article-II-11b-i',
  '2023-NBA-CBA-Article-XXIX-5-conditional',
]);

const UNKNOWN_WORDS = /^(unknown|candidate|conflict|unresolved|missing|unreported|invalid|not-applicable|verified-absent|resolved-absent)(-|$)/i;
const EXCEPTION_TYPES = new Set([
  'hardship', 'hardship-signing', 'nba-authorized-hardship-signing',
  'inpatient-anti-drug-treatment', 'anti-drug-inpatient-treatment',
]);

function readValue(field) {
  if (field && typeof field === 'object' && Object.hasOwn(field, 'value')) {
    const status = String(field.valueStatus ?? field.status ?? '').trim();
    if (UNKNOWN_WORDS.test(status)) return { value: null, status: 'unknown' };
    return { value: field.value, status: status || (field.value === null || field.value === undefined ? 'unknown' : 'resolved') };
  }
  return { value: field, status: field === null || field === undefined ? 'unknown' : 'resolved' };
}

function booleanValue(value) {
  const read = readValue(value);
  if (read.value === true || String(read.value).toLowerCase() === 'true') return true;
  if (read.value === false || String(read.value).toLowerCase() === 'false') return false;
  return null;
}

function normalizeContractType(value) {
  const read = readValue(value);
  if (read.status === 'unknown') return null;
  const text = String(read.value ?? '').trim().toLowerCase().replace(/[ _]+/g, '-');
  if (['two-way', 'two-way-contract', 'twoway'].includes(text)) return 'twoWay';
  if (['standard', 'standard-contract', 'standard-nba-contract', 'nba-standard'].includes(text)) return 'standard';
  return null;
}

function hasVersionedSource(source) {
  const retrievedAt = source?.retrievedAt ?? source?.retrievalDate;
  return Boolean(String(source?.sourceSystem ?? '').trim() && String(source?.sourceVersion ?? '').trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(retrievedAt ?? '')) && Number.isFinite(Date.parse(String(retrievedAt))));
}

function classifyContract(player, seasonStartYear, overrideTerm = null) {
  const allTerms = player?.contractSeasons ?? player?.contract?.seasons ?? [];
  const yearTerms = Array.isArray(allTerms)
    ? allTerms.filter(term => Number(term?.seasonStartYear ?? term?.fromYear) === seasonStartYear)
    : [];
  let term = overrideTerm;
  if (!term && yearTerms.length === 1) term = yearTerms[0];
  if (!term && yearTerms.length > 1) return { type: 'unknown', reason: 'has duplicate contract terms for this season' };
  if (term && (term.active === false || ['declined', 'expired', 'terminated', 'void', 'inactive'].includes(
    String(term.optionDecisionStatus ?? term.optionStatus ?? term.status ?? '').toLowerCase()))) {
    return { type: 'unknown', reason: 'has an inactive or declined current-season contract term' };
  }

  let termTypeEvidenceUnresolved = false;
  if (term && Object.hasOwn(term, 'twoWay') && term.twoWay !== null && term.twoWay !== undefined) {
    const twoWay = booleanValue(term.twoWay);
    if (twoWay !== null) return { type: twoWay ? 'twoWay' : 'standard' };
    termTypeEvidenceUnresolved = true;
  }
  for (const key of ['contractType', 'contractMembership', 'rosterContractType']) {
    if (term && Object.hasOwn(term, key) && term[key] !== null && term[key] !== undefined) {
      const type = normalizeContractType(term[key]);
      if (type) return { type };
      termTypeEvidenceUnresolved = true;
    }
  }
  if (termTypeEvidenceUnresolved) return { type: 'unknown', reason: 'has an unresolved current-season contract type' };

  const playerTwoWay = booleanValue(player?.twoWay ?? player?.contract?.twoWay);
  if (playerTwoWay !== null) return { type: playerTwoWay ? 'twoWay' : 'standard' };
  const playerType = normalizeContractType(player?.contractType ?? player?.contract?.contractType ?? player?.contractMembership);
  if (playerType) return { type: playerType };
  return { type: 'unknown', reason: term ? 'has no resolved standard/two-way type' : 'has no current-season contract term or resolved contract membership' };
}

function proposalTerm(proposal, leg, seasonStartYear) {
  const candidates = leg?.contractSeasons ?? proposal?.contractSeasons ??
    (leg?.contractTerms ? [leg.contractTerms] : proposal?.contractTerms ? [proposal.contractTerms] : []);
  const seasons = Array.isArray(candidates) ? candidates : candidates?.seasons;
  if (!Array.isArray(seasons)) return null;
  const matches = seasons.filter(term => {
    const raw = term?.seasonStartYear ?? term?.fromYear;
    return raw === null || raw === undefined || String(raw).trim() === '' || Number(raw) === seasonStartYear;
  });
  return matches.length === 1 ? matches[0] : null;
}

function phaseContext(state, proposal, phase) {
  const input = String(phase ?? '').trim().toLowerCase().replace(/[ _]+/g, '-');
  const openingDay = ['opening-day', 'openingday', 'game-readiness', 'regular-season-readiness', 'roster-readiness'].includes(input) ||
    (input === 'regular-season' && !proposal);
  const explicitOffseason = ['offseason', 'offseason-transaction', 'off-season'].includes(input);
  const explicitRegularSeason = ['regular-season', 'regular-season-transaction', 'in-season', 'in-season-transaction'].includes(input) && !openingDay;
  const explicitTransaction = ['transaction', 'transaction-preview', 'trade'].includes(input);
  const window = String(proposal?.transactionWindow ?? state?.transactionWindow ?? '').toLowerCase();
  const windowIsRegularSeason = ['games', 'season-end', 'regular-season'].includes(window);
  const regularSeason = explicitRegularSeason || openingDay || (!explicitOffseason && windowIsRegularSeason);
  const isTransaction = explicitTransaction || explicitRegularSeason || explicitOffseason || Boolean(proposal);
  const inferredOpeningDay = openingDay || (!phase && !proposal && window === 'games');
  const resolvedPhase = openingDay ? 'opening-day'
    : explicitOffseason ? 'offseason'
      : explicitRegularSeason ? 'regular-season-transaction'
        : explicitTransaction ? 'transaction'
          : proposal ? 'transaction'
            : inferredOpeningDay ? 'game-readiness'
              : regularSeason ? 'regular-season'
                : 'offseason';
  return { regularSeason, openingDay: inferredOpeningDay, isTransaction, resolvedPhase, window };
}

function buildTeamRosters(state, seasonStartYear, missingInputs) {
  const teams = Array.isArray(state?.teams) ? state.teams : [];
  const players = Array.isArray(state?.players) ? state.players : [];
  if (!Array.isArray(state?.teams)) missingInputs.push('LeagueState teams are missing; team roster counts cannot be resolved.');
  if (!Array.isArray(state?.players)) missingInputs.push('LeagueState players are missing; roster contract types cannot be resolved.');

  const byName = new Map();
  for (const player of players) {
    const key = normalizeCanonicalPlayerName(player?.canonicalName ?? player?.name);
    if (!key) continue;
    const rows = byName.get(key) ?? [];
    rows.push(player);
    byName.set(key, rows);
  }

  const rosters = new Map();
  for (const team of teams) {
    const code = String(team?.teamCode ?? '').trim().toUpperCase();
    if (!code) {
      missingInputs.push('A team is missing teamCode; its roster cannot be evaluated.');
      continue;
    }
    const entries = new Map();
    const names = Array.isArray(team?.rosterNames) ? team.rosterNames : [];
    if (!Array.isArray(team?.rosterNames)) missingInputs.push(`${code} rosterNames are missing.`);
    for (const rawName of names) {
      const name = String(rawName ?? '').trim();
      const key = normalizeCanonicalPlayerName(name);
      if (!key) {
        missingInputs.push(`${code} has a roster entry without a resolvable player name.`);
        continue;
      }
      const matches = byName.get(key) ?? [];
      const player = matches.length === 1 ? matches[0] : null;
      if (matches.length !== 1) missingInputs.push(`${code} roster player ${name} does not have one exact player-state match.`);
      const playerTeam = player?.teamCode ? String(player.teamCode).toUpperCase() : null;
      if (playerTeam && playerTeam !== code) missingInputs.push(`${name} roster membership on ${code} conflicts with player team ${playerTeam}.`);
      const classification = player
        ? classifyContract(player, seasonStartYear)
        : { type: 'unknown', reason: 'has no exact player-state match' };
      if (classification.type === 'unknown') missingInputs.push(`${name} ${classification.reason}.`);
      entries.set(key, { key, canonicalName: player?.canonicalName ?? name, player, type: classification.type, source: 'rosterNames' });
    }
    rosters.set(code, entries);
  }

  for (const player of players) {
    if (!player?.teamCode) continue;
    const code = String(player.teamCode).toUpperCase();
    const roster = rosters.get(code);
    const key = normalizeCanonicalPlayerName(player.canonicalName ?? player.name);
    if (!roster || !key) {
      missingInputs.push(`${player.canonicalName ?? player.name ?? '(unnamed player)'} assigned-team roster membership cannot be resolved.`);
      continue;
    }
    if (!roster.has(key)) {
      const classification = classifyContract(player, seasonStartYear);
      missingInputs.push(`${player.canonicalName ?? player.name} is assigned to ${code} but absent from its rosterNames.`);
      if (classification.type === 'unknown') missingInputs.push(`${player.canonicalName ?? player.name} ${classification.reason}.`);
      roster.set(key, { key, canonicalName: player.canonicalName ?? player.name, player, type: classification.type, source: 'player.teamCode' });
    }
  }
  return { teams, rosters };
}

function applyProposal(rosters, teams, state, proposal, seasonStartYear, missingInputs) {
  if (!proposal) return;
  if (!Array.isArray(proposal.legs)) {
    missingInputs.push('Proposal legs are missing; projected roster membership cannot be resolved.');
    return;
  }
  const teamCodes = new Set(teams.map(team => String(team?.teamCode ?? '').toUpperCase()).filter(Boolean));
  const playersByName = new Map((state?.players ?? []).map(player => [normalizeCanonicalPlayerName(player?.canonicalName ?? player?.name), player]));
  const seen = new Set();

  for (const leg of proposal.legs) {
    if ((leg?.assetType ?? 'player') !== 'player') continue;
    const rawName = leg?.canonicalName ?? leg?.playerName;
    const key = normalizeCanonicalPlayerName(rawName);
    const action = String(leg?.action ?? '').trim().toLowerCase();
    const player = playersByName.get(key) ?? null;
    if (!key) {
      missingInputs.push('A player transaction leg is missing an exact player name.');
      continue;
    }
    if (seen.has(key)) {
      missingInputs.push(`Player ${rawName} appears more than once in the roster projection.`);
      continue;
    }
    seen.add(key);

    const fromCode = String(leg?.fromTeamCode ?? player?.teamCode ?? '').trim().toUpperCase() || null;
    const toCode = String(leg?.toTeamCode ?? proposal?.teamCode ?? '').trim().toUpperCase() || null;
    const knownType = classifyContract(player, seasonStartYear);
    const moveType = classifyContract(player, seasonStartYear, proposalTerm(proposal, leg, seasonStartYear));
    const isWaive = action === 'waive' || action === 'option-decline';
    const isConvert = action === 'two-way-convert';
    const isSign = action === 'sign' || proposal.kind === 'free-agent-signing' || proposal.kind === 'draft-selection' || action === 'draft-selection';
    const isTradeMove = proposal.kind === 'trade' || (fromCode && toCode && fromCode !== toCode && !isWaive && !isConvert);
    const isSimpleTransfer = isTradeMove && fromCode !== toCode;

    if (fromCode && !teamCodes.has(fromCode)) missingInputs.push(`Sending team ${fromCode} is absent from LeagueState.`);
    if (toCode && !teamCodes.has(toCode)) missingInputs.push(`Receiving team ${toCode} is absent from LeagueState.`);
    if (isWaive) {
      if (!fromCode) {
        missingInputs.push(`Waiver of ${rawName} has no sending team.`);
        continue;
      }
      rosters.get(fromCode)?.delete(key);
      continue;
    }
    if (isConvert) {
      const teamCode = fromCode ?? toCode;
      if (!teamCode) {
        missingInputs.push(`Two-way conversion for ${rawName} has no current team.`);
        continue;
      }
      const roster = rosters.get(teamCode);
      if (!roster?.has(key)) missingInputs.push(`Two-way conversion player ${rawName} is not present on ${teamCode}'s roster.`);
      if (moveType.type === 'unknown') missingInputs.push(`Two-way conversion for ${rawName} ${moveType.reason}.`);
      const previous = roster?.get(key) ?? { key, canonicalName: player?.canonicalName ?? String(rawName), player, source: 'proposal' };
      roster?.set(key, { ...previous, type: moveType.type, source: 'two-way-convert' });
      continue;
    }
    if (isSign) {
      if (!toCode) {
        missingInputs.push(`Signing ${rawName} has no receiving team.`);
        continue;
      }
      if (fromCode && fromCode !== toCode) {
        missingInputs.push(`Signing ${rawName} is already assigned to ${fromCode}.`);
        rosters.get(fromCode)?.delete(key);
      }
      if (moveType.type === 'unknown') missingInputs.push(`Signing ${rawName} ${moveType.reason}.`);
      rosters.get(toCode)?.set(key, { key, canonicalName: player?.canonicalName ?? String(rawName), player, type: moveType.type, source: 'proposal-signing' });
      continue;
    }
    if (isSimpleTransfer) {
      if (!fromCode || !toCode) {
        missingInputs.push(`Trade of ${rawName} is missing a sending or receiving team.`);
        continue;
      }
      const sending = rosters.get(fromCode);
      const outgoing = sending?.get(key);
      if (!outgoing) missingInputs.push(`Traded player ${rawName} is absent from ${fromCode}'s projected roster.`);
      sending?.delete(key);
      const type = outgoing?.type ?? knownType.type;
      if (type === 'unknown') missingInputs.push(`Traded player ${rawName} has an unresolved standard/two-way type.`);
      rosters.get(toCode)?.set(key, { key, canonicalName: player?.canonicalName ?? String(rawName), player, type, source: 'proposal-trade' });
      continue;
    }
    if (action === 'option-exercise' || action === 'qualifying-offer') continue;
    if (fromCode || toCode) missingInputs.push(`Player leg ${rawName} uses unsupported roster action ${action || '(missing action)'}.`);
  }
}

function exceptionSlots(team, roster, seasonStartYear, missingInputs) {
  const rows = team?.rosterLimitExceptions;
  if (rows === undefined || rows === null) return { confirmed: 0, possible: 0 };
  if (!Array.isArray(rows)) {
    missingInputs.push(`${team.teamCode} rosterLimitExceptions must be an array when supplied.`);
    return { confirmed: 0, possible: 0 };
  }
  let confirmed = 0, possible = 0;
  for (const row of rows) {
    const type = String(row?.type ?? row?.exceptionType ?? '').toLowerCase();
    const rowYear = Number(row?.seasonStartYear);
    if (Number.isInteger(rowYear) && rowYear !== seasonStartYear) continue;
    const name = normalizeCanonicalPlayerName(row?.canonicalName ?? row?.playerName);
    const member = name && roster.has(name);
    if (!EXCEPTION_TYPES.has(type) || !member || !Number.isInteger(rowYear)) {
      missingInputs.push(`${team.teamCode} has a roster-limit exception without a supported type, season, or matched roster player.`);
      possible += 1;
      continue;
    }
    const status = String(row?.status ?? '').toLowerCase();
    if (['authorized', 'confirmed', 'verified'].includes(status) && hasVersionedSource(row?.source)) confirmed += 1;
    else if (['denied', 'revoked', 'expired', 'not-authorized'].includes(status)) continue;
    else {
      missingInputs.push(`${team.teamCode} roster-limit exception for ${row.canonicalName ?? row.playerName} lacks verified NBA authorization evidence.`);
      possible += 1;
    }
  }
  return { confirmed, possible };
}

function resolveConditionalRules(state, seasonStartYear, team, counts, openingDay, missingInputs) {
  const limits = state?.rulesReference?.rosterLimits ?? {};
  const ruleVersion = String(state?.rulesReference?.ruleVersionId ?? state?.rulesReference?.sourceVersion ?? '').toLowerCase();
  const sectionStatus = String(limits.sectionXXIX5aStatus ?? limits.standardRosterMinimumStatus ?? '').toLowerCase();
  let standardMinimum = 14;
  if (limits.standardRosterMinimum === 14 || limits.standardRosterMinimum === 15) standardMinimum = limits.standardRosterMinimum;
  else if (['activated', 'active', 'triggered'].includes(sectionStatus)) standardMinimum = 15;
  else if (['not-activated', 'inactive', 'not-triggered', 'verified-inactive'].includes(sectionStatus)) standardMinimum = 14;
  else if (seasonStartYear >= 2025 && openingDay) {
    missingInputs.push(`${team.teamCode} Article XXIX §5(a) regular-season roster minimum activation is not sourced for ${seasonStartYear}-${seasonStartYear + 1}.`);
  }

  let twoWayMaximum = 3;
  const suppliedTwoWayMaximum = Number(limits.maximumTwoWayContracts ?? limits.twoWayMaximum);
  if (suppliedTwoWayMaximum === 2 || suppliedTwoWayMaximum === 3) twoWayMaximum = suppliedTwoWayMaximum;
  else if (seasonStartYear >= 2025) {
    // The CBA permits a later NBPA election that can reduce the otherwise-three slots.
    // Only a roster close to that limit needs the activation input to decide legality.
    const currentTwoWayCount = counts.twoWayContracts + counts.unknownContracts;
    if (currentTwoWayCount >= 3) missingInputs.push(`${team.teamCode} Article XXIX §5(b) two-way reduction option is not sourced for ${seasonStartYear}-${seasonStartYear + 1}.`);
  }
  if (ruleVersion && /2011|2017|pre-2023|old-cba/.test(ruleVersion)) {
    missingInputs.push(`LeagueState rules reference ${ruleVersion}, which is not the supported 2023 CBA roster rule set.`);
  }
  return { standardMinimum, twoWayMaximum };
}

function countEntries(roster) {
  const entries = [...roster.values()];
  const standardContracts = entries.filter(row => row.type === 'standard').length;
  const twoWayContracts = entries.filter(row => row.type === 'twoWay').length;
  const unknownContracts = entries.filter(row => row.type === 'unknown').length;
  return { totalContracts: entries.length, standardContracts, twoWayContracts, unknownContracts };
}

/**
 * Check CBA roster-count rules for a current roster or projected transaction.
 *
 * Supported caller evidence:
 * - `team.rosterLimitExceptions`: rows with type, seasonStartYear, canonicalName,
 *   status ('authorized'/'confirmed'/'verified'), and a source object. Each row
 *   authorizes one standard player above 15 under the Article XXIX §2(b) carveout.
 * - `team.rosterLimitState.regularSeasonShortfallStatus`: 'within-allowance',
 *   'expired', or 'unknown' for the 12/13-player, two-weeks/28-days allowance.
 * - `state.rulesReference.rosterLimits.sectionXXIX5aStatus` and
 *   `maximumTwoWayContracts` can resolve conditional Article XXIX §5 changes.
 *
 * This is a roster-count screen only. It always returns legalReady:false.
 */
export function evaluateRosterLimits({ state, proposal = null, phase = null } = {}) {
  const violations = [];
  const missingInputs = [];
  const ruleRefs = [...BASE_RULE_REFS];
  const rawYear = proposal?.seasonStartYear ?? state?.seasonStartYear;
  const seasonStartYear = Number(rawYear);
  const context = phaseContext(state, proposal, phase);
  const ruleVersion = String(state?.rulesReference?.ruleVersionId ?? state?.rulesReference?.sourceVersion ?? '').toLowerCase();
  const cbaOptOutStatus = String(state?.rulesReference?.cbaOptOutAfter2028_29Status ?? '').toLowerCase();
  if (!Number.isInteger(seasonStartYear)) missingInputs.push('A resolved seasonStartYear is required for CBA roster limits.');
  else if (seasonStartYear < 2023 || seasonStartYear > 2029) {
    missingInputs.push(`The signed 2023 CBA roster rules do not cover season ${seasonStartYear}-${seasonStartYear + 1}.`);
  }
  if (proposal?.seasonStartYear !== undefined && state?.seasonStartYear !== undefined && Number(proposal.seasonStartYear) !== Number(state.seasonStartYear)) {
    missingInputs.push(`Proposal season ${proposal.seasonStartYear} conflicts with LeagueState season ${state.seasonStartYear}.`);
  }
  if (ruleVersion && /2011|2017|pre-2023|old-cba/.test(ruleVersion)) {
    missingInputs.push(`LeagueState rules reference ${ruleVersion}, which is not the supported 2023 CBA roster rule set.`);
  }
  const futureCbaUnresolved = seasonStartYear === 2029 && !['not-exercised', 'not-exercised-as-of-date', 'waived'].includes(cbaOptOutStatus);
  if (futureCbaUnresolved) missingInputs.push('The 2023 CBA opt-out after 2028-29 must be resolved before applying its 2029-30 roster rules.');
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < 2023 || seasonStartYear > 2029 ||
      (proposal?.seasonStartYear !== undefined && state?.seasonStartYear !== undefined && Number(proposal.seasonStartYear) !== Number(state.seasonStartYear)) ||
      (ruleVersion && /2011|2017|pre-2023|old-cba/.test(ruleVersion)) || futureCbaUnresolved) {
    return { format: 'djhc-cba-roster-limits-v1', status: 'unknown', violations: [],
      missingInputs: [...new Set(missingInputs)], teamCounts: {}, ruleRefs,
      seasonStartYear: Number.isInteger(seasonStartYear) ? seasonStartYear : null,
      phase: context.resolvedPhase, legalReady: false };
  }

  const season = seasonStartYear;
  const { teams, rosters } = buildTeamRosters(state, season, missingInputs);
  applyProposal(rosters, teams, state, proposal, season, missingInputs);
  const teamCounts = {};

  for (const team of teams) {
    const code = String(team?.teamCode ?? '').toUpperCase();
    const roster = rosters.get(code);
    if (!roster) continue;
    const counts = countEntries(roster);
    const limits = resolveConditionalRules(state, season, team, counts, context.openingDay, missingInputs);
    const record = {
      teamCode: code,
      ...counts,
      ruleMaximum: context.regularSeason
        ? { standardContracts: 15, twoWayContracts: limits.twoWayMaximum, aggregateContracts: null }
        : { standardContracts: null, twoWayContracts: limits.twoWayMaximum, aggregateContracts: 21 },
      ruleMinimum: context.openingDay ? { standardContracts: limits.standardMinimum } : null,
    };
    teamCounts[code] = record;

    if (context.regularSeason) {
      const exceptions = exceptionSlots(team, roster, season, missingInputs);
      const maximum = 15 + exceptions.confirmed;
      if (counts.standardContracts > maximum) {
        if (counts.standardContracts <= maximum + exceptions.possible) {
          missingInputs.push(`${code} standard-contract count depends on unresolved hardship/treatment authorization.`);
        } else violations.push(`${code} has ${counts.standardContracts} standard-contract players; the 15-player limit plus ${exceptions.confirmed} verified roster exception slot(s) permits ${maximum}.`);
      } else if (counts.standardContracts + counts.unknownContracts > 15 + exceptions.confirmed) {
        missingInputs.push(`${code} may exceed the 15-player standard-contract limit because one or more contract types are unresolved.`);
      }
      if (counts.twoWayContracts > limits.twoWayMaximum) {
        violations.push(`${code} has ${counts.twoWayContracts} two-way contracts; the applicable CBA limit is ${limits.twoWayMaximum}.`);
      } else if (counts.twoWayContracts + counts.unknownContracts > limits.twoWayMaximum) {
        missingInputs.push(`${code} may exceed the ${limits.twoWayMaximum}-player two-way limit because one or more contract types are unresolved.`);
      }

      if (context.openingDay) {
        const minimum = limits.standardMinimum;
        const shortfallStatus = String(team?.rosterLimitState?.regularSeasonShortfallStatus ?? '').toLowerCase();
        const temporaryFloor = minimum === 15 ? 13 : 12;
        if (counts.standardContracts >= minimum) {
          // At or above the ordinary minimum, the temporary shortfall clock is irrelevant.
        } else if (counts.standardContracts < temporaryFloor) {
          violations.push(`${code} has ${counts.standardContracts} standard-contract players, below the regular-season ${temporaryFloor}-player temporary-shortfall floor.`);
        } else if (['within-allowance', 'within-two-weeks-and-28-days', 'authorized'].includes(shortfallStatus)) {
          // Article XXIX §2(b) allows a dated, temporary shortfall at the floor above.
        } else if (['expired', 'exceeded', 'not-allowed', 'outside-allowance'].includes(shortfallStatus)) {
          violations.push(`${code} has a regular-season shortfall after the Article XXIX §2(b) allowance expired.`);
        } else {
          missingInputs.push(`${code} has ${counts.standardContracts} standard-contract players; Article XXIX §2(b) shortfall-period evidence is required before deciding whether the 12/13-player roster is allowed.`);
        }
      }
    } else {
      if (counts.totalContracts > 21) violations.push(`${code} has ${counts.totalContracts} total player contracts; the offseason aggregate Active, Inactive, and Two-Way List ceiling is 21.`);
      if (counts.twoWayContracts > limits.twoWayMaximum) violations.push(`${code} has ${counts.twoWayContracts} two-way contracts; the applicable CBA limit is ${limits.twoWayMaximum}.`);
      if (counts.twoWayContracts + counts.unknownContracts > limits.twoWayMaximum) {
        missingInputs.push(`${code} may exceed the ${limits.twoWayMaximum}-player two-way limit because one or more contract types are unresolved.`);
      }
    }
  }

  const status = violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass';
  return {
    format: 'djhc-cba-roster-limits-v1', status, violations: [...new Set(violations)],
    missingInputs: [...new Set(missingInputs)], teamCounts, ruleRefs,
    seasonStartYear: Number.isInteger(season) ? season : null,
    phase: context.resolvedPhase, legalReady: false,
  };
}
