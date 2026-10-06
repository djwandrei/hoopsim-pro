import { TOOL_REGISTRY, TOOL_STATUSES } from './registry.js?v=20260927s&rev=phase7-complete-v2';

const STATUS_LABELS = Object.freeze({
  [TOOL_STATUSES.LIVE]: 'Live',
  [TOOL_STATUSES.PLANNED]: 'Planned',
  [TOOL_STATUSES.RESEARCH]: 'Research'
});

// Lineup DNA is an explanation layer inside Lineup Lab, so its hub card uses
// the same supplied transparent Lineup Lab emblem until it has a standalone
// emblem asset of its own.
const HUB_EMBLEM_OVERRIDES = Object.freeze({
  'lineup-dna': '../assets/games/lineup-lab-emblem-20260911.png'
});

const KIND_LABELS = Object.freeze({
  tool: 'Fan tool',
  game: 'Fan game'
});
const PLAY_LABELS = Object.freeze({
  'lineup-lab': ['Pick a team and season, set a focus, then build a five', 'Open Lineup Lab'],
  'lineup-dna': ['See your five’s roles, find a gap, then test a swap', 'Explore Lineup DNA'],
  'fix-the-five': ['Read the board, make one swap, then see your place', 'Play Fix the Five'],
  'draft-night': ['Pick five players by role, lock the lineup, then see your place', 'Play Draft Night'],
  'card-matchup-explorer': ['Find player-card matches, then browse the collection', 'Compare players & cards'],
  'virtual-pack-opening': ['Choose a card pool, then replay a seeded draw', 'Open a virtual pack'],
  'collection-lineup-builder': ['Find card matches, save your picks, and preview a lineup shape', 'Build from your collection'],
  'trade-package-builder': ['Choose cards for two trade lists, then compare their contents', 'Build packages'],
  'position-lens': ['Choose a season and team, then sort observed position and player totals', 'Browse positions'],
  'roster-fit-simulator': ['Choose a season, build a player group, then check your G/F/C targets', 'Check roster shape'],
  'franchise-rebuild-challenge': ['Choose a season, set rebuild goals, then review checklist progress', 'Set rebuild goals'],
  'swishiq-studio': ['Pick a season, choose a tool, and read the result', 'Open SwishIQ Studio'],
});

const CARD_BULLETS = Object.freeze({
  'lineup-lab': ['Build a starting five or rotation', 'Use a preset or your own focus', 'Lock or exclude players'],
  'lineup-dna': ['See the roles your five covers', 'Spot a missing role', 'Test one swap'],
  'fix-the-five': ['Choose a legal replacement', 'Lock your move', 'See the board result'],
  'draft-night': ['Pick one player for each role', 'Lock the lineup', 'See the board result'],
  'card-matchup-explorer': ['Search a player', 'Browse matching cards', 'Jump back to the Lab'],
  'virtual-pack-opening': ['Search the current basketball catalog', 'Choose a card pool', 'Replay a uniform seeded draw'],
  'collection-lineup-builder': ['Find matching player cards', 'Save a browser-local list', 'Preview profile-position fit'],
  'trade-package-builder': ['Choose cards from the catalog', 'Organize two hypothetical trade lists', 'Compare listed items'],
  'position-lens': ['Filter teams, seasons, and positions', 'Sort observed totals', 'Review sample details'],
  'roster-fit-simulator': ['Select player-team stints by season', 'Set guard, forward, and center targets', 'Check position coverage'],
  'franchise-rebuild-challenge': ['Choose a focus team and season', 'Set group and role targets', 'Review checklist progress'],
  'swishiq-studio': ['Choose an exact season', 'See which tools have results', 'Open a tool'],
});

