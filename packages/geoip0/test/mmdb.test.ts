import { describe, expect, test } from "vite-plus/test";

import { createMMDBParser, MMDBDecoder } from "../src/mmdb";

function pushString(bytes: number[], value: string): void {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length >= 29) {
    throw new Error("Fixture strings must be short");
  }
  bytes.push((2 << 5) | encoded.length, ...encoded);
}

function pushUint16(bytes: number[], value: number): void {
  if (value < 256) {
    bytes.push((5 << 5) | 1, value);
    return;
  }
  bytes.push((5 << 5) | 2, value >> 8, value & 0xff);
}

function pushMetadata(bytes: number[]): void {
  const metadata: number[] = [];
  metadata.push((7 << 5) | 5); // map with five entries
  pushString(metadata, "database_type");
  pushString(metadata, "Test MMDB");
  pushString(metadata, "ip_version");
  pushUint16(metadata, 4);
  pushString(metadata, "node_count");
  pushUint16(metadata, 1);
  pushString(metadata, "record_size");
  pushUint16(metadata, 24);
  pushString(metadata, "binary_format_major_version");
  pushUint16(metadata, 2);

  bytes.push(0xab, 0xcd, 0xef, ...new TextEncoder().encode("MaxMind.com"), ...metadata);
}

/**
 * Build a minimal valid IPv4 MMDB containing one /1 record:
 * 128.0.0.0/1 -> { label: "cached", asn: 64512 }.
 */
function createFixtureMMDB(): Uint8Array {
  const bytes: number[] = [];

  // One 24-bit node: left is node 0, right is the data pointer node_count + 16.
  bytes.push(0, 0, 0, 0, 0, 17);
  bytes.push(...Array.from({ length: 16 }, () => 0));

  const data: number[] = [];
  data.push((7 << 5) | 2); // map with two entries
  pushString(data, "label");
  pushString(data, "cached");
  pushString(data, "asn");
  data.push((6 << 5) | 2, 252, 0); // uint32 64512

  const dataStart = bytes.length;
  expect(dataStart).toBe(22);
  bytes.push(...data);
  pushMetadata(bytes);

  return new Uint8Array(bytes);
}

describe("MMDB parser", () => {
  test("preserves prefix length for both found and missing cached lookups", () => {
    const parser = createMMDBParser(createFixtureMMDB());

    const found = parser.getWithPrefixLength("128.0.0.1");
    expect(found).toEqual({ data: { label: "cached", asn: 64512 }, prefixLength: 1 });

    const cachedFound = parser.getWithPrefixLength("128.0.0.1");
    expect(cachedFound).toEqual(found);
    expect(parser.getCacheStats()).toMatchObject({ size: 1, maxSize: 1000 });

    const missing = parser.getWithPrefixLength("0.0.0.0");
    expect(missing).toEqual({ data: null, prefixLength: 32 });

    const cachedMissing = parser.getWithPrefixLength("0.0.0.0");
    expect(cachedMissing).toEqual(missing);
    expect(parser.getCacheStats()).toMatchObject({ size: 2 });
    expect(parser.getMetadata()?.treeDepth).toBe(32);
  });

  test("rejects truncated values instead of reading past the database", () => {
    const decoder = new MMDBDecoder(new Uint8Array([0x45, 0x61]));
    expect(() => decoder.decode(0)).toThrow("Truncated or out-of-bounds MMDB string");
    const scalar = new MMDBDecoder(new Uint8Array([0xc1]));
    expect(() => scalar.decode(0)).toThrow("Truncated or out-of-bounds MMDB unsigned integer");
  });
});
