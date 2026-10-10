import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { getFranchiseRotationRoster, projectFranchiseRotationToLiveGameTeam,
  validateFranchiseRotationState } from './franchise-controls-v1.mjs';
import { evaluateFranchiseAutomationPermission } from './franchise-automation-v1.mjs';
import { prepareCpuFranchiseRotation, applyCpuFranchiseRotation } from './cpu-franchise-rotation-v1.mjs';
import { applyFranchiseControlsToGameInput, mergePlayerGameStatEvidence } from './franchise-game-input-v1.mjs';
import { getFranchiseCoachingPlan, normalizeGameCoachingPlan } from './franchise-coaching-v1.mjs';

const codeFor = value => String(value ?? '').trim().toUpperCase();
const keyFor = player => normalizeCanonicalPlayerName(player?.canonicalName ?? player?.displayName ?? player?.name);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cachedPlayerFeatures = ['overallRatingDiff', 'offenseDefenseMatchupDiff', 'defenseRatingDiff', 'playerProductionDiff', 'playerProductionTotal'];

function hold(message, detail) {
  throw Object.assign(new Error(message), { rosterPreparation: { status: 'requires-review', ...detail } });
}

/** Every league game reads membership from the same state used by transactions.
 * Input boxes may supplement exact-name statistics, but cannot restore a traded
 * player to their former team or override an explicit current-state value.
 * Planning and saves happen on a clone; a later failure commits nothing. */
