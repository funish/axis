/**
 * UnPing Examples - All Drivers
 */

import { createPingManager } from "../../packages/unping/src/ping";
import httpDriver from "../../packages/unping/src/drivers/http";
import tcpDriver from "../../packages/unping/src/drivers/tcp";
import dnsDriver from "../../packages/unping/src/drivers/dns";
import hybridDriver from "../../packages/unping/src/drivers/hybrid";

console.log("UnPing Examples - All Drivers\n");

async function runAllTests() {
  const host = "baidu.com";

  console.log("=== HTTP Driver ===");
  const httpMgr = createPingManager({ driver: httpDriver() });
  const httpResults = await httpMgr.ping(host);
  console.log(
    `${host}: ${httpResults[0].alive ? "✓" : "✗"} ${httpResults[0].time}ms`,
  );

  console.log("\n=== TCP Driver ===");
  const tcpMgr = createPingManager({ driver: tcpDriver() });
  const tcpResults = await tcpMgr.ping(host);
  console.log(
    `${host}: ${tcpResults[0].alive ? "✓" : "✗"} ${tcpResults[0].time}ms`,
  );

  console.log("\n=== DNS Driver ===");
  const dnsMgr = createPingManager({ driver: dnsDriver() });
  const dnsResults = await dnsMgr.ping(host);
  console.log(
    `${host}: ${dnsResults[0].alive ? "✓" : "✗"} ${dnsResults[0].time}ms`,
  );

  console.log("\n=== Hybrid Driver ===");
  const hybridMgr = createPingManager({ driver: hybridDriver() });
  const hybridResults = await hybridMgr.ping(host);
  console.log(
    `${host}: ${hybridResults[0].alive ? "✓" : "✗"} ${hybridResults[0].time}ms`,
  );

  console.log("\n✅ All driver examples completed!");
}

runAllTests().catch(console.error);
