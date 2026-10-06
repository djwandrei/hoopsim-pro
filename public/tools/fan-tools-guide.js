/*
 * Shared first-visit guide for the SwishIQ fan-tool suite.
 *
 * The guide is deliberately local-first: dismissal and completion stay in
 * localStorage, and aggregate measurement is sent only when the visitor has
 * explicitly granted analytics consent. It does not inspect selections,
 * searches, player names, package rows, or result values.
 */

const STORAGE_PREFIX = 'djhc-fan-guide-v1:';
const GUIDE_EVENT = 'fan_guide';

const GUIDES = Object.freeze({
  lineup: Object.freeze({
    title: 'How Lineup Lab works',
    intro: 'Build a historical lineup, set the rules, then read the evidence behind the result.',
    steps: Object.freeze([
      ['Choose the data', 'Pick a team, season, and phase for the lineup.'],
      ['Set the plan', 'Choose a starting five or rotation, then set roles, minutes, locks, and exclusions.'],
      ['Run the search', 'Find lineups that fit your priorities. You can cancel or adjust them.'],
      ['Read the result', 'Review role coverage, minutes, alternatives, and the result details.'],
    ]),
    context: Object.freeze({
      nbaTeamInput: 'Team narrows the player pool for this season.',
      nbaSeasonInput: 'Choose the season whose recorded games you want to use.',
      nbaSeasonPhaseInput: 'Regular season and playoffs use separate evidence.',
      modeInput: 'Starting five compares five equal player profiles. Full rotation assigns all 240 minutes.',
      sizeInput: 'Use five for a starting five, or eight to twelve for a full rotation.',
    }),
  }),
  studio: Object.freeze({
    title: 'How SwishIQ Studio works',
    intro: 'Choose a published season, open a workbench, and read the result with its source and limits.',
    workbenches: Object.freeze({
      blueprint: Object.freeze({
        label: 'Player Blueprint',
        steps: Object.freeze([
          ['Choose a season', 'Select the season you want to inspect.'],
          ['Find a player', 'Use the season menu first, then filter by team, position, or name before opening the player profile.'],
          ['Read the profile', 'Use the stat slabs, rate bars, history, and evidence labels together.'],
        ]),
      }),
      chemistry: Object.freeze({
        label: 'Chemistry Lab',
        steps: Object.freeze([
          ['Choose a season', 'Select the season you want to compare.'],
          ['Choose a view', 'Compare two players from one team, or browse recorded lineups.'],
          ['Read the evidence', 'Check the recorded measures and sample sizes. Lineup observations do not prove a chemistry effect.'],
        ]),
      }),
      composite: Object.freeze({
        label: 'Composite Forge',
        steps: Object.freeze([
          ['Choose the pool', 'Choose one season or an available multi-season view.'],
          ['Assign players', 'Choose a player-season for each skill and review the source list.'],
          ['Build the recipe', 'Adjust each skill, review the changes, and place the new player on a team.'],
        ]),
      }),
      game: Object.freeze({
        label: 'Game Lab',
        steps: Object.freeze([
          ['Choose the matchup', 'Pick teams from the selected season.'],
          ['Make a choice', 'Use the visible rules and team context to make each pick.'],
          ['Read the result', 'Review the outcome, decision feedback, and Game Points.'],
        ]),
      }),
      season: Object.freeze({
        label: 'Season Lab',
        steps: Object.freeze([
          ['Choose the season', 'Select one season or the available multi-season mode.'],
          ['Set the league', 'Pick teams, rosters, season format, and number of runs.'],
          ['Read the scenario', 'Review standings, team measures, possible outcomes, and assumptions.'],
        ]),
      }),
      career: Object.freeze({
        label: 'Career Lab',
        steps: Object.freeze([
          ['Choose the player', 'Select a player and the last season to include in their history.'],
          ['Set the path', 'Choose career stage, development, workload, and how many seasons to explore.'],
          ['Separate history from future', 'Recorded seasons end at your cutoff; possible future paths appear separately.'],
        ]),
      }),
    }),
    context: Object.freeze({
      packageSelect: 'Choose a season to explore in Studio. Season Lab has its own season menu.',
      blueprintPlayerSelect: 'You can select multiple players from this season.',
      blueprintTeamFilter: 'Narrow the player list to one team.',
      blueprintPositionFilter: 'Position is shown only when the published mapping supports it.',
      seasonLabPackageSelect: 'Season Lab checks which team data is available for your selection.',
    }),
  }),
  'fix-five': Object.freeze({
    title: 'How Fix the Five works',
    intro: 'Repair one starting lineup with an allowed swap, then see the result.',
    steps: Object.freeze([
      ['Read the brief', 'Start with the fixed five and the one role or lineup problem.'],
      ['Compare choices', 'Review the three allowed replacements and their season context.'],
      ['Preview and lock', 'Preview one swap, then lock it when you are ready.'],
      ['Read the result', 'Review the rank, outcome, and Game Points.'],
    ]),
  }),
  'draft-night': Object.freeze({
    title: 'How Draft Night works',
    intro: 'Draft five players for the roles on today’s board, then review your choices.',
    steps: Object.freeze([
      ['Read the role', 'The board tells you which role is active and which cards are eligible.'],
      ['Compare the pool', 'Use player context to choose one eligible card without duplicates.'],
      ['Draft the five', 'Use Undo last pick if you want to revise a choice.'],
      ['Read the result', 'Review the rank, outcome, and Game Points.'],
    ]),
  }),
});

