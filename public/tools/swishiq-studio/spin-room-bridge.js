import {
  SWISHIQ_PUBLIC_REGISTRY_PATH,
  loadSwishIqPublishedPackageProof,
  loadSwishIqPublicPart,
} from '../swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1';
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
} from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { buildSeededPool, spinSeededPool } from './engine/seeded-pool.js?v=20260920c&rev=swishiq-engine-v1';
import { ROLE_TAXONOMY, normalizePositions } from './engine/role-taxonomy.js?v=20260920c&rev=swishiq-engine-v1';
import { createSpinRoom } from './spin-room.js?v=20260930g&rev=spin-room-studio-exclusions-v2-player-ref-default-20260930g';

const STYLESHEET_ID = 'swishiq-spin-room-stylesheet';
const STYLESHEET_URL = new URL('./spin-room.css?v=20260930f&rev=spin-room-studio-layout-v1-20260930f', import.meta.url).href;
const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const PACKAGE_ID = /^nba-swishiq-v3-(\d{4})-(\d{2})$/;
const PACKAGE_VERSION = /^v3-(\d{4})-(\d{2})-([a-f0-9]{12})$/;
const BROAD_POSITION_FAMILIES = Object.freeze(['guard', 'wing', 'forward', 'big', 'center']);

function validText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function parseSpinRoomSelection(value) {
  const parts = String(value || '').split('|');
  if (parts.length !== 3 || parts.some(part => !part)) return null;
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status === 'reviewed') {
    const expected = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.expectedIdentity?.packages?.find(row => (
      row?.packageId === parts[0]
      && row?.packageVersion === parts[1]
      && row?.scope?.kind === 'exact-season'
      && row.scope.seasonStartYears?.length === 1
      && row.scope.phases?.includes('regular')
    ));
    const seasonStartYear = Number(expected?.scope?.seasonStartYears?.[0]);
    const expectedId = Number.isInteger(seasonStartYear)
      ? `nba-swishiq-v4-${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}`
      : '';
    if (parts[2] !== 'regular' || !expected || parts[0] !== expectedId
      || !/^v4-canonical-\d{8}-[a-f0-9]{12}$/.test(parts[1])) return null;
    return { packageId: parts[0], packageVersion: parts[1], phase: 'regular', seasonStartYear };
  }
  const [, startYearText, endYearShort] = PACKAGE_ID.exec(parts[0]) || [];
  const [, versionStartText, versionEndShort] = PACKAGE_VERSION.exec(parts[1]) || [];
  if (parts[2] !== 'regular' || !startYearText || !versionStartText) return null;
  const startYear = Number(startYearText);
  const endYear = startYear + 1;
  if (endYearShort !== String(endYear).slice(-2)
    || Number(versionStartText) !== startYear
    || versionEndShort !== endYearShort) return null;
  return { packageId: parts[0], packageVersion: parts[1], phase: 'regular', seasonStartYear: startYear };
}

function exactRegularProofRef(proof, selected) {
  const scope = proof?.package?.scope;
  if (!proof?.index || proof.request?.packageId !== selected.packageId
    || proof.request?.packageVersion !== selected.packageVersion
    || proof.package?.packageId !== selected.packageId
    || proof.package?.packageVersion !== selected.packageVersion
    || scope?.kind !== 'exact-season'
    || Number(scope.seasonStartYear) !== selected.seasonStartYear
    || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1
    || Number(scope.seasonStartYears[0]) !== selected.seasonStartYear
    || !Array.isArray(scope.phases)
    || !scope.phases.includes('regular')
    || proof.index.packageId !== selected.packageId
    || proof.index.packageVersion !== selected.packageVersion) {
    throw new Error('Spin Room needs a verified exact regular-season package. No other season or pooled data was used.');
  }
  return Object.freeze({
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    packageManifestSha256: proof.package.packageManifestSha256,
    sourceLockSha256: proof.package.sourceLockSha256,
    registryVersion: proof.registry?.registryVersion,
    registryRevisionSha256: proof.registry?.registryRevisionSha256,
    scope: Object.freeze({
      kind: 'exact-season',
      seasonStartYears: Object.freeze([selected.seasonStartYear]),
      phases: Object.freeze(['regular']),
    }),
  });
}

