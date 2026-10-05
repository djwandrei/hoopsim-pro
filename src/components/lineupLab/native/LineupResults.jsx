import React from 'react';
import CourtArt from '@/components/lineupLab/native/CourtArt';

export default function LineupResults() {
  return <>
    <section id="results" className="ll-native-card results" aria-labelledby="resultsHeading" hidden>
      <div id="resultFreshness" role="status" className="result-freshness" hidden />
      <header className="results__heading"><div><p className="court-kicker">Recommended group</p><h2 id="resultsHeading" tabIndex="-1">Your best fit</h2><p id="resultSummary" /></div><div className="results__actions">{[['copyResultButton', 'Copy summary'], ['shareResultButton', 'Share result summary'], ['shareScenarioButton', 'Copy shareable setup link'], ['downloadResultButton', 'Export lineup CSV'], ['printReportButton', 'Print SwishIQ report']].map(([id, label], index) => <button key={id} id={id} type="button" className={`button button--quiet ${index > 1 ? 'detailed-only' : ''}`} disabled={id === 'shareResultButton'}>{label}</button>)}</div></header>
      <p id="shareResultHelp" hidden className="helper" /><p id="shareResultDisclosure" className="helper">Result sharing is unavailable right now. No link has been created.</p>
      <div id="resultContent" />
    </section>
    <section id="emptyResult" className="ll-native-card empty-result"><CourtArt className="ll-empty-art" /><h2>Your recommended group will appear here</h2><p>Load a team, call your game plan, set any player must-haves or exclusions, then press build — the best group that passes every rule appears here.</p></section>
  </>;
}