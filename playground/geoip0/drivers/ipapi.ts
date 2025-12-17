/**
 * IP-API.com Driver Examples
 * Demonstrating GeoIP lookup functionality with IP-API.com service
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import ipapiDriver from "../../../packages/geoip0/src/drivers/ipapi";
import type { QueryOptions } from "../../../packages/geoip0/src/types";

console.log("IP-API.com Driver Examples\n");

// Initialize IP-API.com driver with manager
const ipapi = ipapiDriver();
const geoip = createGeoIPManager({ driver: ipapi });

// Test IPs
const testIPv4 = "1.1.1.1"; // Cloudflare DNS
const testIPv6 = "2606:4700:4700::1111"; // Cloudflare DNS IPv6

console.log("=== IP Lookup Examples ===");

// IPv4 Lookup
console.log("\n--- IPv4 Lookup ---");
try {
  const result = await geoip.lookup(testIPv4);
  if (result) {
    console.log(`IP: ${result.ip}`);
    console.log(`Country: ${result.country} (${result.countryCode})`);
    console.log(`Region: ${result.region || "N/A"}`);
    console.log(`City: ${result.city || "N/A"}`);
    console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
    console.log(`ISP: ${result.isp || "N/A"}`);
    console.log(`Organization: ${result.org || "N/A"}`);
    console.log(`ASN: ${result.asn || "N/A"}`);
    console.log(`Timezone: ${result.timezone || "N/A"}`);
    console.log(`Source: ${result.source}`);
  } else {
    console.log("No data found for this IP");
  }
} catch (error) {
  console.log("Error:", (error as Error).message);
}

// IPv6 Lookup
console.log("\n--- IPv6 Lookup ---");
try {
  const result = await geoip.lookup(testIPv6);
  if (result) {
    console.log(`IP: ${result.ip}`);
    console.log(`Country: ${result.country} (${result.countryCode})`);
    console.log(`Region: ${result.region || "N/A"}`);
    console.log(`City: ${result.city || "N/A"}`);
    console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
    console.log(`ISP: ${result.isp || "N/A"}`);
    console.log(`Organization: ${result.org || "N/A"}`);
    console.log(`ASN: ${result.asn || "N/A"}`);
    console.log(`Timezone: ${result.timezone || "N/A"}`);
    console.log(`Source: ${result.source}`);
  } else {
    console.log("No data found for this IP");
  }
} catch (error) {
  console.log("Error:", (error as Error).message);
}

console.log("\n=== Current IP Detection ===");

// Test current IP detection with different versions
const versions: Array<QueryOptions["version"]> = ["auto", "ipv4", "ipv6"];

for (const version of versions) {
  console.log(`\n--- Current IP (${version}) ---`);
  try {
    const options: QueryOptions = { version };
    const result = await geoip.current(options);
    if (result) {
      console.log(`IP: ${result.ip}`);
      console.log(`Country: ${result.country} (${result.countryCode})`);
      console.log(`Region: ${result.region || "N/A"}`);
      console.log(`City: ${result.city || "N/A"}`);
      console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
      console.log(`ISP: ${result.isp || "N/A"}`);
      console.log(`Organization: ${result.org || "N/A"}`);
      console.log(`ASN: ${result.asn || "N/A"}`);
      console.log(`Timezone: ${result.timezone || "N/A"}`);
      console.log(`Source: ${result.source}`);
    } else {
      console.log("No data found");
    }
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }
}

console.log("\n=== Batch Lookup Examples ===");

// Batch lookup with multiple IPs
const testIPs = [
  "1.1.1.1", // Cloudflare DNS
  "8.8.8.8", // Google DNS
  "208.67.222.222", // OpenDNS
  "9.9.9.9", // Quad9 DNS
];

console.log(`\n--- Batch Lookup (${testIPs.length} IPs) ---`);
try {
  const results = await geoip.batchLookup(testIPs);
  if (!results) {
    console.log("No results returned from batch lookup");
  } else {
    console.log(`Found results for ${results.length} IPs:`);

    results.forEach((result, index) => {
      console.log(`\n[${index + 1}] ${result.ip}`);
      console.log(`  Country: ${result.country} (${result.countryCode})`);
      console.log(`  Region: ${result.region || "N/A"}`);
      console.log(`  City: ${result.city || "N/A"}`);
      console.log(`  Coordinates: ${result.latitude}, ${result.longitude}`);
      console.log(`  ISP: ${result.isp || "N/A"}`);
      console.log(`  Organization: ${result.org || "N/A"}`);
      console.log(`  ASN: ${result.asn || "N/A"}`);
      console.log(`  Timezone: ${result.timezone || "N/A"}`);
      console.log(`  Source: ${result.source}`);
    });
  }
} catch (error) {
  console.log("Batch lookup error:", (error as Error).message);
}

// Batch lookup with version preference (IP-API.com auto-detects)
console.log(`\n--- Batch Lookup with Field Customization ---`);
try {
  // Test with custom driver options
  const ipapiCustom = ipapiDriver({
    fields: "status,message,country,city,lat,lon,query",
    lang: "en",
  });
  const geoipCustom = createGeoIPManager({ driver: ipapiCustom });

  const results = await geoipCustom.batchLookup(testIPs);
  if (!results) {
    console.log("No results returned from batch lookup");
  } else {
    console.log(`Found results for ${results.length} IPs with custom fields:`);

    results.forEach((result, index) => {
      console.log(
        `[${index + 1}] ${result.ip} -> ${result.city || "N/A"}, ${result.country || "N/A"}`,
      );
    });
  }
} catch (error) {
  console.log("Batch lookup error:", (error as Error).message);
}

// Test batch limit handling
console.log(`\n--- Batch Limit Test ---`);
try {
  // Test with many IPs to demonstrate 100 IP limit
  const manyIPs = Array.from({ length: 105 }, (_, i) => `8.8.8.${i + 1}`);
  console.log(`Testing batch lookup with ${manyIPs.length} IPs (limit is 100)`);

  const results = await geoip.batchLookup(manyIPs);
  if (!results) {
    console.log("No results returned from batch lookup");
  } else {
    console.log(
      `Received results for ${results.length} IPs (note: limit is 100 per request)`,
    );
    console.log(`First few results:`);
    results.slice(0, 3).forEach((result, index) => {
      console.log(
        `  [${index + 1}] ${result.ip} -> ${result.country || "N/A"}`,
      );
    });
  }
} catch (error) {
  console.log("Batch limit test error:", (error as Error).message);
}

console.log("\nIP-API.com driver examples completed!");
