import assert from 'node:assert/strict';
import test from 'node:test';
import { filterExcludedPlayerEntries } from '../src/components/spin/engine/playerExclusions.js';

test('filters excluded stable player references before pool construction', () => {
  const entries = [
    { playerRef: 'p_a1', displayName: 'Player A' },
    { playerRef: 'p_b2', displayName: 'Player B' },
    { playerRef: 'p_c3', displayName: 'Player C' },
  ];

  assert.deepEqual(filterExcludedPlayerEntries(entries, ['p_b2']), [entries[0], entries[2]]);
});

test('keeps only selected references when the include mode excludes the rest', () => {
  const entries = [
    { playerRef: 'p_a1', displayName: 'Player A' },
    { playerRef: 'p_b2', displayName: 'Player B' },
    { playerRef: 'p_c3', displayName: 'Player C' },
  ];

  assert.deepEqual(filterExcludedPlayerEntries(entries, ['p_a1', 'p_c3']), [entries[1]]);
});
