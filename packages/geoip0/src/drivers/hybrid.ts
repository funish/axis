/**
 * Hybrid Driver
 * Combines multiple drivers with automatic fallback support
 */

import type { Driver, GeoLocation, QueryOptions, DriverOptions } from "..";

export interface HybridDriverOptions extends DriverOptions {
  drivers: Driver<any>[];
}

export default function hybridDriver(
  options: HybridDriverOptions,
): Driver<HybridDriverOptions> {
  const { drivers } = options;

  const lookup = async (
    ip: string,
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    for (const driver of drivers) {
      try {
        const result = await driver.lookup?.(ip, queryOptions);
        if (result) {
          return result;
        }
      } catch {
        // Continue to next driver
        continue;
      }
    }
    return null;
  };

  const current = async (
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    for (const driver of drivers) {
      try {
        const result = await driver.current?.(queryOptions);
        if (result) {
          return result;
        }
      } catch {
        // Continue to next driver
        continue;
      }
    }
    return null;
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation[]> => {
    for (const driver of drivers) {
      try {
        const results = await driver.batchLookup?.(ips, queryOptions);
        if (results && results.length > 0) {
          return results;
        }
      } catch {
        // Continue to next driver
        continue;
      }
    }
    return [];
  };

  return {
    name: "hybrid",
    options,
    lookup,
    current,
    batchLookup,
  };
}
