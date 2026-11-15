/**
 * IPX - A powerful and efficient IP address manipulation library
 */

export interface IPv4CIDRRange {
  start: number;
  end: number;
  prefix: number;
  version: 4;
}

export interface IPv6CIDRRange {
  start: bigint;
  end: bigint;
  prefix: number;
  version: 6;
}

export type CIDRRange = IPv4CIDRRange | IPv6CIDRRange;

const IPV4_PATTERN =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_GROUP_PATTERN = /^[0-9A-Fa-f]{1,4}$/;
const CIDR_PREFIX_PATTERN = /^(?:0|[1-9]\d*)$/;
const IPV4_MAX = 0xffffffff;
const IPV6_MAX = (1n << 128n) - 1n;

function parseIPv4Address(ip: string): number {
  if (typeof ip !== "string") {
    throw new TypeError("Invalid IPv4 address");
  }

  if (!IPV4_PATTERN.test(ip)) {
    throw new Error("Invalid IPv4 address");
  }

  return ip.split(".").reduce((value, octet) => (value << 8) | Number.parseInt(octet, 10), 0) >>> 0;
}

/**
 * Expand an IPv6 address to eight 16-bit groups.
 *
 * RFC 4291 permits IPv4 dotted-decimal text in the last 32 bits. Such text is
 * replaced here first so that every address goes through the same `::`
 * compression implementation.
 */
