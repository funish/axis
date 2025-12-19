/**
 * MaxMind Driver Examples
 * Demonstrating GeoIP lookup functionality with MaxMind services
 * Both MMDB database and Web Service modes
 */

import { createGeoIPManager } from "../../../packages/geoip0/src/geo";
import maxmindDriver, {
  type MaxMindMMDBOptions,
  type MaxMindWebOptions,
} from "../../../packages/geoip0/src/drivers/maxmind";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { QueryOptions } from "../../../packages/geoip0/src/types";

console.log("MaxMind Driver Examples\n");

async function runExamples() {
  try {
    // Load MMDB test database
    const mmdbData = await readFile(
      resolve(__dirname, "../mmdb/GeoIP2-City-Test.mmdb"),
    );

    console.log("=== MMDB Database Mode ===");

    // Initialize MaxMind driver with MMDB database
    const mmdbOptions: MaxMindMMDBOptions = {
      mode: "mmdb",
      data: mmdbData,
    };

    const mmdbDriver = maxmindDriver(mmdbOptions);
    const geoipMMDB = createGeoIPManager({ driver: mmdbDriver });

    // Test IPs (standard set used across all drivers)
    const testIPv4 = "1.1.1.1"; // Cloudflare DNS
    const testIPv6 = "2606:4700:4700::1111"; // Cloudflare DNS IPv6

    // First test some known IPs from the test database
    const knownTestIPs = ["81.2.69.142", "80.24.24.32"]; // Known IPs in test database

    console.log("\n--- Known IPs from Test Database ---");
    for (const ip of knownTestIPs) {
      console.log(`\n[${ip}]`);
      try {
        const result = await geoipMMDB.lookup(ip);
        if (result) {
          console.log(`  IP: ${result.ip}`);
          console.log(`  Country: ${result.country} (${result.countryCode})`);
          console.log(`  Region: ${result.region || "N/A"}`);
          console.log(`  City: ${result.city || "N/A"}`);
          console.log(`  Coordinates: ${result.latitude}, ${result.longitude}`);
          console.log(`  Timezone: ${result.timezone || "N/A"}`);
          console.log(`  Source: ${result.source}`);
        } else {
          console.log("  No data found for this IP");
        }
      } catch (error) {
        console.log("  Error:", (error as Error).message);
      }
    }

    console.log("\n--- IPv4 Lookup (Standard Test IP) ---");
    try {
      const result = await geoipMMDB.lookup(testIPv4);
      if (result) {
        console.log(`IP: ${result.ip}`);
        console.log(`Country: ${result.country} (${result.countryCode})`);
        console.log(`Region: ${result.region || "N/A"}`);
        console.log(`City: ${result.city || "N/A"}`);
        console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
        console.log(`Timezone: ${result.timezone || "N/A"}`);
        console.log(`Source: ${result.source}`);
      } else {
        console.log("No data found for this IP (not in test database)");
      }
    } catch (error) {
      console.log("Error:", (error as Error).message);
    }

    console.log("\n--- IPv6 Lookup ---");
    try {
      const result = await geoipMMDB.lookup(testIPv6);
      if (result) {
        console.log(`IP: ${result.ip}`);
        console.log(`Country: ${result.country} (${result.countryCode})`);
        console.log(`Region: ${result.region || "N/A"}`);
        console.log(`City: ${result.city || "N/A"}`);
        console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
        console.log(`Timezone: ${result.timezone || "N/A"}`);
        console.log(`Source: ${result.source}`);
      } else {
        console.log("No data found for this IPv6 address");
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
        const result = await geoipMMDB.current(options);
        if (result) {
          console.log(`IP: ${result.ip}`);
          console.log(`Country: ${result.country} (${result.countryCode})`);
          console.log(`Region: ${result.region || "N/A"}`);
          console.log(`City: ${result.city || "N/A"}`);
          console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
          console.log(`Timezone: ${result.timezone || "N/A"}`);
          console.log(`Source: ${result.source}`);
        } else {
          console.log("MMDB mode does not support current IP detection");
        }
      } catch (error) {
        console.log("Error:", (error as Error).message);
      }
    }

    console.log("\n=== Batch Lookup Examples ===");

    // Batch lookup with multiple IPs (standard set used across all drivers)
    const testIPs = [
      "1.1.1.1", // Cloudflare DNS
      "8.8.8.8", // Google DNS
      "208.67.222.222", // OpenDNS
      "9.9.9.9", // Quad9 DNS
    ];

    console.log(`\n--- Batch Lookup (${testIPs.length} IPs) ---`);
    try {
      const results = await geoipMMDB.batchLookup(testIPs);
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
          console.log(`  Timezone: ${result.timezone || "N/A"}`);
          console.log(`  Source: ${result.source}`);
        });
      }
    } catch (error) {
      console.log("Batch lookup error:", (error as Error).message);
    }

    console.log("\n=== Web Service Mode ===");

    // Initialize MaxMind driver with Web Service (using demo credentials)
    const webOptions: MaxMindWebOptions = {
      mode: "web",
      accountId: "123456", // Demo account ID
      licenseKey: "demo_key", // Demo license key
      service: "city",
      fallbackData: mmdbData, // Fallback to MMDB if web service fails
    };

    const webDriver = maxmindDriver(webOptions);
    const geoipWeb = createGeoIPManager({ driver: webDriver });

    console.log("\n--- Web Service IPv4 Lookup ---");
    try {
      const result = await geoipWeb.lookup(testIPv4);
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
        console.log("No data found for this IP (likely using fallback MMDB)");
      }
    } catch (error) {
      console.log("Error:", (error as Error).message);
    }

    console.log("\n--- Web Service IPv6 Lookup ---");
    try {
      const result = await geoipWeb.lookup(testIPv6);
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
        console.log(
          "No data found for this IPv6 address (likely using fallback MMDB)",
        );
      }
    } catch (error) {
      console.log("Error:", (error as Error).message);
    }

    console.log("\n--- Web Service Current IP Detection ---");
    try {
      const result = await geoipWeb.current();
      if (result) {
        console.log(`IP: ${result.ip}`);
        console.log(`Country: ${result.country} (${result.countryCode})`);
        console.log(`Region: ${result.region || "N/A"}`);
        console.log(`City: ${result.city || "N/A"}`);
        console.log(`Coordinates: ${result.latitude}, ${result.longitude}`);
        console.log(`ISP: ${result.isp || "N/A"}`);
        console.log(`Source: ${result.source}`);
      } else {
        console.log("No data found for current IP");
      }
    } catch (error) {
      console.log("Error:", (error as Error).message);
    }

    console.log("\n--- Web Service Batch Lookup ---");
    try {
      const results = await geoipWeb.batchLookup(testIPs);
      if (results && results.length > 0) {
        console.log(`Found results for ${results.length} IPs:`);
        results.forEach((result, index) => {
          console.log(`\n[${index + 1}] ${result.ip}`);
          console.log(`  Country: ${result.country} (${result.countryCode})`);
          console.log(`  City: ${result.city || "N/A"}`);
          console.log(`  ISP: ${result.isp || "N/A"}`);
          console.log(`  Source: ${result.source}`);
        });
      } else {
        console.log("No results returned from batch lookup");
      }
    } catch (error) {
      console.log("Batch lookup error:", (error as Error).message);
    }

    console.log("\n=== Different Web Service Types ===");

    // Test different MaxMind web services
    const services: Array<MaxMindWebOptions["service"]> = [
      "country",
      "city",
      "insights",
    ];

    for (const service of services) {
      console.log(`\n--- ${service?.toUpperCase()} Service ---`);
      try {
        const serviceDriver = maxmindDriver({
          mode: "web",
          accountId: "123456",
          licenseKey: "demo_key",
          service,
          fallbackData: mmdbData,
        });
        const geoipService = createGeoIPManager({ driver: serviceDriver });

        const result = await geoipService.lookup("1.1.1.1");
        if (result) {
          console.log(`  Service: ${service}`);
          console.log(`  Country: ${result.country} (${result.countryCode})`);
          console.log(`  City: ${result.city || "N/A"}`);
          console.log(`  Source: ${result.source}`);
        } else {
          console.log(`  No data from ${service} service (using fallback)`);
        }
      } catch (error) {
        console.log(
          `  Error with ${service} service:`,
          (error as Error).message,
        );
      }
    }

    console.log("\nMaxMind driver examples completed!");
  } catch (error) {
    console.error("Failed to load MMDB database:", error);
    console.log("Make sure GeoIP2-City-Test.mmdb exists in the mmdb directory");
  }
}

// Run all examples
runExamples().catch((error) => {
  console.error("Error running examples:", error);
});
