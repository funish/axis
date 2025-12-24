/**
 * TCP Driver Examples
 * Demonstrating ping functionality using TCP connections
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import tcpDriver from "../../../packages/unping/src/drivers/tcp";

console.log("TCP Driver Examples\n");

const tcp = tcpDriver({ port: 80 });
const manager = createPingManager({ driver: tcp });

const testHosts = ["google.com", "github.com", "cloudflare.com", "example.com"];

async function runBasicExamples() {
  console.log("=== Basic TCP Ping Examples ===\n");

  console.log("--- Single TCP Connection Test ---");
  try {
    const results = await manager.ping("google.com");
    console.log(`Host: ${results[0].host}`);
    console.log(`Alive: ${results[0].alive}`);
    console.log(`Time: ${results[0].time}ms`);
  } catch {
    console.log("Error occurred");
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
    try {
      const driver = tcpDriver({ port });
      const mgr = createPingManager({ driver });
      const results = await mgr.ping("google.com");
      console.log(
        `  ${name}: ${results[0].alive ? "✓" : "✗"} ${results[0].time}ms`,
      );
    } catch {
      console.log(`  ${name}: Connection refused/timeout`);
    }
  }
}

async function runBatchExamples() {
  console.log("\n=== Batch TCP Ping Examples ===\n");

  console.log("--- Multiple TCP Connections ---");
  try {
    const results = await manager.ping("google.com", {
      count: 5,
      interval: 300,
      timeout: 5000,
    });

    console.log(`Total connections: ${results.length}`);
    results.forEach((r) => {
      console.log(
        `  [${r.sequence}] ${r.host}: ${r.alive ? "✓" : "✗"} ${r.time}ms`,
      );
    });

    const aliveCount = results.filter((r) => r.alive).length;
    const avgTime = Math.round(
      results.reduce((sum, r) => sum + r.time, 0) / results.length,
    );
    console.log(`\nStatistics:`);
    console.log(`  Success rate: ${aliveCount}/${results.length}`);
    console.log(`  Average time: ${avgTime}ms`);
  } catch (error) {
    console.log("Error:", (error as Error).message);
  }
}

async function runMultipleHostsExamples() {
  console.log("\n=== Multiple Hosts Examples ===\n");

  console.log("--- Testing Multiple Hosts on Port 80 ---");
  for (const host of testHosts) {
    try {
      const results = await manager.ping(host, { timeout: 3000 });
      console.log(
        `${host}: ${results[0].alive ? "✓" : "✗"} ${results[0].time}ms`,
      );
    } catch {
      console.log(`${host}: Error occurred`);
    }
  }

  console.log("\n--- Testing HTTPS Port (443) ---");
  for (const host of testHosts.slice(0, 3)) {
    try {
      const driver443 = tcpDriver({ port: 443 });
      const mgr443 = createPingManager({ driver: driver443 });
      const results = await mgr443.ping(host);
      console.log(
        `${host}:443 - ${results[0].alive ? "✓" : "✗"} ${results[0].time}ms`,
      );
    } catch {
      console.log(`${host}:443 - Error`);
    }
  }
}

async function runTimeoutExamples() {
  console.log("\n=== Timeout Configuration Examples ===\n");

  const timeouts = [1000, 3000, 5000];

  console.log("--- Testing Different Timeouts ---");
  for (const timeout of timeouts) {
    try {
      const results = await manager.ping("example.com", { timeout });
      console.log(
        `Timeout ${timeout}ms: ${results[0].alive ? "✓" : "✗"} ${results[0].time}ms`,
      );
    } catch {
      console.log(`Timeout ${timeout}ms: Error`);
    }
  }
}

async function runComparisonExamples() {
  console.log("\n=== Comparison Examples ===\n");

  console.log("--- Comparing Different Ports on Same Host ---");
  const host = "google.com";
  const ports = [80, 443, 8080];

  for (const port of ports) {
    try {
      const driver = tcpDriver({ port });
      const mgr = createPingManager({ driver });
      const results = await mgr.ping(host);
      console.log(
        `  Port ${port}: ${results[0].alive ? "✓" : "✗"} ${results[0].time}ms`,
      );
    } catch {
      console.log(`  Port ${port}: Connection failed`);
    }
  }
}

async function runAllExamples() {
  await runBasicExamples();
  await runPortExamples();
  await runBatchExamples();
  await runMultipleHostsExamples();
  await runTimeoutExamples();
  await runComparisonExamples();

  console.log("\nTCP driver examples completed!");
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
