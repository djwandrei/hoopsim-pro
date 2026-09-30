import { useEffect, useState } from 'react';
import { loadSeasonSource, AVAILABLE_YEARS } from '@/lib/season/dataClient';
import { buildLeague } from '@/lib/season/simEngine';
import useStudioSeason from '@/components/studio/useStudioSeason';

export default function useSeasonSource(initialYear = 2025) {
  const [year, setYear] = useStudioSeason(initialYear);
  const [retryToken, setRetryToken] = useState(0);
  const [source, setSource] = useState(null);
  const [league, setLeague] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setSource(null);
    setLeague(null);
    setError('');
    (async () => {
      try {
        const data = await loadSeasonSource(year);
        if (cancelled) return;
        setSource(data);
        setLeague(buildLeague(data));
        setState('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e?.response?.data?.error || e?.message || 'The season source could not be loaded.');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [year, retryToken]);

  return { year, setYear, years: AVAILABLE_YEARS, source, league, state, error, retry: () => setRetryToken(value => value + 1) };
}