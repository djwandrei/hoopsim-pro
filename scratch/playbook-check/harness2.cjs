// Scratch verification for the Playbook animation engine (NOT app code).
// Loads every playbook module into one scope (duplicates renamed), runs
// buildFrames across the full markdown library, and reports movement stats.
'use strict';
const fs = require('fs');
const DIR = '/app/src/components/playbook/';
const MODULES = ['playGeometry', 'playClauses', 'playFormations', 'playPasses', 'playActions', 'playMotion', 'playRouteSpacing', 'playContextActions', 'playNarration', 'playAnimation', 'defenseGeometry', 'defenseAnimation', 'defenseMan', 'defenseZone', 'defensePress', 'defenseCoverage'];
const seen = new Map();
const parts = MODULES.map(name => {
  let code = fs.readFileSync(DIR + name + '.js', 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export (default )?/gm, '')
    .replace(/^export /gm, '');
  for (const m of [...code.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)]) {
    const d = m[1];
    if (!seen.has(d)) seen.set(d, d);
    else {
      const alias = `${d}__${name}`;
      code = code.replace(new RegExp(`\\b${d}\\b`, 'g'), alias);
      console.warn(`renamed ${d} in ${name} -> ${alias}`);
    }
  }
  return code;
});
const api = new Function(`${parts.join('\n')}\nreturn { buildFrames, zoneNameOf };`)();
const LIBRARY_URL = 'https://media.base44.com/files/public/6abc41d86dabd382371f49ea/0c38efcba_basketball_play_animation_library.md';
function parseLibrary(markdown) {
  const categories = [];
  let category = null;
  let play = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const categoryMatch = line.match(/^# \d+\.\s+(.+)$/);
    if (categoryMatch) { category = { title: categoryMatch[1].trim(), plays: [] }; categories.push(category); play = null; continue; }
    const playMatch = line.match(/^### (.+)$/);
    if (playMatch) { play = { name: playMatch[1].trim(), type: '', alignment: '', steps: [] }; if (category) category.plays.push(play); continue; }
    const typeMatch = line.match(/^- \*\*Type:\*\* (.+)$/);
    if (typeMatch && play) { play.type = typeMatch[1].trim(); continue; }
    if (!play) continue;
    const alignMatch = line.match(/^- \*\*Starting alignment:\*\* (.+)$/);
    if (alignMatch) { play.alignment = alignMatch[1].trim(); continue; }
    const stepMatch = line.match(/^\d+\.\s+(.+)$/);
    if (stepMatch) play.steps.push(stepMatch[1].trim());
  }
  return categories;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
async function main() {
  const res = await fetch(LIBRARY_URL);
  const categories = parseLibrary(await res.text());
  const plays = categories.flatMap(c => c.plays.map(p => ({ ...p, category: c.title })));
  let still = 0; let moving = 0;
  const stillList = [];
  const movers = [];
  for (const play of plays) {
    let frames;
    try { frames = api.buildFrames(play); } catch (err) { stillList.push(`${play.category} / ${play.name}: CRASH ${err.message}`); continue; }
    const movedFrames = frames.frames.filter(f => Object.values(f.offense).some(p => dist(p, f.offense === f.offense ? (frames.frames[frames.frames.indexOf(f) - 1] || frames.setup).offense[Object.keys(f.offense).find(k => frames.setup.offense[k] !== undefined)] || p : p)) === false);
    const movingFrames = frames.frames.filter((frame, i) => {
      const prev = i === 0 ? frames.setup.offense : frames.frames[i - 1].offense;
      return Object.entries(frame.offense).some(([id, p]) => prev[id] && dist(prev[id], p) > 6);
    });
    const passFrames = frames.frames.filter(f => f.passes && f.passes.length);
    if (movingFrames.length === 0 && passFrames.length === 0) { still += 1; stillList.push(`${play.category} / ${play.name} (${play.steps.length} steps)`); }
    else moving += 1;
    movers.push({ play, moving: movingFrames.length, total: frames.frames.length, passFrames: passFrames.length });
  }
  console.log(`plays: ${plays.length} | animating: ${moving} | static: ${still}`);
  console.log('--- static plays ---');
  stillList.forEach(line => console.log(line));
  console.log('--- samples ---');
  for (const label of ['Spain Pick-and-Roll', 'Flex Offense', '5-Out Motion', 'Ghost Screen', 'UCLA Cut', 'Switch Everything', '2-3 Zone', 'Box Outlets']) {
    const entry = movers.find(m => m.play.name === label);
    if (!entry) continue;
    const frames = api.buildFrames(entry.play);
    console.log(`\n== ${label} (${entry.play.category}) ==`);
    console.log(`setup: ${Object.entries(frames.setup.offense).map(([id, p]) => `${id}${Math.round(p[0])},${Math.round(p[1])}`).join(' ')}`);
    frames.frames.forEach((frame, i) => {
      const prev = i === 0 ? frames.setup.offense : frames.frames[i - 1].offense;
      const move = Object.entries(frame.offense).filter(([id, p]) => prev[id] && dist(prev[id], p) > 6).map(([id, p]) => `${id}: ${api.zoneNameOf(prev[id])} -> ${api.zoneNameOf(p)}`);
      console.log(`step ${i + 1}${frame.passes.length ? ` [ball ${frame.passes.map(p => p.join ? p.join('->') : `${p[0]}->${p[1]}`).join(', ')}]` : ''}: ${move.length ? move.join(' | ') : '(static)'}`);
    });
  }
}
main().catch(err => { console.error('HARNESS FAIL', err); process.exit(1); });