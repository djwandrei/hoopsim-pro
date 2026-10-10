import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  atomicWrite, hash, loadPinnedJson, loadPinnedJsonl, pin, pinModuleClosure, stable,
  verifyManifest, withArtifactCache, writeJson,
} from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { indexChronology } from './lib/chronology.mjs';
import { validateMeanConfiguration } from './lib/configuration.mjs';
import { buildCandidate21BoxscoreContexts } from '../models/game-lab-candidate21-boxscore-history-context-v1.mjs';
import { addOpponentAdjustedPaceContexts } from './lib/opponent-adjusted-pace-context.mjs';

const PLAN_FORMAT = 'swishiq-candidate100-candidate21-boxscore-feature-artifact-plan-v1';
const ARTIFACT_FORMAT = 'swishiq-candidate100-candidate21-boxscore-feature-artifact-v1';
const CACHE_STAGE = 'candidate100-candidate21-boxscore-features';
const EXPECTED_SEASON_COUNTS = Object.freeze({ 2020: 1080, 2021: 1230, 2022: 1230, 2023: 1230, 2024: 1230, 2025: 1230 });

export const CANDIDATE21_SCREEN_FEATURES = Object.freeze({
  total: Object.freeze({
    pace: Object.freeze(['c21:meanBoxscorePace20']),
    turnover: Object.freeze(['c21:meanBoxscoreTovRate20', 'c21:meanBoxscoreOpponentTovRate20']),
    offensiveRebound: Object.freeze(['c21:meanBoxscoreOrbRate20', 'c21:meanBoxscoreOpponentOrbRate20']),
    freeThrow: Object.freeze(['c21:meanBoxscoreFtr20', 'c21:meanBoxscoreOpponentFtr20']),
  }),
  margin: Object.freeze({
    turnover: Object.freeze(['c21:boxscoreTurnoverMatchupAdvantage20']),
    offensiveRebound: Object.freeze(['c21:boxscoreOrbMatchupAdvantage20']),
    freeThrow: Object.freeze(['c21:boxscoreFtrMatchupAdvantage20']),
  }),
});

export const CANDIDATE21_ADJUSTED_SCREEN_FEATURES = Object.freeze({
  total: Object.freeze({
    effectiveFieldGoal: Object.freeze(['c21:meanOpponentAdjustedEfg20']),
    turnover: Object.freeze(['c21:meanOpponentAdjustedTov20']),
    offensiveRebound: Object.freeze(['c21:meanOpponentAdjustedOrb20']),
    freeThrow: Object.freeze(['c21:meanOpponentAdjustedFtr20']),
  }),
  margin: Object.freeze({
    effectiveFieldGoal: Object.freeze(['c21:opponentAdjustedEfgAdvantage20']),
    turnover: Object.freeze(['c21:opponentAdjustedTovAdvantage20']),
    offensiveRebound: Object.freeze(['c21:opponentAdjustedOrbAdvantage20']),
    freeThrow: Object.freeze(['c21:opponentAdjustedFtrAdvantage20']),
  }),
});

