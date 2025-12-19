import { ofetch } from "ofetch";
import type { Driver, GeoLocation, QueryOptions, DriverOptions } from "..";

// ipapi.co response interface
export interface IpapiCoResponse {
  ip: string; // IP address
  city?: string; // City name
  region?: string; // Region/Province name
  region_code?: string; // Region/Province code
  country?: string; // Country name
  country_name?: string; // Full country name
  country_code?: string; // Two-letter country code
  country_code_iso3?: string; // Three-letter country code
  country_capital?: string; // Country capital
  country_tld?: string; // Country top-level domain
  continent_code?: string; // Continent code
  in_eu?: boolean; // Whether in EU
  postal?: string; // Postal/ZIP code
  latitude?: number; // Latitude
  longitude?: number; // Longitude
  timezone?: string; // Timezone ID
  utc_offset?: string; // UTC offset
  country_calling_code?: string; // Country calling code
  currency?: string; // Currency code
  currency_name?: string; // Currency name
  languages?: string; // Languages spoken
  country_area?: number; // Country area in km²
  country_population?: number; // Country population
  asn?: string; // ASN number
  org?: string; // Organization name
}

// ipapi.co Driver options
export interface IpapiCoOptions extends DriverOptions {
  /**
   * Specify response fields to reduce bandwidth
   */
  fields?: string;
}

export default function ipapiCoDriver(
  options: IpapiCoOptions = {},
): Driver<IpapiCoOptions> {
  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      let url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;

      if (options.fields) {
        url = `https://ipapi.co/${encodeURIComponent(ip)}/${encodeURIComponent(options.fields)}/`;
      }

      const data: IpapiCoResponse = await ofetch(url);

      if (!data.ip) {
        return null;
      }

      return {
        ip: data.ip,
        country: data.country_name || data.country,
        countryCode: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        isp: data.org,
        org: data.org,
        asn: data.asn,
        timezone: data.timezone,
        source: "ipapi.co",
      };
    } catch {
      return null;
    }
  };

  const current = async (
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      let url = "https://ipapi.co/json/";

      if (options.fields) {
        url = `https://ipapi.co/${encodeURIComponent(options.fields)}/`;
      }

      const data: IpapiCoResponse = await ofetch(url);

      if (!data.ip) {
        return null;
      }

      return {
        ip: data.ip,
        country: data.country_name || data.country,
        countryCode: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        isp: data.org,
        org: data.org,
        asn: data.asn,
        timezone: data.timezone,
        source: "ipapi.co",
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
      // ipapi.co doesn't have a built-in batch endpoint for free tier
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
    name: "ipapi.co",
    options,
    lookup,
    batchLookup,
    current,
  };
}
