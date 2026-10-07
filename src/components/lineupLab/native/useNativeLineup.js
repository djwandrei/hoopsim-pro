import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import nativeRuntime from '@/components/lineupLab/native/nativeRuntime';
import { disconnectWorker } from '@/lineupLab/lineup-lab/workerConnection';
import { installToolExtras } from '@/lineupLab/lineup-lab/toolExtras';

export default function useNativeLineup() {
  const [status, setStatus] = useState({ loading: true, error: '' });
  useEffect(() => {
    const root = document.querySelector('.ll-native');
    const controller = new AbortController();
    const previous = document.body.getAttribute('data-experience-mode');
    let dispose;
    nativeRuntime(root, controller.signal).then(cleanup => {
      if (controller.signal.aborted) { cleanup(); return; }
      dispose = cleanup;
      installToolExtras(root);
      setStatus({ loading: false, error: '' });
    }).catch(error => {
      const message = error.message || 'The Lineup Lab could not be loaded.';
      if (!controller.signal.aborted) {
        setStatus({ loading: false, error: message });
        // Best-effort crash report → deduped GitHub issue; must never block the UI.
        base44.functions
          .invoke('githubIssueTracker', { source: 'lineup-lab', kind: 'boot-failure', message, stack: String(error?.stack || '').slice(0, 4000) })
          .catch(() => {});
      }
    });
    return () => {
      controller.abort(); dispose?.(); disconnectWorker();
      if (previous === null) document.body.removeAttribute('data-experience-mode');
      else document.body.setAttribute('data-experience-mode', previous);
    };
  }, []);
  return status;
}