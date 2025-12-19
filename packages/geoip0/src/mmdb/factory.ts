/**
 * MMDB Factory Functions
 * Universal MMDB parser creation using undio data type support
 */

import { MMDBParser } from "./parser";
import type { MMDBOptions } from "./types";
import { toUint8Array, DataType } from "undio";

/**
 * Create MMDB parser from any supported undio DataType
 */
export function createMMDBParser(
  data: DataType, // Accept any type that undio can convert
  options?: MMDBOptions,
): MMDBParser {
  // Convert any supported data type to Uint8Array using undio
  const uint8Array = toUint8Array(data);

  const parser = new MMDBParser(options);
  parser.load(uint8Array);
  return parser;
}
