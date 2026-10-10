import { WARDROBE_SKILLS } from './forgeWardrobeRules.js';
import { SKILLS } from './bapSkills.js';

// Keep the diagram tied to the renderer's real donor mapping.
export const FORGE_EQUIPMENT_CALLOUTS = [
  { element: 'headband', label: 'Headband', side: 'left', top: 18, number: '01' },
  { element: 'jersey', label: 'Jersey', side: 'left', top: 39, number: '02' },
  { element: 'wristband', label: 'Left wristband', side: 'left', top: 61, number: '03' },
  { element: 'left-shoe', label: 'Both shoes', side: 'left', top: 83, number: '04' },
  { element: 'right-sleeve', label: 'Shooting sleeve', side: 'right', top: 22, number: '05' },
  { element: 'shorts', label: 'Shorts', side: 'right', top: 52, number: '06' },
  { element: 'knee-sleeve', label: 'Right knee sleeve', side: 'right', top: 78, number: '07' },
].map(item => ({ ...item, skill: WARDROBE_SKILLS[item.element] }));
const FORGE_SKILL_KEYS = new Set(SKILLS.map(skill => skill.key));

export function bestForgeOffer(picks, reveal) {
  return Object.entries(reveal || {}).filter(([key, value]) => !picks[key] && Number.isFinite(value) && FORGE_SKILL_KEYS.has(key))
    .reduce((best, [key, value]) => !best || value > best.value ? { key, value } : best, null)?.key;
}

export function forgeStageSkillState(key, { mode, picks, reveal, selectedKey, spinning }) {
  const pick = picks[key];
  const live = !spinning && !pick && Number.isFinite(reveal?.[key]) && (mode === 'wheel' || selectedKey === key);
  const selectable = mode === 'pick' && !pick && !reveal && !spinning;
  const selected = !pick && mode === 'pick' && selectedKey === key;
  return {
    pick, live, selectable, selected, clickable: live || selectable,
    value: pick?.value ?? (live ? reveal[key] : null),
    status: pick ? 'Locked' : live ? 'Assign' : spinning ? 'Spinning' : selected ? 'Selected' : 'Open',
    tone: pick ? 'locked' : live ? 'offer' : selected ? 'selected' : 'open',
  };
}
