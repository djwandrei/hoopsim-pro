import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const clean = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lineup = Array.isArray(body.lineup)
      ? body.lineup.slice(0, 15).map((name) => clean(name, 60)).filter(Boolean)
      : [];
    const metrics = Array.isArray(body.metrics)
      ? body.metrics.slice(0, 14).map((metric) => ({
        label: clean(metric?.label, 40),
        value: clean(metric?.value, 20),
      })).filter((metric) => metric.label)
      : [];
    if (!lineup.length || !metrics.length) {
      return Response.json({ error: 'A solved lineup and its headline metrics are required.' }, { status: 400 });
    }
    const team = clean(body.team, 80) || 'the selected team';
    const season = clean(body.season, 40);
    const weights = clean(body.weights, 240);

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: [
        'You write one-sentence broadcast-style analyses for an NBA lineup optimizer.',
        'Write exactly ONE sentence (maximum 32 words, plain text, no markdown, no lists) explaining why the recommended group wins and what trade-off it accepts.',
        'Reference at most two of the headline metrics. Never invent numbers that are not provided.',
        '',
        `Team/season: ${team}${season ? ` (${season})` : ''}`,
        `Objective weights: ${weights || 'default'}`,
        '',
        'Recommended group:',
        ...lineup.map((name) => `- ${name}`),
        '',
        'Headline metrics:',
        ...metrics.map((metric) => `- ${metric.label}: ${metric.value}`),
      ].join('\n'),
      response_json_schema: {
        type: 'object',
        properties: { narrative: { type: 'string' } },
        required: ['narrative'],
        additionalProperties: false,
      },
    });
    const narrative = typeof response?.narrative === 'string' ? response.narrative.slice(0, 400) : '';
    if (!narrative) return Response.json({ error: 'The narrative could not be generated.' }, { status: 502 });
    return Response.json({ narrative });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}