/**
 * MMDB Tree Walker
 * Matches the original mmdb-lib walker implementation exactly
 */

import { toUint8Array, DataType } from "undio";
import { bitAt } from "./utils";
import { MMDBMetadata } from "./types";

type NodeReader = (offset: number) => number;

export interface Walker {
  left: NodeReader;
  right: NodeReader;
}

/**
 * Create optimized node readers for different record sizes
 */
const createNodeReaders = (data: Uint8Array, recordSize: number): Walker => {
  switch (recordSize) {
    case 24:
      return {
        left: (offset: number): number => {
          // Read 3 bytes big-endian from offset
          return (
            (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
          );
        },
        right: (offset: number): number => {
          // Read 3 bytes big-endian from offset + 3
          return (
            (data[offset + 3] << 16) |
            (data[offset + 4] << 8) |
            data[offset + 5]
          );
        },
      };

    case 28:
      return {
        left: (offset: number): number => {
          // Left record: bytes 0-2 + 4 bits of byte 3
          return (
            ((data[offset + 3] & 0xf0) << 20) |
            (data[offset] << 16) |
            (data[offset + 1] << 8) |
            data[offset + 2]
          );
        },
        right: (offset: number): number => {
          // Right record: 4 bits of byte 3 + bytes 4-6
          return (
            ((data[offset + 3] & 0x0f) << 24) |
            (data[offset + 4] << 16) |
            (data[offset + 5] << 8) |
            data[offset + 6]
          );
        },
      };

    case 32:
      return {
        left: (offset: number): number => {
          // Read 4 bytes big-endian from offset
          return (
            (data[offset] << 24) |
            (data[offset + 1] << 16) |
            (data[offset + 2] << 8) |
            data[offset + 3]
          );
        },
        right: (offset: number): number => {
          // Read 4 bytes big-endian from offset + 4
          return (
            (data[offset + 4] << 24) |
            (data[offset + 5] << 16) |
            (data[offset + 6] << 8) |
            data[offset + 7]
          );
        },
      };

    default:
      throw new Error(`Unsupported record size: ${recordSize}`);
  }
};

/**
 * Tree walker for MMDB binary search tree
 */
export class MMDBWalker {
  private data: Uint8Array;
  private metadata: MMDBMetadata;
  private walker: Walker;
  private ipv4StartNodeNumber: number;

  constructor(data: DataType, metadata: MMDBMetadata) {
    this.data = toUint8Array(data);
    this.metadata = metadata;
    this.walker = createNodeReaders(this.data, metadata.recordSize);
    this.ipv4StartNodeNumber = this.calculateIpv4StartNode();
  }

  /**
   * Walk the tree to find data for an IP address
   * Returns [dataPointer, prefixLength] or null if not found
   */
  walk(ipBytes: number[]): [number | null, number] {
    const nodeCount = this.metadata.nodeCount;
    const bitLength = ipBytes.length * 8;

    let nodeNumber = 0;
    let depth = 0;

    // For IPv4 addresses in IPv6 database, start at IPv4 start node
    if (ipBytes.length === 4) {
      nodeNumber = this.ipv4StartNodeNumber;
    }

    // Walk through the binary search tree
    for (; depth < bitLength && nodeNumber < nodeCount; depth++) {
      const bit = bitAt(ipBytes, depth);
      const offset = nodeNumber * this.metadata.nodeByteSize;

      nodeNumber = bit ? this.walker.right(offset) : this.walker.left(offset);
    }

    // If nodeNumber > nodeCount, it's a data pointer
    if (nodeNumber > nodeCount) {
      return [nodeNumber, depth];
    }

    // IP address not found in database
    return [null, depth];
  }

  /**
   * Calculate the start node for IPv4 addresses in an IPv6 database
   */
  private calculateIpv4StartNode(): number {
    if (this.metadata.ipVersion === 4) {
      return 0;
    }

    const nodeCount = this.metadata.nodeCount;
    let pointer = 0;

    // Navigate the tree to find where IPv4 addresses start
    for (let i = 0; i < 96 && pointer < nodeCount; i++) {
      const offset = pointer * this.metadata.nodeByteSize;
      pointer = this.walker.left(offset);
    }

    return pointer;
  }

  /**
   * Check if a record points to data or another node
   */
  static isDataPointer(record: number, nodeCount: number): boolean {
    return record > nodeCount;
  }

  /**
   * Get data offset from record pointer
   */
  static getDataOffset(
    record: number,
    nodeCount: number,
    searchTreeSize: number,
  ): number {
    return record - nodeCount + searchTreeSize;
  }
}
