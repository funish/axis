/**
 * Free IP API Driver Examples
 * Demonstrating GeoIP lookup functionality with Free IP API service
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import freeipapiDriver from "../../../packages/geoip0/src/drivers/freeipapi";
import type { QueryOptions } from "../../../packages/geoip0/src/types";

console.log("Free IP API Driver Examples\n");

// Initialize Free IP API driver with manager
const freeipapi = freeipapiDriver();
const geoip = createGeoIPManager({ driver: freeipapi });

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

// Batch lookup with version preference
console.log(`\n--- Batch Lookup with Auto Version ---`);
try {
  const options: QueryOptions = { version: "auto" };
  const results = await geoip.batchLookup(testIPs, options);
  if (!results) {
    console.log("No results returned from batch lookup");
  } else {
    console.log(`Found results for ${results.length} IPs with auto version`);

    results.forEach((result, index) => {
      console.log(
        `[${index + 1}] ${result.ip} -> ${result.city || "N/A"}, ${result.country || "N/A"}`,
      );
    });
  }
} catch (error) {
  console.log("Batch lookup error:", (error as Error).message);
}

// Test performance comparison
console.log(`\n--- Performance Comparison ---`);
try {
  const startTime = Date.now();

  // Sequential lookup
  const sequentialStart = Date.now();
  const sequentialResults = [];
  for (const ip of testIPs) {
    const result = await geoip.lookup(ip);
    if (result) sequentialResults.push(result);
  }
  const sequentialTime = Date.now() - sequentialStart;

  // Batch lookup
  const batchStart = Date.now();
  const batchResults = await geoip.batchLookup(testIPs);
  const batchTime = Date.now() - batchStart;

  console.log(
    `Sequential lookup: ${sequentialTime}ms for ${sequentialResults.length} results`,
  );
  console.log(
    `Batch lookup: ${batchTime}ms for ${batchResults?.length || 0} results`,
  );
  if (batchResults && sequentialTime > 0) {
    console.log(
      `Performance improvement: ${(((sequentialTime - batchTime) / sequentialTime) * 100).toFixed(1)}% faster`,
    );
  }
} catch (error) {
  console.log("Performance test error:", (error as Error).message);
}

console.log("\nFree IP API driver examples completed!");
