import React from 'react';
import { SourceButton } from '@/components/lineupLab/native/boundControls';

export default function LineupSecondaryViews() {
  return <>
    <section id="compareView" className="ll-native-card" data-view="compare" role="tabpanel" aria-labelledby="compareTab" tabIndex="-1" hidden><p className="court-kicker">Head-to-head</p><h2>Player comparison</h2><p className="helper">Select up to four players from the roster. Percentiles use the same sample filters and exclusions as the optimizer.</p><div id="compareContent" className="compare-content" /></section>
    <section id="watchlistView" className="ll-native-card" data-view="watchlist" role="tabpanel" aria-labelledby="watchlistTab" tabIndex="-1" hidden><p className="court-kicker">Collector helper</p><h2>Player watchlist</h2><p className="helper">A private shortlist on this device. Saved players stay visible when you switch team-seasons.</p><button id="downloadWatchlistButton" type="button" className="button button--quiet">Download watchlist</button><div id="watchlistContent" className="watchlist-grid" /></section>
    {/* Hidden source nodes the site controller still requires (see controllerContract). */}
    <SourceButton id="exportDatasetButton" hidden />
    <SourceButton id="downloadTemplateButton" hidden />
  </>;
}