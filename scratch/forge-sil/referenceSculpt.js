import { referenceLoft } from './referenceLoft';
import { REFERENCE_BALL, REFERENCE_PARTS } from './referencePose';

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
    const z = -.16 + i * .028, shortening = Math.abs(i - 1.5) * .008;
    addMesh('arm-r', referenceLoft([
      [-.342,2.503-shortening,z,.011,.01], [-.325,2.562-shortening,z,.011,.009],
      [-.3,2.63-shortening,z,.009,.008], [-.272,2.685-shortening,z,.008,.007],
      [-.253,2.694-shortening,z,.003,.003]
    ], grip, [0,0,1]));
  }
  addMesh('arm-r', referenceLoft([
    [-.345,2.5,-.205,.017,.015], [-.328,2.49,-.163,.015,.012],
    [-.302,2.495,-.118,.011,.01], [-.286,2.515,-.086,.004,.004]
  ], grip));
  // Open trailing hand: palm already continues from the forearm; fingers splay.
  const trailing = goldRec().mat;
  for (let i = 0; i < 4; i += 1) {
    const x = .42 + i * .014, z = .018 + i * .013;
    const length = [.075,.098,.09,.066][i];
    addMesh('arm-l', referenceLoft([
      [x,1.44,z,.01,.009], [x+.02,1.395,z+.008,.009,.008],
      [x+.045,1.44-length,z+.017,.007,.006], [x+.056,1.43-length,z+.015,.002,.002]
    ], trailing));
  }
  addMesh('arm-l', referenceLoft([
    [.408,1.47,.03,.015,.012], [.4,1.435,.072,.012,.01],
    [.404,1.392,.092,.008,.007], [.419,1.37,.089,.003,.003]
  ], trailing));
  return { ball: REFERENCE_BALL };
}