function safeStorage() {
  try {
    const storage = window.localStorage;
    const key = '__djhcFanGuideProbe';
    storage.setItem(key, '1');
    storage.removeItem(key);
    return storage;
  } catch {
    return null;
  }
}

function guideKey(id, suffix) {
  return `${STORAGE_PREFIX}${id}:${suffix}`;
}

function activeGuideId() {
  const requested = String(document.body?.dataset.fanHelp || '').trim().toLowerCase();
  if (requested && GUIDES[requested]) return requested;
  if (document.body?.dataset.page === 'swishiq-studio') return 'studio';
  if (document.body?.classList.contains('fix-five-page')) {
    return document.body.classList.contains('draft-night-page') ? 'draft-night' : 'fix-five';
  }
  if (document.querySelector('#optimizerForm')) return 'lineup';
  return null;
}

function currentStudioWorkbench() {
  const selected = document.querySelector('[data-workbench][aria-pressed="true"], [data-workbench].is-active');
  return String(selected?.dataset.workbench || 'blueprint').trim().toLowerCase() || 'blueprint';
}

function currentGuideConfig(id) {
  const guide = GUIDES[id];
  if (!guide) return null;
  if (id !== 'studio') return guide;
  const workbench = guide.workbenches[currentStudioWorkbench()] || guide.workbenches.blueprint;
  return { ...guide, ...workbench, id, workbench: currentStudioWorkbench() };
}

function sendAggregate(event, data = {}) {
  let consent = false;
  try {
    consent = window.localStorage?.getItem('djhc-analytics-consent') === 'granted'
      || window.localStorage?.getItem('analytics-consent') === 'granted';
  } catch { /* local-only behavior remains available */ }
  if (!consent || typeof window.DJ?.trackEvent !== 'function') return;
  try {
    window.DJ.trackEvent(event, { kind: 'guide', ...data });
  } catch { /* telemetry must never interrupt a guide */ }
}

function stepNodes(config) {
  return config.steps.map(([title, copy], index) => `
    <li class="fan-help-dialog__step">
      <span class="fan-help-dialog__step-number" aria-hidden="true">${index + 1}</span>
      <span><strong>${title}</strong><small>${copy}</small></span>
    </li>`).join('');
}

