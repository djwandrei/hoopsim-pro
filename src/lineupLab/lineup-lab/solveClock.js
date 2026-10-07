// Solve clock: when the site's own solver status enters its working tone, a
// small chip shows elapsed seconds so a long search is never ambiguous. If the
// status and progress readouts stop moving while the search still runs, the
// chip switches to a stall warning so a hung search is obvious too. The site
// keeps ownership of the solve itself — this is presentation only.

const STALL_AFTER_MS = 25000;

export function installSolveClock(keeper) {
  const status = keeper.querySelector('#solverStatus');
  const progress = keeper.querySelector('#optimizationProgress');
  if (!status) return;
  const clock = document.createElement('span');
  clock.className = 'll-solve-clock';
  let timer = null;
  let startedAt = 0;
  let lastActivity = 0;

  const stop = () => {
    clearInterval(timer);
    timer = null;
    clock.remove();
    clock.classList.remove('ll-solve-clock--stall');
    startedAt = 0;
  };
  const tick = () => {
    // Self-teardown: when the workbench unmounts mid-search, kill the interval
    // and the observer instead of ticking against a detached node forever.
    if (!status.isConnected) { stop(); observer.disconnect(); return; }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const silentMs = Date.now() - lastActivity;
    if (silentMs >= STALL_AFTER_MS) {
      clock.classList.add('ll-solve-clock--stall');
      clock.textContent = `No progress in ${Math.round(silentMs / 1000)}s — cancel if stuck`;
    } else {
      clock.classList.remove('ll-solve-clock--stall');
      clock.textContent = seconds >= 20 ? `Search running — ${seconds}s elapsed` : 'Search running…';
    }
  };
  const isRunning = () => status.dataset.tone === 'working' || /Searching|Building|Preparing/i.test(status.textContent || '');

  const observer = new MutationObserver(() => {
    if (isRunning() && !timer) {
      startedAt = Date.now();
      lastActivity = startedAt;
      if (!clock.isConnected) status.after(clock);
      tick();
      timer = setInterval(tick, 1000);
    } else if (!isRunning() && timer) {
      stop();
    }
    // Any movement in the status or the progress readout counts as activity.
    if (timer) lastActivity = Date.now();
  });
  observer.observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-tone'] });
  if (progress && progress !== status) observer.observe(progress, { childList: true, characterData: true, subtree: true });
}