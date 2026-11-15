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

// ipapi.co response interface
export interface IpapiCoResponse {
  ip?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country?: string;
  country_name?: string;
  country_code?: string;
  country_code_iso3?: string;
  country_capital?: string;
  continent_code?: string;
  in_eu?: boolean;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset?: string;
  country_calling_code?: string;
  currency?: string;
  currency_name?: string;
  languages?: string;
  country_area?: number;
  country_population?: number;
  asn?: string;
  org?: string;
}

// ipapi.co Driver options
export interface IpapiCoOptions extends DriverOptions {
  /**
   * Specify response fields to reduce bandwidth
   */
  fields?: string;
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "ipapi.co";

function convert(data: IpapiCoResponse, queryOptions?: QueryOptions): GeoLocation | null {
  return normalizeGeoLocation(
    {
      ip: data.ip || "",
      source: SOURCE,
      country: data.country_name || data.country,
      countryCode: data.country_code,
      region: data.region,
      regionCode: data.region_code,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
      isp: data.org,
      org: data.org,
      asn: data.asn,
      timezone: data.timezone,
    },
    queryOptions,
  );
}

async function lookup(
  ip: string | undefined,
  options: IpapiCoOptions,
  queryOptions?: QueryOptions,
) {
  const encodedIP = ip === undefined ? undefined : encodeURIComponent(ip);
  const suffix = options.fields
    ? encodedIP
      ? `${encodedIP}/${encodeURIComponent(options.fields)}/`
      : `${encodeURIComponent(options.fields)}/`
    : encodedIP
      ? `${encodedIP}/json/`
      : "json/";
  const data = await ofetch<IpapiCoResponse>(`https://ipapi.co/${suffix}`);

  if (!data.ip) {
    throw createProviderError(SOURCE, "Provider returned no IP address");
  }

  return convert(data, queryOptions);
}

export default function ipapiCoDriver(options: IpapiCoOptions = {}): Driver<IpapiCoOptions> {
  const lookupIP = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      return await lookup(ip, options, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      return await lookup(undefined, options, queryOptions);
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
      concurrency: options.concurrency ?? 3,
    });

    const batches = await mapBatches(
      ips,
      batchOptions,
      async (batch) =>
        await Promise.all(
          batch.map(async (ip) => {
            try {
              return await lookupIP(ip, queryOptions);
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
    proxyDetection: false,
  };

  return {
    name: SOURCE,
    options,
    capabilities,
    lookup: lookupIP,
    current,
    batchLookup,
  };
}
