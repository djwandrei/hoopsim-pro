// Loads the basketball play/animation dictionary and parses it into browsable
// plays: name, type, starting alignment, numbered animation steps, tactical
// goal and read branches.
import { tagsForPlay } from '@/components/playbook/playTags';

// The library ships with the app (public/playbook/play-library.md), so every
// build — hosted preview and standalone site — loads it same-origin.
const LIBRARY_URL = `${import.meta.env.BASE_URL}playbook/play-library.md`;

let cache = null;
let inflight = null;

async function fetchLibrary() {
  const res = await fetch(LIBRARY_URL);
  if (!res.ok) throw new Error(`Play library unavailable (${res.status})`);
  return res.text();
}

export async function loadPlayLibrary() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchLibrary()
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

export function parseLibrary(markdown) {
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
  kept.forEach((item) => item.plays.forEach((play) => { play.category = item.title; play.tags = tagsForPlay(play, item.title); }));
  return { categories: kept, playCount: kept.reduce((total, item) => total + item.plays.length, 0) };
}
