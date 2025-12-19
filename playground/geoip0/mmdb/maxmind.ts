/**
 * MMDB Parser Test Suite
 * Comprehensive test for the universal MMDB parser
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { createMMDBParser } from "../../../packages/geoip0/src/mmdb";

// Define specific types for this test file
interface Names {
  readonly de?: string;
  readonly en: string;
  readonly es?: string;
  readonly fr?: string;
  readonly ja?: string;
  readonly "pt-BR"?: string;
  readonly ru?: string;
  readonly "zh-CN"?: string;
}

interface CityRecord {
  readonly confidence?: number;
  readonly geoname_id: number;
  readonly names: Names;
}

interface CountryRecord {
  readonly geoname_id: number;
  readonly is_in_european_union?: boolean;
  readonly iso_code: string;
  readonly names: Names;
  readonly confidence?: number;
}

interface LocationRecord {
  readonly accuracy_radius: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly time_zone?: string;
}

interface CityResponse {
  readonly city?: CityRecord;
  readonly country?: CountryRecord;
  readonly location?: LocationRecord;
}

async function runTests() {
  console.log("🔍 MMDB Parser Test Suite\n");

  try {
    // Load the test database
    const dbPath = join(__dirname, "GeoIP2-City-Test.mmdb");
    const buffer = await readFile(dbPath);

    // Create parser instance using new factory function
    const parser = createMMDBParser(buffer);

    console.log("✅ Database loaded successfully");

    // Get metadata
    const metadata = parser.getMetadata();
    if (!metadata) {
      throw new Error("Failed to get metadata");
    }

    console.log("📊 Database metadata:");
    console.log(JSON.stringify(metadata, null, 2));

    // Test IP lookups
    const testIPs = [
      "81.2.69.144", // London
      "175.16.199.80", // Changchun
      "128.101.101.101", // Not found
      "8.8.8.8", // Not found
      "1.1.1.1", // Not found
    ];

    console.log("\n🌐 IP lookup results:");
    for (const ip of testIPs) {
      const result = parser.getWithPrefixLength<CityResponse>(ip);
      console.log(`\n🔍 ${ip}:`);
      console.log(JSON.stringify(result, null, 2));
    }

    console.log("\n🎉 All tests completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test suite
void runTests();
