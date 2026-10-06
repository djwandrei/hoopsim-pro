/**
 * Public registry for DJHC fan tools.
 *
 * The registry is deliberately metadata-only. A tool can describe its route,
 * data requirements, and implementation boundary here without importing
 * commerce data or initializing a backend client on the hub page.
 */

export const TOOL_STATUSES = Object.freeze({
  LIVE: 'live',
  PLANNED: 'planned',
  RESEARCH: 'research'
});

const freezeTool = (tool) => Object.freeze({
  ...tool,
  capabilities: Object.freeze([...tool.capabilities]),
  dependencies: Object.freeze([...tool.dependencies]),
  highlights: Object.freeze([...(tool.highlights || [])])
});

const workshopHref = (id) => `./workshop/?experience=${encodeURIComponent(id)}`;

export const TOOL_REGISTRY = Object.freeze([
  freezeTool({
    id: 'lineup-lab',
    kind: 'tool',
    marker: 'NBA',
    emblem: '../assets/games/lineup-lab-emblem-20260911.png',
    title: 'NBA Lineup Lab',
    eyebrow: 'Live fan tool',
    status: TOOL_STATUSES.LIVE,
    href: '../lineup-lab/',
    summary: 'Pick a team and season, choose a focus, then build a five or rotation.',
    capabilities: [
      'Build a starting five or full rotation',
      'Use a preset or choose your own focus',
      'Lock players or filter the roster'
    ],
    highlights: [
      'Lineup builder',
      'Historical team-seasons',
      'Read-only fan tool'
    ],
    dependencies: [
      'Reviewed NBA player and team data',
      'Read-only public stats'
    ],
    implementationNotes: 'Keep the exact solver and source disclosures isolated from storefront checkout code.'
  }),
  freezeTool({
    id: 'lineup-dna',
    kind: 'tool',
    marker: 'DNA',
    emblem: '../assets/games/lineup-lab-emblem-20260911.png',
    title: 'Lineup DNA',
    eyebrow: 'Live Lineup Lab explanation',
    status: TOOL_STATUSES.LIVE,
    href: '../lineup-lab/',
    summary: 'See each player’s role, spot a gap, and test one swap.',
    capabilities: [
      'See the roles your five covers',
      'Spot a missing role',
      'Test one swap before you rebuild'
    ],
    dependencies: [
      'Current role definitions and lineup helpers',
      'Lineup output, rate views, and source notes'
    ],
    implementationNotes: 'This is an in-place Lineup Lab explanation layer; box-score movement, switching, or matchup labels remain clearly marked as proxies or unavailable.'
  }),
  freezeTool({
    id: 'fix-the-five',
    kind: 'game',
    marker: '5x',
    emblem: '../assets/games/fix-the-five-emblem-20260911.png',
    title: 'Fix the Five',
    eyebrow: 'Daily SwishIQ lineup game',
    status: TOOL_STATUSES.LIVE,
    href: './fix-the-five/',
    summary: 'Make one legal swap, lock it, and see your place on the board.',
    capabilities: [
      'One clear swap in each round',
      'One fixed board per challenge',
      'A board rank, not a win prediction'
    ],
    highlights: [
      'Five daily SwishIQ swaps',
      'Sealed fixed-board rank',
      'Local-only progress'
    ],
    dependencies: [
      'Published SwishIQ exact-season data',
      'Daily board and sealed reveal service'
    ],
    implementationNotes: 'Every result stays inside one source-labeled SwishIQ board. Public stats are context only; private model values remain private, and an unavailable source never falls back to an older fixture.'
  }),
  freezeTool({
    id: 'rotation-rescue',
    kind: 'game',
    marker: 'Coach',
    title: 'Rotation Rescue',
    eyebrow: 'Upcoming fan tool',
    status: TOOL_STATUSES.PLANNED,
    href: workshopHref('rotation-rescue'),
    launchLabel: 'Preview setup',
    summary: 'Choose a historical team brief, build a five or rotation, and see which rules your choices satisfy.',
    capabilities: [
      'Seeded team-season challenge setup',
      'Five-player and full-rotation build modes',
      'Explainable constraint and score breakdowns'
    ],
    dependencies: [
      'Exact optimizer and historical team-season pools',
      'Versioned challenge definitions and role coverage'
    ],
    implementationNotes: 'Score defined constraint completion or distance from the optimizer result; never invent a season-win probability.'
  }),
  freezeTool({
    id: 'swishiq-call',
    kind: 'game',
    marker: 'SwishIQ',
    title: 'SwishIQ Call',
    eyebrow: 'Upcoming fan tool',
    status: TOOL_STATUSES.PLANNED,
    href: workshopHref('swishiq-call'),
    launchLabel: 'Preview setup',
    summary: 'Read an opponent profile, set priorities, and compare your counter-lineup.',
    capabilities: [
      'Opponent-profile challenge briefs',
      'Priority and counter-lineup choices',
      'A source-labeled plan reveal'
    ],
    dependencies: [
      'Historical team-season profiles',
      'Opponent game-plan helpers and Lineup Lab priorities'
    ],
    implementationNotes: 'Keep the exercise historical and avoid unsupported player-to-player defensive assignments, injury claims, or live schedule claims.'
  }),
  freezeTool({
    id: 'draft-night',
    kind: 'game',
    marker: 'Draft',
    emblem: '../assets/games/draft-night-emblem-20260911.png',
    title: 'Draft Night',
    eyebrow: 'Daily SwishIQ lineup game',
    status: TOOL_STATUSES.LIVE,
    href: './draft-night/',
    summary: 'Pick five players by role, lock the lineup, and see its board rank.',
    capabilities: [
      'Five simple role-based picks',
      'A fixed daily board',
      'A result after you lock the lineup'
    ],
    highlights: [
      'Up to 243 paths when the board supports it',
      'Five-pick replay loop',
      'Local-only score'
    ],
    dependencies: [
      'Published SwishIQ exact-season data',
      'Daily board and sealed reveal service'
    ],
    implementationNotes: 'The rank exists only inside the daily SwishIQ board. Public stats label player context; private model values stay private, and the game remains unavailable rather than using old fixtures.'
  }),
  freezeTool({
    id: 'what-breaks-this-five',
    kind: 'game',
    marker: 'Fit',
    title: 'What Breaks This Five?',
    eyebrow: 'Upcoming fan tool',
    status: TOOL_STATUSES.PLANNED,
    href: workshopHref('what-breaks-this-five'),
    launchLabel: 'Preview setup',
    summary: 'Study one five-player lineup, choose the key role gap, and read the explanation.',
    capabilities: [
      'Curated lineup case files',
      'Role-gap choices',
      'Explainable coverage and feasibility reveal'
    ],
    dependencies: [
      'Current role coverage and objective metrics',
      'Exact lineup feasibility and reviewed case definitions'
    ],
    implementationNotes: 'Treat defensive labels derived from box scores as proxies and distinguish exact lineup facts from modeled role assessments.'
  }),
  freezeTool({
    id: 'card-matchup-explorer',
    kind: 'tool',
    marker: 'Cards',
    title: 'Player & Card Matchups',
    eyebrow: 'Collector tool',
    phase: '7.1',
    status: TOOL_STATUSES.LIVE,
    href: './player-card-matchups/',
    summary: 'Search a player, review confirmed card links, and browse the collection.',
    emblem: '../assets/games/card-matchups-emblem-20260911.png',
    capabilities: [
      'Exact player-to-card matches',
      'Season context beside eligible listings',
      'A path back to your lineup'
    ],
    dependencies: [
      'Active athlete identities and verified product mappings',
      'One buyer-facing catalog projection'
    ],
    implementationNotes: 'Do not infer a card match from title similarity alone; ambiguous identities remain unmatched.'
  }),
  freezeTool({
    id: 'virtual-pack-opening',
    kind: 'tool',
    marker: 'Pack',
    title: 'Virtual Pack Opening',
    eyebrow: 'Local collector simulation',
    phase: '10',
    status: TOOL_STATUSES.LIVE,
    href: './virtual-pack-opening/',
    summary: 'Declare a pool of reviewed public catalog cards, then replay a seeded draw.',
    launchLabel: 'Open a virtual pack',
    capabilities: [
      'Search the current public basketball catalog',
      'Require an exact reviewed player mapping before eligibility',
      'Replay a uniform draw from your declared pool'
    ],
    dependencies: [
      'Current public basketball catalog',
      'Exact reviewed NBA product mapping service'
    ],
    implementationNotes: 'This is a browser-local simulation. It does not represent real pack odds, rarity, purchase, inventory ownership, or a server-side result.'
  }),
  freezeTool({
    id: 'collection-lineup-builder',
    kind: 'tool',
    marker: 'My 5',
    emblem: '../assets/games/card-matchups-emblem-20260911.png',
    title: 'Build from Your Collection',
    eyebrow: 'Live collector tool',
    phase: '7.2',
    status: TOOL_STATUSES.LIVE,
    href: './collection-lineup-builder/',
    summary: 'Save verified player-card links and preview a profile-position lineup shape.',
    capabilities: [
      'Search and recheck verified player-card links',
      'Keep a browser-local saved or user-marked-owned list',
      'Preview a two-guard, two-forward, one-center profile shape'
    ],
    highlights: ['Browser-local list', 'Verified card links', 'Profile-position preview'],
    dependencies: [
      'Current verified product-to-player mapping',
      'Player profile primary-position data'
    ],
    implementationNotes: 'Saved and user-marked-owned are user labels only. The preview does not prove ownership, season eligibility, a legal historical lineup, player quality, or change catalog state.'
  }),
  freezeTool({
    id: 'era-roster-challenges',
    kind: 'game',
    marker: 'Era',
    title: 'Era & Roster Challenges',
    eyebrow: 'Planned history game',
    status: TOOL_STATUSES.PLANNED,
    href: null,
    summary: 'Recreate an iconic roster or solve a historical team challenge.',
    capabilities: [
      'Iconic roster reconstruction',
      'Era-versus-era scenarios',
      'Clear rules and replayable results'
    ],
    dependencies: [
      'Stable historical team-season facts',
      'Versioned challenge definitions and deterministic scoring'
    ],
    implementationNotes: 'Challenge rules should be versioned so an old share link remains explainable after data refreshes.'
  }),
  freezeTool({
    id: 'trade-package-builder',
    kind: 'tool',
    marker: 'Trade',
    title: 'Trade & Package Builder',
    eyebrow: 'Hypothetical collector tool',
    phase: '7.2',
    status: TOOL_STATUSES.LIVE,
    href: './trade-package-builder/',
    summary: 'Build two local packages from verified player-card links and compare their listed contents.',
    launchLabel: 'Build packages',
    capabilities: [
      'Find player-card links in the current public catalog',
      'Add, move, remove, and annotate package items',
      'Compare contents and mapping status without a value grade'
    ],
    dependencies: [
      'Current verified product-to-player mappings',
      'Browser-local draft storage'
    ],
    implementationNotes: 'This is a local hypothetical collector worksheet. It does not model player trades, roster moves, ownership, prices, or deal fairness and never starts checkout.'
  }),
  freezeTool({
    id: 'position-lens',
    kind: 'tool',
    marker: 'Role',
    title: 'Position Lens',
    eyebrow: 'Exact-season stats · read only',
    phase: '7.2',
    status: TOOL_STATUSES.LIVE,
    href: './position-lens/',
    summary: 'Filter an exact team-season roster, inspect observed position assignments, and sort player totals.',
    launchLabel: 'Browse positions',
    capabilities: ['Exact-season team and position filters', 'Observed player-season totals', 'Sortable, keyboard-accessible tables'],
    dependencies: ['Verified exact-season roster and player-season artifacts'],
    implementationNotes: 'Show only exact-package observed roster and player-season rows. This view produces no modeled roles, fit scores, or projections.'
  }),
  freezeTool({
    id: 'roster-fit-simulator',
    kind: 'tool',
    marker: 'Fit',
    title: 'Roster Fit Simulator',
    eyebrow: 'Hypothetical position checklist',
    phase: '7.2',
    status: TOOL_STATUSES.LIVE,
    href: './roster-fit-simulator/',
    summary: 'Build a local player group from exact-season rows and check your declared guard, forward, and center targets.',
    launchLabel: 'Check roster shape',
    capabilities: ['Exact-season player/team stints', 'User-set G/F/C coverage targets', 'Browser-local planning references'],
    dependencies: ['Verified exact-season player and position rows'],
    implementationNotes: 'This checks declared-position coverage only. Player/team stints are not simultaneous roster snapshots; do not label the checklist as performance, lineup legality, or predictive fit.'
  }),
  freezeTool({
    id: 'franchise-rebuild-challenge',
    kind: 'tool',
    marker: 'GM',
    title: 'Franchise Rebuild Challenge',
    eyebrow: 'Historical rebuild checklist',
    phase: '7.2',
    status: TOOL_STATUSES.LIVE,
    href: './franchise-rebuild-challenge/',
    summary: 'Choose an exact season, set a player-group size and role checklist, then review source-row progress.',
    launchLabel: 'Set rebuild goals',
    capabilities: ['Exact-season player/team stints', 'User-set group and role targets', 'Checklist progress against verified source rows'],
    dependencies: ['Verified exact-season player and position rows'],
    implementationNotes: 'The result checks only user-set checklist targets and source-team row counts. It does not validate transactions, contracts, salary cap, draft rights, legal rosters, retention, or player impact.'
  }),
  freezeTool({
    id: 'swishiq-studio',
    kind: 'tool',
    marker: 'SwishIQ',
    emblem: '../assets/games/swishiq-studio-emblem-20260913.png',
    title: 'SwishIQ Studio',
    eyebrow: 'Published NBA workspace',
    status: TOOL_STATUSES.LIVE,
    href: './swishiq-studio/',
    summary: 'Explore published player evidence and see which tools are ready.',
    capabilities: [
      'Exact-season evidence when published',
      'Clear package and capability status',
      'Player, Chemistry, Composite, Game, Season, and Career labs'
    ],
    highlights: [
      'Published SwishIQ packages',
      'Read-only evidence workspace',
      'Private inputs stay off the public site'
    ],
    dependencies: [
      'Accepted SwishIQ exact-season packages',
      'Buyer-safe static public projections'
    ],
    implementationNotes: 'The public projection retains observed stats and opaque ids only. Private source rows, provider ids, and fitted model components remain outside the storefront.'
  }),
  freezeTool({
    id: 'nba-analytics-explorer',
    kind: 'tool',
    marker: 'Data',
    title: 'NBA Analytics Explorer',
    eyebrow: 'Research-gated tool',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'not-ready',
    researchMessage: 'Needs a licensed, validated play-by-play archive and a dedicated analytics database.',
    summary: 'Explore shared-floor, on/off, context, and impact data when the source is ready.',
    capabilities: [
      'Two- through five-player shared-floor views',
      'On/off and context splits',
      'Impact views with coverage labels'
    ],
    dependencies: [
      'Licensed, validated play-by-play source',
      'Dedicated analytics database and versioned model results'
    ],
    implementationNotes: 'Do not present raw plus-minus, estimated half-court splits, or incomplete provider archives as proven facts.'
  }),
  freezeTool({
    id: 'exact-lineup-studies',
    kind: 'tool',
    marker: 'Five',
    title: 'Exact Lineup Studies',
    eyebrow: 'Research view · package-gated',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: '../lineup-lab/',
    launchLabel: 'Open Lineup Lab',
    researchState: 'capability-gated',
    researchMessage: 'Exact lineup comparisons appear only when the selected package publishes matching evidence.',
    summary: 'Study exact lineups in a source-labeled historical package.',
    capabilities: ['Exact lineup sample', 'Package and season filters', 'Coverage-aware result'],
    dependencies: ['Accepted exact-five evidence for the selected package'],
    implementationNotes: 'The existing Lineup Lab and Chemistry views remain package-gated; never substitute pooled or approximate rows for an exact lineup.'
  }),
  freezeTool({
    id: 'pair-fit-lab',
    kind: 'tool',
    marker: 'Pair',
    title: 'Pair Fit Lab',
    eyebrow: 'Research view · package-gated',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Studio Chemistry can show descriptive shared-floor or exact-five evidence when the package supports it.',
    summary: 'Review observed player-pair evidence in a labeled season package.',
    capabilities: ['Pair selection', 'Shared-floor or exact-five sample', 'Coverage and source notes'],
    dependencies: ['Published pair evidence and matching player references'],
    implementationNotes: 'Do not present descriptive co-occurrence as causal chemistry or a forecast.'
  }),
  freezeTool({
    id: 'signal-versus-noise',
    kind: 'tool',
    marker: 'Signal',
    title: 'Signal Versus Noise',
    eyebrow: 'Research-gated tool',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'not-ready',
    researchMessage: 'No accepted noise, holdout, or repeated-sample research receipt is connected to a public view.',
    summary: 'Separate repeatable evidence from unstable small-sample movement.',
    capabilities: ['Repeated samples', 'Holdout and uncertainty context', 'Transparent sample thresholds'],
    dependencies: ['Retained game-level observations and validated holdout receipts'],
    implementationNotes: 'Do not claim stability from one split, one lineup, or synthetic-only examples.'
  }),
  freezeTool({
    id: 'impact-projection-ledger',
    kind: 'tool',
    marker: 'Impact',
    title: 'Impact and Projection Ledger',
    eyebrow: 'Research view · package-gated',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Eligible Studio packages expose separate impact and projection fields; a retained report ledger is not connected.',
    summary: 'Trace observed impact evidence separately from prospective model output.',
    capabilities: ['Observed and projected values kept separate', 'Source/version pins', 'Coverage and uncertainty'],
    dependencies: ['Accepted player-impact and projection package artifacts'],
    implementationNotes: 'Do not merge historical impact, model interpretation, and future hypotheses into one score.'
  }),
  freezeTool({
    id: 'team-dna-atlas',
    kind: 'tool',
    marker: 'DNA',
    title: 'Team DNA Atlas',
    eyebrow: 'Research view · data needed',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: './team-dna-atlas/',
    launchLabel: 'Open Team DNA Atlas',
    researchState: 'data-needed',
    researchMessage: 'The published exact-season rows are regression baselines; observed team-style values remain withheld.',
    summary: 'Compare published team-style evidence for two teams in one exact season.',
    capabilities: ['Exact-season package verification', 'Same-season team selection', 'Metric denominators and provenance'],
    dependencies: ['Observed team-style rows in the verified exact-season artifact'],
    implementationNotes: 'Regression baselines are not observations. Do not render values until every selected row passes the observed-evidence gate.'
  }),
  freezeTool({
    id: 'role-evolution-reel',
    kind: 'game',
    marker: 'Career',
    title: 'Role Evolution Reel',
    eyebrow: 'Research-gated game',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Career history is available in some Studio packages; no dedicated role-shift comparison is wired.',
    summary: 'Follow a career timeline and find the biggest observable role change.',
    capabilities: [
      'Multi-season career timelines',
      'Role-shift comparisons',
      'Source-labeled explanation'
    ],
    dependencies: [
      'Public multi-season player summaries',
      'Reliable season denominators and labeled source scope'
    ],
    implementationNotes: 'Do not infer injury, locker-room, coaching, or tracking-based causes from observable box-score role signals.'
  }),
  freezeTool({
    id: 'career-crossroads',
    kind: 'game',
    marker: 'Path',
    title: 'Career Crossroads',
    eyebrow: 'Research view · package-gated',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Career Lab can compare a hypothetical modeled path with retained career context when both are published.',
    summary: 'Explore a hypothetical career path beside retained historical context.',
    capabilities: ['Scenario choices', 'Historical context', 'Hypothesis labels'],
    dependencies: ['Compatible career history and scenario package artifacts'],
    implementationNotes: 'Keep forecast assumptions distinct from observed history and do not imply causality.'
  }),
  freezeTool({
    id: 'era-translation-challenge',
    kind: 'game',
    marker: 'Era',
    title: 'Era Translation Challenge',
    eyebrow: 'Research-gated game',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Needs complete era and position cohorts with visible games, minutes, and rate denominators.',
    summary: 'Compare player-seasons within a clear era and position group.',
    capabilities: [
      'Era-relative comparison rounds',
      'Position and sample filters',
      'Group-aware explanations'
    ],
    dependencies: [
      'Complete labeled league-season cohorts',
      'Minutes, games, position, and rate thresholds'
    ],
    implementationNotes: 'A single roster or partial scrape cannot serve as a league-wide era baseline; the comparison cohort must be complete and visible.'
  }),
  freezeTool({
    id: 'archetype-forge',
    kind: 'tool',
    marker: 'Style',
    title: 'Archetype Forge',
    eyebrow: 'Research view · package-gated',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Composite Forge supports admitted profile archetypes; current outputs are inputs to a build, not player-value grades.',
    summary: 'Set a transparent style recipe and review eligible player-season profiles.',
    capabilities: [
      'Era-relative style controls',
      'Visible archetype recipe',
      'Eligible profile filters'
    ],
    dependencies: [
      'Admitted player profiles and versioned archetype inputs'
    ],
    implementationNotes: 'Show the exact recipe and eligible sample. Do not present box-score similarity as a definitive player-value verdict.'
  }),
  freezeTool({
    id: 'cohort-lab',
    kind: 'tool',
    marker: 'Cohort',
    title: 'Cohort Lab',
    eyebrow: 'Research view · package-gated',
    phase: '7.3',
    status: TOOL_STATUSES.RESEARCH,
    href: null,
    researchState: 'capability-gated',
    researchMessage: 'Composite Forge supports explicit donor cohorts; each build must keep exact-season and pooled scope distinct.',
    summary: 'Choose a visible comparison group with an explicit source and season scope.',
    capabilities: ['Exact and pooled cohorts labeled separately', 'Explicit donor selection', 'Sample details'],
    dependencies: ['Published donor profiles with complete season labels and denominators'],
    implementationNotes: 'Never pool different season scopes silently or treat a convenience cohort as a population.'
  })
]);
