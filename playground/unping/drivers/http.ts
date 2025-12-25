/**
 * HTTP Driver Examples
 * Demonstrating ping functionality using HTTP requests
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import httpDriver from "../../../packages/unping/src/drivers/http";

console.log("HTTP Driver Examples\n");

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
  const http = httpDriver({ method: "HEAD" });
  const manager = createPingManager({ driver: http });

  for (const host of testHosts) {
    try {
      const results = await manager.ping(host, { timeout: 3000 });
      printResult(results[0]);
    } catch {
      console.log(`  ${host}: Error occurred`);
    }
  }
}

async function runMethodExamples() {
  console.log("\n=== Different HTTP Methods ===\n");

  const methods = ["HEAD", "GET"] as const;

  for (const method of methods) {
    console.log(`--- Testing ${method} method ---`);
    const driver = httpDriver({ method });
    const mgr = createPingManager({ driver });

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

  const http = httpDriver({ method: "HEAD" });
  const manager = createPingManager({ driver: http });
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
  await runMethodExamples();
  await runBatchExample();

  console.log("\nHTTP driver examples completed!");
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