const CARD_DEFINITIONS = Object.freeze({
  'lineup-lab': {
    uses: 'A team, season, focus, and player rules.',
    result: 'A five or rotation that fits those rules.',
  },
  'lineup-dna': {
    uses: 'Your Lineup Lab five and its roles.',
    result: 'A role summary and one-swap comparison.',
  },
  'fix-the-five': {
    uses: 'One fixed player pool and board.',
    result: 'Your place among the legal swaps.',
  },
  'draft-night': {
    uses: 'One player pool and its role rules.',
    result: 'A legal five and its board rank.',
  },
  'card-matchup-explorer': {
    uses: 'A player search and matching cards.',
    result: 'Matching DJHC card records.',
  },
  'virtual-pack-opening': {
    uses: 'A card pool of your choice and a seed.',
    result: 'A replayable draw result, not real-world pack odds or ownership.',
  },
  'workshop': {
    uses: 'The preview and settings chosen here.',
    result: 'Saved settings, not a finished result.',
  },
  'rotation-rescue': {
    uses: 'A team brief, build mode, and rules.',
    result: 'A five or rotation you can review.',
  },
  'swishiq-call': {
    uses: 'An opponent brief and your priorities.',
    result: 'A historical coaching comparison.',
  },
  'what-breaks-this-five': {
    uses: 'A five-player case and one role question.',
    result: 'A role-coverage explanation when connected.',
  },
  'collection-lineup-builder': {
    uses: 'Your saved card matches and lineup rules.',
    result: 'A lineup preview; your catalog and inventory stay unchanged.',
  },
  'era-roster-challenges': {
    uses: 'A historical brief, roster facts, and your rules.',
    result: 'A replayable challenge with clear rules.',
  },
  'trade-package-builder': {
    uses: 'Your selected cards and trade notes.',
    result: 'A contents comparison, not a value or fairness grade.',
  },
  'position-lens': {
    uses: 'Team, season, and position data.',
    result: 'Observed position assignments and player totals.',
  },
  'roster-fit-simulator': {
    uses: 'Observed player/team stints and your position targets.',
    result: 'Declared-position coverage, not a legal or predictive fit.',
  },
  'franchise-rebuild-challenge': {
    uses: 'Player-team stints and your rebuild checklist.',
    result: 'Checklist progress, not transaction or player-impact evaluation.',
  },
  'nba-analytics-explorer': {
    uses: 'Play-by-play records and a comparison choice.',
    result: 'A research view when enough data is available.',
  },
  'role-evolution-reel': {
    uses: 'Public career summaries and a clear sample.',
    result: 'A scoped career comparison.',
  },
  'era-translation-challenge': {
    uses: 'Complete season groups, position filters, and sample limits.',
    result: 'An era comparison with visible groups and limits.',
  },
  'archetype-cohort-lab': {
    uses: 'Era, position, style preferences, and a similarity recipe.',
    result: 'A bounded similarity view, not a value verdict.',
  },
  'swishiq-studio': {
    uses: 'The selected players, board, and season view.',
    result: 'A view of those records, not a future prediction.',
  },
});

