import { referenceLoft } from '@/components/forge/referenceLoft';
import { REFERENCE_BALL, REFERENCE_PARTS } from '@/components/forge/referencePose';

export function buildReferenceSculpt({ addMesh, goldRec, deepRec }) {
  for (const part of REFERENCE_PARTS) {
    const record = part.deep ? deepRec() : goldRec();
    addMesh(part.key, referenceLoft(part.rows, record.mat, part.hint));
  }
  // Four curled fingers sit against the ball's actual surface, not beneath it.
  const grip = goldRec().mat;
  for (let i = 0; i < 4; i += 1) {
    const z = .188 + i * .027, shortening = Math.abs(i - 1.5) * .009;
    addMesh('arm-r', referenceLoft([
      [-.743,2.562-shortening,z,.011,.01], [-.736,2.603-shortening,z,.011,.009],
      [-.713,2.65-shortening,z,.009,.008], [-.671,2.687-shortening,z,.008,.007],
      [-.64,2.695-shortening,z,.003,.003]
    ], grip, [0,0,1]));
  }
  addMesh('arm-r', referenceLoft([
    [-.735,2.512,.236,.017,.015], [-.717,2.501,.279,.015,.012],
    [-.679,2.502,.321,.011,.01], [-.649,2.524,.338,.004,.004]
  ], grip));
  // Open trailing hand: palm already continues from the forearm; fingers splay.
  const trailing = goldRec().mat;
  for (let i = 0; i < 4; i += 1) {
    const x = .514 + i * .015, z = .016 + i * .014;
    const length = [.081,.105,.096,.072][i];
    addMesh('arm-l', referenceLoft([
      [x,1.313,z,.01,.009], [x+.021,1.27,z+.008,.009,.008],
      [x+.046,1.313-length,z+.017,.007,.006], [x+.057,1.303-length,z+.015,.002,.002]
    ], trailing));
  }
  addMesh('arm-l', referenceLoft([
    [.49,1.356,.032,.015,.012], [.482,1.321,.074,.012,.01],
    [.486,1.278,.094,.008,.007], [.501,1.256,.091,.003,.003]
  ], trailing));
  return { ball: REFERENCE_BALL };
}