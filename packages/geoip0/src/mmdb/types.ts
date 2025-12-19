/**
 * MMDB Parser Types
 * Universal type definitions for MaxMind database parsing
 */

// MMDB record types (matches original mmdb-lib)
export enum MMDBRecordType {
  Extended = 0,
  Pointer = 1,
  Utf8String = 2,
  Double = 3,
  Bytes = 4,
  Uint16 = 5,
  Uint32 = 6,
  Map = 7,
  Int32 = 8,
  Uint64 = 9,
  Uint128 = 10,
  Array = 11,
  Container = 12,
  EndMarker = 13,
  Boolean = 14,
  Float = 15,
}

// Database metadata interface
export interface MMDBMetadata {
  binaryFormatMajorVersion: number;
  binaryFormatMinorVersion: number;
  buildEpoch: number;
  databaseType: string;
  languages: string[];
  description: Record<string, string>;
  ipVersion: number;
  nodeCount: number;
  recordSize: number;
  nodeByteSize: number;
  searchTreeSize: number;
  treeDepth: number;
}

// Parser options
export interface MMDBOptions {
  /** Cache size for decoded results */
  cacheSize?: number;
  /** Enable/disable caching */
  enableCache?: boolean;
}

// Generic MMDB response type
export type MMDBData = Record<string, any>;

// Parse result with prefix length
export interface ParseResult<T = MMDBData> {
  data: T | null;
  prefixLength: number;
}
