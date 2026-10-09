import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The browser engine imports the app's safeStorage helper through the Vite
// alias. Replace that browser-only import so the deterministic core can be
// exercised directly with Node's built-in test runner.
let source = await readFile(new URL('../src/lib/cards/packEngine.js', import.meta.url), 'utf8');
source = source.replace("import { safeStorage } from '@/lib/safeStorage';", 'const safeStorage = () => null;');
assert.doesNotMatch(source, /from\s+['"]@\//, 'The pack engine test module should not retain Vite aliases.');
const engine = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function eligibleCard(id) {
  return {
    verification: 'exact-reviewed-nba-product-mapping',
    product: {
      id,
      name: `NBA card ${id}`,
      image: `/assets/card-${id}.jpg`,
      productUrl: `https://shop.example.test/basketball-cards.html?item=${id}`,
    },
    mappings: [{
      reviewState: 'auto_verified',
      subjectRole: 'featured_player',
      depictedSeasonLabel: '2024–25',
      depictedSeasonEndYear: 2025,
      player: { athleteId: `athlete-${id}`, name: `Player ${id}` },
    }],
  };
}

class MemoryStorage {
  #values = new Map();

  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

test('same seed and declared pool produce the same no-replacement draw', () => {
  const cards = Array.from({ length: 8 }, (_, index) => eligibleCard(index + 1));
  const first = engine.openPack(cards, { packSize: 5, seed: 'repeatable-seed', openedAt: 100 });
  const second = engine.openPack(cards, { packSize: 5, seed: 'repeatable-seed', openedAt: 100 });

  assert.deepEqual(first.receipt, second.receipt);
  assert.deepEqual(first.cards.map(card => card.product.id), first.receipt.drawnProductIds);
  assert.equal(new Set(first.receipt.drawnProductIds).size, 5);
  assert.deepEqual(first.receipt.poolProductIds, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(first.receipt.drawnProductIds.every(id => first.receipt.poolProductIds.includes(id)));
});

test('pack receipts reject unreviewed, duplicate, or tampered pool entries', () => {
  const cards = Array.from({ length: 5 }, (_, index) => eligibleCard(index + 1));
  assert.throws(() => engine.openPack([
    { ...cards[0], verification: 'catalog-text-only' },
    ...cards.slice(1),
  ], { seed: 'invalid' }), /exact reviewed NBA product mapping/);
  assert.throws(() => engine.openPack([...cards, eligibleCard(1)], { seed: 'duplicate' }), /cannot repeat a product ID/);

  const draw = engine.openPack(cards, { seed: 'tamper-me', openedAt: 101 });
  const tampered = { ...draw.receipt, drawnProductIds: draw.receipt.drawnProductIds.slice().reverse() };
  const serialized = JSON.stringify({ version: 2, engine: engine.PACK_ENGINE, entries: [tampered] });
  assert.deepEqual(engine.parsePackHistory(serialized), []);
});

test('history uses the v2 browser key and keeps only valid receipts', () => {
  const storage = new MemoryStorage();
  const cards = Array.from({ length: 5 }, (_, index) => eligibleCard(index + 1));
  const draw = engine.openPack(cards, { seed: 'history-seed', openedAt: 102 });
  assert.equal(engine.writePackHistory([draw.receipt], storage), true);
  assert.deepEqual(engine.readPackHistory(storage), [draw.receipt]);
  assert.equal(storage.getItem(engine.PACK_HISTORY_KEY) !== null, true);

  const secondDraw = engine.openPack(cards, { seed: 'new-seed', openedAt: 103 });
  const prepended = engine.prependPackHistory([draw.receipt], secondDraw.receipt);
  assert.equal(prepended.length, 2);
  assert.deepEqual(engine.clearPackHistory(storage), []);
  assert.equal(engine.readPackHistory(storage).length, 0);
});

test('eligible card creation accepts only exact reviewed mapping results', () => {
  const product = eligibleCard(77).product;
  const exact = engine.eligiblePackCardFromMatches([{
    verification: 'exact-reviewed-nba-product-mapping',
    product,
    mapping: { reviewState: 'human_verified', subjectRole: 'featured_player', depictedSeasonEndYear: 2024 },
    player: { athleteId: 'athlete-77', name: 'Player 77' },
  }]);
  assert.equal(exact.product.id, 77);
  assert.equal(exact.mappings[0].reviewState, 'human_verified');
  assert.equal(engine.eligiblePackCardFromMatches([{
    verification: 'catalog-text-only',
    product,
    mapping: { reviewState: 'human_verified' },
    player: { athleteId: 'athlete-77', name: 'Player 77' },
  }]), null);
});
