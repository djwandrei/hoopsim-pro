// Result-desk insights, presentation only. Two additions:
// 1. A sensitivity strip under the scoreboard that turns the Result
//    Passport's coverage data and the live weight-share summary into plain
//    chips: is the search proven or exploratory, and are the weights
//    balanced or dominated by one priority family.
// 2. A progressive-disclosure mirror: the fine-tuning panel's own
//    "Current focus" line is echoed onto its collapsed summary, so the
//    current weights are visible without opening the panel.

export function installResultInsights(keeper) {
  const results = keeper.querySelector('#results');
  if (!results) return;
  const strip = document.createElement('div');
  strip.className = 'll-sensitivity';
  strip.hidden = true;

  const chip = (state, text) => {
    const chip = document.createElement('span');
    chip.className = `ll-chip${state ? ` is-${state}` : ''}`;
    chip.textContent = text;
    return chip;
  };

  const parseShares = () => {
    const summary = keeper.querySelector('#weightShareSummary')?.textContent || '';
    const focus = summary.match(/Current focus:\s*(.*)/);
    if (!focus) return [];
    return focus[1]
      .split('·')
      .map(part => part.trim().match(/^(.*?)\s+(\d+)%$/))
      .filter(Boolean)
      .map(match => ({ label: match[1], share: Number(match[2]) }));
  };

  const render = () => {
    const scoreboard = results.querySelector('.result-scoreboard');
    if (!scoreboard) {
      strip.hidden = true;
      return;
    }
    const cards = [...scoreboard.querySelectorAll('.score-card')];
    const cardValue = test => cards
      .find(card => test((card.querySelector('span')?.textContent || '').trim()))
      ?.querySelector('strong')?.textContent.trim() || '';
    const quality = cardValue(label => /decision quality/i.test(label));
    const rank = cardValue(label => /rank|coverage/i.test(label));
    const shares = parseShares();
    const topShare = shares.length ? shares.reduce((top, item) => (item.share > top.share ? item : top)) : null;

    const chips = [];
    if (quality === 'Best legal choice') {
      chips.push(chip('ok', `Search proven — ${rank || 'complete rank'}`));
    } else if (quality === 'Best found so far') {
      chips.push(chip('warn', `Exploratory — best found so far${rank ? ` (${rank})` : ''}`));
    } else if (quality) {
      chips.push(chip('warn', 'Unranked search'));
    }
    if (topShare) {
      chips.push(topShare.share >= 60
        ? chip('warn', `Weight tilt — ${topShare.label} ${topShare.share}%`)
        : chip('ok', 'Balanced priority mix'));
    }
    if (!chips.length) {
      strip.hidden = true;
      return;
    }
    const signature = chips.map(item => `${item.className}:${item.textContent}`).join('|');
    if (strip.dataset.signature !== signature) {
      strip.dataset.signature = signature;
      strip.replaceChildren(...chips);
    }
    strip.hidden = false;
    if (scoreboard.nextElementSibling !== strip) scoreboard.after(strip);
  };

  render();
  new MutationObserver(render).observe(results, { childList: true, subtree: true, characterData: true });
}

export function installWeightSummaryDisclosure(keeper) {
  const panel = keeper.querySelector('#weightsPanel');
  const summaryNode = keeper.querySelector('#weightShareSummary');
  const summary = panel?.querySelector('summary');
  if (!panel || !summaryNode || !summary || summary.querySelector('.ll-weight-mirror')) return;
  const mirror = document.createElement('span');
  mirror.className = 'll-weight-mirror';
  const sync = () => { mirror.textContent = summaryNode.textContent.trim(); };
  sync();
  new MutationObserver(sync).observe(summaryNode, { childList: true, characterData: true, subtree: true });
  summary.append(mirror);
}