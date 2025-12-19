/**
 * IPX - A powerful and efficient IP address manipulation library
 */

/**
 * Convert IPv4 address to 32-bit number
 */
export function ipv4ToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((int, oct) => (int << 8) + Number.parseInt(oct, 10), 0) >>> 0
  );
}

/**
 * Convert IPv6 address to BigInt
 */
export function ipv6ToBigInt(ip: string): bigint {
  // Handle compressed IPv6 addresses with ::
  if (ip.includes("::")) {
    const parts = ip.split(":");
    const compressedIndex = parts.indexOf("");

    // Count how many empty parts after compression
    let emptyCount = 0;
    for (let i = compressedIndex; i < parts.length; i++) {
      if (parts[i] === "") emptyCount++;
    }

    // Calculate how many zeros to insert
    const missingZeros = 8 - (parts.length - emptyCount) + 1;

    const expandedParts: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") {
        if (i === 0 || i === parts.length - 1) {
          continue; // Skip empty at start/end (leading/trailing ::)
        }
        // Insert missing zeros
        for (let j = 0; j < missingZeros; j++) {
          expandedParts.push("0");
        }
      } else {
        expandedParts.push(parts[i]);
      }
    }

    ip = expandedParts.join(":");
  }

  return ip.split(":").reduce((int, hex) => {
    return (int << 16n) + BigInt(Number.parseInt(hex || "0", 16));
  }, 0n);
}

/**
 * Check if string is valid IPv4 address
 */
export function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      const num = Number.parseInt(part, 10);
      return num >= 0 && num <= 255 && part === num.toString();
    })
  );
}

/**
 * Check if string is valid IPv6 address
 */
export function isIPv6(ip: string): boolean {
  // Handle compressed notation
  if (ip.includes("::")) {
    const parts = ip.split(":");

    // Count non-empty parts
    const nonEmptyParts = parts.filter((part) => part !== "");
    if (nonEmptyParts.length > 8) return false;

    // Validate non-empty parts
    return nonEmptyParts.every((part) => {
      return /^[0-9A-Fa-f]{1,4}$/.test(part);
    });
  }

  const parts = ip.split(":");
  return (
    parts.length === 8 &&
    parts.every((part) => {
      return /^[0-9A-Fa-f]{1,4}$/.test(part);
    })
  );
}

/**
 * Convert number to IPv4 address
 */
export function intToIPv4(int: number): string {
  const octets = [];
  let num = int;
  for (let i = 3; i >= 0; i--) {
    octets[i] = (num & 255).toString();
    num = num >>> 8;
  }
  return octets.join(".");
}

/**
 * Convert BigInt to IPv6 address
 */
export function bigIntToIPv6(int: bigint): string {
  const hex = int.toString(16).padStart(32, "0");
  const parts = [];
  for (let i = 0; i < 8; i++) {
    parts.push(hex.slice(i * 4, (i + 1) * 4));
  }
  return parts.join(":");
}

/**
 * Convert IPv4 address to ArrayBuffer (4 bytes)
 */
export function ipv4ToBuffer(ip: string): ArrayBuffer {
  if (!isIPv4(ip)) {
    throw new Error("Invalid IPv4 address");
  }

  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  const ipInt = ipv4ToInt(ip);

  view.setUint8(0, (ipInt >> 24) & 0xff);
  view.setUint8(1, (ipInt >> 16) & 0xff);
  view.setUint8(2, (ipInt >> 8) & 0xff);
  view.setUint8(3, ipInt & 0xff);

  return buffer;
}

/**
 * Convert IPv6 address to ArrayBuffer (16 bytes)
 */
export function ipv6ToBuffer(ip: string): ArrayBuffer {
  if (!isIPv6(ip)) {
    throw new Error("Invalid IPv6 address");
  }

  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  const bigIntValue = ipv6ToBigInt(ip);

  // Convert BigInt to 16-byte array
  for (let i = 0; i < 8; i++) {
    const value = Number((bigIntValue >> BigInt((7 - i) * 16)) & 0xffffn);
    view.setUint16(i * 2, value, false); // big-endian
  }

  return buffer;
}

