/**
 * Seeded, reproducible randomness.
 *
 * Every outcome that varies must be produced from a company's stored seed, so
 * the same company in the same situation always sees the same result — a
 * replay, a test run or a lecturer's debrief can reproduce it exactly. Nothing
 * that affects money, missions or scores may call `Math.random`.
 *
 * The generator is the same mulberry32 variant the player application uses for
 * the city layout, so a seed means the same thing on both sides.
 */

export interface Rng {
  next(): number
}

/** The generator itself. `seed` is reduced to 32 bits. */
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

/**
 * Derives a stable numeric seed from a string.
 *
 * Used so a seed can be stored and displayed as text (`BL-8F3A21C4`) while the
 * generator still gets a number. Same text, same seed, forever.
 */
export function seedFromString(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** A memorable, stable seed string. Derived from the company id, never random. */
export function seedStringFor(companyId: string): string {
  return `BL-${(seedFromString(companyId) >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}

/** An RNG bound to a company and a named stream, so streams never interfere. */
export function rngFor(seed: string, stream: string): Rng {
  return createRng(seedFromString(`${seed}:${stream}`))
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[Math.floor(rng.next() * values.length) % values.length]
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

/**
 * Applies a seeded multiplier around 1.0, e.g. a demand estimate that lands
 * between 0.8× and 1.2× of the modelled figure. Always the same for the same
 * seed and stream.
 */
export function jitter(rng: Rng, spread: number): number {
  return 1 + (rng.next() * 2 - 1) * spread
}
