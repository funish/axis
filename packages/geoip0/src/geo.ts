import { mapWithConcurrency } from "./batch";
import type { BatchQueryOptions, GeoLocation, GeoIPManagerOptions, QueryOptions } from "./types";

export function createGeoIPManager(options: GeoIPManagerOptions) {
  const driver = options.driver;
  const lookupSupported = driver.capabilities?.lookup !== false && Boolean(driver.lookup);
  const batchSupported = driver.capabilities?.batchLookup !== false && Boolean(driver.batchLookup);
  const currentSupported = driver.capabilities?.current !== false && Boolean(driver.current);

  // Core GeoIP operations
  const geoip = {
    lookup: lookupSupported
      ? async (ip: string, queryOptions?: QueryOptions) => await driver.lookup!(ip, queryOptions)
      : async () => null,

    batchLookup: batchSupported
      ? async (ips: string[], queryOptions?: BatchQueryOptions) =>
          await driver.batchLookup!(ips, queryOptions)
      : async (ips: string[], queryOptions?: BatchQueryOptions) => {
          // Drivers without a batch operation still get bounded request fan-out.
          return await mapWithConcurrency(ips, queryOptions?.concurrency ?? 4, async (ip) => {
            try {
              return (await driver.lookup?.(ip, queryOptions)) ?? null;
            } catch {
              return null;
            }
          }).then((results) => results.filter((result): result is GeoLocation => result !== null));
        },

    current: currentSupported
      ? async (queryOptions?: QueryOptions) => await driver.current!(queryOptions)
      : async () => null,
  };

  return geoip;
}
