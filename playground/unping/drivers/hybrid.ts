/**
 * Hybrid Driver Examples
 * Demonstrating automatic fallback functionality with multiple drivers
 */

import { createPingManager } from "../../../packages/unping/src/ping";
import hybridDriver from "../../../packages/unping/src/drivers/hybrid";
import tcpDriver from "../../../packages/unping/src/drivers/tcp";
import httpDriver from "../../../packages/unping/src/drivers/http";
import dnsDriver from "../../../packages/unping/src/drivers/dns";

console.log("Hybrid Driver Examples\n");

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
  console.log("=== Hybrid Driver Fallback Examples ===\n");

  console.log("--- Standard Configuration (TCP → HTTP → DNS) ---");
  const hybridDriverInstance = hybridDriver({
    drivers: [
      tcpDriver({ port: 443 }), // Try HTTPS first
      httpDriver({ method: "HEAD" }), // Fallback to HTTP HEAD
      dnsDriver({ type: "A" }), // Fallback to DNS
    ],
  });

  const ping = createPingManager({ driver: hybridDriverInstance });

  for (const host of testHosts) {
    try {
      const results = await ping.ping(host);
      printResult(results[0]);
    } catch (error) {
      console.log(`  ${host}: ${(error as Error).message}`);
    }
  }
}

async function runConfigurationExamples() {
  console.log("\n=== Configuration Examples ===\n");

  // Example 1: High reliability configuration
  console.log("--- High Reliability Configuration ---");
  const highReliabilityDriver = hybridDriver({
    drivers: [
      tcpDriver({ port: 443 }), // Primary - HTTPS
      tcpDriver({ port: 80 }), // Secondary - HTTP
      httpDriver({ method: "HEAD" }), // Tertiary - HTTP HEAD
      dnsDriver({ type: "A" }), // Fallback - DNS
    ],
  });

  const pingHighReliability = createPingManager({
    driver: highReliabilityDriver,
  });

  for (const host of testHosts.slice(0, 2)) {
    try {
      const results = await pingHighReliability.ping(host);
      printResult(results[0]);
    } catch (error) {
      console.log(`  ${host}: ${(error as Error).message}`);
    }
  }

  // Example 2: Minimal configuration
  console.log("\n--- Minimal Configuration (TCP + DNS) ---");
  const minimalDriver = hybridDriver({
    drivers: [tcpDriver({ port: 443 }), dnsDriver({ type: "A" })],
  });

  const pingMinimal = createPingManager({ driver: minimalDriver });

  for (const host of testHosts.slice(0, 2)) {
    try {
      const results = await pingMinimal.ping(host);
      printResult(results[0]);
    } catch (error) {
      console.log(`  ${host}: ${(error as Error).message}`);
    }
  }
}

async function runBatchExample() {
  console.log("\n=== Batch Ping with Fallback ===\n");

  const hybridDriverInstance = hybridDriver({
    drivers: [
      tcpDriver({ port: 443 }),
      httpDriver({ method: "HEAD" }),
      dnsDriver({ type: "A" }),
    ],
  });

  const ping = createPingManager({ driver: hybridDriverInstance });
  const testHost = testHosts[0];

  try {
    const results = await ping.ping(testHost, {
      count: 5,
      interval: 500,
    });

    console.log(`Total pings: ${results.length}`);
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
  await runConfigurationExamples();
  await runBatchExample();

  console.log("\nHybrid driver examples completed!");
  console.log(
    "Note: The hybrid driver automatically tries each driver in order until one succeeds.",
  );
}

runAllExamples().catch((error) => {
  console.error("Error running examples:", error);
});
