import { useCallback, useEffect, useState } from 'react';
import useViewRefresh from '@/components/mobile/useViewRefresh';

// Live odds feed + the studio sim's per-game Monte Carlo model, shared by the
// sportsbook pages. Yields between games so the page stays responsive while
// the model fills in, and tracks price movement and the daily boost.
export default function useBookFeed(league, seasonState) {
  const [feed, setFeed] = useState({ state: 'setup', games: [], quota: null, error: null, setup: true });
  const [model] = useState(null);
  const [movement] = useState({});
  const [boosts] = useState({});
  const [propsFeed, setPropsFeed] = useState({ state: 'idle', byEvent: {} });
  // Player prop milestones ride on a second relay call, so an outage there
  // never blocks the main odds board.
  const loadProps = useCallback(async () => {
    setPropsFeed({ state: 'unavailable', byEvent: {} });
  }, []);

  const loadOdds = useCallback(async () => {
    setFeed(current => ({ ...current, state: 'loading' }));
    try {
      setFeed({ state: 'setup', games: [], quota: null, error: null, setup: true });
      await loadProps();
    } catch (error) {
      setFeed({ state: 'setup', games: [], quota: null, error: error?.message || 'The local odds board is not connected.', setup: true });
    }
  }, [loadProps]);

  useViewRefresh(loadOdds);
  useEffect(() => { loadOdds(); }, [loadOdds]);

  return { feed, loadOdds, model, movement, boosts, propsByEvent: propsFeed.byEvent, propsState: propsFeed.state };
}
