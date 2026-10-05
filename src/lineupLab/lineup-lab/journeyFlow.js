// Installs the guided "journey" flow for the Lineup Lab. The site's
// browser-served build wraps the builder in a guided-workflow shell with a
// stage rail; the relayed build the studio boots ships without that markup
// (which also keeps the site's coaching-brief prompts dormant, since
// lab-experience.js requires .guided-workflow to exist). This recreates the
// guided structure with the site's own stage classes so its stylesheet drives
// the layout, and adds a studio-native rail. Pure DOM reorganization: every
// control keeps its id, listeners, and data wiring — only wrappers are added
// and whole panels regrouped.

const STAGES = [
  { key: 'team', label: 'Team & data', description: 'Load a historical team and season.' },
  { key: 'plan', label: 'Game plan', description: 'Pick the build and scoring focus.' },
  { key: 'rules', label: 'Rules', description: 'Set positions, stat floors, and rotation policy.' },
  { key: 'players', label: 'Players', description: 'Require, remove, and browse the pool.' },
  { key: 'results', label: 'Result desk', description: 'Read, share, and export the best fit.' },
];

const RAIL_TOP = 'calc(var(--djhc-header-h, 96px) + 1rem)';

export function installJourneyFlow(keeper) {
  const view = keeper.querySelector('#optimizerView');
  const form = keeper.querySelector('#optimizerForm');
  if (!view || !form || view.querySelector('.guided-workflow')) return;

  // Rail ---------------------------------------------------------------
  const rail = document.createElement('aside');
  rail.className = 'journey-rail';
  rail.innerHTML = '<p class="journey-rail__eyebrow">Guided build</p>' +
    '<nav aria-label="Builder stages"><ol class="journey-steps"></ol></nav>';
  const stepsList = rail.querySelector('.journey-steps');
  const railSteps = STAGES.map((stage, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journey-step';
    button.innerHTML = `<span class="journey-step__number" aria-hidden="true">${index + 1}</span>` +
      `<span class="journey-step__label">${stage.label}</span>` +
      '<span class="journey-step__status"></span>' +
      `<span class="journey-step__description">${stage.description}</span>`;
    button.addEventListener('click', () => scrollToStage(view, stage.key));
    item.append(button);
    stepsList.append(item);
    return { key: stage.key, item, button };
  });

  // Canvas + heading ----------------------------------------------------
  const canvas = document.createElement('div');
  canvas.className = 'journey-canvas';
  const heading = document.createElement('div');
  heading.className = 'journey-heading';
  heading.innerHTML = '<p class="eyebrow">Guided build</p>' +
    '<h2 tabindex="-1">Find your best five</h2>' +
    '<p class="journey-description">Work the stages in order — data, game plan, rules, players — then open the result desk to read, share, and export the best fit.</p>';
  canvas.append(heading, form);

  const shell = document.createElement('div');
  shell.className = 'guided-workflow';
  shell.append(rail, canvas);
  view.prepend(shell);

  // The results and the placeholder join the canvas so they sit in the
  // content column beside the rail.
  for (const id of ['results', 'emptyResult']) {
    const section = view.querySelector(`#${id}`);
    if (section) canvas.append(section);
  }

  // Stage 1: team & data. The relayed build leaves these panels at shell
  // level; the site's guided build nests them as the form's first stage.
  const dataPanel = keeper.querySelector('#liveDataPanel');
  const datasetStrip = keeper.querySelector('#datasetStrip');
  if (dataPanel && datasetStrip && !form.contains(dataPanel)) {
    const team = document.createElement('section');
    team.className = 'journey-stage journey-stage--team';
    team.dataset.workflowStage = 'team';
    team.setAttribute('aria-label', 'Team and data');
    team.tabIndex = -1;
    dataPanel.before(team);
    team.append(dataPanel, datasetStrip);
    form.prepend(team);
  }

  // Stages 2-4: wrap the builder's step panels. The rules stage also owns
  // the simple-mode summary when it sits beside the rules panel.
  const panels = [
    view.querySelector('.step-panel[aria-labelledby="scenarioHeading"]'),
    view.querySelector('.step-panel[aria-labelledby="constraintsHeading"]'),
    view.querySelector('.step-panel[aria-labelledby="playersHeading"]'),
  ];
  panels.forEach((panel, index) => {
    if (!panel) return;
    const key = STAGES[index + 1].key;
    const stage = document.createElement('section');
    stage.className = `journey-stage journey-stage--${key}`;
    stage.dataset.workflowStage = key;
    stage.tabIndex = -1;
    panel.after(stage);
    stage.append(panel);
    if (key === 'rules') {
      const summary = view.querySelector('#simpleModelSummary');
      if (summary && summary.parentElement === stage.parentElement) stage.append(summary);
    }
  });

  // Rail progress -------------------------------------------------------
  function visibleTarget(key) {
    if (key === 'results') {
      const results = view.querySelector('#results');
      if (results && results.offsetHeight > 0) return results;
      return view.querySelector('#emptyResult');
    }
    const stage = view.querySelector(`.journey-stage--${key}`);
    return stage && stage.offsetHeight > 0 ? stage : null;
  }

  let rafId = 0;
  function updateRail() {
    if (!rail.isConnected) return;
    let current = -1;
    const probe = window.innerHeight * 0.42;
    railSteps.forEach((step, index) => {
      const target = visibleTarget(step.key);
      step.item.hidden = !target;
      step.button.classList.remove('is-current', 'is-complete');
      step.button.querySelector('.journey-step__status').textContent = '';
      if (target) {
        if (target.getBoundingClientRect().top <= probe) {
          current = index;
          step.button.classList.add('is-complete');
          step.button.querySelector('.journey-step__status').textContent = 'Done';
        }
      }
    });
    if (current >= 0) {
      const step = railSteps[current];
      step.button.classList.remove('is-complete');
      step.button.classList.add('is-current');
      step.button.querySelector('.journey-step__status').textContent = 'Current';
    }
  }

  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; updateRail(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Results appearing and experience-mode switches change which stages exist.
  const results = view.querySelector('#results');
  const watchers = [results, document.body].filter(Boolean).map(node => {
    const observer = new MutationObserver(onScroll);
    observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'data-experience-mode'] });
    return observer;
  });
  updateRail();
  window.setTimeout(updateRail, 350);
}

function scrollToStage(view, key) {
  let target;
  if (key === 'results') {
    const results = view.querySelector('#results');
    target = results && results.offsetHeight > 0 ? results : view.querySelector('#emptyResult');
  } else {
    target = view.querySelector(`.journey-stage--${key}`);
  }
  if (!target || target.offsetHeight === 0) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}