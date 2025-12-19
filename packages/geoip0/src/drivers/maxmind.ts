/**
 * MaxMind Driver
 * Unified driver for MaxMind GeoIP services (MMDB database and Web Service)
 */

import { ofetch } from "ofetch";
import { createMMDBParser } from "../mmdb";
import type { Driver, GeoLocation, QueryOptions } from "..";
import type { DataType } from "undio";

// Driver mode type
export type MaxMindMode = "mmdb" | "web";

// MMDB data structure (matches our playground analysis)
export interface MaxMindNames {
  readonly de?: string;
  readonly en: string;
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

export interface MaxMindData {
  city?: MaxMindCityRecord;
  country?: MaxMindCountryRecord;
  continent?: MaxMindCountryRecord;
  location?: MaxMindLocationRecord;
  subdivisions?: MaxMindSubdivisionRecord[];
  registered_country?: MaxMindCountryRecord;
}

// Web Service API response interfaces
export interface MaxMindWebNames {
  readonly de?: string;
  readonly en: string;
  readonly es?: string;
  readonly fr?: string;
  readonly ja?: string;
  readonly "pt-BR"?: string;
  readonly ru?: string;
  readonly "zh-CN"?: string;
}

export interface MaxMindWebLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy_radius: number;
  readonly metro_code?: number;
  readonly time_zone: string;
}

export interface MaxMindWebCity {
  readonly geoname_id: number;
  readonly names: MaxMindWebNames;
  readonly confidence?: number;
}

export interface MaxMindWebCountry {
  readonly geoname_id: number;
  readonly iso_code: string;
  readonly names: MaxMindWebNames;
  readonly confidence?: number;
  readonly is_in_european_union?: boolean;
}

export interface MaxMindWebSubdivision {
  readonly geoname_id: number;
  readonly iso_code: string;
  readonly names: MaxMindWebNames;
  readonly confidence?: number;
}

export interface MaxMindWebData {
  readonly city?: MaxMindWebCity;
  readonly continent?: MaxMindWebCountry;
  readonly country?: MaxMindWebCountry;
  readonly location?: MaxMindWebLocation;
  readonly postal?: {
    readonly code: string;
    readonly confidence?: number;
  };
  readonly subdivisions?: MaxMindWebSubdivision[];
  readonly registered_country?: MaxMindWebCountry;
  readonly traits?: {
    readonly autonomous_system_number?: number;
    readonly autonomous_system_organization?: string;
    readonly connection_type?: string;
    readonly domain?: string;
    readonly ip_address?: string;
    readonly is_anonymous?: boolean;
    readonly is_anonymous_proxy?: boolean;
    readonly is_anonymous_vpn?: boolean;
    readonly is_anycast?: boolean;
    readonly is_hosting_provider?: boolean;
    readonly is_legitimate_proxy?: boolean;
    readonly is_public_proxy?: boolean;
    readonly is_residential_proxy?: boolean;
    readonly is_satellite_provider?: boolean;
    readonly is_tor_exit_node?: boolean;
    readonly isp?: string;
    readonly mobile_country_code?: string;
    readonly mobile_network_code?: string;
    readonly organization?: string;
    readonly static_ip_score?: number;
    readonly user_count?: number;
    readonly user_type?: string;
  };
}

// MMDB mode specific options
export interface MaxMindMMDBOptions {
  mode: "mmdb";
  data: DataType; // MMDB database data (Buffer, Uint8Array, etc.)
}

// Web service specific options
export interface MaxMindWebOptions {
  mode: "web";
  accountId: string; // MaxMind account ID (required)
  licenseKey: string; // MaxMind license key (required)
  service?: "country" | "city" | "insights"; // Web service type
  baseUrl?: string; // Custom base URL
  fallbackData?: DataType; // MMDB data for fallback
}

// Union type for all MaxMind options
export type MaxMindOptions = MaxMindMMDBOptions | MaxMindWebOptions;

