import type {
  BatchQueryOptions,
  Driver,
  DriverCapabilities,
  DriverOptions,
  GeoLocation,
  QueryOptions,
} from "..";
import { mapWithConcurrency } from "../batch";
import { createProviderError } from "../errors";
import { hasGeoLocationData } from "../normalize";

export interface HybridFallbackOptions {
  /**
   * Try later providers when a provider succeeds without usable data.
   * Set to false to accept an authoritative empty/sparse result.
   */
  missingData?: boolean;

  /**
   * Try later providers when a provider throws. Set to false to surface the
   * provider failure instead of hiding it as an ordinary empty result.
   */
  providerError?: boolean;
}

export interface HybridDriverOptions extends DriverOptions {
  drivers: Driver<any>[];
  fallbackOn?: HybridFallbackOptions;
}

function isSupported(driver: Driver<any>, operation: "lookup" | "current" | "batchLookup") {
  return Boolean(driver[operation]) && driver.capabilities?.[operation] !== false;
}

export default function hybridDriver(options: HybridDriverOptions): Driver<HybridDriverOptions> {
  const { drivers, fallbackOn } = options;
  const fallbackOnMissingData = fallbackOn?.missingData ?? true;
  const fallbackOnProviderError = fallbackOn?.providerError ?? true;

  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    let providerError: unknown;

    for (const driver of drivers) {
      if (!isSupported(driver, "lookup")) {
        continue;
      }

      try {
        const result = await driver.lookup?.(ip, queryOptions);
        if (result && hasGeoLocationData(result)) {
          return result;
        }

        if (!fallbackOnMissingData) {
          return result ?? null;
        }
      } catch (error) {
        providerError = error;
        if (!fallbackOnProviderError) {
          throw createProviderError(driver.name || "provider", error);
        }
      }
    }

    if (!fallbackOnProviderError && providerError !== undefined) {
      throw createProviderError("hybrid", providerError);
    }

    return null;
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    let providerError: unknown;

    for (const driver of drivers) {
      if (!isSupported(driver, "current")) {
        continue;
      }

      try {
        const result = await driver.current?.(queryOptions);
        if (result && hasGeoLocationData(result)) {
          return result;
        }

        if (!fallbackOnMissingData) {
          return result ?? null;
        }
      } catch (error) {
        providerError = error;
        if (!fallbackOnProviderError) {
          throw createProviderError(driver.name || "provider", error);
        }
      }
    }

    if (!fallbackOnProviderError && providerError !== undefined) {
      throw createProviderError("hybrid", providerError);
    }

    return null;
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: BatchQueryOptions,
  ): Promise<GeoLocation[]> => {
    if (ips.length === 0) {
      return [];
    }

    const requested = new Set(ips);
    const resultsByIP = new Map<string, GeoLocation>();
    let providerError: unknown;

    const pendingIPs = () => ips.filter((ip) => !resultsByIP.has(ip));

    for (const driver of drivers) {
      if (!isSupported(driver, "batchLookup") && !isSupported(driver, "lookup")) {
        continue;
      }

      const pending = pendingIPs();
      if (pending.length === 0) {
        break;
      }

      try {
        const results = isSupported(driver, "batchLookup")
          ? await driver.batchLookup?.(pending, queryOptions)
          : await mapWithConcurrency(
              pending,
              queryOptions?.concurrency ?? 4,
              async (ip) => await driver.lookup?.(ip, queryOptions),
            );
        for (const candidate of results || []) {
          if (
            !candidate ||
            !hasGeoLocationData(candidate) ||
            !requested.has(candidate.ip) ||
            resultsByIP.has(candidate.ip)
          ) {
            continue;
          }
          resultsByIP.set(candidate.ip, candidate);
        }

        if (pendingIPs().length === 0 || !fallbackOnMissingData) {
          break;
        }
      } catch (error) {
        providerError = error;
        if (!fallbackOnProviderError) {
          throw createProviderError(driver.name || "provider", error);
        }
      }
    }

    if (!fallbackOnProviderError && providerError !== undefined) {
      throw createProviderError("hybrid", providerError);
    }

    return pendingIPs().length === 0
      ? ips.map((ip) => resultsByIP.get(ip)!)
      : ips.filter((ip) => resultsByIP.has(ip)).map((ip) => resultsByIP.get(ip)!);
  };

  const capabilities: DriverCapabilities = {
    lookup: drivers.some((driver) => isSupported(driver, "lookup")),
    current: drivers.some((driver) => isSupported(driver, "current")),
    batchLookup: drivers.some(
      (driver) => isSupported(driver, "batchLookup") || isSupported(driver, "lookup"),
    ),
    nativeBatch: drivers.some(
      (driver) => isSupported(driver, "batchLookup") && driver.capabilities?.nativeBatch === true,
    ),
    remote: drivers.some((driver) => driver.capabilities?.remote === true),
    proxyDetection: drivers.some((driver) => driver.capabilities?.proxyDetection === true),
  };

  return {
    name: "hybrid",
    options,
    capabilities,
    lookup,
    current,
    batchLookup,
  };
}
