import React from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, FlipHorizontal, FastForward } from 'lucide-react';

const control = 'inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-raised/40 px-3 text-sm text-foreground transition-colors hover:border-gold/50 hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40';

export default function PlayControls({
  stepIndex, stepCount, playing, speed, mirrored,
  onPrev, onNext, onTogglePlay, onRestart, onCycleSpeed, onToggleMirror, onScrub,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={control} onClick={onPrev} disabled={stepIndex <= 0} aria-label="Previous step"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className={`${control} border-gold/50 bg-gold/10 text-gold`} onClick={onTogglePlay} aria-label={playing ? 'Pause animation' : 'Play animation'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <span className="hidden text-[10.4px] font-semibold uppercase tracking-widest sm:inline">{playing ? 'Pause' : 'Play'}</span>
        </button>
        <button type="button" className={control} onClick={onNext} disabled={stepIndex >= stepCount - 1} aria-label="Next step"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" className={control} onClick={onRestart} aria-label="Restart from setup"><RotateCcw className="h-4 w-4" /></button>
        <button type="button" className={control} onClick={onCycleSpeed} aria-label="Playback speed"><FastForward className="h-4 w-4" /><span className="font-mono text-xs">{speed}×</span></button>
        <button type="button" className={`${control} ${mirrored ? 'border-gold/50 bg-gold/10 text-gold' : ''}`} onClick={onToggleMirror} aria-pressed={mirrored}><FlipHorizontal className="h-4 w-4" /><span className="hidden text-[10.4px] font-semibold uppercase tracking-widest sm:inline">Mirror</span></button>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">Step {stepIndex + 1} / {stepCount}</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jump to step">
        {Array.from({ length: stepCount }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onScrub(i)}
            aria-label={`Step ${i + 1}`}
            aria-current={i === stepIndex}
            className={`h-3 w-3 rounded-full transition-colors ${i === stepIndex ? 'bg-gold' : 'bg-border/50 hover:bg-gold/50'}`}
          />
        ))}
      </div>
    </div>
  );
}