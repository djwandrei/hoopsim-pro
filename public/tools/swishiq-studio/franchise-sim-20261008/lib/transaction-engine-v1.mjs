import {
  buildExactNameIndex,
  normalizeCanonicalPlayerName,
  resolvePlayerByCanonicalName,
  validateLeagueState,
} from './simulation-contracts-v1.mjs';
import { derivePayrollStateForLeague } from './payroll-state-v1.mjs';
import { CAP_BASE_FIELDS, appendCapLedgerEntries } from './cap-accounting-v1.mjs';
import { buildWaiverCapEntries } from './waiver-accounting-v1.mjs';
import { calculateFreeAgentCapHold } from './free-agent-cap-holds-v1.mjs';
import { evaluateStoredTpeUse, commitStoredTpeUse, closeStoredTpe, closeStoredTpeHolds } from './stored-tpe-v1.mjs';
import { evaluateContractSalaryScale } from './cba-salary-scales-v1.mjs';
import { evaluateSigningMechanism, commitSigningExceptionUse } from './cba-signing-mechanisms-v1.mjs';
import { evaluateContractOptionRules } from './cba-contract-option-rules-v1.mjs';
import { evaluateRosterLimits } from './cba-roster-limits-v1.mjs';
import { evaluateRestrictedFreeAgencyTransaction, commitRestrictedOfferSheetResolution } from './restricted-free-agency-state-v1.mjs';

const clone = value => structuredClone(value);
const unique = values => [...new Set(values.filter(Boolean))];

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function stableHash(value) {
  const input = stableValue(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function contractTermsForLeg(state, proposal, leg) {
  if (leg.contractTerms) return leg.contractTerms;
  if (proposal.kind === 'free-agent-signing' || proposal.kind === 'draft-selection') return proposal.contractTerms ?? null;
  if (['sign', 'option-exercise', 'qualifying-offer', 'two-way-convert'].includes(leg.action)) return proposal.contractTerms ?? null;
  const player = findPlayer(state, leg.canonicalName ?? leg.playerName).player;
  return player ? termForSeason(player, proposal.seasonStartYear) : null;
}

function requiredContractFields(proposal, leg) {
  if (proposal.kind === 'trade') return ['salary', 'capHit', 'guaranteedCash', 'guaranteeDate', 'likelyBonus', 'unlikelyBonus', 'playerOption', 'teamOption', 'tradeEligibility', 'tradeRestriction', 'noTradeClause'];
  if (proposal.kind === 'free-agent-signing' || proposal.kind === 'draft-selection' || leg.action === 'sign') {
    return ['salary', 'capHit', 'guaranteedCash', 'guaranteeDate', 'likelyBonus', 'unlikelyBonus', 'playerOption', 'teamOption', 'tradeEligibility', 'tradeRestriction', 'noTradeClause'];
  }
  if (['option-exercise', 'option-decline'].includes(leg.action)) return ['salary', 'capHit', 'playerOption', 'teamOption'];
  if (leg.action === 'qualifying-offer') return ['salary', 'capHit', 'guaranteedCash', 'guaranteeDate', 'qualifyingOffer'];
  if (leg.action === 'waive') return ['salary', 'capHit', 'guaranteedCash', 'guaranteeDate', 'likelyBonus', 'unlikelyBonus'];
  if (leg.action === 'two-way-convert') return ['salary', 'capHit', 'twoWay'];
  return ['salary', 'capHit'];
}

function normalizeContractSeasons(input, seasonStartYear) {
  const supplied = input.contractSeasons ?? (Array.isArray(input.contractTerms) ? input.contractTerms : input.contractTerms?.seasons);
  if (supplied === undefined || supplied === null) return null;
  if (!Array.isArray(supplied) || !supplied.length) throw new Error('Multi-year contract seasons must be a nonempty array.');
  const terms = clone(supplied).sort((a, b) => Number(a.seasonStartYear ?? a.fromYear) - Number(b.seasonStartYear ?? b.fromYear));
  const seasons = terms.map(term => term.seasonStartYear ?? term.fromYear);
  if (seasons.some(year => !Number.isInteger(year)) || seasons[0] !== seasonStartYear || seasons.some((year, index) => year !== seasonStartYear + index)) {
    throw new Error('Contract seasons must be unique, consecutive, and begin in the transaction season.');
  }
  for (const term of terms) {
    for (const field of ['salary', 'capHit', 'guaranteedCash', 'likelyBonus', 'unlikelyBonus', 'apronCapHit', 'taxCapHit',
      'mtsCapHoldCapHit', 'mtsPaymentCapHit', 'tradeSalaryOutgoing', 'tradeSalaryIncoming']) {
      const raw = term[field];
      const value = raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw;
      if (value !== null && value !== undefined && (value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0)) {
        throw new Error(`Contract ${field} must be a nonnegative finite amount in every supplied season.`);
      }
    }
  }
  return terms;
}

export function createTransactionProposal(input = {}) {
  const allowedKinds = ['trade', 'free-agent-signing', 'roster-move', 'draft-selection'];
  if (!allowedKinds.includes(input.kind)) throw new Error(`Unsupported transaction kind: ${input.kind}`);
  if (!Number.isInteger(input.seasonStartYear)) throw new Error('TransactionProposal requires seasonStartYear.');
  const contractSeasons = normalizeContractSeasons(input, input.seasonStartYear);
  const contractTerms = contractSeasons?.[0] ?? input.contractTerms ?? null;
  if (input.signingRoleProjection && (input.kind !== 'free-agent-signing' ||
      input.signingRoleProjection.seasonStartYear !== input.seasonStartYear ||
      !Number.isFinite(input.signingRoleProjection.projectedMinutes) || input.signingRoleProjection.projectedMinutes < 0 ||
      input.signingRoleProjection.projectedMinutes > 48)) throw new Error('Signing role projection requires current-season minutes from zero to 48.');
  const positionMinutes = input.signingRoleProjection?.projectedMinutesByPosition;
  if (positionMinutes && (Object.entries(positionMinutes).some(([group, minutes]) =>
      !['guard', 'forward', 'center'].includes(group) || !Number.isFinite(minutes) || minutes < 0) ||
      Math.abs(Object.values(positionMinutes).reduce((sum, minutes) => sum + minutes, 0) - input.signingRoleProjection.projectedMinutes) > 0.000001)) {
    throw new Error('Signing position minutes must be nonnegative supported groups and reconcile to total role minutes.');
  }
  let legs = clone(input.legs ?? []);
  if (input.kind === 'draft-selection' && !legs.length && input.teamCode && input.pickId && input.prospect?.canonicalName) {
    legs = [
      { assetType: 'draft-pick', pickId: input.pickId, fromTeamCode: input.teamCode, toTeamCode: input.teamCode, action: 'consume' },
      { assetType: 'prospect', prospect: clone(input.prospect), toTeamCode: input.teamCode },
    ];
  }
  const proposal = {
    format: 'djhc-transaction-proposal-v1',
    proposalId: String(input.proposalId ?? `proposal-${input.seasonStartYear}-${input.kind}-${stableHash({ window: input.transactionWindow ?? null, legs, teamCode: input.teamCode ?? null, pickId: input.pickId ?? null, prospect: input.prospect ?? null, contractTerms, contractSeasons, contractScaleInput: input.contractScaleInput ?? null, signingMechanism: input.signingMechanism ?? null, signingRuleInput: input.signingRuleInput ?? null, waiverAccounting: input.waiverAccounting ?? null, freeAgentCapHoldInput: input.freeAgentCapHoldInput ?? null, storedTpeUsageByTeam: input.storedTpeUsageByTeam ?? null, salaryMatchingPath: input.salaryMatchingPath ?? null, salaryMatchingPathsByTeam: input.salaryMatchingPathsByTeam ?? null })}`),
    kind: input.kind,
    schemaVersion: '1.0.0',
    seasonStartYear: input.seasonStartYear,
    transactionWindow: input.transactionWindow ?? null,
    actor: input.actor ?? 'user',
    userControlledTeamCodes: [...(input.userControlledTeamCodes ?? [])].map(code => String(code).toUpperCase()),
    legs,
    pickId: input.pickId ?? null,
    prospect: input.prospect ? clone(input.prospect) : null,
    contractTerms: contractTerms ? clone(contractTerms) : null,
    contractSeasons,
    contractScaleInput: input.contractScaleInput ? clone(input.contractScaleInput) : null,
    signingMechanism: input.signingMechanism ?? null,
    signingRuleInput: input.signingRuleInput ? clone(input.signingRuleInput) : null,
    signingRoleProjection: input.signingRoleProjection ? clone(input.signingRoleProjection) : null,
    restrictedOfferSheet: input.restrictedOfferSheet ? clone(input.restrictedOfferSheet) : null,
    waiverAccounting: input.waiverAccounting ? clone(input.waiverAccounting) : null,
    freeAgentCapHoldInput: input.freeAgentCapHoldInput ? clone(input.freeAgentCapHoldInput) : null,
    storedTpeUsageByTeam: input.storedTpeUsageByTeam ? clone(input.storedTpeUsageByTeam) : null,
    salaryMatchingPath: input.salaryMatchingPath ?? null,
    salaryMatchingPathsByTeam: input.salaryMatchingPathsByTeam ? clone(input.salaryMatchingPathsByTeam) : null,
    isSimultaneous: input.isSimultaneous ?? true,
    assumptions: [...(input.assumptions ?? [])],
    sourceRefs: [...(input.sourceRefs ?? [])],
    fixedSeed: Number.isInteger(input.fixedSeed) ? input.fixedSeed : null,
    approvedByUser: input.approvedByUser === true,
    userApproval: input.userApproval ? clone(input.userApproval) : null,
    createdAt: input.createdAt ?? null,
    expectedStateRevision: input.expectedStateRevision ?? null,
  };
  if (!proposal.legs.length && proposal.kind !== 'draft-selection') throw new Error('TransactionProposal requires at least one transaction leg.');
  return proposal;
}

function approvalPayload(proposal) {
  const payload = clone(proposal);
  delete payload.approvedByUser;
  delete payload.userApproval;
  return stableValue(payload);
}

/** Call only for the user's explicit approval action. This local receipt
 * binds that action to exact terms and revision; it is not authentication. */
export function approveTransactionProposal(state, proposalInput) {
  validateLeagueState(state);
  const proposal = createTransactionProposal({ ...proposalInput, expectedStateRevision: state.revision,
    approvedByUser: false, userApproval: null });
  const teamCodes = unique([...(state.userControlledTeamCodes ?? []), ...(proposal.userControlledTeamCodes ?? [])].map(code => String(code).toUpperCase()));
  return { ...proposal, approvedByUser: true, userApproval: { format: 'djhc-transaction-user-approval-v1',
    stateRevision: state.revision, teamCodes, exactProposalPayload: approvalPayload(proposal) } };
}

function approvalMatches(state, proposal, requiredTeams) {
  const receipt = proposal.userApproval;
  return proposal.approvedByUser === true && receipt?.format === 'djhc-transaction-user-approval-v1' &&
    receipt.stateRevision === state.revision && receipt.exactProposalPayload === approvalPayload(proposal) &&
    requiredTeams.every(code => receipt.teamCodes?.includes(code));
}

/** Changed or countered proposals always need a fresh approval action. */
export function createTransactionCounterProposal(state, original, changes = {}) {
  return createTransactionProposal({ ...original, ...changes, proposalId: undefined,
    expectedStateRevision: state.revision, approvedByUser: false, userApproval: null });
}

function findTeam(state, teamCode) {
  return state.teams.find(team => team.teamCode === String(teamCode ?? '').toUpperCase()) ?? null;
}

function findPlayer(state, name) {
  const resolution = resolvePlayerByCanonicalName(buildExactNameIndex(state.players), name);
  return { resolution, player: resolution.status === 'resolved' ? resolution.matches[0] : null };
}

function termForSeason(player, seasonStartYear) {
  const terms = player.contractSeasons ?? player.contract?.seasons ?? [];
  return terms.find(term => Number(term.seasonStartYear ?? term.fromYear) === seasonStartYear) ?? null;
}

function valueForTerm(term, key) {
  const raw = term?.[key];
  if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'value')) return raw.value;
  return raw ?? null;
}

