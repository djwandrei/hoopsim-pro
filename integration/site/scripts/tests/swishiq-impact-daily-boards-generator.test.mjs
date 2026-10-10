import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enumerateDraftImpactOptions,
  makeDraftRounds,
  makeFixChallenges,
  parseArgs,
  rankFixChallengeChoices,
  reconcileImpactRoster,
} from '../build-swishiq-impact-daily-boards.mjs';
import { normalizeCanonicalV4PlayerNameKey } from '../../tools/swishiq-studio/engine/canonical-v4-player-name-identity.js';

const TEAM_CODES = ['BOS', 'NYK', 'SAC', 'LAL', 'CHI', 'MIA', 'PHX', 'MIN'];

function profile(displayName, teamCode, overrides = {}) {
  return {
    displayName,
    normalizedPlayerNameKey: normalizeCanonicalV4PlayerNameKey(displayName),
    teamCode,
    seasonStartYear: 2025,
    phase: 'regular',
    games: 40,
    minutes: 900,
    complete: true,
    ...overrides,
  };
}

function fittedRow(displayName, teamCode, offense = 0, defense = 0, overrides = {}) {
  const playerNameKey = normalizeCanonicalV4PlayerNameKey(displayName);
  return {
    scope: { kind: 'exact-season', seasonStartYear: 2025, seasonEndYear: 2026, phase: 'regular', pooled: false },
    estimateKind: 'fitted-coefficient',
    evidence: { kind: 'fitted-player-coefficient', individualEvidenceClaim: false,
      individualCausalEffectClaim: false, individualValidationClaim: false },
    player: { playerNameKey, sourceDisplayName: displayName, canonicalDisplayName: displayName,
      teamCode, teamCodes: [teamCode], identityMatch: { status: 'unique-exact-name-match', method: 'exact-normalized-name' } },
    values: { offense: { value: offense }, defense: { value: defense }, combined: { value: offense + defense } },
    availability: { status: 'available', displayEligible: true },
    exposure: { sourceDisplayEligible: true },
    ...overrides,
  };
}

function fixtureTeams({ teamCount = 5, playersPerTeam = 10, eligiblePerTeam = 8, equalScore = false } = {}) {
  const sourceProfiles = [];
  const fittedRows = [];
  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    const teamCode = TEAM_CODES[teamIndex];
    for (let playerIndex = 0; playerIndex < playersPerTeam; playerIndex += 1) {
      const displayName = `player-${teamIndex}-${playerIndex}`;
      sourceProfiles.push(profile(displayName, teamCode));
      if (playerIndex < eligiblePerTeam) {
        const score = equalScore ? 0 : teamIndex * 10 + playerIndex;
        fittedRows.push(fittedRow(displayName, teamCode, score / 10, score - score / 10));
      }
    }
  }
  return reconcileImpactRoster(sourceProfiles, fittedRows, 2025).teams;
}

test('generator defaults to 2025 and accepts only explicit historical seasons from 2017 through 2025', () => {
  assert.deepEqual(parseArgs([]), {
    start: '2026-10-10', days: 90, year: 2025,
    output: 'prototypes/lineup-impact-v4-20261010/daily',
  });
  for (let year = 2017; year <= 2025; year += 1) {
    assert.equal(parseArgs(['--year', String(year)]).year, year);
  }
  assert.throws(() => parseArgs(['--year', '2016']), /2017 through 2025/);
  assert.throws(() => parseArgs(['--year', '2026']), /2017 through 2025/);
});

test('roster reconciliation requires exact source team membership and preserves full-precision offense plus defense', () => {
  const sourceProfiles = [
    profile('Alpha One', 'BOS'),
    profile('Beta Two', 'NYK', { complete: false }),
    profile('Gamma Three', 'SAC'),
  ];
  const impactRows = [
    fittedRow('Alpha One', 'BOS', 0.1, 0.2),
    fittedRow('Beta Two', 'NYK', 0.5, 0.5),
    fittedRow('Gamma Three', 'LAL', 0.25, 0.75),
    fittedRow('Other Player', 'BOS', 1, 2),
  ];
  const result = reconcileImpactRoster(sourceProfiles, impactRows, 2025);
  const alpha = result.teams.get('BOS').eligibleByName.get('alpha one');
  assert.equal(alpha.combined, 0.1 + 0.2);
  assert.equal(alpha.combined, 0.30000000000000004);
  assert.equal(result.teams.get('NYK').eligibleByName.size, 0, 'incomplete source profiles are ineligible');
  assert.equal(result.teams.get('SAC').eligibleByName.size, 0, 'fitted rows must cover the exact source team');
  assert.equal(result.summary.matchedEligibleProfiles, 1);
  assert.equal(result.summary.eligibleRosterModelTeamMismatches, 1);
});