export default function maxmindDriver(
  options: MaxMindOptions,
): Driver<MaxMindOptions> {
  let parser: ReturnType<typeof createMMDBParser> | null = null;

  // Initialize based on mode
  const init = async (): Promise<boolean> => {
    try {
      if (options.mode === "mmdb") {
        // Type guard for MMDB mode
        const mmdbOptions = options as MaxMindMMDBOptions;
        parser = createMMDBParser(mmdbOptions.data);
        return true;
      }
      // Web mode doesn't require initialization
      return true;
    } catch {
      return false;
    }
  };

  // Convert MMDB data to GeoLocation format
  const convertMMDBToGeoLocation = (
    ip: string,
    data: MaxMindData | null,
  ): GeoLocation | null => {
    if (!data) return null;

    const getCountryName = (country?: MaxMindCountryRecord): string => {
      if (!country?.names) return "";
      const names = country.names;
      return names.en || names["zh-CN"] || Object.values(names)[0] || "";
    };

    const getCityName = (city?: MaxMindCityRecord): string => {
      if (!city?.names) return "";
      const names = city.names;
      return names.en || names["zh-CN"] || Object.values(names)[0] || "";
    };

    const getRegion = (subdivisions?: MaxMindSubdivisionRecord[]): string => {
      if (!subdivisions || subdivisions.length === 0) return "";
      const subdivision = subdivisions[0];
      if (!subdivision?.names) return "";
      const names = subdivision.names;
      return names.en || names["zh-CN"] || Object.values(names)[0] || "";
    };

    return {
      ip,
      country: getCountryName(data.country),
      countryCode: data.country?.iso_code || "",
      region: getRegion(data.subdivisions),
      city: getCityName(data.city),
      latitude: data.location?.latitude || 0,
      longitude: data.location?.longitude || 0,
      timezone: data.location?.time_zone || "",
      source: "maxmind-mmdb",
    };
  };

  // Convert Web Service data to GeoLocation format
  const convertWebToGeoLocation = (
    ip: string,
    data: MaxMindWebData | null,
  ): GeoLocation | null => {
    if (!data) return null;

    const getCountryName = (country?: MaxMindWebCountry): string => {
      if (!country?.names) return "";
      const names = country.names;
      return names.en || names["zh-CN"] || Object.values(names)[0] || "";
    };

    const getCityName = (city?: MaxMindWebCity): string => {
      if (!city?.names) return "";
      const names = city.names;
      return names.en || names["zh-CN"] || Object.values(names)[0] || "";
    };

    const getRegion = (subdivisions?: MaxMindWebSubdivision[]): string => {
      if (!subdivisions || subdivisions.length === 0) return "";
      const subdivision = subdivisions[0];
      if (!subdivision?.names) return "";
      const names = subdivision.names;
      return names.en || names["zh-CN"] || Object.values(names)[0] || "";
    };

    return {
      ip,
      country: getCountryName(data.country),
      countryCode: data.country?.iso_code || "",
      region: getRegion(data.subdivisions),
      city: getCityName(data.city),
      latitude: data.location?.latitude || 0,
      longitude: data.location?.longitude || 0,
      timezone: data.location?.time_zone || "",
      isp: data.traits?.isp,
      org: data.traits?.organization,
      asn: data.traits?.autonomous_system_number?.toString(),
      source: "maxmind-web",
    };
  };

  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      if (options.mode === "mmdb") {
        if (!parser && !(await init())) {
          return null;
        }
        const result = parser!.get<MaxMindData>(ip);
        return convertMMDBToGeoLocation(ip, result);
      } else {
        // Web service mode
        const webOptions = options as MaxMindWebOptions;
        const {
          accountId,
          licenseKey,
          service = "city",
          baseUrl = "https://geoip.maxmind.com",
        } = webOptions;

        if (!accountId || !licenseKey) {
          throw new Error(
            "Account ID and license key are required for web service mode",
          );
        }

        const serviceEndpoint =
          service === "insights"
            ? "insights"
            : service === "country"
              ? "country"
              : "city";
        const url = `${baseUrl}/geoip/v2.1/${serviceEndpoint}/${ip}`;

        const auth = Buffer.from(`${accountId}:${licenseKey}`).toString(
          "base64",
        );

        const data: MaxMindWebData = await ofetch(url, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        });

        return convertWebToGeoLocation(ip, data);
      }
    } catch {
      // Try fallback to MMDB if web service fails and fallback data is available
      if (options.mode === "web") {
        const webOptions = options as MaxMindWebOptions;
        if (webOptions.fallbackData) {
          try {
            const fallbackParser = createMMDBParser(webOptions.fallbackData);
            const result = fallbackParser.get<MaxMindData>(ip);
            return convertMMDBToGeoLocation(ip, result);
          } catch {
            return null;
          }
        }
      }
      return null;
    }
  };

  const current = async (
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      if (options.mode === "mmdb") {
        // MMDB doesn't support current IP lookup
        return null;
      } else {
        // Web service mode - use "me" endpoint
        const webOptions = options as MaxMindWebOptions;
        const {
          accountId,
          licenseKey,
          service = "city",
          baseUrl = "https://geoip.maxmind.com",
        } = webOptions;

        if (!accountId || !licenseKey) {
          throw new Error(
            "Account ID and license key are required for web service mode",
          );
        }

        const serviceEndpoint =
          service === "insights"
            ? "insights"
            : service === "country"
              ? "country"
              : "city";
        const url = `${baseUrl}/geoip/v2.1/${serviceEndpoint}/me`;

        const auth = Buffer.from(`${accountId}:${licenseKey}`).toString(
          "base64",
        );

        const data: MaxMindWebData = await ofetch(url, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        });

        return convertWebToGeoLocation(data.traits?.ip_address || "", data);
      }
    } catch {
      return null;
    }
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation[]> => {
    try {
      if (options.mode === "mmdb") {
        if (!parser && !(await init())) {
          return [];
        }

        const promises = ips.map((ip) => lookup(ip, queryOptions));
        const results = await Promise.allSettled(promises);

        return results
          .filter(
            (result): result is PromiseFulfilledResult<GeoLocation> =>
              result.status === "fulfilled" && result.value !== null,
          )
          .map((result) => result.value);
      } else {
        // Web service mode - batch requests
        const promises = ips.map((ip) => lookup(ip, queryOptions));
        const results = await Promise.allSettled(promises);

        return results
          .filter(
            (result): result is PromiseFulfilledResult<GeoLocation> =>
              result.status === "fulfilled" && result.value !== null,
          )
          .map((result) => result.value);
      }
    } catch {
      return [];
    }
  };

  return {
    name: "maxmind",
    options,
    lookup,
    current,
    batchLookup,
  };
}
