import { ofetch } from "ofetch";

import type {
  BatchQueryOptions,
  Driver,
  DriverCapabilities,
  DriverOptions,
  GeoLocation,
  QueryOptions,
} from "..";
import { mapBatches, resolveBatchOptions } from "../batch";
import { createProviderError } from "../errors";
import { normalizeGeoLocation } from "../normalize";

// Free IP API response interface
export interface FreeIPAPIResponse {
  ipVersion?: number;
  ipAddress?: string;
  latitude?: number;
  longitude?: number;
  countryName?: string;
  countryCode?: string;
  capital?: string;
  phoneCodes?: number[];
  timeZones?: string[];
  zipCode?: string;
  cityName?: string;
  regionName?: string;
  regionCode?: string;
  continent?: string;
  continentCode?: string;
  currencies?: string[];
  languages?: string[];
  asn?: string;
  asnOrganization?: string;
  isProxy?: boolean;
}

// Free IP API Bulk response interface
export interface FreeIPAPIBulkResponse {
  [ip: string]: FreeIPAPIResponse;
}

// Free IP API Driver options
export interface FreeIPAPIOptions extends DriverOptions {
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "freeipapi";

function convert(data: FreeIPAPIResponse, queryOptions?: QueryOptions): GeoLocation | null {
  return normalizeGeoLocation(
    {
      ip: data.ipAddress || "",
      source: SOURCE,
      country: data.countryName,
      countryCode: data.countryCode,
      region: data.regionName,
      regionCode: data.regionCode,
      city: data.cityName,
      latitude: data.latitude,
      longitude: data.longitude,
      isp: data.asnOrganization,
      org: data.asnOrganization,
      asn: data.asn,
      timezone: data.timeZones?.[0],
      isProxy: data.isProxy,
    },
    queryOptions,
  );
}

export default function freeipapiDriver(options: FreeIPAPIOptions = {}): Driver<FreeIPAPIOptions> {
  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const data = await ofetch<FreeIPAPIResponse>(
        `https://freeipapi.com/api/json/${encodeURIComponent(ip)}`,
      );
      return convert(data, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    // The free service detects the caller IP and has no separate version-specific
    // current-IP endpoint.
    try {
      const data = await ofetch<FreeIPAPIResponse>("https://freeipapi.com/api/json");
      return convert(data, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: BatchQueryOptions,
  ): Promise<GeoLocation[]> => {
    const batchOptions = resolveBatchOptions(queryOptions, {
      batchSize: options.batchSize ?? 100,
      concurrency: options.concurrency ?? 2,
    });

    const batches = await mapBatches(ips, batchOptions, async (batch) => {
      try {
        const response = await ofetch<FreeIPAPIBulkResponse>(
          "https://freeipapi.com/api/bulk/json",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ips: batch }),
          },
        );

        return batch
          .map((ip) => response[ip])
          .filter((data): data is FreeIPAPIResponse => Boolean(data?.ipAddress))
          .map((data) => convert(data, queryOptions))
          .filter((result): result is GeoLocation => result !== null);
      } catch (error) {
        throw createProviderError(SOURCE, error);
      }
    });

    return batches.flat();
  };

  const capabilities: DriverCapabilities = {
    lookup: true,
    current: true,
    batchLookup: true,
    nativeBatch: true,
    remote: true,
    proxyDetection: true,
  };

  return {
    name: "freeipapi",
    options,
    capabilities,
    lookup,
    current,
    batchLookup,
  };
}
