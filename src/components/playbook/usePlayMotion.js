import { useEffect, useRef, useState } from 'react';
import { staticPose, samplePose } from '@/components/playbook/playMotionPose';

export default function usePlayMotion(frame, speed = 1, paused = false, playing = false, onComplete) {
  const [pose, setPose] = useState(() => frame.isSetup ? staticPose(frame) : samplePose(frame, frame.routes, 0));
  const clock = useRef(null);
  const settings = useRef({ speed, paused, playing, onComplete });
  settings.current = { speed, paused, playing, onComplete };
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = frame.isSetup || reduced ? 350 : frame.duration;
    const timer = { elapsed: 0, complete: false, delivered: false };
    clock.current = timer;
    let request, previousTime;
    const update = time => {
      if (previousTime !== undefined && !settings.current.paused) timer.elapsed += (time - previousTime) * settings.current.speed;
      previousTime = time;
      const progress = Math.min(1, timer.elapsed / duration);
      setPose(frame.isSetup || reduced ? staticPose(frame) : samplePose(frame, frame.routes, progress));
      if (timer.elapsed >= duration + 450 && !settings.current.paused) {
        timer.complete = true;
        if (settings.current.playing && !timer.delivered) {
          timer.delivered = true;
          settings.current.onComplete?.();
        }
      } else request = requestAnimationFrame(update);
    };
    setPose(frame.isSetup || reduced ? staticPose(frame) : samplePose(frame, frame.routes, 0));
    request = requestAnimationFrame(update);
    return () => cancelAnimationFrame(request);
  }, [frame]);
  // A manually inspected step may already be finished when Play is pressed.
  useEffect(() => {
    const timer = clock.current;
    if (playing && !paused && timer?.complete && !timer.delivered) {
      timer.delivered = true;
      settings.current.onComplete?.();
    }
  }, [playing, paused]);
  return pose;
}