const HUB_SUMMARIES = Object.freeze({
  'lineup-lab': 'Choose a team and season, set a focus, then build a five or rotation.',
  'lineup-dna': 'See each player’s role, spot a gap, and test one swap.',
  'fix-the-five': 'Make one legal swap, lock it, and see your place on the board.',
  'rotation-rescue': 'Build a five or rotation for a historical team and check the challenge rules.',
  'swishiq-call': 'Set priorities from an opponent profile and compare counter-lineups.',
  'draft-night': 'Pick five players by role, lock the lineup, and see its board rank.',
  'what-breaks-this-five': 'Study one lineup, identify a role gap, and read the explanation.',
  'card-matchup-explorer': 'Find player-card matches and browse the collection.',
  'virtual-pack-opening': 'Choose a group of cards and replay a seeded draw.',
  'collection-lineup-builder': 'Save player-card matches and preview a lineup shape.',
  'era-roster-challenges': 'Recreate an iconic roster or take on a historical team challenge.',
  'trade-package-builder': 'Compare two hypothetical trade lists using cards from the catalog.',
  'position-lens': 'Filter observed position assignments by team and season, then sort player totals.',
  'roster-fit-simulator': 'Build a player group from a season and check guard, forward, and center targets.',
  'franchise-rebuild-challenge': 'Choose a season, set group and role goals, and review checklist progress.',
  'swishiq-studio': 'Explore player data and see which Studio tools are available.',
  'nba-analytics-explorer': 'Explore player combinations and impact across games.',
  'exact-lineup-studies': 'Compare exact player groups across seasons.',
  'pair-fit-lab': 'Review descriptive results for player pairs.',
  'signal-versus-noise': 'Check repeated samples for stable patterns.',
  'impact-projection-ledger': 'Compare historical impact and prospective projections.',
  'team-dna-atlas': 'Compare team style in one season.',
  'role-evolution-reel': 'Follow changes in a player’s role over a career.',
  'career-crossroads': 'Explore hypothetical career paths beside historical context.',
  'era-translation-challenge': 'Compare player-seasons across eras and positions.',
  'archetype-forge': 'Review player profiles with a chosen style recipe.',
  'cohort-lab': 'Choose a comparison group across a season or career.',
});

const RESEARCH_STATUS_LABELS = Object.freeze({
  'capability-gated': 'Limited availability',
  'data-needed': 'Data needed',
  'not-ready': 'Not available yet',
  available: 'Available in Studio',
});

const RESEARCH_AVAILABILITY_COPY = Object.freeze({
  'nba-analytics-explorer': 'Shared-floor, on/off, context, and impact comparisons need play-by-play data.',
  'exact-lineup-studies': 'Lineup Lab shows samples for seasons with matching lineups.',
  'pair-fit-lab': 'Studio Chemistry includes shared-floor or exact-lineup samples for some seasons.',
  'signal-versus-noise': 'Repeated observations across games are needed to assess which patterns hold over time.',
  'impact-projection-ledger': 'Some Studio seasons include observed impact; a separate projection report is in development.',
  'team-dna-atlas': 'Current season tables provide baselines only; observed team-style results are not included.',
  'role-evolution-reel': 'Some Studio profiles include career history; a role-change comparison is in development.',
  'career-crossroads': 'Career Lab compares paths when a scenario and career history are available.',
  'era-translation-challenge': 'Era comparisons require complete season groups with positions, games, and minutes.',
  'archetype-forge': 'Composite Forge uses style profiles as build inputs, not player-value grades.',
  'cohort-lab': 'Composite Forge keeps exact-season groups separate from multi-season groups.',
});

function hubSummary(tool) {
  return HUB_SUMMARIES[tool.id] || 'See what is available in this experience.';
}

export function filterPlayableTools(filter = 'all') {
  return TOOL_REGISTRY.filter(tool => tool.status === TOOL_STATUSES.LIVE && (filter === 'all' || (filter === 'games' ? tool.kind === 'game' : tool.kind === 'tool')));
}

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function appendMarker(parent, tool, className = 'tool-marker') {
  const emblem = HUB_EMBLEM_OVERRIDES[tool.id] || tool.emblem;
  const marker = appendText(parent, 'span', className, emblem ? '' : tool.marker);
  marker.setAttribute('aria-hidden', 'true');
  if (emblem) {
    const picture = document.createElement('picture');
    picture.className = 'tools-featured-card__emblem-picture';
    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = emblem.replace(/\.png$/i, '.webp');
    const image = document.createElement('img');
    image.alt = '';
    image.width = 96;
    image.height = 96;
    image.loading = 'lazy';
    image.decoding = 'async';
    marker.classList.add('has-game-emblem');
    picture.append(source, image);
    marker.append(picture);
    image.src = new URL(emblem, import.meta.url).href;
  }
  return marker;
}

