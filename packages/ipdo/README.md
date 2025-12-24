# ipdo 🔍

![npm version](https://img.shields.io/npm/v/ipdo)
![npm downloads](https://img.shields.io/npm/dw/ipdo)
![npm license](https://img.shields.io/npm/l/ipdo)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

A powerful and efficient IP address manipulation library.

## ✨ Features

- 🌐 Complete IP address manipulation
  - 📍 IPv4 and IPv6 support
  - 🔢 CIDR range operations
  - ✅ IP address validation
  - 🎯 Network mask calculations
  - 🔄 Binary and numeric conversions
  - 🏷️ IP address type detection (private, loopback, multicast)
  - ➕ IP address arithmetic
  - 📦 ArrayBuffer conversions for network protocols
- 🚀 Zero dependencies
- 📝 TypeScript support
- 🛡️ Comprehensive error handling
- ⚡️ High performance bitwise operations
- 📦 Modern ESM and CJS support

## 📥 Installation

```bash
# Using npm
npm install ipdo

# Using yarn
yarn add ipdo

# Using pnpm
pnpm add ipdo
```

## 🚀 Basic Usage

```typescript
import {
  isIPv4,
  isIPv6,
  isValidIP,
  isPrivateIPv4,
  nextIPv4,
  parseCIDR,
  ipInRange,
  firstIPInRange,
  lastIPInRange,
  maskForCIDR,
  rangeSize,
  ipv4ToBuffer,
  ipv6ToBuffer,
  bufferToIPv4,
  bufferToIPv6,
} from "ipdo";

// IP address validation
console.log(isValidIP("192.168.0.1")); // true
console.log(isValidIP("not an ip")); // false
console.log(isIPv4("192.168.0.1")); // true
console.log(isIPv6("2001:db8::")); // true

// IP address type checks
console.log(isPrivateIPv4("192.168.0.1")); // true
console.log(isPrivateIPv4("8.8.8.8")); // false

// IP address arithmetic
console.log(nextIPv4("192.168.0.1")); // '192.168.0.2'
console.log(prevIPv4("192.168.0.1")); // '192.168.0.0'

// CIDR range operations
const range = parseCIDR("192.168.0.0/24");
console.log(ipInRange("192.168.0.0/24", "192.168.0.1")); // true
console.log(ipInRange("192.168.0.0/24", "192.168.1.1")); // false
console.log(firstIPInRange("192.168.0.0/24")); // '192.168.0.0'
console.log(lastIPInRange("192.168.0.0/24")); // '192.168.0.255'
console.log(maskForCIDR("192.168.0.0/24")); // '255.255.255.0'
console.log(rangeSize("192.168.0.0/24")); // 256
```

## 🔧 Advanced Usage

### 🌐 IPv6 Operations

```typescript
import {
  isIPv6,
  isPrivateIPv6,
  nextIPv6,
  parseCIDR,
  ipInRange,
  firstIPInRange,
  lastIPInRange,
  rangesOverlap,
} from "ipdo";

console.log(ipInRange("2001:db8::/32", "2001:db8::1")); // true
console.log(ipInRange("2001:db8::/32", "2001:db9::1")); // false
console.log(firstIPInRange("2001:db8::/32")); // '2001:db8:0000:0000:0000:0000:0000:0000'
console.log(lastIPInRange("2001:db8::/32")); // '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'
console.log(isPrivateIPv6("fc00::1")); // true
console.log(nextIPv6("2001:db8::")); // '2001:db8::1'
```

### 🔄 Range Overlap Checking

```typescript
import { rangesOverlap } from "ipdo";

console.log(rangesOverlap("192.168.0.0/24", "192.168.0.128/25")); // true
console.log(rangesOverlap("192.168.0.0/24", "10.0.0.0/24")); // false
```

### 🔄 Binary and Numeric Conversions

```typescript
import {
  ipv4ToInt,
  intToIPv4,
  ipv6ToBigInt,
  bigIntToIPv6,
  toBinary,
  toNumber,
} from "ipdo";

// IPv4 conversions
console.log(ipv4ToInt("192.168.0.1")); // 3232235521
console.log(intToIPv4(3232235521)); // '192.168.0.1'

// IPv6 conversions
console.log(ipv6ToBigInt("2001:db8::")); // 42540766452641154071740215577757643584n
console.log(bigIntToIPv6(42540766452641154071740215577757643584n)); // '2001:db8::'

// Generic conversions
console.log(toBinary("192.168.0.1")); // '11000000101010000000000000000001'
console.log(toNumber("192.168.0.1")); // 3232235521
```

### 🔄 Buffer Conversions

```typescript
import { ipv4ToBuffer, ipv6ToBuffer, bufferToIPv4, bufferToIPv6 } from "ipdo";

// IPv4 buffer conversions
const ipv4Buffer = ipv4ToBuffer("192.168.0.1"); // ArrayBuffer (4 bytes)
console.log(ipv4Buffer.byteLength); // 4
const ipv4String = bufferToIPv4(ipv4Buffer); // '192.168.0.1'

// IPv6 buffer conversions (supports compressed notation)
const ipv6Buffer = ipv6ToBuffer("2001:db8::"); // ArrayBuffer (16 bytes)
console.log(ipv6Buffer.byteLength); // 16
const ipv6String = bufferToIPv6(ipv6Buffer); // '2001:0db8:0000:0000:0000:0000:0000:0000'

// Round-trip conversion
const compressedIPv6 = "2001:db8::1";
const buffer = ipv6ToBuffer(compressedIPv6);
const expandedIPv6 = bufferToIPv6(buffer); // Fully expanded format
```

## 📚 API Reference

### 🔍 IP Address Validation

#### `isIPv4(ip: string): boolean`

Check if a string is a valid IPv4 address.

#### `isIPv6(ip: string): boolean`

Check if a string is a valid IPv6 address.

#### `isValidIP(ip: string): boolean`

Check if a string is a valid IP address (IPv4 or IPv6).

### 🔄 IP Address Conversions

#### `ipv4ToInt(ip: string): number`

Convert IPv4 address to 32-bit number.

#### `intToIPv4(int: number): string`

Convert number to IPv4 address.

#### `ipv6ToBigInt(ip: string): bigint`

Convert IPv6 address to BigInt.

#### `bigIntToIPv6(int: bigint): string`

Convert BigInt to IPv6 address.

#### `toBinary(ip: string): string`

Convert IP address to binary string.

#### `toNumber(ip: string): number | bigint`

Convert IP address to numeric value.

### 🔄 Buffer Conversions

#### `ipv4ToBuffer(ip: string): ArrayBuffer`

Convert IPv4 address to ArrayBuffer (4 bytes).

#### `ipv6ToBuffer(ip: string): ArrayBuffer`

Convert IPv6 address to ArrayBuffer (16 bytes). Supports compressed notation.

#### `bufferToIPv4(buffer: ArrayBuffer): string`

Convert ArrayBuffer (4 bytes) to IPv4 address.

#### `bufferToIPv6(buffer: ArrayBuffer): string`

Convert ArrayBuffer (16 bytes) to IPv6 address.

### 🏷️ IP Address Type Detection

#### `isPrivateIPv4(ip: string | number): boolean`

Check if IPv4 address is private.

#### `isLoopbackIPv4(ip: string | number): boolean`

Check if IPv4 address is loopback.

#### `isMulticastIPv4(ip: string | number): boolean`

Check if IPv4 address is multicast.

#### `isPrivateIPv6(ip: string | bigint): boolean`

Check if IPv6 address is private.

#### `isLoopbackIPv6(ip: string | bigint): boolean`

Check if IPv6 address is loopback.

#### `isMulticastIPv6(ip: string | bigint): boolean`

Check if IPv6 address is multicast.

### ➕ IP Address Arithmetic

#### `nextIPv4(ip: string | number): string`

Get next IPv4 address.

#### `prevIPv4(ip: string | number): string`

Get previous IPv4 address.

#### `nextIPv6(ip: string | bigint): string`

Get next IPv6 address.

#### `prevIPv6(ip: string | bigint): string`

Get previous IPv6 address.

### 🌐 CIDR Range Operations

#### `parseCIDR(cidr: string): object`

Parse CIDR notation to range information.

#### `ipInRange(cidr: string, ip: string): boolean`

Check if IP address is in CIDR range.

#### `firstIPInRange(cidr: string): string`

Get first IP address in CIDR range.

#### `lastIPInRange(cidr: string): string`

Get last IP address in CIDR range.

#### `maskForCIDR(cidr: string): string`

Get network mask for CIDR.

#### `rangeSize(cidr: string): number | bigint`

Get total number of addresses in CIDR range.

#### `rangesOverlap(cidr1: string, cidr2: string): boolean`

Check if two CIDR ranges overlap.

### 📦 Byte Array Conversions

#### `ipv4ToBytes(ip: string): number[]`

Parse IPv4 address to byte array directly. More efficient than ArrayBuffer conversion.

#### `ipv6ToBytes(ip: string): number[]`

Parse IPv6 address to byte array directly. Supports compressed notation.

#### `ipToBytes(ip: string): number[]`

Parse IP address to byte array (unified function). Chooses the most efficient method based on IP version.

### 🔢 IP Version Detection

#### `getIPVersion(ip: string): 4 | 6 | null`

Get IP version (4 for IPv4, 6 for IPv6). Returns null if invalid.

## ⚠️ Error Handling

The library throws descriptive errors for:

- 🚫 Invalid IP address format
- 📏 Invalid prefix length (must be 0-32 for IPv4, 0-128 for IPv6)
- ❌ Mismatched IP version
- 🚫 Invalid CIDR notation

## 📄 License

[MIT](../../LICENSE) © [Funish](http://www.funish.net/)
