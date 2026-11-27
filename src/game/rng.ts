/** mulberry32 step: returns [value in [0,1), next state]. Pure so the state can live in GameState. */
export function mulberry32(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Draws the next value in [0,1) from the state's PRNG and advances it. */
export function nextRandom(holder: { rngState: number }): number {
  const [value, next] = mulberry32(holder.rngState);
  holder.rngState = next;
  return value;
}

export function parseSeed(raw: string | null): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 0xffffffff ? n : null;
}
