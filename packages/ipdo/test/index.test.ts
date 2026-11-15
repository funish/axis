import { describe, expect, it } from "vite-plus/test";

import {
  bigIntToIPv6,
  bufferToIPv4,
  bufferToIPv6,
  firstIPInRange,
  getIPVersion,
  intToIPv4,
  ipInRange,
  ipToBytes,
  ipv4ToBuffer,
  ipv4ToBytes,
  ipv4ToInt,
  ipv6ToBigInt,
  ipv6ToBuffer,
  ipv6ToBytes,
  isIPv4,
  isIPv6,
  isLoopbackIPv4,
  isLoopbackIPv6,
  isMulticastIPv4,
  isMulticastIPv6,
  isPrivateIPv4,
  isPrivateIPv6,
  isValidIP,
  lastIPInRange,
  maskForCIDR,
  nextIPv4,
  nextIPv6,
  parseCIDR,
  prevIPv4,
  prevIPv6,
  rangeSize,
  rangesOverlap,
  toBinary,
  toNumber,
} from "../src";

const IPV4_MAX = 4294967295;
const IPV6_MAX = (1n << 128n) - 1n;

describe("IPv4 validation", () => {
  it("accepts only four strict decimal octets", () => {
    expect(isIPv4("0.0.0.0")).toBe(true);
    expect(isIPv4("255.255.255.255")).toBe(true);
    expect(isIPv4("192.168.0.1")).toBe(true);

    const invalid = [
      "",
      "256.0.0.0",
      "01.2.3.4",
      "1.2.3.04",
      "1.2.3",
      "1.2.3.4.5",
      ".1.2.3.4",
      "1.2.3.4.",
      " 1.2.3.4",
      "1.2.3.4 ",
      "1e0.2.3.4",
      "1..2.3",
    ];
    for (const ip of invalid) {
      expect(isIPv4(ip), ip).toBe(false);
    }
  });

  it("rejects non-string values without throwing", () => {
    expect(isIPv4(undefined as unknown as string)).toBe(false);
    expect(isIPv4(1 as unknown as string)).toBe(false);
  });

  it("detects IPv4 and generic validity", () => {
    expect(getIPVersion("192.168.0.1")).toBe(4);
    expect(isValidIP("192.168.0.1")).toBe(true);
    expect(isValidIP("2001:db8::1")).toBe(true);
    expect(isValidIP("256.1.1.1")).toBe(false);
    expect(getIPVersion("256.1.1.1")).toBeNull();
  });
});

describe("IPv6 parsing and compression", () => {
  it("accepts canonical and compressed forms", () => {
    const valid = [
      "::",
      "::1",
      "1::",
      "1::2",
      "1:2:3:4:5:6:7::",
      "2001:db8::1",
      "2001:0db8:0000:0000:0000:0000:0000:0001",
      "FFFF:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "::ffff:c0a8:101",
      "::FFFF:192.168.1.1",
      "0:0:0:0:0:ffff:192.168.1.1",
      "64:ff9b::192.0.2.33",
    ];
    for (const ip of valid) {
      expect(isIPv6(ip), ip).toBe(true);
    }
  });

  it("rejects malformed compression and characters", () => {
    const invalid = [
      "",
      ":::",
      "::::",
      "1::2::3",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:8:9",
      "::1:2:3:4:5:6:7:8",
      "12345::",
      "2001:db8:::1",
      ":1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:8:",
      "fe80::1%eth0",
      "1.2.3.4",
      "::ffff:192.168.1.256",
      "::ffff:01.2.3.4",
    ];
    for (const ip of invalid) {
      expect(isIPv6(ip), ip).toBe(false);
    }
  });

  it("expands compression to one canonical numeric value", () => {
    expect(ipv6ToBigInt("::")).toBe(0n);
    expect(ipv6ToBigInt("::1")).toBe(1n);
    expect(ipv6ToBigInt("1::")).toBe(1n << 112n);
    expect(ipv6ToBigInt("2001:db8::1")).toBe((0x2001n << 112n) | (0x0db8n << 96n) | 1n);
    expect(ipv6ToBigInt("FFFF:ffff::")).toBe(ipv6ToBigInt("ffff:ffff:0:0:0:0:0:0"));
    expect(ipv6ToBigInt("::ffff:192.168.1.1")).toBe(0xffffc0a80101n);
    expect(ipv6ToBigInt("0:0:0:0:0:ffff:192.168.1.1")).toBe(0xffffc0a80101n);
  });

  it("rejects conversion failures instead of coercing", () => {
    expect(() => ipv6ToBigInt("1::2::3")).toThrowError("Invalid IPv6 compression");
    expect(() => ipv6ToBigInt(null as unknown as string)).toThrowError("Invalid IPv6 address");
  });
});

