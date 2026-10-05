import { useEffect, useState } from 'react';
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
      if (!controller.signal.aborted) setStatus({ loading: false, error: error.message || 'The Lineup Lab could not be loaded.' });
    });
    return () => {
      controller.abort(); dispose?.(); disconnectWorker();
      if (previous === null) document.body.removeAttribute('data-experience-mode');
      else document.body.setAttribute('data-experience-mode', previous);
    };
  }, []);
  return status;
}