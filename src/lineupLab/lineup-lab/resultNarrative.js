// Result-desk narrative: one AI-written sentence explaining why the
// recommended group wins. Presentation only — the button reads the solved
// result's own DOM (scoreboard cards + lineup table) and renders the returned
// sentence into a small card under the scoreboard.

import { base44 } from '@/api/base44Client';
import { captureScoreboard } from '@/lineupLab/lineup-lab/resultCapture';

const text = (node) => (node?.textContent || '').trim();

export function buildNarrativeButton(keeper) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-secondary';
  button.textContent = 'Explain this pick';

  const render = (results, sentence, state) => {
    const scoreboard = results.querySelector('.result-scoreboard');
    if (!scoreboard) return;
    let card = results.querySelector('.ll-narrative');
    if (!card) {
      card = document.createElement('div');
      card.className = 'll-narrative';
      scoreboard.after(card);
    }
    card.replaceChildren(
      Object.assign(document.createElement('p'), { className: 'll-narrative__kicker', textContent: 'Why this group wins' }),
      Object.assign(document.createElement('p'), { className: 'll-narrative__body', textContent: sentence }),
    );
    card.hidden = state === 'pending';
  };

  button.addEventListener('click', async () => {
    const results = keeper.querySelector('#results');
    if (!results || button.disabled) return;
    const { metrics, lineup } = captureScoreboard(results, 14) || { metrics: [], lineup: [] };
    if (!metrics.length || !lineup.length) {
      button.textContent = 'Solve a lineup first';
      setTimeout(() => { button.textContent = 'Explain this pick'; }, 1400);
      return;
    }
    button.disabled = true;
    button.textContent = 'Writing…';
    render(results, 'Composing the analysis…', 'pending');
    try {
      const response = await base44.functions.invoke('lineupLabNarrative', {
        lineup,
        metrics,
        team: text(results.closest('.ll-native')?.querySelector('#datasetTeam')) || text(document.getElementById('datasetTeam')),
        season: text(document.getElementById('datasetSeason')),
        weights: text(document.getElementById('weightShareSummary')).slice(0, 240),
      });
      const narrative = response?.data?.narrative;
      if (!narrative) throw new Error(response?.data?.error || 'empty');
      render(results, narrative, 'done');
    } catch {
      render(results, 'The narrative could not be written just now — try again in a moment.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Explain this pick';
    }
  });

  return button;
}