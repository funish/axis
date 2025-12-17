import { ofetch } from "ofetch";
import type { Driver, GeoLocation, QueryOptions, DriverOptions } from "..";

// Cloudflare Radar IP Check API response interface
export interface CloudflareIPCheckResponse {
  colo: string; // Cloudflare data center code, e.g., "NRT", "LAX"
  asn: number; // Autonomous System Number, e.g., 15169, 8075
  continent: string; // Continent code, e.g., "NA", "EU", "AS", "OC"
  country: string; // Two-letter country code, e.g., "US", "JP", "DE"
  region: string; // Region/state name, e.g., "California", "Tokyo", "Bavaria"
  city: string; // City name, e.g., "San Francisco", "Tokyo", "Munich"
  latitude: string; // Latitude coordinate as string, e.g., "37.77490", "35.68950"
  longitude: string; // Longitude coordinate as string, e.g., "-122.41940", "139.69171"
  ip_address: string; // IP address, e.g., "192.0.2.1", "2001:db8::1"
  ip_version: string; // IP version ("IPv4" or "IPv6"), e.g., "IPv4", "IPv6"
}

// Cloudflare Radar GeolocationPanel API response interface
export interface CloudflareGeoResponse {
  code: string; // Country code, e.g., "jp", "us"
  isClientIP: boolean; // Whether this is the client IP
}

// Cloudflare Radar AsPanel API response interface
export interface CloudflareAsnResponse {
  asn: {
    name: string; // ASN name, e.g., "AKARI-NETWORKS-AS-AP"
    aka: string; // Alternative name
    asn: number; // ASN number, e.g., 38136
    website: string; // Website URL
    country: string; // Country code, e.g., "HK", "US"
    countryName: string; // Full country name, e.g., "Hong Kong"
    orgName: string; // Organization name
    source: string; // Source database, e.g., "APNIC"
    related: Array<any>; // Related ASNs
    confidenceLevel: number; // Confidence level (1-5)
    estimatedUsers: {
      estimatedUsers: number; // Estimated user count
      locations: Array<{
        estimatedUsers: number; // Estimated users in this country
        locationName: string; // Country code
        locationAlpha2: string; // 2-letter country code
      }>;
    };
  };
  isClientIP: boolean;
}

// Cloudflare Driver options
export interface CloudflareOptions extends DriverOptions {}

export default function cloudflareDriver(
  options: CloudflareOptions = {},
): Driver<CloudflareOptions> {
  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      // Step 1: Get GeolocationPanel data first
      const geoResponse: CloudflareGeoResponse = await ofetch(
        `https://radar.cloudflare.com/charts/GeolocationPanel/fetch?ip=${ip}`,
        {
          headers: {
            accept: "application/json, text/plain, */*",
            Referer: "https://radar.cloudflare.com/",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
          },
        },
      );

      // Step 2: Get ASN information from AsPanel API
      const asnResponse: CloudflareAsnResponse = await ofetch(
        `https://radar.cloudflare.com/charts/AsPanel/fetch?ip=${ip}`,
        {
          headers: {
            accept: "application/json, text/plain, */*",
            Referer: "https://radar.cloudflare.com/",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
          },
        },
      );

      // Extract country code from GeolocationPanel
      const countryCode = geoResponse.code?.toUpperCase() || "";

      // Find estimated users for the country by matching GeolocationPanel code with AsPanel locationAlpha2
      let countryName = countryCode; // Default to country code
      if (asnResponse.asn.estimatedUsers?.locations && countryCode) {
        const locationMatch = asnResponse.asn.estimatedUsers.locations.find(
          (loc) =>
            loc.locationAlpha2.toLowerCase() === countryCode.toLowerCase(),
        );
        // Use location name as country name if found
        if (locationMatch?.locationName) {
          countryName = locationMatch.locationName;
        }
      }

      return {
        ip,
        countryCode,
        country: countryName,
        region: "", // Neither API provides detailed region
        city: "", // Neither API provides detailed city
        latitude: 0,
        longitude: 0,
        asn: asnResponse.asn?.asn?.toString() || "",
        org: asnResponse.asn?.name || "",
        source: "cloudflare",
      };
    } catch {
      return null;
    }
  };

  const current = async (
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const version = queryOptions?.version || "auto";
      let url = "https://ip-check-perf.radar.cloudflare.com/";

      if (version === "ipv4") {
        url = "https://ipv4-check-perf.radar.cloudflare.com/";
      } else if (version === "ipv6") {
        url = "https://ipv6-check-perf.radar.cloudflare.com/";
      }

      const data: CloudflareIPCheckResponse = await ofetch(url);

      return {
        ip: data.ip_address,
        countryCode: data.country,
        region: data.region,
        city: data.city,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        asn: data.asn.toString(),
        source: "cloudflare",
      };
    } catch {
      return null;
    }
  };

  return {
    name: "cloudflare",
    options,
    lookup,
    current,
  };
}
