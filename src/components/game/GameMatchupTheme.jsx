import React from 'react';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { matchupThemeVars } from '@/components/game/matchupTheme';
import '@/components/game/gameMatchupTheme.css';

export default function GameMatchupTheme({ homeCode, awayCode, children }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  return <div className="game-matchup-theme" style={matchupThemeVars(homeCode, awayCode, mode)} data-home-team={homeCode} data-away-team={awayCode}>{children}</div>;
}