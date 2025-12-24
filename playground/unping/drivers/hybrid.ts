/**
 * Hybrid Driver Examples
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import hybridDriver from "../../../packages/unping/src/drivers/hybrid";

console.log("Hybrid Driver Examples\n");

const hybrid = hybridDriver();
const manager = createPingManager({ driver: hybrid });

async function runTests() {
  console.log("=== Automatic Driver Selection ===");
  const results = await manager.ping("google.com");
  console.log(
    `Host: ${results[0].host}, Alive: ${results[0].alive}, Time: ${results[0].time}ms`,
  );

  console.log("\n=== Batch with Fallback ===");
  const batch = await manager.ping("google.com", { count: 4 });
  batch.forEach((r) =>
    console.log(`  [${r.sequence}] ${r.alive ? "✓" : "✗"} ${r.time}ms`),
  );

  console.log("\nHybrid driver examples completed!");
}

runTests().catch(console.error);
