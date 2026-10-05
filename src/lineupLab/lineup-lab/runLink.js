// Shareable run links: the current setup is mirrored into a ?run= URL
// parameter (JSON, unicode-safe base64url) so any setup can be bookmarked or
// pasted. A ?run= link is applied after session restore, so a shared link
// wins over locally remembered inputs.

import { collectInputs, restoreInputs } from '@/lineupLab/lineup-lab/sessionMemory';

const PARAM = 'run';

const encode = data => btoa(unescape(encodeURIComponent(JSON.stringify(data))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = text => {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(text.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch {
    return null;
  }
};

export async function applyRunLink(keeper) {
  const raw = new URLSearchParams(location.search).get(PARAM);
  if (!raw) return;
  const data = decode(raw);
  if (!data || typeof data !== 'object') return;
  for (let pass = 0; pass < 5; pass += 1) {
    if ((await Promise.resolve(restoreInputs(keeper, data))) === 0) break;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
}

export function installRunLink(keeper) {
  const scope = keeper.querySelector('#workspace') || keeper;
  let timer;
  const sync = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      params.set(PARAM, encode(collectInputs(scope)));
      history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
    }, 800);
  };
  scope.addEventListener('change', sync);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-button';
  button.textContent = 'Copy setup link';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = 'Link copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => { button.textContent = 'Copy setup link'; }, 2400);
  });
  document.querySelector('.ll-native-toolbar')?.append(button);
}