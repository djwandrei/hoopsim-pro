import React from 'react';
import { Link } from 'react-router-dom';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import StudioWelcome from '@/components/studio/StudioWelcome';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import BroadcastTicker from '@/components/studio/BroadcastTicker';
import { WORKBENCHES, DAILY_GAMES_ROUTES } from '@/components/studio/workbenches';
import FanToolsGrid from '@/components/studio/FanToolsGrid';
import ResumeStrip from '@/components/studio/ResumeStrip';
import DailyCall from '@/components/studio/DailyCall';
export default function StudioHome() {
  usePageMeta({ title: 'SwishIQ Studio — DJHC Basketball Analytics', description: 'Eight NBA analytics workbenches and daily games: season and franchise sims, player blueprints, chemistry, Forge drafts, collector tools and lineup solving.' });
  const board = [{ value: '08', label: 'Workbenches' }, { value: '2017–26', label: 'Published archive' }, { value: '04', label: 'Comparison slots' }, { value: 'SHA-256', label: 'Verified source' }, { value: 'Original', label: 'Gameplay modules' }, { value: 'Seeded', label: 'Replay engine' }];
  return <StudioShell active="/"><StudioWelcome /><BroadcastTicker items={board} /><ResumeStrip /><DailyCall /><main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
    
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{WORKBENCHES.map((tool, index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}</div>
    <div className="mt-12"><div className="rise-in mb-5 flex flex-wrap items-baseline justify-between gap-2"><div><p className="bcast-kicker mb-2">Daily desk</p><Link to="/daily-games" className="font-display text-xl tracking-wide transition-colors hover:text-gold">DAILY GAMES</Link></div><span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Fresh calls · Verified ranks</span></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{DAILY_GAMES_ROUTES.map((tool, index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}</div></div>
    <FanToolsGrid />
  </main></StudioShell>;
}