function termStatus(term, key) {
  const raw = term?.[key];
  if (raw && typeof raw === 'object' && raw.valueStatus) return raw.valueStatus;
  return term?.status ?? 'unknown';
}

function sourceForTermField(term, key) {
  const raw = term?.[key];
  return (raw && typeof raw === 'object' ? raw.source : null) ?? term?.fieldProvenance?.[key] ?? term?.source ?? null;
}

function sourceForExplicitTermField(term, key) {
  const raw = term?.[key];
  return (raw && typeof raw === 'object' ? raw.source : null) ?? term?.fieldProvenance?.[key] ?? null;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) return false;
  const dateOnly = value.slice(0, 10);
  const calendarDate = new Date(`${dateOnly}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || !Number.isFinite(Date.parse(value))) return false;
  return calendarDate.toISOString().slice(0, 10) === dateOnly;
}

function sourceIsVersionedAndDated(source) {
  const retrievedAt = source?.retrievedAt ?? source?.retrievalDate;
  return Boolean(
    String(source?.sourceSystem ?? '').trim() &&
    String(source?.sourceVersion ?? '').trim() &&
    isValidIsoDate(retrievedAt),
  );
}

function collectLegProblems(state, proposal) {
  const errors = [];
  const unknown = [];
  const touchedTeams = new Set();
  const playerMoves = new Set();
  const pickMoves = new Set();
  const exceptionMoves = new Set();
  for (const leg of proposal.legs) {
    const assetType = leg.assetType ?? 'player';
    const fromCode = leg.fromTeamCode ? String(leg.fromTeamCode).toUpperCase() : null;
    const toCode = leg.toTeamCode ? String(leg.toTeamCode).toUpperCase() : null;
    if (fromCode) touchedTeams.add(fromCode);
    if (toCode) touchedTeams.add(toCode);
    if (fromCode && !findTeam(state, fromCode)) errors.push(`Sending team ${fromCode} is absent from LeagueState.`);
    if (toCode && !findTeam(state, toCode)) errors.push(`Receiving team ${toCode} is absent from LeagueState.`);
    if (assetType === 'player') {
      const { resolution, player } = findPlayer(state, leg.canonicalName ?? leg.playerName);
      if (resolution.status === 'ambiguous') errors.push(`Player name ${leg.canonicalName ?? leg.playerName} is ambiguous in LeagueState.`);
      else if (!player) unknown.push(`Player ${leg.canonicalName ?? leg.playerName} has no exact canonical-name match.`);
      else {
        if (player.retired === true || player.rosterStatus === 'retired') errors.push(`${player.canonicalName} is retired and cannot be transacted.`);
        const key = normalizeCanonicalPlayerName(player.canonicalName);
        for (const restriction of findTeam(state, toCode)?.reacquisitionRestrictions ?? []) {
          if (normalizeCanonicalPlayerName(restriction.canonicalName) === key && proposal.seasonStartYear < Number(String(restriction.earliestReacquisitionDate).slice(0, 4))) {
            errors.push(`${player.canonicalName} cannot be reacquired by ${toCode} before ${restriction.earliestReacquisitionDate}.`);
          }
        }
        if (['option-exercise', 'qualifying-offer', 'two-way-convert'].includes(leg.action) && toCode && toCode !== (fromCode ?? player.teamCode)) errors.push('Contract-only roster actions cannot transfer a player to another team.');
        if (playerMoves.has(key)) errors.push(`Player ${player.canonicalName} appears more than once in the proposal.`);
        playerMoves.add(key);
        if (fromCode && !findTeam(state, fromCode)?.rosterNames.some(name => normalizeCanonicalPlayerName(name) === key)) {
          errors.push(`${player.canonicalName} is not on sending team ${fromCode}.`);
        }
        if (!fromCode && player.teamCode) errors.push(`${player.canonicalName} is already assigned to ${player.teamCode}; this leg has no sending team.`);
        if (fromCode && player.teamCode && String(player.teamCode).toUpperCase() !== fromCode) errors.push(`${player.canonicalName} player-state team does not match sending team ${fromCode}.`);
        const term = contractTermsForLeg(state, proposal, leg);
        if (!term) unknown.push(`No contract term for ${player.canonicalName} in ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
        else {
          if (['option-exercise', 'option-decline'].includes(leg.action) &&
              valueForTerm(term, 'playerOption') === false && valueForTerm(term, 'teamOption') === false) errors.push(`${player.canonicalName} has no option to resolve.`);
          const optionDecision = String(valueForTerm(term, 'optionDecisionStatus') ?? valueForTerm(term, 'optionStatus') ?? '').toLowerCase();
          if (leg.action === 'option-exercise' && ['declined', 'expired', 'terminated'].includes(optionDecision)) errors.push(`${player.canonicalName} option is already inactive.`);
          if (leg.action === 'option-decline' && optionDecision === 'exercised') errors.push(`${player.canonicalName} option has already been exercised.`);
          const rawTermSeason = term.seasonStartYear ?? term.fromYear;
          const termSeason = rawTermSeason === null || rawTermSeason === undefined || String(rawTermSeason).trim() === '' ? null : Number(rawTermSeason);
          if (!Number.isInteger(termSeason)) unknown.push(`${player.canonicalName} contract term has no resolved season.`);
          else if (termSeason !== proposal.seasonStartYear) errors.push(`${player.canonicalName} contract term is for ${termSeason}-${termSeason + 1}, not ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
          const requiredFields = requiredContractFields(proposal, leg);
          for (const field of requiredFields) {
            const explicitAbsence = ['not-applicable', 'verified-absent', 'resolved-absent'].includes(termStatus(term, field));
            if ((valueForTerm(term, field) === null && !explicitAbsence) || ['unknown', 'candidate', 'conflict', undefined].includes(termStatus(term, field))) {
              unknown.push(`${player.canonicalName} ${field} is unresolved for ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
            }
            if (!sourceIsVersionedAndDated(sourceForTermField(term, field))) {
              unknown.push(`${player.canonicalName} ${field} lacks per-player source, version, or retrieval-date provenance.`);
            }
            const fieldValue = valueForTerm(term, field);
            if (['salary', 'capHit', 'guaranteedCash', 'likelyBonus', 'unlikelyBonus'].includes(field) &&
              fieldValue !== null && (!Number.isFinite(Number(fieldValue)) || Number(fieldValue) < 0)) {
              unknown.push(`${player.canonicalName} ${field} is not a valid nonnegative amount.`);
            }
            if (field === 'guaranteeDate' && fieldValue !== null && !isValidIsoDate(String(fieldValue))) {
              unknown.push(`${player.canonicalName} guarantee date is not a valid season date.`);
            }
          }
          if (proposal.kind === 'trade' && valueForTerm(term, 'tradeEligibility') === false) {
            errors.push(`${player.canonicalName} is marked ineligible for trade in ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
          }
          if (proposal.kind === 'trade' && (valueForTerm(term, 'tradeRestriction') === true || valueForTerm(term, 'noTradeClause') === true)) {
            const consentStatus = String(valueForTerm(term, 'tradeConsentStatus') ?? leg.tradeConsentStatus ?? '').toLowerCase();
            if (!['approved', 'waived', 'not-required'].includes(consentStatus)) {
              unknown.push(`${player.canonicalName} trade restriction or no-trade clause has no resolved consent status.`);
            } else if (!sourceIsVersionedAndDated(sourceForExplicitTermField(term, 'tradeConsentStatus'))) {
              unknown.push(`${player.canonicalName} trade consent lacks source, version, or retrieval-date provenance.`);
            }
          }
        }
        if (player.identityStatus && player.identityStatus !== 'resolved') unknown.push(`${player.canonicalName} identity is ${player.identityStatus}.`);
      }
    } else if (assetType === 'draft-pick') {
      const id = String(leg.pickId ?? leg.assetId ?? '');
      if (!id) unknown.push('Draft-pick leg is missing pickId.');
      const pick = state.draftPicks.find(row => String(row.pickId ?? row.assetId ?? row.id) === id);
      if (!pick) unknown.push(`Draft pick ${id || '(missing id)'} is absent from LeagueState.`);
      else {
        if (pickMoves.has(id)) errors.push(`Draft pick ${id} appears more than once in the proposal.`);
        pickMoves.add(id);
        if (pick.usedStatus === 'selected') errors.push(`Draft pick ${id} has already been consumed.`);
        if (fromCode && String(pick.ownerTeamCode ?? '').toUpperCase() !== fromCode) errors.push(`Draft pick ${id} is not owned by ${fromCode}.`);
        if (pick.ownershipStatus !== 'resolved') unknown.push(`Draft pick ${id} ownership is ${pick.ownershipStatus ?? 'unknown'}.`);
        if (pick.encumbranceStatus !== 'clear') unknown.push(`Draft pick ${id} encumbrance status is ${pick.encumbranceStatus ?? 'unknown'}.`);
      }
    } else if (assetType === 'trade-exception') {
      if (proposal.kind !== 'roster-move' || leg.action !== 'exception-renounce' || !fromCode || toCode) errors.push('Stored TPE renunciation requires a roster-move leg owned by one sending team, with no receiving team.');
      const entry = findTeam(state, fromCode)?.tpeLedger?.find(row => row.exceptionId === leg.exceptionId);
      if (!entry) errors.push(`Stored TPE ${leg.exceptionId ?? '(missing ID)'} is absent from its team.`);
      else {
        const key = `${fromCode}|${entry.exceptionId}`;
        if (exceptionMoves.has(key)) errors.push('A stored TPE appears more than once in the proposal.');
        exceptionMoves.add(key);
        try { closeStoredTpe(entry, { reason: 'renounced', asOfDate: leg.transactionDate, proposalId: proposal.proposalId }); }
        catch (error) { errors.push(error.message); }
      }
    } else if (assetType === 'cash') {
      if (!Number.isFinite(Number(leg.amountUsd)) || Number(leg.amountUsd) < 0) errors.push('Cash legs require a nonnegative amountUsd.');
      else unknown.push('Cash movement requires a complete season cash ledger and rule evaluation.');
    } else if (assetType === 'prospect') {
      const prospect = leg.prospect ?? proposal.prospect;
      const name = String(prospect?.canonicalName ?? '').trim();
      if (!name) unknown.push('Prospect leg is missing a canonical name.');
      else if (findPlayer(state, name).player) errors.push(`Prospect ${name} is already in the player pool.`);
      if (prospect?.identityStatus !== 'resolved') unknown.push(`Prospect ${name || '(unnamed)'} identity is unresolved.`);
      const term = proposal.contractTerms ?? prospect?.rookieContractTerms ?? null;
      if (!term) unknown.push(`Rookie contract terms are missing for prospect ${name || '(unnamed)'}.`);
      else {
        const rawRookieTermSeason = term.seasonStartYear ?? term.fromYear;
        const rookieTermSeason = rawRookieTermSeason === null || rawRookieTermSeason === undefined || String(rawRookieTermSeason).trim() === '' ? null : Number(rawRookieTermSeason);
        if (!Number.isInteger(rookieTermSeason)) unknown.push(`Rookie contract for prospect ${name || '(unnamed)'} has no resolved season.`);
        else if (rookieTermSeason !== proposal.seasonStartYear) errors.push(`Rookie contract for prospect ${name || '(unnamed)'} is for ${rookieTermSeason}-${rookieTermSeason + 1}, not ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
        for (const field of ['salary', 'capHit', 'guaranteedCash', 'guaranteeDate', 'likelyBonus', 'unlikelyBonus', 'playerOption', 'teamOption', 'tradeEligibility', 'tradeRestriction', 'noTradeClause']) {
          const explicitAbsence = ['not-applicable', 'verified-absent', 'resolved-absent'].includes(termStatus(term, field));
          if ((valueForTerm(term, field) === null && !explicitAbsence) || ['unknown', 'candidate', 'conflict', undefined].includes(termStatus(term, field))) {
            unknown.push(`Rookie ${field} is unresolved for prospect ${name || '(unnamed)'}.`);
          }
          if (!sourceIsVersionedAndDated(sourceForTermField(term, field))) {
            unknown.push(`Rookie ${field} lacks source, version, or retrieval-date provenance.`);
          }
        }
      }
    } else {
      errors.push(`Unsupported transaction asset type: ${assetType}.`);
    }
  }
  const participantTeams = [...touchedTeams];
  // Signing elsewhere automatically releases a previous team's free-agent
  // amount. That payroll effect does not grant that former team a veto.
  for (const leg of proposal.legs.filter(leg => proposal.kind === 'free-agent-signing' || leg.action === 'sign')) {
    const key = normalizeCanonicalPlayerName(leg.canonicalName ?? leg.playerName);
    for (const team of state.teams) if (team.capLedger?.entries.some(entry => entry.kind === 'free-agent-hold' &&
        entry.active !== false && entry.seasonStartYear === proposal.seasonStartYear && normalizeCanonicalPlayerName(entry.canonicalName) === key)) touchedTeams.add(team.teamCode);
  }
  for (const code of touchedTeams) {
    const team = findTeam(state, code);
    if (!team) continue;
    const payroll = team.payrollState ?? {};
    if (payroll.status !== 'reconciled') unknown.push(`${code} payroll state is ${payroll.status ?? 'unknown'}.`);
    if (Number(payroll.seasonStartYear) !== proposal.seasonStartYear) unknown.push(`${code} payroll state is not reconciled for ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
    if (payroll.rulesVersionId !== state.rulesReference?.ruleVersionId) unknown.push(`${code} payroll state does not identify the selected CBA rule version.`);
    if (!Array.isArray(payroll.sourceRefs) || payroll.sourceRefs.length === 0) unknown.push(`${code} payroll state has no source references.`);
  }
  if (state.stateQuality?.status !== 'reconciled') unknown.push(`LeagueState quality is ${state.stateQuality?.status ?? 'unknown'}.`);
  if (!state.rulesReference?.status || state.rulesReference.status !== 'complete') unknown.push('The selected season CBA rules are not marked complete.');
  if (Number(state.rulesReference?.seasonStartYear) !== proposal.seasonStartYear) unknown.push(`The selected CBA rule reference is not season-resolved for ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
  if (!Array.isArray(state.rulesReference?.sourceRefs) || state.rulesReference.sourceRefs.length === 0) unknown.push('The selected season CBA rule reference has no source references.');
  return { errors: unique(errors), unknown: unique(unknown), touchedTeams: [...touchedTeams], participantTeams };
}

function checkTransactionShape(state, proposal) {
  const errors = [];
  if ((state.transactionLedger ?? []).some(row => row.proposalId === proposal.proposalId)) errors.push(`Transaction ${proposal.proposalId} has already been committed.`);
  if (proposal.expectedStateRevision !== null && proposal.expectedStateRevision !== undefined &&
      (!Number.isInteger(proposal.expectedStateRevision) || proposal.expectedStateRevision !== state.revision)) errors.push('Transaction was prepared against a different LeagueState revision.');
  if (proposal.seasonStartYear !== state.seasonStartYear) errors.push('Transaction season does not match current LeagueState season.');
  if (proposal.transactionWindow && proposal.transactionWindow !== state.transactionWindow) errors.push('Transaction window does not match current LeagueState window.');
  if (proposal.kind === 'trade' && proposal.legs.filter(leg => leg.assetType !== 'cash').length < 2) errors.push('A trade requires at least two exchanged assets.');
  if (proposal.kind === 'trade' && proposal.transactionWindow !== 'trade-window') errors.push('Trades can only execute in the trade-window phase.');
  if (proposal.kind === 'free-agent-signing' && proposal.legs.some(leg => (leg.assetType ?? 'player') !== 'player' || leg.fromTeamCode || !leg.toTeamCode)) errors.push('Free-agent signing legs must move a free agent from no team to one team.');
  if (proposal.kind === 'free-agent-signing' && proposal.transactionWindow !== 'free-agency') errors.push('Free-agent signings can only execute in the free-agency phase.');
  if (proposal.kind === 'draft-selection' && (!proposal.prospect?.canonicalName || !proposal.pickId)) errors.push('Draft selection requires a named prospect and pickId.');
  if (proposal.kind === 'draft-selection' && proposal.transactionWindow !== 'draft') errors.push('Draft selections can only execute in the draft phase.');
  if (proposal.kind === 'roster-move' && proposal.legs.some(leg => !['waive', 'sign', 'two-way-convert', 'option-exercise', 'option-decline', 'qualifying-offer', 'exception-renounce'].includes(leg.action))) errors.push('Roster move contains an unsupported action.');
  if (proposal.legs.some(leg => leg.action === 'option-decline' && (leg.toTeamCode || proposal.transactionWindow !== 'option-decisions'))) errors.push('Declining an option requires the option-decisions window and no receiving team.');
  if (proposal.contractSeasons) {
    try { normalizeContractSeasons(proposal, proposal.seasonStartYear); } catch (error) { errors.push(error.message); }
  }
  for (const leg of proposal.legs) {
    if (leg.contractSeasons) {
      try { normalizeContractSeasons(leg, proposal.seasonStartYear); } catch (error) { errors.push(error.message); }
    }
  }
  if (proposal.kind === 'roster-move' && !['option-decisions', 'free-agency', 'trade-window', 'roster-finalization'].includes(proposal.transactionWindow)) errors.push('Roster moves are outside the configured roster decision windows.');
  return errors;
}

function normalizeRuleOutcome(outcome) {
  if (!outcome) return { status: 'unknown', ruleRefs: [], missingInputs: ['No versioned rule evaluation was supplied.'], violations: [] };
  if (!['pass', 'fail', 'unknown'].includes(outcome.status)) throw new Error('Rule evaluator must return status pass, fail, or unknown.');
  return {
    status: outcome.status,
    ruleVersionId: outcome.ruleVersionId ?? outcome.versionId ?? null,
    ruleRefs: [...(outcome.ruleRefs ?? [])],
    missingInputs: [...(outcome.missingInputs ?? [])],
    violations: [...(outcome.violations ?? [])],
    resultingPayrollByTeam: outcome.resultingPayrollByTeam ? clone(outcome.resultingPayrollByTeam) : null,
    calculations: outcome.calculations || outcome.resultingPayrollByTeam
      ? { ...(outcome.calculations ? clone(outcome.calculations) : {}), ...(outcome.resultingPayrollByTeam ? { resultingPayrollByTeam: clone(outcome.resultingPayrollByTeam) } : {}) }
      : null,
  };
}

export function evaluateTransaction(state, proposalInput, { ruleEngine = null } = {}) {
  validateLeagueState(state);
  const proposal = proposalInput.format === 'djhc-transaction-proposal-v1' ? proposalInput : createTransactionProposal(proposalInput);
  const shapeErrors = checkTransactionShape(state, proposal);
  const legFacts = collectLegProblems(state, proposal);
  let capAccountingPreview = null;
  const accountingViolations = [], accountingMissing = [];
  if (!shapeErrors.length && !legFacts.errors.length && (signingLegs(proposal).length || state.teams.some(team => team.capLedger && legFacts.touchedTeams.includes(team.teamCode)))) {
    try {
      capAccountingPreview = previewTransactionCapAccounting(state, proposal, { teamCodes: legFacts.touchedTeams });
      accountingMissing.push(...Object.values(capAccountingPreview.afterByTeam).flatMap(result => result.missingInputs ?? []));
      for (const [teamCode, result] of Object.entries(capAccountingPreview.afterByTeam)) {
        for (const trigger of findTeam(state, teamCode)?.payrollState?.hardCapTriggers ?? []) {
          if (trigger.seasonStartYear !== proposal.seasonStartYear) continue;
          const threshold = trigger.thresholdUsd;
          if (result.totals.apronTeamSalaryUsd === null || threshold === null || threshold === undefined || typeof threshold === 'boolean' || !Number.isFinite(Number(threshold))) {
            accountingMissing.push(`${teamCode} has an unresolved hard-cap check.`);
          } else if (result.totals.apronTeamSalaryUsd > Number(threshold)) accountingViolations.push(`${teamCode} exceeds its existing ${trigger.level} hard cap.`);
        }
      }
    } catch (error) { accountingViolations.push(`Cap accounting transition failed: ${error.message}`); }
  }
  for (const leg of proposal.legs.filter(leg => leg.action === 'waive')) {
    const player = findPlayer(state, leg.canonicalName ?? leg.playerName).player;
    if (!player) continue;
    const result = waiverAccountingForLeg(player, leg, proposal, state);
    accountingViolations.push(...result.violations);
    accountingMissing.push(...result.missingInputs);
  }
  for (const leg of proposal.legs.filter(leg => leg.action === 'option-decline' && (leg.freeAgentCapHoldInput || proposal.freeAgentCapHoldInput))) {
    const player = findPlayer(state, leg.canonicalName ?? leg.playerName).player;
    if (!player) continue;
    try {
      const result = freeAgentHoldForLeg(player, leg, proposal);
      accountingViolations.push(...result.conflicts);
      accountingMissing.push(...result.missingInputs);
    } catch (error) { accountingViolations.push(error.message); }
  }
  const storedTpeEvaluations = evaluateProposalStoredTpeUses(state, proposal, capAccountingPreview);
  accountingViolations.push(...Object.values(storedTpeEvaluations).flatMap(result => result.violations));
  accountingMissing.push(...Object.values(storedTpeEvaluations).flatMap(result => result.missingInputs));
  const signingMechanismEvaluations = capAccountingPreview?.signingMechanismEvaluations ?? evaluateProposalSignings(state, proposal, null);
  accountingViolations.push(...signingMechanismEvaluations.flatMap(result => result.violations));
  accountingMissing.push(...signingMechanismEvaluations.flatMap(result => result.missingInputs));
  const contractScaleEvaluations = [];
  const contractOptionEvaluations = [];
  for (const leg of proposal.legs.filter(leg => (leg.assetType ?? 'player') === 'prospect' ||
      (leg.assetType ?? 'player') === 'player' && (proposal.kind === 'free-agent-signing' || ['sign', 'two-way-convert'].includes(leg.action)))) {
    const input = leg.contractScaleInput ?? proposal.contractScaleInput;
    const terms = leg.contractSeasons ?? proposal.contractSeasons ?? [leg.contractTerms ?? proposal.contractTerms].filter(Boolean);
    const optionResult = evaluateContractOptionRules({ contractSeasons: terms,
      contractProfile: input?.contractType === 'first-round-rookie' ? 'first-round-rookie' : 'standard',
      seasonStartYear: proposal.seasonStartYear, ruleVersionId: state.rulesReference?.ruleVersionId ?? 'unresolved' });
    contractOptionEvaluations.push({ canonicalName: leg.canonicalName ?? leg.playerName ?? leg.prospect?.canonicalName ?? proposal.prospect?.canonicalName, ...optionResult });
    accountingViolations.push(...optionResult.violations);
    accountingMissing.push(...optionResult.missingInputs);
    if (!input) continue;
    const result = evaluateContractSalaryScale({ scale: input.scale, contractSeasons: terms, input });
    if (input.scale?.seasonStartYear !== proposal.seasonStartYear) result.violations.push('Contract salary scale is not for the first contract/transaction season.');
    const selectedCap = state.rulesReference?.thresholds?.salaryCap;
    if (selectedCap !== null && selectedCap !== undefined && input.scale?.salaryCapUsd !== Number(selectedCap)) result.violations.push('Contract salary scale uses a different cap from the selected league scenario.');
    if (result.violations.length) result.status = 'fail';
    contractScaleEvaluations.push({ canonicalName: leg.canonicalName ?? leg.playerName ?? leg.prospect?.canonicalName ?? proposal.prospect?.canonicalName, ...result });
    accountingViolations.push(...result.violations);
    accountingMissing.push(...result.missingInputs);
  }
  // Only participating teams belong to this transaction's roster assessment.
  // A different team's unresolved roster cannot block an unrelated signing.
  const rosterEvaluation = evaluateRosterLimits({ state: { ...state, teams: state.teams.filter(team => legFacts.touchedTeams.includes(team.teamCode)),
    players: state.players.filter(player => !player.teamCode || legFacts.touchedTeams.includes(String(player.teamCode).toUpperCase())) }, proposal, phase: 'transaction' });
  accountingViolations.push(...rosterEvaluation.violations);
  accountingMissing.push(...rosterEvaluation.missingInputs);
  const restrictedFreeAgencyEvaluation = evaluateRestrictedFreeAgencyTransaction({ state, proposal, capAccountingPreview });
  accountingViolations.push(...restrictedFreeAgencyEvaluation.violations);
  accountingMissing.push(...restrictedFreeAgencyEvaluation.missingInputs);
  const ruleOutcome = normalizeRuleOutcome(ruleEngine?.evaluate ? ruleEngine.evaluate({ state: clone(state), proposal: clone(proposal), capAccountingPreview: clone(capAccountingPreview), storedTpeEvaluations: clone(storedTpeEvaluations) }) : null);
  const illegalReasons = unique([...shapeErrors, ...legFacts.errors, ...accountingViolations, ...ruleOutcome.violations,
    ...(ruleOutcome.status === 'fail' && !ruleOutcome.violations.length ? ['Season rule engine returned a failed constraint.'] : [])]);
  const missingInputs = unique([
    ...legFacts.unknown,
    ...accountingMissing,
    ...ruleOutcome.missingInputs,
    ...(proposal.assumptions ?? []).map(assumption => `Transaction relies on an unresolved assumption: ${assumption}.`),
  ]);
  if (ruleOutcome.status === 'pass') {
    if (!ruleOutcome.ruleRefs.length) missingInputs.push('Passing season-rule evaluation has no rule/source references.');
    if (!ruleOutcome.ruleVersionId) missingInputs.push('Passing season-rule evaluation has no rule version.');
    else if (ruleOutcome.ruleVersionId !== state.rulesReference?.ruleVersionId) missingInputs.push('Passing season-rule evaluation version does not match the selected CBA rule reference.');
    const payroll = ruleOutcome.resultingPayrollByTeam;
    for (const teamCode of legFacts.touchedTeams) {
      const teamPayroll = payroll?.[teamCode];
      if (!teamPayroll || teamPayroll.status !== 'reconciled') missingInputs.push(`Rule evaluation did not return reconciled resulting payroll state for ${teamCode}.`);
      if (Number(teamPayroll?.seasonStartYear) !== proposal.seasonStartYear) missingInputs.push(`Rule evaluation resulting payroll for ${teamCode} is not season-resolved for ${proposal.seasonStartYear}-${proposal.seasonStartYear + 1}.`);
      if (teamPayroll?.rulesVersionId !== ruleOutcome.ruleVersionId) missingInputs.push(`Rule evaluation resulting payroll for ${teamCode} does not match its rule version.`);
      if (!Array.isArray(teamPayroll?.sourceRefs) || teamPayroll.sourceRefs.length === 0) missingInputs.push(`Rule evaluation resulting payroll for ${teamCode} has no source references.`);
    }
  }
  if (ruleOutcome.status === 'unknown') missingInputs.push('Season-specific salary-cap/CBA calculation returned unknown.');
  const status = illegalReasons.length || ruleOutcome.status === 'fail'
    ? 'illegal'
    : missingInputs.length || ruleOutcome.status !== 'pass'
      ? 'provisional'
      : 'confirmed-legal';
  const userTeams = new Set([
    ...(state.userControlledTeamCodes ?? []),
    ...(proposal.userControlledTeamCodes ?? []),
  ].map(code => String(code).toUpperCase()));
  const userApprovalRequired = legFacts.participantTeams.some(code => userTeams.has(code));
  const approvalReceived = approvalMatches(state, proposal, legFacts.participantTeams.filter(code => userTeams.has(code)));
  const exactModeBlocked = status !== 'confirmed-legal' && state.mode === 'exact';
  const sandboxAllowed = status !== 'illegal' && state.mode === 'provisional-sandbox';
  const blockedReasons = [
    ...restrictedFreeAgencyEvaluation.blockedReasons,
    ...(exactModeBlocked ? ['Exact mode blocks any transaction without fully resolved contracts, team state, season rules, and a passing rule evaluation.'] : []),
    ...(userApprovalRequired && !approvalReceived ? ['User approval is required for every transaction involving the user-controlled team.'] : []),
  ];
  return {
    format: 'djhc-transaction-evaluation-v1',
    schemaVersion: '1.0.0',
    proposalId: proposal.proposalId,
    kind: proposal.kind,
    seasonStartYear: proposal.seasonStartYear,
    transactionWindow: proposal.transactionWindow,
    status,
    executionStatus: blockedReasons.length ? 'blocked' : status === 'illegal' ? 'blocked' : status === 'confirmed-legal' ? 'ready' : sandboxAllowed ? 'ready-provisional-sandbox' : 'blocked',
    userApprovalRequired,
    approvalReceived,
    touchedTeams: legFacts.touchedTeams,
    legality: { ruleVersion: state.rulesReference?.ruleVersionId ?? null, ruleRefs: unique([...ruleOutcome.ruleRefs,
      ...contractOptionEvaluations.flatMap(result => result.ruleRefs), ...rosterEvaluation.ruleRefs,
      ...restrictedFreeAgencyEvaluation.ruleRefs, ...signingMechanismEvaluations.flatMap(result => result.ruleRefs ?? [])]), calculations: ruleOutcome.calculations },
    capCalculations: { ...(ruleOutcome.calculations ?? {}), storedTpeEvaluations, contractScaleEvaluations, contractOptionEvaluations, rosterEvaluation, restrictedFreeAgencyEvaluation, signingMechanismEvaluations, ...(capAccountingPreview ? { componentAccounting: capAccountingPreview } : {}) },
    missingInputs: unique(missingInputs),
    violations: illegalReasons,
    blockedReasons,
    teamValue: null,
    cpuResponse: null,
    resultingStateChanges: proposal.legs.map(leg => ({
      assetType: leg.assetType ?? 'player',
      canonicalName: leg.canonicalName ?? leg.playerName ?? leg.prospect?.canonicalName ?? proposal.prospect?.canonicalName ?? null,
      pickId: leg.pickId ?? null,
      exceptionId: leg.exceptionId ?? null,
      action: leg.action ?? proposal.kind,
      fromTeamCode: leg.fromTeamCode ?? null,
      toTeamCode: leg.toTeamCode ?? null,
    })),
    sourceRefs: [...(proposal.sourceRefs ?? [])],
  };
}

function waiverAccountingForLeg(player, leg, proposal, state) {
  const options = clone(leg.waiverAccounting ?? proposal.waiverAccounting ?? {});
  const inputConflicts = [];
  if (options.stretch && state) {
    const ledger = findTeam(state, leg.fromTeamCode)?.capLedger;
    const supplied = options.stretch.otherFormerPlayerCapSalaryBySeason ?? {};
    const derived = {};
    const originalRows = options.postTerminationSeasons ?? player.contractSeasons ?? player.contract?.seasons ?? [];
    const lastYear = Math.max(...originalRows.map(term => Number(term.seasonStartYear ?? term.fromYear)).filter(year => year >= proposal.seasonStartYear));
    const firstYear = options.stretch.branch === 'july-august' ? proposal.seasonStartYear : proposal.seasonStartYear + 1;
    const remainingCount = lastYear - firstYear + 1;
    const requiredYears = Number.isInteger(remainingCount) && remainingCount > 0
      ? Array.from({ length: 2 * remainingCount + 1 }, (_, index) => firstYear + index).filter(year => year > proposal.seasonStartYear).map(String) : [];
    for (const year of new Set([...Object.keys(supplied), ...requiredYears])) {
      const coverage = ledger?.coverageBySeason?.[year]?.['dead-money'];
      const categoryComplete = ['complete', 'declared-none'].includes(coverage?.status ?? coverage);
      const entries = ledger?.entries.filter(entry => entry.kind === 'dead-money' && entry.active !== false && entry.seasonStartYear === Number(year)) ?? [];
      const values = entries.map(entry => {
        const value = entry.values?.teamSalaryUsd;
        const number = valueForTerm(entry.values, 'teamSalaryUsd');
        const status = value?.valueStatus ?? value?.status ?? entry.status ?? '';
        return number === null || number === '' || typeof number === 'boolean' || ['unknown', 'conflict', 'unresolved'].includes(status) ||
          String(status).startsWith('unknown') || !Number.isFinite(Number(number)) ? null : Number(number);
      });
      if (ledger) {
        derived[year] = categoryComplete && values.every(value => value !== null) &&
          !((coverage?.status ?? coverage) === 'declared-none' && entries.length) ? values.reduce((sum, value) => sum + value, 0) : null;
        if (derived[year] !== null && supplied[year] !== null && supplied[year] !== undefined && Number(supplied[year]) !== derived[year]) inputConflicts.push(`Supplied former-player salary conflicts with ${leg.fromTeamCode}'s ledger in ${year}.`);
      } else derived[year] = supplied[year];
    }
    options.stretch.otherFormerPlayerCapSalaryBySeason = derived;
    const knownCap = state.rulesReference?.thresholds?.salaryCap;
    if (knownCap !== null && knownCap !== undefined && Number.isFinite(Number(knownCap))) {
      if (options.stretch.electionYearSalaryCapUsd !== undefined && Number(options.stretch.electionYearSalaryCapUsd) !== Number(knownCap)) inputConflicts.push('Supplied election-year cap conflicts with the selected rule thresholds.');
      options.stretch.electionYearSalaryCapUsd = Number(knownCap);
    }
  }
  const result = buildWaiverCapEntries({ ...options, canonicalName: player.canonicalName, proposalId: proposal.proposalId,
    seasonStartYear: proposal.seasonStartYear, contractSeasons: clone(player.contractSeasons ?? player.contract?.seasons ?? []) });
  if (inputConflicts.length) { result.violations.push(...inputConflicts); result.status = 'invalid'; }
  return result;
}

function evaluateProposalStoredTpeUses(state, proposal, capAccountingPreview) {
  const results = {};
  const requests = { ...(proposal.storedTpeUsageByTeam ?? {}) };
  for (const teamCode of unique(proposal.legs.flatMap(leg => [leg.fromTeamCode, leg.toTeamCode]))) {
    if ((proposal.salaryMatchingPathsByTeam?.[teamCode] ?? proposal.salaryMatchingPath) === 'stored-standard-tpe' &&
        !requests[teamCode] && !requests[teamCode.toLowerCase()]) requests[teamCode] = {};
  }
  for (const [teamCodeInput, suppliedUsage] of Object.entries(requests)) {
    const usage = suppliedUsage ?? {};
    const teamCode = teamCodeInput.toUpperCase(), team = findTeam(state, teamCode);
    const playerLegs = proposal.legs.filter(leg => (leg.assetType ?? 'player') === 'player');
    const incoming = playerLegs.filter(leg => String(leg.toTeamCode).toUpperCase() === teamCode);
    const outgoing = playerLegs.filter(leg => String(leg.fromTeamCode).toUpperCase() === teamCode);
    const amounts = incoming.map(leg => {
      const player = findPlayer(state, leg.canonicalName ?? leg.playerName).player;
      const term = player && termForSeason(player, proposal.seasonStartYear);
      const value = valueForTerm(term, 'tradeSalaryIncoming');
      const status = termStatus(term, 'tradeSalaryIncoming');
      return value === null || value === '' || typeof value === 'boolean' || ['unknown', 'conflict', 'unresolved', 'missing', 'unreported', 'candidate'].includes(status) ||
        /^(unknown|candidate)/.test(String(status)) || term?.accounting?.conflicts?.length ||
        !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
    });
    const component = capAccountingPreview?.afterByTeam?.[teamCode];
    const postApron = component ? component.totals.apronTeamSalaryUsd : null;
    const result = evaluateStoredTpeUse({ entry: team?.tpeLedger?.find(row => row.exceptionId === usage.exceptionId), teamCode,
      seasonStartYear: proposal.seasonStartYear, transactionDate: usage.transactionDate,
      incomingTradeSalaryUsd: amounts.every(value => value !== null) ? amounts.reduce((sum, value) => sum + value, 0) : null,
      combinedWithOtherExceptions: usage.combinedWithOtherExceptions, postTradeApronTeamSalaryUsd: postApron,
      firstApronUsd: state.rulesReference?.thresholds?.firstApron, ruleVersionId: state.rulesReference?.ruleVersionId });
    if (proposal.kind !== 'trade' || !incoming.length) result.violations.push('Stored TPE usage requires at least one acquired player in a trade.');
    if (outgoing.length) result.violations.push('This stored-TPE path acquires all incoming players without aggregating current outgoing salary; decomposed multi-path trades are not yet supported.');
    if ((proposal.salaryMatchingPathsByTeam?.[teamCode] ?? proposal.salaryMatchingPath) !== 'stored-standard-tpe') result.violations.push('Stored TPE use requires the stored-standard-tpe matching path for its team.');
    if (result.violations.length) result.status = 'fail';
    results[teamCode] = result;
  }
  return results;
}

function applyStoredTpeStateChanges(state, proposal, evaluations) {
  for (const [teamCode, result] of Object.entries(evaluations)) {
    const team = findTeam(state, teamCode), usage = proposal.storedTpeUsageByTeam?.[teamCode] ?? proposal.storedTpeUsageByTeam?.[teamCode.toLowerCase()];
    if (!team) continue;
    if (result.status === 'pass') {
      const index = team.tpeLedger.findIndex(entry => entry.exceptionId === result.exceptionId);
      team.tpeLedger[index] = commitStoredTpeUse(team.tpeLedger[index], result, { proposalId: proposal.proposalId, transactionDate: usage.transactionDate });
      for (const hold of team.capLedger?.entries ?? []) {
        if (hold.kind !== 'exception-hold' || hold.active === false || hold.seasonStartYear !== proposal.seasonStartYear || hold.tpeExceptionId !== result.exceptionId) continue;
        const old = valueForTerm(hold.values, 'teamSalaryUsd');
        const status = hold.values.teamSalaryUsd?.valueStatus ?? hold.status ?? '';
        const known = old !== null && old !== '' && typeof old !== 'boolean' && !['unknown', 'conflict', 'unresolved', 'missing', 'unreported', 'candidate'].includes(status) &&
          !/^(unknown|candidate)/.test(String(status)) && Number.isFinite(Number(old));
        hold.values.teamSalaryUsd = { value: known ? Math.max(0, Math.round((Number(old) - result.incomingTradeSalaryUsd) * 100) / 100) : null,
          valueStatus: known ? 'generated-scenario' : 'unknown', field: 'teamSalaryUsd', unit: 'USD', seasonStartYear: proposal.seasonStartYear,
          source: { sourceSystem: 'djhc-tpe-state-transition', sourceVersion: 'djhc-tpe-state-transition-v1', sourceClass: 'generated-scenario',
            retrievedAt: usage.transactionDate, inputEvidence: clone(hold.values.teamSalaryUsd) }, ruleRef: 'VII-6n2' };
        hold.lastUpdatedByProposalId = proposal.proposalId;
      }
      team.payrollState.hardCapTriggers = [...(team.payrollState.hardCapTriggers ?? []), ...result.hardCapTriggers.map(trigger =>
        ({ ...trigger, seasonStartYear: proposal.seasonStartYear, proposalId: proposal.proposalId }))];
    } else {
      team.pendingTpeUses = [...(team.pendingTpeUses ?? []), { proposalId: proposal.proposalId, exceptionId: result.exceptionId, evaluation: clone(result) }];
      for (const entry of team.tpeLedger ?? []) if (!result.exceptionId || entry.exceptionId === result.exceptionId) {
        entry.usedTradeSalaryUsd = null;
        entry.capacityStatus = 'unresolved-provisional-use';
      }
      for (const hold of team.capLedger?.entries ?? []) if (hold.kind === 'exception-hold' && hold.tpeExceptionId && (!result.exceptionId || hold.tpeExceptionId === result.exceptionId)) hold.values.teamSalaryUsd = null;
    }
  }
}

function signingLegs(proposal) {
  return proposal.legs.filter(leg => (leg.assetType ?? 'player') === 'player' &&
    (proposal.kind === 'free-agent-signing' || leg.action === 'sign'));
}

function signingTerms(leg, proposal) {
  return leg.contractSeasons ?? proposal.contractSeasons ?? [leg.contractTerms ?? proposal.contractTerms].filter(Boolean);
}

function knownSigningCost(leg, proposal) {
  const term = signingTerms(leg, proposal)[0];
  const values = ['salary', 'likelyBonus', 'unlikelyBonus'].map(key => {
    const value = valueForTerm(term, key);
    return value === null || value === '' || typeof value === 'boolean' ||
      /unknown|candidate|conflict|unresolved|missing|unreported/.test(String(termStatus(term, key))) || !Number.isFinite(Number(value)) ? null : Number(value);
  });
  return values.some(value => value === null || value < 0) ? null : values.reduce((sum, value) => sum + value, 0);
}

// Consume deemed-inclusion holds in the private preview before checking room.
// The guard also makes the later committed ledger update idempotent in preview.
function projectSigningHolds(state, proposal) {
  for (const leg of signingLegs(proposal)) {
    const input = leg.signingRuleInput ?? proposal.signingRuleInput;
    if (!input?.exceptionId) continue;
    const team = findTeam(state, leg.toTeamCode), cost = knownSigningCost(leg, proposal);
    const mechanism = leg.signingMechanism ?? proposal.signingMechanism;
    if (!['non-taxpayer-mle', 'taxpayer-mle', 'room-mle', 'biannual'].includes(mechanism)) continue;
    const budget = team?.signingExceptionLedger?.find(entry => entry.exceptionId === input.exceptionId);
    if (!budget || budget.mechanism !== mechanism || budget.teamCode !== team.teamCode || budget.seasonStartYear !== proposal.seasonStartYear) continue;
    for (const hold of team?.capLedger?.entries ?? []) {
      if (hold.kind !== 'exception-hold' || hold.active === false || hold.seasonStartYear !== proposal.seasonStartYear ||
          hold.signingExceptionId !== input.exceptionId || hold.lastUpdatedByProposalId === proposal.proposalId) continue;
      const value = valueForTerm(hold.values, 'teamSalaryUsd');
      const usable = value !== null && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)) &&
        !/unknown|candidate|conflict|unresolved|missing|unreported/.test(String(hold.values.teamSalaryUsd?.valueStatus ?? hold.status ?? ''));
      hold.values.teamSalaryUsd = { value: usable && cost !== null ? Math.max(0, Math.round((Number(value) - cost) * 100) / 100) : null,
        valueStatus: usable && cost !== null ? 'generated-scenario' : 'unknown', unit: 'USD', seasonStartYear: proposal.seasonStartYear,
        source: { sourceSystem: 'djhc-signing-exception-transition', sourceVersion: 'v1', sourceClass: 'generated-scenario',
          inputEvidence: clone(hold.values.teamSalaryUsd) }, ruleRef: 'VII-6n' };
      hold.lastUpdatedByProposalId = proposal.proposalId;
    }
  }
}

