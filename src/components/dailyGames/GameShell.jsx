import React from 'react';
import DJHCHeader from '@/components/djhc/DJHCHeader';
import DJHCFooter from '@/components/djhc/DJHCFooter';
import CourtThemeProvider from '@/components/djhc/CourtThemeProvider';

// Daily games run standalone — site header/footer chrome only, no SwishIQ
// Studio sidebar, matching how the live /tools/ pages present these games.
export default function GameShell({ children }) {
  return (
    <CourtThemeProvider>
      <div className="studio-workspace min-h-screen bg-canvas">
        <DJHCHeader />
        <a href="#game-content" className="sr-only z-50 rounded bg-gold p-3 text-canvas focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to game</a>
        {children}
        <DJHCFooter />
      </div>
    </CourtThemeProvider>
  );
}