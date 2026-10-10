import { paletteForTeam } from '../djhc/basketballPalettes.js';

export const WARDROBE_EDITIONS = ['association', 'icon', 'statement'];
export const DEFAULT_WARDROBE_EDITIONS = { jersey: 'icon', shorts: 'icon' };
// Each item follows its locked skill donor, independently of the uniform edition.
export const WARDROBE_SKILLS = {
  jersey: 'scoring', shorts: 'rebounding', headband: 'decision',
  'right-sleeve': 'jumpShot', wristband: 'finishing', 'knee-sleeve': 'perimeterDefense',
  'left-shoe': 'playmaking', 'right-shoe': 'playmaking',
};
export const WARDROBE_ACCESSORIES = { headband: 'headband', 'right-sleeve': 'rightSleeve', wristband: 'wristband', 'knee-sleeve': 'kneeSleeve' };
export const OPTIONAL_WARDROBE = new Set(Object.keys(WARDROBE_ACCESSORIES));
export const DEFAULT_APPEARANCE = { bodyColor: 'silhouette', ballColor: 'classic', headband: true, rightSleeve: true, wristband: true, kneeSleeve: true };
export const BODY_COLORS = { silhouette: '#0c1112', slate: '#52616f', royal: '#4169a8', warm: '#976347' };
// Drop retired team overrides and the duplicate sleeve from old shared builds.
export function normalizeForgeAppearance(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    bodyColor: Object.hasOwn(BODY_COLORS, raw.bodyColor) ? raw.bodyColor : 'silhouette',
    ballColor: ['classic', 'midnight'].includes(raw.ballColor) ? raw.ballColor : 'classic',
    headband: raw.headband !== false, rightSleeve: raw.rightSleeve !== false,
    wristband: raw.wristband !== false, kneeSleeve: raw.kneeSleeve !== false,
  };
}
export function wardrobeTeam(code) {
  const value = String(code || '').toUpperCase();
  return ({ BRK: 'BKN', CHO: 'CHA', PHO: 'PHX', NOH: 'NOP', NOK: 'NOP', NJN: 'BKN' })[value] || value;
}
export function wardrobeColor(pick) {
  return paletteForTeam(wardrobeTeam(pick?.player?.teamCode)).primary;
}
export function wardrobeShoeStyle(pick) {
  const palette = paletteForTeam(wardrobeTeam(pick?.player?.teamCode));
  return { primary: palette.primary, accent: palette.trim };
}