function evaluateProposalSignings(state, proposal, preview) {
  const results = [], budgetKeys = new Set();
  for (const leg of signingLegs(proposal)) {
    const teamCode = String(leg.toTeamCode ?? '').toUpperCase(), team = findTeam(state, teamCode);
    const input = leg.signingRuleInput ?? proposal.signingRuleInput ?? {}, mechanism = leg.signingMechanism ?? proposal.signingMechanism;
    const payroll = preview?.payrollAfterByTeam?.[teamCode];
    const result = evaluateSigningMechanism({ mechanism, input, seasonStartYear: proposal.seasonStartYear,
      teamCode, canonicalName: leg.canonicalName ?? leg.playerName, contractSeasons: signingTerms(leg, proposal),
      thresholds: state.rulesReference?.thresholds ?? {}, ruleVersionId: state.rulesReference?.ruleVersionId,
      postTeamSalaryUsd: preview?.afterByTeam?.[teamCode]?.totals.teamSalaryUsd ?? payroll?.totalTeamSalaryUsd,
      postApronTeamSalaryUsd: preview?.afterByTeam?.[teamCode]?.totals.apronTeamSalaryUsd ?? payroll?.apronTeamSalaryUsd,
      contractScaleInput: leg.contractScaleInput ?? proposal.contractScaleInput,
      exceptionBudget: team?.signingExceptionLedger?.find(entry => entry.exceptionId === input.exceptionId),
      teamUsage: team?.signingExceptionUsageBySeason?.[String(proposal.seasonStartYear)] });
    if (['non-taxpayer-mle', 'taxpayer-mle', 'biannual'].includes(mechanism) && input.exceptionEntitlement) {
      const before = preview?.beforeByTeam?.[teamCode];
      const holds = (before?.entries ?? []).filter(entry => entry.kind === 'exception-hold').map(entry => valueForTerm(entry.values, 'teamSalaryUsd'));
      const known = before?.totals.teamSalaryUsd !== null && before?.totals.teamSalaryUsd !== undefined && holds.every(value => value !== null && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)));
      const actual = known ? before.totals.teamSalaryUsd - holds.reduce((sum, value) => sum + Number(value), 0) : null;
      const supplied = valueForTerm(input.exceptionEntitlement, 'salaryExcludingDeemedExceptionsUsd');
      if (actual === null) result.missingInputs.push('Exception entitlement cannot be reconciled without component Team Salary and explicit exception holds.');
      else if (supplied !== null && Math.abs(Number(supplied) - actual) > 0.01) result.violations.push('Exception entitlement salary conflicts with the current component payroll.');
      if (result.missingInputs.length && result.status === 'pass') result.status = 'unknown';
    }
    if (input.exceptionId) {
      const key = `${teamCode}:${input.exceptionId}`;
      if (budgetKeys.has(key)) result.violations.push('Multiple uses of one signing budget in a proposal require separate sequential reservations.');
      budgetKeys.add(key);
    }
    if (result.violations.length) result.status = 'fail';
    results.push(result);
  }
  return results;
}

