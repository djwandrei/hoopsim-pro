// Inline player detail: clicking a player's name on the results desk opens a
// slide-over with their season line (read from the roster table when the
// player is listed there) plus the result card's own context. Presentation
// only — nothing in the optimization flow changes.

const ACTION_LABELS = new Set(['Lock', 'Exclude', 'Compare', 'Watch']);

export function installPlayerDetail(keeper) {
  const content = keeper.querySelector('#resultContent');
  if (!content) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'll-detail-backdrop';
  backdrop.hidden = true;
  const panel = document.createElement('aside');
  panel.className = 'll-player-detail';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Player season line');
  keeper.append(backdrop, panel);

  const close = () => { panel.hidden = true; backdrop.hidden = true; };
  backdrop.addEventListener('click', close);
  keeper.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  content.addEventListener('click', event => {
    if (event.target.closest('button, a, label, input')) return;
    const card = event.target.closest('.lineup-player');
    if (!card) return;
    const name = card.querySelector('.player-name strong, .lineup-player__top strong')?.textContent.trim();
    if (!name) return;
    open(name, card);
  });

  function open(name, card) {
    const row = [...keeper.querySelectorAll('#playerTableBody tr')]
      .find(candidate => (candidate.querySelector('.player-name strong')?.textContent || '').trim() === name);
    const inner = document.createElement('div');
    inner.className = 'll-player-detail__inner';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'text-button';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', close);
    const head = document.createElement('h3');
    head.textContent = name;
    inner.append(closeButton, head);
    if (row) {
      const list = document.createElement('dl');
      list.className = 'll-player-detail__stats';
      [...row.querySelectorAll('td[data-label]')].forEach(cell => {
        const value = (cell.textContent || '').replace(/\s+/g, ' ').trim();
        if (!value || ACTION_LABELS.has(cell.dataset.label)) return;
        const item = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = cell.dataset.label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        item.append(dt, dd);
        list.append(item);
      });
      inner.append(list);
    } else {
      const note = document.createElement('p');
      note.className = 'helper';
      note.textContent = 'Full season line is unavailable for this player.';
      inner.append(note);
    }
    const why = card.querySelector('.why-selected, .lineup-player__context');
    if (why) {
      const copy = document.createElement('p');
      copy.className = 'helper';
      copy.textContent = (why.textContent || '').replace(/\s+/g, ' ').trim();
      inner.append(copy);
    }
    panel.replaceChildren(inner);
    panel.hidden = false;
    backdrop.hidden = false;
  }
}