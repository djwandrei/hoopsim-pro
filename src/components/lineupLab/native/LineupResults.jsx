import React from 'react';

export default function LineupResults() {
  return <>
    <section id="results" className="ll-native-card results" aria-labelledby="resultsHeading" hidden>
      <div id="resultFreshness" role="status" className="result-freshness" hidden />
      <header className="results__heading"><div><p className="court-kicker">Recommended group</p><h2 id="resultsHeading" tabIndex="-1">Your best fit</h2><p id="resultSummary" /></div><div className="results__actions">{[['copyResultButton', 'Copy summary'], ['shareResultButton', 'Share result summary'], ['shareScenarioButton', 'Copy shareable setup link'], ['downloadResultButton', 'Export lineup CSV'], ['printReportButton', 'Print SwishIQ report']].map(([id, label], index) => <button key={id} id={id} type="button" className={`button button--quiet ${index > 1 ? 'detailed-only' : ''}`} disabled={id === 'shareResultButton'}>{label}</button>)}</div></header>
      <p id="shareResultHelp" hidden className="helper" /><p id="shareResultDisclosure" className="helper">Result sharing is unavailable right now. No link has been created.</p>
      <div id="resultContent" />
    </section>
    <section id="emptyResult" className="ll-native-card empty-result"><h2>Your recommended group will appear here</h2><p>Choose a team, set the game plan, make any optional player choices, and build the best group that meets your rules.</p></section>
  </>;
}