function appendDefinitionRows(parent, tool, className = 'tools-featured-card__definitions') {
  const definitions = CARD_DEFINITIONS[tool.id];
  if (!definitions) return;
  const disclosure = document.createElement('details');
  disclosure.className = `${className}--disclosure`;
  appendText(disclosure, 'summary', '', 'What to expect');
  const list = document.createElement('dl');
  list.className = className;
  [['Uses', definitions.uses], ['Result', definitions.result]].forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = className.replace(/s$/, '');
    appendText(row, 'dt', '', label);
    appendText(row, 'dd', '', value);
    list.append(row);
  });
  disclosure.append(list);
  parent.append(disclosure);
}

function appendHighlights(parent, tool) {
  return;
}

function createFeaturedTool(tool) {
  const card = document.createElement('article');
  const titleId = `tool-title-${tool.id}`;
  card.className = 'tools-featured-card hub-card';
  card.dataset.toolId = tool.id;
  card.dataset.toolKind = tool.kind;
  card.setAttribute('aria-labelledby', titleId);

  const content = document.createElement('div');
  content.className = 'tools-featured-card__content';
  appendMarker(content, tool, 'tools-featured-card__marker');

  const copy = document.createElement('div');
  const play = PLAY_LABELS[tool.id];
  appendText(copy, 'h3', '', tool.title).id = titleId;
  appendText(copy, 'p', '', hubSummary(tool));
  const bullets = document.createElement('ul');
  bullets.className = 'tools-featured-card__bullets';
  (CARD_BULLETS[tool.id] || []).forEach(item => appendText(bullets, 'li', '', item));
  if (bullets.children.length) copy.append(bullets);
  appendHighlights(copy, tool);
  content.append(copy);
  card.append(content);

  const link = document.createElement('a');
  link.className = 'button';
  link.href = tool.href;
  link.textContent = play?.[1] || 'Open tool';
  card.append(link);
  return card;
}

function createRoadmapCard(tool) {
  const card = document.createElement('article');
  const titleId = `tool-title-${tool.id}`;
  card.className = 'tool-roadmap-card';
  card.dataset.toolId = tool.id;
  card.dataset.toolStatus = tool.status;
  card.setAttribute('aria-labelledby', titleId);
  appendMarker(card, tool, 'tool-roadmap-card__marker');

  const copy = document.createElement('div');
  appendText(copy, 'h3', '', tool.title).id = titleId;
  appendText(copy, 'p', 'tool-roadmap-card__summary', hubSummary(tool));
  appendDefinitionRows(copy, tool, 'tool-roadmap-card__definitions');

  const footer = document.createElement('div');
  footer.className = 'tool-roadmap-card__footer';
  appendText(footer, 'span', 'tool-roadmap-card__status', STATUS_LABELS[tool.status]);
  if (tool.href) {
    const link = document.createElement('a');
    link.className = 'tool-roadmap-card__link';
    link.href = tool.href;
    const label = tool.launchLabel || 'Open tool';
    link.textContent = label;
    link.setAttribute('aria-label', `${label} for ${tool.title}`);
    footer.append(link);
  }
  copy.append(footer);
  card.append(copy);
  return card;
}

function createResearchTool(tool) {
  const card = document.createElement('article');
  const titleId = `tool-title-${tool.id}`;
  card.className = 'tool-research-card';
  card.dataset.toolId = tool.id;
  card.dataset.toolStatus = tool.status;
  card.setAttribute('aria-labelledby', titleId);
  appendMarker(card, tool, 'tool-research-card__marker');

  const copy = document.createElement('div');
  appendText(copy, 'h3', '', tool.title).id = titleId;
  appendText(copy, 'p', '', hubSummary(tool));
  appendDefinitionRows(copy, tool, 'tool-research-card__definitions');
  appendText(copy, 'small', '', RESEARCH_AVAILABILITY_COPY[tool.id] || 'Availability details are being updated.');
  card.append(copy);
  appendText(card, 'span', 'tool-research-card__status', RESEARCH_STATUS_LABELS[tool.researchState] || 'Research status');
  return card;
}

