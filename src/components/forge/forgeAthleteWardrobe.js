import * as THREE from 'three';
import { configureSilhouetteMaterial } from '@/components/forge/forgeSilhouetteMaterial';
import { loadUniformCatalog, loadUniformImages } from '@/components/forge/forgeAthleteAssets';
import forgeUniformAtlas from '@/components/forge/forgeUniformAtlas';
import { OPTIONAL_WARDROBE, WARDROBE_SKILLS, wardrobeColor, wardrobeTeam } from '@/components/forge/forgeWardrobeRules';

export default function forgeAthleteWardrobe(model) {
  const records = new Map(); let revision = 0, disposed = false;
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const active = mesh.material, element = active.name;
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c1112, metalness: 0, roughness: 1, side: active.side });
    const rim = configureSilhouetteMaterial(dark);
    records.set(element, { mesh, active, dark, rim, key: null, texture: null });
    mesh.material = dark; mesh.visible = !OPTIONAL_WARDROBE.has(element);
  });
  const update = async (picks, editions) => {
    const token = ++revision, filled = Object.keys(picks).length, work = [];
    for (const [element, record] of records) {
      const { mesh, dark, active, rim } = record, pick = picks[WARDROBE_SKILLS[element]];
      rim.value = Math.min(1, filled / 9);
      if (OPTIONAL_WARDROBE.has(element)) mesh.visible = Boolean(pick);
      if (element === 'basketball') { mesh.material = picks.finishing ? active : dark; continue; }
      if (!pick) { mesh.material = dark; continue; }
      if (element !== 'jersey' && element !== 'shorts') {
        active.color.set(wardrobeColor(pick)); active.roughness = .8; mesh.material = active; continue;
      }
      const code = wardrobeTeam(pick.player.teamCode), edition = editions[element] || 'icon', key = `${code}:${edition}`;
      if (record.key === key) { mesh.material = active; continue; }
      // A newer pick, undo or edition change invalidates earlier artwork loads.
      work.push((async () => {
        const catalog = await loadUniformCatalog();
        const team = catalog.teams.find(item => item.code === code);
        const item = catalog.items.find(item => item.team === team?.id && item.edition === edition);
        if (!item) throw new Error(`No ${edition} uniform is available for ${code}.`);
        const loaded = await loadUniformImages(item);
        if (disposed || revision !== token) return;
        const texture = new THREE.CanvasTexture(forgeUniformAtlas(element, item, loaded));
        texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
        record.texture?.dispose(); record.texture = texture; record.key = key;
        active.map = texture; active.color.set(0xffffff); active.roughness = .85;
        active.needsUpdate = true; mesh.material = active;
      })());
    }
    await Promise.all(work);
  };
  return {
    update,
    dispose() { disposed = true; revision++; for (const record of records.values()) { record.texture?.dispose(); record.dark.dispose(); record.active.dispose(); } },
  };
}