function applySigningExceptionStateChanges(state, proposal, evaluations) {
  projectSigningHolds(state, proposal);
  for (const result of evaluations) {
    const team = findTeam(state, result.teamCode);
    if (!team) continue;
    const exceptionId = result.budgetUse?.exceptionId;
    if (exceptionId) {
      const index = (team.signingExceptionLedger ?? []).findIndex(entry => entry.exceptionId === exceptionId);
      if (result.status === 'pass' && index >= 0) team.signingExceptionLedger[index] = commitSigningExceptionUse(team.signingExceptionLedger[index], result, { proposalId: proposal.proposalId });
      else {
        team.pendingSigningExceptionUses = [...(team.pendingSigningExceptionUses ?? []), { proposalId: proposal.proposalId, evaluation: clone(result) }];
        if (index >= 0) Object.assign(team.signingExceptionLedger[index], { usedAmountUsd: null, remainingAmountAtWindowUsd: null, capacityStatus: 'unresolved-provisional-use' });
        for (const hold of team.capLedger?.entries ?? []) if (hold.kind === 'exception-hold' && hold.signingExceptionId === exceptionId) hold.values.teamSalaryUsd = null;
      }
    }
    if (result.mechanism) {
      team.signingExceptionUsageBySeason ??= {};
      const year = String(proposal.seasonStartYear), usage = team.signingExceptionUsageBySeason[year] ?? { coverageStatus: 'unknown', usedMechanisms: [] };
      team.signingExceptionUsageBySeason[year] = { ...usage, usedMechanisms: unique([...(usage.usedMechanisms ?? []), result.mechanism]) };
    }
    team.payrollState.hardCapTriggers = [...(team.payrollState.hardCapTriggers ?? []), ...result.hardCapTriggers.map(trigger => ({ ...trigger, proposalId: proposal.proposalId }))];
  }
}

