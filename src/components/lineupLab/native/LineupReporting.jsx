import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import { SourceField, BoundSegmented, BoundSelect } from '@/components/lineupLab/native/boundControls';

const guide = [['Sample-adjusted rate', 'An observed per-36 rate tempered toward a same-season reference when matching samples are limited. It is not a future-stat forecast.'], ['Per 36', 'A shared playing-time scale—not a prediction that a player will play 36 minutes.'], ['Per 100 estimated possessions', 'A pace-neutral estimate built from reconstructed team possessions.'], ['Decision quality', 'Eligible-group rank and search coverage, separate from the statline.'], ['Hard rules', 'Eligibility, position assignments, and minute limits. Every result must pass them.'], ['Statline', 'Production in the unit supported by the selected players and minute plan.'], ['Usage scenario', 'Share of on-court possessions finished by a shot, free-throw trip, or turnover—not minutes or touches.'], ['Planning reserve', 'A disclosed caution setting—not a calibrated injury or fatigue forecast.']];
export default function LineupReporting() {
  return <LineupSection id="nativeReporting" title="Reports & alternatives" number="05" className="detailed-only">
    <SourceField id="alternativesInput" label="Show next-best groups" value="5" options={[["3", "Top 3"], ["5", "Top 5"], ["10", "Top 10"]]} />
    <BoundSegmented sourceId="alternativesInput" label="Show next-best groups" columns={3} />
    <div id="analyticsPanel" className="analytics-panel">
      <SourceField id="analyticsViewInput" label="Stat display" value="perGame" options={[["perGame", "Per game"], ["per36", "Per 36 minutes"], ["per100Estimated", "Per 100 estimated possessions"], ["eraRelative", "Same-season relative rate (per 36)"]]} />
      <BoundSelect sourceId="analyticsViewInput" label="Stat display" help="Display preferences change how you read results; they never change the optimization objective." helpId="analyticsViewHelp" />
    </div>
    <details id="metricFieldGuide"><summary>Advanced field guide</summary><div className="metric-field-guide__grid">{guide.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></details>
  </LineupSection>;
}