test('roster reconciliation rejects an eligible fitted row with non-finite component estimates', () => {
  assert.throws(
    () => reconcileImpactRoster([profile('Finite Name', 'BOS')],
      [fittedRow('Finite Name', 'BOS', Number.NaN, 0)], 2025),
    /non-finite offense, defense, or combined estimate/,
  );
});

test('Fix the Five produces five same-team 5-plus-3 challenges with a baseline outgoing player and refill counts', () => {
  const teams = fixtureTeams({ teamCount: 6, playersPerTeam: 10, eligiblePerTeam: 8 });
  const result = makeFixChallenges(teams, '2026-10-10', 'swishiq-v4-impact-native-20261010-v1', 2025);
  assert.equal(result.challenges.length, 5);
  assert.equal(new Set(result.teamCodes).size, 5);
  for (const challenge of result.challenges) {
    assert.equal(challenge.lineup.length, 5);
    assert.equal(challenge.candidates.length, 3);
    assert.ok(challenge.lineup.every(row => row.teamCode === challenge.teamCode));
    assert.ok(challenge.candidates.every(row => row.teamCode === challenge.teamCode));
    const lineupKeys = challenge.lineup.map(row => row.normalizedPlayerNameKey);
    const candidateKeys = challenge.candidates.map(row => row.normalizedPlayerNameKey);
    assert.equal(new Set([...lineupKeys, ...candidateKeys]).size, 8);
    assert.ok(lineupKeys.includes(challenge.removeNormalizedPlayerNameKey));
  }
  assert.equal(result.refill.selectedEligibleProfiles, 40);
  assert.ok(result.refill.scannedRosterProfiles >= 40);
});

test('Draft Night uses five different teams and fifteen globally distinct eligible players', () => {
  const teams = fixtureTeams({ teamCount: 8, playersPerTeam: 10, eligiblePerTeam: 8 });
  const result = makeDraftRounds(teams, '2026-10-10', 'swishiq-v4-impact-native-20261010-v1', 2025);
  assert.equal(result.rounds.length, 5);
  assert.equal(new Set(result.teamCodes).size, 5);
  assert.ok(result.rounds.every(round => round.candidates.length === 3));
  assert.equal(new Set(result.rounds.flatMap(round => round.candidates.map(row => row.normalizedPlayerNameKey))).size, 15);
  assert.equal(result.audit.evaluatedCombinationCount, 243);
  assert.equal(result.audit.combinations.length, 243);
  assert.equal(result.audit.combinations[0].rank, 1);
  assert.equal(result.refill.selectedEligibleProfiles, 15);
});

test('five-player Impact ranking uses the full-precision mean and deterministic codepoint ties', () => {
  const challenge = {
    lineup: ['base-z', 'base-y', 'base-x', 'base-w', 'outgoing'].map(normalizedPlayerNameKey => ({ normalizedPlayerNameKey })),
    removeNormalizedPlayerNameKey: 'outgoing',
    candidates: [{ normalizedPlayerNameKey: 'candidate-z' }, { normalizedPlayerNameKey: 'candidate-a' }, { normalizedPlayerNameKey: 'candidate-m' }],
  };
  const scores = new Map([['base-z', 0.1], ['base-y', 0.2], ['base-x', 0.3], ['base-w', 0.4],
    ['outgoing', 0.5], ['candidate-z', 1], ['candidate-a', 1], ['candidate-m', 0]]);
  const ranked = rankFixChallengeChoices(challenge, scores);
  assert.equal(ranked.options.length, 3);
  assert.deepEqual(ranked.options.map(row => row.normalizedPlayerNameKey), ['candidate-a', 'candidate-z', 'candidate-m']);
  assert.equal(ranked.options[0].resultingFivePlayerMean, (0.1 + 0.2 + 0.3 + 0.4 + 1) / 5);
});

test('Draft Night enumerates exactly 243 combinations and resolves equal means by codepoint order', () => {
  const rounds = Array.from({ length: 5 }, (_, roundIndex) => ({
    candidates: ['c', 'a', 'b'].map(letter => ({ normalizedPlayerNameKey: `r${roundIndex}-${letter}` })),
  }));
  const scores = new Map(rounds.flatMap(round => round.candidates.map(row => [row.normalizedPlayerNameKey, 0])));
  const ranked = enumerateDraftImpactOptions(rounds, scores);
  assert.equal(ranked.length, 243);
  assert.equal(ranked[0].rank, 1);
  assert.deepEqual(ranked[0].normalizedPlayerNameKeys, Array.from({ length: 5 }, (_, index) => `r${index}-a`));
  assert.ok(ranked.every(row => row.fivePlayerMean === 0));
});
