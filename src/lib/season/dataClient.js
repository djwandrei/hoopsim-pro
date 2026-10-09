import { loadSeasonSourceCore } from './seasonSourceCore.js';
export const AVAILABLE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
export async function loadSeasonSource(year) {
  if (!AVAILABLE_YEARS.includes(Number(year))) throw new Error('Choose a published 2017–26 season.');
  return loadSeasonSourceCore(Number(year));
}
