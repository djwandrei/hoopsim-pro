import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ordinalText,
  canRenderScatterReferenceArea,
  metricsAvailableInRows,
  resolveMetricSelection,
  resolveScatterSelection,
} from '../src/components/players/leagueAtlas.js';

test('percentile labels use English ordinal suffixes, including teen exceptions', () => {
  const values = [0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 93, 97, 100];
  assert.deepEqual(values.map(ordinalText), [
    '0th', '1st', '2nd', '3rd', '4th', '11th', '12th', '13th',
    '21st', '22nd', '23rd', '93rd', '97th', '100th',
  ]);
});

test('scatter median shading requires both plotted metric domains', () => {
  assert.equal(canRenderScatterReferenceArea(24, 0.56, undefined, undefined), false);
  assert.equal(canRenderScatterReferenceArea(24, 0.56, [0, 40], undefined), false);
  assert.equal(canRenderScatterReferenceArea(24, 0.56, [0, 40], [0.2, 0.9]), true);
  assert.equal(canRenderScatterReferenceArea(null, 0.56, [0, 40], [0.2, 0.9]), false);
});

test('Atlas metric menus follow scoped values and keep supported selections', () => {
  const choices = [['pts','PPG'],['ast','APG'],['mpg','MPG'],['pts36','PTS/36']];
  const careerRows = [
    { stats:{ pts:24,ast:6,mpg:34,gp:70 } },
    { stats:{ pts:18,ast:4,mpg:31,gp:55 } },
  ];
  const available = metricsAvailableInRows(careerRows,choices);
  assert.deepEqual(available, choices.slice(0,3));
  assert.equal(available.some(([key]) => key === 'pts36'), false);
  assert.equal(resolveMetricSelection('mpg',available), 'mpg');
  assert.equal(resolveMetricSelection('pts36',available), 'pts');
  assert.deepEqual(resolveScatterSelection('pts','pts36',available), { xKey:'pts',yKey:'ast' });
  assert.deepEqual(resolveScatterSelection('ast','pts',available), { xKey:'ast',yKey:'pts' });
});

test('Atlas metric menus stay empty without scope rows and retain state for the next scope', () => {
  const choices = [['pts','PPG'],['ast','APG']];
  const available = metricsAvailableInRows([],choices);
  assert.deepEqual(available, []);
  assert.equal(resolveMetricSelection('ast',available), 'ast');
  assert.deepEqual(resolveScatterSelection('ast','pts36',available), { xKey:'ast',yKey:'pts36' });
});
