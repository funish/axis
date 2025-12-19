/**
 * Original mmdb-lib MaxMind Test Suite
 * Test using the original mmdb-lib library with MaxMind database
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { Reader } from "mmdb-lib";

async function runOriginalMMDBLibTest() {
  console.log("🔍 Original mmdb-lib MaxMind Test Suite\n");

  try {
    // Load the MaxMind test database
    const dbPath = join(__dirname, "GeoIP2-City-Test.mmdb");
    const buffer = await readFile(dbPath);

    console.log(`📁 Database file: ${dbPath}`);
    console.log(`📏 File size: ${buffer.length} bytes`);

    // Create reader instance using original mmdb-lib
    const reader = new Reader(buffer);
    console.log("✅ MaxMind database loaded successfully with mmdb-lib");

    // Get metadata
    const metadata = reader.metadata;
    console.log("\n📊 Database metadata:");
    console.log(JSON.stringify(metadata, null, 2));

    // Test specific IP lookups
    const testIPs = [
      "81.2.69.144", // London
      "175.16.199.80", // Changchun
      "128.101.101.101", // Not found
      "8.8.8.8", // Not found
      "1.1.1.1", // Not found
    ];

    console.log("\n🌐 IP lookup results with mmdb-lib:");
    for (const ip of testIPs) {
      console.log(`\n🔍 ${ip}:`);
      const result = reader.getWithPrefixLength(ip);
      console.log(JSON.stringify(result, null, 2));
    }

    console.log("\n🎉 Original mmdb-lib MaxMind tests completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test suite
void runOriginalMMDBLibTest();
