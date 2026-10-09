import assert from 'node:assert/strict';
import test from 'node:test';
import { careerSeasonsThroughCutoff } from '../src/components/career/careerCutoffModel.js';

const seasons = [
  { year: 2022, label: '2022–23', games: 40, pts: 18 },
  { year: 2023, label: '2023–24', games: 50, pts: 20 },
  { year: 2024, label: '2024–25', games: 60, pts: 22 },
];

test('career cutoff includes only observed seasons through the selected year', () => {
  const through2023 = careerSeasonsThroughCutoff(seasons, 2023);

  assert.deepEqual(through2023, seasons.slice(0, 2));
  assert.notStrictEqual(through2023, seasons);
  assert.deepEqual(seasons.map(row => row.year), [2022, 2023, 2024]);
});

test('latest and invalid cutoffs retain the full supplied career history', () => {
  assert.deepEqual(careerSeasonsThroughCutoff(seasons, 2024), seasons);
  assert.deepEqual(careerSeasonsThroughCutoff(seasons, null), seasons);
});
