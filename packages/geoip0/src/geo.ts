import type { GeoIPManagerOptions } from "./types";

export function createGeoIPManager(options: GeoIPManagerOptions) {
  const driver = options.driver;

  // Core GeoIP operations
  const geoip = {
    lookup: driver.lookup || (async () => null),
    batchLookup: driver.batchLookup || (async () => null),
    current:
      driver.current ||
      (async () => {
        // Fallback: return null if current method not implemented
        return null;
      }),
  };

  return geoip;
}
