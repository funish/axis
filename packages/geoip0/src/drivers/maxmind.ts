/**
 * MaxMind Driver
 * Unified driver for MaxMind GeoIP services (MMDB database and Web Service)
 */

import { ofetch } from "ofetch";
import type { DataType } from "undio";

import type { Driver, DriverCapabilities, GeoLocation, QueryOptions } from "..";
import { mapBatches, mapWithConcurrency, resolveBatchOptions } from "../batch";
import { createProviderError } from "../errors";
import { createMMDBParser } from "../mmdb";
import { normalizeGeoLocation } from "../normalize";

export type MaxMindMode = "mmdb" | "web";

export interface MaxMindNames {
  readonly de?: string;
  readonly en?: string;
  readonly es?: string;
  readonly fr?: string;
  readonly ja?: string;
  readonly "pt-BR"?: string;
  readonly ru?: string;
  readonly "zh-CN"?: string;
}

export interface MaxMindCityRecord {
  readonly geoname_id?: number;
  readonly names?: MaxMindNames;
}

export interface MaxMindCountryRecord {
  readonly geoname_id?: number;
  readonly iso_code?: string;
  readonly names?: MaxMindNames;
}

export interface MaxMindLocationRecord {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly time_zone?: string;
  readonly accuracy_radius?: number;
}

export interface MaxMindSubdivisionRecord {
  readonly geoname_id?: number;
  readonly iso_code?: string;
  readonly names?: MaxMindNames;
}

export interface MaxMindTraits {
  readonly autonomous_system_number?: number;
  readonly autonomous_system_organization?: string;
  readonly isp?: string;
  readonly organization?: string;
  readonly is_anonymous_proxy?: boolean;
  readonly is_anonymous_vpn?: boolean;
  readonly is_hosting_provider?: boolean;
  readonly is_public_proxy?: boolean;
  readonly is_tor_exit_node?: boolean;
}

export interface MaxMindData {
  city?: MaxMindCityRecord;
  country?: MaxMindCountryRecord;
  continent?: MaxMindCountryRecord;
  location?: MaxMindLocationRecord;
  subdivisions?: MaxMindSubdivisionRecord[];
  registered_country?: MaxMindCountryRecord;
  traits?: MaxMindTraits;
}

// Web Service API response interfaces
export interface MaxMindWebData {
  readonly city?: MaxMindCityRecord;
  readonly continent?: MaxMindCountryRecord;
  readonly country?: MaxMindCountryRecord;
  readonly location?: MaxMindLocationRecord;
  readonly subdivisions?: MaxMindSubdivisionRecord[];
  readonly registered_country?: MaxMindCountryRecord;
  readonly traits?: MaxMindTraits & {
    readonly ip_address?: string;
    readonly is_anonymous?: boolean;
    readonly is_residential_proxy?: boolean;
  };
}

// MMDB mode specific options
export interface MaxMindMMDBOptions {
  mode: "mmdb";
  data: DataType;
}

// Web service specific options
export interface MaxMindWebOptions {
  mode: "web";
  accountId: string;
  licenseKey: string;
  service?: "country" | "city" | "insights";
  baseUrl?: string;
  fallbackData?: DataType;
  batchSize?: number;
  concurrency?: number;
}

export type MaxMindOptions = MaxMindMMDBOptions | MaxMindWebOptions;

function name(names?: MaxMindNames): string | undefined {
  return names?.en || names?.["zh-CN"] || Object.values(names || {}).find(Boolean);
}

function proxyFlag(traits?: MaxMindWebData["traits"]): boolean | undefined {
  if (!traits) {
    return undefined;
  }

  const flags = [
    traits.is_anonymous,
    traits.is_anonymous_proxy,
    traits.is_anonymous_vpn,
    traits.is_public_proxy,
    traits.is_residential_proxy,
    traits.is_tor_exit_node,
  ].filter((value): value is boolean => typeof value === "boolean");

  return flags.length === 0 ? undefined : flags.some(Boolean);
}

