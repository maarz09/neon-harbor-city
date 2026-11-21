// A small seeded random number generator (mulberry32) so the city layout and screenshot scenes
// come out the same every time for a given seed.

export function createRng(seed = 1) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/** One shared generator for gameplay randomness; reseeded by the screenshot mode. */
export const rng = createRng(20261121);

export function reseedGlobalRng(seed) {
  const fresh = createRng(seed);
  Object.assign(rng, fresh);
}
