import { useEffect, useMemo, useState } from 'react';
import { loadCareerArchive } from '@/components/studio/sourceArchive';
import { careerPlayers } from '@/components/career/careerHistoryModel';
import useViewRefresh from '@/components/mobile/useViewRefresh';
export default function useCareerArchive() {
  const [source,setSource] = useState(null),[state,setState] = useState('loading'),[error,setError] = useState(''),[attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');setError('');
    loadCareerArchive().then(value => { if(active){setSource(value);setState('ready');} },e => { if(active){setError(e.message);setState('error');} });
    return () => { active=false; };
  },[attempt]);
  useViewRefresh(async () => {
    const value = await loadCareerArchive();
    setSource(value); setState('ready'); setError('');
  });
  const players = useMemo(() => source ? careerPlayers(source.records) : [],[source]);
  return { source,players,state,error,retry:() => setAttempt(value => value+1) };
}