function convert(
  ip: string,
  data: MaxMindWebData | null,
  source: string,
  queryOptions?: QueryOptions,
): GeoLocation | null {
  if (!data) {
    return null;
  }

  const country = data.country || data.registered_country;

  return normalizeGeoLocation(
    {
      ip: data.traits?.ip_address || ip,
      source,
      country: name(country?.names),
      countryCode: country?.iso_code,
      region: name(data.subdivisions?.[0]?.names),
      regionCode:
        data.country?.iso_code && data.subdivisions?.[0]?.iso_code
          ? `${data.country.iso_code}-${data.subdivisions[0].iso_code}`
          : undefined,
      city: name(data.city?.names),
      latitude: data.location?.latitude,
      longitude: data.location?.longitude,
      isp: data.traits?.isp,
      org: data.traits?.organization || data.traits?.autonomous_system_organization,
      asn: data.traits?.autonomous_system_number?.toString(),
      timezone: data.location?.time_zone,
      accuracyRadius: data.location?.accuracy_radius,
      isProxy: proxyFlag(data.traits),
    },
    queryOptions,
  );
}

export default function maxmindDriver(options: MaxMindOptions): Driver<MaxMindOptions> {
  let parser: ReturnType<typeof createMMDBParser> | null = null;
  let fallbackParser: ReturnType<typeof createMMDBParser> | null = null;

  const getMMDBParser = (data: DataType) => {
    if (!parser) {
      parser = createMMDBParser(data);
    }
    return parser;
  };

  const getFallbackParser = (data: DataType) => {
    if (!fallbackParser) {
      fallbackParser = createMMDBParser(data);
    }
    return fallbackParser;
  };

  const lookupMMDB = async (
    ip: string,
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    if (options.mode !== "mmdb") {
      return null;
    }

    const mmdb = getMMDBParser(options.data);
    return convert(ip, mmdb.get<MaxMindData>(ip), "maxmind-mmdb", queryOptions);
  };

  const lookupWeb = async (
    ip: string,
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    if (options.mode !== "web") {
      return null;
    }

    const {
      accountId,
      licenseKey,
      service = "city",
      baseUrl = "https://geoip.maxmind.com",
    } = options;
    if (!accountId || !licenseKey) {
      throw createProviderError("maxmind-web", "Account ID and license key are required");
    }

    const url = `${baseUrl}/geoip/v2.1/${service}/${encodeURIComponent(ip)}`;
    const authorization = `Basic ${Buffer.from(`${accountId}:${licenseKey}`).toString("base64")}`;

    try {
      const data = await ofetch<MaxMindWebData>(url, {
        headers: {
          Authorization: authorization,
          Accept: "application/json",
        },
      });

      return convert(ip, data, "maxmind-web", queryOptions);
    } catch (error) {
      if (options.fallbackData) {
        try {
          const fallback = getFallbackParser(options.fallbackData);
          const result = convert(
            ip,
            fallback.get<MaxMindData>(ip),
            "maxmind-fallback",
            queryOptions,
          );
          if (result) {
            return result;
          }
        } catch {
          // Surface the original web-service error if local fallback cannot help.
        }
      }

      throw createProviderError("maxmind-web", error);
    }
  };

  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> =>
    options.mode === "mmdb"
      ? await lookupMMDB(ip, queryOptions)
      : await lookupWeb(ip, queryOptions);

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    if (options.mode !== "web") {
      return null;
    }

    return await lookupWeb("me", queryOptions);
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: QueryOptions & { batchSize?: number; concurrency?: number },
  ): Promise<GeoLocation[]> => {
    if (options.mode === "mmdb") {
      try {
        const results = await mapWithConcurrency(
          ips,
          queryOptions?.concurrency ?? 8,
          async (ip) => {
            try {
              return await lookupMMDB(ip, queryOptions);
            } catch {
              return null;
            }
          },
        );
        return results.filter((result): result is GeoLocation => result !== null);
      } catch (error) {
        throw createProviderError("maxmind-mmdb", error);
      }
    }

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
              return await lookupWeb(ip, queryOptions);
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
    current: options.mode === "web",
    batchLookup: true,
    nativeBatch: false,
    remote: options.mode === "web",
    proxyDetection: options.mode === "web",
  };

  return {
    name: "maxmind",
    options,
    capabilities,
    lookup,
    current: options.mode === "web" ? current : undefined,
    batchLookup,
  };
}