function freeAgentHoldForLeg(player, leg, proposal) {
  const input = clone(leg.freeAgentCapHoldInput ?? proposal.freeAgentCapHoldInput);
  if ((input.canonicalName && normalizeCanonicalPlayerName(input.canonicalName) !== normalizeCanonicalPlayerName(player.canonicalName)) ||
      (input.teamCode && String(input.teamCode).toUpperCase() !== String(leg.fromTeamCode).toUpperCase()) ||
      (input.seasonStartYear !== undefined && input.seasonStartYear !== proposal.seasonStartYear)) throw new Error('Free-agent hold identity, team, or season does not match its option-decline transaction.');
  const result = calculateFreeAgentCapHold({ ...input, canonicalName: player.canonicalName, teamCode: leg.fromTeamCode, seasonStartYear: proposal.seasonStartYear });
  if (result.entries.some(entry => entry.teamCode !== String(leg.fromTeamCode).toUpperCase())) throw new Error('New offering-team offer sheets require their own approved transaction; they cannot be inserted by an option decline.');
  return result;
}

function releasePlayerHolds(state, canonicalName, proposal, signingTeamCode) {
  const key = normalizeCanonicalPlayerName(canonicalName);
  for (const team of state.teams) {
    for (const entry of team.capLedger?.entries ?? []) {
      if (entry.active === false || entry.seasonStartYear !== proposal.seasonStartYear || !['free-agent-hold', 'draft-hold'].includes(entry.kind) ||
          normalizeCanonicalPlayerName(entry.canonicalName) !== key) continue;
      entry.active = false;
      entry.closedByProposalId = proposal.proposalId;
      entry.closeReason = 'player-signed';
    }
    for (const rights of team.freeAgentRights ?? []) if (rights.seasonStartYear === proposal.seasonStartYear && normalizeCanonicalPlayerName(rights.canonicalName) === key) {
      rights.rightsStatus = team.teamCode === signingTeamCode ? 'signed-with-original-team' : 'signed-elsewhere';
      rights.closedByProposalId = proposal.proposalId;
    }
    if (team.payrollState?.unresolvedLiabilities) team.payrollState.unresolvedLiabilities = team.payrollState.unresolvedLiabilities.filter(row =>
      !(row.seasonStartYear === proposal.seasonStartYear && normalizeCanonicalPlayerName(row.canonicalName) === key && /free-agent cap hold/i.test(row.reason ?? '')));
  }
}