export function candidate21FeatureSet(name = 'raw') {
  if (name === 'raw') return CANDIDATE21_SCREEN_FEATURES;
  if (name === 'opponent-adjusted') return CANDIDATE21_ADJUSTED_SCREEN_FEATURES;
  if (name === 'opponent-adjusted-pace') return {
    total: { pace: ['c21:meanOpponentAdjustedPace20'] }, margin: {},
  };
  throw Error('Unknown Candidate21 feature set: ' + name);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function requireFile(baseDirectory, value, label) {
  if (typeof value !== 'string' || !value.trim()) throw Error(label + ' path is required');
  const file = path.resolve(baseDirectory, value);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw Error(label + ' is not a readable file: ' + file);
  return file;
}

function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function assertManifestPins(verified, file, label) {
  const actual = pin(file);
  if (!verified.checked.some(item => samePath(item.path, actual.path)
    && item.sha256 === actual.sha256 && item.bytes === actual.bytes)) {
    throw Error(label + ' is not pinned by the verified source manifest');
  }
  return actual;
}

function validatePlan(plan) {
  if (!isRecord(plan) || plan.format !== PLAN_FORMAT) throw Error('Expected ' + PLAN_FORMAT);
  candidate21FeatureSet(plan.featureSet);
  if (plan.warmupSeasonStartYear !== 2020 || plan.throughSeasonStartYear !== 2025
    || stable(plan.screenTargetSeasonStartYears) !== stable([2022, 2023, 2024, 2025])) {
    throw Error('Candidate21 screen artifact is pinned to warmup 2020 and screen seasons 2022-2025');
  }
}

function buildScoreGames(teamRows) {
  if (!Array.isArray(teamRows) || !teamRows.length) throw Error('Team-game records are required');
  const sidesByGame = new Map();
  for (const row of teamRows) {
    if (row?.time?.phase !== 'regular' || row?.values?.reconciliationStatus !== 'matched'
      || row?.values?.trainingEligible !== true) continue;
    const gameRef = row.entities?.gameRef;
    if (typeof gameRef !== 'string' || !gameRef) throw Error('Eligible team-game row lacks game identity');
    const sides = sidesByGame.get(gameRef) || [];
    sides.push(row);
    sidesByGame.set(gameRef, sides);
  }
  const games = [];
  for (const [gameRef, sides] of sidesByGame) {
    if (sides.length !== 2) throw Error('Expected exactly two eligible team-game sides: ' + gameRef);
    const home = sides.find(row => row.values.isHome === true);
    const away = sides.find(row => row.values.isHome === false);
    if (!home || !away || home.time.gameDateLocal !== away.time.gameDateLocal
      || home.time.seasonStartYear !== away.time.seasonStartYear
      || home.entities.teamCode !== away.entities.opponentTeamCode
      || away.entities.teamCode !== home.entities.opponentTeamCode
      || home.values.pointsFor !== away.values.pointsAgainst
      || home.values.pointsAgainst !== away.values.pointsFor
      || !Number.isSafeInteger(home.values.pointsFor) || !Number.isSafeInteger(away.values.pointsFor)) {
      throw Error('Invalid paired team-game score context: ' + gameRef);
    }
    games.push({
      gameRef,
      seasonStartYear: home.time.seasonStartYear,
      gameDateLocal: home.time.gameDateLocal,
      homeTeamRef: home.entities.teamCode,
      awayTeamRef: away.entities.teamCode,
      homeScore: home.values.pointsFor,
      awayScore: away.values.pointsFor,
    });
  }
  games.sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  if (new Set(games.map(game => game.gameRef)).size !== games.length) throw Error('Duplicate paired team-game identities');
  return games;
}

function auditPlayerRows(rows) {
  const identities = new Set();
  for (const row of rows) {
    if (row?.time?.phase !== 'regular' || row?.evidence?.status !== 'available') continue;
    const { gameRef, teamCode, playerRef } = row.entities ?? {};
    if (![gameRef, teamCode, playerRef].every(value => typeof value === 'string' && value.length > 0)) {
      throw Error('Candidate21 player-game row has incomplete player/game/team identity');
    }
    const identity = JSON.stringify([gameRef, teamCode, playerRef]);
    if (identities.has(identity)) throw Error('Duplicate Candidate21 player-game identity: ' + identity);
    identities.add(identity);
    const box = row.values?.box;
    if (!box || box.fieldGoalsMade > box.fieldGoalAttempts || box.threePointersMade > box.fieldGoalsMade
      || (Number.isFinite(box.threePointAttempts) && box.threePointersMade > box.threePointAttempts)
      || (Number.isFinite(box.freeThrowsMade) && box.freeThrowsMade > box.freeThrowAttempts)) {
      throw Error('Candidate21 player-game has impossible made/attempt counts: ' + identity);
    }
  }
  return { eligiblePlayerRows: identities.size, duplicatePlayerGameRows: 0, impossibleMadeAttemptRows: 0 };
}

function deriveFeatures(context, featureSet = 'raw') {
  if (!context || context.format !== 'swishiq-candidate21-boxscore-history-context-v2'
    || !context.home || !context.away) throw Error('Expected strictly prior Candidate21 box-score context');
  const h = context.home, a = context.away;
  if (featureSet === 'opponent-adjusted-pace') {
    if (!Number.isFinite(h.opponentAdjustedPace20) || !Number.isFinite(a.opponentAdjustedPace20)) {
      throw Error('Missing or invalid opponent-adjusted pace context');
    }
    return { total: { 'c21:meanOpponentAdjustedPace20': (h.opponentAdjustedPace20 + a.opponentAdjustedPace20) / 2 }, margin: {} };
  }
  if (featureSet === 'opponent-adjusted') {
    const fields = {
      Efg: 'opponentAdjustedEffectiveFieldGoalPct20',
      Tov: 'opponentAdjustedTurnoverRate20',
      Orb: 'opponentAdjustedOffensiveReboundRate20',
      Ftr: 'opponentAdjustedFreeThrowRate20',
    };
    const result = { total: {}, margin: {} };
    for (const [label, field] of Object.entries(fields)) {
      if (!Number.isFinite(h[field]) || !Number.isFinite(a[field])) {
        throw Error('Missing or invalid adjusted Candidate21 value: ' + field);
      }
      result.total['c21:meanOpponentAdjusted' + label + '20'] = (h[field] + a[field]) / 2;
      // Lower turnover rate is favorable to home; other rates favor home when higher.
      const direction = label === 'Tov' ? -1 : 1;
      result.margin['c21:opponentAdjusted' + label + 'Advantage20'] = direction * (h[field] - a[field]) / 2;
    }
    return result;
  }
  const required = [
    'pace20', 'turnoverRate20', 'opponentTurnoverRate20', 'offensiveReboundRate20',
    'opponentOffensiveReboundRate20', 'freeThrowRate20', 'opponentFreeThrowRate20',
  ];
  for (const [sideName, side] of [['home', h], ['away', a]]) {
    for (const field of required) if (!Number.isFinite(side[field])) {
      throw Error('Missing or invalid Candidate21 value: ' + sideName + '/' + field);
    }
  }
  const homeTurnoverDrag = (h.turnoverRate20 + a.opponentTurnoverRate20) / 2;
  const awayTurnoverDrag = (a.turnoverRate20 + h.opponentTurnoverRate20) / 2;
  const homeOrbMatchup = (h.offensiveReboundRate20 + a.opponentOffensiveReboundRate20) / 2;
  const awayOrbMatchup = (a.offensiveReboundRate20 + h.opponentOffensiveReboundRate20) / 2;
  const homeFtrMatchup = (h.freeThrowRate20 + a.opponentFreeThrowRate20) / 2;
  const awayFtrMatchup = (a.freeThrowRate20 + h.opponentFreeThrowRate20) / 2;
  return {
    total: {
      'c21:meanBoxscorePace20': (h.pace20 + a.pace20) / 2,
      'c21:meanBoxscoreTovRate20': (h.turnoverRate20 + a.turnoverRate20) / 2,
      'c21:meanBoxscoreOpponentTovRate20': (h.opponentTurnoverRate20 + a.opponentTurnoverRate20) / 2,
      'c21:meanBoxscoreOrbRate20': (h.offensiveReboundRate20 + a.offensiveReboundRate20) / 2,
      'c21:meanBoxscoreOpponentOrbRate20': (h.opponentOffensiveReboundRate20 + a.opponentOffensiveReboundRate20) / 2,
      'c21:meanBoxscoreFtr20': (h.freeThrowRate20 + a.freeThrowRate20) / 2,
      'c21:meanBoxscoreOpponentFtr20': (h.opponentFreeThrowRate20 + a.opponentFreeThrowRate20) / 2,
    },
    margin: {
      'c21:boxscoreTurnoverMatchupAdvantage20': (awayTurnoverDrag - homeTurnoverDrag) / 2,
      'c21:boxscoreOrbMatchupAdvantage20': (homeOrbMatchup - awayOrbMatchup) / 2,
      'c21:boxscoreFtrMatchupAdvantage20': (homeFtrMatchup - awayFtrMatchup) / 2,
    },
  };
}

function validateBaseRows({ baseRows, contexts, scoreGamesByRef, baselineConfig, plan }) {
  if (baseRows.length !== 7230) throw Error('Candidate100 source cache must contain the pinned 7,230-row cohort');
  const chronology = indexChronology(baseRows, { kind: 'feature' });
  const seasons = new Map();
  for (const row of baseRows) {
    if (row.seasonStartYear < plan.warmupSeasonStartYear || row.seasonStartYear > plan.throughSeasonStartYear) {
      throw Error('Unexpected Candidate100 source season: ' + row.seasonStartYear);
    }
    const context = contexts.get(row.gameRef);
    const game = scoreGamesByRef.get(row.gameRef);
    if (!context || context.gameDateLocal !== row.gameDateLocal || context.observedThrough !== row.observedThrough
      || context.observedThrough == null || context.observedThrough >= row.gameDateLocal) {
      throw Error('Candidate21 context cutoff or identity check failed: ' + row.gameRef);
    }
    if (!game || game.gameDateLocal !== row.gameDateLocal || game.seasonStartYear !== row.seasonStartYear
      || game.homeTeamRef !== row.homeTeamRef || game.awayTeamRef !== row.awayTeamRef
      || game.homeScore !== row.target?.homeScore || game.awayScore !== row.target?.awayScore) {
      throw Error('Candidate21 score source does not match the feature-row target identity: ' + row.gameRef);
    }
    const derived = deriveFeatures(context, plan.featureSet);
    for (const head of ['total', 'margin']) {
      for (const feature of baselineConfig[head + 'FeatureNames']) {
        const value = row.features?.[head]?.[feature];
        if (head === 'total' ? value !== null && !Number.isFinite(value) : !Number.isFinite(value)) {
          throw Error('Baseline feature is invalid before Candidate21 adaptation: ' + head + '/' + feature);
        }
      }
      for (const [name, value] of Object.entries(derived[head])) {
        if (!Number.isFinite(value)) throw Error('Derived Candidate21 feature is nonfinite: ' + head + '/' + name);
      }
    }
    seasons.set(row.seasonStartYear, (seasons.get(row.seasonStartYear) ?? 0) + 1);
  }
  for (const [season, expected] of Object.entries(EXPECTED_SEASON_COUNTS)) {
    if (seasons.get(Number(season)) !== expected) throw Error('Unexpected source row count for season ' + season);
  }
  return {
    chronology,
    seasonCounts: Object.fromEntries([...seasons].sort(([a], [b]) => a - b)),
  };
}

function adaptRows(baseRows, contexts, baselineConfig, featureSet) {
  const adapted = baseRows.map(row => {
    const derived = deriveFeatures(contexts.get(row.gameRef), featureSet);
    const features = {
      total: { ...row.features.total, ...derived.total },
      margin: { ...row.features.margin, ...derived.margin },
    };
    for (const head of ['total', 'margin']) {
      for (const feature of Object.keys(derived[head])) if (!Number.isFinite(features[head][feature])) {
        throw Error('Candidate21 adapter produced a nonfinite feature: ' + head + '/' + feature);
      }
      for (const feature of baselineConfig[head + 'FeatureNames']) {
        if (stable(features[head][feature]) !== stable(row.features[head][feature])) {
          throw Error('Candidate21 adapter changed selected Candidate100 feature: ' + head + '/' + feature);
        }
      }
    }
    return { ...row, features };
  });
  if (hash(indexChronology(adapted, { kind: 'feature' })) !== hash(indexChronology(baseRows, { kind: 'feature' }))) {
    throw Error('Candidate21 adapter changed source chronology or target identity');
  }
  return adapted;
}

export function buildCandidate100Candidate21BoxscoreFeatureArtifact(plan, { baseDirectory = process.cwd(), planFile = null } = {}) {
  validatePlan(plan);
  const featureSet = plan.featureSet ?? 'raw';
  const screenFeatures = candidate21FeatureSet(featureSet);
  const baseFile = requireFile(baseDirectory, plan.baseFeatures, 'baseFeatures');
  const baseManifestFile = requireFile(baseDirectory, plan.baseSourceManifest, 'baseSourceManifest');
  const teamGamesFile = requireFile(baseDirectory, plan.teamGames, 'teamGames');
  const playerGamesFile = requireFile(baseDirectory, plan.playerGames, 'playerGames');
  const configurationFile = requireFile(baseDirectory, plan.candidate100Configuration, 'candidate100Configuration');
  const cacheRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.cacheRoot ?? './runs/cache'));
  const outputRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? './runs/candidate21-boxscore-feature-artifacts'));
  const base = loadPinnedJsonl(baseFile);
  const baseManifest = verifyManifest(baseManifestFile);
  const teamGamesPin = assertManifestPins(baseManifest, teamGamesFile, 'team-games input');
  const playerGamesPin = assertManifestPins(baseManifest, playerGamesFile, 'player-games input');
  const configuration = loadPinnedJson(configurationFile);
  validateMeanConfiguration(configuration.value);
  if (!/candidate100/i.test(configuration.value.version ?? '') || configuration.value.totalFeatureNames.length !== 40
    || configuration.value.marginFeatureNames.length !== 39 || configuration.value.developmentFeatureContract !== undefined) {
    throw Error('Expected the unchanged pinned 40/39 Candidate100 configuration');
  }
  const teamGames = loadPinnedJson(teamGamesFile);
  const playerGames = loadPinnedJson(playerGamesFile);
  const playerRowAudit = auditPlayerRows(playerGames.value.records);
  const scoreGames = buildScoreGames(teamGames.value.records);
  const scoreGamesByRef = new Map(scoreGames.map(game => [game.gameRef, game]));
  const boxscoreContexts = buildCandidate21BoxscoreContexts({
    playerGameRows: playerGames.value.records,
    teamGameRows: teamGames.value.records,
  });
  const contexts = featureSet === 'opponent-adjusted-pace'
    ? addOpponentAdjustedPaceContexts({ boxscoreContexts, playerGameRows: playerGames.value.records, scoreGames })
    : boxscoreContexts;
  if (contexts.audit.contextCount !== scoreGames.length || contexts.audit.sameLocalDateOutcomesExcluded !== true) {
    throw Error('Candidate21 context did not preserve whole-date cutoff semantics');
  }
  const baseAudit = validateBaseRows({
    baseRows: base.rows,
    contexts: contexts.contexts,
    scoreGamesByRef,
    baselineConfig: configuration.value,
    plan,
  });
  const modelFile = path.resolve(import.meta.dirname, '../models/game-lab-candidate21-boxscore-history-context-v1.mjs');
  const codePins = pinModuleClosure([import.meta.filename, modelFile]);
  const featureDefinitions = featureSet === 'raw' ? {
    pace: '20-game shrunk team pace context; total=(home pace20+away pace20)/2',
    turnover: '20-game shrunk own and opponent turnover rates; total means by side; margin=(away turnover drag-home turnover drag)/2, where each drag averages own turnover rate and opposing opponent-turnover rate',
    offensiveRebound: '20-game shrunk own and opponent offensive-rebound rates; total means by side; margin=(home offensive-rebound matchup-away matchup)/2',
    freeThrow: '20-game shrunk own and opponent free-throw attempt rates; total means by side; margin=(home free-throw matchup-away matchup)/2',
    shared: 'Candidate21 Four Factors use a 20-prior-team-game rolling window and eight prior-equivalent games of shrinkage; season/game contexts are captured before any result from the target local date is added.',
  } : featureSet === 'opponent-adjusted-pace' ? {
    pace: 'Prior team tendency P=(sum of last 20 adjusted pace observations + 8 * prior league raw pace)/(n+8); historical adjusted observation=2*paired game pace-opponent prior P; target total feature=(home P+away P)/2',
    shared: 'Paired game pace is the average of both sides FGA+0.44*FTA-OREB+TOV. The symmetric matchup assumption treats game pace as the average of team tendencies. League anchor is 100 until prior eligible games exist. History crosses seasons; all contexts and adjustments for a local date use the same prior-date snapshot.',
  } : {
    effectiveFieldGoal: 'Candidate21 opponentAdjustedEffectiveFieldGoalPct20; total=(home+away)/2; margin=(home-away)/2',
    turnover: 'Candidate21 opponentAdjustedTurnoverRate20; total=(home+away)/2; margin=(away-home)/2 so a lower own turnover rate favors the home team',
    offensiveRebound: 'Candidate21 opponentAdjustedOffensiveReboundRate20; total=(home+away)/2; margin=(home-away)/2',
    freeThrow: 'Candidate21 opponentAdjustedFreeThrowRate20 (FTA/FGA); total=(home+away)/2; margin=(home-away)/2',
    shared: 'Each historical own rate is adjusted by subtracting the opponent strictly prior allowed rate above the prior league allowance. Adjusted rates then use the last 20 prior team games with eight prior-equivalent games toward the running prior league adjusted mean. All targets on a date precede all outcomes from that date.',
  };
  const signature = {
    format: ARTIFACT_FORMAT,
    planPin: planFile ? pin(planFile) : null,
    baseFeatureRows: base.inputPin,
    baseSourceManifestPin: baseManifest.manifestPin,
    teamGames: teamGamesPin,
    playerGames: playerGamesPin,
    candidate100Configuration: configuration.inputPin,
    contextAudit: contexts.audit,
    playerRowAudit,
    featureSet,
    featureNames: screenFeatures,
    featureDefinitions,
    observedThroughRule: 'capture every target-date context before applying any outcome from that date',
    sourceCohort: {
      warmupSeasonStartYear: plan.warmupSeasonStartYear,
      throughSeasonStartYear: plan.throughSeasonStartYear,
      screenTargetSeasonStartYears: plan.screenTargetSeasonStartYears,
      expectedSeasonCounts: EXPECTED_SEASON_COUNTS,
    },
    codePins,
  };
  const artifact = withArtifactCache(cacheRoot, CACHE_STAGE, signature, directory => {
    const rows = adaptRows(base.rows, contexts.contexts, configuration.value, featureSet);
    const rowsFile = path.join(directory, 'feature-rows.jsonl');
    const rowsBytes = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    atomicWrite(rowsFile, rowsBytes);
    const outputPin = { path: 'feature-rows.jsonl', bytes: rowsBytes.length, sha256: hash(rowsBytes) };
    const family = {
      format: ARTIFACT_FORMAT,
      status: 'strictly-prior-derived-feature-artifact; model-screen-not-run',
      promotionAllowed: false,
      sourcePins: {
        baseFeatureRows: base.inputPin,
        baseSourceManifest: baseManifest.manifestPin,
        teamGames: teamGamesPin,
        playerGames: playerGamesPin,
        candidate100Configuration: configuration.inputPin,
      },
      codePins,
      featureRows: outputPin,
      featureSet,
      featureNames: screenFeatures,
      featureDefinitions,
      contract: {
        inputSource: 'verified V4 player-games/team-games records and the pinned Candidate57 feature-row cohort',
        version: ARTIFACT_FORMAT,
        formula: featureDefinitions,
        window: 'last 20 prior team games, with eight prior-equivalent team games of shrinkage',
        shrinkage: featureSet === 'opponent-adjusted-pace'
          ? 'Adjusted team pace shrinks toward raw prior league game pace with eight prior-equivalent games; no-history anchor is 100.'
          : 'Candidate21 rolling box-score rates shrink toward the running prior-game league mean using its eight-game prior weight',
        missingBehavior: 'Invalid inputs, unavailable required context, bad denominators, and nonfinite derived features fail artifact creation; no missing factor is converted to zero.',
        observedThroughRule: signature.observedThroughRule,
      },
      coverage: {
        rows: rows.length,
        playerRowAudit,
        seasonCounts: baseAudit.seasonCounts,
        targetIdentitySha256: baseAudit.chronology.targetIdentitySha256,
        allRowsHaveStrictlyPriorContext: true,
        allSelectedCandidate100FeaturesPreserved: true,
        contextCount: contexts.audit.contextCount,
      },
      limitations: [
        'This artifact establishes feature provenance and chronology only; it does not fit, score, validate, or promote a model.',
        featureSet === 'opponent-adjusted-pace'
          ? 'One opponent-adjusted possessions-per-game feature is materialized for the total head only; this screen does not normalize overtime possessions to regulation pace.'
          : featureSet === 'raw'
          ? 'Only pace and raw Four Factors are materialized. Opponent-adjusted factors and efficiency/eFG features require separately declared screens.'
          : 'Only opponent-adjusted Four Factors are materialized. Opponent-adjusted pace and efficiency require a separately documented feature builder.',
      ],
    };
    writeJson(path.join(directory, 'feature-family.json'), family);
    return {
      rows: rows.length,
      seasonCounts: baseAudit.seasonCounts,
      targetIdentitySha256: baseAudit.chronology.targetIdentitySha256,
      featureRowsSha256: outputPin.sha256,
      featureRowsBytes: outputPin.bytes,
    };
  });
  const receiptFile = path.join(artifact.directory, 'receipt.json');
  const familyFile = path.join(artifact.directory, 'feature-family.json');
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputRootRun = path.join(outputRoot, 'run-' + Date.now() + '-' + process.pid + '-' + randomUUID());
  fs.mkdirSync(outputRootRun, { recursive: false });
  const result = {
    format: ARTIFACT_FORMAT + '-run-v1',
    status: 'completed-feature-artifact; model-screen-not-run',
    promotionAllowed: false,
    modelFitExecuted: false,
    modelScreenExecuted: false,
    generatedAtUtc: new Date().toISOString(),
    cacheHit: artifact.cacheHit,
    cacheKey: artifact.key,
    cacheDirectory: artifact.directory,
    receipt: pin(receiptFile),
    featureFamily: pin(familyFile),
    featureRows: pin(path.join(artifact.directory, 'feature-rows.jsonl')),
    sourcePins: {
      baseFeatureRows: base.inputPin,
      baseSourceManifest: baseManifest.manifestPin,
      teamGames: teamGamesPin,
      playerGames: playerGamesPin,
      candidate100Configuration: configuration.inputPin,
    },
    featureSet,
    featureNames: screenFeatures,
    coverage: {
      rows: base.rows.length,
      playerRowAudit,
      seasonCounts: baseAudit.seasonCounts,
      targetIdentitySha256: baseAudit.chronology.targetIdentitySha256,
      strictPriorDateRows: base.rows.length,
      invalidOrSameDateRows: 0,
      contextCount: contexts.audit.contextCount,
    },
    writeScope: 'diagnostic cache and one immutable invocation receipt only',
  };
  writeJson(path.join(outputRootRun, 'run.json'), result);
  return { outputDirectory: outputRootRun, ...result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node build-candidate100-candidate21-boxscore-feature-artifact.mjs <plan.json>');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planPath = path.resolve(process.argv[2]);
  console.log(JSON.stringify(buildCandidate100Candidate21BoxscoreFeatureArtifact(loadPinnedJson(planPath).value,
    { baseDirectory: path.dirname(planPath), planFile: planPath })));
}
