/** Cross-language xorshift32. All operations are unsigned 32-bit. Zero is remapped. */
export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    const normalized = seed >>> 0;
    this.state = normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  snapshot(): number {
    return this.state;
  }
}

/** Deterministic stream derivation using UTF-8 FNV-1a followed by avalanche mixing. */
export function deriveSeed(rootSeed: number, streamName: string): number {
  let hash = (0x811c9dc5 ^ (rootSeed >>> 0)) >>> 0;
  for (const byte of new TextEncoder().encode(streamName)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash === 0 ? 0x6d2b79f5 : hash >>> 0;
}
