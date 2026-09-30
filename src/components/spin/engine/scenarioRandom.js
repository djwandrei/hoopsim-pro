// Original random-stream functions from DJHC possession-simulator.js.
const validSeed = value => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,80}$/.test(value);
function seedNumber(seed) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
function randomStream(seed) {
  let value = seedNumber(seed);
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let bits = value;
    bits = Math.imul(bits ^ (bits >>> 15), bits | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}
export function createScenarioRandom(seed) {
  if (!validSeed(seed)) throw new Error('Use a valid repeatable seed.');
  return randomStream(seed);
}