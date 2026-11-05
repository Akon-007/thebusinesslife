/** Deterministic RNG so the city layout and crowd look the same on every load. */
export interface Rng {
  next(): number
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng.next() * arr.length) % arr.length]
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min)
}

export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1))
}

export function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability
}
