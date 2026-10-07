import { referenceLoft } from '@/components/forge/referenceLoft';
import { REFERENCE_BALL, REFERENCE_PARTS } from '@/components/forge/referencePose';

export function buildReferenceSculpt({ addMesh, goldRec, deepRec }) {
  for (const part of REFERENCE_PARTS) {
    if (part.key.startsWith('thigh-') || part.key.startsWith('shin-') && !part.profile) continue;
    const record = part.deep ? deepRec() : goldRec();
    const garment = part.profile === 'cloth';
    addMesh(part.key, referenceLoft(part.rows, record.mat, part.hint, part.profile, { caps: [false, !garment] }));
  }
  // Each thigh and calf is one uninterrupted surface through the bent knee,
  // while material groups preserve independent thigh/shin forge progression.
  for (const side of ['r', 'l']) {
    const thigh = REFERENCE_PARTS.find(part => part.key === `thigh-${side}`);
    const shin = REFERENCE_PARTS.find(part => part.key === `shin-${side}` && !part.profile);
    const rows = [...thigh.rows.slice(0, -1), ...shin.rows.slice(1)];
    const upper = goldRec(), lower = goldRec();
    const leg = referenceLoft(rows, [upper.mat, lower.mat], undefined, 'skin', { caps: [false, false], splitAt: thigh.rows.length - 2 });
    addMesh(thigh.key, leg, [upper.mat]);
    addMesh(shin.key, leg, [lower.mat]);
  }
  // Four curled fingers sit against the ball's actual surface, not beneath it.
  const grip = goldRec().mat;
  for (let i = 0; i < 4; i += 1) {
    const z = -.547 + i * .027, shortening = Math.abs(i - 1.5) * .009;
    addMesh('arm-r', referenceLoft([
      [-.453,2.562-shortening,z,.011,.01], [-.446,2.603-shortening,z,.011,.009],
      [-.423,2.65-shortening,z,.009,.008], [-.381,2.687-shortening,z,.008,.007],
      [-.35,2.695-shortening,z,.003,.003]
    ], grip, [0,0,1]));
  }
  addMesh('arm-r', referenceLoft([
    [-.445,2.512,-.499,.017,.015], [-.427,2.501,-.456,.015,.012],
    [-.389,2.502,-.414,.011,.01], [-.359,2.524,-.397,.004,.004]
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