function filterRegistry(status) {
  if (status === 'all') return TOOL_REGISTRY;
  return TOOL_REGISTRY.filter((tool) => tool.status === status);
}

function formatToolsStatus(status, count) {
  const noun = count === 1 ? 'fan tool' : 'fan tools';
  if (status === 'all') return `Showing ${count} ${noun}.`;
  return `Showing ${count} ${STATUS_LABELS[status].toLowerCase()} ${noun}.`;
}

function countRegistryByStatus() {
  return Object.freeze({
    [TOOL_STATUSES.LIVE]: filterRegistry(TOOL_STATUSES.LIVE).length,
    [TOOL_STATUSES.PLANNED]: filterRegistry(TOOL_STATUSES.PLANNED).length,
    [TOOL_STATUSES.RESEARCH]: filterRegistry(TOOL_STATUSES.RESEARCH).length
  });
}

export { countRegistryByStatus, filterRegistry, formatToolsStatus };

function updateStatusSummary(counts) {
  Object.entries(counts).forEach(([status, count]) => {
    document.querySelectorAll(`[data-status-count="${status}"]`).forEach((element) => {
      element.textContent = String(count);
    });
  });

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const status = document.getElementById('toolsStatus');
  if (status) {
    status.textContent = `${total} ${total === 1 ? 'experience' : 'experiences'}: ${counts.live} ready, ${counts.planned} planned, ${counts.research} research.`;
  }
}

function renderTools() {
  const featured = document.getElementById('toolsFeatured');
  const roadmap = document.getElementById('toolsGrid');
  const research = document.getElementById('toolsResearch');
  if (!featured) return;

  const liveTools = filterRegistry(TOOL_STATUSES.LIVE);
  const plannedTools = filterRegistry(TOOL_STATUSES.PLANNED);
  const researchTools = filterRegistry(TOOL_STATUSES.RESEARCH);

  featured.replaceChildren(...liveTools.map(createFeaturedTool));
  roadmap?.replaceChildren(...plannedTools.map(createRoadmapCard));
  research?.replaceChildren(...researchTools.map(createResearchTool));
  updateStatusSummary(countRegistryByStatus());
  bindPlayPicker();
}

function bindPlayPicker() {
  const filters = [...document.querySelectorAll('[data-play-filter]')];
  const cards = [...document.querySelectorAll('#toolsFeatured .tools-featured-card')];
  const status = document.getElementById('playStatus');
  if (!filters.length && !document.getElementById('suggestPlay')) return;
  let selection = 'all';
  let suggestedId = '';
  const apply = filter => {
    selection = filter;
    const ids = new Set(filterPlayableTools(filter).map(tool => tool.id));
    cards.forEach(card => { card.hidden = !ids.has(card.dataset.toolId); card.classList.remove('is-suggested'); });
    filters.forEach(control => control.setAttribute('aria-pressed', String(control.dataset.playFilter === filter)));
    if (status) status.textContent = `${ids.size} ${filter === 'games' ? 'games' : filter === 'tools' ? 'tools' : 'experiences'} available. Choose one to begin.`;
  };
  filters.forEach(control => control.addEventListener('click', () => apply(control.dataset.playFilter)));
  document.getElementById('suggestPlay')?.addEventListener('click', () => {
    const choices = filterPlayableTools(selection).filter(tool => tool.id !== suggestedId);
    const tool = choices[Math.floor(Math.random() * choices.length)];
    if (!tool) return;
    suggestedId = tool.id;
    const card = cards.find(item => item.dataset.toolId === tool.id);
    cards.forEach(item => item.classList.toggle('is-suggested', item === card));
    if (status) status.textContent = `Try ${tool.title}: ${PLAY_LABELS[tool.id]?.[0] || tool.summary}`;
    card?.querySelector('a')?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  apply('all');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderTools, { once: true });
  } else {
    renderTools();
  }
}
