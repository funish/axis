import { createDNSManager } from "undns";
import dohDriver from "../../packages/undns/src/drivers/doh";
import { groupRecordsByType, formatRecord } from "../utils";

// Create DNS manager with DOH driver
const dns = createDNSManager({
  driver: dohDriver({
    // Use Cloudflare DOH endpoint (default)
    endpoint: "https://one.one.one.one/dns-query",
    timeout: 5000,
  }),
});

async function testDOHDriver() {
  console.log("Testing DNS over HTTPS (DOH) driver...\n");

  try {
    // Test with dns-oarc.net (has comprehensive DNS records)
    const testDomain = "dns-oarc.net";

    // Test all records
    console.log(`All records for ${testDomain}:`);
    const allRecords = await dns.getRecords(testDomain);

    console.log(`  Total records: ${allRecords.length}`);

    // Group and display records by type
    const recordGroups = groupRecordsByType(allRecords);

    Object.entries(recordGroups).forEach(([type, records]) => {
      console.log(`\n${type} records (${records.length}):`);
      records.forEach((record) => {
        console.log(`  ${formatRecord(record)}`);
      });
    });

    // Test hasRecord method
    console.log(`\nRecord existence checks for ${testDomain}:`);
    console.log(
      `  Has A records? ${await dns.hasRecord(testDomain, { type: "A" })}`,
    );
    console.log(
      `  Has AAAA records? ${await dns.hasRecord(testDomain, { type: "AAAA" })}`,
    );
    console.log(
      `  Has MX records? ${await dns.hasRecord(testDomain, { type: "MX" })}`,
    );
    console.log(
      `  Has TXT records? ${await dns.hasRecord(testDomain, { type: "TXT" })}`,
    );

    // Test specific record types
    console.log(`\nSpecific record types for ${testDomain}:`);

    // A records
    const aRecords = await dns.getRecords(testDomain, { type: "A" });
    console.log(`  A records (${aRecords.length}):`);
    aRecords.forEach((record) => {
      console.log(`    ${formatRecord(record)}`);
    });

    // MX records
    const mxRecords = await dns.getRecords(testDomain, { type: "MX" });
    console.log(`\n  MX records (${mxRecords.length}):`);
    mxRecords.forEach((record) => {
      console.log(`    ${formatRecord(record)}`);
    });

    // TXT records
    const txtRecords = await dns.getRecords(testDomain, { type: "TXT" });
    console.log(`\n  TXT records (${txtRecords.length}):`);
    txtRecords.forEach((record) => {
      console.log(`    ${formatRecord(record)}`);
    });

    // Test subdomain records
    console.log(`\nSubdomain records for www.${testDomain}:`);
    const wwwRecords = await dns.getRecords(testDomain, {
      name: "www",
      type: "A",
    });
    console.log(`  Found ${wwwRecords.length} www A records:`);
    wwwRecords.forEach((record) => {
      console.log(`    ${formatRecord(record)}`);
    });

    // Test with a domain that has SOA records
    const soaDomain = "github.com";
    const soaRecords = await dns.getRecords(soaDomain, { type: "SOA" });
    console.log(`\nSOA records for ${soaDomain} (${soaRecords.length}):`);
    soaRecords.forEach((record) => {
      console.log(`    ${formatRecord(record)}`);
    });

    // Test write operations (should fail - read-only driver)
    console.log("\nWrite operations (expected to fail):");
    try {
      await dns.setRecord(testDomain, {
        name: testDomain,
        type: "A",
        address: "192.168.1.1",
      });
    } catch (error) {
      console.log(`  setRecord: ${(error as Error).message}`);
    }

    try {
      await dns.removeRecord(testDomain, null as any);
    } catch (error) {
      console.log(`  removeRecord: ${(error as Error).message}`);
    }

    // Test with different DOH endpoint (Google DNS)
    console.log("\nTesting with Google DNS DOH endpoint...");
    const googleDns = createDNSManager({
      driver: dohDriver({
        endpoint: "https://dns.google/resolve",
        timeout: 3000,
      }),
    });

    const googleRecords = await googleDns.getRecords(testDomain, { type: "A" });
    console.log(
      `  Google DNS - A records for ${testDomain} (${googleRecords.length}):`,
    );
    googleRecords.forEach((record) => {
      console.log(`    ${formatRecord(record)}`);
    });

    // Performance comparison
    console.log("\nPerformance test (single A record query):");

    const iterations = 5;
    console.log(`  Testing ${iterations} queries to each endpoint...`);

    // Test Cloudflare
    const cloudflareStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await dns.getRecords(testDomain, { type: "A" });
    }
    const cloudflareTime = Date.now() - cloudflareStart;

    // Test Google
    const googleStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await googleDns.getRecords(testDomain, { type: "A" });
    }
    const googleTime = Date.now() - googleStart;

    console.log(
      `  Cloudflare DOH: ${cloudflareTime}ms (avg: ${cloudflareTime / iterations}ms)`,
    );
    console.log(
      `  Google DNS DOH: ${googleTime}ms (avg: ${googleTime / iterations}ms)`,
    );
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.log("\n  Request timed out. Check your network connection.");
      } else if (error.message.includes("fetch")) {
        console.log("\n  Network error. Check your internet connection.");
      }
    }
  }
}

// Run the test
console.log("== Starting DNS over HTTPS (DOH) driver test...\n");
console.log("== Testing with secure HTTPS DNS resolution\n");

testDOHDriver().catch(console.error);
