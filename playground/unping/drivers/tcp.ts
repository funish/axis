/**
 * TCP Driver Examples
 * Demonstrating ping functionality using TCP connections
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import tcpDriver from "../../../packages/unping/src/drivers/tcp";

console.log("TCP Driver Examples\n");

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
  console.log("=== Basic TCP Ping Examples ===\n");

  console.log("--- Multiple TCP Connections (port 443) ---");
  const tcp = tcpDriver({ port: 443 });
  const manager = createPingManager({ driver: tcp });

  for (const host of testHosts) {
    try {
      const results = await manager.ping(host, { timeout: 3000 });
      printResult(results[0]);
    } catch {
      console.log(`  ${host}: Error occurred`);
    }
  }
}

async function runPortExamples() {
  console.log("\n=== Different Ports Examples ===\n");

  const ports = [
    { port: 80, name: "HTTP" },
    { port: 443, name: "HTTPS" },
    { port: 22, name: "SSH" },
  ];

  for (const { port, name } of ports) {
    console.log(`--- Testing ${name} (port ${port}) ---`);
    const driver = tcpDriver({ port });
    const mgr = createPingManager({ driver });

    for (const host of testHosts.slice(0, 2)) {
      try {
        const results = await mgr.ping(host);
        const r = results[0];
        console.log(`  ${host}: ${r.alive ? "OK" : "FAIL"} ${r.time}ms`);
      } catch {
        console.log(`  ${host}: Connection refused/timeout`);
      }
    }
  }
}

async function runBatchExample() {
  console.log("\n=== Batch TCP Connections ===\n");

  const tcp = tcpDriver({ port: 443 });
  const manager = createPingManager({ driver: tcp });
  const testHost = testHosts[0];

  try {
    const results = await manager.ping(testHost, {
      count: 5,
      interval: 300,
      timeout: 5000,
    });

    console.log(`Total connections: ${results.length}`);
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
  await runPortExamples();
  await runBatchExample();

  console.log("\nTCP driver examples completed!");
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