describe("numeric conversion", () => {
  it("round-trips IPv4 values", () => {
    expect(ipv4ToInt("0.0.0.0")).toBe(0);
    expect(ipv4ToInt("192.168.0.1")).toBe(3232235521);
    expect(ipv4ToInt("255.255.255.255")).toBe(IPV4_MAX);
    expect(intToIPv4(0)).toBe("0.0.0.0");
    expect(intToIPv4(IPV4_MAX)).toBe("255.255.255.255");
    expect(intToIPv4(ipv4ToInt("127.0.0.1"))).toBe("127.0.0.1");
  });

  it("validates IPv4 integer conversion inputs", () => {
    expect(() => ipv4ToInt("1.2.3.4/5")).toThrowError("Invalid IPv4 address");
    expect(() => intToIPv4(-1)).toThrowError(RangeError);
    expect(() => intToIPv4(IPV4_MAX + 1)).toThrowError(RangeError);
    expect(() => intToIPv4(1.5)).toThrowError(TypeError);
    expect(() => intToIPv4(Number.NaN)).toThrowError(TypeError);
  });

  it("round-trips IPv6 values", () => {
    const value = ipv6ToBigInt("2001:db8::1");
    expect(bigIntToIPv6(value)).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(bigIntToIPv6(0n)).toBe("0000:0000:0000:0000:0000:0000:0000:0000");
    expect(bigIntToIPv6(IPV6_MAX)).toBe("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
    expect(ipv6ToBigInt(bigIntToIPv6(IPV6_MAX))).toBe(IPV6_MAX);
    expect(() => bigIntToIPv6(-1n)).toThrowError(RangeError);
    expect(() => bigIntToIPv6(IPV6_MAX + 1n)).toThrowError(RangeError);
    expect(() => bigIntToIPv6(1 as unknown as bigint)).toThrowError(TypeError);
  });

  it("converts generic addresses to binary and numeric values", () => {
    expect(toBinary("192.168.0.1")).toBe("11000000101010000000000000000001");
    expect(toBinary("::1")).toBe("0".repeat(127) + "1");
    expect(toNumber("192.168.0.1")).toBe(3232235521);
    expect(toNumber("::1")).toBe(1n);
    expect(() => toBinary("invalid")).toThrowError("Invalid IP address");
    expect(() => toNumber("invalid")).toThrowError("Invalid IP address");
  });
});

describe("buffer conversion", () => {
  it("round-trips IPv4 buffers", () => {
    const buffer = ipv4ToBuffer("192.168.0.1");
    expect(buffer.byteLength).toBe(4);
    expect(Array.from(new Uint8Array(buffer))).toEqual([192, 168, 0, 1]);
    expect(bufferToIPv4(buffer)).toBe("192.168.0.1");
    expect(bufferToIPv4(ipv4ToBuffer("255.255.255.255"))).toBe("255.255.255.255");
  });

  it("round-trips IPv6 buffers and mapped addresses", () => {
    const buffer = ipv6ToBuffer("2001:db8::1");
    expect(buffer.byteLength).toBe(16);
    expect(Array.from(new Uint8Array(buffer))).toEqual([
      0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
    expect(bufferToIPv6(buffer)).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(bufferToIPv6(ipv6ToBuffer("::FFFF:192.168.1.1"))).toBe(
      "0000:0000:0000:0000:0000:ffff:c0a8:0101",
    );
  });

  it("validates buffer type and length", () => {
    expect(() => ipv4ToBuffer("256.0.0.1")).toThrowError("Invalid IPv4 address");
    expect(() => ipv6ToBuffer("1::2::3")).toThrowError("Invalid IPv6 compression");
    expect(() => bufferToIPv4(new ArrayBuffer(5))).toThrowError(
      "ArrayBuffer must be 4 bytes for IPv4",
    );
    expect(() => bufferToIPv6(new ArrayBuffer(4))).toThrowError(
      "ArrayBuffer must be 16 bytes for IPv6",
    );
    expect(() => bufferToIPv4(null as unknown as ArrayBuffer)).toThrowError(
      "ArrayBuffer must be 4 bytes for IPv4",
    );
  });
});

describe("classification", () => {
  it("classifies IPv4 address families", () => {
    expect(isPrivateIPv4("10.0.0.0")).toBe(true);
    expect(isPrivateIPv4("172.16.0.0")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("172.32.0.0")).toBe(false);
    expect(isPrivateIPv4("192.168.255.255")).toBe(true);
    expect(isPrivateIPv4(3232235521)).toBe(true);

    expect(isLoopbackIPv4("127.0.0.0")).toBe(true);
    expect(isLoopbackIPv4("128.0.0.0")).toBe(false);
    expect(isMulticastIPv4("224.0.0.0")).toBe(true);
    expect(isMulticastIPv4("239.255.255.255")).toBe(true);
    expect(isMulticastIPv4("240.0.0.0")).toBe(false);
  });

  it("classifies IPv6 address families", () => {
    expect(isPrivateIPv6("fc00::")).toBe(true);
    expect(isPrivateIPv6("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
    expect(isPrivateIPv6("fe00::")).toBe(false);
    expect(isLoopbackIPv6("::1")).toBe(true);
    expect(isLoopbackIPv6("::2")).toBe(false);
    expect(isMulticastIPv6("ff00::")).toBe(true);
    expect(isMulticastIPv6(IPV6_MAX)).toBe(true);
    expect(isMulticastIPv6("feff::")).toBe(false);
  });

  it("does not classify mapped IPv4 semantics as IPv6 semantics", () => {
    expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(false);
    expect(isLoopbackIPv6("::ffff:127.0.0.1")).toBe(false);
    expect(isMulticastIPv6("::ffff:224.0.0.1")).toBe(false);
  });

  it("rejects invalid classification inputs", () => {
    expect(() => isPrivateIPv4("256.0.0.1")).toThrowError("Invalid IPv4 address");
    expect(() => isLoopbackIPv4(-1)).toThrowError(RangeError);
    expect(() => isPrivateIPv6("1::2::3")).toThrowError("Invalid IPv6 compression");
    expect(() => isLoopbackIPv6(-1n)).toThrowError(RangeError);
  });
});

describe("IP arithmetic", () => {
  it("increments and decrements inside the address space", () => {
    expect(nextIPv4("192.168.0.1")).toBe("192.168.0.2");
    expect(prevIPv4("192.168.0.1")).toBe("192.168.0.0");
    expect(nextIPv4(0)).toBe("0.0.0.1");
    expect(nextIPv6("2001:db8::")).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(prevIPv6("::2")).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
    expect(nextIPv6(0n)).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
  });

  it("reports address-space boundaries explicitly", () => {
    expect(() => nextIPv4(IPV4_MAX)).toThrowError(RangeError);
    expect(() => prevIPv4(0)).toThrowError(RangeError);
    expect(() => nextIPv6(IPV6_MAX)).toThrowError(RangeError);
    expect(() => prevIPv6(0n)).toThrowError(RangeError);
    expect(() => nextIPv4("256.0.0.0")).toThrowError("Invalid IPv4 address");
    expect(() => prevIPv6("1::2::3")).toThrowError("Invalid IPv6 compression");
  });
});

describe("CIDR parsing", () => {
  it("requires one integer prefix and one supported value", () => {
    const invalid = [
      "192.168.0.0",
      "192.168.0.0/",
      "192.168.0.0/x",
      "192.168.0.0/+24",
      "192.168.0.0/-1",
      "192.168.0.0/024",
      "192.168.0.0/24/24",
      "192.168.0.0/33",
      "2001:db8::/129",
    ];
    for (const cidr of invalid) {
      expect(() => parseCIDR(cidr), cidr).toThrowError();
    }
    expect(() => parseCIDR("256.0.0.0/24")).toThrowError("Invalid IP address in CIDR");
  });

  it("normalizes IPv4 host bits and computes exact boundaries", () => {
    expect(parseCIDR("192.168.0.100/24")).toEqual({
      start: 3232235520,
      end: 3232235775,
      prefix: 24,
      version: 4,
    });
    expect(parseCIDR("0.0.0.0/0")).toEqual({
      start: 0,
      end: IPV4_MAX,
      prefix: 0,
      version: 4,
    });
    expect(parseCIDR("192.168.0.1/32")).toEqual({
      start: 3232235521,
      end: 3232235521,
      prefix: 32,
      version: 4,
    });
    expect(parseCIDR("192.168.0.255/1")).toEqual({
      start: 2147483648,
      end: 4294967295,
      prefix: 1,
      version: 4,
    });
  });

  it("normalizes IPv6 host bits and computes exact boundaries", () => {
    const range = parseCIDR("2001:db8::1235/112");
    expect(range).toEqual({
      start: ipv6ToBigInt("2001:db8::"),
      end: ipv6ToBigInt("2001:db8::ffff"),
      prefix: 112,
      version: 6,
    });

    const mapped = parseCIDR("::ffff:192.168.1.100/120");
    expect(mapped).toEqual({
      start: ipv6ToBigInt("::ffff:192.168.1.0"),
      end: ipv6ToBigInt("::ffff:192.168.1.255"),
      prefix: 120,
      version: 6,
    });

    expect(parseCIDR("::/0")).toEqual({ start: 0n, end: IPV6_MAX, prefix: 0, version: 6 });
    expect(parseCIDR("::1/128")).toEqual({ start: 1n, end: 1n, prefix: 128, version: 6 });
  });

  it("returns masks for boundary prefixes", () => {
    expect(maskForCIDR("0.0.0.0/0")).toBe("0.0.0.0");
    expect(maskForCIDR("192.168.0.100/1")).toBe("128.0.0.0");
    expect(maskForCIDR("192.168.0.100/24")).toBe("255.255.255.0");
    expect(maskForCIDR("192.168.0.100/32")).toBe("255.255.255.255");
    expect(maskForCIDR("2001:db8::/128")).toBe("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
    expect(maskForCIDR("2001:db8::/0")).toBe("0000:0000:0000:0000:0000:0000:0000:0000");
  });

  it("returns first and last addresses", () => {
    expect(firstIPInRange("192.168.0.130/25")).toBe("192.168.0.128");
    expect(lastIPInRange("192.168.0.130/25")).toBe("192.168.0.255");
    expect(firstIPInRange("2001:db8::ffff:1235/112")).toBe(
      "2001:0db8:0000:0000:0000:0000:ffff:0000",
    );
    expect(lastIPInRange("2001:db8::ffff:1235/112")).toBe(
      "2001:0db8:0000:0000:0000:0000:ffff:ffff",
    );
  });

  it("makes range sizes explicit and safe", () => {
    const ipv4Size = rangeSize("0.0.0.0/0");
    expect(ipv4Size).toBe(4294967296);

    expect(rangeSize("192.168.0.0/32")).toBe(1);
    expect(rangeSize("::/0")).toBe(IPV6_MAX + 1n);
    expect(rangeSize("::/128")).toBe(1n);
  });
});

describe("membership and overlap", () => {
  it("checks IPv4 membership and version", () => {
    expect(ipInRange("192.168.0.130/24", "192.168.0.0")).toBe(true);
    expect(ipInRange("192.168.0.130/24", "192.168.1.1")).toBe(false);
    expect(ipInRange("0.0.0.0/0", "255.255.255.255")).toBe(true);
    expect(ipInRange("192.168.0.0/24", "2001:db8::1")).toBe(false);
    expect(ipInRange("2001:db8::/32", "192.168.0.1")).toBe(false);
    expect(ipInRange("192.168.0.0/33", "192.168.0.1")).toBe(false);
    expect(ipInRange("192.168.0.0/24", "256.0.0.1")).toBe(false);
  });

  it("checks IPv6 membership including mapped addresses", () => {
    expect(ipInRange("2001:db8::/32", "2001:db8::ffff")).toBe(true);
    expect(ipInRange("2001:db8::/32", "2001:db9::1")).toBe(false);
    expect(ipInRange("::ffff:192.168.0.0/120", "::ffff:192.168.0.25")).toBe(true);
    expect(ipInRange("::ffff:192.168.0.0/120", "::ffff:192.168.1.1")).toBe(false);
  });

  it("checks adjacent and nested ranges", () => {
    expect(rangesOverlap("192.168.0.0/25", "192.168.0.128/25")).toBe(false);
    expect(rangesOverlap("192.168.0.0/24", "192.168.0.128/25")).toBe(true);
    expect(rangesOverlap("192.168.0.0/32", "192.168.0.0/32")).toBe(true);
    expect(rangesOverlap("192.168.0.0/24", "10.0.0.0/24")).toBe(false);
    expect(rangesOverlap("2001:db8::/32", "2001:db8:ffff::/48")).toBe(true);
    expect(rangesOverlap("2001:db8::/32", "2001:db9::/32")).toBe(false);
    expect(rangesOverlap("192.168.0.0/24", "2001:db8::/32")).toBe(false);
    expect(() => rangesOverlap("192.168.0.0/33", "192.168.1.0/24")).toThrowError();
  });
});

describe("byte conversion", () => {
  it("converts IPv4 bytes", () => {
    expect(ipv4ToBytes("192.168.0.1")).toEqual([192, 168, 0, 1]);
    expect(ipToBytes("192.168.0.1")).toEqual([192, 168, 0, 1]);
    expect(() => ipv4ToBytes("256.0.0.1")).toThrowError("Invalid IPv4 address");
  });

  it("uses one IPv6 expansion implementation for bytes", () => {
    const mapped = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 192, 168, 1, 1];
    expect(ipv6ToBytes("::ffff:192.168.1.1")).toEqual(mapped);
    expect(ipv6ToBytes("::ffff:c0a8:101")).toEqual(mapped);
    expect(ipv6ToBytes("0:0:0:0:0:ffff:192.168.1.1")).toEqual(mapped);
    expect(ipToBytes("64:ff9b::192.0.2.33")).toEqual([
      0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0, 192, 0, 2, 33,
    ]);
    expect(ipv6ToBytes("::")).toEqual(Array.from({ length: 16 }, () => 0));
    expect(() => ipv6ToBytes("1::2::3")).toThrowError("Invalid IPv6 compression");
    expect(() => ipToBytes("invalid")).toThrowError("Invalid IP address");
  });
});
