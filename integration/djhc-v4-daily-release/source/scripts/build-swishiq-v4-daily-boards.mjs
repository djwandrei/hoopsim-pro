#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalV4IdentityJson } from '../tools/swishiq-studio/engine/canonical-v4-identity.js';
import { normalizeCanonicalV4PlayerNameKey } from '../tools/swishiq-studio/engine/canonical-v4-player-name-identity.js';
import { aggregateV4BoxScorePlayers } from '../tools/swishiq-studio/engine/swishiq-daily-game-v4-box-score.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIN_RELATIVE = 'tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js';
const BOARD_FORMAT = 'djhc-swishiq-static-daily-board-v4';
const BOARD_CONTRACT_VERSION = 2;
const SCORING_CONTRACT = 'observed-box-score-production-v1';
const DEFAULT_START = '2026-10-09';
const DEFAULT_DAYS = 14;
const DEFAULT_YEAR = 2025;
const REQUIRED_DAILY_COUNTS = Object.freeze({ fixTheFiveChallenges: 5, fixLineup: 5, fixCandidates: 3, draftRounds: 5, draftCandidates: 3 });

function parseArgs(argv) {
  const options = { start: DEFAULT_START, days: DEFAULT_DAYS, year: DEFAULT_YEAR, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--start', '--days', '--year', '--output'].includes(flag)) {
      throw new Error('Unknown argument: ' + flag);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(flag + ' requires a value.');
    options[flag.slice(2)] = value;
    index += 1;
  }
  options.days = Number(options.days);
  options.year = Number(options.year);
  if (!isDate(options.start)) throw new Error('--start must be a real YYYY-MM-DD calendar date.');
  if (!Number.isSafeInteger(options.days) || options.days < 1 || options.days > 90) {
    throw new Error('--days must be an integer from 1 to 90.');
  }
  if (!Number.isSafeInteger(options.year) || options.year < 2017 || options.year > 2025) {
    throw new Error('--year must select a pinned exact season from 2017 through 2025.');
  }
  if (typeof options.output !== 'string' || !options.output.trim()) {
    throw new Error('--output is required and must name a new staging directory under prototypes/ or docs/.');
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
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(first.getTime() + index * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseFrozenRuntimePin(source) {
  const match = /Object\.freeze\((\{[\s\S]*\})\);/.exec(source);
  if (!match) throw new Error('Runtime release pin does not contain the expected Object.freeze(JSON) export.');
  const pin = JSON.parse(match[1]);
  if (pin?.format !== 'djhc-swishiq-v4-studio-runtime-release-pin-v2' || pin.status !== 'reviewed') {
    throw new Error('Runtime pin is not a reviewed V4 release pin.');
  }
  return pin;
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveNewOutputDirectory(value) {
  const output = path.resolve(REPO_ROOT, value);
  const allowedRoots = ['prototypes', 'docs'].map(name => path.join(REPO_ROOT, name));
  if (!allowedRoots.some(root => isWithin(root, output)) || path.relative(REPO_ROOT, output).split(path.sep).some(part => part.toLowerCase() === '.deploy')) {
    throw new Error('--output must stay under prototypes/ or docs/ and outside .deploy/.');
  }
  return output;
}

async function assertDoesNotExist(filePath, label) {
  try {
    await stat(filePath);
    throw new Error(label + ' already exists; choose a new output directory. Nothing was overwritten.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function findYearPackage(pin, year) {
  const packageId = 'nba-swishiq-v4-' + year + '-' + String(year + 1).slice(-2);
  const expected = pin.expectedIdentity?.packages?.filter(row => row?.packageId === packageId) ?? [];
  const pinned = pin.packagePins?.filter(row => row?.packageId === packageId) ?? [];
  if (expected.length !== 1 || pinned.length !== 1) {
    throw new Error('The reviewed release does not pin exactly one package for season ' + year + '.');
  }
  const row = expected[0];
  if (row.scope?.kind !== 'exact-season'
    || row.scope.seasonStartYear !== year
    || row.scope.seasonEndYear !== year + 1
    || row.scope.seasonStartYears?.length !== 1
    || row.scope.seasonStartYears[0] !== year
    || row.scope.pooledFitIsSeasonSpecific !== true
    || !row.scope.phases?.includes('regular')) {
    throw new Error('The selected package is not an exact-season package with a pinned regular phase.');
  }
  return { expected: row, packagePin: pinned[0] };
}

function releaseIdFromPin(pin) {
  const match = /^https?:\/\/[^/]+\/tools\/swishiq-studio\/data\/v4\/releases\/(v4-site-[a-f0-9]{12})\/registry\.json$/.exec(pin.registryUrl);
  if (!match) throw new Error('The runtime pin registry URL is not a canonical immutable release URL.');
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
      throw new Error('The reviewed runtime pin is missing package-reference hash ' + key + '.');
    }
  }
  if (ref.sourceLockDigestKind !== 'full-lock-object'
    || ref.packageVersion !== expected.packageVersion) {
    throw new Error('The exact package pin and expected identity do not match.');
  }
  return ref;
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

function profileRoles(profile) {
  const values = Array.isArray(profile.positions) ? profile.positions : [profile.positions];
  const text = values.filter(value => typeof value === 'string').join(' ').toUpperCase();
  const tokens = text.match(/[A-Z]+/g) ?? [];
  const roles = new Set();
  if (tokens.some(token => ['G', 'PG', 'SG', 'GUARD'].includes(token))) roles.add('G');
  if (tokens.some(token => ['F', 'SF', 'PF', 'FORWARD'].includes(token))) roles.add('F');
  if (tokens.some(token => ['C', 'CENTER'].includes(token))) roles.add('C');
  return roles;
}

function eligibleProfiles(profiles, year) {
  return profiles.filter(profile => profile
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
    && profile.complete === true
    && Number.isFinite(profile.score));
}

function roleCoverage(rows) {
  return ['G', 'F', 'C'].filter(role => rows.some(row => profileRoles(row).has(role)));
}

function chooseGroupCoveringRoles(rows, count, requiredRoles) {
  const ordered = [...rows];
  const chosen = [];
  const used = new Set();
  function search(missing) {
    if (!missing.length) return true;
    const role = [...missing].sort((left, right) => {
      const leftCount = ordered.filter(row => profileRoles(row).has(left) && !used.has(row.normalizedPlayerNameKey)).length;
      const rightCount = ordered.filter(row => profileRoles(row).has(right) && !used.has(row.normalizedPlayerNameKey)).length;
      return leftCount - rightCount || left.localeCompare(right);
    })[0];
    for (const row of ordered) {
      if (used.has(row.normalizedPlayerNameKey) || !profileRoles(row).has(role)) continue;
      used.add(row.normalizedPlayerNameKey);
      chosen.push(row);
      const nextMissing = missing.filter(item => !profileRoles(row).has(item));
      if (search(nextMissing)) return true;
      chosen.pop();
      used.delete(row.normalizedPlayerNameKey);
    }
    return false;
  }
  if (!search([...requiredRoles])) return null;
  for (const row of ordered) {
    if (chosen.length >= count) break;
    if (used.has(row.normalizedPlayerNameKey)) continue;
    used.add(row.normalizedPlayerNameKey);
    chosen.push(row);
  }
  return chosen.length === count ? chosen : null;
}

function chooseFixRoster(teamRows, seed) {
  const ordered = deterministicShuffle(teamRows, seed);
  const roleCounts = Object.fromEntries(['G', 'F', 'C'].map(role => [
    role,
    ordered.filter(profile => profileRoles(profile).has(role)).length,
  ]));
  const doubleRoles = ['G', 'F', 'C']
    .filter(role => roleCounts[role] >= 2)
    .sort((left, right) => roleCounts[left] - roleCounts[right] || left.localeCompare(right));

  for (let keep = doubleRoles.length; keep >= 1; keep -= 1) {
    const required = doubleRoles.slice(0, keep);
    const candidates = chooseGroupCoveringRoles(ordered, 3, required);
    if (!candidates) continue;
    const candidateKeys = new Set(candidates.map(row => row.normalizedPlayerNameKey));
    const remaining = ordered.filter(row => !candidateKeys.has(row.normalizedPlayerNameKey));
    const lineup = chooseGroupCoveringRoles(remaining, 5, required);
    if (lineup) return { lineup, candidates, roleCoverage: { requiredInBothGroups: required, poolCounts: roleCounts } };
  }

  const allRoles = ['G', 'F', 'C'].filter(role => roleCounts[role] > 0);
  const eight = chooseGroupCoveringRoles(ordered, 8, allRoles);
  if (!eight) return null;
  return { lineup: eight.slice(0, 5), candidates: eight.slice(5), roleCoverage: { requiredInBothGroups: [], poolCounts: roleCounts } };
}

function boardPlayer(profile, year) {
  return {
    displayName: profile.displayName,
    normalizedPlayerNameKey: profile.normalizedPlayerNameKey,
    seasonStartYear: year,
    teamCode: profile.teamCode,
    phase: 'regular',
  };
}

function shortHash(value, length = 12) {
  return sha256(Buffer.from(String(value), 'utf8')).slice(0, length);
}

function makeFixChallenges(byTeam, date, releaseId, year) {
  const available = [...byTeam.entries()]
    .filter(([, rows]) => rows.length >= 8)
    .map(([teamCode, rows]) => ({ teamCode, rows }));
  const orderedTeams = deterministicShuffle(available, 'fix-the-five|' + date + '|' + year + '|' + releaseId);
  if (orderedTeams.length < 5) {
    throw new Error(date + ' Fix the Five needs five exact-season teams with eight eligible profiles each; found ' + orderedTeams.length + '.');
  }
  const challenges = [];
  for (const { teamCode, rows } of orderedTeams.slice(0, 5)) {
    const seed = 'fix-the-five|' + date + '|' + teamCode + '|' + year + '|' + releaseId;
    const roster = chooseFixRoster(rows, seed);
    if (!roster) throw new Error(date + ' ' + teamCode + ' cannot form eight distinct eligible player profiles.');
    const lineup = roster.lineup.map(row => boardPlayer(row, year));
    const candidates = roster.candidates.map(row => boardPlayer(row, year));
    const remove = deterministicShuffle(lineup, seed + '|outgoing')[0];
    challenges.push({
      challengeId: 'fix-' + shortHash(seed, 32),
      title: 'Observed production · ' + teamCode,
      prompt: 'Choose one eligible player from the candidates using the pinned exact-season player-game records. The result is a descriptive box-score ranking, not a game-outcome forecast.',
      teamCode,
      lineup,
      removeNormalizedPlayerNameKey: remove.normalizedPlayerNameKey,
      candidates,
    });
  }
  return { challenges, teamCodes: challenges.map(row => row.teamCode) };
}

function makeDraftRounds(byTeam, date, releaseId, year) {
  const eligible = [...byTeam.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([teamCode, rows]) => ({ teamCode, rows }));
  if (eligible.length < 5) throw new Error(date + ' Draft Night needs five teams with three eligible profiles each; found ' + eligible.length + '.');

  for (let attempt = 0; attempt < 128; attempt += 1) {
    const teamOrder = deterministicShuffle(eligible, 'draft-teams|' + date + '|' + year + '|' + releaseId + '|' + attempt);
    const chosenTeams = [];
    const usedKeys = new Set();
    while (chosenTeams.length < 5) {
      const choices = teamOrder.filter(team => !chosenTeams.some(row => row.teamCode === team.teamCode))
        .map(team => ({
          ...team,
          remaining: deterministicShuffle(team.rows, 'draft-players|' + date + '|' + team.teamCode + '|' + attempt)
            .filter(row => !usedKeys.has(row.normalizedPlayerNameKey)),
          tie: shortHash('draft-team-tie|' + date + '|' + attempt + '|' + team.teamCode, 16),
        }))
        .filter(team => team.remaining.length >= 3)
        .sort((left, right) => right.remaining.length - left.remaining.length || left.tie.localeCompare(right.tie));
      const selected = choices[0];
      if (!selected) break;
      const roundNumber = chosenTeams.length + 1;
      const seed = 'draft-round|' + date + '|' + year + '|' + releaseId + '|' + attempt + '|' + roundNumber + '|' + selected.teamCode;
      const candidates = deterministicShuffle(selected.remaining, seed).slice(0, 3);
      candidates.forEach(row => usedKeys.add(row.normalizedPlayerNameKey));
      chosenTeams.push({
        roundNumber,
        roundId: 'draft-round-' + roundNumber + '-' + shortHash(seed, 24),
        title: 'Round ' + roundNumber + ' · ' + selected.teamCode,
        prompt: 'Choose one eligible player from this team using the pinned exact-season player-game records. The result is a descriptive box-score ranking, not a game-outcome forecast.',
        teamCode: selected.teamCode,
        candidates: candidates.map(row => boardPlayer(row, year)),
      });
    }
    if (chosenTeams.length === 5 && usedKeys.size === 15) return { rounds: chosenTeams, teamCodes: chosenTeams.map(row => row.teamCode) };
  }
  throw new Error(date + ' Draft Night could not form five team rounds with fifteen globally unique eligible players.');
}

function createBoard({ date, gameKind, packageRef, body }) {
  const content = {
    format: BOARD_FORMAT,
    contractVersion: BOARD_CONTRACT_VERSION,
    scoringContract: SCORING_CONTRACT,
    publicationStatus: 'published',
    generatedAt: date + 'T12:00:00.000Z',
    dailySeed: date,
    gameKind,
    packageRef,
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
  if (!isWithin(root, destination)) throw new Error('Generated path escaped the selected output directory.');
  await mkdir(path.dirname(destination), { recursive: true });
  let handle;
  try {
    handle = await open(destination, 'wx');
    await handle.writeFile(bytes);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Refusing to overwrite generated file: ' + relativePath);
    throw error;
  } finally {
    await handle?.close();
  }
}

function publicDailyReleasePin(pin, dailyGamePins) {
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
  };
}

function runtimePinSource(pin) {
  return 'export const CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN = Object.freeze('
    + JSON.stringify(pin)
    + ');\n';
}

async function build(options) {
  const outputRoot = resolveNewOutputDirectory(options.output);
  await assertDoesNotExist(outputRoot, '--output directory');

  const pinSource = await readFile(path.join(REPO_ROOT, PIN_RELATIVE), 'utf8');
  const pin = parseFrozenRuntimePin(pinSource);
  const releaseId = releaseIdFromPin(pin);
  const { expected, packagePin } = findYearPackage(pin, options.year);
  const releaseRoot = path.join(REPO_ROOT, 'tools/swishiq-studio/data/v4/releases', releaseId);
  const packageRoot = path.join(releaseRoot, 'packages', expected.packageId, expected.packageVersion);
  const indexPath = path.join(packageRoot, 'index.json');
  const indexBytes = await readFile(indexPath);
  const actualIndexSha256 = sha256(indexBytes);
  if (actualIndexSha256 !== packagePin.indexSha256) throw new Error('Selected package index bytes do not match the reviewed runtime pin.');
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (index.packageVersion !== expected.packageVersion || index.scope?.seasonStartYear !== options.year) {
    throw new Error('Selected package index identity or exact season does not match the reviewed pin.');
  }
  const descriptor = index.artifacts?.filter(row => row?.artifactId === 'player-games') ?? [];
  if (descriptor.length !== 1) throw new Error('Selected package index must contain one player-games artifact descriptor.');
  const playerGamesDescriptor = descriptor[0];
  const sourcePartPath = path.resolve(releaseRoot, playerGamesDescriptor.path);
  if (!isWithin(releaseRoot, sourcePartPath)) throw new Error('player-games artifact path escapes the immutable release.');
  const playerGamesBytes = await readFile(sourcePartPath);
  const actualPlayerGamesSha256 = sha256(playerGamesBytes);
  if (playerGamesBytes.byteLength !== playerGamesDescriptor.bytes
    || actualPlayerGamesSha256 !== playerGamesDescriptor.sha256) {
    throw new Error('player-games source bytes do not match their verified package descriptor.');
  }
  const playerGamesPart = JSON.parse(playerGamesBytes.toString('utf8'));
  if (playerGamesPart.artifactId !== 'player-games' || !Array.isArray(playerGamesPart.records)) {
    throw new Error('Verified player-games source does not contain the expected records payload.');
  }
  if (playerGamesPart.packageVersion !== expected.packageVersion
    || canonicalV4IdentityJson(playerGamesPart.scope) !== canonicalV4IdentityJson(expected.scope)) {
    throw new Error('Verified player-games payload scope does not match the selected exact-season package pin.');
  }
  const verifiedPlayerGamesPart = {
    status: 'verified',
    artifactId: playerGamesPart.artifactId,
    package: {
      packageId: playerGamesPart.packageId,
      packageVersion: playerGamesPart.packageVersion,
      scope: playerGamesPart.scope,
    },
    records: playerGamesPart.records,
  };
  const rawProfiles = await aggregateV4BoxScorePlayers(verifiedPlayerGamesPart, {
    seasonStartYear: options.year,
    phase: 'regular',
  });
  const profiles = rawProfiles instanceof Map ? [...rawProfiles.values()]
    : Array.isArray(rawProfiles) ? rawProfiles
      : Array.isArray(rawProfiles?.profiles) ? rawProfiles.profiles
        : Object.values(rawProfiles ?? {});
  const eligible = eligibleProfiles(profiles, options.year);
  if (eligible.length === 0) throw new Error('No complete qualified exact-season player-game profiles met the eligibility thresholds.');
  const byTeam = new Map();
  for (const profile of eligible) {
    const rows = byTeam.get(profile.teamCode) ?? [];
    rows.push(profile);
    byTeam.set(profile.teamCode, rows);
  }
  for (const [teamCode, rows] of byTeam) {
    const keys = rows.map(row => row.normalizedPlayerNameKey);
    if (new Set(keys).size !== keys.length) throw new Error('The aggregator repeated an exact player/team profile for ' + teamCode + '.');
    rows.sort((left, right) => left.normalizedPlayerNameKey.localeCompare(right.normalizedPlayerNameKey));
  }
  const packageRef = packageRefFromPin(pin, releaseId, expected, packagePin);
  const dates = dateSequence(options.start, options.days);
  const existingPins = Array.isArray(pin.dailyGamePins) ? [...pin.dailyGamePins] : [];
  const newPins = [];
  const summaries = [];
  const stageReleaseRoot = path.join('tools/swishiq-studio/data/v4/releases', releaseId);

  for (const date of dates) {
    const generatedAt = date + 'T12:00:00.000Z';
    for (const gameKind of ['fix-the-five', 'draft-night']) {
      if (existingPins.some(row => row.gameKind === gameKind && row.dailySeed === date)) {
        throw new Error('The reviewed runtime pin already contains ' + gameKind + ' for ' + date + '; refusing to replace it.');
      }
      const bodyResult = gameKind === 'fix-the-five'
        ? makeFixChallenges(byTeam, date, releaseId, options.year)
        : makeDraftRounds(byTeam, date, releaseId, options.year);
      const body = gameKind === 'fix-the-five'
        ? { challenges: bodyResult.challenges }
        : { deck: {
          deckId: 'draft-' + date.replaceAll('-', '') + '-' + shortHash(gameKind + '|' + date + '|' + releaseId, 16),
          title: 'Daily observed production draft',
          prompt: 'Choose one player from each team round using the pinned exact-season player-game records. This is a descriptive box-score ranking, not a game-outcome forecast.',
          rounds: bodyResult.rounds,
        } };
      const board = createBoard({ date, gameKind, packageRef, body });
      if (board.generatedAt !== generatedAt) throw new Error('Non-deterministic board generation timestamp.');
      const boardBytes = compactJson(board);
      const boardPath = 'daily-games/' + gameKind + '/' + date + '.json';
      const boardSha256 = sha256(boardBytes);
      const pinEntry = {
        gameKind,
        dailySeed: date,
        path: boardPath,
        boardSha256,
        boardContentSha256: board.boardContentSha256,
        packageId: expected.packageId,
        packageVersion: expected.packageVersion,
        scope: expected.scope,
        phase: 'regular',
      };
      await writeNewFile(outputRoot, path.join(stageReleaseRoot, boardPath), boardBytes);
      newPins.push(pinEntry);
      const candidateTeamCounts = Object.fromEntries([...byTeam.entries()]
        .map(([teamCode, rows]) => [teamCode, rows.length])
        .sort(([left], [right]) => left.localeCompare(right)));
      summaries.push({
        gameKind,
        dailySeed: date,
        boardId: board.boardId,
        path: boardPath,
        boardSha256,
        boardContentSha256: board.boardContentSha256,
        eligibleProfiles: eligible.length,
        eligibleProfilesByTeam: candidateTeamCounts,
        selectedTeamCodes: bodyResult.teamCodes,
        selectedPlayerCount: gameKind === 'fix-the-five'
          ? bodyResult.challenges.reduce((sum, challenge) => sum + challenge.lineup.length + challenge.candidates.length, 0)
          : bodyResult.rounds.reduce((sum, round) => sum + round.candidates.length, 0),
        rolePolicy: gameKind === 'fix-the-five'
          ? bodyResult.challenges.map(challenge => ({
            teamCode: challenge.teamCode,
            playersInLineup: challenge.lineup.length,
            candidates: challenge.candidates.length,
            positionsPresent: roleCoverage([...challenge.lineup, ...challenge.candidates].map(row => ({
              positions: (byTeam.get(challenge.teamCode) ?? []).find(profile => profile.normalizedPlayerNameKey === row.normalizedPlayerNameKey)?.positions ?? [],
            }))),
          }))
          : undefined,
      });
    }
  }

  const allPins = [...existingPins, ...newPins];
  const nextRuntimePin = { ...pin, dailyGamePins: allPins };
  const publicPin = publicDailyReleasePin(pin, allPins);
  await writeNewFile(outputRoot, path.join(stageReleaseRoot, 'public-daily-release-pin.json'), compactJson(publicPin));
  await writeNewFile(outputRoot, 'tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js',
    Buffer.from(runtimePinSource(nextRuntimePin), 'utf8'));

  const receipt = {
    format: 'djhc-swishiq-v4-observed-box-score-daily-board-build-receipt-v1',
    generatedAt: options.start + 'T12:00:00.000Z',
    releaseId,
    scoringContract: SCORING_CONTRACT,
    package: {
      packageId: expected.packageId,
      packageVersion: expected.packageVersion,
      seasonStartYear: options.year,
      phase: 'regular',
      indexSha256: actualIndexSha256,
      playerGamesPartSha256: actualPlayerGamesSha256,
      playerGamesPartBytes: playerGamesBytes.byteLength,
      playerGamesPartRows: playerGamesDescriptor.rows,
      aggregatedProfiles: profiles.length,
      eligibleProfiles: eligible.length,
      eligibleProfilesByTeam: Object.fromEntries([...byTeam.entries()]
        .map(([teamCode, rows]) => [teamCode, rows.length])
        .sort(([left], [right]) => left.localeCompare(right))),
    },
    dateRange: { start: options.start, days: options.days, end: dates.at(-1) },
    boardCount: newPins.length,
    requiredCounts: REQUIRED_DAILY_COUNTS,
    dailyGamePins: newPins,
    boards: summaries,
  };
  const receiptBytes = compactJson(receipt);
  await writeNewFile(outputRoot, 'build-receipt.json', receiptBytes);
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, outputRoot),
    releaseId,
    packageId: expected.packageId,
    packageVersion: expected.packageVersion,
    dateRange: receipt.dateRange,
    boardCount: newPins.length,
    eligibleProfiles: eligible.length,
    eligibleProfilesByTeam: receipt.package.eligibleProfilesByTeam,
    sourceHashes: {
      indexSha256: actualIndexSha256,
      playerGamesPartSha256: actualPlayerGamesSha256,
    },
    buildReceipt: path.join(path.relative(REPO_ROOT, outputRoot), 'build-receipt.json'),
  }, null, 2));
}

try {
  await build(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error?.message || String(error));
  process.exitCode = 1;
}
