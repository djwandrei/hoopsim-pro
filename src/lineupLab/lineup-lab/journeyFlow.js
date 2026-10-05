import commandHeader from '@/lineupLab/lineup-lab/commandHeader';
import commandStages from '@/lineupLab/lineup-lab/commandStages';
import commandDock from '@/lineupLab/lineup-lab/commandDock';
import { installToolExtras } from '@/lineupLab/lineup-lab/toolExtras';

// Apply after the site's workflow initializes. Its own stage buttons,
// validation, conditional visibility, and original listeners stay in charge.
export function installJourneyFlow(keeper) {
  const workspace = keeper.querySelector('#workspace');
  const view = keeper.querySelector('#optimizerView');
  const shell = view?.querySelector('.guided-workflow');
  if (!workspace || !shell || workspace.classList.contains('command-workspace')) return;
  workspace.classList.add('command-workspace');
  shell.classList.add('command-build');
  commandHeader(workspace);
  commandStages(shell);
  commandDock(shell);
  installToolExtras(keeper);
  keeper.querySelectorAll('.step-panel, #liveDataPanel').forEach(panel => panel.classList.add('command-card'));
  const scenario = view.querySelector('[aria-labelledby="scenarioHeading"]');
  const model = scenario?.querySelector('.model-choice');
  if (model) {
    const card = document.createElement('section');
    card.className = 'panel command-card command-model';
    card.setAttribute('aria-labelledby', 'commandModelHeading');
    card.innerHTML = '<p class="eyebrow">Primary model</p><h2 id="commandModelHeading">Historical profile</h2>';
    card.append(model);
    const opponent = scenario.querySelector('#opponentSwishIQ');
    if (opponent) card.append(opponent);
    scenario.after(card);
  }
  // Optional fine-tuning and coaching notes keep their native collapsed state.
}