import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { gamePrices } from '@/components/book/OddsBoard';
import { CODE_BY_NAME, runModelGame } from '@/lib/bookRoom/modelEdge';

// Live odds feed + the studio sim's per-game Monte Carlo model, shared by the
// sportsbook pages. Yields between games so the page stays responsive while
// the model fills in, and tracks price movement and the daily boost.
export default function useBookFeed(league, seasonState) {
  const [feed, setFeed] = useState({ state: 'loading', games: [], quota: null, error: null, setup: false });
  const [model, setModel] = useState(null);
  const [movement, setMovement] = useState({});
  const [boosts, setBoosts] = useState({});
  const [propsFeed, setPropsFeed] = useState({ state: 'idle', byEvent: {} });
  const prevPricesRef = useRef(null);

  // Player prop milestones ride on a second relay call, so an outage there
  // never blocks the main odds board.
  const loadProps = useCallback(async () => {
    try {
      const response = await base44.functions.invoke('swishiqOddsFeed', { kind: 'props' });
      const byEvent = {};
      for (const game of response.data?.games || []) byEvent[game.eventKey] = game.props || [];
      setPropsFeed({ state: 'ready', byEvent });
    } catch {
      setPropsFeed({ state: 'error', byEvent: {} });
    }
  }, []);

  const loadOdds = useCallback(async () => {
    setFeed(current => ({ ...current, state: 'loading' }));
    try {
      const response = await base44.functions.invoke('swishiqOddsFeed', { kind: 'odds' });
      const games = response.data?.games || [];
      const prices = {};
      for (const game of games) Object.assign(prices, gamePrices(game));
      const trend = {};
      const previous = prevPricesRef.current;
      if (previous) for (const [key, offer] of Object.entries(prices)) {
        const before = previous[key];
        if (before && offer.price !== before.price) trend[key] = offer.price > before.price ? 'up' : 'down';
      }
      prevPricesRef.current = prices;
      setMovement(trend);
      const candidates = Object.entries(prices).filter(([, offer]) => offer.price >= -250 && offer.price <= 200);
      if (candidates.length) {
        const [key, offer] = candidates[Math.floor(Math.random() * candidates.length)];
        setBoosts({ [key]: offer.price + 100 });
      } else setBoosts({});
      setFeed({ state: 'ready', games, quota: response.data?.quota ?? null, error: null, setup: false });
      loadProps();
    } catch (error) {
      const data = error?.response?.data || {};
      setFeed({ state: data.code === 'odds_feed_not_configured' ? 'setup' : 'error', games: [], quota: null, error: data.error || error?.message || 'The odds feed is unavailable.', setup: data.code === 'odds_feed_not_configured' });
    }
  }, []);

  useEffect(() => { loadOdds(); }, [loadOdds]);

  const upcomingSignature = feed.state === 'ready' ? feed.games.filter(game => Date.parse(game.commenceTime) > Date.now()).map(game => game.eventKey).join('|') : '';
  useEffect(() => {
    if (feed.state !== 'ready' || seasonState !== 'ready' || !league) { setModel(null); return; }
    const upcoming = feed.games.filter(game => Date.parse(game.commenceTime) > Date.now()).slice(0, 12);
    if (!upcoming.length) { setModel({ byEvent: {}, progress: '0/0', leagueLabel: league.label }); return; }
    let cancelled = false;
    setModel({ byEvent: {}, progress: `0/${upcoming.length}`, leagueLabel: league.label });
    (async () => {
      const byEvent = {};
      for (const game of upcoming) {
        if (cancelled) return;
        const home = league.byCode.get(CODE_BY_NAME[game.home]);
        const away = league.byCode.get(CODE_BY_NAME[game.away]);
        if (home && away) byEvent[game.eventKey] = runModelGame(league, home, away);
        if (cancelled) return;
        setModel({ byEvent: { ...byEvent }, progress: `${Object.keys(byEvent).length}/${upcoming.length}`, leagueLabel: league.label });
        await new Promise(resolve => setTimeout(resolve));
      }
    })();
    return () => { cancelled = true; };
  }, [feed.state, upcomingSignature, seasonState, league]);

  return { feed, loadOdds, model, movement, boosts, propsByEvent: propsFeed.byEvent, propsState: propsFeed.state };
}