import { ofetch } from "ofetch";
import type {
  Driver,
  GeoLocation,
  QueryOptions,
  DriverOptions,
} from "../types";

// IP-API.com response interface
export interface IPAPIResponse {
  query: string; // IP address
  status: "success" | "fail";
  country?: string; // Country name
  countryCode?: string; // Two-letter country code
  region?: string; // Region/Province name
  regionName?: string; // Region/Province code
  city?: string; // City name
  zip?: string; // ZIP code
  lat?: number; // Latitude
  lon?: number; // Longitude
  timezone?: string; // Timezone
  isp?: string; // ISP provider
  org?: string; // Organization
  as?: string; // AS number and organization
  mobile?: boolean; // Mobile connection
  proxy?: boolean; // Proxy/VPN
  hosting?: boolean; // Hosting/Botnet
  message?: string; // Error message when status is "fail"
}

// IP-API.com Batch response interface
export type IPAPIBatchResponse = IPAPIResponse[];

// IP-API.com Driver options
export interface IPAPIOptions extends DriverOptions {
  /**
   * Specify response fields to reduce bandwidth
   */
  fields?: string;
  /**
   * Response language
   */
  lang?: "en" | "de" | "es" | "pt-BR" | "fr" | "ja" | "zh-CN" | "ru";
}

// Default fields to request - comprehensive but not excessive
const DEFAULT_FIELDS =
  "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query";

export default function ipapiDriver(
  options: IPAPIOptions = {},
): Driver<IPAPIOptions> {
  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const fields = options.fields || DEFAULT_FIELDS;
      const lang = options.lang || "en";

      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${encodeURIComponent(fields)}&lang=${encodeURIComponent(lang)}`;

      const data: IPAPIResponse = await ofetch(url);

      if (data.status !== "success" || !data.query) {
        return null;
      }

      return {
        ip: data.query,
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName || data.region,
        city: data.city,
        latitude: data.lat || 0,
        longitude: data.lon || 0,
        isp: data.isp,
        org: data.org,
        asn: data.as?.split(" ")[0] || data.as, // Extract AS number if available
        timezone: data.timezone,
        source: "ip-api.com",
      };
    } catch {
      return null;
    }
  };

  const current = async (
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      let url = "http://ip-api.com/json";

      // IP-API.com doesn't have separate IPv4/IPv6 endpoints
      // It automatically detects the client IP version
      // queryOptions.version is ignored as IP-API.com handles this automatically
      const fields = options.fields || DEFAULT_FIELDS;
      const lang = options.lang || "en";
      url += `?fields=${encodeURIComponent(fields)}&lang=${encodeURIComponent(lang)}`;

      const data: IPAPIResponse = await ofetch(url);

      if (data.status !== "success" || !data.query) {
        return null;
      }

      return {
        ip: data.query,
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName || data.region,
        city: data.city,
        latitude: data.lat || 0,
        longitude: data.lon || 0,
        isp: data.isp,
        org: data.org,
        asn: data.as?.split(" ")[0] || data.as,
        timezone: data.timezone,
        source: "ip-api.com",
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
      // IP-API.com batch endpoint has a 100 IP limit per request
      if (ips.length > 100) {
        console.warn("IP-API.com batch request limited to 100 IPs per request");
        // For simplicity, we'll only process the first 100 IPs
        // In a production environment, you might want to split into multiple requests
        ips = ips.slice(0, 100);
      }

      const lang = options.lang || "en";
      let url = `http://ip-api.com/batch?lang=${encodeURIComponent(lang)}`;

      if (options.fields) {
        url += `&fields=${encodeURIComponent(options.fields)}`;
      }

      const response: IPAPIBatchResponse = await ofetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ips),
      });

      // Convert batch API response to GeoLocation array
      const results: GeoLocation[] = [];
      for (const data of response) {
        if (data && data.status === "success" && data.query) {
          results.push({
            ip: data.query,
            country: data.country,
            countryCode: data.countryCode,
            region: data.regionName || data.region,
            city: data.city,
            latitude: data.lat || 0,
            longitude: data.lon || 0,
            isp: data.isp,
            org: data.org,
            asn: data.as?.split(" ")[0] || data.as,
            timezone: data.timezone,
            source: "ip-api.com",
          });
        }
        // Failed lookups are silently ignored, similar to other drivers
      }

      return results;
    } catch {
      return [];
    }
  };

  return {
    name: "ip-api.com",
    options,
    lookup,
    batchLookup,
    current,
  };
}
