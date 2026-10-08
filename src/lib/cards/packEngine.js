// Virtual Pack v2: packs of real-world cards from the curated PackCard pool.
// The draw runs server-side (crypto randomness, tier weights); this module
// only calls it and keeps the pack history in this browser.
import { base44 } from '@/api/base44Client';
import { safeStorage } from '@/lib/safeStorage';

export const PACK_ENGINE = 'server-crypto-weighted-tier-v2';
export const PACK_SIZE = 5;
export const PACK_HISTORY_KEY = 'djhc:virtual-pack:v2';
export const MAX_PACK_HISTORY = 12;

export const TIER_META = {
  base: { label: 'Base', chip: 'border-border/50 bg-raised/40 text-muted-foreground' },
  uncommon: { label: 'Uncommon', chip: 'border-royal/50 bg-royal/10 text-royal' },
  rare: { label: 'Rare', chip: 'border-gold/50 bg-gold/10 text-gold' },
  super_rare: { label: 'Super Rare', chip: 'border-trim/60 bg-trim/10 text-trim-ink' },
  legendary: { label: 'Legendary', chip: 'border-positive/60 bg-positive/10 text-positive' },
};

export const TIER_ODDS = [
  ['base', 68],
  ['uncommon', 20],
  ['rare', 9],
  ['super_rare', 2.5],
  ['legendary', 0.5],
];

export function readPackHistory() {
  try {
    const parsed = JSON.parse(safeStorage()?.getItem(PACK_HISTORY_KEY) || '');
    if (!parsed || parsed.engine !== PACK_ENGINE || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.slice(0, MAX_PACK_HISTORY);
  } catch {
    return [];
  }
}

export function prependPackHistory(entry) {
  const current = readPackHistory();
  const next = [entry, ...current].slice(0, MAX_PACK_HISTORY);
  try { safeStorage()?.setItem(PACK_HISTORY_KEY, JSON.stringify({ engine: PACK_ENGINE, entries: next })); } catch { /* keep memory-only */ }
  return next;
}

export function clearPackHistory() {
  try { safeStorage()?.removeItem(PACK_HISTORY_KEY); } catch { /* ignore */ }
  return [];
}

export async function openPack(packSize = PACK_SIZE) {
  const { data } = await base44.functions.invoke('virtualPackDraw', { packSize });
  if (data?.error) throw new Error(data.error);
  return data;
}

export function formatCardValue(valueCents) {
  if (!Number.isFinite(Number(valueCents)) || Number(valueCents) <= 0) return null;
  return `$${(Number(valueCents) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}