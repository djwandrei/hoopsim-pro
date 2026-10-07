// Scratch verification for the Playbook animation engine (NOT app code).
// Loads the real markdown library, runs buildFrames through the same source
// as src/components/playbook/playAnimation.js, and prints positions for a
// sample of plays so start spots and per-step motion can be eyeballed.
'use strict';
const fs = require('fs');

const src = fs.readFileSync('/app/src/components/playbook/playAnimation.js', 'utf8');
// Strip the single @/ import and ESM export keywords, then eval in isolation.
const code = src
  .replace(/^import .*;\s*$/m, '')
  .replace(/^export /gm, '');
const api = new Function(`${code}\nreturn { buildFrames, ZONES, DEFAULT_SPOTS, zoneKey };`)();

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
    if (playMatch) {
      play = { name: playMatch[1].trim(), alignment: '', steps: [] };
      if (category) category.plays.push(play);
      continue;
    }
    if (!play) continue;
    const alignMatch = line.match(/^- \*\*Starting alignment:\*\* (.+)$/);
    if (alignMatch) { play.alignment = alignMatch[1].trim(); continue; }
    const stepMatch = line.match(/^\d+\.\s+(.+)$/);
    if (stepMatch) play.steps.push(stepMatch[1].trim());
  }
  return categories;
}

const round = ([x, y]) => `(${Math.round(x)},${Math.round(y)})`;

async function main() {
  const md = await (await fetch(LIBRARY_URL)).text();
  const categories = parseLibrary(md);
  if (process.env.AUDIT_ALL === '1') {
    const issues = [];
    let playTotal = 0;
    for (const category of categories) {
      for (const play of category.plays) {
        playTotal++;
        const { setup, frames } = api.buildFrames(play);
        const allFrames = [setup, ...frames];
        for (const frame of allFrames) {
          for (const [id, p] of Object.entries(frame.offense)) {
            if (!p || !isFinite(p[0]) || !isFinite(p[1])) { issues.push(`${play.name}: ${id} NaN position`); continue; }
            if (p[0] < 18 || p[0] > 482 || p[1] < 10 || p[1] > 462) issues.push(`${play.name}: ${id} out of bounds ${Math.round(p[0])},${Math.round(p[1])}`);
          }
          const ids = Object.keys(frame.offense);
          for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
            const pa = frame.offense[ids[a]], pb = frame.offense[ids[b]];
            if (pa && pb && Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 20) issues.push(`${play.name}: ${ids[a]}/${ids[b]} overlap in frame ${frame.text.slice(0, 40)}`);
          }
        }
      }
    }
    return `plays: ${playTotal}, issues: ${issues.length}\n${issues.slice(0, 40).join('\n')}`;
  }
  const wanted = process.env.DETAIL
    ? process.env.DETAIL.split('|')
    : ['Horns', '5-Out Motion', 'Flex Offense', 'Princeton Chin', '4-Out 1-In', 'Box'];
  const report = [];
  for (const category of categories) {
    for (const play of category.plays) {
      if (!wanted.includes(play.name)) continue;
      const { setup, frames } = api.buildFrames(play);
      report.push(`\n=== ${play.name} | alignment: ${play.alignment}`);
      play.steps.forEach((s, i) => report.push(`  text ${i + 1}: ${s}`));
      report.push('  setup: ' + Object.entries(setup.offense).map(([id, p]) => `${id}${round(p)}`).join(' '));
      frames.forEach((frame, i) => {
        const moves = Object.entries(frame.offense)
          .filter(([id, p]) => Math.hypot(p[0] - setup.offense[id][0], p[1] - setup.offense[id][1]) > 8)
          .map(([id, p]) => `${id}→${round(p)}`);
        report.push(`  step ${i + 1} (ball ${frame.ballOwner}${frame.passes.length ? `, pass ${frame.passes.map(p => p.join('→')).join(',')}` : ''}): ${moves.join(' ') || 'no offensive movement'}`);
      });
    }
  }
  return report.join('\n');
}

main().then(out => console.log(out)).catch(err => { console.error(err); process.exit(1); });