function normalizedName(value) {
  return validText(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

export function buildSpinRoomEntries({ profileRecords, seasonRecords, proof, selected } = {}) {
  if (!Array.isArray(profileRecords) || !Array.isArray(seasonRecords)) {
    throw new Error('The verified player and player-season artifacts are required.');
  }
  const packageRef = exactRegularProofRef(proof, selected);
  const profiles = new Map();
  for (const row of profileRecords) {
    if (!row || typeof row !== 'object' || !PLAYER_REF.test(String(row.playerRef || ''))) continue;
    const displayName = validText(row.displayName);
    const positions = normalizePositions(row.positions);
    if (!displayName || !positions.length) continue;
    if (profiles.has(row.playerRef)) throw new Error('The verified players artifact repeats a stable player reference.');
    profiles.set(row.playerRef, { displayName, positions });
  }

  const entriesByRef = new Map();
  for (const row of seasonRecords) {
    if (Number(row?.seasonStartYear) !== selected.seasonStartYear || row?.phase !== 'regular') continue;
    if (row.observed !== true || !Number.isFinite(Number(row.games)) || Number(row.games) <= 0) continue;
    if (!PLAYER_REF.test(String(row.playerRef || '')) || !/^[A-Z]{2,3}$/.test(String(row.teamCode || ''))) {
      throw new Error('A verified regular-season row has no valid player or team identity.');
    }
    const profile = profiles.get(row.playerRef);
    const displayName = validText(row.displayName);
    const positions = normalizePositions(row.positions);
    if (!profile || !displayName || normalizedName(displayName) !== normalizedName(profile.displayName) || !positions.length) {
      throw new Error('A verified player-season row does not join cleanly to its stable player profile.');
    }
    const existing = entriesByRef.get(row.playerRef);
    if (existing && (normalizedName(existing.displayName) !== normalizedName(displayName)
      || existing.positions.join('|') !== [...positions].sort().join('|'))) {
      throw new Error('A player has conflicting identity or position rows in this season package.');
    }
    const teamCodes = new Set(existing?.teamCodes || []);
    teamCodes.add(row.teamCode);
    const sortedTeams = [...teamCodes].sort();
    entriesByRef.set(row.playerRef, {
      ...(existing || {}),
      playerRef: row.playerRef,
      displayName: profile.displayName,
      player: profile.displayName,
      positions: [...positions].sort(),
      seasonStartYear: selected.seasonStartYear,
      phase: 'regular',
      observed: true,
      games: Math.max(Number(existing?.games) || 0, Number(row.games)),
      teamCodes: sortedTeams,
      teamCode: sortedTeams.join('/'),
      packageId: packageRef.packageId,
      packageVersion: packageRef.packageVersion,
      packageManifestSha256: packageRef.packageManifestSha256,
      sourceLockSha256: packageRef.sourceLockSha256,
    });
  }
  return Object.freeze({
    packageRef,
    entries: Object.freeze([...entriesByRef.values()].sort((left, right) => left.playerRef.localeCompare(right.playerRef))),
  });
}

/** Build a descriptive Spin Room pool from one verified V4 franchise scope. */
export function buildCanonicalV4SpinRoomEntries(data, selected) {
  const year = selected?.seasonStartYear;
  const scope = data?.scope;
  const pkg = data?.package;
  const playersPart = data?.parts?.['player-seasons'];
  const rosterPart = data?.parts?.['roster-memberships'];
  const fail = message => { throw new Error(message); };
  if (data?.status !== 'verified-data-access' || data?.capabilityId !== 'franchiseInputs'
    || !data?.supplementalArtifactIds?.includes('player-seasons')
    || pkg?.packageId !== selected?.packageId || pkg?.packageVersion !== selected?.packageVersion
    || scope?.kind !== 'exact-season' || scope?.seasonStartYears?.length !== 1
    || scope.seasonStartYears[0] !== year || scope.phases?.length !== 1 || scope.phases[0] !== 'regular') {
    fail('Spin Room requires one verified exact V4 regular-season franchise package with its player-season supplement.');
  }
  const partMatches = (part, artifactId) => part?.format === 'djhc-swishiq-v4-verified-public-part-v1'
    && part.status === 'verified' && part.artifactId === artifactId
    && part.package?.packageId === pkg?.packageId
    && part.package?.packageVersion === pkg?.packageVersion
    && part.package?.packageManifestSha256 === pkg?.packageManifestSha256
    && part.package?.sourceLockSha256 === pkg?.sourceLockSha256
    && part.scope?.kind === 'exact-season'
    && part.scope?.seasonStartYears?.length === 1 && part.scope.seasonStartYears[0] === year
    && Array.isArray(part.scope?.phases) && part.scope.phases.includes('regular')
    && Array.isArray(part.records);
  if (!partMatches(playersPart, 'player-seasons') || !partMatches(rosterPart, 'roster-memberships')) {
    fail('Spin Room player and roster artifacts do not match the same exact V4 package and scope.');
  }
  const packageRef = Object.freeze({
    sourceGeneration: 'V4',
    releaseId: data.source?.releaseId,
    packageId: pkg.packageId,
    packageVersion: pkg.packageVersion,
    packageManifestSha256: pkg.packageManifestSha256,
    sourceLockSha256: pkg.sourceLockSha256,
    projectionContentSha256: pkg.projectionContentSha256,
    registrySha256: data.source?.registrySha256,
    registryRevisionSha256: data.source?.registryRevisionSha256,
    reviewReceiptSha256: data.source?.reviewReceiptSha256,
    authorizationReferenceSha256: data.source?.authorizationReferenceSha256,
    indexSha256: data.source?.indexSha256,
    capabilityMapSha256: data.source?.capabilityMapSha256,
    capabilityId: data.capabilityId,
    scope: Object.freeze({ kind: 'exact-season', seasonStartYears: Object.freeze([year]), phases: Object.freeze(['regular']) }),
  });
  const identity = record => {
    const values = record?.values || {};
    return {
      playerRef: record?.entities?.playerRef || values.playerRef || null,
      teamCode: record?.entities?.teamCode || values.teamCode || null,
      seasonStartYear: record?.time?.seasonStartYear,
      phase: record?.time?.phase,
      displayName: validText(values.displayName),
      positions: normalizePositions(values.positions),
      displayEligible: values.displayEligible,
    };
  };
  const rosterByKey = new Map();
  for (const record of rosterPart.records) {
    if (record?.time?.seasonStartYear !== year || record?.time?.phase !== 'regular') continue;
    const values = record?.values || {};
    if (values.displayEligible === false) continue;
    if (values.displayEligible !== true) fail('A V4 roster row has no explicit display-eligibility decision.');
    const row = identity(record);
    if (record?.evidence?.status !== 'available'
      || !PLAYER_REF.test(String(row.playerRef || '')) || !/^[A-Z]{2,3}$/.test(String(row.teamCode || ''))
      || !row.displayName || !row.positions.length) fail('A V4 roster row has incomplete identity or source positions.');
    const key = `${row.playerRef}|${row.teamCode}|${year}|regular`;
    if (rosterByKey.has(key)) fail('The V4 roster artifact repeats a player/team/season/phase identity.');
    rosterByKey.set(key, row);
  }
  const entriesByRef = new Map();
  const nameSeasonTeamPhase = new Map();
  for (const record of playersPart.records) {
    if (record?.time?.seasonStartYear !== year || record?.time?.phase !== 'regular') continue;
    const values = record?.values || {};
    if (record?.evidence?.status !== 'available' || values.observed !== true
      || !Number.isFinite(Number(values.games)) || Number(values.games) <= 0) continue;
    const row = identity(record);
    if (!PLAYER_REF.test(String(row.playerRef || '')) || !/^[A-Z]{2,3}$/.test(String(row.teamCode || ''))
      || !row.displayName || !row.positions.length) fail('An observed V4 player-season row has incomplete identity or source positions.');
    const key = `${row.playerRef}|${row.teamCode}|${year}|regular`;
    const roster = rosterByKey.get(key);
    if (!roster || normalizedName(roster.displayName) !== normalizedName(row.displayName)
      || roster.positions.join('|') !== [...row.positions].sort().join('|')) {
      fail('A V4 player-season row does not match its same-package roster position and name evidence.');
    }
    const nameKey = `${normalizedName(row.displayName)}|${year}|${row.teamCode}|regular`;
    const priorRef = nameSeasonTeamPhase.get(nameKey);
    if (priorRef && priorRef !== row.playerRef) fail('V4 name-season-team-phase identity is ambiguous in Spin Room.');
    nameSeasonTeamPhase.set(nameKey, row.playerRef);
    const existing = entriesByRef.get(row.playerRef);
    if (existing && (normalizedName(existing.displayName) !== normalizedName(row.displayName)
      || existing.positions.join('|') !== [...row.positions].sort().join('|'))) {
      fail('A V4 player identity has conflicting names or positions within the exact season.');
    }
    const teamCodes = new Set(existing?.teamCodes || []);
    teamCodes.add(row.teamCode);
    const sortedTeams = [...teamCodes].sort();
    entriesByRef.set(row.playerRef, {
      ...(existing || {}),
      playerRef: row.playerRef,
      displayName: existing?.displayName || row.displayName,
      player: existing?.displayName || row.displayName,
      positions: [...row.positions].sort(),
      seasonStartYear: year,
      phase: 'regular',
      observed: true,
      games: Math.max(Number(existing?.games) || 0, Number(values.games)),
      teamCodes: sortedTeams,
      teamCode: sortedTeams.join('/'),
      packageId: packageRef.packageId,
      packageVersion: packageRef.packageVersion,
      packageManifestSha256: packageRef.packageManifestSha256,
      sourceLockSha256: packageRef.sourceLockSha256,
    });
  }
  return Object.freeze({
    packageRef,
    entries: Object.freeze([...entriesByRef.values()].sort((left, right) => left.playerRef.localeCompare(right.playerRef))),
  });
}

export function spinRoomRoleOptions(seasonStartYear) {
  return [
    { value: 'all', label: 'All verified players', eligibility: { seasonStartYears: [seasonStartYear], phases: ['regular'], requireObserved: true, minGames: 1 } },
    ...BROAD_POSITION_FAMILIES.map(key => {
      const role = ROLE_TAXONOMY[key];
      return {
        value: key,
        label: `${role.label} · source position`,
        eligibility: { roles: [key], seasonStartYears: [seasonStartYear], phases: ['regular'], requireObserved: true, minGames: 1 },
      };
    }),
  ];
}

function ensureStylesheet(documentRef) {
  const head = documentRef?.head || documentRef?.querySelector?.('head');
  if (!head) return;
  let link = documentRef.getElementById(STYLESHEET_ID);
  if (!link) {
    link = documentRef.createElement('link');
    link.id = STYLESHEET_ID;
    link.rel = 'stylesheet';
    head.append(link);
  }
  if (link.href !== STYLESHEET_URL) link.href = STYLESHEET_URL;
}

function message(documentRef, panel, titleText, copyText, retry) {
  const card = documentRef.createElement('section');
  card.className = 'swishiq-spin-room-host-state';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const title = documentRef.createElement('h3');
  title.textContent = titleText;
  const copy = documentRef.createElement('p');
  copy.textContent = copyText;
  card.append(title, copy);
  if (retry) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.textContent = 'Retry player data';
    button.addEventListener('click', retry, { once: true });
    card.append(button);
  }
  panel.replaceChildren(card);
}

export function startSwishIqSpinRoom({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  registryUrl = SWISHIQ_PUBLIC_REGISTRY_PATH,
} = {}) {
  if (!documentRef) return null;
  const panel = documentRef.getElementById('spinRoomPanel');
  const packageSelect = documentRef.getElementById('packageSelect');
  if (!panel || !packageSelect) return null;
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button[data-workbench]')];
  let active = false;
  let requestToken = 0;
  let requestController = null;
  let room = null;
  let lastLoadedKey = '';

  function destroyRoom() {
    room?.destroy();
    room = null;
    lastLoadedKey = '';
  }

  async function load({ force = false } = {}) {
    if (!active) return null;
    const selected = parseSpinRoomSelection(packageSelect.value);
    const key = selected ? `${selected.packageId}|${selected.packageVersion}|${selected.phase}` : '';
    if (!selected) {
      requestController?.abort();
      requestToken += 1;
      destroyRoom();
      message(documentRef, panel, 'Exact regular-season data required', 'Choose a published exact season in Studio. Spin Room does not accept pooled seasons.');
      return null;
    }
    if (!force && key === lastLoadedKey && room) return room;
    requestController?.abort();
    destroyRoom();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    requestController = controller;
    const token = ++requestToken;
    const guardedFetch = controller && typeof fetchImpl === 'function'
      ? (input, init = {}) => fetchImpl(input, { ...init, signal: controller.signal })
      : fetchImpl;
    message(documentRef, panel, 'Verifying player pool', `Checking ${selected.seasonStartYear}–${selected.seasonStartYear + 1} regular-season package and player rows.`);
    try {
      if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'unconfigured') {
        const data = await loadCanonicalV4StudioExactSeasonData({
          seasonStartYear: selected.seasonStartYear,
          phases: ['regular'],
          capabilityId: 'franchiseInputs',
          additionalArtifactIds: ['player-seasons'],
          fetchImpl: guardedFetch,
        });
        if (token !== requestToken || !active || packageSelect.value !== key) return null;
        const { packageRef, entries } = buildCanonicalV4SpinRoomEntries(data, selected);
        if (!entries.length) throw new Error('No observed players with source positions were published for this exact V4 regular season.');
        const header = documentRef.createElement('section');
        header.className = 'swishiq-spin-room-proof';
        header.setAttribute('aria-label', 'Verified player-pool source');
        const heading = documentRef.createElement('h3');
        heading.textContent = `${selected.seasonStartYear}–${selected.seasonStartYear + 1} · Regular season`;
        const note = documentRef.createElement('p');
        note.textContent = `Verified V4 franchise package ${packageRef.packageId}@${packageRef.packageVersion}. Position-family filters use published season positions; they are not skill ratings.`;
        const root = documentRef.createElement('div');
        root.className = 'swishiq-spin-room-host-root';
        header.append(heading, note);
        panel.replaceChildren(header, root);
        room = createSpinRoom({
          root,
          documentRef,
          entries,
          packageRef,
          seed: `${packageRef.packageVersion}-spin-room`,
          eligibilityOptions: spinRoomRoleOptions(selected.seasonStartYear),
          buildSeededPool,
          spinSeededPool,
          uniquePlayerKey: 'playerRef',
        });
        lastLoadedKey = key;
        return room;
      }
      const proof = await loadSwishIqPublishedPackageProof({
        packageId: selected.packageId,
        packageVersion: selected.packageVersion,
        requiredCapabilities: ['swishiqStudio'],
        registryUrl,
        fetchImpl: guardedFetch,
      });
      const packageRef = exactRegularProofRef(proof, selected);
      const [playersPart, seasonsPart] = await Promise.all([
        loadSwishIqPublicPart(proof, { artifactId: 'players', kind: 'players', capability: 'swishiqStudio', fetchImpl: guardedFetch }),
        loadSwishIqPublicPart(proof, { artifactId: 'player-seasons', kind: 'player-seasons', capability: 'swishiqStudio', fetchImpl: guardedFetch }),
      ]);
      if (token !== requestToken || !active || packageSelect.value !== key) return null;
      const { entries } = buildSpinRoomEntries({
        profileRecords: playersPart.value.records,
        seasonRecords: seasonsPart.value.records,
        proof,
        selected,
      });
      if (!entries.length) throw new Error('No observed players with source positions were published for this exact regular season.');
      const header = documentRef.createElement('section');
      header.className = 'swishiq-spin-room-proof';
      header.setAttribute('aria-label', 'Verified player-pool source');
      const heading = documentRef.createElement('h3');
      heading.textContent = `${selected.seasonStartYear}–${selected.seasonStartYear + 1} · Regular season`;
      const note = documentRef.createElement('p');
      note.textContent = `Verified package ${packageRef.packageId}@${packageRef.packageVersion}. Position-family filters use published season positions; they are not skill ratings.`;
      const root = documentRef.createElement('div');
      root.className = 'swishiq-spin-room-host-root';
      header.append(heading, note);
      panel.replaceChildren(header, root);
      room = createSpinRoom({
        root,
        documentRef,
        entries,
        packageRef,
        seed: `${packageRef.packageVersion}-spin-room`,
        eligibilityOptions: spinRoomRoleOptions(selected.seasonStartYear),
        buildSeededPool,
        spinSeededPool,
        uniquePlayerKey: 'playerRef',
      });
      lastLoadedKey = key;
      return room;
    } catch (error) {
      if (token !== requestToken || !active) return null;
      const detail = error instanceof Error ? error.message : 'Verified player data could not be loaded.';
      message(documentRef, panel, 'Spin Room unavailable', detail, () => { void load({ force: true }); });
      return null;
    } finally {
      if (requestController === controller) requestController = null;
    }
  }

  function setVisibility() {
    const shouldBeActive = documentRef.querySelector('.swishiq-tabs button[data-workbench][aria-pressed="true"]')?.dataset.workbench === 'spin';
    panel.hidden = !shouldBeActive;
    if (shouldBeActive && !active) {
      active = true;
      void load();
    } else if (!shouldBeActive && active) {
      active = false;
      requestToken += 1;
      requestController?.abort();
      destroyRoom();
    }
  }

  const onTabClick = () => queueMicrotask(setVisibility);
  const onPackageChange = () => {
    requestToken += 1;
    requestController?.abort();
    destroyRoom();
    if (active) void load({ force: true });
  };
  tabs.forEach(tab => tab.addEventListener('click', onTabClick));
  packageSelect.addEventListener('change', onPackageChange);
  setVisibility();

  function destroy() {
    active = false;
    requestToken += 1;
    requestController?.abort();
    destroyRoom();
    tabs.forEach(tab => tab.removeEventListener('click', onTabClick));
    packageSelect.removeEventListener('change', onPackageChange);
    panel.hidden = true;
  }

  return Object.freeze({ activate: setVisibility, reload: () => load({ force: true }), destroy, unmount: destroy });
}
