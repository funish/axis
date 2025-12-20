/**
 * Multi Driver Examples
 * Demonstrating automatic fallback functionality with multiple drivers
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import multiDriver from "../../../packages/geoip0/src/drivers/multi";
import ipsbDriver from "../../../packages/geoip0/src/drivers/ipsb";
import freeipapiDriver from "../../../packages/geoip0/src/drivers/freeipapi";
import cloudflareDriver from "../../../packages/geoip0/src/drivers/cloudflare";

console.log("Multi Driver Examples\n");

// Test IPs (standard set used across all drivers)
const testIPv4 = "1.1.1.1"; // Cloudflare DNS
const testIPv6 = "2606:4700:4700::1111"; // Cloudflare DNS IPv6
const testIPs = [
  "1.1.1.1", // Cloudflare DNS
  "8.8.8.8", // Google DNS
  "208.67.222.222", // OpenDNS
  "9.9.9.9", // Quad9 DNS
];

async function runMultiDriverExamples() {
  console.log("=== Multi Driver Fallback Examples ===");

  // Create multi driver with automatic fallback
  const multiDriverInstance = multiDriver({
    drivers: [
      ipsbDriver(), // Try IP.SB first (comprehensive data)
      freeipapiDriver(), // Fallback to FreeIPAPI
      cloudflareDriver(), // Fallback to Cloudflare
    ],
  });

  const geoip = createGeoIPManager({ driver: multiDriverInstance });

  console.log("\n--- IPv4 Lookup (with fallback) ---");
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
    } else {
      console.log("No data found from any driver");
    }
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }

  console.log("\n--- IPv6 Lookup (with fallback) ---");
  try {
    const result = await geoip.lookup(testIPv6);
    if (result) {
      console.log(`IP: ${result.ip}`);
      console.log(`Country: ${result.country} (${result.countryCode})`);
      console.log(`Region: ${result.region || "N/A"}`);
      console.log(`City: ${result.city || "N/A"}`);
      console.log(`ISP: ${result.isp || "N/A"}`);
    } else {
      console.log("No data found from any driver");
    }
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }

  console.log("\n--- Current IP Detection (with fallback) ---");
  try {
    const result = await geoip.current();
    if (result) {
      console.log(`IP: ${result.ip}`);
      console.log(`Country: ${result.country} (${result.countryCode})`);
      console.log(`City: ${result.city || "N/A"}`);
      console.log(`ISP: ${result.isp || "N/A"}`);
    } else {
      console.log("No current IP data found from any driver");
    }
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }

  console.log("\n--- Batch Lookup (with fallback) ---");
  try {
    const results = await geoip.batchLookup(testIPs);
    if (results && results.length > 0) {
      console.log(`Found results for ${results.length} IPs:`);
      results.forEach((result, index) => {
        console.log(`\n[${index + 1}] ${result.ip}`);
        console.log(`  Country: ${result.country} (${result.countryCode})`);
        console.log(`  City: ${result.city || "N/A"}`);
        console.log(`  ISP: ${result.isp || "N/A"}`);
      });
    } else {
      console.log("No results found from any driver");
    }
  } catch (error) {
    console.log("Batch lookup error:", (error as Error).message);
  }
}

async function runConfigurationExamples() {
  console.log("\n=== Configuration Examples ===");

  // Example 1: High reliability configuration
  console.log("\n--- High Reliability Configuration ---");
  const _highReliabilityDriver = multiDriver({
    drivers: [
      ipsbDriver(), // Primary - comprehensive data
      freeipapiDriver(), // Secondary - good fallback
      cloudflareDriver(), // Tertiary - limited but fast
    ],
  });

  // Example 2: Different driver order
  console.log("\n--- Custom Driver Order ---");
  const customOrderDriver = multiDriver({
    drivers: [
      cloudflareDriver(), // Try this first (fast)
      freeipapiDriver(), // Then this (detailed)
      ipsbDriver(), // Finally this (comprehensive)
    ],
  });

  // Example 3: Minimal configuration
  console.log("\n--- Minimal Configuration ---");
  const _minimalDriver = multiDriver({
    drivers: [
      freeipapiDriver(), // Just one fallback
      cloudflareDriver(), // And another
    ],
  });

  // Test the custom order configuration
  const geoipCustom = createGeoIPManager({ driver: customOrderDriver });

  console.log("\n--- Custom Order IPv4 Lookup ---");
  try {
    const result = await geoipCustom.lookup(testIPv4);
    if (result) {
      console.log(`IP: ${result.ip}`);
      console.log(`Country: ${result.country} (${result.countryCode})`);
      console.log(`City: ${result.city || "N/A"}`);
      console.log(`ISP: ${result.isp || "N/A"}`);
    } else {
      console.log("No data found from any driver");
    }
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }
}

async function runErrorHandlingExamples() {
  console.log("\n=== Error Handling Examples ===");

  // Example: All drivers fail (simulated with invalid configuration)
  console.log("\n--- All Drivers Fallback ---");
  const failingDrivers = multiDriver({
    drivers: [
      // Note: These are real drivers, but they might fail due to network issues
      ipsbDriver(),
      freeipapiDriver(),
      cloudflareDriver(),
    ],
  });

  const geoipFailing = createGeoIPManager({ driver: failingDrivers });

  console.log("\n--- Testing with potentially failing drivers ---");
  try {
    const result = await geoipFailing.lookup("127.0.0.1"); // Local IP might not work
    if (result) {
      console.log(`Success! IP: ${result.ip}, Country: ${result.country}`);
    } else {
      console.log("All drivers returned null - this is expected for localhost");
    }
  } catch {
    console.log("No errors thrown - all failures handled gracefully");
  }
}

// Run all examples
async function runAllExamples() {
  await runMultiDriverExamples();
  await runConfigurationExamples();
  await runErrorHandlingExamples();

  console.log("\nMulti driver examples completed!");
  console.log(
    "Note: The multi driver automatically tries each driver in order until one succeeds.",
  );
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
