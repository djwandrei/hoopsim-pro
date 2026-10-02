import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamLogo } from '@/components/djhc/siteNavigation';

// Site contract: the studio hero carries the selected team's opaque mark as a
// single decorative image layer behind the copy (rotated, 58% opacity); the
// neutral DJHC palette shows no logo at all.
export default function HeroTeamLogo() {
  const { palette } = useCourtTheme();
  const src = teamLogo(palette);
  const [failed, setFailed] = useState('');
  if (!src || failed === src) return null;
  return <Image src={src} alt="" aria-hidden="true" className="swishiq-hero__team-logo" onError={() => setFailed(src)} />;
}