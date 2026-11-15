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

// ip2location.io response interface
export interface Ip2LocationResponse {
  ip?: string;
  country_code?: string;
  country_name?: string;
  region_name?: string;
  region_code?: string;
  city_name?: string;
  latitude?: number;
  longitude?: number;
  zip_code?: string;
  time_zone?: string;
  asn?: string;
  as?: string;
  is_proxy?: boolean;
}

// ip2location Driver options
export interface Ip2LocationOptions extends DriverOptions {
  /** Required ip2location.io API key. */
  key: string;
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "ip2location.io";

function convert(data: Ip2LocationResponse, queryOptions?: QueryOptions): GeoLocation | null {
  return normalizeGeoLocation(
    {
      ip: data.ip || "",
      source: SOURCE,
      country: data.country_name,
      countryCode: data.country_code,
      region: data.region_name,
      regionCode: data.region_code,
      city: data.city_name,
      latitude: data.latitude,
      longitude: data.longitude,
      isp: data.as,
      org: data.as,
      asn: data.asn,
      timezone: data.time_zone,
      isProxy: data.is_proxy,
    },
    queryOptions,
  );
}

async function request(key: string, ip: string | undefined): Promise<Ip2LocationResponse> {
  const url = new URL("https://api.ip2location.io/");
  url.searchParams.set("key", key);
  url.searchParams.set("format", "json");

  if (ip !== undefined) {
    url.searchParams.set("ip", ip);
  }

  return await ofetch<Ip2LocationResponse>(url.toString());
}

export default function ip2LocationDriver(options: Ip2LocationOptions): Driver<Ip2LocationOptions> {
  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const data = await request(options.key, ip);
      return convert(data, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const data = await request(options.key, undefined);
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
      batchSize: options.batchSize ?? 1,
      concurrency: options.concurrency ?? 2,
    });

    const batches = await mapBatches(
      ips,
      batchOptions,
      async (batch) =>
        await Promise.all(
          batch.map(async (ip) => {
            try {
              return await lookup(ip, queryOptions);
            } catch {
              return null;
            }
          }),
        ),
    );

    return batches.flat().filter((result): result is GeoLocation => result !== null);
  };

  const capabilities: DriverCapabilities = {
    lookup: true,
    current: true,
    batchLookup: true,
    nativeBatch: false,
    remote: true,
    proxyDetection: true,
  };

  return {
    name: SOURCE,
    options,
    capabilities,
    lookup,
    current,
    batchLookup,
  };
}
