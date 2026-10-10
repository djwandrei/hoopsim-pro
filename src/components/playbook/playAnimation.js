import sequences from '@/components/playbook/playSequences';
import { compileSequence } from '@/components/playbook/playTimeline';
export { COURT } from '@/components/playbook/playGeometry';

// Each shipped play has an explicit, reviewed sequence. Display prose is never
// parsed into movement, possession changes, or defensive assignments.
export function buildFrames(play) {
  const definition = sequences[play.name];
  if (!definition) throw new Error(`No reviewed animation sequence for ${play.name}.`);
  return compileSequence(play, definition);
}