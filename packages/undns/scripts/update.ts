/**
 * DNSCrypt Resolvers Update Script
 * Fetches the latest resolvers data from DNSCrypt and updates local JSON file
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ofetch } from "ofetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "src", "data");
const RESOLVERS_FILE = join(DATA_DIR, "public-resolvers.json");

/**
 * Update DNSCrypt resolvers data from official source
 */
async function updateResolversData() {
  console.log("🔄 Updating DNSCrypt resolvers data...");

  const url = "https://download.dnscrypt.info/resolvers-list/json/public-resolvers.json";

  try {
    console.log(`📥 Fetching resolvers data from ${url}...`);

    const resolvers = await ofetch(url, {
      parseResponse: JSON.parse,
      timeout: 30000,
    });

    if (!Array.isArray(resolvers)) {
      throw new Error("Invalid data format: expected array");
    }

    console.log(`📊 Retrieved ${resolvers.length} resolvers`);

    // Write to file with pretty formatting
    writeFileSync(RESOLVERS_FILE, JSON.stringify(resolvers, null, 2), "utf8");

    console.log(`✅ Successfully updated resolvers data`);
    console.log(`📁 File saved to: ${RESOLVERS_FILE}`);
    console.log(`🎯 Resolvers count: ${resolvers.length}`);
  } catch (error) {
    console.error(`❌ Failed to update resolvers data:`, String(error));
    process.exit(1);
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log("🚀 Starting DNSCrypt resolvers update...\n");

    await updateResolversData();

    console.log("\n🎉 Update completed successfully!");
  } catch (error) {
    console.error("\n❌ Update failed:", String(error));
    process.exit(1);
  }
}

// Execute the script
await main();
