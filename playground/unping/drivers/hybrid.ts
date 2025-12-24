/**
 * Hybrid Driver Examples
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import hybridDriver from "../../../packages/unping/src/drivers/hybrid";
import tcpDriver from "../../../packages/unping/src/drivers/tcp";
import httpDriver from "../../../packages/unping/src/drivers/http";
import dnsDriver from "../../../packages/unping/src/drivers/dns";

console.log("Hybrid Driver Examples\n");

async function runTests() {
  console.log("=== Default Drivers ===");
  const defaultHybrid = hybridDriver();
  const defaultManager = createPingManager({ driver: defaultHybrid });

  const defaultResults = await defaultManager.ping("google.com");
  console.log(
    `Host: ${defaultResults[0].host}, Alive: ${defaultResults[0].alive}, Time: ${defaultResults[0].time}ms`,
  );

  console.log("\n=== Custom Drivers ===");
  const customHybrid = hybridDriver({
    drivers: [
      tcpDriver({ port: 443 }), // Try HTTPS first
      httpDriver({ method: "GET" }), // Then HTTP
      dnsDriver({ type: "AAAA" }), // Then IPv6 DNS
    ],
  });
  const customManager = createPingManager({ driver: customHybrid });

  const customResults = await customManager.ping("google.com");
  console.log(
    `Host: ${customResults[0].host}, Alive: ${customResults[0].alive}, Time: ${customResults[0].time}ms`,
  );

  console.log("\n=== Batch with Fallback ===");
  const batch = await defaultManager.ping("google.com", { count: 4 });
  batch.forEach((r) =>
    console.log(`  [${r.sequence}] ${r.alive ? "✓" : "✗"} ${r.time}ms`),
  );

  console.log("\nHybrid driver examples completed!");
}

runTests().catch(console.error);
