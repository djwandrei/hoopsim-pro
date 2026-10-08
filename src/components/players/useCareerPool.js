import { useEffect, useState } from 'react';
import { loadCareerArchive } from '@/components/studio/sourceArchive';
import { careerPlayers } from '@/components/career/careerHistoryModel';
import useViewRefresh from '@/components/mobile/useViewRefresh';

export default function useCareerPool(active) {
  const [players,setPlayers] = useState(null);
  const [state,setState] = useState('idle');
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    if (!active || players) return;
    let alive = true;
    setState('loading');
    loadCareerArchive().then(value => { if (alive) { setPlayers(careerPlayers(value.records)); setState('ready'); } },() => { if (alive) setState('error'); });
    return () => { alive = false; };
  },[active,attempt,players]);
  useViewRefresh(async () => {
    if (!active) return;
    const value = await loadCareerArchive();
    setPlayers(careerPlayers(value.records)); setState('ready');
  });
  return { players:players || [], state, retry:() => setAttempt(value => value + 1) };
}