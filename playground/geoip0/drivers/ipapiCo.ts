/**
 * ipapi.co Driver Examples
 * Demonstrating GeoIP lookup functionality with ipapi.co service
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import ipapiCoDriver from "../../../packages/geoip0/src/drivers/ipapiCo";
import type { QueryOptions } from "../../../packages/geoip0/src/types";

console.log("ipapi.co Driver Examples\n");

// Initialize ipapi.co driver with manager
const ipapiCo = ipapiCoDriver();
const geoip = createGeoIPManager({ driver: ipapiCo });

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

// Batch lookup with version preference (ipapi.co auto-detects)
console.log(`\n--- Batch Lookup with Field Customization ---`);
try {
  // Test with custom driver options
  const ipapiCoCustom = ipapiCoDriver({
    fields: "country,city,lat,lon,ip",
  });
  const geoipCustom = createGeoIPManager({ driver: ipapiCoCustom });

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

// Performance test - compare sequential vs batch (constructed batch)
console.log(`\n--- Performance Test (Constructed Batch vs Sequential) ---`);
try {
  // Sequential lookup
  const sequentialStart = Date.now();
  const sequentialResults = [];
  for (const ip of testIPs) {
    const result = await geoip.lookup(ip);
    if (result) sequentialResults.push(result);
  }
  const sequentialTime = Date.now() - sequentialStart;

  // Constructed batch lookup
  const batchStart = Date.now();
  const batchResults = await geoip.batchLookup(testIPs);
  const batchTime = Date.now() - batchStart;

  console.log(
    `Sequential lookup: ${sequentialTime}ms for ${sequentialResults.length} results`,
  );
  console.log(
    `Constructed batch lookup: ${batchTime}ms for ${batchResults?.length || 0} results`,
  );
  if (batchResults && sequentialTime > 0) {
    console.log(
      `Performance difference: ${batchTime - sequentialTime}ms (${(((batchTime - sequentialTime) / sequentialTime) * 100).toFixed(1)}% ${batchTime > sequentialTime ? "slower" : "faster"})`,
    );
  }
  console.log(
    "Note: ipapi.co doesn't have a native batch endpoint, so batch is constructed from parallel requests",
  );
} catch (error) {
  console.log("Performance test error:", (error as Error).message);
}

console.log("\nipapi.co driver examples completed!");
