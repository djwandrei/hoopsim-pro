import React from 'react';
import LineupBootStatus from '@/components/lineupLab/LineupBootStatus';
import GameShell from '@/components/dailyGames/GameShell';
import usePageMeta from '@/hooks/usePageMeta';
import LineupWorkspace from '@/components/lineupLab/native/LineupWorkspace';
import useNativeLineup from '@/components/lineupLab/native/useNativeLineup';

export default function LineupLab() {
  const { loading, error } = useNativeLineup();
  usePageMeta({
    title: "NBA Lineup Lab | DJ's House of Cards",
    description: 'Build historical NBA lineups and rotations with an exact optimizer, then explore each group\u2019s Lineup DNA, role coverage, and one-player tradeoffs.',
  });


  return (
    <GameShell>
      <LineupBootStatus loading={loading} error={error} />
      <LineupWorkspace loading={loading || Boolean(error)} />
    </GameShell>
  );
}