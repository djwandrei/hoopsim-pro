import assert from 'node:assert/strict';
import test from 'node:test';
import { windowlessEnvironment } from './helpers/forge-windowless-env.js';
import atlas from '../src/components/forge/forgeUniformAtlas.js';

const environment = windowlessEnvironment();

test('jersey photo corners blend into fabric while the central artwork remains intact', () => {
  const photo = document.createElement('canvas'); photo.width = 600; photo.height = 900;
  const source = photo.getContext('2d'); source.fillStyle = '#f00040'; source.fillRect(0, 0, 600, 900);
  const texture = atlas('jersey', { primary: '#0030a0', accent: '#ffffff' }, {
    front: photo, back: photo, layout: { front: [0, 0, 600, 900], back: [0, 0, 600, 900] },
  });
  const ctx = texture.getContext('2d');
  const pixel = (x, y) => [...ctx.getImageData(x * 2 + 1, y * 2 + 1, 1, 1).data];
  for (const offset of [0, 512]) {
    const top = offset ? 100 : 170;
    const corner = pixel(offset + 112, top + 40);
    assert.ok(corner[0] < 20 && corner[2] > 120, 'the upper photo corner keeps the base fabric color');
    const center = pixel(offset + 256, top + 150);
    assert.ok(center[0] > 220 && center[1] < 30, 'central wordmark/number art stays visible');
    const edge = pixel(offset + 93, top + 420);
    assert.ok(edge[0] < 25, 'a rectangular outer photo boundary no longer appears');
  }
});

test.after(() => environment.restore());
