#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalV4IdentityJson } from '../tools/swishiq-studio/engine/canonical-v4-identity.js';
import { normalizeCanonicalV4PlayerNameKey } from '../tools/swishiq-studio/engine/canonical-v4-player-name-identity.js';
import { aggregateV4BoxScorePlayers } from '../tools/swishiq-studio/engine/swishiq-daily-game-v4-box-score.js';
import {
  CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN,
  CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN_FORMAT,
} from '../tools/swishiq-studio/engine/canonical-v4-impact-model-release-pin.js';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from '../tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js';
import {
  DAILY_IMPACT_SCORING_CONTRACT,
  evaluateV4ImpactCompanionSelection,
  loadDailyImpactModel,
  normalizeDailyImpactModelRef,
} from '../tools/swishiq-studio/engine/swishiq-daily-game-v4-impact.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_PIN_RELATIVE = 'tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js';
const IMPACT_MODEL_DIR = 'tools/swishiq-studio/data/v4/impact-models/' + CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.releaseId;
const MANIFEST_SITE_PATH = IMPACT_MODEL_DIR + '/manifest.json';
const BOARD_FORMAT = 'djhc-swishiq-static-daily-board-v4';
const BOARD_CONTRACT_VERSION = 3;
const EVALUATION_KIND = 'descriptive-source-impact-ranking';
const OBJECTIVE_VERSION = 'five-player-mean-combined-impact-v1';
const DEFAULT_START = '2026-10-10';
const DEFAULT_DAYS = 90;
const DEFAULT_YEAR = 2025;
const DEFAULT_OUTPUT = 'prototypes/lineup-impact-v4-20261010/daily';
const GAME_KINDS = Object.freeze(['fix-the-five', 'draft-night']);
const REQUIRED_COUNTS = Object.freeze({ fixTheFiveChallengesPerBoard: 5, fixTheFiveLineup: 5,
  fixTheFiveCandidates: 3, draftRoundsPerBoard: 5, draftCandidatesPerRound: 3, draftCombinations: 243 });
const SITE_ORIGIN = 'https://www.djshouseofcards-comics.com/';

