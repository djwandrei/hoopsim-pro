import React from 'react';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
export default function ThemeToggle() {
  const {mode,toggleMode}=useCourtTheme();
  return <button id="themeToggle" type="button" className="theme-toggle theme-toggle--compact" data-theme-mode={mode} aria-label={mode==='dark'?'Switch to light mode':'Switch to dark mode'} aria-pressed={mode==='dark'} onClick={toggleMode}><span className="theme-toggle__icon" aria-hidden="true" /><span className="button-label">{mode==='dark'?'Light Mode':'Dark Mode'}</span></button>;
}