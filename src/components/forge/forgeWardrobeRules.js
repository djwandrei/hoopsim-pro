import { paletteForTeam } from '@/components/djhc/basketballPalettes';

export const WARDROBE_EDITIONS = ['association', 'icon', 'statement'];
export const DEFAULT_WARDROBE_EDITIONS = { jersey: 'icon', shorts: 'icon' };
// Each item follows its locked skill donor, independently of the uniform edition.
export const WARDROBE_SKILLS = {
  jersey: 'scoring', shorts: 'rebounding', headband: 'decision',
  'right-sleeve': 'jumpShot', 'left-shoe': 'playmaking', 'right-shoe': 'steals',
};
export const OPTIONAL_WARDROBE = new Set(['headband', 'right-sleeve', 'left-sleeve']);
export function wardrobeTeam(code) {
  const value = String(code || '').toUpperCase();
  return ({ BRK: 'BKN', CHO: 'CHA', PHO: 'PHX', NOH: 'NOP', NOK: 'NOP', NJN: 'BKN' })[value] || value;
}
export function wardrobeColor(pick) {
  return paletteForTeam(wardrobeTeam(pick?.player?.teamCode)).primary;
}