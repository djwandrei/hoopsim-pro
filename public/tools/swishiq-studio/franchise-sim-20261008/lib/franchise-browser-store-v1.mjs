import {
  franchiseBrowserStorageKey,
  validateFranchiseBrowserSession,
} from './franchise-browser-session-v1.mjs';

export const FRANCHISE_BROWSER_STORE_FORMAT = 'djhc-franchise-browser-indexeddb-store-v1';
export const FRANCHISE_BROWSER_CHECKPOINT_FORMAT = 'djhc-franchise-browser-checkpoint-v1';
export const FRANCHISE_BROWSER_STORE_DATABASE_NAME = 'djhc-franchise-browser-checkpoints-v1';
export const FRANCHISE_BROWSER_STORE_DATABASE_VERSION = 1;
export const FRANCHISE_BROWSER_STORE_OBJECT_STORE = 'session-checkpoints-v1';
export const MAX_FRANCHISE_BROWSER_CHECKPOINT_BYTES = 128 * 1024 * 1024;

const encoder = new TextEncoder();
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clone = value => structuredClone(value);
const userCode = value => String(value ?? '').trim().toUpperCase();
const previousKeyFor = key => `${key}:previous-checkpoint-v1`;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function validateJsonValue(value, path = '$', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value), `Checkpoint contains a nonfinite number at ${path}.`);
    return;
  }
  requireValue(typeof value === 'object', `Checkpoint contains a non-JSON value at ${path}.`);
  requireValue(!ancestors.has(value), `Checkpoint contains a circular value at ${path}.`);
  const prototype = Object.getPrototypeOf(value);
  requireValue(Array.isArray(value) || prototype === Object.prototype || prototype === null,
    `Checkpoint contains a non-plain object at ${path}.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      requireValue(Object.hasOwn(value, index), `Checkpoint contains a sparse array at ${path}[${index}].`);
      validateJsonValue(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, child] of Object.entries(value)) validateJsonValue(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function ensureOpen(store) {
  requireValue(store?.format === FRANCHISE_BROWSER_STORE_FORMAT && store.db && !store.closed,
    'Franchise browser IndexedDB store is closed or invalid.');
}

function digestHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(text, cryptoProvider) {
  requireValue(typeof cryptoProvider?.subtle?.digest === 'function', 'SHA-256 Web Crypto is required for franchise checkpoints.');
  return digestHex(await cryptoProvider.subtle.digest('SHA-256', encoder.encode(text)));
}

function sessionJson(session, maxBytes) {
  validateFranchiseBrowserSession(session);
  validateJsonValue(session);
  const serializedSession = JSON.stringify(session);
  requireValue(typeof serializedSession === 'string', 'Franchise session could not be serialized.');
  const bytes = encoder.encode(serializedSession).byteLength;
  requireValue(bytes <= maxBytes, `Franchise checkpoint exceeds the ${maxBytes}-byte IndexedDB storage limit.`);
  const restored = JSON.parse(serializedSession);
  validateFranchiseBrowserSession(restored, {
    expectedSourceReceipt: session.sourceReceipt,
    expectedModelReceipt: session.modelReceipt,
  });
  return { serializedSession, bytes };
}

function transactionError(transaction, fallback) {
  return transaction?.error ?? new Error(fallback);
}

function readKeys(db, keys) {
  return new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(FRANCHISE_BROWSER_STORE_OBJECT_STORE, 'readonly'); }
    catch (error) { reject(error); return; }
    const values = new Map();
    let settled = false;
    transaction.oncomplete = () => { if (!settled) { settled = true; resolve(values); } };
    transaction.onerror = () => { if (!settled) { settled = true; reject(transactionError(transaction, 'Checkpoint read failed.')); } };
    transaction.onabort = () => { if (!settled) { settled = true; reject(transactionError(transaction, 'Checkpoint read was aborted.')); } };
    try {
      const objectStore = transaction.objectStore(FRANCHISE_BROWSER_STORE_OBJECT_STORE);
      for (const key of keys) {
        const request = objectStore.get(key);
        request.onsuccess = () => values.set(key, request.result ?? null);
        request.onerror = () => { /* The transaction error handler reports the failure. */ };
      }
    } catch (error) {
      settled = true;
      try { transaction.abort(); } catch { /* Already inactive. */ }
      reject(error);
    }
  });
}

function sameRecord(left, right) {
  if (left === null || left === undefined) return right === null || right === undefined;
  if (right === null || right === undefined) return false;
  return left.format === right.format && left.schemaVersion === right.schemaVersion &&
    left.storageKey === right.storageKey && left.userTeamCode === right.userTeamCode &&
    left.sessionRevision === right.sessionRevision && left.savedAt === right.savedAt &&
    left.sha256 === right.sha256 && left.serializedSession === right.serializedSession &&
    JSON.stringify(left.sourceReceipt) === JSON.stringify(right.sourceReceipt) &&
    JSON.stringify(left.modelReceipt) === JSON.stringify(right.modelReceipt);
}

function writeCheckpointAtomic(store, { currentKey, previousKey, oldCurrent, oldCurrentValid, record }) {
  return new Promise((resolve, reject) => {
    let transaction;
    try { transaction = store.db.transaction(FRANCHISE_BROWSER_STORE_OBJECT_STORE, 'readwrite'); }
    catch (error) { reject(error); return; }
    let settled = false, previousCheckpointSaved = false, abortReason = null;
    transaction.oncomplete = () => {
      if (!settled) { settled = true; resolve({ previousCheckpointSaved }); }
    };
    transaction.onerror = () => {
      if (!settled) { settled = true; reject(transactionError(transaction, 'Checkpoint write failed.')); }
    };
    transaction.onabort = () => {
      if (!settled) { settled = true; reject(abortReason ?? transactionError(transaction, 'Checkpoint write was aborted.')); }
    };
    try {
      const objectStore = transaction.objectStore(FRANCHISE_BROWSER_STORE_OBJECT_STORE);
      const currentRequest = objectStore.get(currentKey);
      currentRequest.onerror = () => { /* The transaction error handler reports the failure. */ };
      currentRequest.onsuccess = () => {
        const current = currentRequest.result ?? null;
        if (!sameRecord(current, oldCurrent)) {
          abortReason = new Error('Franchise checkpoint changed during save; retry against the latest revision.');
          transaction.abort();
          return;
        }
        if (oldCurrentValid && current) {
          objectStore.put(current, previousKey);
          previousCheckpointSaved = true;
        }
        objectStore.put(record, currentKey);
        const readback = objectStore.get(currentKey);
        readback.onerror = () => { /* The transaction error handler reports the failure. */ };
        readback.onsuccess = () => {
          if (!sameRecord(readback.result, record)) {
            abortReason = new Error('Franchise checkpoint transaction readback failed.');
            transaction.abort();
          }
        };
      };
    } catch (error) {
      abortReason = error;
      try { transaction.abort(); } catch { /* Already inactive. */ }
      if (!settled) { settled = true; reject(error); }
    }
  });
}

function assertRecordNamespace(record, storageKey, normalizedTeamCode) {
  requireValue(plain(record) && record.format === FRANCHISE_BROWSER_CHECKPOINT_FORMAT && record.schemaVersion === 1,
    'Unsupported franchise checkpoint record.');
  requireValue(record.storageKey === storageKey && record.userTeamCode === normalizedTeamCode,
    'Franchise checkpoint belongs to a different source/team namespace.');
  requireValue(franchiseBrowserStorageKey(record.sourceReceipt, normalizedTeamCode) === storageKey,
    'Franchise checkpoint source receipt does not match its storage namespace.');
  requireValue(plain(record.modelReceipt) && typeof record.serializedSession === 'string' &&
    /^[a-f0-9]{64}$/.test(record.sha256 ?? ''), 'Franchise checkpoint is missing its model receipt, serialized save, or SHA-256.');
}

async function verifyRecord(record, { storageKey, normalizedTeamCode, cryptoProvider, maxBytes,
  expectedSourceReceipt = null, expectedModelReceipt = null } = {}) {
  assertRecordNamespace(record, storageKey, normalizedTeamCode);
  const bytes = encoder.encode(record.serializedSession).byteLength;
  requireValue(bytes <= maxBytes, 'Franchise checkpoint exceeds the configured IndexedDB read limit.');
  requireValue(await sha256(record.serializedSession, cryptoProvider) === record.sha256,
    'Franchise checkpoint SHA-256 does not match its serialized session.');
  const session = JSON.parse(record.serializedSession);
  validateFranchiseBrowserSession(session, {
    expectedSourceReceipt: expectedSourceReceipt ?? record.sourceReceipt,
    expectedModelReceipt: expectedModelReceipt ?? record.modelReceipt,
  });
  requireValue(Number.isInteger(record.sessionRevision) && record.sessionRevision === session.revision,
    'Franchise checkpoint revision metadata does not match its serialized session.');
  requireValue(typeof record.savedAt === 'string' && Number.isFinite(Date.parse(record.savedAt)) &&
    new Date(record.savedAt).toISOString() === record.savedAt,
  'Franchise checkpoint timestamp metadata is invalid.');
  requireValue(JSON.stringify(session.sourceReceipt) === JSON.stringify(record.sourceReceipt) &&
    JSON.stringify(session.modelReceipt) === JSON.stringify(record.modelReceipt),
  'Franchise checkpoint receipts do not match the serialized session.');
  requireValue((session.leagueState.userControlledTeamCodes ?? []).map(userCode).includes(normalizedTeamCode),
    'Franchise checkpoint team is not controlled by this session.');
  return { session, bytes };
}

/** Open a database isolated from all existing Studio/localStorage saves. */
export async function openFranchiseBrowserStore({ indexedDB = globalThis.indexedDB,
  cryptoProvider = globalThis.crypto, databaseName = FRANCHISE_BROWSER_STORE_DATABASE_NAME,
  maxSerializedBytes = MAX_FRANCHISE_BROWSER_CHECKPOINT_BYTES } = {}) {
  requireValue(typeof indexedDB?.open === 'function', 'IndexedDB is unavailable in this browser.');
  requireValue(Number.isSafeInteger(maxSerializedBytes) && maxSerializedBytes > 0,
    'IndexedDB checkpoint byte limit must be a positive safe integer.');
  requireValue(typeof databaseName === 'string' && databaseName.trim(), 'IndexedDB checkpoint database name is required.');
  const request = indexedDB.open(databaseName, FRANCHISE_BROWSER_STORE_DATABASE_VERSION);
  const db = await new Promise((resolve, reject) => {
    let settled = false;
    request.onupgradeneeded = () => {
      try {
        const openingDb = request.result;
        if (!openingDb.objectStoreNames.contains(FRANCHISE_BROWSER_STORE_OBJECT_STORE)) {
          openingDb.createObjectStore(FRANCHISE_BROWSER_STORE_OBJECT_STORE);
        }
      } catch (error) {
        settled = true;
        reject(error);
      }
    };
    request.onerror = () => {
      if (!settled) { settled = true; reject(request.error ?? new Error('Could not open franchise IndexedDB.')); }
    };
    request.onblocked = () => {
      if (!settled) { settled = true; reject(new Error('Franchise IndexedDB upgrade is blocked by another open tab.')); }
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      resolve(request.result);
    };
  });
  db.onversionchange = () => db.close();
  const handle = { format: FRANCHISE_BROWSER_STORE_FORMAT, db, cryptoProvider, maxSerializedBytes, closed: false };
  handle.save = (session, options) => saveFranchiseBrowserCheckpoint(handle, session, options);
  handle.load = options => loadFranchiseBrowserCheckpoint(handle, options);
  handle.close = () => closeFranchiseBrowserStore(handle);
  return handle;
}

/** Save the verified current checkpoint and rotate it to a previous slot atomically. */
export async function saveFranchiseBrowserCheckpoint(store, session, { userTeamCode, now = () => new Date() } = {}) {
  ensureOpen(store);
  validateFranchiseBrowserSession(session);
  const normalizedTeamCode = userCode(userTeamCode);
  requireValue(normalizedTeamCode && (session.leagueState.userControlledTeamCodes ?? []).map(userCode).includes(normalizedTeamCode),
    'Checkpoint saves require a team controlled by this session.');
  const sourceReceipt = clone(session.sourceReceipt), modelReceipt = clone(session.modelReceipt);
  const storageKey = franchiseBrowserStorageKey(sourceReceipt, normalizedTeamCode);
  const previousKey = previousKeyFor(storageKey);
  const { serializedSession, bytes } = sessionJson(session, store.maxSerializedBytes);
  const sha = await sha256(serializedSession, store.cryptoProvider);
  const savedAt = now();
  requireValue(savedAt instanceof Date && Number.isFinite(savedAt.getTime()), 'Checkpoint time must be a valid Date.');
  const record = { format: FRANCHISE_BROWSER_CHECKPOINT_FORMAT, schemaVersion: 1, storageKey,
    userTeamCode: normalizedTeamCode, sessionRevision: session.revision, savedAt: savedAt.toISOString(),
    sha256: sha, sourceReceipt, modelReceipt, serializedSession };

  const existing = await readKeys(store.db, [storageKey, previousKey]);
  const oldCurrent = existing.get(storageKey) ?? null;
  let oldCurrentValid = false;
  if (oldCurrent) {
    try {
      await verifyRecord(oldCurrent, { storageKey, normalizedTeamCode, cryptoProvider: store.cryptoProvider,
        maxBytes: store.maxSerializedBytes });
      oldCurrentValid = true;
    } catch { /* A damaged or mismatched current record is never promoted to the previous slot. */ }
  }
  const writeResult = await writeCheckpointAtomic(store, { currentKey: storageKey, previousKey,
    oldCurrent, oldCurrentValid, record });
  return { status: 'checkpoint-saved', storageKey, sessionRevision: session.revision, sha256: sha,
    characters: serializedSession.length, bytes, previousCheckpointSaved: writeResult.previousCheckpointSaved };
}

/** Restore the newest checkpoint that passes hash, session, source and model validation. */
export async function loadFranchiseBrowserCheckpoint(store, { sourceReceipt, userTeamCode,
  expectedModelReceipt } = {}) {
  ensureOpen(store);
  requireValue(plain(sourceReceipt), 'Checkpoint load requires the current source receipt.');
  requireValue(plain(expectedModelReceipt), 'Checkpoint load requires the expected game-model receipt.');
  const normalizedTeamCode = userCode(userTeamCode);
  requireValue(normalizedTeamCode, 'Checkpoint load requires a user-controlled team code.');
  const storageKey = franchiseBrowserStorageKey(sourceReceipt, normalizedTeamCode);
  const previousKey = previousKeyFor(storageKey);
  const records = await readKeys(store.db, [storageKey, previousKey]);
  const failures = [];
  for (const [key, checkpoint] of [[storageKey, 'current'], [previousKey, 'previous']]) {
    const record = records.get(key);
    if (!record) continue;
    try {
      const verified = await verifyRecord(record, { storageKey, normalizedTeamCode,
        cryptoProvider: store.cryptoProvider, maxBytes: store.maxSerializedBytes,
        expectedSourceReceipt: sourceReceipt, expectedModelReceipt });
      return { status: checkpoint === 'current' ? 'restored-current-checkpoint' : 'restored-previous-checkpoint',
        session: verified.session, checkpoint: { storageKey, revision: record.sessionRevision,
          savedAt: record.savedAt, sha256: record.sha256, bytes: verified.bytes } };
    } catch (error) { failures.push(`${checkpoint}: ${error.message}`); }
  }
  if (!records.get(storageKey) && !records.get(previousKey)) throw new Error('No franchise checkpoint exists for this source/team namespace.');
  throw new Error(`No compatible verified franchise checkpoint could be restored. ${failures.join(' | ')}`);
}

export function closeFranchiseBrowserStore(store) {
  if (store?.format !== FRANCHISE_BROWSER_STORE_FORMAT || store.closed) return;
  store.closed = true;
  store.db.close();
}
