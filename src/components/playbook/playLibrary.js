// Loads the DJHC basketball play/animation dictionary (a public markdown
// library) and parses it into browsable plays: name, type, starting
// alignment, numbered animation steps, tactical goal and read branches.
const LIBRARY_URL = 'https://media.base44.com/files/public/6abc41d86dabd382371f49ea/0c38efcba_basketball_play_animation_library.md';

let cache = null;
let inflight = null;

export async function loadPlayLibrary() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch(LIBRARY_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Play library unavailable (${res.status})`);
        return res.text();
      })
      .then((markdown) => { cache = parseLibrary(markdown); return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function findPlay(library, id) {
  if (!library || !id) return null;
  for (const category of library.categories) {
    const play = category.plays.find((item) => item.id === id);
    if (play) return play;
  }
  return null;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseLibrary(markdown) {
  const categories = [];
  let category = null;
  let play = null;
  let inReads = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const categoryMatch = line.match(/^# \d+\.\s+(.+)$/);
    if (categoryMatch) {
      category = { title: categoryMatch[1].trim(), plays: [] };
      categories.push(category);
      play = null;
      continue;
    }
    const playMatch = line.match(/^### (.+)$/);
    if (playMatch) {
      const name = playMatch[1].trim();
      play = { id: slug(name), name, type: '', alignment: '', steps: [], goal: '', reads: [] };
      if (category) category.plays.push(play);
      inReads = false;
      continue;
    }
    if (!play) continue;
    const typeMatch = line.match(/^- \*\*Type:\*\* (.+)$/);
    if (typeMatch) { play.type = typeMatch[1].trim(); continue; }
    const alignmentMatch = line.match(/^- \*\*Starting alignment:\*\* (.+)$/);
    if (alignmentMatch) { play.alignment = alignmentMatch[1].trim(); continue; }
    const goalMatch = line.match(/^- \*\*Primary goal:\*\* (.+)$/);
    if (goalMatch) { play.goal = goalMatch[1].trim(); continue; }
    if (/^- \*\*Common reads/.test(line)) { inReads = true; continue; }
    const stepMatch = line.match(/^\d+\.\s+(.+)$/);
    if (stepMatch) { inReads = false; play.steps.push(stepMatch[1].trim()); continue; }
    const readMatch = line.match(/^-\s+(.+)$/);
    if (readMatch && inReads) play.reads.push(readMatch[1].trim());
  }
  const kept = categories.filter((item) => item.plays.length > 0);
  return { categories: kept, playCount: kept.reduce((total, item) => total + item.plays.length, 0) };
}