/**
 * Convert ArrayBuffer to IPv4 address (4 bytes)
 */
export function bufferToIPv4(buffer: ArrayBuffer): string {
  if (buffer.byteLength !== 4) {
    throw new Error("ArrayBuffer must be 4 bytes for IPv4");
  }

  const view = new DataView(buffer);
  const ipInt =
    (view.getUint8(0) << 24) |
    (view.getUint8(1) << 16) |
    (view.getUint8(2) << 8) |
    view.getUint8(3);

  return intToIPv4(ipInt);
}

/**
 * Convert ArrayBuffer to IPv6 address (16 bytes)
 */
export function bufferToIPv6(buffer: ArrayBuffer): string {
  if (buffer.byteLength !== 16) {
    throw new Error("ArrayBuffer must be 16 bytes for IPv6");
  }

  const view = new DataView(buffer);
  let bigIntValue = 0n;

  // Convert 16-byte array to BigInt
  for (let i = 0; i < 8; i++) {
    const value = view.getUint16(i * 2, false); // big-endian
    bigIntValue = (bigIntValue << 16n) + BigInt(value);
  }

  return bigIntToIPv6(bigIntValue);
}

/**
 * Check if a string is a valid IP address (IPv4 or IPv6)
 */
export function isValidIP(ip: string): boolean {
  return isIPv4(ip) || isIPv6(ip);
}

/**
 * Check if IPv4 address is private
 */
export function isPrivateIPv4(ip: string | number): boolean {
  const value = typeof ip === "string" ? ipv4ToInt(ip) : ip;
  return (
    (value >= ipv4ToInt("10.0.0.0") && value <= ipv4ToInt("10.255.255.255")) ||
    (value >= ipv4ToInt("172.16.0.0") &&
      value <= ipv4ToInt("172.31.255.255")) ||
    (value >= ipv4ToInt("192.168.0.0") && value <= ipv4ToInt("192.168.255.255"))
  );
}

/**
 * Check if IPv4 address is loopback
 */
export function isLoopbackIPv4(ip: string | number): boolean {
  const value = typeof ip === "string" ? ipv4ToInt(ip) : ip;
  return (
    value >= ipv4ToInt("127.0.0.0") && value <= ipv4ToInt("127.255.255.255")
  );
}

/**
 * Check if IPv4 address is multicast
 */
export function isMulticastIPv4(ip: string | number): boolean {
  const value = typeof ip === "string" ? ipv4ToInt(ip) : ip;
  return (
    value >= ipv4ToInt("224.0.0.0") && value <= ipv4ToInt("239.255.255.255")
  );
}

/**
 * Check if IPv6 address is private
 */
export function isPrivateIPv6(ip: string | bigint): boolean {
  const value = typeof ip === "string" ? ipv6ToBigInt(ip) : ip;
  return (
    value >= ipv6ToBigInt("fc00::") &&
    value <= ipv6ToBigInt("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")
  );
}

/**
 * Check if IPv6 address is loopback
 */
export function isLoopbackIPv6(ip: string | bigint): boolean {
  const value = typeof ip === "string" ? ipv6ToBigInt(ip) : ip;
  return value === ipv6ToBigInt("::1");
}

/**
 * Check if IPv6 address is multicast
 */
export function isMulticastIPv6(ip: string | bigint): boolean {
  const value = typeof ip === "string" ? ipv6ToBigInt(ip) : ip;
  return (
    value >= ipv6ToBigInt("ff00::") &&
    value <= ipv6ToBigInt("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")
  );
}

/**
 * Get next IPv4 address
 */
export function nextIPv4(ip: string | number): string {
  const value = typeof ip === "string" ? ipv4ToInt(ip) : ip;
  return intToIPv4((value + 1) >>> 0);
}

