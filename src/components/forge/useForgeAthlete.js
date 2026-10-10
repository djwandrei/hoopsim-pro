import { useEffect, useRef, useState } from 'react';
import { loadForgeAthlete } from '@/components/forge/forgeAthleteAssets';
import forgeAthleteScene from '@/components/forge/forgeAthleteScene';
import forgeAthleteWardrobe from '@/components/forge/forgeAthleteWardrobe';

export default function useForgeAthlete(hostRef, stateRef, picks, editions, appearance, version) {
  const controller = useRef(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState({ loading: true, error: '', wardrobeLoading: false });
  useEffect(() => {
    let cancelled = false, view;
    setReady(false); setStatus({ loading: true, error: '', wardrobeLoading: false });
    try { view = forgeAthleteScene(hostRef.current, stateRef); }
    catch { setStatus({ loading: false, error: 'This device could not start the 3D athlete viewer.', wardrobeLoading: false }); return undefined; }
    loadForgeAthlete().then(({ model, fit, rig, poses }) => {
      if (cancelled) { model.traverse(mesh => { if (mesh.isMesh) mesh.material.dispose(); }); return; }
      controller.current = forgeAthleteWardrobe(model); view.attach(model, fit, rig, poses);
      setStatus({ loading: false, error: '', wardrobeLoading: false }); setReady(true);
    }).catch(error => { if (!cancelled) setStatus({ loading: false, error: error.message, wardrobeLoading: false }); });
    return () => { cancelled = true; controller.current?.dispose(); controller.current = null; view.dispose(); };
  }, [hostRef, stateRef, version]);
  useEffect(() => {
    if (!ready || !controller.current) return undefined;
    let cancelled = false;
    setStatus(value => ({ ...value, wardrobeLoading: true, error: '' }));
    controller.current.update(picks, editions, appearance).then(() => {
      if (!cancelled) setStatus(value => ({ ...value, wardrobeLoading: false }));
    }).catch(error => { if (!cancelled) setStatus(value => ({ ...value, wardrobeLoading: false, error: error.message })); });
    return () => { cancelled = true; };
  }, [picks, editions, appearance, ready, version]);
  return status;
}
