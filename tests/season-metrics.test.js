import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProbability, hasMetric } from '../src/lib/season/seasonMetrics.js';

test('missing and non-scalar metrics stay unavailable', () => {
  for (const value of [null, undefined, '', '   ', true, false, [], [0], {}, { value: 0 }, NaN, Infinity]) {
    assert.equal(hasMetric(value), false, `expected ${String(value)} to be unavailable`);
    assert.equal(formatProbability(value), '—', `expected ${String(value)} to format as unavailable`);
  }
});

test('numeric zero is a valid probability', () => {
  assert.equal(hasMetric(0), true);
  assert.equal(hasMetric('0'), true);
  assert.equal(formatProbability(0), '0%');
  assert.equal(formatProbability('0'), '0%');
  assert.equal(formatProbability(0.25), '25%');
});
