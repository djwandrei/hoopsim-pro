import React, { useEffect } from 'react';
import { SITE_ORIGIN } from '@/lib/deployConfig';

export default function LineupSharedResult() {
  useEffect(() => {
    window.location.replace(`${SITE_ORIGIN}/tools/shared-result/${window.location.search}${window.location.hash}`);
  }, []);
  return <p role="status" className="p-6 text-sm text-muted-foreground">Opening the verified shared result…</p>;
}