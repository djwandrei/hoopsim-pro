// Native React controller for the Spin Room draft show. Replaces the legacy
// DOM controller (createSpinRoom) with identical behavior: seeded pool build,
// no-replacement draws, dirty-flag rebuild gating and verifiable hashes. The
// seeded-pool engine itself (buildSeededPool / spinSeededPool) is untouched —
// same canonical ordering, hashing and weighted-draw rules.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import siteSpinContext, { SPIN_METRICS } from '@/components/spin/siteSpinContext';
import { buildSeededPool, spinSeededPool } from '@/components/spin/engine/seededPool';
import { stableHash } from '@/components/spin/engine/scenarioContract';

const SPIN_LIMIT = 1000;
const SPIN_ANIMATION_MS = 700;
const DEFAULT_SETTINGS = Object.freeze({ roleValue: 'all', teams: [], positions: [], positionMode: 'include', weight: 'uniform', statRules: [], minGames: '', minMinutes: '' });

const clean = value => String(value ?? '').trim();

// The draw seed is always system-generated — never user-supplied — so every
// fresh pool is a new, unrepeatable-by-input draw session.
const randomSeed = () => `spin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function stableKey(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const raw = entry.playerRef ?? entry.id ?? entry.key ?? entry.playerSeasonRef ?? entry.playerId;
  if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim().toLowerCase();
  const name = entry.player || entry.playerName || entry.displayName;
  const season = entry.seasonStartYear ?? entry.season;
  const team = entry.team || entry.teamCode;
  return name && season != null && team ? `${String(name).trim()}|${season}|${String(team).trim()}`.toLowerCase() : '';
}

function filterRuleFrom(settings) {
  const rule = {};
  // Positions: 'include' → the eligibility engine requires a match; 'exclude'
  // → the caller pre-drops matching entries (see runRebuild).
  if (settings.positionMode !== 'exclude' && Array.isArray(settings.positions) && settings.positions.length) rule.positions = [...settings.positions];
  // Stat filters: every rule must pass (metric floor, cap, or both).
  const statRules = (Array.isArray(settings.statRules) ? settings.statRules : [])
    .filter(statRule => statRule.metric)
    .map(statRule => ({
      key: statRule.metric,
      minimum: clean(statRule.min) === '' ? null : Number(statRule.min),
      maximum: clean(statRule.max) === '' ? null : Number(statRule.max),
    }))
    .filter(statRule => statRule.minimum !== null || statRule.maximum !== null);
  if (statRules.length) rule.minMetrics = statRules;
  if (clean(settings.minGames) !== '') rule.minGames = Number(settings.minGames);
  if (clean(settings.minMinutes) !== '') rule.minMinutes = Number(settings.minMinutes);
  return rule;
}

export default function useSpinDraw({ source, year, excluded, onSelection }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pool, setPool] = useState(null);
  const [history, setHistory] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef(null);

  const context = useMemo(() => {
    try { return siteSpinContext(source, year); } catch (error) { return { error: error?.message || 'The spin context is unavailable.' }; }
  }, [source, year]);

  const stateRef = useRef({});
  stateRef.current = { settings, pool, history, dirty, context, source, excluded, onSelection };

  const runRebuild = useCallback(() => {
    const { settings: s, context: ctx, onSelection: select } = stateRef.current;
    if (ctx.error) { setPool({ status: 'unavailable', reason: ctx.error }); setHistory([]); setDirty(false); select(null); return; }
    const effectiveSeed = randomSeed();
    const role = ctx.options.find(option => option.value === s.roleValue) || ctx.options[0];
    const wantedTeams = Array.isArray(s.teams) ? s.teams : [];
    const wantedPositions = s.positionMode === 'exclude' && Array.isArray(s.positions) ? s.positions : [];
    const scopedEntries = ctx.entries
      .filter(entry => !wantedTeams.length || wantedTeams.some(team => (entry.teamCodes || []).includes(team) || entry.teamCode === team))
      .filter(entry => !wantedPositions.length || !entry.positions.some(position => wantedPositions.includes(position)));
    let result;
    try {
      result = buildSeededPool({ entries: scopedEntries, packageRef: ctx.packageRef, seed: effectiveSeed, eligibility: { ...role.eligibility, ...filterRuleFrom(s) }, uniquePlayerKey: 'playerRef' });
    } catch (error) {
      result = { status: 'unavailable', reason: error?.message || 'The eligible pool could not be built.' };
    }
    if (result?.status !== 'ready' || !Array.isArray(result.entries) || !result.entries.length) {
      result = { status: 'unavailable', reason: result?.reason || 'The selected role has no eligible players in this package.' };
    }
    setPool(result); setHistory([]); setDirty(false); select(null);
  }, []);

  // The pool rebuilds on source, season or exclusion changes with the saved
  // control-desk settings; every previous pick is cleared (the exclusions
  // hash in the receipt covers the list). Settings changes only mark the
  // pool dirty — the rebuild button applies them.
  const excludedKey = useMemo(() => [...excluded].sort().join('|'), [excluded]);
  useEffect(() => {
    runRebuild();
    return () => { clearTimeout(timerRef.current); };
  }, [source, year, excludedKey, runRebuild]);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    setDirty(true);
    setPool({ status: 'dirty' });
    stateRef.current.onSelection(null);
  }, []);

  const changeSettings = useCallback(updates => {
    setSettings(current => ({ ...current, ...updates }));
    setDirty(true);
    setPool({ status: 'dirty' });
    stateRef.current.onSelection(null);
  }, []);

  const spin = useCallback(() => {
    const { settings: s, pool: currentPool, history: currentHistory, dirty: isDirty, source: src, excluded: excl, onSelection: select } = stateRef.current;
    if (isDirty || currentPool?.status !== 'ready') return null;
    const selectedKeys = new Set(currentHistory.map(item => stableKey(item.entry)));
    const remainingEntries = currentPool.entries.filter(entry => !selectedKeys.has(stableKey(entry)));
    if (!remainingEntries.length || currentHistory.length >= SPIN_LIMIT) return null;
    setSpinning(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSpinning(false), SPIN_ANIMATION_MS);
    let result = null, spinPool = null;
    try {
      const remainingPool = buildSeededPool({ entries: remainingEntries, packageRef: currentPool.packageRef, seed: currentPool.seed, eligibility: currentPool.eligibility, uniquePlayerKey: currentPool.uniquePlayerKey });
      if (remainingPool?.status !== 'ready') return remainingPool;
      spinPool = remainingPool;
      result = spinSeededPool(remainingPool, { count: 1, withoutReplacement: true, spinIndex: currentHistory.length, weightField: s.weight === 'uniform' ? null : s.weight });
    } catch (error) {
      result = { status: 'unavailable', reason: error?.message || 'The next seeded draw failed.' };
    }
    const entry = result?.selected?.[0];
    if (result?.status !== 'ready' || !entry) return result;
    const spinNumber = currentHistory.length + 1;
    setHistory(current => [...current, { entry, spin: result }]);
    const image = src?.playerSeasons?.find(player => player.playerRef === entry.playerRef)?.headshotPath;
    select({
      entry, spin: result, pool: currentPool, spinPool, spinNumber,
      displayPlayer: { ...entry, name: entry.displayName, headshotPath: image },
      excludedPlayerRefs: [...excl].sort(), exclusionsHash: stableHash([...excl].sort()),
    });
    return result;
  }, []);

  const teamOptions = useMemo(() => [...new Set((context.error ? [] : context.entries).flatMap(entry => entry.teamCodes || []))].sort(), [context]);

  return {
    settings, changeSettings, resetSettings, rebuild: runRebuild, spin,
    pool, history, dirty, spinning,
    roleOptions: context.error ? [] : context.options,
    teamOptions,
    metricOptions: SPIN_METRICS,
    contextSeed: context.error ? '' : context.seed,
    packageRef: context.error ? null : context.packageRef,
  };
}