import { createDNSManager } from "undns";
import cloudflareDriver from "../../packages/undns/src/drivers/cloudflare";
import { groupRecordsByType, formatRecord } from "../utils";

// Create DNS manager with Cloudflare driver
// Note: You need to set up Cloudflare API credentials
const dns = createDNSManager({
  driver: cloudflareDriver({
    // Add your Cloudflare API token here
    // You can get this from: https://dash.cloudflare.com/profile/api-tokens
    // Required permissions: Zone:Read, Zone:Edit, DNS:Read, DNS:Edit
    apiToken: process.env.CLOUDFLARE_API_TOKEN || "your-api-token-here",
  }),
});

async function testCloudflareDriver() {
  console.log("Testing Cloudflare DNS driver...\n");

  try {
    // Replace with your actual domain
    const testDomain = "imst.xyz";

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
      `  Has MX records? ${await dns.hasRecord(testDomain, { type: "MX" })}`,
    );
    console.log(
      `  Has TXT records? ${await dns.hasRecord(testDomain, { type: "TXT" })}`,
    );

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

    // Test write operations (only works with valid API token and permissions)
    console.log("\nWrite operations (test with caution):");

    // Uncomment the following lines to test write operations
    try {
      console.log("Creating a new A record...");
      const newRecord = await dns.setRecord(testDomain, {
        name: "test",
        type: "A",
        address: "192.168.1.100",
        ttl: 300,
      });
      console.log(`  Created: ${newRecord.type} [ID: ${newRecord.id}]`);

      // Clean up - remove the test record
      console.log("Removing test record...");
      await dns.removeRecord(testDomain, newRecord);
      console.log("  Test record removed");
    } catch (error) {
      console.error(`  Write operation failed: ${(error as Error).message}`);
    }

    console.log(
      "\nNote: Uncomment the write operation section to test create/delete functionality",
    );
    console.log(
      "Make sure you have proper API permissions before testing write operations",
    );
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof Error) {
      if (error.message.includes("401")) {
        console.log("\nL Authentication failed. Please check:");
        console.log("   1. Your CLOUDFLARE_API_TOKEN environment variable");
        console.log(
          "   2. API token has required permissions (Zone:Read, DNS:Read)",
        );
        console.log("   3. API token is not expired");
      } else if (error.message.includes("403")) {
        console.log("\nL Permission denied. Check API token permissions.");
      } else if (error.message.includes("Zone not found")) {
        console.log(
          "\nL Zone not found. Make sure the domain exists in your Cloudflare account.",
        );
      }
    }
  }
}

// Run the test
console.log("== Starting Cloudflare DNS driver test...\n");
console.log("== Make sure to set CLOUDFLARE_API_TOKEN environment variable\n");

testCloudflareDriver().catch(console.error);
