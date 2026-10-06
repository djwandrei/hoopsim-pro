// Admin harvest: grows the virtual-pack card pool from PSA's public price
// guide. For each requested set, an LLM with web context pulls priced card
// rows; this function filters them to the studio's 2017-26 player pool and
// upserts PackCard records (deduped by sourceId).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { prepareRows } from '../../shared/packPoolHarvest.ts';

const MAX_SETS_PER_RUN = 3;
const MAX_ROWS_PER_SET = 40;

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
        prompt: `Harvest basketball card pricing for this set: ${setInfo.name} (released ${setInfo.year}).

Use web search to find priced listings for this exact set on BOTH:
- PSA's price guide and CardFacts pages (psacard.com/priceguide/basketball-card-values/... and psacard.com/cardfacts/basketball-cards/...)
- SportsCardsPro / PriceCharting set pages (sportscardspro.com/console/basketball-cards-...), which list Ungraded / Grade 9 / PSA 10 sale prices for the full checklist.

List up to ${MAX_ROWS_PER_SET} individual cards, prioritizing rookie cards of NBA players and notable parallels (SILVER PRIZM, BLUE PRIZM, RED PRIZM, ICE, PULSAR, WAVE, FAST BREAK, CHOICE, GOLD, HOLO, etc.). For each card give:
- description: the player name plus parallel name exactly as listed (e.g. "LaMelo Ball (R) SILVER PRIZM")
- cardNumber: the card number in the set
- priceUsd10: the PSA 10 price in USD when shown (the PSA 10 column), with "+" and commas stripped
- imageUrl: ONLY if you actually saw a card scan ending in .jpg hosted on i.psacard.com or storage.googleapis.com/images.pricecharting.com — never a page URL.
Only include cards actually priced or listed; do not invent cards.`,
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
        model: 'gemini_3_8_flash',
      });
      const rows = (llm && Array.isArray(llm.cards)) ? llm.cards : [];
      const prepared = prepareRows(rows, setInfo, poolNames);
      let written = 0;
      if (prepared.length) {
        const up = await base44.entities.PackCard.upsert(prepared, { key: 'sourceId' });
        written = (up?.created || 0) + (up?.updated || 0);
      }
      results.push({ set: setInfo.name, harvested: rows.length, matched: prepared.length, written });
    }
    return Response.json({ poolNames: poolNames.length, results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The pool harvest failed.' }, { status: 500 });
  }
}