function applyLeg(state, leg, proposal) {
  const from = leg.fromTeamCode ? findTeam(state, leg.fromTeamCode) : null;
  const to = leg.toTeamCode ? findTeam(state, leg.toTeamCode) : null;
  const assetType = leg.assetType ?? 'player';
  if (assetType === 'player') {
    const { player } = findPlayer(state, leg.canonicalName ?? leg.playerName);
    if (!player) throw new Error(`Cannot apply unresolved player ${leg.canonicalName ?? leg.playerName}.`);
    const termOnlyAction = ['option-exercise', 'qualifying-offer', 'two-way-convert'].includes(leg.action);
    const destination = to ?? (termOnlyAction ? from ?? findTeam(state, player.teamCode) : null);
    if (from && from !== destination) from.rosterNames = from.rosterNames.filter(name => normalizeCanonicalPlayerName(name) !== normalizeCanonicalPlayerName(player.canonicalName));
    if (destination && !destination.rosterNames.some(name => normalizeCanonicalPlayerName(name) === normalizeCanonicalPlayerName(player.canonicalName))) destination.rosterNames.push(player.canonicalName);
    player.teamCode = destination?.teamCode ?? null;
    player.currentSeasonStartYear = proposal.seasonStartYear;
    if (leg.action === 'waive') player.rosterStatus = 'waived';
    else player.rosterStatus = destination ? 'rostered' : 'free-agent';
    if (leg.action === 'waive' && from) {
      // Guaranteed cash is not necessarily the CBA waived cap charge. A
      // supplied scenario/rule-engine liability must identify that charge.
      const liabilitySeasons = unique([proposal.seasonStartYear, ...(player.contractSeasons ?? player.contract?.seasons ?? []).map(term => Number(term.seasonStartYear ?? term.fromYear)).filter(year => year >= proposal.seasonStartYear)]);
      from.payrollState.unresolvedLiabilities = [...(from.payrollState.unresolvedLiabilities ?? []), ...liabilitySeasons.map(seasonStartYear => ({
        canonicalName: player.canonicalName, seasonStartYear, proposalId: proposal.proposalId,
        reason: 'Waiver dead-money, set-off, and stretch treatment require a resolved cap liability.',
      }))];
      const waiver = waiverAccountingForLeg(player, leg, proposal, state);
      player.waiverAccountingHistory = [...(player.waiverAccountingHistory ?? []), clone(waiver)];
      if (from.capLedger && !waiver.violations.length && (!leg.waiverAccounting?.stretch && !proposal.waiverAccounting?.stretch || waiver.status === 'calculated')) {
        for (const entry of waiver.entries) {
          const coverage = from.capLedger.coverageBySeason[String(entry.seasonStartYear)];
          if (coverage && (coverage['dead-money'] === 'declared-none' || coverage['dead-money']?.status === 'declared-none')) coverage['dead-money'] = 'complete';
        }
        const itemized = appendCapLedgerEntries(state, from.teamCode, waiver.entries, { resolveProposalId: proposal.proposalId, canonicalName: player.canonicalName, incrementRevision: false });
        // appendCapLedgerEntries is an immutable helper; apply this one team's
        // returned accounting state to the transaction's private working copy.
        Object.assign(from, itemized.state.teams.find(team => team.teamCode === from.teamCode));
        if (waiver.restriction) from.reacquisitionRestrictions = [...(from.reacquisitionRestrictions ?? []), { ...waiver.restriction, teamCode: from.teamCode }];
      }
      for (const term of player.contractSeasons ?? player.contract?.seasons ?? []) if (Number(term.seasonStartYear ?? term.fromYear) >= proposal.seasonStartYear) term.active = false;
    }
    if (leg.action === 'option-decline') {
      const selectedTerm = termForSeason(player, proposal.seasonStartYear);
      if (selectedTerm) { selectedTerm.optionDecisionStatus = 'declined'; selectedTerm.active = false; }
      player.nextSeasonContractState = { seasonStartYear: proposal.seasonStartYear, status: 'unattached', proposalId: proposal.proposalId };
      if (from) {
        from.freeAgentRights = [...(from.freeAgentRights ?? []), { canonicalName: player.canonicalName,
          seasonStartYear: proposal.seasonStartYear, reason: 'declined-option', rightsStatus: 'unresolved', proposalId: proposal.proposalId }];
        from.payrollState.unresolvedLiabilities = [...(from.payrollState.unresolvedLiabilities ?? []), {
          canonicalName: player.canonicalName, seasonStartYear: proposal.seasonStartYear,
          proposalId: proposal.proposalId, reason: 'Free-agent cap hold and rights require resolution after the declined option.',
        }];
        if (from.capLedger && (leg.freeAgentCapHoldInput || proposal.freeAgentCapHoldInput)) {
          const hold = freeAgentHoldForLeg(player, leg, proposal);
          if (!hold.conflicts.length) {
            const entries = hold.entries.map(entry => ({ ...entry, proposalId: proposal.proposalId }));
            const itemized = appendCapLedgerEntries(state, from.teamCode, entries,
              { resolveProposalId: proposal.proposalId, canonicalName: player.canonicalName, incrementRevision: false });
            Object.assign(from, itemized.state.teams.find(team => team.teamCode === from.teamCode));
            const rights = from.freeAgentRights.find(row => row.proposalId === proposal.proposalId);
            if (rights) { rights.rightsStatus = hold.entryCompleteness === 'complete' ? 'scenario-calculated' : 'unresolved'; rights.holdCalculation = clone(hold); }
          }
        }
      }
    }
    if (leg.action === 'option-exercise' && !leg.contractTerms && !proposal.contractTerms) {
      const selectedTerm = termForSeason(player, proposal.seasonStartYear);
      if (selectedTerm) selectedTerm.optionDecisionStatus = 'exercised';
      player.nextSeasonContractState = { seasonStartYear: proposal.seasonStartYear, status: 'contracted-next-season',
        proposalId: proposal.proposalId, source: 'simulation-transaction', term: clone(selectedTerm) };
    }
    const contractTerms = leg.contractTerms ?? proposal.contractTerms;
    if (leg.action === 'qualifying-offer' && contractTerms) {
      player.qualifyingOffer = { terms: clone(contractTerms), seasonStartYear: proposal.seasonStartYear,
        status: 'outstanding-offer', proposalId: proposal.proposalId };
      player.nextSeasonContractState = { seasonStartYear: proposal.seasonStartYear, status: 'qualifying-offer-outstanding', proposalId: proposal.proposalId };
    }
    if (contractTerms && ['free-agent-signing', 'draft-selection', 'option-exercise', 'two-way-convert', 'sign'].includes(leg.action ?? proposal.kind)) {
      const terms = [...(player.contractSeasons ?? player.contract?.seasons ?? [])];
      const supplied = leg.contractSeasons ? normalizeContractSeasons(leg, proposal.seasonStartYear) : proposal.contractSeasons ?? [contractTerms];
      for (const newTerm of supplied) {
        const seasonIndex = terms.findIndex(term => Number(term.seasonStartYear ?? term.fromYear) === Number(newTerm.seasonStartYear ?? newTerm.fromYear));
        if (seasonIndex >= 0) terms[seasonIndex] = clone(newTerm);
        else terms.push(clone(newTerm));
      }
      player.contractSeasons = terms.sort((a, b) => Number(a.seasonStartYear ?? a.fromYear) - Number(b.seasonStartYear ?? b.fromYear));
      if (leg.action === 'option-exercise') {
        const selected = termForSeason(player, proposal.seasonStartYear);
        if (selected) selected.optionDecisionStatus = 'exercised';
      }
      player.nextSeasonContractState = { seasonStartYear: proposal.seasonStartYear, status: 'contracted-next-season',
        proposalId: proposal.proposalId, source: 'simulation-transaction', term: clone(termForSeason(player, proposal.seasonStartYear)) };
      if (['free-agent-signing', 'draft-selection', 'sign'].includes(leg.action ?? proposal.kind)) releasePlayerHolds(state, player.canonicalName, proposal, destination?.teamCode);
      if (proposal.kind === 'free-agent-signing' && destination && proposal.signingRoleProjection) {
        destination.rotationPlan ??= {};
        destination.rotationPlan.projectedMinutesByPlayer ??= {};
        destination.rotationPlan.projectedMinutesByPlayer[player.canonicalName] = {
          value: proposal.signingRoleProjection.projectedMinutes, seasonStartYear: proposal.seasonStartYear,
          positionMinutes: clone(proposal.signingRoleProjection.projectedMinutesByPosition),
          valueStatus: 'generated-scenario', proposalId: proposal.proposalId,
          source: { sourceSystem: 'djhc-free-agent-signing-role', sourceVersion: 'djhc-free-agency-v1',
            sourceClass: 'generated-scenario', seasonStartYear: proposal.seasonStartYear },
          disclosure: 'Accepted conditional rotation-plan assumption; future availability and minutes remain uncertain.' };
      }
    }
  } else if (assetType === 'trade-exception') {
    const index = from.tpeLedger.findIndex(entry => entry.exceptionId === leg.exceptionId);
    from.tpeLedger[index] = closeStoredTpe(from.tpeLedger[index], { reason: 'renounced', asOfDate: leg.transactionDate, proposalId: proposal.proposalId });
    closeStoredTpeHolds(from, leg.exceptionId, { reason: 'renounced', asOfDate: leg.transactionDate, proposalId: proposal.proposalId });
  } else if (assetType === 'draft-pick') {
    const id = String(leg.pickId ?? leg.assetId);
    const pick = state.draftPicks.find(row => String(row.pickId ?? row.assetId ?? row.id) === id);
    if (!pick) throw new Error(`Cannot apply unknown draft pick ${id}.`);
    pick.ownerTeamCode = to?.teamCode ?? null;
    pick.lastTransactionProposalId = proposal.proposalId;
    if (leg.action === 'consume') pick.usedStatus = 'selected';
  } else if (assetType === 'prospect') {
    const prospect = clone(leg.prospect ?? proposal.prospect);
    const name = String(prospect?.canonicalName ?? '').trim();
    if (!name || findPlayer(state, name).player) throw new Error(`Draft prospect ${name || '(unnamed)'} is missing or already in the player pool.`);
    const rookieTerms = clone(proposal.contractTerms ?? prospect.rookieContractTerms ?? null);
    state.players.push({
      ...prospect,
      canonicalName: name,
      teamCode: to?.teamCode ?? null,
      rosterStatus: 'rookie',
      identityStatus: prospect.identityStatus ?? 'provisional-user-or-source-supplied',
      contractSeasons: proposal.contractSeasons ? clone(proposal.contractSeasons) : rookieTerms ? [rookieTerms] : [],
      currentSeasonStartYear: proposal.seasonStartYear,
    });
    if (to) to.rosterNames.push(name);
    releasePlayerHolds(state, name, proposal, to?.teamCode);
  }
}