export function prepareLeagueGameInput({ state, input, commissionerMode = false } = {}) {
  if (!Number.isInteger(state?.seasonStartYear) || !Number.isInteger(state?.revision) || state.revision < 0) {
    hold('League game preparation needs a current season and state revision.', { violations: ['Invalid LeagueState season/revision.'] });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) hold('A game input object is required.', {});
  if (input.seasonStartYear !== undefined && input.seasonStartYear !== state.seasonStartYear) {
    hold('Game input season conflicts with current LeagueState.', { suppliedSeasonStartYear: input.seasonStartYear, seasonStartYear: state.seasonStartYear });
  }
  const nextState = structuredClone(state), nextInput = structuredClone(input);
  const codes = {};
  const evidenceByName = new Map();
  for (const side of ['home', 'away']) {
    const candidates = [input[side]?.teamCode, input[`${side}TeamCode`], input[`${side}Team`]].filter(value => value !== undefined && value !== null && value !== '').map(codeFor);
    if (!candidates.length || candidates.some(value => value !== candidates[0])) hold('Game input has missing or conflicting team identities.', { side, teamCodes: candidates });
    codes[side] = candidates[0];
    if (input[side]?.players !== undefined && !Array.isArray(input[side].players)) hold('Game player evidence must be an array.', { side });
    for (const player of input[side]?.players ?? []) {
      const key = keyFor(player);
      if (!key || evidenceByName.has(key)) hold('Game input has missing or ambiguous canonical player evidence.', { side, canonicalName: player?.canonicalName ?? player?.displayName ?? player?.name });
      evidenceByName.set(key, player);
    }
  }
  if (codes.home === codes.away) hold('A team cannot play itself.', { teamCode: codes.home });
  const teams = [], controlActions = [], coachingTeams = [];
  for (const side of ['home', 'away']) {
    const teamCode = codes[side];
    const roster = getFranchiseRotationRoster({ state: nextState, teamCode });
    if (roster.status !== 'pass') hold(`Current roster for ${teamCode} requires review.`, { side, teamCode, roster });
    const team = nextState.teams.find(row => codeFor(row.teamCode) === teamCode);
    let saved = team.franchiseControlsBySeason?.[String(nextState.seasonStartYear)];
    const permission = evaluateFranchiseAutomationPermission({ state: nextState, teamCode, domain: 'lineup', action: 'execute', actor: 'cpu' });
    const savedValidation = saved ? validateFranchiseRotationState({ state: nextState, teamCode, controls: saved }) : null;
    if ((!saved || savedValidation.status !== 'pass') && permission.allowed) {
      const proposal = prepareCpuFranchiseRotation({ state: nextState, teamCode });
      if (proposal.status !== 'prepared') hold(`CPU rotation for ${teamCode} requires review.`, { side, teamCode, proposal });
      const applied = applyCpuFranchiseRotation({ state: nextState, proposal });
      if (!['created', 'updated'].includes(applied.status)) hold(`CPU rotation for ${teamCode} could not be committed.`, { side, teamCode, applied });
      Object.assign(nextState, applied.state);
      saved = nextState.teams.find(row => codeFor(row.teamCode) === teamCode).franchiseControlsBySeason[String(nextState.seasonStartYear)];
      controlActions.push(applied.receipt);
    } else if (saved && savedValidation.status !== 'pass') {
      hold(`Saved rotation for ${teamCode} requires user review before this game.`, { side, teamCode, validation: savedValidation, permission });
    }
    const currentNames = new Set(roster.players.map(keyFor));
    const oldNames = (input[side]?.players ?? []).map(keyFor);
    // Exact-name statistical evidence may follow a traded player from either
    // side of the old request; state still supplies their current membership.
    const players = roster.players.map(player => {
      const { rotationAvailability, ...statePlayer } = player;
      return { ...mergePlayerGameStatEvidence(statePlayer, evidenceByName.get(keyFor(player))),
        canonicalName: statePlayer.canonicalName, teamCode, playerRef: statePlayer.playerRef ?? statePlayer.canonicalName };
    });
    nextInput[side] = { ...(nextInput[side] ?? {}), teamCode, players };
    nextInput[`${side}TeamCode`] = teamCode;
    if (!saved) {
      // With automation disabled, an explicit per-game user minute scenario is
      // accepted only for the full current roster. Never auto-repair it.
      const ownEvidence = new Map((input[side]?.players ?? []).map(player => [keyFor(player), player]));
      const staleNames = oldNames.filter(name => !currentNames.has(name));
      const missingNames = roster.players.filter(player => !ownEvidence.has(keyFor(player))).map(player => player.canonicalName);
      if (staleNames.length || missingNames.length) hold(`Manual game rotation for ${teamCode} no longer matches the current roster.`, { side, teamCode, staleNames, missingNames, permission });
      const assignments = players.map(player => ({ canonicalName: player.canonicalName,
        minutes: ownEvidence.get(keyFor(player)).projectedMinutes }));
      if (assignments.some(row => !finite(row.minutes))) hold(`Manual game rotation for ${teamCode} needs explicit numeric minute assignments.`, { side, teamCode });
      const active = assignments.filter(row => row.minutes > 0).map(row => row.canonicalName);
      const controls = { seasonStartYear: nextState.seasonStartYear, gameDurationMinutes: 48,
        starters: input[side]?.rotationControls?.starters ?? active.slice(0, 5),
        activeRotation: active, inactiveRotation: assignments.filter(row => row.minutes === 0).map(row => row.canonicalName),
        minuteAssignments: assignments, rotationControls: structuredClone(input[side]?.rotationControls ?? {}) };
      const projection = projectFranchiseRotationToLiveGameTeam({ state: nextState, teamCode, controls, commissionerMode });
      if (projection.status !== 'pass') hold(`Manual game rotation for ${teamCode} requires review.`, { side, teamCode, projection });
      const projectedByName = new Map(projection.liveGameTeam.players.map(player => [keyFor(player), player]));
      nextInput[side].players = players.filter(player => projectedByName.has(keyFor(player))).map(player => mergePlayerGameStatEvidence(projectedByName.get(keyFor(player)), player));
      nextInput[side].rotationControls = projection.liveGameTeam.rotationControls;
    }
    for (const field of ['overallRating', 'attackRating', 'offenseRating', 'defenseRating']) delete nextInput[side][field];
    const coaching = getFranchiseCoachingPlan(nextState, teamCode);
    if (coaching.status === 'requires-review') hold(`Saved coaching plan for ${teamCode} requires review.`, { side, teamCode, coaching });
    let coachingControls = coaching.controls, coachingSource = coaching.status === 'saved' ? 'current-saved-coaching-plan' : 'neutral-default';
    if (coaching.status !== 'saved' && input[side]?.coachingPlan !== undefined) {
      const normalized = normalizeGameCoachingPlan({ plan: input[side].coachingPlan });
      if (normalized.status !== 'pass') hold(`Game coaching plan for ${teamCode} requires review.`, { side, teamCode, normalized });
      if (Object.values(normalized.controls).some(value => value !== 1) &&
          !(nextState.userControlledTeamCodes ?? []).map(codeFor).includes(teamCode) && commissionerMode !== true) {
        hold(`An explicit coaching scenario for ${teamCode} requires user team ownership or commissioner mode.`, { side, teamCode });
      }
      coachingControls = normalized.controls; coachingSource = 'explicit-game-coaching-scenario';
    }
    nextInput[side].coachingPlan = structuredClone(coachingControls);
    coachingTeams.push({ side, teamCode, source: coachingSource, controlRevision: coaching.record?.revision ?? null,
      controls: structuredClone(coachingControls) });
    teams.push({ side, teamCode, rosterSource: 'current-league-state-exact-names', controlSource: saved ? saved.actionReceipt?.actor === 'cpu' ? 'saved-cpu-rotation' : 'saved-human-rotation' : 'explicit-game-minute-scenario',
      removedRequestNames: oldNames.filter(name => !currentNames.has(name)),
      currentRosterNames: roster.players.map(player => player.canonicalName), availabilityDisclosures: roster.availabilityDisclosures });
  }
  for (const field of cachedPlayerFeatures) if (nextInput.features) delete nextInput.features[field];
  nextInput.seasonStartYear = nextState.seasonStartYear;
  const projectedInput = applyFranchiseControlsToGameInput(nextState, nextInput, { commissionerMode });
  projectedInput.coachingControlReceipt = { format: 'djhc-franchise-coaching-input-v1', teams: coachingTeams,
    liveExecutionRequired: coachingTeams.some(team => Object.values(team.controls).some(value => value !== 1)),
    disclosure: 'Scenario coaching effects require a supporting possession engine. They are separate from unchanged historical prediction features and player skill.' };
  projectedInput.leagueRosterReceipt = { format: 'djhc-league-game-roster-v1', seasonStartYear: nextState.seasonStartYear,
    initialStateRevision: state.revision, preparedStateRevision: nextState.revision, teams,
    disclosure: 'Current state supplies roster membership and explicit player values. Exact-name request evidence may supplement missing statistics; team-history covariates remain separate. Unknown availability is disclosed, not asserted as healthy.' };
  return { format: 'djhc-league-game-input-preparation-v1', status: 'prepared', state: nextState,
    input: projectedInput, controlActions, receipt: projectedInput.leagueRosterReceipt };
}
