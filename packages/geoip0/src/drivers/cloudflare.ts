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

// Cloudflare Radar IP Check API response interface
export interface CloudflareIPCheckResponse {
  colo?: string;
  asn?: number;
  country?: string;
  region?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
  ip_address?: string;
  ip_version?: string;
}

// Cloudflare Radar GeolocationPanel API response interface
export interface CloudflareGeoResponse {
  code?: string;
  isClientIP?: boolean;
}

// Cloudflare Radar AsPanel API response interface
export interface CloudflareAsnResponse {
  asn?: {
    name?: string;
    asn?: number;
    country?: string;
    countryName?: string;
    orgName?: string;
    source?: string;
  };
  isClientIP?: boolean;
}

// Cloudflare Driver options
export interface CloudflareOptions extends DriverOptions {
  baseUrl?: string;
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "cloudflare";

function coordinate(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function cloudflareDriver(
  options: CloudflareOptions = {},
): Driver<CloudflareOptions> {
  const baseUrl = options.baseUrl || "https://radar.cloudflare.com";
  const headers = {
    accept: "application/json, text/plain, */*",
    Referer: `${baseUrl}/`,
  };

  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const [geoResponse, asnResponse] = await Promise.all([
        ofetch<CloudflareGeoResponse>(
          `${baseUrl}/charts/GeolocationPanel/fetch?ip=${encodeURIComponent(ip)}`,
          { headers },
        ),
        ofetch<CloudflareAsnResponse>(
          `${baseUrl}/charts/AsPanel/fetch?ip=${encodeURIComponent(ip)}`,
          { headers },
        ),
      ]);

      const countryCode = geoResponse.code?.toUpperCase();
      const asn = asnResponse.asn;

      return normalizeGeoLocation(
        {
          ip,
          source: SOURCE,
          countryCode,
          country: asn?.countryName,
          city: undefined,
          latitude: undefined,
          longitude: undefined,
          isp: asn?.name,
          org: asn?.orgName || asn?.name,
          asn: asn?.asn === undefined ? undefined : asn.asn.toString(),
        },
        queryOptions,
      );
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    const version = queryOptions?.version || "auto";
    const url =
      version === "ipv4"
        ? "https://ipv4-check-perf.radar.cloudflare.com/"
        : version === "ipv6"
          ? "https://ipv6-check-perf.radar.cloudflare.com/"
          : "https://ip-check-perf.radar.cloudflare.com/";

    try {
      const data = await ofetch<CloudflareIPCheckResponse>(url);

      return normalizeGeoLocation(
        {
          ip: data.ip_address || "",
          source: SOURCE,
          countryCode: data.country?.toUpperCase(),
          region: data.region,
          city: data.city,
          latitude: coordinate(data.latitude),
          longitude: coordinate(data.longitude),
          asn: data.asn === undefined ? undefined : data.asn.toString(),
        },
        queryOptions,
      );
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
    name: "cloudflare",
    options,
    capabilities,
    lookup,
    current,
    batchLookup,
  };
}