/** Private-state preview is also supplied to CBA rules so cap holds, roster
 * charges and salary-floor effects participate in the post-move calculation. */
export function previewTransactionCapAccounting(state, proposalInput, { teamCodes = null } = {}) {
  const proposal = proposalInput.format === 'djhc-transaction-proposal-v1' ? proposalInput : createTransactionProposal(proposalInput);
  const selected = teamCodes ?? unique(proposal.legs.flatMap(leg => [leg.fromTeamCode, leg.toTeamCode]));
  const before = derivePayrollStateForLeague(state, { teamCodes: selected });
  const outgoingState = clone(before.state);
  if (proposal.kind === 'trade') for (const leg of proposal.legs.filter(leg => (leg.assetType ?? 'player') === 'player' && leg.fromTeamCode)) {
    const team = findTeam(outgoingState, leg.fromTeamCode);
    const { player } = findPlayer(outgoingState, leg.canonicalName ?? leg.playerName);
    if (team && player) {
      team.rosterNames = team.rosterNames.filter(name => normalizeCanonicalPlayerName(name) !== normalizeCanonicalPlayerName(player.canonicalName));
      player.teamCode = null;
    }
  }
  const outgoing = derivePayrollStateForLeague(outgoingState, { teamCodes: selected });
  const afterState = clone(before.state);
  for (const leg of proposal.legs) applyLeg(afterState, leg, proposal);
  projectSigningHolds(afterState, proposal);
  const collect = result => Object.fromEntries(result.state.teams.filter(team => selected.includes(team.teamCode) && team.capLedger).map(team => [team.teamCode, clone(team.capAccounting)]));
  const preliminary = derivePayrollStateForLeague(afterState, { teamCodes: selected });
  const uses = evaluateProposalStoredTpeUses(before.state, proposal, { afterByTeam: collect(preliminary) });
  applyStoredTpeStateChanges(afterState, proposal, uses);
  const payrollAfterByTeam = Object.fromEntries(preliminary.state.teams.filter(team => selected.includes(team.teamCode)).map(team => [team.teamCode, clone(team.payrollState)]));
  const signingMechanismEvaluations = evaluateProposalSignings(before.state, proposal, { beforeByTeam: collect(before), afterByTeam: collect(preliminary), payrollAfterByTeam });
  applySigningExceptionStateChanges(afterState, proposal, signingMechanismEvaluations);
  const after = derivePayrollStateForLeague(afterState, { teamCodes: selected });
  return { beforeByTeam: collect(before), afterOutgoingByTeam: collect(outgoing), afterByTeam: collect(after),
    payrollAfterByTeam: Object.fromEntries(after.state.teams.filter(team => selected.includes(team.teamCode)).map(team => [team.teamCode, clone(team.payrollState)])), signingMechanismEvaluations };
}

