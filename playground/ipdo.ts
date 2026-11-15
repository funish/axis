/**
 * IPDO Library Examples
 * Demonstrating various IP address manipulation functions
 */

import {
  // IP validation
  isValidIP,
  isIPv4,
  isIPv6,
  isPrivateIPv4,
  isPrivateIPv6,
  isLoopbackIPv4,
  isLoopbackIPv6,
  isMulticastIPv4,
  isMulticastIPv6,

  // IP address arithmetic
  nextIPv4,
  prevIPv4,
  nextIPv6,
  prevIPv6,

  // Conversions
  ipv4ToInt,
  intToIPv4,
  ipv6ToBigInt,
  bigIntToIPv6,
  toBinary,
  toNumber,

  // CIDR operations
  parseCIDR,
  ipInRange,
  firstIPInRange,
  lastIPInRange,
  maskForCIDR,
  rangeSize,
  rangesOverlap,
} from "ipdo";

console.log("🔍 IPDO Library Examples\n");

// IP validation examples
console.log("=== IP Validation ===");
console.log("isValidIP('192.168.1.1'):", isValidIP("192.168.1.1"));
console.log("isValidIP('2001:db8::1'):", isValidIP("2001:db8::1"));
console.log("isValidIP('invalid-ip'):", isValidIP("invalid-ip"));

console.log("\nisIPv4('192.168.1.1'):", isIPv4("192.168.1.1"));
console.log("isIPv6('2001:db8::1'):", isIPv6("2001:db8::1"));

console.log("\nisPrivateIPv4('192.168.1.1'):", isPrivateIPv4("192.168.1.1"));
console.log("isPrivateIPv4('8.8.8.8'):", isPrivateIPv4("8.8.8.8"));

console.log("\nisLoopbackIPv4('127.0.0.1'):", isLoopbackIPv4("127.0.0.1"));
console.log("isLoopbackIPv6('::1'):", isLoopbackIPv6("::1"));

console.log("\nisPrivateIPv6('fc00::1'):", isPrivateIPv6("fc00::1"));
console.log("isMulticastIPv4('224.0.0.1'):", isMulticastIPv4("224.0.0.1"));
console.log("isMulticastIPv6('ff02::1'):", isMulticastIPv6("ff02::1"));

// IP arithmetic examples
console.log("\n=== IP Arithmetic ===");
console.log("nextIPv4('192.168.1.1'):", nextIPv4("192.168.1.1"));
console.log("prevIPv4('192.168.1.1'):", prevIPv4("192.168.1.1"));
console.log("nextIPv6('2001:db8::'):", nextIPv6("2001:db8::"));
console.log("prevIPv6('2001:db8::1'):", prevIPv6("2001:db8::1"));

// Conversion examples
console.log("\n=== IP Conversions ===");
const ipv4 = "192.168.1.1";
const ipv4Num = ipv4ToInt(ipv4);
console.log(`ipv4ToInt('${ipv4}') =`, ipv4Num);
console.log(`intToIPv4(${ipv4Num}) =`, intToIPv4(ipv4Num));

const ipv6 = "2001:db8::1";
const ipv6Num = ipv6ToBigInt(ipv6);
console.log(`ipv6ToBigInt('${ipv6}') =`, ipv6Num);
console.log(`bigIntToIPv6(${ipv6Num}) =`, bigIntToIPv6(ipv6Num));

console.log(`toBinary('${ipv4}') =`, toBinary(ipv4));
console.log(`toNumber('${ipv6}') =`, toNumber(ipv6));

// CIDR operations examples
console.log("\n=== CIDR Operations ===");
const cidr = "192.168.1.0/24";
const range = parseCIDR(cidr);
console.log(`parseCIDR('${cidr}') =`, range);

console.log(`ipInRange('${cidr}', '192.168.1.100') =`, ipInRange(cidr, "192.168.1.100"));
console.log(`ipInRange('${cidr}', '192.168.2.100') =`, ipInRange(cidr, "192.168.2.100"));

console.log(`firstIPInRange('${cidr}') =`, firstIPInRange(cidr));
console.log(`lastIPInRange('${cidr}') =`, lastIPInRange(cidr));
console.log(`maskForCIDR('${cidr}') =`, maskForCIDR(cidr));
console.log(`rangeSize('${cidr}') =`, rangeSize(cidr));

// Range overlap examples
console.log("\n=== Range Overlap ===");
console.log(
  "rangesOverlap('192.168.1.0/24', '192.168.1.128/25') =",
  rangesOverlap("192.168.1.0/24", "192.168.1.128/25"),
);
console.log(
  "rangesOverlap('192.168.1.0/24', '10.0.0.0/24') =",
  rangesOverlap("192.168.1.0/24", "10.0.0.0/24"),
);

console.log("\n✅ IPDO examples completed!");
