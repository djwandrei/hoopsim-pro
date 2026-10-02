import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamLogo } from '@/components/djhc/siteNavigation';
export default function HeaderTeamMark() {
  const {palette}=useCourtTheme(),src=teamLogo(palette),[failed,setFailed]=useState('');
  return <span className="fan-suite-team-mark" aria-hidden="true" hidden={!src} title={src?`${palette.team} team logo`:undefined} data-team={palette.id}>{src&&failed!==src?<Image src={src} alt={`${palette.team} team logo`} className="h-full w-full" fittingType="fit" onError={()=>setFailed(src)} />:<span className="fan-suite-team-mark__fallback">{palette.id.toUpperCase()}</span>}</span>;
}