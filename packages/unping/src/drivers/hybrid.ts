import { classifyError } from "../errors";
import { metadataFor } from "../probe";
import type { Driver, DriverOptions, PingDriver, PingOptions, PingResult } from "../types";
import dnsDriver from "./dns";
import tcpDriver from "./tcp";
import webDriver from "./web";

export interface HybridDriverOptions extends DriverOptions {
  /** Probe strategies in fallback order (default: TCP, HTTPS, DNS) */
  drivers?: Driver[];
}

interface HybridAttempt {
  driver: string;
  outcome: "success" | "target_down" | "driver_failure";
  results?: PingResult[];
  error?: unknown;
}

function driverName(driver: Driver, index: number): string {
  return driver.name ?? `driver-${index + 1}`;
}

function outcomeFor(results: PingResult[]): "success" | "target_down" {
  return results.some((result) => result.alive) ? "success" : "target_down";
}

function isDriverFailure(result: PingResult): boolean {
  return result.metadata?.driverFailure === true;
}

async function runDriver(
  driver: Driver,
  name: string,
  host: string,
  pingOptions?: PingOptions,
): Promise<HybridAttempt> {
  if (!driver.ping) {
    return {
      driver: name,
      outcome: "driver_failure",
      error: new RangeError(`Driver ${name} does not implement ping`),
    };
  }

  try {
    const results = await driver.ping(host, pingOptions);
    if (results.length === 0) {
      return {
        driver: name,
        outcome: "driver_failure",
        error: new RangeError(`Driver ${name} returned no results`),
      };
    }
    if (results.every((result) => isDriverFailure(result))) {
      return {
        driver: name,
        outcome: "driver_failure",
        results,
        error: new Error(`Driver ${name} could not execute`),
      };
    }
    return {
      driver: name,
      outcome: outcomeFor(results),
      results,
    };
  } catch (error) {
    return {
      driver: name,
      outcome: "driver_failure",
      error,
    };
  }
}

function asAttemptMetadata(attempt: HybridAttempt): Record<string, unknown> {
  const error = attempt.error;
  const errorInfo =
    error instanceof Error
      ? classifyError(error)
      : error !== undefined
        ? { message: "Unknown driver failure" }
        : undefined;

  return {
    driver: attempt.driver,
    outcome: attempt.outcome,
    results: attempt.results,
    error: errorInfo,
  };
}

/**
 * Tries each driver in order and preserves the selected driver's probe-series
 * shape. Any live result wins. Non-live results continue fallback as
 * target-down observations; exceptions and marked driver/configuration
 * failures are tracked separately and throw when no target was observed.
 */
export default function hybridDriver(
  options: HybridDriverOptions = {},
): PingDriver<HybridDriverOptions> {
  const drivers = options.drivers ?? [
    tcpDriver({ port: 80 }),
    webDriver({ https: true }),
    dnsDriver(),
  ];

  return {
    name: "hybrid",
    options,
    ping: async (host: string, pingOptions?: PingOptions): Promise<PingResult[]> => {
      if (pingOptions?.count === 0) {
        return [];
      }

      const attempts: HybridAttempt[] = [];

      for (const [index, driver] of drivers.entries()) {
        const attempt = await runDriver(driver, driverName(driver, index), host, pingOptions);
        attempts.push(attempt);

        if (attempt.outcome === "success" && attempt.results) {
          const attemptMetadata = attempts.map(asAttemptMetadata);
          return attempt.results.map((result) =>
            metadataFor(result, {
              kind: "hybrid",
              method: "hybrid-fallback",
              successfulDriver: attempt.driver,
              attempts: attemptMetadata,
            }),
          );
        }
      }

      const observed = attempts.filter(
        (attempt): attempt is HybridAttempt & { results: PingResult[] } =>
          attempt.outcome === "target_down" && attempt.results !== undefined,
      );

      if (observed.length === 0) {
        const lastError = attempts.at(-1)?.error;
        const failure =
          lastError instanceof Error
            ? lastError
            : new Error("No configured driver was able to probe the target");
        (failure as Error & { attempts?: unknown }).attempts = attempts.map(asAttemptMetadata);
        throw failure;
      }

      const selected = observed.at(-1)!;
      return selected.results.map((result) =>
        metadataFor(result, {
          kind: "hybrid",
          method: "hybrid-fallback",
          attempts: attempts.map(asAttemptMetadata),
          fallbackReasons: observed.map((attempt) => attempt.driver),
        }),
      );
    },
  };
}
