import { createDNSManager } from "undns";
import nodeDriver from "../../packages/undns/src/drivers/node";
import { groupRecordsByType, formatRecord } from "../utils";

// Create DNS manager with Node.js driver
const dns = createDNSManager({
  driver: nodeDriver({
    servers: ["8.8.8.8", "1.1.1.1"], // Use Google and Cloudflare DNS
  }),
});

async function testNodeDriver() {
  console.log("Testing Node.js DNS driver...\n");

  try {
    // Test with dns-oarc.net (has comprehensive DNS records)
    const testDomain = "dns-oarc.net";

    // Test all records
    console.log(`All records for ${testDomain}:`);
    const allRecords = await dns.getRecords(testDomain);

    // allRecords is now DNSRecord[] - array of standardized record objects
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
      `  Has MX records? ${await dns.hasRecord(testDomain, { type: "MX" })}`,
    );
    console.log(
      `  Has TXT records? ${await dns.hasRecord(testDomain, { type: "TXT" })}`,
    );

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
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the test
testNodeDriver().catch(console.error);