function fail(message) {
  throw new Error(message);
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function parseArgs(argv) {
  const options = { start: DEFAULT_START, days: DEFAULT_DAYS, year: DEFAULT_YEAR, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--start', '--days', '--year', '--output'].includes(flag)) fail('Unknown argument: ' + flag);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(flag + ' requires a value.');
    options[flag.slice(2)] = value;
    index += 1;
  }
  options.days = Number(options.days);
  options.year = Number(options.year);
  if (!isDate(options.start)) fail('--start must be a real YYYY-MM-DD calendar date.');
  if (!Number.isSafeInteger(options.days) || options.days < 1 || options.days > 90) {
    fail('--days must be an integer from 1 to 90.');
  }
  if (!Number.isSafeInteger(options.year) || options.year < 2017 || options.year > 2025) {
    fail('--year must select a completed exact season from 2017 through 2025.');
  }
  if (typeof options.output !== 'string' || !options.output.trim()) {
    fail('--output must name a new staging directory under prototypes/ or docs/.');
  }
  return options;
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateSequence(start, days) {
  const first = new Date(start + 'T12:00:00.000Z');
  return Array.from({ length: days }, (_, index) => new Date(first.getTime() + index * 86400000).toISOString().slice(0, 10));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function shortHash(value, length = 12) {
  return sha256(Buffer.from(String(value), 'utf8')).slice(0, length);
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveNewOutputDirectory(value) {
  const output = path.resolve(REPO_ROOT, value);
  const allowedRoots = ['prototypes', 'docs'].map(name => path.join(REPO_ROOT, name));
  if (!allowedRoots.some(root => isWithin(root, output))
    || path.relative(REPO_ROOT, output).split(path.sep).some(part => part.toLowerCase() === '.deploy')) {
    fail('--output must stay under prototypes/ or docs/ and outside .deploy/.');
  }
  return output;
}

async function assertDoesNotExist(filePath, label) {
  try {
    await stat(filePath);
    fail(label + ' already exists; choose a new output directory. Nothing was overwritten.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function findYearPackage(pin, year) {
  const packageId = 'nba-swishiq-v4-' + year + '-' + String(year + 1).slice(-2);
  const expected = pin.expectedIdentity?.packages?.filter(row => row?.packageId === packageId) ?? [];
  const packagePins = pin.packagePins?.filter(row => row?.packageId === packageId) ?? [];
  if (expected.length !== 1 || packagePins.length !== 1) {
    fail('The reviewed canonical release does not pin exactly one package for season ' + year + '.');
  }
  const row = expected[0];
  if (row.scope?.kind !== 'exact-season' || row.scope.seasonStartYear !== year
    || row.scope.seasonEndYear !== year + 1 || row.scope.seasonStartYears?.length !== 1
    || row.scope.seasonStartYears[0] !== year || row.scope.pooledFitIsSeasonSpecific !== true
    || !row.scope.phases?.includes('regular')) {
    fail('The selected source package is not pinned to the requested exact historical regular season.');
  }
  return { expected: row, packagePin: packagePins[0] };
}

function sourceReleaseId(pin) {
  const match = /^https?:\/\/[^/]+\/tools\/swishiq-studio\/data\/v4\/releases\/(v4-site-[a-f0-9]{12})\/registry\.json$/.exec(pin.registryUrl);
  if (!match) fail('The canonical runtime pin does not use a canonical immutable release URL.');
  return match[1];
}

function packageRefFromPin(pin, releaseId, expected, packagePin) {
  const ref = {
    modelId: 'swishiq-canonical-v4',
    releaseId,
    registrySha256: pin.registrySha256,
    registryRevisionSha256: pin.registryRevisionSha256,
    reviewReceiptSha256: pin.reviewReceiptSha256,
    authorizationReferenceSha256: pin.authorizationReferenceSha256,
    packageId: expected.packageId,
    packageVersion: expected.packageVersion,
    scope: expected.scope,
    phase: 'regular',
    indexSha256: packagePin.indexSha256,
    capabilityMapSha256: packagePin.capabilityMapSha256,
    sourceLockDigestKind: packagePin.sourceLockDigestKind,
    sourceLockSha256: packagePin.sourceLockSha256,
    sourceLockEmbeddedSha256: packagePin.sourceLockEmbeddedSha256,
    sourceLockFileSha256: packagePin.sourceLockFileSha256,
    sourceLockFileByteLength: packagePin.sourceLockFileByteLength,
    sourceLockSchemaSha256: packagePin.sourceLockSchemaSha256,
  };
  for (const key of ['registrySha256', 'registryRevisionSha256', 'reviewReceiptSha256', 'authorizationReferenceSha256',
    'indexSha256', 'capabilityMapSha256', 'sourceLockSha256', 'sourceLockEmbeddedSha256',
    'sourceLockFileSha256', 'sourceLockSchemaSha256']) {
    if (typeof ref[key] !== 'string' || !/^[a-f0-9]{64}$/.test(ref[key])) {
      fail('The reviewed source pin is missing exact-package hash ' + key + '.');
    }
  }
  if (ref.sourceLockDigestKind !== 'full-lock-object' || ref.packageVersion !== expected.packageVersion) {
    fail('The selected exact package does not match its reviewed source pin.');
  }
  return ref;
}

function impactModelRefFromPin(pin) {
  if (pin?.format !== CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN_FORMAT
    || pin.releaseId !== CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.releaseId
    || pin.modelId !== CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.modelId
    || pin.modelVersion !== CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.modelVersion
    || pin.manifestSha256 !== CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.manifestSha256
    || pin.manifestBytes !== CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.manifestBytes
    || pin.manifestPath !== 'manifest.json') {
    fail('The frozen Impact release pin has an unexpected identity.');
  }
  return normalizeDailyImpactModelRef({
    releaseId: pin.releaseId,
    modelId: pin.modelId,
    modelVersion: pin.modelVersion,
    manifestPath: MANIFEST_SITE_PATH,
    manifestSha256: pin.manifestSha256,
    manifestBytes: pin.manifestBytes,
  });
}

function deterministicShuffle(rows, seed) {
  const result = [...rows];
  const bytes = createHash('sha256').update(String(seed)).digest();
  let state = bytes.readUInt32LE(0) || 0x9e3779b9;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function isSourceRosterEligible(profile, year) {
  return profile
    && profile.seasonStartYear === year
    && profile.phase === 'regular'
    && typeof profile.displayName === 'string'
    && profile.displayName.trim()
    && profile.normalizedPlayerNameKey === normalizeCanonicalV4PlayerNameKey(profile.displayName)
    && /^[A-Z]{3}$/.test(profile.teamCode)
    && Number.isSafeInteger(profile.games)
    && profile.games >= 20
    && Number.isFinite(profile.minutes)
    && profile.minutes >= 200
    && profile.complete === true;
}

function modelRowScopeMatches(row, year) {
  return row?.scope?.kind === 'exact-season'
    && row.scope.seasonStartYear === year
    && row.scope.seasonEndYear === year + 1
    && row.scope.phase === 'regular'
    && row.scope.pooled === false;
}

function fittedImpactRowByName(impactRows, year) {
  const byName = new Map();
  for (const row of impactRows) {
    const key = row?.player?.playerNameKey;
    if (typeof key !== 'string' || !key || !modelRowScopeMatches(row, year)
      || row.estimateKind !== 'fitted-coefficient'
      || row.evidence?.kind !== 'fitted-player-coefficient'
      || row.evidence.individualEvidenceClaim !== false
      || row.evidence.individualCausalEffectClaim !== false
      || row.evidence.individualValidationClaim !== false
      || row.player.identityMatch?.status !== 'unique-exact-name-match'
      || row.player.identityMatch?.method !== 'exact-normalized-name') continue;
    if (normalizeCanonicalV4PlayerNameKey(row.player.sourceDisplayName || row.player.canonicalDisplayName || '') !== key) continue;
    const displayEligible = row.availability?.status === 'available'
      && row.availability.displayEligible === true
      && row.exposure?.sourceDisplayEligible === true;
    if (!displayEligible) continue;
    const offense = row.values?.offense?.value;
    const defense = row.values?.defense?.value;
    const reportedCombined = row.values?.combined?.value;
    if (![offense, defense, reportedCombined].every(Number.isFinite)) {
      fail('An eligible fitted Impact row contains a non-finite offense, defense, or combined estimate: ' + key + '.');
    }
    const combined = offense + defense;
    if (!Number.isFinite(combined) || reportedCombined !== combined) {
      fail('An eligible fitted Impact row does not preserve the full-precision offense + defense sum: ' + key + '.');
    }
    if (byName.has(key)) fail('The exact-name Impact companion contains duplicate fitted rows for ' + key + '.');
    byName.set(key, { key, offense, defense, combined, row });
  }
  return byName;
}

export function reconcileImpactRoster(sourceProfiles, impactRows, year) {
  if (!Number.isSafeInteger(year) || year < 2017 || year > 2025) fail('Roster reconciliation requires a completed season from 2017 through 2025.');
  const modelByName = fittedImpactRowByName(impactRows, year);
  const teams = new Map();
  const sourceKeys = new Set();
  let rosterEligible = 0;
  let matchedEligible = 0;
  let missingFittedRows = 0;
  let teamMismatches = 0;
  for (const profile of sourceProfiles) {
    if (!profile || typeof profile.teamCode !== 'string' || !/^[A-Z]{3}$/.test(profile.teamCode)) continue;
    const team = teams.get(profile.teamCode) ?? { teamCode: profile.teamCode, sourceProfiles: [], eligibleByName: new Map() };
    teams.set(profile.teamCode, team);
    const key = profile.normalizedPlayerNameKey;
    const profileIdentity = JSON.stringify([key, profile.teamCode]);
    if (!key || key !== normalizeCanonicalV4PlayerNameKey(profile.displayName)) fail('The exact source roster contains a noncanonical normalized-name identity.');
    if (sourceKeys.has(profileIdentity)) fail('The exact source roster repeats a normalized player/team identity: ' + profileIdentity + '.');
    sourceKeys.add(profileIdentity);
    team.sourceProfiles.push(profile);
    if (!isSourceRosterEligible(profile, year)) continue;
    rosterEligible += 1;
    const estimate = modelByName.get(key);
    if (!estimate) {
      missingFittedRows += 1;
      continue;
    }
    const modelTeams = estimate.row.player.teamCodes;
    const modelIncludesTeam = Array.isArray(modelTeams) ? modelTeams.includes(profile.teamCode)
      : estimate.row.player.teamCode === profile.teamCode;
    if (!modelIncludesTeam) {
      teamMismatches += 1;
      continue;
    }
    const joined = {
      displayName: profile.displayName,
      normalizedPlayerNameKey: key,
      seasonStartYear: year,
      teamCode: profile.teamCode,
      phase: 'regular',
      offense: estimate.offense,
      defense: estimate.defense,
      combined: estimate.offense + estimate.defense,
      sourceRoster: profile,
    };
    team.eligibleByName.set(key, joined);
    matchedEligible += 1;
  }
  for (const team of teams.values()) {
    team.sourceProfiles.sort((left, right) => compareCodepoint(left.normalizedPlayerNameKey, right.normalizedPlayerNameKey));
  }
  return {
    teams,
    summary: {
      exactSourceRosterProfiles: sourceProfiles.length,
      rosterEligibleProfiles: rosterEligible,
      eligibleFittedImpactRows: modelByName.size,
      matchedEligibleProfiles: matchedEligible,
      eligibleRosterWithoutFittedRow: missingFittedRows,
      eligibleRosterModelTeamMismatches: teamMismatches,
      teamsWithAnySourceRosterProfiles: teams.size,
      teamsWithEightMatchedProfiles: [...teams.values()].filter(team => team.eligibleByName.size >= 8).length,
      teamsWithThreeMatchedProfiles: [...teams.values()].filter(team => team.eligibleByName.size >= 3).length,
    },
  };
}

function profileForBoard(profile, year) {
  return {
    displayName: profile.displayName,
    normalizedPlayerNameKey: profile.normalizedPlayerNameKey,
    seasonStartYear: year,
    teamCode: profile.teamCode,
    phase: 'regular',
  };
}

function shortChallengeId(seed) {
  return 'fix-' + shortHash(seed, 32);
}

function takeEligibleProfiles(team, count, seed, usedNameKeys = new Set()) {
  const queue = deterministicShuffle(team.sourceProfiles, seed);
  const selected = [];
  let skipped = 0;
  let scanned = 0;
  for (const profile of queue) {
    scanned += 1;
    const eligible = team.eligibleByName.get(profile.normalizedPlayerNameKey);
    if (!eligible || usedNameKeys.has(eligible.normalizedPlayerNameKey)) {
      skipped += 1;
      continue;
    }
    selected.push(eligible);
    usedNameKeys.add(eligible.normalizedPlayerNameKey);
    if (selected.length === count) break;
  }
  if (selected.length !== count) return { rows: null, skipped, scanned };
  return { rows: selected, skipped, scanned };
}

function meanCombined(rows) {
  if (!Array.isArray(rows) || rows.length !== 5) fail('The Impact objective requires exactly five eligible players.');
  const total = rows.reduce((sum, row) => sum + row.combined, 0);
  if (!Number.isFinite(total)) fail('The five-player additive Impact objective is not finite.');
  const mean = total / 5;
  if (!Number.isFinite(mean)) fail('The five-player additive Impact objective is not finite.');
  return mean;
}

export function rankFixChallengeChoices(challenge, combinedByName) {
  const lineupKeys = challenge.lineup.map(row => row.normalizedPlayerNameKey);
  if (lineupKeys.length !== 5 || new Set(lineupKeys).size !== 5) fail('A Fix the Five baseline must contain five distinct players.');
  const outgoing = challenge.removeNormalizedPlayerNameKey;
  const retained = challenge.lineup.filter(row => row.normalizedPlayerNameKey !== outgoing);
  if (retained.length !== 4 || !lineupKeys.includes(outgoing)) fail('The Fix the Five outgoing player must be a baseline player.');
  const candidates = challenge.candidates ?? [];
  if (candidates.length !== 3) fail('A Fix the Five challenge must contain three candidates.');
  const candidateKeys = candidates.map(row => row.normalizedPlayerNameKey);
  if (new Set(candidateKeys).size !== 3 || candidateKeys.some(key => lineupKeys.includes(key))) {
    fail('Fix the Five candidates must be distinct from one another and the baseline.');
  }
  const baselineMean = meanCombined(challenge.lineup.map(row => ({ combined: combinedByName.get(row.normalizedPlayerNameKey) })));
  const options = candidates.map(candidate => {
    const value = combinedByName.get(candidate.normalizedPlayerNameKey);
    if (!Number.isFinite(value)) fail('A Fix the Five candidate has no finite eligible combined Impact estimate.');
    const resultingFivePlayerMean = meanCombined([
      ...retained.map(row => ({ combined: combinedByName.get(row.normalizedPlayerNameKey) })),
      { combined: value },
    ]);
    return { normalizedPlayerNameKey: candidate.normalizedPlayerNameKey, combinedImpact: value,
      resultingFivePlayerMean, changeFromBaseline: resultingFivePlayerMean - baselineMean };
  });
  options.sort((left, right) => right.resultingFivePlayerMean - left.resultingFivePlayerMean
    || compareCodepoint(left.normalizedPlayerNameKey, right.normalizedPlayerNameKey));
  return { baselineMean, retainedNormalizedPlayerNameKeys: retained.map(row => row.normalizedPlayerNameKey), options };
}

export function enumerateDraftImpactOptions(rounds, combinedByName) {
  if (!Array.isArray(rounds) || rounds.length !== 5 || rounds.some(round => !Array.isArray(round.candidates) || round.candidates.length !== 3)) {
    fail('Draft Night needs five rounds with three candidates each.');
  }
  const options = [];
  function visit(roundIndex, keys) {
    if (roundIndex === 5) {
      if (new Set(keys).size !== 5) fail('A draft lineup repeats a normalized player identity.');
      const rows = keys.map(key => ({ combined: combinedByName.get(key) }));
      options.push({ normalizedPlayerNameKeys: [...keys], fivePlayerMean: meanCombined(rows) });
      return;
    }
    for (const candidate of rounds[roundIndex].candidates) {
      const key = candidate.normalizedPlayerNameKey;
      if (!Number.isFinite(combinedByName.get(key))) fail('A Draft Night candidate has no finite eligible combined Impact estimate.');
      if (keys.includes(key)) continue;
      visit(roundIndex + 1, [...keys, key]);
    }
  }
  visit(0, []);
  if (options.length !== REQUIRED_COUNTS.draftCombinations) {
    fail('Draft Night must enumerate all 243 globally distinct five-player combinations; found ' + options.length + '.');
  }
  options.sort((left, right) => right.fivePlayerMean - left.fivePlayerMean
    || compareCodepoint(left.normalizedPlayerNameKeys.join('|'), right.normalizedPlayerNameKeys.join('|')));
  return options.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function makeFixChallenges(teams, date, releaseId, year) {
  const available = [...teams.values()].filter(team => team.eligibleByName.size >= 8)
    .sort((left, right) => compareCodepoint(left.teamCode, right.teamCode));
  const ordered = deterministicShuffle(available, 'impact-fix-teams|' + date + '|' + year + '|' + releaseId);
  if (ordered.length < 5) fail(date + ' Fix the Five requires five teams with at least eight matched eligible fitted players; found ' + ordered.length + '.');
  const challenges = [];
  const audit = [];
  let skippedProfiles = 0;
  let scannedRosterProfiles = 0;
  for (const team of ordered.slice(0, 5)) {
    const seed = 'impact-fix|' + date + '|' + team.teamCode + '|' + year + '|' + releaseId;
    const selection = takeEligibleProfiles(team, 8, seed);
    if (!selection.rows) fail(date + ' ' + team.teamCode + ' could not form eight distinct eligible players from the exact source roster.');
    skippedProfiles += selection.skipped;
    scannedRosterProfiles += selection.scanned;
    const lineup = selection.rows.slice(0, 5);
    const candidates = selection.rows.slice(5, 8);
    const outgoing = deterministicShuffle(lineup, seed + '|outgoing')[0];
    const challenge = {
      challengeId: shortChallengeId(seed),
      title: 'Historical Impact · ' + team.teamCode,
      prompt: 'Choose one of the three same-team candidates. Each listed player belongs to this team in the exact source roster for the selected completed regular season and has an eligible fitted Impact row. Select the replacement with the highest five-player mean of fitted offense plus defense.',
      teamCode: team.teamCode,
      lineup: lineup.map(row => profileForBoard(row, year)),
      removeNormalizedPlayerNameKey: outgoing.normalizedPlayerNameKey,
      candidates: candidates.map(row => profileForBoard(row, year)),
    };
    const combinedByName = new Map(selection.rows.map(row => [row.normalizedPlayerNameKey, row.combined]));
    const ranking = rankFixChallengeChoices(challenge, combinedByName);
    challenges.push(challenge);
    audit.push({ challengeId: challenge.challengeId, teamCode: team.teamCode,
      baseline: { normalizedPlayerNameKeys: lineup.map(row => row.normalizedPlayerNameKey),
        outgoingNormalizedPlayerNameKey: outgoing.normalizedPlayerNameKey,
        players: lineup.map(row => ({ normalizedPlayerNameKey: row.normalizedPlayerNameKey,
          offense: row.offense, defense: row.defense, combinedImpact: row.combined })),
        meanCombinedImpact: ranking.baselineMean },
      candidateOptions: ranking.options.map((row, index) => ({ rank: index + 1, ...row,
        offense: selection.rows.find(profile => profile.normalizedPlayerNameKey === row.normalizedPlayerNameKey).offense,
        defense: selection.rows.find(profile => profile.normalizedPlayerNameKey === row.normalizedPlayerNameKey).defense })),
      bestCandidateNormalizedPlayerNameKey: ranking.options[0].normalizedPlayerNameKey,
    });
  }
  return { challenges, teamCodes: challenges.map(row => row.teamCode), audit,
    refill: { scannedRosterProfiles, skippedProfiles, selectedEligibleProfiles: challenges.length * 8 } };
}

export function makeDraftRounds(teams, date, releaseId, year) {
  const eligible = [...teams.values()].filter(team => team.eligibleByName.size >= 3)
    .sort((left, right) => compareCodepoint(left.teamCode, right.teamCode));
  if (eligible.length < 5) fail(date + ' Draft Night requires five teams with at least three matched eligible fitted players; found ' + eligible.length + '.');

  let chosen = null;
  for (let attempt = 0; attempt < 256 && !chosen; attempt += 1) {
    const orderedTeams = deterministicShuffle(eligible, 'impact-draft-teams|' + date + '|' + year + '|' + releaseId + '|' + attempt);
    const usedKeys = new Set();
    const rounds = [];
    let skippedProfiles = 0;
    let scannedRosterProfiles = 0;
    for (const team of orderedTeams) {
      const seed = 'impact-draft|' + date + '|' + team.teamCode + '|' + year + '|' + releaseId + '|' + attempt;
      const tentativeKeys = new Set(usedKeys);
      const selection = takeEligibleProfiles(team, 3, seed, tentativeKeys);
      skippedProfiles += selection.skipped;
      scannedRosterProfiles += selection.scanned;
      if (!selection.rows) continue;
      selection.rows.forEach(row => usedKeys.add(row.normalizedPlayerNameKey));
      const roundNumber = rounds.length + 1;
      rounds.push({
        roundNumber,
        roundId: 'draft-round-' + roundNumber + '-' + shortHash(seed, 24),
        title: 'Round ' + roundNumber + ' · ' + team.teamCode,
        prompt: 'Choose one candidate from this round. Each candidate belongs to this historical team in the exact source roster for the selected completed regular season and has an eligible fitted Impact row.',
        teamCode: team.teamCode,
        candidates: selection.rows.map(row => profileForBoard(row, year)),
      });
      if (rounds.length === 5) break;
    }
    if (rounds.length === 5 && usedKeys.size === 15) {
      chosen = { rounds, attemptCount: attempt + 1, skippedProfiles, scannedRosterProfiles };
    }
  }
  if (!chosen) fail(date + ' Draft Night could not form five distinct teams and fifteen globally unique fitted players.');

  const allCandidates = chosen.rounds.flatMap(round => round.candidates);
  const combinedByName = new Map();
  for (const candidate of allCandidates) {
    const team = teams.get(candidate.teamCode);
    const profile = team?.eligibleByName.get(candidate.normalizedPlayerNameKey);
    if (!profile || !Number.isFinite(profile.combined)) fail('A selected Draft Night choice lost its eligible fitted row.');
    combinedByName.set(candidate.normalizedPlayerNameKey, profile.combined);
  }
  const rankedCombinations = enumerateDraftImpactOptions(chosen.rounds, combinedByName);
  const candidateImpactRows = chosen.rounds.map(round => ({
    roundNumber: round.roundNumber,
    teamCode: round.teamCode,
    candidates: round.candidates.map(candidate => {
      const row = teams.get(round.teamCode).eligibleByName.get(candidate.normalizedPlayerNameKey);
      return { normalizedPlayerNameKey: candidate.normalizedPlayerNameKey,
        offense: row.offense, defense: row.defense, combinedImpact: row.combined };
    }),
  }));
  return {
    rounds: chosen.rounds,
    teamCodes: chosen.rounds.map(row => row.teamCode),
    audit: { evaluatedCombinationCount: rankedCombinations.length,
      bestFivePlayerMean: rankedCombinations[0].fivePlayerMean,
      bestSelectionNormalizedPlayerNameKeys: rankedCombinations[0].normalizedPlayerNameKeys,
      candidateImpactRows,
      combinations: rankedCombinations },
    refill: { attempts: chosen.attemptCount, scannedRosterProfiles: chosen.scannedRosterProfiles,
      skippedProfiles: chosen.skippedProfiles, selectedEligibleProfiles: 15 },
  };
}

function createBoard({ date, gameKind, packageRef, impactModelRef, body }) {
  const content = {
    format: BOARD_FORMAT,
    contractVersion: BOARD_CONTRACT_VERSION,
    scoringContract: DAILY_IMPACT_SCORING_CONTRACT,
    evaluationKind: EVALUATION_KIND,
    publicationStatus: 'published',
    generatedAt: date + 'T12:00:00.000Z',
    dailySeed: date,
    gameKind,
    packageRef,
    impactModelRef,
    ...body,
  };
  const boardContentSha256 = sha256(Buffer.from(canonicalV4IdentityJson(content), 'utf8'));
  return {
    ...content,
    boardId: 'swishiq-v4-' + gameKind + '-' + date.replaceAll('-', '') + '-' + boardContentSha256.slice(0, 12),
    boardContentSha256,
  };
}

function compactJson(value) {
  return Buffer.from(JSON.stringify(value) + '\n', 'utf8');
}

async function writeNewFile(root, relativePath, bytes) {
  const destination = path.resolve(root, relativePath);
  if (!isWithin(root, destination)) fail('Generated path escaped the selected output directory.');
  await mkdir(path.dirname(destination), { recursive: true });
  let handle;
  try {
    handle = await open(destination, 'wx');
    await handle.writeFile(bytes);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('Refusing to overwrite generated file: ' + relativePath);
    throw error;
  } finally {
    await handle?.close();
  }
}

function boardPin({ gameKind, dailySeed, path: boardPath, boardSha256, boardContentSha256, expected }) {
  return { gameKind, dailySeed, path: boardPath, boardSha256, boardContentSha256,
    packageId: expected.packageId, packageVersion: expected.packageVersion, scope: expected.scope, phase: 'regular' };
}

function pinKey(row) {
  return JSON.stringify([row.gameKind, row.dailySeed]);
}

function mergeDailyPins(existingPins, existingHistory, newPins) {
  const newKeys = new Set(newPins.map(pinKey));
  const replaced = [];
  const retained = [];
  const oldKeys = new Set();
  for (const pin of existingPins) {
    if (oldKeys.has(pinKey(pin))) fail('The source release pin repeats an active game/date pin.');
    oldKeys.add(pinKey(pin));
    (newKeys.has(pinKey(pin)) ? replaced : retained).push(pin);
  }
  const historyByBoardHash = new Map();
  for (const pin of [...existingHistory, ...replaced]) {
    if (!pin || typeof pin.boardSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pin.boardSha256)) {
      fail('A historical daily-game pin is missing its board SHA-256.');
    }
    if (!historyByBoardHash.has(pin.boardSha256)) historyByBoardHash.set(pin.boardSha256, pin);
  }
  const dailyGamePinHistory = [...historyByBoardHash.values()].sort((left, right) =>
    compareCodepoint(left.dailySeed, right.dailySeed) || compareCodepoint(left.gameKind, right.gameKind)
      || compareCodepoint(left.boardSha256, right.boardSha256));
  const dailyGamePins = [...retained, ...newPins].sort((left, right) =>
    compareCodepoint(left.dailySeed, right.dailySeed) || compareCodepoint(left.gameKind, right.gameKind));
  const activeKeys = dailyGamePins.map(pinKey);
  if (new Set(activeKeys).size !== activeKeys.length) fail('The generated runtime pin repeats an active game/date pin.');
  return { dailyGamePins, dailyGamePinHistory, replacedPins: replaced };
}

function publicDailyReleasePin(pin, dailyGamePins, dailyGamePinHistory) {
  return {
    format: pin.format,
    version: pin.version,
    status: pin.status,
    registryUrl: pin.registryUrl,
    registrySha256: pin.registrySha256,
    registryRevisionSha256: pin.registryRevisionSha256,
    reviewReceiptSha256: pin.reviewReceiptSha256,
    authorizationReferenceSha256: pin.authorizationReferenceSha256,
    expectedIdentity: {
      packages: pin.expectedIdentity.packages.map(row => ({
        packageId: row.packageId,
        packageVersion: row.packageVersion,
        scope: row.scope,
        indexSha256: row.indexSha256,
        capabilityMapSha256: row.capabilityMapSha256,
        sourceLockDigestKind: row.sourceLockDigestKind,
        sourceLockSha256: row.sourceLockSha256,
        sourceLockEmbeddedSha256: row.sourceLockEmbeddedSha256,
        sourceLockFileSha256: row.sourceLockFileSha256,
        sourceLockFileByteLength: row.sourceLockFileByteLength,
        sourceLockSchemaSha256: row.sourceLockSchemaSha256,
      })),
    },
    packagePins: pin.packagePins,
    dailyGamePins,
    dailyGamePinHistory,
  };
}

function runtimePinSource(pin) {
  return 'export const CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN = Object.freeze('
    + JSON.stringify(pin)
    + ');\n';
}

function verifyCompanionManifest(manifest, ref, year, seasonDescriptor, payload, expected) {
  if (manifest?.releaseId !== ref.releaseId || manifest?.modelId !== ref.modelId
    || manifest?.modelVersion !== ref.modelVersion || manifest.predictiveEligibility !== false
    || manifest.identity?.primaryKey !== 'playerRef'
    || manifest.identity?.normalizer !== 'canonical-v4-player-name-identity-v1') {
    fail('The pinned Impact manifest identity, historical-only status, or identity contract is invalid.');
  }
  if (seasonDescriptor.seasonStartYear !== year || seasonDescriptor.seasonEndYear !== year + 1
    || seasonDescriptor.phase !== 'regular' || seasonDescriptor.packageId !== expected.packageId
    || seasonDescriptor.packageVersion !== expected.packageVersion
    || payload.scope?.seasonStartYear !== year || payload.scope?.seasonEndYear !== year + 1
    || payload.scope?.phase !== 'regular' || payload.scope?.pooled !== false
    || payload.packageRef?.packageId !== expected.packageId
    || payload.packageRef?.packageVersion !== expected.packageVersion
    || payload.modelVersion !== ref.modelVersion || payload.modelId !== ref.modelId) {
    fail('The fitted companion does not match the selected exact historical regular-season source package.');
  }
}

async function localSiteFetch(input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== new URL(SITE_ORIGIN).origin) fail('Impact companion verification attempted to leave the local site origin.');
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filePath = path.resolve(REPO_ROOT, relative);
  if (!isWithin(REPO_ROOT, filePath)) fail('Impact companion verification requested a path outside the repository.');
  try {
    const bytes = await readFile(filePath);
    return new Response(bytes, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    if (error?.code === 'ENOENT') return new Response('Not found', { status: 404 });
    throw error;
  }
}

function verifiedPlayerGamesPart(playerGamesPart) {
  return {
    status: 'verified',
    artifactId: 'player-games',
    package: {
      packageId: playerGamesPart.packageId,
      packageVersion: playerGamesPart.packageVersion,
      scope: playerGamesPart.scope,
    },
    records: playerGamesPart.records,
  };
}

function validateBoardWithEvaluator(board, audit, impactModel, verifiedPart) {
  if (board.gameKind === 'fix-the-five') {
    const challenge = board.challenges[0];
    const evaluation = evaluateV4ImpactCompanionSelection({
      request: { selection: { challengeId: challenge.challengeId,
        normalizedPlayerNameKey: challenge.candidates[0].normalizedPlayerNameKey } },
      board,
      impactModel,
      playerGamesPart: verifiedPart,
    });
    if (evaluation.evaluationKind !== EVALUATION_KIND || evaluation.decision.optionCount !== 3
      || evaluation.bestSelection !== audit[0].bestCandidateNormalizedPlayerNameKey) {
      fail('The generated Fix the Five board disagrees with the frozen Impact evaluator.');
    }
    return;
  }
  const best = audit.bestSelectionNormalizedPlayerNameKeys;
  const evaluation = evaluateV4ImpactCompanionSelection({
    request: { selection: best.map((normalizedPlayerNameKey, index) => ({ roundNumber: index + 1, normalizedPlayerNameKey })) },
    board,
    impactModel,
    playerGamesPart: verifiedPart,
  });
  if (evaluation.evaluationKind !== EVALUATION_KIND || evaluation.decision.optionCount !== 243
    || evaluation.bestSelection.length !== 5
    || evaluation.bestSelection.some((key, index) => key !== best[index])
    || evaluation.decision.rank !== 1) {
    fail('The generated Draft Night board disagrees with the frozen Impact evaluator.');
  }
}

async function build(options) {
  const outputRoot = resolveNewOutputDirectory(options.output);
  await assertDoesNotExist(outputRoot, '--output directory');

  const runtimePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN;
  if (runtimePin?.format !== 'djhc-swishiq-v4-studio-runtime-release-pin-v2' || runtimePin.status !== 'reviewed') {
    fail('The canonical V4 source release pin is not a reviewed runtime pin.');
  }
  const runtimePinBytes = await readFile(path.join(REPO_ROOT, RUNTIME_PIN_RELATIVE));
  const impactModelRef = impactModelRefFromPin(CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN);
  const releaseId = sourceReleaseId(runtimePin);
  const { expected, packagePin } = findYearPackage(runtimePin, options.year);
  const releaseRoot = path.join(REPO_ROOT, 'tools/swishiq-studio/data/v4/releases', releaseId);
  const packageRoot = path.join(releaseRoot, 'packages', expected.packageId, expected.packageVersion);
  const indexBytes = await readFile(path.join(packageRoot, 'index.json'));
  const indexSha256 = sha256(indexBytes);
  if (indexSha256 !== packagePin.indexSha256) fail('Selected canonical V4 package index bytes do not match the reviewed runtime pin.');
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (index.packageVersion !== expected.packageVersion || index.scope?.seasonStartYear !== options.year
    || index.scope?.seasonEndYear !== options.year + 1 || index.scope?.kind !== 'exact-season') {
    fail('Selected source package identity or exact season does not match the reviewed pin.');
  }
  const descriptors = index.artifacts?.filter(row => row?.artifactId === 'player-games') ?? [];
  if (descriptors.length !== 1) fail('Selected source package index must contain one player-games artifact descriptor.');
  const playerGamesDescriptor = descriptors[0];
  const playerGamesPath = path.resolve(releaseRoot, playerGamesDescriptor.path);
  if (!isWithin(releaseRoot, playerGamesPath)) fail('player-games artifact path escapes the immutable source release.');
  const playerGamesBytes = await readFile(playerGamesPath);
  const playerGamesSha256 = sha256(playerGamesBytes);
  if (playerGamesBytes.byteLength !== playerGamesDescriptor.bytes || playerGamesSha256 !== playerGamesDescriptor.sha256) {
    fail('player-games source bytes do not match their verified package descriptor.');
  }
  const playerGamesSource = JSON.parse(playerGamesBytes.toString('utf8'));
  if (playerGamesSource.artifactId !== 'player-games' || !Array.isArray(playerGamesSource.records)
    || playerGamesSource.packageVersion !== expected.packageVersion
    || canonicalV4IdentityJson(playerGamesSource.scope) !== canonicalV4IdentityJson(expected.scope)) {
    fail('Verified player-games source does not match the selected exact-season package pin.');
  }
  const manifestBytes = await readFile(path.join(REPO_ROOT, IMPACT_MODEL_DIR, 'manifest.json'));
  const manifestSha256 = sha256(manifestBytes);
  if (manifestBytes.byteLength !== impactModelRef.manifestBytes || manifestSha256 !== impactModelRef.manifestSha256) {
    fail('The frozen Impact manifest bytes do not match the caller pin.');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const seasonDescriptors = manifest.seasons?.filter(row => row?.seasonStartYear === options.year && row?.phase === 'regular') ?? [];
  if (seasonDescriptors.length !== 1) fail('The frozen Impact manifest must have one exact regular-season descriptor for ' + options.year + '.');
  const seasonDescriptor = seasonDescriptors[0];
  const companionPath = path.resolve(REPO_ROOT, IMPACT_MODEL_DIR, seasonDescriptor.path);
  if (!isWithin(path.join(REPO_ROOT, IMPACT_MODEL_DIR), companionPath)) fail('Impact companion artifact path escapes its immutable release.');
  const companionBytes = await readFile(companionPath);
  if (companionBytes.byteLength !== seasonDescriptor.bytes || sha256(companionBytes) !== seasonDescriptor.sha256) {
    fail('The selected fitted companion bytes do not match their frozen manifest descriptor.');
  }
  const companionPayload = JSON.parse(companionBytes.toString('utf8'));
  verifyCompanionManifest(manifest, impactModelRef, options.year, seasonDescriptor, companionPayload, expected);

  const rawProfiles = await aggregateV4BoxScorePlayers({
    status: 'verified',
    artifactId: playerGamesSource.artifactId,
    package: { packageId: playerGamesSource.packageId, packageVersion: playerGamesSource.packageVersion, scope: playerGamesSource.scope },
    records: playerGamesSource.records,
  }, { seasonStartYear: options.year, phase: 'regular' });
  const profiles = rawProfiles instanceof Map ? [...rawProfiles.values()]
    : Array.isArray(rawProfiles) ? rawProfiles
      : Array.isArray(rawProfiles?.profiles) ? rawProfiles.profiles
        : Object.values(rawProfiles ?? {});
  const reconciled = reconcileImpactRoster(profiles, companionPayload.records ?? [], options.year);
  if (!reconciled.summary.matchedEligibleProfiles) fail('No exact source-roster players matched eligible fitted Impact rows.');
  const packageRef = packageRefFromPin(runtimePin, releaseId, expected, packagePin);
  const dates = dateSequence(options.start, options.days);
  const existingPins = Array.isArray(runtimePin.dailyGamePins) ? [...runtimePin.dailyGamePins] : [];
  const existingHistory = Array.isArray(runtimePin.dailyGamePinHistory) ? [...runtimePin.dailyGamePinHistory] : [];
  const newPins = [];
  const summaries = [];
  const auditBoards = [];
  const generatedBoards = [];
  const stagedFiles = [];
  const releaseOutputRoot = path.join('tools/swishiq-studio/data/v4/releases', releaseId);
  const boardSubdir = 'daily-games/impact-native-20261010-v1';

  for (const date of dates) {
    for (const gameKind of GAME_KINDS) {
      const generated = gameKind === 'fix-the-five'
        ? makeFixChallenges(reconciled.teams, date, impactModelRef.releaseId, options.year)
        : makeDraftRounds(reconciled.teams, date, impactModelRef.releaseId, options.year);
      const body = gameKind === 'fix-the-five'
        ? { challenges: generated.challenges }
        : { deck: {
          deckId: 'draft-' + date.replaceAll('-', '') + '-' + shortHash(gameKind + '|' + date + '|' + impactModelRef.releaseId, 16),
          title: 'Historical Impact Draft',
          prompt: 'Choose one eligible player from each historical team round. Each candidate belongs to that team in the exact source roster for the selected completed regular season, and the five round teams and fifteen candidates are distinct. The evaluator compares all 243 legal lineups by the five-player mean of fitted offense plus defense.',
          rounds: generated.rounds,
        } };
      const board = createBoard({ date, gameKind, packageRef, impactModelRef, body });
      if (board.generatedAt !== date + 'T12:00:00.000Z') fail('A generated board has a non-deterministic timestamp.');
      const bytes = compactJson(board);
      const boardPath = boardSubdir + '/' + gameKind + '/' + date + '.json';
      const boardSha256 = sha256(bytes);
      const pin = boardPin({ gameKind, dailySeed: date, path: boardPath, boardSha256,
        boardContentSha256: board.boardContentSha256, expected });
      stagedFiles.push({ path: path.join(releaseOutputRoot, boardPath), bytes });
      newPins.push(pin);
      generatedBoards.push({ board, generated, gameKind, date });
      const boardAudit = gameKind === 'fix-the-five'
        ? { gameKind, dailySeed: date, boardId: board.boardId, objectiveVersion: OBJECTIVE_VERSION,
          challenges: generated.audit }
        : { gameKind, dailySeed: date, boardId: board.boardId, objectiveVersion: OBJECTIVE_VERSION,
          evaluatedCombinationCount: generated.audit.evaluatedCombinationCount,
          bestFivePlayerMean: generated.audit.bestFivePlayerMean,
          bestSelectionNormalizedPlayerNameKeys: generated.audit.bestSelectionNormalizedPlayerNameKeys,
          candidateImpactRows: generated.audit.candidateImpactRows,
          combinations: generated.audit.combinations };
      auditBoards.push(boardAudit);
      summaries.push({ gameKind, dailySeed: date, boardId: board.boardId, path: boardPath,
        boardSha256, boardContentSha256: board.boardContentSha256, bytes: bytes.byteLength,
        selectedTeamCodes: generated.teamCodes, selectedPlayerCount: gameKind === 'fix-the-five'
          ? generated.challenges.reduce((sum, challenge) => sum + challenge.lineup.length + challenge.candidates.length, 0)
          : generated.rounds.reduce((sum, round) => sum + round.candidates.length, 0),
        refill: generated.refill });
    }
  }

  if (!generatedBoards.length) fail('No daily Impact boards were generated.');
  const verificationBoard = generatedBoards[0].board;
  const impactModel = await loadDailyImpactModel({ board: verificationBoard,
    fetchImpl: localSiteFetch, baseUrl: SITE_ORIGIN });
  if (!Array.isArray(impactModel.records)
    || impactModel.counts?.manifestRecords !== companionPayload.records.length
    || impactModel.counts?.usableRecords !== impactModel.records.length) {
    fail('The local pinned Impact resolver returned unexpected fitted-row counts.');
  }
  const verifiedPart = verifiedPlayerGamesPart(playerGamesSource);
  const auditByBoardId = new Map(auditBoards.map(row => [row.boardId, row]));
  for (const { board, gameKind } of generatedBoards) {
    const audit = auditByBoardId.get(board.boardId);
    validateBoardWithEvaluator(board, gameKind === 'fix-the-five' ? audit.challenges : audit,
      impactModel, verifiedPart);
  }

  const mergedPins = mergeDailyPins(existingPins, existingHistory, newPins);
  const nextRuntimePin = { ...runtimePin, dailyGamePins: mergedPins.dailyGamePins,
    dailyGamePinHistory: mergedPins.dailyGamePinHistory };
  const publicPin = publicDailyReleasePin(runtimePin, mergedPins.dailyGamePins, mergedPins.dailyGamePinHistory);
  const publicPinPath = path.join(releaseOutputRoot, 'public-daily-release-pin.json');
  const runtimePinPath = RUNTIME_PIN_RELATIVE;
  const publicPinBytes = compactJson(publicPin);
  const runtimePinBytesNext = Buffer.from(runtimePinSource(nextRuntimePin), 'utf8');

  const rankingAudit = {
    format: 'djhc-swishiq-v4-impact-daily-ranking-audit-v1',
    scoringContract: DAILY_IMPACT_SCORING_CONTRACT,
    evaluationKind: EVALUATION_KIND,
    objective: { version: OBJECTIVE_VERSION,
      formula: '(offense + defense) summed across the resulting five players, then divided by five',
      tieBreak: 'descending full-precision five-player mean, then codepoint-ascending normalized player-name keys' },
    impactModelRef,
    sourcePackage: { packageId: expected.packageId, packageVersion: expected.packageVersion,
      seasonStartYear: options.year, phase: 'regular' },
    boards: auditBoards,
  };
  const rankingAuditBytes = compactJson(rankingAudit);

  const dateHorizon = { start: options.start, days: options.days, end: dates.at(-1),
    seasonStartYear: options.year, seasonEndYear: options.year + 1, phase: 'regular',
    sourceDataSeasonRange: '2017-18 through 2025-26 regular seasons only',
    excludedSeasonStartYears: [2026] };
  const receipt = {
    format: 'djhc-swishiq-v4-impact-daily-board-build-receipt-v1',
    generatedAt: options.start + 'T12:00:00.000Z',
    releaseId: impactModelRef.releaseId,
    modelId: impactModelRef.modelId,
    modelVersion: impactModelRef.modelVersion,
    scoringContract: DAILY_IMPACT_SCORING_CONTRACT,
    evaluationKind: EVALUATION_KIND,
    objectiveVersion: OBJECTIVE_VERSION,
    manifest: { path: impactModelRef.manifestPath, sha256: manifestSha256, bytes: manifestBytes.byteLength,
      selectedSeasonArtifactPath: seasonDescriptor.path, selectedSeasonArtifactSha256: seasonDescriptor.sha256,
      selectedSeasonArtifactBytes: companionBytes.byteLength, records: companionPayload.records.length },
    sourcePackage: { packageId: expected.packageId, packageVersion: expected.packageVersion,
      seasonStartYear: options.year, phase: 'regular', indexSha256, indexBytes: indexBytes.byteLength,
      playerGamesPartSha256: playerGamesSha256, playerGamesPartBytes: playerGamesBytes.byteLength,
      playerGamesPartRows: playerGamesDescriptor.rows, aggregatedProfiles: profiles.length,
      rosterReconciliation: reconciled.summary },
    horizon: dateHorizon,
    boardCount: newPins.length,
    requiredCounts: REQUIRED_COUNTS,
    runtimePinStage: { path: runtimePinPath, originalPinSha256: sha256(runtimePinBytes),
      originalPinBytes: runtimePinBytes.byteLength, activePinCount: mergedPins.dailyGamePins.length,
      replacedPrimaryPinCount: mergedPins.replacedPins.length, historyPinCount: mergedPins.dailyGamePinHistory.length,
      publicPinPath, publicPinBytes: publicPinBytes.byteLength,
      generatedRuntimePinBytes: runtimePinBytesNext.byteLength },
    rankingAudit: { path: 'ranking-audit.json', sha256: sha256(rankingAuditBytes), bytes: rankingAuditBytes.byteLength,
      boardAuditCount: auditBoards.length, draftCombinationsPerBoard: REQUIRED_COUNTS.draftCombinations },
    refill: { totalRosterProfilesScanned: summaries.reduce((sum, row) => sum + row.refill.scannedRosterProfiles, 0),
      totalProfilesSkippedToFillEligibleChoices: summaries.reduce((sum, row) => sum + row.refill.skippedProfiles, 0),
      draftRetryCount: summaries.filter(row => row.gameKind === 'draft-night')
        .reduce((sum, row) => sum + Math.max(0, row.refill.attempts - 1), 0) },
    dailyGamePins: newPins,
    boards: summaries,
  };
  const receiptBytes = compactJson(receipt);
  stagedFiles.push({ path: publicPinPath, bytes: publicPinBytes });
  stagedFiles.push({ path: runtimePinPath, bytes: runtimePinBytesNext });
  stagedFiles.push({ path: 'ranking-audit.json', bytes: rankingAuditBytes });
  stagedFiles.push({ path: 'build-receipt.json', bytes: receiptBytes });
  for (const file of stagedFiles) await writeNewFile(outputRoot, file.path, file.bytes);
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, outputRoot),
    releaseId: impactModelRef.releaseId,
    modelId: impactModelRef.modelId,
    modelVersion: impactModelRef.modelVersion,
    sourcePackage: receipt.sourcePackage,
    horizon: dateHorizon,
    boardCount: newPins.length,
    replacedPrimaryPinCount: mergedPins.replacedPins.length,
    historyPinCount: mergedPins.dailyGamePinHistory.length,
    refill: receipt.refill,
    rankingAudit: receipt.rankingAudit,
    buildReceipt: path.join(path.relative(REPO_ROOT, outputRoot), 'build-receipt.json'),
  }, null, 2));
}

const mainPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === mainPath) {
  try {
    await build(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
