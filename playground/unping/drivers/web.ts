/**
 * Web Driver Examples
 * Demonstrating ping functionality using HTTP/HTTPS requests
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import webDriver from "../../../packages/unping/src/drivers/web";

console.log("Web Driver Examples\n");

const testHosts = ["cloudflare.com", "google.com", "github.com", "example.com"];

// Helper function: Print single result
function printResult(result: { host: string; alive: boolean; time: number }) {
  console.log(
    `  ${result.host}: ${result.alive ? "OK" : "FAIL"} ${result.time}ms`,
  );
}

// Helper function: Print statistics
function printStatistics(results: Array<{ alive: boolean; time: number }>) {
  const aliveCount = results.filter((r) => r.alive).length;
  const avgTime = Math.round(
    results.reduce((sum, r) => sum + r.time, 0) / results.length,
  );
  console.log("\nStatistics:");
  console.log(`  Success rate: ${aliveCount}/${results.length}`);
  console.log(`  Average time: ${avgTime}ms`);
}

async function runBasicExamples() {
  console.log("=== Basic HTTP Ping Examples ===\n");

  console.log("--- Multiple HTTP Requests ---");
  const web = webDriver({ method: "HEAD" });
  const manager = createPingManager({ driver: web });

  for (const host of testHosts) {
    try {
      const results = await manager.ping(host, { timeout: 3000 });
      printResult(results[0]);
    } catch {
      console.log(`  ${host}: Error occurred`);
    }
  }
}

async function runProtocolExamples() {
  console.log("\n=== HTTP vs HTTPS Protocol Examples ===\n");

  // HTTP example
  console.log("--- Testing HTTP Protocol ---");
  const httpDriver = webDriver({ https: false, port: 80 });
  const httpMgr = createPingManager({ driver: httpDriver });

  for (const host of testHosts.slice(0, 2)) {
    try {
      const results = await httpMgr.ping(host);
      const r = results[0];
      console.log(`  ${host}: ${r.alive ? "OK" : "FAIL"} ${r.time}ms`);
    } catch {
      console.log(`  ${host}: Request failed`);
    }
  }

  // HTTPS example
  console.log("\n--- Testing HTTPS Protocol ---");
  const httpsDriver = webDriver({ https: true, port: 443 });
  const httpsMgr = createPingManager({ driver: httpsDriver });

  for (const host of testHosts.slice(0, 2)) {
    try {
      const results = await httpsMgr.ping(host);
      const r = results[0];
      console.log(`  ${host}: ${r.alive ? "OK" : "FAIL"} ${r.time}ms`);
    } catch {
      console.log(`  ${host}: Request failed`);
    }
  }
}

async function runMethodExamples() {
  console.log("\n=== Different HTTP Methods ===\n");

  const methods = ["HEAD", "GET"] as const;

  for (const method of methods) {
    console.log(`--- Testing ${method} method ---`);
    const driver = webDriver({ method });
    const mgr = createPingManager({ driver: driver });

    for (const host of testHosts.slice(0, 2)) {
      try {
        const results = await mgr.ping(host);
        const r = results[0];
        console.log(`  ${host}: ${r.alive ? "OK" : "FAIL"} ${r.time}ms`);
      } catch {
        console.log(`  ${host}: Request failed`);
      }
    }
  }
}

async function runBatchExample() {
  console.log("\n=== Batch HTTP Requests ===\n");

  const web = webDriver({ method: "HEAD" });
  const manager = createPingManager({ driver: web });
  const testHost = testHosts[0];

  try {
    const results = await manager.ping(testHost, {
      count: 5,
      interval: 300,
      timeout: 5000,
    });

    console.log(`Total requests: ${results.length}`);
    results.forEach((r) => {
      console.log(
        `  [${r.sequence}] ${r.host}: ${r.alive ? "OK" : "FAIL"} ${r.time}ms`,
      );
    });

    printStatistics(results);
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }
}

async function runAllExamples() {
  await runBasicExamples();
  await runProtocolExamples();
  await runMethodExamples();
  await runBatchExample();

  console.log("\nWeb driver examples completed!");
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
