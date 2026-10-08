import React from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import GameShell from '@/components/dailyGames/GameShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import { DAILY_GAMES } from '@/components/studio/workbenches';

const GAMES = DAILY_GAMES[0].children;

// The primary Daily Games screen: the desk both verified daily games launch
// from. Each game keeps its own page and verified evaluator flow.
export default function DailyGames() {
  usePageMeta({
    title: 'Daily Games | DJ\'s House of Cards',
    description: 'Pick today\'s verified daily game — Fix the Five or Draft Night — lock your calls blind, and reveal one verified score from the SwishIQ evaluator.',
  });
  return (
    <GameShell>
      <WorkbenchHeader
        title="DAILY GAMES"
        description="Two verified daily games on one desk — pick a game, lock your calls blind, and reveal one verified score from the SwishIQ evaluator."
      />
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {GAMES.map((tool, index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}
        </div>
      </main>
    </GameShell>
  );
}