/**
 * Get previous IPv4 address
 */
export function prevIPv4(ip: string | number): string {
  const value = typeof ip === "string" ? ipv4ToInt(ip) : ip;
  return intToIPv4((value - 1) >>> 0);
}

/**
 * Get next IPv6 address
 */
export function nextIPv6(ip: string | bigint): string {
  const value = typeof ip === "string" ? ipv6ToBigInt(ip) : ip;
  return bigIntToIPv6(value + 1n);
}

/**
 * Get previous IPv6 address
 */
export function prevIPv6(ip: string | bigint): string {
  const value = typeof ip === "string" ? ipv6ToBigInt(ip) : ip;
  return bigIntToIPv6(value - 1n);
}

/**
 * Convert IP address to binary string
 */
export function toBinary(ip: string): string {
  if (isIPv4(ip)) {
    return ipv4ToInt(ip).toString(2).padStart(32, "0");
  }
  if (isIPv6(ip)) {
    return ipv6ToBigInt(ip).toString(2).padStart(128, "0");
  }
  throw new Error("Invalid IP address");
}

/**
 * Convert IP address to numeric value
 */
export function toNumber(ip: string): number | bigint {
  if (isIPv4(ip)) {
    return ipv4ToInt(ip);
  }
  if (isIPv6(ip)) {
    return ipv6ToBigInt(ip);
  }
  throw new Error("Invalid IP address");
}

/**
 * Parse CIDR notation to range information
 */
export function parseCIDR(cidr: string): {
  start: number | bigint;
  end: number | bigint;
  prefix: number;
  version: 4 | 6;
} {
  const [ip, prefixStr] = cidr.split("/");

  // Determine IP version
  let version: 4 | 6;
  if (isIPv4(ip)) {
    version = 4;
  } else if (isIPv6(ip)) {
    version = 6;
  } else {
    throw new Error("Invalid IP address in CIDR");
  }

  // Parse prefix length
  const prefix = Number.parseInt(prefixStr, 10);
  if (version === 4 && (prefix < 0 || prefix > 32)) {
    throw new Error("Invalid IPv4 prefix length");
  }
  if (version === 6 && (prefix < 0 || prefix > 128)) {
    throw new Error("Invalid IPv6 prefix length");
  }

  // Calculate start and end addresses
  if (version === 4) {
    const ipInt = ipv4ToInt(ip);
    const mask = ~((1 << (32 - prefix)) - 1) >>> 0;
    const start = ipInt & mask;
    const end = start + ((1 << (32 - prefix)) - 1);
    return { start, end, prefix, version };
  } else {
    const ipBigInt = ipv6ToBigInt(ip);
    const mask = ~((1n << BigInt(128 - prefix)) - 1n);
    const start = ipBigInt & mask;
    const end = start + ((1n << BigInt(128 - prefix)) - 1n);
    return { start, end, prefix, version };
  }
}

/**
 * Check if IP address is in CIDR range
 */
export function ipInRange(cidr: string, ip: string): boolean {
  try {
    const range = parseCIDR(cidr);
    if (range.version === 4 && !isIPv4(ip)) return false;
    if (range.version === 6 && !isIPv6(ip)) return false;

    if (range.version === 4) {
      const ipInt = ipv4ToInt(ip);
      return ipInt >= (range.start as number) && ipInt <= (range.end as number);
    } else {
      const ipBigInt = ipv6ToBigInt(ip);
      return (
        ipBigInt >= (range.start as bigint) && ipBigInt <= (range.end as bigint)
      );
    }
  } catch {
    return false;
  }
}

/**
 * Get first IP address in CIDR range
 */
export function firstIPInRange(cidr: string): string {
  const range = parseCIDR(cidr);
  if (range.version === 4) {
    return intToIPv4(range.start as number);
  }
  return bigIntToIPv6(range.start as bigint);
}

/**
 * Get last IP address in CIDR range
 */
