import commandHeader from '@/lineupLab/lineup-lab/commandHeader';
import commandStages from '@/lineupLab/lineup-lab/commandStages';
import commandDock from '@/lineupLab/lineup-lab/commandDock';

// Presentation only: regroup original nodes before their existing listeners
// attach. The form, ids, native view tabs, and conditionally hidden controls
// stay intact; the old narrow rail and extra stage wrappers are not created.
export function installJourneyFlow(keeper) {
  const workspace = keeper.querySelector('#workspace');
  const view = keeper.querySelector('#optimizerView');
  const form = keeper.querySelector('#optimizerForm');
  const main = form?.querySelector('.builder-main');
  if (!workspace || !view || !main || workspace.classList.contains('command-workspace')) return;
  workspace.classList.add('command-workspace');
  view.classList.add('guided-workflow', 'command-build');
  commandHeader(workspace);
  commandStages(view, form);

  const data = keeper.querySelector('#liveDataPanel');
  const dataset = keeper.querySelector('#datasetStrip');
  if (data) {
    data.classList.add('command-card');
    if (dataset) data.append(dataset);
    main.prepend(data);
  }
  main.querySelectorAll('.step-panel').forEach(panel => panel.classList.add('command-card'));
  const scenario = main.querySelector('[aria-labelledby="scenarioHeading"]');
  const model = scenario?.querySelector('.model-choice');
  if (model) {
    const card = document.createElement('section');
    card.className = 'panel command-card command-model';
    card.setAttribute('aria-labelledby', 'commandModelHeading');
    card.innerHTML = '<p class="eyebrow">Primary model</p><h2 id="commandModelHeading">Historical profile</h2>';
    for (const node of [model, scenario.querySelector('#analyticsPanel'), scenario.querySelector('#opponentSwishIQ')]) {
      if (node) card.append(node);
    }
    scenario.after(card);
  }
  const guide = scenario?.querySelector('#metricFieldGuide');
  if (guide) keeper.querySelector('#modelView')?.append(guide);
  const sidebar = form.querySelector('.builder-sidebar');
  if (sidebar) main.append(sidebar);
  for (const id of ['weightsPanel', 'coachingBrief']) {
    const details = view.querySelector(`#${id}`);
    if (details) details.open = true;
  }
  commandDock(form);
}