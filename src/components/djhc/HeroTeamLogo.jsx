import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { STUDIO_EMBLEM } from '@/components/studio/teamAssets';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamLogo } from '@/components/djhc/siteNavigation';
export default function HeroTeamLogo() {
  const {palette}=useCourtTheme(),src=teamLogo(palette),[failed,setFailed]=useState('');
  return <Image src={src&&failed!==src?src:STUDIO_EMBLEM} alt={src?`${palette.team} team logo`:'SwishIQ Studio emblem from DJHC'} fittingType="fit" className="hidden h-44 w-44 shrink-0 object-contain lg:block" onError={()=>setFailed(src)} />;
}