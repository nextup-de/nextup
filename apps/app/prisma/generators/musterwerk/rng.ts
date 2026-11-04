// A seeded PRNG for the Musterwerk generator (TST-G1/D5). Same seed, same numbers: no Math.random,
// no Date.now. `fork(label)` gives an independent stream, so adding a draw in one part of the
// generator (people, say) does not move the numbers of another (cases).

export type Rng = {
  /** [0, 1) */
  next(): number;
  /** Whole number in [min, max], both included. */
  int(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  /** A shuffled copy (Fisher-Yates). */
  shuffle<T>(xs: readonly T[]): T[];
  /** One item, by weight. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  fork(label: string): Rng;
};

/** FNV-1a, 32 bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: number | string): Rng {
  const label = String(seed);
  const next = stream(hash(label));
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: (items) => {
      const total = items.reduce((a, [, w]) => a + w, 0);
      let x = next() * total;
      for (const [item, w] of items) {
        x -= w;
        if (x < 0) return item;
      }
      return items[items.length - 1][0];
    },
    fork: (sub) => makeRng(`${label}/${sub}`),
  };
  return rng;
}
