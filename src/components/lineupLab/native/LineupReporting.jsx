import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import { SourceField, BoundSegmented, BoundSelect } from '@/components/lineupLab/native/boundControls';

const guide = [['Sample-adjusted rate', "When a player's playing time is limited, their rate is gently pulled toward the same-season average so small samples don't swing wild. A stable read of this season — not a forecast."], ['Per 36', 'Stats scaled to 36 minutes of playing time, so stars and role players can be compared side by side. Nobody is predicted to actually play 36.'], ['Per 100 estimated possessions', 'Stats per 100 team possessions, so fast-paced and slow-paced teams compete on equal footing.'], ['Decision quality', "A confidence check on the pick: how completely the search covered every possible group before ranking it. Separate from the statline."], ['Hard rules', "The rules every result must pass: who's eligible, which positions they fill, and how many minutes they get."], ['Statline', 'The production this group produces under your chosen minute plan, shown in the units you selected.'], ['Usage scenario', "The share of team possessions a player finishes with a shot, free throws, or a turnover. It's about possessions — not minutes or touches."], ['Planning reserve', 'A safety margin that softens estimates when the data runs thin. A setting you control — not an injury or fatigue forecast.']];
export default function LineupReporting() {
  return <LineupSection id="nativeReporting" title="Reports & alternatives" number="05" className="detailed-only">
    <SourceField id="alternativesInput" label="Show next-best groups" value="5" options={[["3", "Top 3"], ["5", "Top 5"], ["10", "Top 10"]]} help="How many runner-up groups to show next to the winner. Each one passes all of your rules, so they work as ready-made backups when you want to rotate bodies." helpId="alternativesInputHelp" />
    <BoundSegmented sourceId="alternativesInput" label="Show next-best groups" columns={3} />
    <div id="analyticsPanel" className="analytics-panel">
      <SourceField id="analyticsViewInput" label="Stat display" value="perGame" options={[["perGame", "Per game"], ["per36", "Per 36 minutes"], ["per100Estimated", "Per 100 estimated possessions"], ["eraRelative", "Same-season relative rate (per 36)"]]} />
      <BoundSelect sourceId="analyticsViewInput" label="Stat display" help="Changes the units results are shown in — per game, per 36 minutes, per 100 possessions, or relative to the rest of the league that season. Display only: the search underneath never changes." helpId="analyticsViewHelp" />
    </div>
    <details id="metricFieldGuide"><summary>What the numbers mean</summary><div className="metric-field-guide__grid">{guide.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></details>
  </LineupSection>;
}