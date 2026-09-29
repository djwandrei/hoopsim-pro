import { base44 } from '@/api/base44Client';

export const AVAILABLE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

export async function loadSeasonSource(year) {
  const response = await base44.functions.invoke('swishiqSeasonSource', { seasonStartYear: year });
  return response.data;
}