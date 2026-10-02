import { base44 } from '@/api/base44Client';

export const AVAILABLE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

export async function loadSeasonSource(year) {
  if (!AVAILABLE_YEARS.includes(Number(year))) throw new Error('Choose a published 2017–26 season.');
  const { data } = await base44.functions.invoke('swishiqSeasonSource', { seasonStartYear: Number(year) });
  if (data?.error) throw new Error(data.error);
  if (data.entry?.scope?.kind !== 'exact-season' || data.entry.scope.seasonStartYear !== Number(year)) throw new Error('The live source does not match the selected exact season.');
  return data;
}