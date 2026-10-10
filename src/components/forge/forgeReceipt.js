import { SKILLS, RATING_MODEL } from './bapSkills.js';
import { TEAM_SLOTS } from './forgeSimulation.js';
import { normalizeForgeAppearance } from './forgeWardrobeRules.js';

const MODES = ['wheel', 'pick', 'team', 'teamPick'];
const validEdition = value => ['association', 'icon', 'statement'].includes(value) ? value : 'icon';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const LEGACY_MODEL = 'djhc-forge-observed-skills-v2';
const encode = value => btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)), byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0))));
export function forgeBuildKeys(mode) { return mode === 'team' || mode === 'teamPick' ? TEAM_SLOTS.map(s => s.key) : SKILLS.map(s => s.key); }
export function completeForgeBuild(build) { return Boolean(build && forgeBuildKeys(build.mode).every(key => build.picks[key])); }
export function decodeForgeBuild(search) {
  try {
    const raw = new URLSearchParams(search).get('build');
    if (!raw || raw.length > 16000) return null;
    const b = decode(raw);
    if (![1, 2].includes(b.v) || !MODES.includes(b.m) || !object(b.p)) return null;
    const currentKeys = forgeBuildKeys(b.m), teamMode = b.m.startsWith('team');
    const keys = !teamMode && (b.v === 1 || b.r === LEGACY_MODEL) ? [...currentKeys, 'steals', 'offensiveRebound'] : currentKeys;
    const entries = Object.entries(b.p);
    if (!entries.length || entries.length > keys.length) return null;
    const picks = {};
    for (const [key, value] of entries) {
      if (!keys.includes(key) || !Array.isArray(value) || value.length < 1 || value.length > 2 || typeof value[0] !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value[0]) || value.length === 2 && (!Number.isFinite(value[1]) || value[1] < 25 || value[1] > 99)) return null;
      picks[key] = { playerRef: value[0], value: value.length > 1 ? value[1] : null };
    }
    if (teamMode && new Set(entries.map(([, v]) => v[0])).size !== entries.length) return null;
    if (b.v === 2 && (!Number.isInteger(b.y) || b.y < 2017 || b.y > 2025 || typeof b.r !== 'string' || typeof b.a !== 'string' || b.a.length > 160 || !Number.isInteger(b.s) || b.s < 0 || b.s > 4294967295)) return null;
    const minutes = object(b.n) && TEAM_SLOTS.every(s => Number.isInteger(b.n[s.key]) && b.n[s.key] >= 0 && b.n[s.key] <= 48) && Object.values(b.n).reduce((s, n) => s + n, 0) === 240 ? b.n : null;
    const rawAppearance = object(b.c) ? b.c : {};
    const appearance = normalizeForgeAppearance(rawAppearance);
    return { version: b.v, mode: b.m, picks, editions: { jersey: validEdition(b.e?.jersey), shorts: validEdition(b.e?.shorts) }, year: b.y ?? null, packageVersion: b.a ?? null, ratingModel: b.r ?? null, seed: b.s ?? 41, hostCode: /^[A-Z]{3}$/.test(b.h || '') ? b.h : null, minutes, appearance, sampling: b.q === 'team' ? 'team' : 'player', repeatDonors: b.x !== false, group: ['All', 'Guard', 'Big'].includes(b.g) ? b.g : 'All', repeats: [1, 12, 32].includes(b.t) ? b.t : 12 };
  } catch { return null; }
}
export function initialForgeDraftMode(search, supportedModes = ['wheel']) {
  const mode = decodeForgeBuild(search)?.mode;
  return supportedModes.includes(mode) ? mode : supportedModes[0] || 'wheel';
}
export function forgeBuildQuery(payload) {
  const value = { v: payload.year ? 2 : 1, m: payload.mode, p: payload.picks, e: payload.editions };
  if (value.v === 2) Object.assign(value, { y: Number(payload.year), a: payload.packageVersion || '', r: RATING_MODEL, s: (payload.seed ?? 41) >>> 0, h: payload.hostCode, n: payload.minutes, c: normalizeForgeAppearance(payload.appearance), q: payload.sampling, x: payload.repeatDonors, g: payload.group, t: payload.repeats });
  return new URLSearchParams({ build: encode(value) }).toString();
}
export function restoreForgePicks(build, pool, source) {
  if (!build) return { picks: {}, warning: '' };
  const year = Number(source.entry?.scope?.seasonStartYears?.[0]);
  if (build.version === 2 && (build.year !== year || build.packageVersion !== source.entry?.packageVersion || ![RATING_MODEL, LEGACY_MODEL].includes(build.ratingModel))) return { picks: {}, warning: 'This build uses a different season package or rating version. Choose its season or draft a new build.' };
  const upgraded = build.ratingModel === LEGACY_MODEL || 'offensiveRebound' in build.picks || 'steals' in build.picks;
  const byRef = new Map(pool.map(p => [p.playerRef, p])), picks = {};
  for (const [oldKey, saved] of Object.entries(build.picks)) {
    if (oldKey === 'offensiveRebound') continue;
    const key = oldKey === 'steals' ? 'perimeterDefense' : oldKey;
    const player = byRef.get(saved.playerRef);
    if (player && (build.mode.startsWith('team') || Number.isFinite(player[key]))) picks[key] = build.mode.startsWith('team') ? { player } : { player, value: player[key] };
  }
  return { picks, warning: upgraded ? 'Build updated to the new ratings: available donors are restored and recalculated. Offensive Rebounding is retired; finish Clutch, Body and any unresolved slots.' : Object.keys(picks).length !== Object.keys(build.picks).length ? 'Some shared players are unavailable in this season. Resolved picks have been restored; finish the remaining slots.' : build.version === 1 ? 'Legacy link: ratings have been recalculated using the selected season and current rating model.' : '' };
}
export function updateForgeBuildUrl(query) {
  const url = new URL(window.location.href); url.searchParams.delete('build');
  if (query) url.searchParams.set('build', new URLSearchParams(query).get('build'));
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
