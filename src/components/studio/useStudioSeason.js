import { useState } from 'react';
const KEY = 'djhc:swishiq:studio-season:v2';
export default function useStudioSeason(initialYear = 2025) {
  const [year, setYearState] = useState(() => {
    try { const saved = Number(localStorage.getItem(KEY)); return saved >= 2017 && saved <= 2025 ? saved : initialYear; } catch { return initialYear; }
  });
  const setYear = value => {
    setYearState(value);
    try { localStorage.setItem(KEY, String(value)); } catch { /* Keep selection usable if storage is unavailable. */ }
  };
  return [year, setYear];
}