// One-off helper: extracts object bounding boxes (pixels) for each of the
// three figures in the composite reference render, for proportion matching.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const box = { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 };
const figureSchema = {
  type: 'object',
  properties: {
    figure_full: box, ball: box, head: box, torso: box, shorts: box,
    raised_arm: box, hanging_arm: box, hand_raised: box, hand_hanging: box,
    shoe_front: box, shoe_back: box
  },
  required: ['figure_full', 'ball', 'head', 'torso', 'shorts', 'hand_raised', 'hand_hanging', 'shoe_front', 'shoe_back']
};
const schema = {
  type: 'object',
  properties: { left: figureSchema, center: figureSchema, right: figureSchema },
  required: ['left', 'center', 'right']
};

const prompt = `This 1024x640 image shows THREE renders of the same basketball player frozen mid-air in a one-hand dunk, on a plain gray background: a left figure (three-quarter view), a center figure (facing the camera), and a right figure (seen from behind). A logo graphic sits at the top center — ignore it completely.

For EACH of the three figures (keyed "left", "center", "right"), report tight axis-aligned bounding boxes in PIXEL coordinates (x from 0 at the left edge to 1024 at the right; y from 0 at the top to 640 at the bottom), as [x_min, y_min, x_max, y_max] integers, for:
- figure_full: everything belonging to that figure including ball and shoes
- ball: the basketball only
- head: the head including hair, excluding the neck
- torso: the jersey including shoulders (its top edge is the shoulder/trap line, its bottom edge where the jersey ends)
- shorts: the shorts including the waistband and hem
- raised_arm: the raised arm holding the ball (from the shoulder to the hand)
- hanging_arm: the hanging arm (when partially hidden, give the visible part)
- hand_raised: the hand gripping the ball
- hand_hanging: the open hanging hand with spread fingers
- shoe_front: the shoe of the forward/driving leg (the one whose knee is bent and raised)
- shoe_back: the shoe of the trailing/kicked-back leg (in some views it is higher, near hip or waist height)

Measure carefully against the actual pixels. If a part is fully hidden in a view, still give your best estimate of where it is.`;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const core = base44.asServiceRole.integrations.Core;
    const result = await core.InvokeLLM({
      prompt,
      file_urls: ['https://media.base44.com/images/public/6abc41d86dabd382371f49ea/bd9ef3fff_basketball-player-3d-model-3d-model-5f50d4c104.webp'],
      response_json_schema: schema
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}