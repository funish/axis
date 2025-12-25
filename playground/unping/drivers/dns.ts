/**
 * DNS Driver Examples
 * Demonstrating ping functionality using DNS resolution
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import dnsDriver from "../../../packages/unping/src/drivers/dns";

console.log("DNS Driver Examples\n");

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
  console.log("=== Basic DNS Ping Examples ===\n");

  console.log("--- Multiple DNS Lookups ---");
  const dns = dnsDriver({ type: "A" });
  const manager = createPingManager({ driver: dns });

  for (const host of testHosts) {
    try {
      const results = await manager.ping(host, { timeout: 3000 });
      printResult(results[0]);
    } catch {
      console.log(`  ${host}: Error occurred`);
    }
  }
}

async function runRecordTypeExamples() {
  console.log("\n=== Different DNS Record Types ===\n");

  const recordTypes = ["A", "AAAA", "CNAME"] as const;

  for (const type of recordTypes) {
    console.log(`--- Testing ${type} record lookup ---`);
    const driver = dnsDriver({ type });
    const mgr = createPingManager({ driver });

    for (const host of testHosts.slice(0, 2)) {
      try {
        const results = await mgr.ping(host);
        const r = results[0];
        console.log(`  ${host}: ${r.alive ? "OK" : "FAIL"} ${r.time}ms`);
      } catch {
        console.log(`  ${host}: Lookup failed`);
      }
    }
  }
}

async function runBatchExample() {
  console.log("\n=== Batch DNS Lookups ===\n");

  const dns = dnsDriver({ type: "A" });
  const manager = createPingManager({ driver: dns });
  const testHost = testHosts[0];

  try {
    const results = await manager.ping(testHost, {
      count: 5,
      interval: 300,
      timeout: 5000,
    });

    console.log(`Total lookups: ${results.length}`);
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
  await runRecordTypeExamples();
  await runBatchExample();

  console.log("\nDNS driver examples completed!");
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
