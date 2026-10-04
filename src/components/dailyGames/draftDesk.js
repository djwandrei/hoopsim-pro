import { statNumber } from '@/lib/dailyGames/boardHydration';
import { roleOf } from '@/components/dailyGames/lineupRoles';

// Draft desk analytics: what you have, what you still need, and which
// candidate best fills the gaps. Everything here is a client-side model
// heuristic over the board's public per-game stats — never an evaluator result.

export const DESK_CATEGORIES = [
  { key: 'points', label: 'PPG', name: 'Scoring' },
  { key: 'rebounds', label: 'RPG', name: 'Rebounding' },
  { key: 'assists', label: 'APG', name: 'Playmaking' },
];

export const DESK_ROLES = [
  { role: 'G', label: 'Backcourt creation', detail: 'No guard yet — add a ball-handler' },
  { role: 'F', label: 'Wing production', detail: 'No forward yet — add a wing producer' },
  { role: 'C', label: 'Frontcourt anchor', detail: 'No center yet — protect the glass' },
];

export const pickedRoster = (rounds, picks) =>
  rounds
    .map(round => {
      const ref = picks[round.roundId];
      return ref ? round.candidates.find(candidate => candidate.playerRef === ref) || null : null;
    })
    .filter(Boolean);

export const deskTotals = roster =>
  DESK_CATEGORIES.reduce((totals, cat) => {
    totals[cat.key] = roster.reduce((sum, player) => sum + (statNumber(player, cat.key) || 0), 0);
    return totals;
  }, {});

const median = values => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};

// Gaps in the draft so far: unfilled positions plus stat categories where the
// current picks fall below the board-wide candidate median.
export function deskNeeds(rounds, roster) {
  const pool = rounds.flatMap(round => round.candidates);
  const needs = [];
  const held = new Set(roster.map(roleOf));
  for (const item of DESK_ROLES) {
    if (!held.has(item.role)) needs.push({ kind: 'role', role: item.role, label: item.label, detail: item.detail });
  }
  for (const cat of DESK_CATEGORIES) {
    const bench = median(pool.map(player => statNumber(player, cat.key)));
    const best = roster.reduce((max, player) => Math.max(max, statNumber(player, cat.key) || 0), 0);
    if (bench !== null && best < bench) {
      needs.push({ kind: 'stat', key: cat.key, catLabel: cat.label, label: `Add ${cat.name.toLowerCase()}`, detail: `Best ${cat.label} ${best.toFixed(1)} · board median ${bench.toFixed(1)}` });
    }
  }
  return needs;
}

export function candidateFit(candidate, needs, roster) {
  if (!candidate) return null;
  const reasons = [];
  let score = 0;
  const vs = roster.length ? ' vs your best' : '';
  for (const need of needs) {
    if (need.kind === 'role' && roleOf(candidate) === need.role) {
      score += 2.5;
      reasons.push(`Fills the ${need.role} slot`);
    }
    if (need.kind === 'stat') {
      const value = statNumber(candidate, need.key);
      const currentBest = roster.reduce((max, player) => Math.max(max, statNumber(player, need.key) || 0), 0);
      if (Number.isFinite(value) && value > currentBest + 0.05) {
        score += value - currentBest;
        reasons.push(`+${(value - currentBest).toFixed(1)} ${need.catLabel}${vs}`);
      }
    }
  }
  if (!reasons.length) return null;
  return { candidate, score, reasons };
}

export const bestFitFor = (candidates, needs, roster) =>
  (candidates || [])
    .map(candidate => candidateFit(candidate, needs, roster))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0] || null;