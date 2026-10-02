import { readArchive } from '@/components/studio/sourceArchive';

export const AVAILABLE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

export async function loadSeasonSource(year) {
  if (!AVAILABLE_YEARS.includes(Number(year))) throw new Error('Choose a published 2017–26 season.');
  const manifest = await readArchive('snapshot.json');
  const descriptor = manifest.seasons.find(row => row.year === Number(year));
  if (!descriptor) throw new Error('This exact season is not included in the Studio archive.');
  const source = await readArchive(`season-${Number(year)}.json`,descriptor.sha256);
  if (source.entry?.scope?.kind !== 'exact-season' || source.entry.scope.seasonStartYear !== Number(year)) throw new Error('The source does not match the selected exact season.');
  return source;
}