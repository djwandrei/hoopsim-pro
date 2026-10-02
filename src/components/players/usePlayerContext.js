import { useEffect, useState } from 'react';
import { loadPlayerContext } from '@/components/studio/sourceArchive';
export default function usePlayerContext(name) {
  const [context,setContext] = useState(null);
  const [status,setStatus] = useState('loading');
  useEffect(() => {
    let active = true;
    setContext(null);setStatus('loading');
    loadPlayerContext(name).then(value => { if (active) { setContext(value);setStatus(value ? 'ready' : 'unavailable'); } }, () => { if (active) setStatus('unavailable'); });
    return () => { active = false; };
  },[name]);
  return { context,status };
}