export function lastIPInRange(cidr: string): string {
  const range = parseCIDR(cidr);
  if (range.version === 4) {
    return intToIPv4(range.end as number);
  }
  return bigIntToIPv6(range.end as bigint);
}

/**
 * Get network mask for CIDR
 */
export function maskForCIDR(cidr: string): string {
  const range = parseCIDR(cidr);
  if (range.version === 4) {
    const mask = ~((1 << (32 - range.prefix)) - 1) >>> 0;
    return intToIPv4(mask);
  }
  const mask = ~((1n << BigInt(128 - range.prefix)) - 1n);
  return bigIntToIPv6(mask);
}

/**
 * Get total number of addresses in CIDR range
 */
export function rangeSize(cidr: string): number | bigint {
  const range = parseCIDR(cidr);
  if (range.version === 4) {
    return (range.end as number) - (range.start as number) + 1;
  }
  return (range.end as bigint) - (range.start as bigint) + 1n;
}

/**
 * Parse IPv4 address to byte array directly
 * More efficient than going through ArrayBuffer
 */
export function ipv4ToBytes(ip: string): number[] {
  if (!isIPv4(ip)) {
    throw new Error("Invalid IPv4 address");
  }

  const parts = ip.split(".");
  return parts.map((part) => Number.parseInt(part, 10));
}

/**
 * Parse IPv6 address to byte array directly
 * More efficient than going through ArrayBuffer
 */
export function ipv6ToBytes(ip: string): number[] {
  if (!isIPv6(ip)) {
    throw new Error("Invalid IPv6 address");
  }

  // Handle compressed IPv6 addresses with ::
  if (ip.includes("::")) {
    const parts = ip.split(":");
    const compressedIndex = parts.indexOf("");

    // Count how many empty parts after compression
    let emptyCount = 0;
    for (let i = compressedIndex; i < parts.length; i++) {
      if (parts[i] === "") emptyCount++;
    }

    // Calculate how many zeros to insert
    const missingZeros = 8 - (parts.length - emptyCount) + 1;

    const expandedParts: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") {
        if (i === 0 || i === parts.length - 1) {
          continue; // Skip empty at start/end (leading/trailing ::)
        }
        // Insert missing zeros
        for (let j = 0; j < missingZeros; j++) {
          expandedParts.push("0");
        }
      } else {
        expandedParts.push(parts[i]);
      }
    }

    ip = expandedParts.join(":");
  }

  const parts = ip.split(":");
  const bytes: number[] = [];

  for (const part of parts) {
    const value = Number.parseInt(part || "0", 16);
    bytes.push((value >> 8) & 0xff);
    bytes.push(value & 0xff);
  }

  return bytes;
}

/**
 * Parse IP address to byte array (unified function)
 * Chooses the most efficient method based on IP version
 */
export function ipToBytes(ip: string): number[] {
  if (isIPv4(ip)) {
    return ipv4ToBytes(ip);
  }
  if (isIPv6(ip)) {
    return ipv6ToBytes(ip);
  }
  throw new Error("Invalid IP address");
}

/**
 * Get IP version (4 for IPv4, 6 for IPv6)
 */
export function getIPVersion(ip: string): 4 | 6 | null {
  if (isIPv4(ip)) return 4;
  if (isIPv6(ip)) return 6;
  return null;
}

/**
 * Check if two CIDR ranges overlap
 */
export function rangesOverlap(cidr1: string, cidr2: string): boolean {
  const range1 = parseCIDR(cidr1);
  const range2 = parseCIDR(cidr2);

  if (range1.version !== range2.version) {
    return false;
  }

  if (range1.version === 4) {
    return (
      (range1.start as number) <= (range2.end as number) &&
      (range1.end as number) >= (range2.start as number)
    );
  }

  return (
    (range1.start as bigint) <= (range2.end as bigint) &&
    (range1.end as bigint) >= (range2.start as bigint)
  );
}
