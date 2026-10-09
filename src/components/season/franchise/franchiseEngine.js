// Native franchise engine bridge: loads the vendored release's worker client,
// V4 intake modules, and IndexedDB checkpoint store directly at their
// same-origin studio paths — exactly as the site's preview frame did — while
// the V4 release data itself still relays through the connected studio source.
// The runtime modules stay separate from the UI bundle and load from those
// paths; local source edits are not a deployed release until separately shipped.
import workerConnection from '@/lineupLab/lineup-lab/workerConnection';
import loadFranchiseIntake from '@/components/season/franchise/loadFranchiseIntake';
import { VERIFIED_FIXTURE_NAME, VERIFIED_FIXTURE_RECEIPT_NAME, VERIFIED_FIXTURE_RECEIPT_SHA256, sha256Hex, readPayload, humanBytes } from './franchiseLogic';

const ORIGIN = () => window.location.origin;
export const INTEGRATION_PATH = '/tools/swishiq-studio/franchise-sim-20261008/integration/';
export const FRANCHISE_ROOT = '/tools/swishiq-studio/franchise-sim-20261008/';
export const GAME_MODEL_PATH = `${FRANCHISE_ROOT}checkpoints/2026-10-06-v4-parametric-age-frozen/model.json`;
export const PRODUCTION_CANDIDATE_PATH = `${FRANCHISE_ROOT}models/shared-player-production-v1-candidate-20261007b.json`;
export const VERIFIED_FIXTURE_PATH = `${INTEGRATION_PATH}season-lab-preview/${VERIFIED_FIXTURE_NAME}`;
export const VERIFIED_FIXTURE_RECEIPT_PATH = `${INTEGRATION_PATH}season-lab-preview/${VERIFIED_FIXTURE_RECEIPT_NAME}`;

let enginePromise = null;

export function loadFranchiseEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      // Ensures the same-origin relay connection is active outside the
      // standalone site build (V4 release data only).
      await workerConnection();
      const origin = ORIGIN();
      const importModule = path => import(/* @vite-ignore */ new URL(path, origin).href);
      const [clientModule, intakeModule, snapshotModule, storeModule, scheduleModule, controlsModule] = await Promise.all([
        importModule(`${INTEGRATION_PATH}franchise-worker-client-v1.mjs`),
        importModule(`${INTEGRATION_PATH}v4-franchise-intake-v1.mjs`),
        importModule(`${INTEGRATION_PATH}v4-snapshot-worker-payload-v1.mjs`),
        importModule(`${FRANCHISE_ROOT}lib/franchise-browser-store-v1.mjs`),
        importModule('/tools/swishiq-studio/engine/nba-schedule-source.js?v=20261008&rev=franchise-v4-intake-v1'),
        importModule(`${FRANCHISE_ROOT}lib/franchise-controls-v1.mjs`),
      ]);
      if (typeof clientModule.createFranchiseWorkerClient !== 'function') throw new Error('Worker client does not export createFranchiseWorkerClient().');
      for (const name of ['loadV4FranchiseIntakeV1', 'loadLastObservedTeamScenarioSuggestionsV1', 'applyV4FranchiseRosterChoicesV1', 'createV4FranchiseLocalMirrorReleasePinV1']) {
        if (typeof intakeModule[name] !== 'function') throw new Error('V4 intake or snapshot worker helper is missing a required browser export.');
      }
      if (typeof snapshotModule.buildV4SnapshotWorkerPayloadV1 !== 'function') throw new Error('V4 intake or snapshot worker helper is missing a required browser export.');
      if (typeof storeModule.openFranchiseBrowserStore !== 'function') throw new Error('The franchise browser checkpoint store is unavailable.');
      if (typeof controlsModule.validateFranchiseRotationState !== 'function') throw new Error('Franchise rotation controls cannot be validated.');
      return {
        createFranchiseWorkerClient: clientModule.createFranchiseWorkerClient,
        intake: Object.freeze({ ...intakeModule,
          loadV4FranchiseIntakeV1: options => loadFranchiseIntake(intakeModule, scheduleModule, options),
        }),
        buildV4SnapshotWorkerPayloadV1: snapshotModule.buildV4SnapshotWorkerPayloadV1,
        openFranchiseBrowserStore: storeModule.openFranchiseBrowserStore,
        validateFranchiseRotationState: controlsModule.validateFranchiseRotationState,
      };
    })();
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

export async function createFranchiseWorker() {
  const engine = await loadFranchiseEngine();
  return engine.createFranchiseWorkerClient({
    workerUrl: new URL(`${INTEGRATION_PATH}franchise-worker-v1.mjs`, ORIGIN()),
  });
}

export async function fetchJsonText(path, label) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} request failed with HTTP ${response.status}.`);
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return { text, value };
}

// The independently receipt-pinned prepared two-team browser fixture, with the
// same byte-length and SHA-256 verification the site preview applied.
export async function loadVerifiedFixturePayload() {
  const receiptResponse = await fetch(VERIFIED_FIXTURE_RECEIPT_PATH, { cache: 'no-store' });
  if (!receiptResponse.ok) throw new Error(`Fixture receipt request failed with HTTP ${receiptResponse.status}.`);
  const receiptBytes = new Uint8Array(await receiptResponse.arrayBuffer());
  const receiptDigest = await sha256Hex(receiptBytes);
  if (receiptDigest !== VERIFIED_FIXTURE_RECEIPT_SHA256) throw new Error('Fixture receipt SHA-256 does not match the reviewed UI trust anchor.');
  let receipt;
  try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes)); }
  catch (error) { throw new Error(`Fixture receipt is invalid JSON: ${error.message}`); }
  if (receipt?.format !== 'djhc-season-lab-preview-fixture-receipt-v1' || receipt.version !== 1
    || receipt.fixtureFile !== VERIFIED_FIXTURE_NAME || !Number.isSafeInteger(receipt.byteLength) || receipt.byteLength < 1
    || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')) {
    throw new Error('Fixture receipt format, filename, byte length, or SHA-256 is invalid.');
  }
  const response = await fetch(VERIFIED_FIXTURE_PATH, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Prepared fixture request failed with HTTP ${response.status}.`);
  const fixtureBytes = new Uint8Array(await response.arrayBuffer());
  if (fixtureBytes.byteLength !== receipt.byteLength) throw new Error(`Prepared fixture byte length mismatch (${fixtureBytes.byteLength} actual, ${receipt.byteLength} pinned).`);
  const fixtureDigest = await sha256Hex(fixtureBytes);
  if (fixtureDigest !== receipt.sha256) throw new Error('Prepared fixture SHA-256 does not match its independently pinned receipt.');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fixtureBytes)); }
  catch (error) { throw new Error(`Prepared fixture is invalid UTF-8 JSON: ${error.message}`); }
  const payload = readPayload(parsed);
  const state = payload?.session?.leagueState ?? payload?.sessionInput?.leagueState ?? null;
  if (!Array.isArray(state?.teams) || state.teams.length !== 2) {
    throw new Error('The prepared browser smoke fixture is expected to contain exactly two teams.');
  }
  return {
    payload,
    meta: {
      name: VERIFIED_FIXTURE_NAME,
      detail: `${humanBytes(fixtureBytes.byteLength)} · SHA-256 ${receipt.sha256.slice(0, 16)}… · independently receipt-pinned · prepared V4 two-team browser smoke input · not full-league acceptance`,
    },
  };
}