function expandIPv6Groups(ip: string): string[] {
  if (typeof ip !== "string" || ip === "") {
    throw new Error("Invalid IPv6 address");
  }

  let text = ip;

  if (text.includes(".")) {
    const separator = text.lastIndexOf(":");
    if (separator === -1) {
      throw new Error("Invalid IPv6 address");
    }

    const ipv4 = parseIPv4Address(text.slice(separator + 1));
    text = `${text.slice(0, separator)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const pieces = text.split("::");
  if (pieces.length > 2) {
    throw new Error("Invalid IPv6 compression");
  }

  let groups: string[];
  if (pieces.length === 2) {
    const [left, right] = pieces;
    const leftGroups = left === "" ? [] : left.split(":");
    const rightGroups = right === "" ? [] : right.split(":");
    const explicitGroups = leftGroups.length + rightGroups.length;

    if (
      leftGroups.some((group) => group === "") ||
      rightGroups.some((group) => group === "") ||
      explicitGroups > 7
    ) {
      throw new Error("Invalid IPv6 compression");
    }

    groups = [
      ...leftGroups,
      ...Array.from({ length: 8 - explicitGroups }, () => "0"),
      ...rightGroups,
    ];
  } else {
    groups = text.split(":");
  }

  if (groups.length !== 8 || !groups.every((group) => IPV6_GROUP_PATTERN.test(group))) {
    throw new Error("Invalid IPv6 address");
  }

  return groups;
}

function assertIPv4Integer(value: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError("Invalid IPv4 integer");
  }
  if (value < 0 || value > IPV4_MAX) {
    throw new RangeError("IPv4 integer is out of range");
  }
  return value;
}

function assertIPv6Integer(value: bigint): bigint {
  if (typeof value !== "bigint") {
    throw new TypeError("Invalid IPv6 integer");
  }
  if (value < 0n || value > IPV6_MAX) {
    throw new RangeError("IPv6 integer is out of range");
  }
  return value;
}

/**
 * Convert IPv4 address to 32-bit number
 */
export function ipv4ToInt(ip: string): number {
  return parseIPv4Address(ip);
}

/**
 * Convert IPv6 address to BigInt
 */
export function ipv6ToBigInt(ip: string): bigint {
  return expandIPv6Groups(ip).reduce(
    (value, group) => (value << 16n) | BigInt(Number.parseInt(group, 16)),
    0n,
  );
}

/**
 * Check if string is valid IPv4 address
 */
export function isIPv4(ip: string): boolean {
  if (typeof ip !== "string") {
    return false;
  }
  return IPV4_PATTERN.test(ip);
}

/**
 * Check if string is valid IPv6 address
 */
export function isIPv6(ip: string): boolean {
  if (typeof ip !== "string") {
    return false;
  }

  try {
    expandIPv6Groups(ip);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert number to IPv4 address
 */
export function intToIPv4(int: number): string {
  const value = assertIPv4Integer(int);
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(
    ".",
  );
}

/**
 * Convert BigInt to IPv6 address
 */
export function bigIntToIPv6(int: bigint): string {
  const value = assertIPv6Integer(int);
  return value
    .toString(16)
    .padStart(32, "0")
    .replace(/(.{4})/g, "$1:")
    .slice(0, -1);
}

/**
 * Convert IPv4 address to ArrayBuffer (4 bytes)
 */
export function ipv4ToBuffer(ip: string): ArrayBuffer {
  if (typeof ip !== "string") {
    throw new TypeError("Invalid IPv4 address");
  }

  const value = parseIPv4Address(ip);
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint8(0, (value >>> 24) & 0xff);
  view.setUint8(1, (value >>> 16) & 0xff);
  view.setUint8(2, (value >>> 8) & 0xff);
  view.setUint8(3, value & 0xff);

  return buffer;
}

/**
 * Convert IPv6 address to ArrayBuffer (16 bytes)
 */
export function ipv6ToBuffer(ip: string): ArrayBuffer {
  if (typeof ip !== "string") {
    throw new TypeError("Invalid IPv6 address");
  }

  const value = ipv6ToBigInt(ip);
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);

  for (let index = 0; index < 8; index += 1) {
    view.setUint16(index * 2, Number((value >> BigInt((7 - index) * 16)) & 0xffffn), false);
  }

  return buffer;
}

/**
 * Convert ArrayBuffer to IPv4 address (4 bytes)
 */
export function bufferToIPv4(buffer: ArrayBuffer): string {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== 4) {
    throw new Error("ArrayBuffer must be 4 bytes for IPv4");
  }

  const view = new DataView(buffer);
  const value =
    ((view.getUint8(0) << 24) |
      (view.getUint8(1) << 16) |
      (view.getUint8(2) << 8) |
      view.getUint8(3)) >>>
    0;
  return intToIPv4(value);
}

/**
 * Convert ArrayBuffer to IPv6 address (16 bytes)
 */
export function bufferToIPv6(buffer: ArrayBuffer): string {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== 16) {
    throw new Error("ArrayBuffer must be 16 bytes for IPv6");
  }

  const view = new DataView(buffer);
  let value = 0n;

  for (let index = 0; index < 8; index += 1) {
    value = (value << 16n) | BigInt(view.getUint16(index * 2, false));
  }

  return bigIntToIPv6(value);
}

/**
 * Check if a string is a valid IP address (IPv4 or IPv6)
 */
export function isValidIP(ip: string): boolean {
  return isIPv4(ip) || isIPv6(ip);
}

function resolveIPv4Value(ip: string | number): number {
  if (typeof ip === "number") {
    return assertIPv4Integer(ip);
  }
  return parseIPv4Address(ip);
}

function resolveIPv6Value(ip: string | bigint): bigint {
  if (typeof ip === "bigint") {
    return assertIPv6Integer(ip);
  }
  return ipv6ToBigInt(ip);
}

/**
 * Check if IPv4 address is private
 */
export function isPrivateIPv4(ip: string | number): boolean {
  const value = resolveIPv4Value(ip);
  return (
    (value >= ipv4ToInt("10.0.0.0") && value <= ipv4ToInt("10.255.255.255")) ||
    (value >= ipv4ToInt("172.16.0.0") && value <= ipv4ToInt("172.31.255.255")) ||
    (value >= ipv4ToInt("192.168.0.0") && value <= ipv4ToInt("192.168.255.255"))
  );
}

/**
 * Check if IPv4 address is loopback
 */
export function isLoopbackIPv4(ip: string | number): boolean {
  const value = resolveIPv4Value(ip);
  return value >= ipv4ToInt("127.0.0.0") && value <= ipv4ToInt("127.255.255.255");
}

/**
 * Check if IPv4 address is multicast
 */
export function isMulticastIPv4(ip: string | number): boolean {
  const value = resolveIPv4Value(ip);
  return value >= ipv4ToInt("224.0.0.0") && value <= ipv4ToInt("239.255.255.255");
}

/**
 * Check if IPv6 address is private
 */
export function isPrivateIPv6(ip: string | bigint): boolean {
  const value = resolveIPv6Value(ip);
  return (
    value >= ipv6ToBigInt("fc00::") &&
    value <= ipv6ToBigInt("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")
  );
}

/**
 * Check if IPv6 address is loopback
 */
export function isLoopbackIPv6(ip: string | bigint): boolean {
  return resolveIPv6Value(ip) === 1n;
}

/**
 * Check if IPv6 address is multicast
 */
export function isMulticastIPv6(ip: string | bigint): boolean {
  const value = resolveIPv6Value(ip);
  return value >= ipv6ToBigInt("ff00::") && value <= IPV6_MAX;
}

/**
 * Get next IPv4 address
 */
export function nextIPv4(ip: string | number): string {
  const value = resolveIPv4Value(ip);
  if (value === IPV4_MAX) {
    throw new RangeError("Cannot increment beyond the IPv4 address space");
  }
  return intToIPv4(value + 1);
}

/**
 * Get previous IPv4 address
 */
export function prevIPv4(ip: string | number): string {
  const value = resolveIPv4Value(ip);
  if (value === 0) {
    throw new RangeError("Cannot decrement below the IPv4 address space");
  }
  return intToIPv4(value - 1);
}

/**
 * Get next IPv6 address
 */
export function nextIPv6(ip: string | bigint): string {
  const value = resolveIPv6Value(ip);
  if (value === IPV6_MAX) {
    throw new RangeError("Cannot increment beyond the IPv6 address space");
  }
  return bigIntToIPv6(value + 1n);
}

/**
 * Get previous IPv6 address
 */
export function prevIPv6(ip: string | bigint): string {
  const value = resolveIPv6Value(ip);
  if (value === 0n) {
    throw new RangeError("Cannot decrement below the IPv6 address space");
  }
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
 *
 * Host bits in the address are normalized to zero. IPv4 sizes and endpoints
 * stay in the safe-integer range; IPv6 values use BigInt.
 */
export function parseCIDR(cidr: string): CIDRRange {
  const segments = cidr.split("/");
  if (segments.length !== 2) {
    throw new Error("CIDR must contain exactly one slash");
  }

  const [ip, prefixText] = segments;
  if (!CIDR_PREFIX_PATTERN.test(prefixText)) {
    throw new Error("Invalid CIDR prefix length");
  }

  const prefix = Number.parseInt(prefixText, 10);
  if (isIPv4(ip)) {
    if (prefix > 32) {
      throw new Error("Invalid IPv4 prefix length");
    }

    const hostBits = 32 - prefix;
    const start = (ipv4ToInt(ip) & (IPV4_MAX - (2 ** hostBits - 1))) >>> 0;
    const end = start + 2 ** hostBits - 1;
    return { start, end, prefix, version: 4 };
  }

  if (isIPv6(ip)) {
    if (prefix > 128) {
      throw new Error("Invalid IPv6 prefix length");
    }

    const value = ipv6ToBigInt(ip);
    const mask = IPV6_MAX & (IPV6_MAX << BigInt(128 - prefix));
    const start = value & mask;
    const end = start + ((1n << BigInt(128 - prefix)) - 1n);
    return { start, end, prefix, version: 6 };
  }

  throw new Error("Invalid IP address in CIDR");
}

/**
 * Check if IP address is in CIDR range
 */
export function ipInRange(cidr: string, ip: string): boolean {
  try {
    const range = parseCIDR(cidr);
    if (range.version === 4) {
      return isIPv4(ip) && ipv4ToInt(ip) >= range.start && ipv4ToInt(ip) <= range.end;
    }
    return isIPv6(ip) && ipv6ToBigInt(ip) >= range.start && ipv6ToBigInt(ip) <= range.end;
  } catch {
    return false;
  }
}

/**
 * Get first IP address in CIDR range
 */
export function firstIPInRange(cidr: string): string {
  const range = parseCIDR(cidr);
  return range.version === 4 ? intToIPv4(range.start) : bigIntToIPv6(range.start);
}

/**
 * Get last IP address in CIDR range
 */
export function lastIPInRange(cidr: string): string {
  const range = parseCIDR(cidr);
  return range.version === 4 ? intToIPv4(range.end) : bigIntToIPv6(range.end);
}

/**
 * Get network mask for CIDR
 */
export function maskForCIDR(cidr: string): string {
  const range = parseCIDR(cidr);
  if (range.version === 4) {
    const mask = (IPV4_MAX - (2 ** (32 - range.prefix) - 1)) >>> 0;
    return intToIPv4(mask);
  }

  const mask = IPV6_MAX & (IPV6_MAX << BigInt(128 - range.prefix));
  return bigIntToIPv6(mask);
}

/**
 * Get total number of addresses in CIDR range
 */
export function rangeSize(cidr: string): number | bigint {
  const range = parseCIDR(cidr);
  return range.version === 4 ? 2 ** (32 - range.prefix) : 1n << BigInt(128 - range.prefix);
}

/**
 * Parse IPv4 address to byte array directly
 * More efficient than going through ArrayBuffer
 */
export function ipv4ToBytes(ip: string): number[] {
  const value = parseIPv4Address(ip);
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/**
 * Parse IPv6 address to byte array directly
 * More efficient than going through ArrayBuffer
 */
export function ipv6ToBytes(ip: string): number[] {
  const groups = expandIPv6Groups(ip);
  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [(value >>> 8) & 0xff, value & 0xff];
  });
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
    return range1.start <= range2.end && range1.end >= range2.start;
  }
  return range1.start <= range2.end && range1.end >= range2.start;
}
