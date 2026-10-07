// Tag system: every play is auto-tagged from its dictionary metadata
// (category title, Type line and name) so the library can be sliced by
// scheme family — fast breaks, zone sets, defensive schemes, and more.
export const TAGS = [
  { id: 'fast_break', label: 'Fast break', test: /transition|early[-\s]offense|primary break|secondary break|flow/i },
  { id: 'motion', label: 'Motion / continuity', test: /motion|continuity/i },
  { id: 'ball_screen', label: 'Ball screen', test: /ball-screen|pick-and-roll/i },
  { id: 'handoff', label: 'Handoff', test: /handoff|dho|zoom|chicago|pistol/i },
  { id: 'off_ball', label: 'Off-ball screen', test: /off-ball|pindown|pin-down|flare/i },
  { id: 'post', label: 'Post', test: /\bpost\b/i },
  { id: 'iso', label: 'Isolation', test: /isolation/i },
  { id: 'zone', label: 'Zone set', test: /zone/i },
  { id: 'formation', label: 'Formation', test: /formation/i },
  { id: 'blob', label: 'BLOB', test: /blob|baseline out/i },
  { id: 'slob', label: 'SLOB', test: /slob|sideline out/i },
  { id: 'defense', label: 'Defense', test: /defense|defensive|press|trap|coverage|rotation|deny/i },
  // Fallback bucket for generic systems and atomic actions that no other
  // scheme family describes.
  { id: 'half_court', label: 'Half-court offense', test: null },
];

export function tagsForPlay(play, categoryTitle) {
  const haystack = `${categoryTitle || ''} ${play.type || ''} ${play.name}`;
  const matched = TAGS.filter((tag) => tag.test && tag.test.test(haystack)).map((tag) => tag.id);
  return matched.length ? matched : ['half_court'];
}

export const tagLabel = (id) => TAGS.find((tag) => tag.id === id)?.label || id;