/**
 * Universal MMDB Parser
 * Cross-platform MaxMind database parser for browser and Node.js
 */

import { ipToBytes, isValidIP } from "ipdo";
import { toUint8Array, DataType } from "undio";

import { MMDBDecoder } from "./decoder";
import { MMDBMetadataParser } from "./metadata";
import type { MMDBOptions, MMDBMetadata, ParseResult, MMDBData } from "./types";
import { LRUCache } from "./utils";
import { MMDBWalker } from "./walker";

/**
 * Universal MMDB parser that works in both browser and Node.js environments
 */
export class MMDBParser {
  private data: Uint8Array;
  private metadata: MMDBMetadata | null = null;
  private walker: MMDBWalker | null = null;
  private decoder: MMDBDecoder | null = null;
  private cache: LRUCache<string, ParseResult> | null = null;
  private options: MMDBOptions;

  /**
   * Create new MMDB parser instance
   */
  constructor(options: MMDBOptions = {}) {
    this.data = new Uint8Array(0); // Initialize with empty array
    this.options = {
      cacheSize: 1000,
      enableCache: true,
      ...options,
    };

    if (this.options.enableCache && this.options.cacheSize && this.options.cacheSize > 0) {
      this.cache = new LRUCache(this.options.cacheSize);
    }
  }

  /**
   * Load MMDB data from various sources
   */
  load(data: DataType): void {
    this.data = toUint8Array(data);

    // Parse metadata
    this.metadata = MMDBMetadataParser.parse(this.data);

    if (!this.metadata || !MMDBMetadataParser.validate(this.metadata)) {
      throw new Error("Invalid MMDB metadata");
    }

    // Initialize components
    const DATA_SECTION_SEPARATOR_SIZE = 16;
    const dataSectionOffset = this.metadata.searchTreeSize + DATA_SECTION_SEPARATOR_SIZE;
    this.walker = new MMDBWalker(this.data, this.metadata);
    this.decoder = new MMDBDecoder(this.data, dataSectionOffset);
  }

  /**
   * Get metadata information
   */
  getMetadata(): MMDBMetadata | null {
    return this.metadata;
  }

  /**
   * Get database type
   */
  getDatabaseType(): string | null {
    return this.metadata?.databaseType || null;
  }

  /**
   * Get supported languages
   */
  getLanguages(): string[] {
    return this.metadata?.languages || [];
  }

  /**
   * Look up IP address with prefix length
   */
  getWithPrefixLength<T = MMDBData>(ip: string): ParseResult<T> {
    if (!this.isValid()) {
      return { data: null, prefixLength: 0 };
    }

    // Check cache first
    const cacheKey = ip;
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as ParseResult<T>;
      }
    }

    try {
      // Parse IP address to number array using optimized ipdo function
      let ipBytes: number[] | null = null;
      if (isValidIP(ip)) {
        try {
          ipBytes = ipToBytes(ip);
        } catch {
          ipBytes = null;
        }
      }

      if (!ipBytes) {
        return { data: null, prefixLength: 0 };
      }

      // Walk the tree
      const [record, prefixLength] = this.walker!.walk(ipBytes);

      if (!record || !MMDBWalker.isDataPointer(record, this.metadata!.nodeCount)) {
        const missing: ParseResult<T> = { data: null, prefixLength };
        if (this.cache) {
          this.cache.set(cacheKey, missing as ParseResult<MMDBData>);
        }
        return missing;
      }

      // Resolve data pointer to actual data offset (same as original mmdb-lib)
      const dataOffset = record - this.metadata!.nodeCount + this.metadata!.searchTreeSize;
      // Note: pointerBase is an internal property of decoder

      // Use absolute offset directly (same as original mmdb-lib)
      const data = this.decodeData(dataOffset);

      const parseResult: ParseResult<T> = {
        data: data as T | null,
        prefixLength,
      };

      // Cache the result, including prefix length
      if (this.cache) {
        this.cache.set(cacheKey, parseResult as ParseResult<MMDBData>);
      }

      return parseResult;
    } catch (error) {
      console.error("Error looking up IP:", error);
      return { data: null, prefixLength: 0 };
    }
  }

  /**
   * Look up IP address
   */
  get<T = MMDBData>(ip: string): T | null {
    const result = this.getWithPrefixLength<T>(ip);
    return result.data;
  }

  /**
   * Look up IP address with specific language
   */
  getWithLanguage<T = MMDBData>(ip: string, language: string): T | null {
    const data = this.get(ip);
    if (!data) {
      return null;
    }

    // Extract data for specific language if available
    return this.extractLanguageData(data, language) as T;
  }

  /**
   * Extract data for specific language
   */
  private extractLanguageData(data: MMDBData, language: string): MMDBData {
    if (!data || typeof data !== "object") {
      return data;
    }

    const result: MMDBData = {};

    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "names" in value) {
        const names = (value as { names: Record<string, string> }).names;
        result[key] = {
          ...value,
          name: names[language] || names.en || Object.values(names)[0],
        };
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Decode data from offset
   */
  private decodeData(offset: number): MMDBData | null {
    const result = this.decoder!.decodeFast(offset);
    return result.value;
  }

  /**
   * Check if parser is valid and ready
   */
  isValid(): boolean {
    return !!(this.data && this.metadata && this.walker && this.decoder);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } | null {
    if (!this.cache) {
      return null;
    }

    return {
      size: this.cache.size,
      maxSize: this.cache.maxSize,
    };
  }
}
