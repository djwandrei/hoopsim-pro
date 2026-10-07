// Admin harvest: grows the virtual-pack card pool from PSA's public price
// guide. For each requested set, an LLM with web context pulls priced card
// rows; this function filters them to the studio's 2017-26 player pool and
// upserts PackCard records (deduped by sourceId).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { prepareRows } from '../../shared/packPoolHarvest.ts';

const MAX_SETS_PER_RUN = 3;
const MAX_ROWS_PER_SET = 60;

async function loadPoolNames(base44: any, override: unknown): Promise<string[]> {
  if (Array.isArray(override) && override.length) {
    return override.filter((name: any) => typeof name === 'string').slice(0, 2000);
  }
  const res = await base44.functions.invoke('swishiqSeasonSource', { career: true });
  const records = res?.data?.records || [];
  return [...new Set(records.map((r: any) => r.displayName).filter(Boolean))];
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admins only.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const sets = (Array.isArray(body.sets) ? body.sets : [])
      .filter((s: any) => s && typeof s.name === 'string' && s.name.trim() && Number.isFinite(Number(s.year)))
      .slice(0, MAX_SETS_PER_RUN);
    if (!sets.length) return Response.json({ error: 'Pass sets: [{name, year}].' }, { status: 400 });

    const poolNames = await loadPoolNames(base44, body.poolNames);
    if (!poolNames.length) return Response.json({ error: 'The career player pool is unavailable.' }, { status: 503 });

    const results = [];
    for (const set of sets) {
      const setInfo = { name: String(set.name).trim(), year: Number(set.year) };
      const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Transcribe priced basketball card rows for this set: ${setInfo.name} (released ${setInfo.year}).

This is the men's NBA set — the pool is NBA players only. If a WNBA product shares the name, search specifically for the NBA version and skip all WNBA rows.

Step 1 — web search: "sportscardspro basketball-cards ${setInfo.name.toLowerCase()}" (also try "pricecharting ${setInfo.name.toLowerCase()}"). Open the sportscardspro.com/pricecharting.com console page for the set — it is a price table with columns: Card | Ungraded | Grade 9 | PSA 10.

Step 2 — transcribe the table: list up to ${MAX_ROWS_PER_SET} rows covering the WHOLE market spread, not just the top: cheap base rookies and base cards (under $25), mid-range parallels ($25-$200), and high-end cards ($200+). Include every brand/parallel family in the set (base, Silver/Gold/Orange/Green Prizm, ICE, PULSAR, WAVE, CHOICE, HOLO, inserts, autographs, patches), and include rows even when the PSA 10 column is empty if the Ungraded or Grade 9 column has a value.
Skip multi-card listings: never transcribe rows for lots, "set (xN)", groups, or entries combining several cards with "+".
For each row give:
- description: the card text in the Card column verbatim (player, bracketed parallel name, card number — e.g. "Paolo Banchero [Silver Prizm] #249 [RC]")
- cardNumber: the card number from the Card column (e.g. "249")
- priceUsd10: the PSA 10 column value in USD, "+" and commas stripped (omit if that column is empty)
- imageUrl: REQUIRED — the row's thumbnail URL (storage.googleapis.com/images.pricecharting.com/...) exactly as shown in the row. Skip any row that has no thumbnail.
Transcribe only rows actually shown; do not invent cards.`,
        response_json_schema: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  cardNumber: { type: 'string' },
                  priceUsd10: { type: 'number' },
                  imageUrl: { type: 'string' },
                },
                required: ['description', 'cardNumber'],
              },
            },
          },
          required: ['cards'],
        },
        add_context_from_internet: true,
        model: body.model === 'gemini_3_1_pro' ? 'gemini_3_1_pro' : 'gemini_3_flash',
      });
      const rows = (llm && Array.isArray(llm.cards)) ? llm.cards : [];
      const prepared = prepareRows(rows, setInfo, poolNames);
      let written = 0;
      if (prepared.length) {
        const up = await base44.entities.PackCard.upsert(prepared, { key: 'sourceId' });
        written = (up?.created || 0) + (up?.updated || 0);
      }
      results.push({ set: setInfo.name, harvested: rows.length, matched: prepared.length, written, raw: body.debug === true ? rows : undefined, matchedNames: body.debug === true ? prepared.map((p: any) => p.name) : undefined });
    }
    return Response.json({ poolNames: poolNames.length, results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The pool harvest failed.' }, { status: 500 });
  }
}