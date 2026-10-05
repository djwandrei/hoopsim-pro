import React, { useState } from 'react';

const prompts = [
  { preset: 'balanced', label: 'Balanced', title: 'Build a balanced five', question: 'Which players stay in the lineup when you ask it to do a little of everything?' },
  { preset: 'defense', label: 'Defense', title: 'Start with the stops', question: 'Put defensive strengths first. After the build, read the Lineup DNA: what offensive tradeoff does that introduce?' },
  { preset: 'offense', label: 'Offense', title: 'Give the offense a new look', question: 'Prioritize scoring, spacing, and creation. Which players change, and which defensive roles become thinner?' },
];
export default function LineupCoachingBrief() {
  const [index, setIndex] = useState(0), [notice, setNotice] = useState('');
  const prompt = prompts[index];
  const apply = () => {
    const button = document.querySelector(`#presetGrid [data-preset="${prompt.preset}"]`);
    if (button.disabled || button.closest('[hidden]')) return;
    button.click(); button.focus({ preventScroll: true }); setNotice(`${prompt.label} focus applied. Review the selected game plan below.`);
  };
  return <details id="coachingBrief"><summary>Coach’s prompt cards</summary><small id="coachingBriefNumber">Practice prompt {index + 1} of 3</small><h3 id="coachingBriefTitle">{prompt.title}</h3><p id="coachingBriefQuestion" className="helper">{prompt.question}</p><div className="card-actions"><button id="applyCoachingBrief" type="button" className="button" onClick={apply}>Use {prompt.label} focus</button><button id="nextCoachingBrief" type="button" className="button button--quiet" onClick={() => { setIndex((index + 1) % 3); setNotice(''); }}>Next prompt</button></div><p className="helper">These are practice ideas, not predictions. Using one only re-balances your focus weights — your roster, rules, and player picks stay exactly as they are.</p><p id="coachingBriefStatus" role="status" className="helper">{notice}</p></details>;
}