import { ofetch } from "ofetch";
import type { Driver, GeoLocation, QueryOptions, DriverOptions } from "..";

// ip2location.io response interface
export interface Ip2LocationResponse {
  ip: string; // IP address
  country_code?: string; // Two-letter country code
  country_name?: string; // Country name
  region_name?: string; // Region/Province name
  city_name?: string; // City name
  latitude?: number; // Latitude
  longitude?: number; // Longitude
  zip_code?: string; // Postal/ZIP code
  time_zone?: string; // Timezone offset
  asn?: string; // ASN number
  as?: string; // AS organization name
  is_proxy?: boolean; // Whether IP is a proxy
}

// ip2location Driver options
export interface Ip2LocationOptions extends DriverOptions {
  /**
   * API key for ip2location.io service
   */
  key?: string;
}

// Default API key (for development/testing)
const DEFAULT_API_KEY = "4BDAB89AAD40944958DA8EBDBB1CC7F1";

export default function ip2LocationDriver(
  options: Ip2LocationOptions = {},
): Driver<Ip2LocationOptions> {
  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const apiKey = options.key || DEFAULT_API_KEY;

      if (!apiKey) {
        throw new Error("API key is required for ip2location.io service");
      }

      const url = `https://api.ip2location.io/?key=${encodeURIComponent(apiKey)}&ip=${encodeURIComponent(ip)}&format=json`;

      const data: Ip2LocationResponse = await ofetch(url);

      if (!data.ip) {
        return null;
      }

      return {
        ip: data.ip,
        country: data.country_name || "",
        countryCode: data.country_code || "",
        region: data.region_name || "",
        city: data.city_name || "",
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        isp: data.as || "",
        org: data.as || "",
        asn: data.asn || "",
        timezone: data.time_zone || "",
        isProxy: data.is_proxy || false,
        source: "ip2location.io",
        regionCode: "",
        accuracyRadius: "",
      };
    } catch {
      return null;
    }
  };

  const current = async (
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const apiKey = options.key || DEFAULT_API_KEY;

      if (!apiKey) {
        throw new Error("API key is required for ip2location.io service");
      }

      // Current IP detection - omit ip parameter
      const url = `https://api.ip2location.io/?key=${encodeURIComponent(apiKey)}&format=json`;

      const data: Ip2LocationResponse = await ofetch(url);

      if (!data.ip) {
        return null;
      }

      return {
        ip: data.ip,
        country: data.country_name || "",
        countryCode: data.country_code || "",
        region: data.region_name || "",
        city: data.city_name || "",
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        isp: data.as || "",
        org: data.as || "",
        asn: data.asn || "",
        timezone: data.time_zone || "",
        isProxy: data.is_proxy || false,
        source: "ip2location.io",
        regionCode: "",
        accuracyRadius: "",
      };
    } catch {
      return null;
    }
  };

  const batchLookup = async (
    ips: string[],
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation[]> => {
    try {
      // ip2location.io doesn't have a built-in batch endpoint
      // We'll construct our own batch request using Promise.allSettled
      const promises = ips.map((ip) => lookup(ip, _queryOptions));
      const results = await Promise.allSettled(promises);

      return results
        .filter(
          (result): result is PromiseFulfilledResult<GeoLocation> =>
            result.status === "fulfilled" && result.value !== null,
        )
        .map((result) => result.value);
    } catch {
      return [];
    }
  };

  return {
    name: "ip2location.io",
    options,
    lookup,
    batchLookup,
    current,
  };
}
