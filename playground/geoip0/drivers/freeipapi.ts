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

console.log("\nFree IP API driver examples completed!");
