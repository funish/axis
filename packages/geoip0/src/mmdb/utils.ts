/**
 * MMDB Parser Utils
 * Utility functions for MMDB parsing that work in both browser and Node.js environments
 */

/**
 * Get bit at position in IP address bytes (optimized version)
 * Matches original mmdb-lib implementation exactly
 * This is MMDB-specific and not available in ipdo
 */
export const bitAt = (rawAddress: number[], idx: number): number => {
  // 8 bits per octet in the buffer (>>3 is slightly faster than Math.floor(idx/8))
  const bufIdx = idx >> 3;

  // Offset within the octet (basically equivalent to 7 - (idx % 8))
  const bitIdx = 7 ^ (idx & 7);

  // Shift the offset rightwards by bitIdx bits and & it to grab the bit
  return (rawAddress[bufIdx] >>> bitIdx) & 1;
};

/**
 * Simple LRU cache implementation
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  public readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
