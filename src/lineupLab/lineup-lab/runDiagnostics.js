// Run diagnostics: copies a self-describing bundle (page URL, inputs, worker
// and storage state) to the clipboard so a failed solve can be reported
// without asking the user to open dev tools.

import { collectInputs } from '@/lineupLab/lineup-lab/sessionMemory';

export function buildDiagnosticsButton(keeper) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-secondary';
  button.textContent = 'Copy diagnostics';

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      let worker = null;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        worker = registration?.active?.scriptURL || null;
      } catch {
        worker = 'unavailable';
      }
      const bundle = {
        capturedAt: new Date().toISOString(),
        page: location.href,
        experienceMode: document.body.dataset.experienceMode || 'detailed',
        userAgent: navigator.userAgent,
        connection: { serviceWorker: worker, online: navigator.onLine },
        inputs: collectInputs(keeper.querySelector('#workspace') || keeper),
      };
      await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
      button.textContent = 'Copied ✓';
    } catch {
      button.textContent = 'Copy failed';
    } finally {
      button.disabled = false;
      setTimeout(() => { button.textContent = 'Copy diagnostics'; }, 2400);
    }
  });

  return button;
}