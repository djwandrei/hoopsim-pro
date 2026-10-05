import React, { useEffect, useRef, useState } from 'react';
import { Database, Target, Shield, Users, Play, Trophy, ChevronLeft } from 'lucide-react';
import LineupDataset from '@/components/lineupLab/native/LineupDataset';
import LineupDataControls from '@/components/lineupLab/native/LineupDataControls';
import LineupGamePlan from '@/components/lineupLab/native/LineupGamePlan';
import LineupRules from '@/components/lineupLab/native/LineupRules';
import LineupReporting from '@/components/lineupLab/native/LineupReporting';
import LineupRoster from '@/components/lineupLab/native/LineupRoster';
import LineupRunControls from '@/components/lineupLab/native/LineupRunControls';
import LineupResults from '@/components/lineupLab/native/LineupResults';
import CourtArt from '@/components/lineupLab/native/CourtArt';

const STAGES = [
  { key: 'season', n: '01', title: 'Load your squad', tag: 'Pick a historical team and season to play with.', icon: Database, content: <><LineupDataset /><LineupDataControls /></> },
  { key: 'plan', n: '02', title: 'Call the game plan', tag: 'Choose what you are building, then shape the objective.', icon: Target, content: <LineupGamePlan /> },
  { key: 'boundaries', n: '03', title: 'Set the boundaries', tag: 'Court roles, optional production rules, and reports.', icon: Shield, detailed: true, content: <><LineupRules /><LineupReporting /></> },
  { key: 'pool', n: '04', title: 'Build the player pool', tag: 'Search, lock must-haves, and exclude the rest.', icon: Users, content: <LineupRoster /> },
  { key: 'run', n: '05', title: 'Run the build', tag: 'Every eligible group is checked against your rules.', icon: Play, content: <LineupRunControls /> },
  { key: 'results', n: '06', title: 'Results desk', tag: 'The recommended group, plus Lineup DNA and alternatives.', icon: Trophy, results: true },
];

export default function LineupStages({ unavailable = false }) {
  const [stage, setStage] = useState('season');
  const [mode, setMode] = useState(() => document.body.dataset.experienceMode || 'detailed');
  const [modified, setModified] = useState({});
  const [dir, setDir] = useState('forward');
  const [sweep, setSweep] = useState(0);
  const rootRef = useRef(null);
  const armed = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  // Broadcast scene change: every navigation wipes in the next scene.
  const goto = key => {
    setDir(STAGES.findIndex(s => s.key === key) >= STAGES.findIndex(s => s.key === stageRef.current) ? 'forward' : 'back');
    setSweep(n => n + 1);
    setStage(key);
  };

  // Simple mode hides the detailed boundary stage; track it live.
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(document.body.dataset.experienceMode || 'detailed'));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-experience-mode'] });
    return () => observer.disconnect();
  }, []);

  // Don't badge stages while boot restoration replays saved inputs.
  useEffect(() => {
    const timer = setTimeout(() => { armed.current = true; }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // When a solve lands, the controller unhides #results — jump to the desk.
  useEffect(() => {
    const results = rootRef.current?.querySelector('#results');
    if (!results) return;
    const observer = new MutationObserver(() => {
      if (!results.hidden) {
        setDir('forward');
        setSweep(n => n + 1);
        setStage('results');
        setTimeout(() => results.scrollIntoView({ block: 'start', behavior: 'instant' }), 80);
      }
    });
    observer.observe(results, { attributes: true, attributeFilter: ['hidden'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const listener = event => { if (typeof event.detail === 'string') goto(event.detail); };
    window.addEventListener('ll-goto-stage', listener);
    return () => window.removeEventListener('ll-goto-stage', listener);
  }, []);

  useEffect(() => {
    const button = rootRef.current?.querySelector('#resetScenarioButton');
    if (!button) return;
    const reset = () => setModified({});
    button.addEventListener('click', reset);
    return () => button.removeEventListener('click', reset);
  }, []);

  const stages = STAGES.filter(s => mode !== 'simple' || !s.detailed);
  let index = stages.findIndex(s => s.key === stage);
  if (index === -1) index = Math.min(2, stages.length - 2);
  const current = stages[index];
  const position = key => STAGES.findIndex(s => s.key === key);
  const markStage = key => () => { if (armed.current) setModified(m => (m[key] ? m : { ...m, [key]: true })); };

  return <div ref={rootRef} className="ll-game" data-current-stage={current.n} data-stage-dir={dir}>
    <div key={sweep} className="ll-broadcast-sweep" aria-hidden="true" />
    <nav className="ll-hud" aria-label="Build stages">
      <span className="ll-hud__onair"><span aria-hidden="true" />Live build</span>
      {stages.map(s => {
        const Icon = s.icon;
        const state = s.key === current.key ? 'is-current' : position(s.key) < position(current.key) ? 'is-done' : '';
        return <button key={s.key} type="button" aria-label={s.title} className={state} aria-current={s.key === current.key ? 'step' : undefined} onClick={() => goto(s.key)}>
          <span className="ll-hud__node"><Icon size={14} /></span>
          <span className="ll-hud__label"><em aria-hidden="true">{s.n}</em>{s.title}</span>
          {modified[s.key] && <span className="ll-hud__dot" title="Adjusted in this run" />}
        </button>;
      })}
      <div className="ll-hud__meter" aria-hidden="true"><span style={{ width: `${((index + 1) / stages.length) * 100}%` }} /></div>
    </nav>
    <form id="optimizerForm" noValidate className="ll-native-build">
      <fieldset id="nativeSettings" className="ll-native-settings" disabled={unavailable}>
        <legend className="sr-only">Lineup settings</legend>
        {STAGES.filter(s => !s.results && s.key !== 'run').map(s => (
          <LineupStagePanel key={s.key} scene={s} active={current.key === s.key} modified={modified[s.key]} stages={stages} index={index} onGoto={goto} onEdit={markStage(s.key)} />
        ))}
      </fieldset>
      <fieldset className="ll-native-settings" disabled={unavailable}>
        <legend className="sr-only">Review and build actions</legend>
        <LineupStagePanel scene={STAGES[4]} active={current.key === 'run'} stages={stages} index={index} onGoto={goto} onEdit={markStage('run')} />
      </fieldset>
    </form>
    <section className={`ll-stage ${current.key === 'results' ? 'is-current' : ''}`} data-stage="06" hidden={current.key !== 'results'}>
      <header className="ll-stage-head" data-stage-number="06">
        <div><p className="court-kicker">Stage 06</p><h2 className="ll-stage-title">Results desk</h2><p className="ll-stage-tag">{STAGES[5].tag}</p></div>
        <CourtArt className="ll-stage-art" />
      </header>
      <LineupResults />
      <div className="ll-stage-nav">
        <button type="button" className="text-button" onClick={() => goto('run')}><ChevronLeft size={14} /> Back to the build</button>
      </div>
    </section>
  </div>;
}