import React from 'react';
import { Image } from '@/components/ui/image';
import { SourceButton, BoundButton } from '@/components/lineupLab/native/boundControls';
import LineupSourceHealth from '@/components/lineupLab/native/LineupSourceHealth';

export default function LineupDataset() {
  return <aside className="ll-native-card ll-native-dataset" id="datasetStrip">
    <div className="ll-native-dataset__identity"><div className="dataset-strip__mark"><span id="datasetTeamLogoFallback">NBA</span><Image id="datasetTeamLogo" alt="" hidden className="h-14 w-14" fittingType="fit" /></div><div><p className="court-kicker">Current data set</p><strong id="datasetName">No team loaded</strong><small id="datasetMedia" hidden>Loading team and player images…</small></div></div>
    <dl className="ll-native-facts">{[['Season', 'datasetSeason', '—'], ['Team', 'datasetTeam', '—'], ['Players', 'datasetCount', '0']].map(([label, id, value]) => <div key={id}><dt>{label}</dt><dd id={id}>{value}</dd></div>)}</dl>
    <LineupSourceHealth />
    <SourceButton id="importCsvButton" />
    <SourceButton id="resetDatasetButton" />
    <input id="csvFileInput" type="file" accept=".csv,text/csv" hidden />
    <div className="card-actions detailed-only"><BoundButton sourceId="importCsvButton" className="text-button">Import player CSV</BoundButton><BoundButton sourceId="resetDatasetButton" className="text-button">Reset to demo team</BoundButton></div>
  </aside>;
}