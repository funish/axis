/**
 * ip2location.io Driver Examples
 * Demonstrating GeoIP lookup functionality with ip2location.io service
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import ip2LocationDriver from "../../../packages/geoip0/src/drivers/ip2Location";
import type { QueryOptions } from "../../../packages/geoip0/src/types";

console.log("ip2location.io Driver Examples\n");

// Initialize ip2location.io driver with manager
const ip2Location = ip2LocationDriver();
const geoip = createGeoIPManager({ driver: ip2Location });

// Test IPs
const testIPv4 = "8.8.8.8"; // Google DNS
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
      console.log(`  Organization: ${result.org || "N/A"}`);
      console.log(`  ASN: ${result.asn || "N/A"}`);
      console.log(`  Timezone: ${result.timezone || "N/A"}`);
      console.log(`  Source: ${result.source}`);
    });
  }
} catch (error) {
  console.log("Batch lookup error:", (error as Error).message);
}

// Test with custom API key
console.log(`\n--- Custom API Key Test ---`);
try {
  const ip2LocationCustom = ip2LocationDriver({
    key: "4BDAB89AAD40944958DA8EBDBB1CC7F1", // Same as default for testing
  });
  const geoipCustom = createGeoIPManager({ driver: ip2LocationCustom });

  const result = await geoipCustom.lookup("8.8.8.8");
  if (result) {
    console.log(`Custom API Key Result for 8.8.8.8:`);
    console.log(`  ${result.city}, ${result.region}, ${result.country}`);
  } else {
    console.log("No data found with custom API key");
  }
} catch (error) {
  console.log("Custom API key test error:", (error as Error).message);
}

// Performance test
console.log(`\n--- Performance Test (Constructed Batch) ---`);
try {
  // Sequential lookup
  const sequentialStart = Date.now();
  const sequentialResults = [];
  for (const ip of testIPs.slice(0, 2)) {
    // Test with fewer IPs to avoid rate limiting
    const result = await geoip.lookup(ip);
    if (result) sequentialResults.push(result);
  }
  const sequentialTime = Date.now() - sequentialStart;

  // Constructed batch lookup
  const batchStart = Date.now();
  const batchResults = await geoip.batchLookup(testIPs.slice(0, 2));
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
    "Note: ip2location.io doesn't have a native batch endpoint, so batch is constructed from parallel requests",
  );
} catch (error) {
  console.log("Performance test error:", (error as Error).message);
}

console.log("\nip2location.io driver examples completed!");
