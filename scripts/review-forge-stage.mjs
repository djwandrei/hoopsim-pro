import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.argv[2] || path.join(root, 'docs', 'forge-stage-review'));
const reviewWorkspace = process.argv.includes('--workspace');
const imagePath = path.join(root, 'docs', 'forge-athlete-800k', 'forge-athlete-800k-review.png');
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/djwan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const sourcePlayers = [
  { playerRef: 'donor-1', name: 'Tim Duncan', teamCode: 'SAS', seasonStartYear: 2003 },
  { playerRef: 'donor-2', name: 'Kobe Bryant', teamCode: 'LAL', seasonStartYear: 2008 },
  { playerRef: 'donor-3', name: 'Shaquille O’Neal', teamCode: 'LAL', seasonStartYear: 2000 },
  { playerRef: 'donor-4', name: 'Chris Paul', teamCode: 'LAC', seasonStartYear: 2014 },
  { playerRef: 'donor-5', name: 'Steve Nash', teamCode: 'PHX', seasonStartYear: 2005 },
];

const comparisonPlayers = [
  { playerRef: 'compare-1', name: 'LeBron James', teamCode: 'LAL', seasonStartYear: 2023, scoring: 90, jumpShot: 84, finishing: 91, playmaking: 88, decision: 86, rebounding: 78, clutch: 83, perimeterDefense: 79, rimProtection: 65 },
  { playerRef: 'compare-2', name: 'Stephen Curry', teamCode: 'GSW', seasonStartYear: 2023, scoring: 92, jumpShot: 98, finishing: 78, playmaking: 85, decision: 90, rebounding: 54, clutch: 88, perimeterDefense: 72, rimProtection: 35 },
  { playerRef: 'compare-3', name: 'Nikola Jokic', teamCode: 'DEN', seasonStartYear: 2023, scoring: 94, jumpShot: 76, finishing: 95, playmaking: 93, decision: 96, rebounding: 92, clutch: 89, perimeterDefense: 52, rimProtection: 68 },
].map(player => ({ minutes: 2200, headshotPath: null, ...player }));

const pickKeys = ['scoring', 'jumpShot', 'finishing', 'playmaking', 'decision'];
const pickValues = [88, 85, 90, 82, 86];
const pickState = Object.fromEntries(pickKeys.map((key, index) => [key, {
  player: sourcePlayers[index],
  value: pickValues[index],
}]));

const revealedPlayer = {
  playerRef: 'reveal-1',
  name: 'Kevin Durant',
  teamCode: 'PHX',
  seasonStartYear: 2023,
  positions: ['SF', 'PF'], games: 75, pts: 27.1, reb: 6.6, ast: 5, stl: .9, blk: 1.2, mpg: 37.2, fg: .523, tpp: .413,
  measurements: { height: 82, weight: 240, wingspan: 89.5, combineYear: 2007 },
  scoring: 93,
  jumpShot: 95,
  finishing: 91,
  playmaking: 81,
  decision: 84,
  rebounding: 70,
  clutch: 88,
  perimeterDefense: 89,
  rimProtection: 76,
  body: 78,
};

const scenarios = [
  { key: 'empty', label: 'Empty wheel', props: { mode: 'wheel', picks: {}, pool: comparisonPlayers, reveal: null, selectedKey: null, spinning: false, showGrades: true } },
  { key: 'wheel-reveal-5-picks', label: 'Wheel reveal with five assigned skills', props: { mode: 'wheel', picks: pickState, pool: comparisonPlayers, reveal: revealedPlayer, selectedKey: null, spinning: false, showGrades: true } },
  { key: 'pick-selected', label: 'Pick mode with Perimeter Defense selected', props: { mode: 'pick', picks: {}, pool: comparisonPlayers, reveal: null, selectedKey: 'perimeterDefense', spinning: false, showGrades: true } },
  { key: 'pick-reveal-long-name', label: 'Pick reveal with long player name and note', props: { mode: 'pick', picks: {}, pool: comparisonPlayers, reveal: { ...revealedPlayer, name: 'Giannis Antetokounmpo' }, selectedKey: 'perimeterDefense', spinning: false, showGrades: true } },
  { key: 'full-no-grades', label: 'All ten selections with grades hidden', props: { mode: 'wheel', picks: Object.fromEntries(['scoring', 'jumpShot', 'finishing', 'playmaking', 'decision', 'rebounding', 'clutch', 'perimeterDefense', 'rimProtection', 'body'].map((key, index) => [key, { player: sourcePlayers[index % sourcePlayers.length], value: 65 + index * 3 }])), pool: comparisonPlayers, reveal: null, selectedKey: null, spinning: false, showGrades: false, group: 'Big' } },
];

