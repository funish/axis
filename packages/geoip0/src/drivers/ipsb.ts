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

// IP.SB API response interface
export interface IPSBResponse {
  ip?: string;
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  organization?: string;
  asn_organization?: string;
  timezone?: string;
  asn?: number;
}

// IP.SB Driver options
export interface IPSBOptions extends DriverOptions {
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "ip.sb";

function convert(data: IPSBResponse, queryOptions?: QueryOptions): GeoLocation | null {
  return normalizeGeoLocation(
    {
      ip: data.ip || "",
      source: SOURCE,
      country: data.country,
      countryCode: data.country_code,
      region: data.region,
      regionCode: data.region_code,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
      isp: data.isp,
      org: data.organization || data.asn_organization,
      asn: data.asn === undefined ? undefined : data.asn.toString(),
      timezone: data.timezone,
    },
    queryOptions,
  );
}

async function lookupURL(url: string, ip: string | undefined, queryOptions?: QueryOptions) {
  const path = ip === undefined ? "geoip" : `geoip/${encodeURIComponent(ip)}`;
  const data = await ofetch<IPSBResponse>(`${url}/${path}`);

  if (!data.ip) {
    throw createProviderError(SOURCE, "Provider returned no IP address");
  }

  return convert(data, queryOptions);
}

export default function ipsbDriver(options: IPSBOptions = {}): Driver<IPSBOptions> {
  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      return await lookupURL("https://api.ip.sb", ip, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    const version = queryOptions?.version || "auto";
    const url =
      version === "ipv4"
        ? "https://api-ipv4.ip.sb"
        : version === "ipv6"
          ? "https://api-ipv6.ip.sb"
          : "https://api.ip.sb";

    try {
      return await lookupURL(url, undefined, queryOptions);
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
    proxyDetection: false,
  };

  return {
    name: "ipsb",
    options,
    capabilities,
    lookup,
    current,
    batchLookup,
  };
}
