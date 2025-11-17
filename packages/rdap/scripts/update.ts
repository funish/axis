/**
 * RDAP Bootstrap Data Update Script
 * Fetches the latest bootstrap data from IANA and updates local JSON files
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getBootstrapMetadata } from "../src/index";
import { RdapBootstrapType } from "../src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BOOTSTRAP_DIR = join(__dirname, "src", "bootstrap");

/**
 * Update bootstrap data using existing functions
 */
async function updateBootstrapData() {
  console.log("🔄 Updating RDAP bootstrap data from IANA...");

  const bootstrapTypes: RdapBootstrapType[] = [
    "asn",
    "dns",
    "ipv4",
    "ipv6",
    "object-tags",
  ];

  for (const type of bootstrapTypes) {
    try {
      console.log(`📥 Fetching ${type} data...`);

      // Use the existing getBootstrapMetadata function with fetch=true
      const metadata = await getBootstrapMetadata(type, true);

      const filePath = join(BOOTSTRAP_DIR, `${type}.json`);
      writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf8");

      console.log(`✅ Successfully updated ${type}.json`);
    } catch (error) {
      console.error(`❌ Failed to update ${type}.json:`, String(error));
      process.exit(1);
    }
  }

  console.log("🎉 All bootstrap data files updated successfully!");
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log("🚀 Starting RDAP bootstrap data update...\n");

    await updateBootstrapData();

    console.log("\n🎯 Update completed successfully!");
  } catch (error) {
    console.error("\n❌ Update failed:", String(error));
    process.exit(1);
  }
}

// Execute the script
await main();
