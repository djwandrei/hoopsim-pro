import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamLogo } from '@/components/djhc/siteNavigation';
export default function HeaderTeamMark() {
  const {palette}=useCourtTheme(),src=teamLogo(palette),[failed,setFailed]=useState('');
  if (!src) return null;
  return failed !== src
    ? <Image src={src} alt={`${palette.team} team logo`} className="fan-suite-team-mark" aria-hidden="true" title={`${palette.team} team logo`} data-team={palette.id} fittingType="fit" onError={()=>setFailed(src)} />
    : <span className="fan-suite-team-mark fan-suite-team-mark__fallback" aria-hidden="true" title={`${palette.team} team logo`} data-team={palette.id}>{palette.id.toUpperCase()}</span>;
}