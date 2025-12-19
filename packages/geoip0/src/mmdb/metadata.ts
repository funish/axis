/**
 * MMDB Metadata Parser
 * Parses MaxMind database metadata section
 */

import type { MMDBMetadata } from "./types";
import { toUint8Array, DataType } from "undio";
import { MMDBDecoder } from "./decoder";

/**
 * MMDB metadata parser
 */
export class MMDBMetadataParser {
  /**
   * Parse metadata from MMDB data
   */
  static parse(data: DataType): MMDBMetadata {
    const uint8Array = toUint8Array(data);
    const metadataOffset = this.findMetadataStart(uint8Array);

    // Use decoder to parse metadata structure
    // Match original library exactly: use metadata offset as base offset
    const decoder = new MMDBDecoder(uint8Array, metadataOffset);
    const result = decoder.decode(metadataOffset);

    if (!result || !result.value) {
      throw new Error("Cannot parse binary database metadata");
    }

    // Convert and validate metadata
    return this.convertToMetadata(result.value);
  }

  /**
   * Find metadata start marker in the data
   */
  private static findMetadataStart(data: Uint8Array): number {
    const METADATA_START_MARKER = new Uint8Array([
      0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63,
      0x6f, 0x6d,
    ]);

    // Simple linear search from end (same as debug script)
    for (let i = data.length - METADATA_START_MARKER.length; i >= 0; i--) {
      let match = true;
      for (let j = 0; j < METADATA_START_MARKER.length; j++) {
        if (data[i + j] !== METADATA_START_MARKER[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        // Return offset after the marker (where actual metadata starts)
        return i + METADATA_START_MARKER.length;
      }
    }

    throw new Error("Could not find metadata start marker");
  }

  /**
   * Convert raw metadata to structured format
   */
  private static convertToMetadata(metadata: any): MMDBMetadata {
    // Validate required fields
    if (!metadata || typeof metadata !== "object") {
      throw new Error("Invalid metadata structure");
    }

    return {
      binaryFormatMajorVersion: Number(
        metadata.binary_format_major_version || 0,
      ),
      binaryFormatMinorVersion: Number(
        metadata.binary_format_minor_version || 0,
      ),
      buildEpoch: Number(metadata.build_epoch || 0),
      databaseType: String(metadata.database_type || ""),
      languages: Array.isArray(metadata.languages) ? metadata.languages : [],
      description: metadata.description || {},
      ipVersion: Number(metadata.ip_version || 0),
      nodeCount: Number(metadata.node_count || 0),
      recordSize: Number(metadata.record_size || 0),
      nodeByteSize: Math.floor((Number(metadata.record_size || 0) * 2) / 8),
      searchTreeSize:
        Number(metadata.node_count || 0) *
        Math.floor((Number(metadata.record_size || 0) * 2) / 8),
      treeDepth: this.calculateTreeDepth(Number(metadata.node_count || 0)),
    };
  }

  /**
   * Calculate approximate tree depth based on node count
   */
  private static calculateTreeDepth(nodeCount: number): number {
    if (nodeCount === 0) return 0;
    return Math.ceil(Math.log2(nodeCount));
  }

  /**
   * Validate metadata
   */
  static validate(metadata: MMDBMetadata): boolean {
    return !!(
      metadata.databaseType &&
      metadata.ipVersion &&
      metadata.nodeCount &&
      metadata.recordSize &&
      metadata.binaryFormatMajorVersion
    );
  }
}
