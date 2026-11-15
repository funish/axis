/**
 * ipwho.is Driver
 * Uses the documented free ipwho.is JSON endpoint. Security data is available
 * only when the caller explicitly enables the provider's paid security option.
 */

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

export interface IpWhoisConnection {
  asn?: number;
  org?: string;
  isp?: string;
  domain?: string;
}

export interface IpWhoisSecurity {
  anonymous?: boolean;
  proxy?: boolean;
  vpn?: boolean;
  tor?: boolean;
  hosting?: boolean;
  relay?: boolean;
  mobile?: boolean;
}

export interface IpWhoisResponse {
  ip?: string;
  success?: boolean;
  message?: string;
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  connection?: IpWhoisConnection;
  timezone?: {
    id?: string;
  };
  security?: IpWhoisSecurity;
}

export interface IpWhoisOptions extends DriverOptions {
  /** Base URL for the documented ipwho.is-compatible service. */
  baseUrl?: string;
  /** Enable the provider's security=1 response (paid plans). */
  security?: boolean;
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "ipwho.is";

function proxyFlag(security?: IpWhoisSecurity): boolean | undefined {
  const flags = [security?.proxy, security?.vpn, security?.tor].filter(
    (value): value is boolean => typeof value === "boolean",
  );
  return flags.length === 0 ? undefined : flags.some(Boolean);
}

function convert(data: IpWhoisResponse, queryOptions?: QueryOptions): GeoLocation | null {
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
      isp: data.connection?.isp,
      org: data.connection?.org || data.connection?.isp,
      asn: data.connection?.asn === undefined ? undefined : data.connection.asn.toString(),
      timezone: data.timezone?.id,
      isProxy: proxyFlag(data.security),
    },
    queryOptions,
  );
}

async function lookupURL(
  baseUrl: string,
  ip: string | undefined,
  options: IpWhoisOptions,
  queryOptions?: QueryOptions,
) {
  const url = new URL(ip === undefined ? baseUrl : `${baseUrl}/${encodeURIComponent(ip)}`);
  if (options.security) {
    url.searchParams.set("security", "1");
  }

  const data = await ofetch<IpWhoisResponse>(url.toString());
  if (data.success === false || !data.ip) {
    throw createProviderError(SOURCE, data.message || "Provider lookup failed");
  }

  return convert(data, queryOptions);
}

export default function ipWhoisDriver(options: IpWhoisOptions = {}): Driver<IpWhoisOptions> {
  const baseUrl = (options.baseUrl || "https://ipwho.is").replace(/\/+$/, "");

  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      return await lookupURL(baseUrl, ip, options, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    if (queryOptions?.version && queryOptions.version !== "auto") {
      throw createProviderError(
        SOURCE,
        "ipwho.is current lookup does not support version selection",
      );
    }

    try {
      return await lookupURL(baseUrl, undefined, options, queryOptions);
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