function extractCss(code) {
  const assignment = /(?:const|let|var)\s+(?:__vite__css|css)\s*=\s*/.exec(code);
  if (!assignment) throw new Error(`Could not extract CSS from Vite transform. Transform starts: ${code.slice(0, 1200)}`);
  const start = assignment.index + assignment[0].length;
  if (code[start] !== '"') throw new Error('Vite CSS module value was not a quoted string.');
  let end = start + 1;
  while (end < code.length) {
    if (code[end] === '\\') end += 2;
    else if (code[end] === '"') break;
    else end += 1;
  }
  if (end >= code.length) throw new Error('Vite CSS string did not terminate.');
  return JSON.parse(code.slice(start, end + 1));
}

function replaceAthleteWithStaticReview(markup, dataUrl) {
  const marker = markup.indexOf('aria-label="Composite athlete,');
  if (marker < 0) throw new Error('Could not find the SSR ForgeAthlete3D host element.');
  const start = markup.lastIndexOf('<div class="relative h-full w-full ', marker);
  if (start < 0) throw new Error('Could not find the ForgeAthlete3D root element.');
  const tokens = /<\/?div\b[^>]*>/g;
  tokens.lastIndex = start;
  let depth = 0;
  let end = -1;
  let token;
  while ((token = tokens.exec(markup))) {
    if (token[0].startsWith('</')) depth -= 1;
    else if (!token[0].endsWith('/>')) depth += 1;
    if (depth === 0) {
      end = tokens.lastIndex;
      break;
    }
  }
  if (end < 0) throw new Error('Could not find the end of the ForgeAthlete3D SSR subtree.');
  const replacement = `<div class="forge-review-athlete" role="img" aria-label="Static CPU review render of the Forge athlete"><img src="${dataUrl}" alt="" /><span>STATIC CPU REVIEW</span></div>`;
  return `${markup.slice(0, start)}${replacement}${markup.slice(end)}`;
}

