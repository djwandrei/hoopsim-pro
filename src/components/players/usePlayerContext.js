import { useEffect, useState } from 'react';
import { loadPlayerContext } from '@/components/studio/sourceArchive';
import useViewRefresh from '@/components/mobile/useViewRefresh';
export default function usePlayerContext(name) {
  const [context,setContext] = useState(null);
  const [status,setStatus] = useState('loading');
  useEffect(() => {
    let active = true;
    setContext(null);setStatus(name ? 'loading' : 'unavailable');
    if (!name) return () => { active = false; };
    loadPlayerContext(name).then(value => { if (active) { setContext(value);setStatus(value ? 'ready' : 'unavailable'); } }, () => { if (active) setStatus('unavailable'); });
    return () => { active = false; };
  },[name]);
  useViewRefresh(async () => {
    if (!name) return;
    const value = await loadPlayerContext(name);
    setContext(value); setStatus(value ? 'ready' : 'unavailable');
  });
  return { context,status };
}