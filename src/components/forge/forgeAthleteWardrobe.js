import * as THREE from 'three';
import { SKILLS } from './bapSkills.js';
import { configureSilhouetteMaterial } from '@/components/forge/forgeSilhouetteMaterial';
import { loadUniformCatalog, loadUniformImages } from '@/components/forge/forgeAthleteAssets';
import forgeUniformAtlas from '@/components/forge/forgeUniformAtlas';
import forgeAthleteAccessories from '@/components/forge/forgeAthleteAccessories';
import { BODY_COLORS, DEFAULT_APPEARANCE, OPTIONAL_WARDROBE, WARDROBE_ACCESSORIES, WARDROBE_SKILLS, normalizeForgeAppearance, wardrobeColor, wardrobeShoeStyle, wardrobeTeam } from '@/components/forge/forgeWardrobeRules';

export default function forgeAthleteWardrobe(model) {
  const disposeAccessories = forgeAthleteAccessories(model);
  const records = new Map(); let revision = 0, disposed = false;
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const active = mesh.material, element = active.name;
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c1112, metalness: 0, roughness: 1, side: active.side });
    const rim = configureSilhouetteMaterial(dark);
    records.set(element, { mesh, active, dark, rim, key: null, texture: null });
    mesh.material = dark; mesh.visible = element !== 'left-sleeve' && !OPTIONAL_WARDROBE.has(element);
  });
  const update = async (picks, editions, rawAppearance = DEFAULT_APPEARANCE) => {
    const appearance = normalizeForgeAppearance(rawAppearance);
    const token = ++revision, filled = SKILLS.filter(skill => picks[skill.key]).length, work = [];
    for (const [element, record] of records) {
      const { mesh, dark, active, rim } = record, pick = picks[WARDROBE_SKILLS[element]];
      rim.value = filled / SKILLS.length;
      if (element === 'left-sleeve') { mesh.visible = false; continue; }
      if (OPTIONAL_WARDROBE.has(element)) mesh.visible = appearance[WARDROBE_ACCESSORIES[element]] && Boolean(pick);
      if (element === 'basketball') {
        const key = `basketball:${appearance.ballColor || 'classic'}`;
        if (record.key !== key) { const texture = new THREE.CanvasTexture(forgeUniformAtlas('basketball', { ballColor: appearance.ballColor || 'classic' }, null)); texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; record.texture?.dispose(); record.texture = texture; record.key = key; active.map = texture; active.color.set(0xffffff); active.roughness = .8; active.needsUpdate = true; }
        mesh.material = active; mesh.visible = model.userData.forgeBallVisible !== false; continue;
      }
      if (['body', 'head-neck', 'exposed-upper-body', 'right-arm', 'left-arm'].includes(element)) {
        const color = BODY_COLORS[appearance.bodyColor] || BODY_COLORS.silhouette;
        if (appearance.bodyColor === 'silhouette') mesh.material = dark;
        else { active.map = null; active.color.set(color); active.roughness = .88; mesh.material = active; }
        continue;
      }
      if (!pick) { mesh.material = dark; continue; }
      if (element === 'left-shoe' || element === 'right-shoe') {
        const code = pick.player.teamCode;
        const key = `shoe:${wardrobeTeam(code)}`;
        if (record.key !== key) {
          const texture = new THREE.CanvasTexture(forgeUniformAtlas(element, wardrobeShoeStyle({ player: { teamCode: code } }), null));
          texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
          record.texture?.dispose(); record.texture = texture; record.key = key;
          active.map = texture; active.color.set(0xffffff); active.roughness = .8; active.needsUpdate = true;
        }
        mesh.material = active; continue;
      }
      if (element !== 'jersey' && element !== 'shorts') {
        active.color.set(wardrobeColor(pick)); active.roughness = .92; mesh.material = active; continue;
      }
      const code = wardrobeTeam(pick.player.teamCode), edition = editions[element] || 'icon', key = `${code}:${edition}`;
      if (record.key === key) { mesh.material = active; continue; }
      // A newer pick, undo or edition change invalidates earlier artwork loads.
      work.push((async () => {
        let catalog = null;
        try { catalog = await loadUniformCatalog(); } catch { /* Keep the mesh usable with generated fallback art. */ }
        const team = catalog?.teams.find(item => item.code === code);
        const item = catalog?.items.find(item => item.team === team?.id && item.edition === edition);
        const base = team || { primary: '#2456a6', accent: '#ffffff', shorts: '#18396f' };
        const style = item || { ...base, primary: base.primary, accent: base.accent, shorts: base.shorts };
        let loaded = null;
        if (item) { try { loaded = await loadUniformImages(item); } catch { /* Use the local colorway and procedural panel details. */ } }
        if (disposed || revision !== token) return;
        const texture = new THREE.CanvasTexture(forgeUniformAtlas(element, style, loaded));
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
    dispose() { disposed = true; revision++; for (const record of records.values()) { record.texture?.dispose(); record.dark.dispose(); record.active.dispose(); } disposeAccessories(); },
  };
}
