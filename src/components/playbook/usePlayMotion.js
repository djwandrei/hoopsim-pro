import { useEffect, useRef, useState } from 'react';
import { clonePositions, distance } from '@/components/playbook/playGeometry';
import { planRoutes } from '@/components/playbook/playMotion';
import { staticPose, actorsForFrame, samplePose } from '@/components/playbook/playMotionPose';
export default function usePlayMotion(frame, speed = 1, paused = false, playing = false, onComplete) {
  const [pose, setPose] = useState(() => staticPose(frame));
  const latest = useRef(pose), clock = useRef(null);
  const settings = useRef({}); settings.current = { speed, paused, playing, onComplete };
  useEffect(() => {
    const first = !clock.current;
    const start = clonePositions(latest.current.actors);
    const canonical = Object.keys(start).every(id => frame.routes?.[id]?.[0] && distance(start[id], frame.routes[id][0]) < 1);
    const routes = canonical ? frame.routes : planRoutes(start, actorsForFrame(frame), {}, frame.courtHeight || 470);
    const duration = frame.duration || 1800;
    const timer = { elapsed: first ? duration : 0, complete: false };
    clock.current = timer;
    let request, previousTime;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const update = time => {
      if (previousTime !== undefined && !settings.current.paused) timer.elapsed += (time-previousTime)*settings.current.speed;
      previousTime = time;
      const progress = reduced ? 1 : Math.min(1, timer.elapsed/duration);
      latest.current = first || reduced ? staticPose(frame) : samplePose(frame, routes, progress);
      setPose(latest.current);
      if (timer.elapsed >= duration + 450) {
        timer.complete = true;
        if (settings.current.playing) settings.current.onComplete?.();
      } else request = requestAnimationFrame(update);
    };
    request = requestAnimationFrame(update);
    return () => cancelAnimationFrame(request);
  }, [frame]);
  useEffect(() => {
    if (playing && !paused && clock.current?.complete) settings.current.onComplete?.();
  }, [playing, paused]);
  return pose;
}