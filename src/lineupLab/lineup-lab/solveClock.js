// Solve clock: when the site's own solver status enters its working tone, a
// small chip shows elapsed seconds so a long search is never ambiguous. The
// site keeps ownership of the solve itself — this is presentation only.

export function installSolveClock(keeper) {
  const status = keeper.querySelector('#solverStatus');
  if (!status) return;
  const clock = document.createElement('span');
  clock.className = 'll-solve-clock';
  let timer = null;
  let startedAt = 0;

  const stop = () => {
    clearInterval(timer);
    timer = null;
    clock.remove();
    startedAt = 0;
  };
  const tick = () => {
    // Self-teardown: when the workbench unmounts mid-search, kill the interval
    // and the observer instead of ticking against a detached node forever.
    if (!status.isConnected) { stop(); observer.disconnect(); return; }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    clock.textContent = seconds >= 20 ? `Search running — ${seconds}s elapsed` : 'Search running…';
  };
  const isRunning = () => status.dataset.tone === 'working' || /Searching|Building|Preparing/i.test(status.textContent || '');

  const observer = new MutationObserver(() => {
    if (isRunning() && !timer) {
      startedAt = Date.now();
      if (!clock.isConnected) status.after(clock);
      tick();
      timer = setInterval(tick, 1000);
    } else if (!isRunning() && timer) {
      stop();
    }
  });
  observer.observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-tone'] });
}