/**
 * DNS Driver Examples
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import dnsDriver from "../../../packages/unping/src/drivers/dns";

console.log("DNS Driver Examples\n");

const dns = dnsDriver({ type: "A" });
const manager = createPingManager({ driver: dns });

async function runTests() {
  console.log("=== Single DNS Lookup ===");
  const results = await manager.ping("google.com");
  console.log(
    `Host: ${results[0].host}, Alive: ${results[0].alive}, Time: ${results[0].time}ms`,
  );

  console.log("\n=== Batch DNS Lookups ===");
  const batch = await manager.ping("google.com", { count: 5, interval: 200 });
  batch.forEach((r) =>
    console.log(`  [${r.sequence}] ${r.alive ? "✓" : "✗"} ${r.time}ms`),
  );

  console.log("\nDNS driver examples completed!");
}

runTests().catch(console.error);
