import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Group, OrthographicCamera } from 'three';
import { project, windowlessEnvironment } from './helpers/forge-windowless-env.js';

const { createForgeAnchorProjector } = await import('../src/components/forge/forgeStageConnections.js');
const { FORGE_EQUIPMENT_CALLOUTS } = await import('../src/components/forge/forgeStageMapping.js');
const { loadForgeAthlete } = await import('../src/components/forge/forgeAthleteAssets.js');
const { default: wardrobe } = await import('../src/components/forge/forgeAthleteWardrobe.js');
const { frameReferenceCamera } = await import('../src/components/forge/referenceView.js');
const { loadForgeEvidence } = await import('../src/components/forge/forgeEvidenceLoader.js');
const { FORGE_EVIDENCE_RELEASE } = await import('../src/components/forge/forgeEvidenceRelease.js');

test('all equipment anchors follow the fitted athlete through a full turn at desktop and mobile sizes', async () => {
  const environment = windowlessEnvironment();
  let controller;
  try {
    const { model, fit } = await loadForgeAthlete();
    controller = wardrobe(model);
    const figure = new Group(); figure.add(model);
    for (const item of FORGE_EQUIPMENT_CALLOUTS) assert.ok(model.getObjectByName(item.element), item.element);
    const projectAnchors = createForgeAnchorProjector(model);
    const camera = new OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 60);
    camera.position.set(-8.09, .205, 5.93); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    for (const [width, height] of [[504, 560], [364, 390]]) {
      frameReferenceCamera(camera, width, height, fit);
      const positions = [];
      for (let step = 0; step < 8; step++) {
        figure.rotation.y = step * Math.PI / 4; figure.updateMatrixWorld(true);
        model.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
        const anchors = projectAnchors(camera);
        assert.equal(Object.keys(anchors).length, FORGE_EQUIPMENT_CALLOUTS.length);
        for (const item of FORGE_EQUIPMENT_CALLOUTS) {
          const anchor = anchors[item.skill];
          assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y), item.skill);
          assert.ok(anchor.visible && anchor.x >= 0 && anchor.x <= 1 && anchor.y >= 0 && anchor.y <= 1, `${item.skill} must stay within the fitted camera`);
        }
        positions.push(anchors.finishing.x);
      }
      assert.ok(Math.max(...positions) - Math.min(...positions) > .05, 'Wristband anchor must move with the turning model');
    }
    assert.deepEqual(createForgeAnchorProjector(new Group())(camera), {});
  } finally { controller?.dispose(); environment.restore(); }
});

test('season evidence verifies every release and retries corruption beneath the production asset base', async () => {
  const originalFetch = globalThis.fetch, requests = [];
  const first = FORGE_EVIDENCE_RELEASE[0];
  let corrupt = true;
  globalThis.fetch = async url => {
    const suffix = String(url).replace('/tools/swishiq-studio/', '/');
    const bytes = await readFile(path.join(project, 'public', suffix));
    requests.push(String(url));
    if (corrupt) bytes[0] ^= 1;
    return new Response(bytes);
  };
  try {
    await assert.rejects(loadForgeEvidence(first.year, 'wrong-package'), /do not match/);
    await assert.rejects(loadForgeEvidence(first.year, first.packageVersion), /integrity check/);
    corrupt = false;
    for (const pin of FORGE_EVIDENCE_RELEASE) {
      const doc = await loadForgeEvidence(pin.year, pin.packageVersion);
      assert.equal(doc.year, pin.year);
      assert.equal(doc.packageVersion, pin.packageVersion);
      assert.ok(Object.keys(doc.records).length > 400);
      assert.equal(await loadForgeEvidence(pin.year, pin.packageVersion), doc);
    }
    assert.equal(requests.length, FORGE_EVIDENCE_RELEASE.length + 1);
    assert.ok(requests.every(url => url.startsWith('/tools/swishiq-studio/studio-assets/forge/ratings/')));
  } finally { globalThis.fetch = originalFetch; }
});
