/**
 * HTTP Driver Examples
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import httpDriver from "../../../packages/unping/src/drivers/http";

console.log("HTTP Driver Examples\n");

const http = httpDriver({ method: "HEAD" });
const manager = createPingManager({ driver: http });

async function runTests() {
  console.log("=== Single Ping ===");
  const results = await manager.ping("google.com");
  console.log(
    `Host: ${results[0].host}, Alive: ${results[0].alive}, Time: ${results[0].time}ms`,
  );

  console.log("\n=== Batch Ping (4 requests) ===");
  const batch = await manager.ping("google.com", { count: 4, interval: 500 });
  batch.forEach((r) =>
    console.log(`  [${r.sequence}] ${r.alive ? "✓" : "✗"} ${r.time}ms`),
  );

  console.log("\nHTTP driver examples completed!");
}

runTests().catch(console.error);
