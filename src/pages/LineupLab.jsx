import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LineupBootStatus from '@/components/lineupLab/LineupBootStatus';
import usePageMeta from '@/hooks/usePageMeta';
import { mountLineupLab, unmountLineupLab } from '@/lineupLab/lineup-lab/pageBoot';

export default function LineupLab() {
  const hostRef = useRef(null);
  const [bootError, setBootError] = useState('');
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  usePageMeta({
    title: "NBA Lineup Lab | DJ's House of Cards",
    description: 'Build historical NBA lineups and rotations with an exact optimizer, then explore each group\u2019s Lineup DNA, role coverage, and one-player tradeoffs.',
  });

  useEffect(() => {
    // The site's relative demo-file URLs require a directory-shaped route.
    if (!location.pathname.endsWith('/')) {
      navigate(`/lineup-lab/${location.search}${location.hash}`, { replace: true });
      return;
    }
    let active = true;
    const controller = new AbortController();
    setBootError(''); setLoading(true);
    mountLineupLab(hostRef.current, controller.signal).then(() => {
      if (active) setLoading(false);
    }).catch(error => {
      if (active) { setBootError(error?.message || 'The Lineup Lab could not be loaded right now.'); setLoading(false); }
    });
    return () => { active = false; controller.abort(); unmountLineupLab(); };
  }, [location.pathname, location.search, location.hash, navigate]);

  return (
    <div className="min-h-screen">
      <LineupBootStatus loading={loading} error={bootError} />
      <div ref={hostRef} hidden={Boolean(bootError)} />
    </div>
  );
}