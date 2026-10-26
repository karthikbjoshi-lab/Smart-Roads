// Seeded pseudo-random numbers (mulberry32). The seed lives in the simulation
// state, so a scenario replays identically from the same starting seed.

export interface Seeded {
  seed: number;
}

export function rand(s: Seeded): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(s: Seeded, min: number, max: number): number {
  return min + (max - min) * rand(s);
}

export function int(s: Seeded, min: number, max: number): number {
  return Math.floor(range(s, min, max + 1));
}

export function chance(s: Seeded, p: number): boolean {
  return rand(s) < p;
}

export function pick<T>(s: Seeded, items: readonly T[]): T {
  return items[Math.floor(rand(s) * items.length) % items.length];
}

export function weightedPick<T>(s: Seeded, items: readonly T[], weight: (item: T) => number): T | undefined {
  const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0);
  if (total <= 0) return undefined;
  let r = rand(s) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round1 = (v: number) => Math.round(v * 10) / 10;