export function applyTransaction(state, proposalInput, {
  ruleEngine = null,
  allowProvisionalSandbox = true,
} = {}) {
  const proposal = proposalInput.format === 'djhc-transaction-proposal-v1' ? proposalInput : createTransactionProposal(proposalInput);
  const evaluation = evaluateTransaction(state, proposal, { ruleEngine });
  if (evaluation.status === 'illegal') throw Object.assign(new Error('Illegal transaction cannot be executed.'), { evaluation });
  if (evaluation.userApprovalRequired && !evaluation.approvalReceived) throw Object.assign(new Error('User approval is required before this transaction can be committed.'), { evaluation });
  if (evaluation.blockedReasons.length) throw Object.assign(new Error(`Transaction is blocked: ${evaluation.blockedReasons.join(' ')}`), { evaluation });
  if (evaluation.status === 'provisional' && (state.mode !== 'provisional-sandbox' || !allowProvisionalSandbox)) {
    throw Object.assign(new Error('Provisional transaction is blocked outside Provisional Sandbox.'), { evaluation });
  }
  // Establish the old roster subtotal before moving players, so a same-season
  // candidate payroll anchor changes by the actual known cap-hit difference.
  let next = derivePayrollStateForLeague(state, { teamCodes: evaluation.touchedTeams }).state;
  const payrollBeforeByTeam = Object.fromEntries(evaluation.touchedTeams.map(code => [code, clone(findTeam(state, code)?.payrollState ?? {})]));
  for (const leg of proposal.legs) applyLeg(next, leg, proposal);
  commitRestrictedOfferSheetResolution(next, proposal);
  next = derivePayrollStateForLeague(next, { teamCodes: evaluation.touchedTeams }).state;
  applyStoredTpeStateChanges(next, proposal, evaluation.capCalculations?.storedTpeEvaluations ?? {});
  applySigningExceptionStateChanges(next, proposal, evaluation.capCalculations?.signingMechanismEvaluations ?? []);
  if (Object.keys(evaluation.capCalculations?.storedTpeEvaluations ?? {}).length || evaluation.capCalculations?.signingMechanismEvaluations?.length) next = derivePayrollStateForLeague(next, { teamCodes: evaluation.touchedTeams }).state;
  if (evaluation.status !== 'confirmed-legal') {
    next.stateQuality = {
      status: 'provisional',
      reasons: [...new Set([...(next.stateQuality?.reasons ?? []), `Provisional ${proposal.kind} ${proposal.proposalId} entered the simulation state.`, ...evaluation.missingInputs])],
    };
    for (const teamCode of evaluation.touchedTeams) {
      const team = findTeam(next, teamCode);
      if (team) {
        team.payrollState.status = 'provisional';
        const screenPayroll = evaluation.legality.calculations?.resultingPayrollByTeam?.[teamCode];
        // Different CBA payroll bases cannot retain old values after a move.
        if (!team.capLedger) {
          team.payrollState.apronTeamSalaryUsd = screenPayroll?.apronTeamSalaryUsd ?? null;
          team.payrollState.taxTeamSalaryUsd = null;
          team.payrollState.minimumTeamSalaryUsd = null;
        }
        team.payrollState.components.apronTeamSalaryUsd = team.payrollState.apronTeamSalaryUsd;
        team.payrollState.components.taxTeamSalaryUsd = team.payrollState.taxTeamSalaryUsd;
        team.payrollState.hardCapTriggers = [...new Map([...(screenPayroll?.hardCapTriggers ?? []), ...(team.payrollState.hardCapTriggers ?? [])].map(trigger => [JSON.stringify(trigger), clone(trigger)])).values()];
        team.payrollState.provisionalReasons = [...new Set([...(team.payrollState.provisionalReasons ?? []), `Affected by provisional transaction ${proposal.proposalId}.`])];
      }
    }
  } else {
    const payroll = evaluation.legality.calculations?.resultingPayrollByTeam ?? null;
    if (!payroll) {
      next.stateQuality = { status: 'provisional', reasons: [...new Set([...(next.stateQuality?.reasons ?? []), 'Payroll transition was not returned by the rule engine.'])] };
      for (const teamCode of evaluation.touchedTeams) {
        const team = findTeam(next, teamCode);
        if (team) team.payrollState.status = 'provisional';
      }
    } else {
      for (const teamCode of evaluation.touchedTeams) {
        const payrollState = payroll[teamCode];
        const team = findTeam(next, teamCode);
        if (team && payrollState) {
          if (team.capLedger) team.payrollState = { ...team.payrollState, rulesVersionId: payrollState.rulesVersionId,
            hardCapTriggers: [...new Map([...(payrollState.hardCapTriggers ?? []), ...(team.payrollState.hardCapTriggers ?? [])].map(trigger => [JSON.stringify(trigger), clone(trigger)])).values()] };
          else team.payrollState = { ...clone(payrollState), hardCapTriggers: [...new Map([...(payrollState.hardCapTriggers ?? []),
            ...(team.payrollState.hardCapTriggers ?? [])].map(trigger => [JSON.stringify(trigger), clone(trigger)])).values()] };
        }
      }
    }
  }
  next.transactionLedger.push({
    proposalId: proposal.proposalId,
    kind: proposal.kind,
    seasonStartYear: proposal.seasonStartYear,
    transactionWindow: proposal.transactionWindow,
    status: evaluation.status,
    actor: proposal.actor,
    touchedTeams: evaluation.touchedTeams,
    assumptionRefs: [...proposal.assumptions],
    sourceRefs: [...proposal.sourceRefs],
    payrollBeforeByTeam,
    payrollAfterByTeam: Object.fromEntries(evaluation.touchedTeams.map(code => [code, clone(findTeam(next, code)?.payrollState ?? {})])),
  });
  next.revision += 1;
  validateLeagueState(next);
  return { state: next, evaluation: { ...evaluation, executionStatus: 'committed', resultingRevision: next.revision } };
}
