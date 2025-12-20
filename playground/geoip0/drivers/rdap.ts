/**
 * RDAP Driver Examples
 * Demonstrating GeoIP lookup functionality with RDAP (Registration Data Access Protocol)
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import rdapDriver from "../../../packages/geoip0/src/drivers/rdap";
import type { QueryOptions } from "../../../packages/geoip0/src/types";

console.log("RDAP Driver Examples\n");

// Initialize RDAP driver with manager
const rdap = rdapDriver();
const geoip = createGeoIPManager({ driver: rdap });

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
    console.log(
      `Coordinates: ${result.latitude || "N/A"}, ${result.longitude || "N/A"}`,
    );
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
    console.log(
      `Coordinates: ${result.latitude || "N/A"}, ${result.longitude || "N/A"}`,
    );
    console.log(`ISP: ${result.isp || "N/A"}`);
    console.log(`Organization: ${result.org || "N/A"}`);
    console.log(`ASN: ${result.asn || "N/A"}`);
    console.log(`Source: ${result.source}`);
  } else {
    console.log("No data found for this IP");
  }
} catch (error) {
  console.log("Error:", (error as Error).message);
}

console.log("\n=== Current IP Detection ===");

// Note: RDAP driver doesn't support current IP detection
console.log("\n--- Current IP (RDAP) ---");
try {
  const result = await geoip.current();
  console.log(`IP: ${result?.ip}`);
  console.log(`Country: ${result?.country} (${result?.countryCode})`);
  console.log(`Region: ${result?.region || "N/A"}`);
  console.log(`City: ${result?.city || "N/A"}`);
  console.log(`Source: ${result?.source}`);
} catch (error) {
  console.log("Error:", (error as Error).message);
  console.log(
    "Note: RDAP driver doesn't support current IP detection - requires specific IP address",
  );
}

console.log("\n=== Configuration Examples ===");

// Custom RDAP server
console.log("\n--- Custom RDAP Server ---");
try {
  const customRdap = rdapDriver({
    baseUrl: "https://rdap.arin.net/registry",
  });
  const customGeoip = createGeoIPManager({ driver: customRdap });

  const result = await customGeoip.lookup(testIPv4);
  if (result) {
    console.log(`IP: ${result.ip}`);
    console.log(`Country: ${result.country || "N/A"}`);
    console.log(`Organization: ${result.org || "N/A"}`);
    console.log(`Source: ${result.source}`);
  } else {
    console.log("No data found from custom RDAP server");
  }
} catch (error) {
  console.log("Error:", (error as Error).message);
}

// Custom fetch options
console.log("\n--- Custom Fetch Options ---");
try {
  const customFetchRdap = rdapDriver();
  const customFetchGeoip = createGeoIPManager({ driver: customFetchRdap });

  const result = await customFetchGeoip.lookup(testIPv4);
  if (result) {
    console.log(`IP: ${result.ip}`);
    console.log(`Country: ${result.country || "N/A"}`);
    console.log(`ISP: ${result.isp || "N/A"}`);
    console.log(`Organization: ${result.org || "N/A"}`);
    console.log(`Source: ${result.source}`);
  } else {
    console.log("No data found with custom fetch options");
  }
} catch (error) {
  console.log("Error:", (error as Error).message);
}

console.log("\n=== Batch Lookup Examples ===");

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
      console.log(
        `  Country: ${result.country || "N/A"} (${result.countryCode || "N/A"})`,
      );
      console.log(`  Region: ${result.region || "N/A"}`);
      console.log(`  City: ${result.city || "N/A"}`);
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
console.log(`\n--- Batch Lookup with IPv4 Preference ---`);
try {
  const options: QueryOptions = { version: "ipv4" };
  const results = await geoip.batchLookup(testIPs, options);
  if (!results) {
    console.log("No results returned from batch lookup");
  } else {
    console.log(`Found results for ${results.length} IPs with IPv4 preference`);

    results.forEach((result, index) => {
      console.log(`[${index + 1}] ${result.ip} -> ${result.country || "N/A"}`);
    });
  }
} catch (error) {
  console.log("Batch lookup error:", (error as Error).message);
}

console.log("\nRDAP driver examples completed!");
console.log(
  "Note: RDAP provides official registry data, which focuses on network ownership rather than precise geolocation.",
);
