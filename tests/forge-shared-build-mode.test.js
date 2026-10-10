import assert from 'node:assert/strict';
import test from 'node:test';
import { forgeBuildQuery, initialForgeDraftMode } from '../src/components/forge/forgeReceipt.js';

const supportedModes = ['wheel', 'pick', 'team', 'teamPick'];
const buildLink = mode => forgeBuildQuery({ mode, picks: { [mode.startsWith('team') ? 'PG' : 'scoring']: ['p_0123456789abcdef0123456789abcdef', 77] } });

test('restores every supported shared Forge mode from the build query', () => {
  for (const mode of supportedModes) {
    assert.equal(initialForgeDraftMode(`?${buildLink(mode)}`, supportedModes), mode);
  }
});

test('falls back to Wheel Draft for missing, malformed, or unsupported build modes', () => {
  assert.equal(initialForgeDraftMode('', supportedModes), 'wheel');
  assert.equal(initialForgeDraftMode('?build=not-base64-json', supportedModes), 'wheel');
  assert.equal(initialForgeDraftMode(`?${buildLink('unknown')}`, supportedModes), 'wheel');
});
