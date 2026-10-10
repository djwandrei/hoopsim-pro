import { useEffect, useRef, useState } from 'react';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import { loadSeasonSource, AVAILABLE_YEARS } from '@/lib/season/dataClient';
import { buildLeague } from '@/lib/season/simEngine';
import useStudioSeason from '@/components/studio/useStudioSeason';

// Session-level season cache: revisiting a workbench for a season that was
// already loaded this visit skips both the refetch and the league rebuild.
// Bounded to the three most recent seasons so memory stays reasonable.
const seasonCache = new Map();
const CACHE_LIMIT = 3;

function cacheSeason(year, value) {
  seasonCache.delete(year);
  seasonCache.set(year, value);
  if (seasonCache.size > CACHE_LIMIT) {
    const oldest = seasonCache.keys().next().value;
    seasonCache.delete(oldest);
  }
}

export default function useSeasonSource(initialYear = 2025, profile = 'full', preferredYear = null) {
  const [year, setYear] = useStudioSeason(initialYear, preferredYear);
  const [retryToken, setRetryToken] = useState(0);
  const [source, setSource] = useState(null);
  const [league, setLeague] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const currentYear = useRef(year);
  currentYear.current = year;
  useViewRefresh(async () => {
    const data = await loadSeasonSource(year, { profile });
    if (currentYear.current !== year) return;
    const built = buildLeague(data);
    cacheSeason(`${year}:${profile}`, { source: data, league: built });
    setSource(data); setLeague(built); setState('ready'); setError('');
  });

  useEffect(() => {
    let cancelled = false;
    const cached = seasonCache.get(`${year}:${profile}`);
    if (cached) {
      setSource(cached.source);
      setLeague(cached.league);
      setState('ready');
      setError('');
      return;
    }
    setState('loading');
    setSource(null);
    setLeague(null);
    setError('');
    (async () => {
      try {
        const data = await loadSeasonSource(year, { profile });
        if (cancelled) return;
        const built = buildLeague(data);
        cacheSeason(`${year}:${profile}`, { source: data, league: built });
        setSource(data);
        setLeague(built);
        setState('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e?.response?.data?.error || e?.message || 'The season source could not be loaded.');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [year, retryToken, profile]);

  return { year, setYear, years: AVAILABLE_YEARS, source, league, state, error, retry: () => setRetryToken(value => value + 1) };
}
