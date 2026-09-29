import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Users, FlaskConical, Swords, Zap, LineChart, ArrowRight } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';

const TOOLS = [
  { path: '/season', icon: CalendarRange, title: 'Season Lab', blurb: "Replay full NBA seasons with every team's observed four-factor profile — playoffs included." },
  { path: '/players', icon: Users, title: 'Player Blueprint', blurb: "Model any player's next game with percentile bands for points, rebounds and assists against a chosen opponent." },
  { path: '/chemistry', icon: FlaskConical, title: 'Chemistry Lab', blurb: 'Build a five-man lineup, score its fit, and test it against any team in the league.' },
  { path: '/forge', icon: Swords, title: 'Composite Forge', blurb: 'Fuse two rosters into one super team and run it through a full league tour.' },
  { path: '/game', icon: Zap, title: 'Game Lab', blurb: 'Simulate single matchups with full box scores, then play best-of-seven campaign series.' },
  { path: '/career', icon: LineChart, title: 'Career Lab', blurb: "Project a player's career across future seasons with aging-curve Monte Carlo bands." },
];

export default function StudioHome() {
  return (
    <StudioShell active="/">
      <header className="relative overflow-hidden border-b border-border/50">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-royal/20 blur-3xl" />
        <div className="pointer-events-none absolute right-40 top-48 h-40 w-40 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-12">
          <span className="court-kicker inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            SWISHIQ STUDIO
          </span>
          <h1 className="court-display mt-3 text-6xl leading-none text-foreground sm:text-7xl">SIX WAYS TO RUN THE COURT</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every tool below runs on the same verified simulation engine and the same published SwishIQ season packages — pick a lab and start modeling.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(tool => (
            <Link
              key={tool.path}
              to={tool.path}
              className="court-panel group flex flex-col p-5 transition-colors hover:border-gold/60"
            >
              <tool.icon className="h-6 w-6 text-gold" />
              <h2 className="court-display mt-3 text-2xl text-foreground">{tool.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{tool.blurb}</p>
              <span className="mt-4 inline-flex items-center gap-1 font-display text-sm tracking-widest text-goldSoft transition-colors group-hover:text-gold">
                OPEN
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </StudioShell>
  );
}