import { normalizeCanonicalPlayerName, resolvePlayerByCanonicalName } from './simulation-contracts-v1.mjs';
import { evaluateMatchedOfferSheetTradeRestriction } from './cba-restricted-free-agency-rules-v1.mjs';

const badStatus = /unknown|candidate|conflict|unresolved|unreported|missing|disputed|invalid/i;
const valueOf = raw => raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw;
const usable = raw => ![raw?.valueStatus, raw?.status].some(status => badStatus.test(String(status ?? '')));
const keyOf = name => normalizeCanonicalPlayerName(name);

export function stableOfferSheetValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableOfferSheetValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableOfferSheetValue(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function offerSheetProposalPayload(proposal) {
  const payload = structuredClone(proposal);
  delete payload.approvedByUser;
  delete payload.userApproval;
  return stableOfferSheetValue(payload);
}

export function readRestrictedFreeAgencyState(state, player) {
  const record = player?.restrictedFreeAgency;
  const missingInputs = [];
  if (!record) return { restricted: null, record: null, missingInputs: ['Restricted/unrestricted free-agent classification is unreported.'] };
  if (!usable(record) || !usable(record.restricted) || typeof valueOf(record.restricted) !== 'boolean') missingInputs.push('Restricted free-agent classification is unresolved.');
  if (valueOf(record.seasonStartYear) !== state.seasonStartYear) missingInputs.push('Restricted free-agent classification is not for the transaction season.');
  const evidenceDate = record.source?.retrievedAt ?? record.source?.generatedAt;
  if (!record.source?.sourceSystem || !record.source?.sourceVersion || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(String(evidenceDate ?? '')) || !Number.isFinite(Date.parse(evidenceDate))) missingInputs.push('Restricted free-agent classification lacks versioned, dated source evidence.');
  for (const field of ['restricted', 'rightOfFirstRefusalTeamCode', 'qualifyingOfferStatus']) {
    if (record[field]?.seasonStartYear !== undefined && record[field].seasonStartYear !== state.seasonStartYear) missingInputs.push(`Restricted free-agent ${field} evidence is from another season.`);
  }
  const restricted = missingInputs.length ? null : valueOf(record.restricted);
  if (restricted === true) {
    const teamCode = String(valueOf(record.rightOfFirstRefusalTeamCode) ?? '').toUpperCase();
    if (!usable(record.rightOfFirstRefusalTeamCode) || !state.teams.some(team => team.teamCode === teamCode)) missingInputs.push('Right-of-first-refusal team is unresolved.');
    if (!usable(record.qualifyingOfferStatus) || valueOf(record.qualifyingOfferStatus) !== 'outstanding') missingInputs.push('An outstanding qualifying offer establishing the supplied restricted status is required.');
  }
  return { restricted, record, missingInputs };
}

export function compareOfferSheetClocks(left, right) {
  const values = clock => [clock?.seasonStartYear, clock?.dayIndex, clock?.minuteOfDayEastern];
  for (const clock of [left, right]) {
    const [year, day, minute] = values(clock);
    if (![year, day, minute].every(Number.isInteger) || day < 0 || minute < 0 || minute > 1439 || !usable(clock)) return null;
  }
  const a = values(left), b = values(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}

/** These checks supplement the common engine. An offer-sheet screening intent
 * never grants permission to sign: only its ledger-bound resolution can commit. */
export function evaluateRestrictedFreeAgencyTransaction({ state, proposal, capAccountingPreview = null }) {
  const violations = [], missingInputs = [], blockedReasons = [];
  const ruleRefs = ['XI-5b', 'XI-5c', 'XI-5g', 'XI-5h', 'XI-5j'];
  const signingLegs = proposal.legs.filter(leg => (leg.assetType ?? 'player') === 'player' && (proposal.kind === 'free-agent-signing' || leg.action === 'sign'));
  for (const leg of signingLegs) {
    const resolution = resolvePlayerByCanonicalName(state.players, leg.canonicalName ?? leg.playerName);
    if (resolution.status !== 'resolved') continue;
    const player = resolution.matches[0], classification = readRestrictedFreeAgencyState(state, player);
    if (player.offerSheetContractLock) {
      const lockClock = compareOfferSheetClocks(state.simulationClock, player.offerSheetContractLock.expiresClock);
      if (lockClock === null) blockedReasons.push(`${player.canonicalName} offer-sheet contract amendment lock is unresolved.`);
      else if (lockClock < 0) violations.push(`${player.canonicalName} offer-sheet contract cannot be amended during its one-year lock.`);
    }
    missingInputs.push(...classification.missingInputs.map(reason => `${player.canonicalName}: ${reason}`));
    const pending = (state.offerSheetLedger ?? []).filter(sheet => ['pending', 'resolving'].includes(sheet.status) && keyOf(sheet.canonicalName) === keyOf(player.canonicalName));
    const intent = proposal.restrictedOfferSheet;
    if (intent?.stage === 'screening') {
      blockedReasons.push('Offer-sheet screening cannot commit a contract before the matching decision.');
      if (classification.restricted !== true || classification.missingInputs.length) violations.push('Offer-sheet screening requires a resolved current restricted-free-agent state.');
      if (pending.length) violations.push(`${player.canonicalName} already has an outstanding offer sheet.`);
    } else if (pending.length || intent?.stage === 'resolution') {
      const sheet = pending.find(item => item.sheetId === intent?.sheetId);
      if (!sheet || sheet.status !== 'resolving' || sheet.resolution?.authorizedProposalPayload !== offerSheetProposalPayload(proposal)) {
        violations.push(`${player.canonicalName} must use the exact authorized offer-sheet resolution.`);
      }
    } else if (classification.restricted === true && String(leg.toTeamCode).toUpperCase() !== String(valueOf(classification.record?.rightOfFirstRefusalTeamCode)).toUpperCase()) {
      violations.push(`${player.canonicalName} is restricted; another team must use the offer-sheet workflow.`);
    } else if (classification.record && classification.missingInputs.length || !classification.record && player.qualifyingOffer?.status === 'outstanding-offer') {
      blockedReasons.push(`${player.canonicalName} has unresolved restricted-free-agency evidence; resolve it before signing.`);
    }
  }
  for (const leg of proposal.legs.filter(leg => proposal.kind === 'trade' && (leg.assetType ?? 'player') === 'player')) {
    const resolution = resolvePlayerByCanonicalName(state.players, leg.canonicalName ?? leg.playerName);
    if (resolution.status !== 'resolved') continue;
    for (const restriction of resolution.matches[0].matchedOfferSheetRestrictions ?? []) {
      const result = evaluateMatchedOfferSheetTradeRestriction({ restriction, toTeamCode: leg.toTeamCode,
        fromTeamCode: leg.fromTeamCode, playerConsent: leg.playerConsent, clock: state.simulationClock });
      violations.push(...result.violations);
      missingInputs.push(...result.missingInputs);
      if (result.status === 'unknown') blockedReasons.push('Matched-offer-sheet trade restriction is unresolved.');
    }
  }
  // Room must stay reserved for every outstanding cap-room sheet, including
  // after trades that otherwise could be allowed to take a team above the cap.
  for (const sheet of state.offerSheetLedger ?? []) {
    if (sheet.status !== 'pending') continue;
    const affected = proposal.legs.some(leg => [leg.fromTeamCode, leg.toTeamCode].some(code => String(code ?? '').toUpperCase() === sheet.newTeamCode));
    if (!affected) continue;
    const after = capAccountingPreview?.afterByTeam?.[sheet.newTeamCode];
    const salary = after?.totals?.teamSalaryUsd, cap = valueOf(state.rulesReference?.thresholds?.salaryCap);
    if (typeof salary !== 'number' || !Number.isFinite(salary) || typeof cap !== 'number' || !Number.isFinite(cap)) {
      missingInputs.push(`${sheet.newTeamCode} outstanding offer-sheet Room cannot be reconciled after the move.`);
      blockedReasons.push('Outstanding offer-sheet Room must remain resolved.');
    } else if (salary > cap + 0.01) violations.push(`${sheet.newTeamCode} cannot consume the Room reserved for outstanding offer sheet ${sheet.sheetId}.`);
  }
  return { format: 'djhc-restricted-free-agency-transaction-v1', status: violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass',
    violations: [...new Set(violations)], missingInputs: [...new Set(missingInputs)], blockedReasons: [...new Set(blockedReasons)], ruleRefs, legalReady: false };
}

export function commitRestrictedOfferSheetResolution(state, proposal) {
  if (proposal.restrictedOfferSheet?.stage !== 'resolution') return;
  const sheet = state.offerSheetLedger.find(item => item.sheetId === proposal.restrictedOfferSheet.sheetId);
  if (!sheet || sheet.status !== 'resolving') throw new Error('Offer-sheet resolution was not authorized.');
  const player = resolvePlayerByCanonicalName(state.players, sheet.canonicalName).matches[0];
  sheet.status = sheet.resolution.decision === 'match' ? 'matched' : 'signed-with-new-team';
  sheet.resolvedByProposalId = proposal.proposalId;
  player.offerSheetContractLock = { offerSheetId: sheet.sheetId, contractClock: structuredClone(sheet.resolution.clock),
    expiresClock: structuredClone(sheet.resolution.expiresClock), source: structuredClone(sheet.source), ruleRefs: ['XI-5g', 'XI-5h'] };
  if (sheet.resolution.decision === 'match') player.matchedOfferSheetRestrictions = [...(player.matchedOfferSheetRestrictions ?? []), {
    offerSheetId: sheet.sheetId, newTeamCode: sheet.newTeamCode, matchedTeamCode: sheet.priorTeamCode,
    matchedClock: structuredClone(sheet.resolution.clock), expiresClock: structuredClone(sheet.resolution.expiresClock),
    source: structuredClone(sheet.source), valueStatus: 'generated-scenario', ruleRefs: ['XI-5j'] }];
  player.restrictedFreeAgency = { ...player.restrictedFreeAgency, restricted: false, qualifyingOfferStatus: 'resolved-by-contract',
    resolvedByProposalId: proposal.proposalId, valueStatus: 'generated-scenario', source: structuredClone(sheet.source) };
  if (player.qualifyingOffer) player.qualifyingOffer.status = 'resolved-by-contract';
}
