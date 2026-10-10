import { useCallback, useEffect, useRef, useState } from 'react';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import { fetchESPNOdds, fetchESPNPlayerProps } from '@/lib/bookRoom/espnOdds';

// Public ESPN NBA lines feed for the play-money Book Room. Prices are fetched
// in the browser because ESPN's scoreboard endpoint requires no private key.
export default function useBookFeed() {
  const [feed, setFeed] = useState({ state: 'loading', games: [], quota: null, error: null, setup: false, refreshing: true, fetchedAt: null, source: 'ESPN' });
  const inFlight = useRef(false);
  const [model] = useState(null);
  const [movement] = useState({});
  const [boosts] = useState({});
  const [propsFeed, setPropsFeed] = useState({ byEvent: {}, states: {} });
  const propsRequests = useRef(new Map());
  const propsLoadedAt = useRef(new Map());
  const loadProps = useCallback(async (game, force = false) => {
    const eventKey = game?.eventKey;
    if (!eventKey || propsRequests.current.has(eventKey)
      || (!force && Date.now() - (propsLoadedAt.current.get(eventKey) || 0) < 120_000)) return;
    const controller = new AbortController();
    propsRequests.current.set(eventKey, controller);
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setPropsFeed(current => ({ ...current, states: { ...current.states, [eventKey]: 'loading' } }));
    try {
      const props = await fetchESPNPlayerProps(game, { signal: controller.signal });
      if (controller.signal.aborted) return;
      propsLoadedAt.current.set(eventKey, Date.now());
      setPropsFeed(current => ({ byEvent: { ...current.byEvent, [eventKey]: props }, states: { ...current.states, [eventKey]: 'ready' } }));
    } catch {
      setPropsFeed(current => ({ ...current, states: { ...current.states, [eventKey]: 'error' } }));
    } finally {
      window.clearTimeout(timeout);
      propsRequests.current.delete(eventKey);
    }
  }, []);

  const loadOdds = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFeed(current => ({ ...current, state: current.games.length ? 'ready' : 'loading', refreshing: true, error: null }));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const games = await fetchESPNOdds({ signal: controller.signal });
      setFeed({ state: 'ready', games, quota: null, error: null, setup: false, refreshing: false, fetchedAt: new Date().toISOString(), source: 'ESPN' });
      // Refresh only games whose props have already been requested. Each
      // request has its own timeout and does not delay the main game lines.
      games.filter(game => propsLoadedAt.current.has(game.eventKey)).forEach(game => { void loadProps(game, true); });
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'ESPN odds request timed out.' : error?.message || 'The ESPN odds feed could not be reached.';
      setFeed(current => current.games.length
        ? { ...current, state: 'ready', refreshing: false, error: message }
        : { state: 'error', games: [], quota: null, error: message, setup: false, refreshing: false, fetchedAt: null, source: 'ESPN' });
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
    }
  }, [loadProps]);

  useViewRefresh(loadOdds);
  useEffect(() => { loadOdds(); }, [loadOdds]);
  useEffect(() => {
    const requests = propsRequests.current;
    return () => { requests.forEach(controller => controller.abort()); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) loadOdds();
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [loadOdds]);

  return { feed, loadOdds, model, movement, boosts, propsByEvent: propsFeed.byEvent, propsStates: propsFeed.states, loadProps };
}
