import React from 'react';
import StudioShell from '@/components/studio/StudioShell';

// Daily games and Lineup Lab use the same Studio shell as the other tools so
// the persistent desktop workbench sidebar remains available on every route.
export default function GameShell({ children, active = '/daily-games' }) {
  return <StudioShell active={active}>{children}</StudioShell>;
}