function buildHtml(markup, globalCss, stageCss) {
  const safeGlobalCss = globalCss.replace(/@import\s+url\([^;]*fonts\.googleapis\.com[^;]*;?/gi, '');
  return `<!doctype html>
<html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${safeGlobalCss}
${stageCss}
.forge-review-shell{width:min(${reviewWorkspace ? 1200 : 900}px,100%);margin:0 auto;padding:16px 0 28px}
.forge-review-athlete{position:absolute;inset:8% 12% 15%;display:grid;place-items:center;overflow:hidden}
.forge-review-athlete img{width:100%;height:100%;object-fit:contain;mix-blend-mode:screen}
.forge-review-athlete span{position:absolute;bottom:0;left:50%;transform:translateX(-50%);max-width:100%;padding:.25rem .45rem;border:1px solid hsl(var(--border)/.35);border-radius:999px;background:hsl(var(--court-canvas)/.88);color:hsl(var(--muted-foreground));font:9px var(--font-mono);letter-spacing:.06em;white-space:nowrap}
body{min-width:0;margin:0;background:hsl(var(--court-canvas));color:hsl(var(--court-text));font-family:var(--font-body)}
</style></head><body><main class="studio-workspace forge-review-shell">${markup}</main></body></html>`;
}

const athleteBytes = await readFile(imagePath);
const athleteDataUrl = `data:image/png;base64,${athleteBytes.toString('base64')}`;
await mkdir(outputDir, { recursive: true });

const server = await createServer({
  configFile: path.join(root, 'vite.config.js'),
  root,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let browser;
try {
  const { default: ForgeStage } = await server.ssrLoadModule('/src/components/forge/ForgeStage.jsx');
  const { forgeCompositeOverallScore } = await server.ssrLoadModule('/src/components/forge/forgeOverall.js');
  const { default: ForgeReelPanel } = reviewWorkspace ? await server.ssrLoadModule('/src/components/forge/ForgeReelPanel.jsx') : {};
  const { default: ForgePlayerCard } = reviewWorkspace ? await server.ssrLoadModule('/src/components/forge/ForgePlayerCard.jsx') : {};
  const transformedGlobal = await server.transformRequest('/src/index.css');
  if (!transformedGlobal?.code) throw new Error('Vite did not return a transform for src/index.css.');
  const globalCss = extractCss(transformedGlobal.code);
  const stageCss = await readFile(path.join(root, 'src', 'components', 'forge', 'forgeStage.css'), 'utf8');
  const playwrightPath = 'C:/Users/djwan/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe';
  browser = await chromium.launch({ headless: true, executablePath: playwrightPath, args: ['--no-sandbox'] });
  const results = [];

  for (const scenario of scenarios) {
    const props = {
      ...scenario.props,
      overall: (() => { const score = forgeCompositeOverallScore(scenario.props.picks, scenario.props.group || 'All'); return score === null ? null : Math.round(score); })(),
      onSelect: () => {},
      onAssign: () => {},
      editions: {},
      onEdition: () => {},
      appearance: {},
      onAppearance: () => {},
    };
    const note = !props.reveal ? null : props.mode === 'pick' ? 'Perimeter Defense · DJHC 89' : '5 skills open · tap a rating';
    let markup = renderToStaticMarkup(reviewWorkspace ? React.createElement('div', { className: 'forge-draft-workspace' },
      React.createElement(ForgeReelPanel, { showGrades: props.showGrades, onToggleGrades: () => {}, teamItems: [{ code: 'PHX', name: 'Phoenix Suns' }, { code: 'LAL', name: 'Los Angeles Lakers' }], playerItems: [revealedPlayer, ...sourcePlayers], teamSpin: { token: 0, targetKey: 'PHX' }, playerSpin: { token: 0, targetKey: revealedPlayer.playerRef }, spinning: false, reveal: props.reveal, onSpin: () => {}, onRespinTeam: () => {}, onRespinPlayer: () => {}, teamRespins: 3, playerRespins: 3 }),
      React.createElement(ForgeStage, props),
      React.createElement(ForgePlayerCard, { player: props.reveal, note, className: 'forge-draft-profile' })) : React.createElement(ForgeStage, props));
    markup = replaceAthleteWithStaticReview(markup, athleteDataUrl);
    for (const url of new Set([...markup.matchAll(/src="(\/assets\/nba-logos\/[^" ]+)"/g)].map(match => match[1]))) {
      const logoBytes = await readFile(path.join('C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied', url));
      markup = markup.replaceAll(`src="${url}"`, `src="data:image/png;base64,${logoBytes.toString('base64')}"`);
    }

    for (const viewport of [
      { key: 'desktop', width: 1280, height: 1180 },
      { key: 'compact', width: 740, height: 1180 },
      { key: 'mobile', width: 390, height: 1180 },
      { key: 'narrow', width: 320, height: 1180 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const consoleErrors = [];
      page.on('pageerror', error => consoleErrors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      await page.route('**/*', route => route.request().url().startsWith('data:') ? route.continue() : route.abort());
      await page.setContent(buildHtml(markup, globalCss, stageCss), { waitUntil: 'domcontentloaded' });
      const metrics = await page.evaluate(() => {
        const rect = element => {
          const box = element.getBoundingClientRect();
          return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), right: Math.round(box.right), bottom: Math.round(box.bottom) };
        };
        const stage = document.querySelector('.forge-player-stage');
        const summary = document.querySelector('.forge-composite-summary');
        const selectionRail = document.querySelector('.forge-composite-summary__selection-rail');
        const viewer = document.querySelector('.forge-model-map__viewer');
        const cards = [...document.querySelectorAll('.forge-part-card')].map((element, index) => ({
          index,
          skill: element.dataset.skill,
          label: element.querySelector('.forge-part-card__skill')?.textContent?.trim() || '',
          rect: rect(element),
        }));
        const textNodes = [...document.querySelectorAll('.forge-player-profile__stats p,.forge-player-profile__skills-heading,.forge-player-profile__skill-label,.forge-player-profile__context span,.forge-composite-summary__context,.forge-composite-summary__skill,.forge-composite-summary__best,.forge-part-card__equipment,.forge-part-card__skill,.forge-part-card__value,.forge-part-card__meta,.forge-body-note,.forge-shades__rank,.forge-shades h4,.forge-shades__season,.forge-shades__players p,.forge-shades__note')];
        const clippedText = textNodes.filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2).map(element => ({
          selector: element.className?.baseVal || element.className || element.tagName.toLowerCase(),
          text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 100),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          intentionalEllipsis: getComputedStyle(element).textOverflow === 'ellipsis',
          rect: rect(element),
        }));
        const intersections = [];
        for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
          const a = cards[i].rect, b = cards[j].rect;
          const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          if (width > 2 && height > 2) intersections.push({ first: cards[i].skill, second: cards[j].skill, overlap: { width, height } });
        }
        const profile = document.querySelector('.forge-draft-profile');
        const reel = document.querySelector('.forge-draft-workspace > aside');
        const profileBox = profile?.getBoundingClientRect(), reelBox = reel?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
          stage: stage ? rect(stage) : null,
          profile: profile ? {
            rect: rect(profile), reel: rect(reel),
            underWheel: Math.abs(profileBox.x - reelBox.x) <= 1 && Math.abs(profileBox.top - reelBox.bottom - 16) <= 1,
            belowStage: profileBox.top >= stage.getBoundingClientRect().bottom,
            identityDirection: document.querySelector('.forge-player-profile__identity') ? getComputedStyle(document.querySelector('.forge-player-profile__identity')).flexDirection : null,
          } : null,
          summary: summary ? {
            rect: rect(summary),
            abovePlayer: summary.getBoundingClientRect().bottom <= viewer.getBoundingClientRect().top,
            selections: document.querySelectorAll('.forge-composite-summary__selection').length,
            filled: document.querySelectorAll('.forge-composite-summary__selection--filled').length,
            overall: document.querySelector('.forge-composite-summary__score strong').textContent,
            gradeTallyVisible: !!document.querySelector('.forge-composite-summary__grades'),
            selectionRail: rect(selectionRail),
            selectionScrollWidth: selectionRail.scrollWidth,
            selectionClientWidth: selectionRail.clientWidth,
          } : null,
          containerMode: getComputedStyle(document.querySelector('.forge-model-map')).height,
          cardCount: cards.length,
          cards,
          bodyMeasurements: document.querySelector('.forge-body-measurements') ? rect(document.querySelector('.forge-body-measurements')) : null,
          shades: document.querySelector('.forge-shades') ? {
            rect: rect(document.querySelector('.forge-shades')),
            names: [...document.querySelectorAll('.forge-shades h4')].map(node => node.textContent.trim()),
            playerRects: [...document.querySelectorAll('.forge-shades__players article')].map(rect),
          } : null,
          clippedText,
          cardIntersections: intersections,
          pageHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          stageBorder: getComputedStyle(stage).borderTopWidth,
          staticPlaceholder: !!document.querySelector('.forge-review-athlete span'),
        };
      });
      const filename = `${viewport.key}-${scenario.key}.png`;
      await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
      results.push({ viewport: viewport.key, scenario: scenario.key, label: scenario.label, screenshot: filename, metrics, consoleErrors });
      await page.close();
    }
  }

  await writeFile(path.join(outputDir, 'metrics.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  const summary = results.map(result => {
    const m = result.metrics;
    return `| ${result.viewport} | ${result.scenario} | ${m.stage?.width ?? 'missing'} | ${m.cardCount} | ${m.pageHorizontalOverflow ? 'yes' : 'no'} | ${m.clippedText.length} | ${m.cardIntersections.length} | ${m.shades?.names.join(', ') || 'hidden'} | [${result.screenshot}](./${result.screenshot}) |`;
  }).join('\n');
  await writeFile(path.join(outputDir, 'README.md'), `# Forge Stage layout review\n\nWindowless static rendering of the current ForgeStage.jsx, ForgeOvrPanel.jsx and ForgeShadesOf.jsx output. The component markup came from Vite SSR; src/index.css was transformed by Vite for generated Tailwind styles, and forgeStage.css was included directly. The 3D canvas subtree is replaced with an existing CPU review contact sheet and marked as a static placeholder. No app route or live 3D viewer was opened.\n\nViewports: 1280px (${reviewWorkspace ? '1200px workspace' : '900px stage'}), 740px, 390px, and 320px. States: empty wheel, five assigned skills, a selected Pick-mode attribute, a reveal with a long player name and note, and all slots filled with grades hidden. The sample player pool and rating values are fixture data used only to exercise the summary, Shades-of cards and long labels.\n\n| Viewport | State | Stage width | Cards | Page horizontal overflow | Clipped text nodes | Card intersections | Shades-of names | Screenshot |\n|---|---|---:|---:|---|---:|---:|---|---|\n${summary}\n\nDetailed bounds, clipped text records, intersection records, and browser console errors are in [metrics.json](./metrics.json). This review checks layout only; it does not establish app interactions, data correctness, browser-route behavior, or live 3D quality.\n`);
  const reportPath = path.join(outputDir, 'README.md');
  const report = await readFile(reportPath, 'utf8');
  const reportMarker = '\n\nDetailed bounds';
  if (!report.includes(reportMarker)) throw new Error('Could not locate the findings section in the generated review report.');
  const reviewNotes = [
    '## Visual findings',
    '',
    'The OVR and donor selections are inside Your composite, above the player area. At wide stage widths all ten selections form two horizontal rows; at compact widths the selection rail scrolls horizontally within the stage. Full donor names remain in the DOM and in each selection tooltip.',
    '',
    `Across ${results.length} renders: ${results.filter(r => r.metrics.pageHorizontalOverflow).length} page overflows, ${results.reduce((n, r) => n + r.metrics.clippedText.length, 0)} clipped text nodes, ${results.reduce((n, r) => n + r.metrics.cardIntersections.length, 0)} card intersections, and ${results.reduce((n, r) => n + r.consoleErrors.length, 0)} console errors. The summary was above the player in ${results.filter(r => r.metrics.summary?.abovePlayer).length}/${results.length} renders.${reviewWorkspace ? ' The actual ReelPanel and PlayerCard were also rendered; desktop profile bounds must start 16px beneath the wheel, and mobile profile bounds must follow the stage.' : ''}`,
    '',
    'The Google Fonts import was omitted from the offline fixture, so local fallback font metrics may differ slightly from the app. The CPU contact sheet is a labeled placeholder for the omitted 3D canvas.',
  ].join('\n');
  await writeFile(reportPath, report.replace(reportMarker, `\n\n${reviewNotes}\n\nDetailed bounds`));
  console.log(JSON.stringify({ outputDir, renders: results.length, results: results.map(({ viewport, scenario, screenshot, metrics, consoleErrors }) => ({ viewport, scenario, screenshot, stageWidth: metrics.stage?.width, summaryAbovePlayer: metrics.summary?.abovePlayer, profile: metrics.profile, pageHorizontalOverflow: metrics.pageHorizontalOverflow, clippedText: metrics.clippedText.length, cardIntersections: metrics.cardIntersections.length, consoleErrors })) }, null, 2));
  if (results.some(r => !r.metrics.summary?.abovePlayer || r.metrics.summary.selections !== 10 || r.metrics.pageHorizontalOverflow || r.metrics.clippedText.some(node => !node.intentionalEllipsis) || r.metrics.cardIntersections.length || r.consoleErrors.length || reviewWorkspace && !(r.viewport === 'desktop' ? r.metrics.profile?.underWheel : r.metrics.profile?.belowStage))) throw new Error('Forge stage layout checks failed; inspect metrics.json and the rendered screenshots.');
} finally {
  await browser?.close();
  await server.close();
}