function mount() {
  const id = activeGuideId();
  const initial = id ? currentGuideConfig(id) : null;
  if (!initial) return;
  const storage = safeStorage();
  // Keep guide access outside normal flow. Inserting the old full-width card
  // after the hero on DOMContentLoaded shifted every section below it after
  // first paint, especially on short mobile viewports.
  const floating = document.createElement('button');
  floating.type = 'button';
  floating.className = 'fan-help-floating';
  floating.setAttribute('aria-label', 'Open the How this works guide');
  floating.setAttribute('aria-haspopup', 'dialog');
  floating.textContent = '?';
  document.body.append(floating);

  // Build the full guide and its context hints only when requested so pages
  // do not pay for hidden dialog DOM and listeners on first paint.
  let dialog = null;
  let title = null;
  let intro = null;
  let steps = null;
  let complete = null;

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'fan-help-dialog';
    dialog.id = `fanHelpDialog-${id}`;
    floating.setAttribute('aria-controls', dialog.id);
    dialog.setAttribute('aria-labelledby', `${dialog.id}-title`);
    dialog.innerHTML = `
      <div class="fan-help-dialog__frame">
        <div class="fan-help-dialog__header">
          <div><span class="fan-help-launcher__eyebrow">Quick start</span><h2 id="${dialog.id}-title"></h2><p class="fan-help-dialog__intro"></p></div>
          <button type="button" class="fan-help-dialog__close" data-fan-help-close aria-label="Close guide">×</button>
        </div>
        <ol class="fan-help-dialog__steps"></ol>
        <div class="fan-help-dialog__footer">
          <label class="fan-help-dialog__done"><input type="checkbox" data-fan-help-complete> Remember that I finished this guide</label>
          <button type="button" class="button fan-help-dialog__complete" data-fan-help-complete-button>Done</button>
        </div>
      </div>`;
    document.body.append(dialog);
    title = dialog.querySelector('h2');
    intro = dialog.querySelector('.fan-help-dialog__intro');
    steps = dialog.querySelector('.fan-help-dialog__steps');
    complete = dialog.querySelector('[data-fan-help-complete]');
    dialog.querySelector('[data-fan-help-close]').addEventListener('click', () => closeGuide());
    dialog.querySelector('[data-fan-help-complete-button]').addEventListener('click', markComplete);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeGuide('backdrop'); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeGuide('escape'); });
  }

  function renderGuide() {
    ensureDialog();
    const config = currentGuideConfig(id);
    if (!config) return;
    dialog.dataset.fanHelpWorkbench = config.workbench || '';
    title.textContent = config.title;
    intro.textContent = config.intro;
    steps.innerHTML = stepNodes(config);
    mountContextHints(config.context || {});
  }

  function openGuide(source = 'floating') {
    ensureDialog();
    renderGuide();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    sendAggregate(GUIDE_EVENT, { action: 'open', source });
  }

  function closeGuide(reason = 'close') {
    if (!dialog) return;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    sendAggregate(GUIDE_EVENT, { action: reason });
  }

  function markComplete() {
    if (complete?.checked) storage?.setItem(guideKey(id, 'completed'), '1');
    storage?.setItem(guideKey(id, 'dismissed'), '1');
    closeGuide('complete');
  }

  function mountContextHints(context = {}) {
    for (const [controlId, copy] of Object.entries(context)) {
      const control = document.getElementById(controlId);
      const label = control?.closest('label');
      if (!control || !label || label.querySelector(`[data-fan-help-context="${controlId}"]`)) continue;
      const hint = document.createElement('span');
      hint.className = 'fan-help-context';
      hint.dataset.fanHelpContext = controlId;
      hint.setAttribute('role', 'note');
      hint.textContent = copy;
      label.append(hint);
    }
  }

  floating.addEventListener('click', () => openGuide('floating'));

  if (id === 'studio') {
    document.addEventListener('click', event => {
      if (!dialog) return;
      if (event.target.closest('[data-workbench]')) window.setTimeout(renderGuide, 0);
    });
  }

  const dismissed = storage?.getItem(guideKey(id, 'dismissed')) === '1';
  if (!dismissed) floating.setAttribute('aria-label', 'Open the How this works guide; quick start available');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => mount();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export { GUIDES };
